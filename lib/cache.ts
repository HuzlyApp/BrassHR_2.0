import "server-only";

import { Redis as UpstashRedis } from "@upstash/redis";
import { logPerf } from "@/lib/perf";
import {
  buildCacheKey,
  CACHE_TTL_SECONDS,
  hashQueryParams,
  resourcePattern,
  tablePattern,
  tenantPattern,
  userPattern,
} from "@/lib/cache-keys";
import {
  getRedisTimeoutMs,
  isRedisCircuitOpen,
  markRedisUnavailable,
  withRedisTimeout,
} from "@/lib/redis-timeout";

export {
  buildCacheKey,
  CACHE_TTL_SECONDS,
  hashQueryParams,
  tablePattern,
  tenantPattern,
  userPattern,
  resourcePattern,
};

const DEFAULT_TTL_SECONDS = Number(process.env.CACHE_DEFAULT_TTL_SECONDS ?? 300) || 300;
const DEFAULT_MAX_PAYLOAD_BYTES = 100 * 1024;

export function getMaxCachePayloadBytes(): number {
  const raw = process.env.CACHE_MAX_PAYLOAD_BYTES?.trim();
  if (!raw) return DEFAULT_MAX_PAYLOAD_BYTES;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_PAYLOAD_BYTES;
}

type CacheAdapter = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  deleteByPattern?(pattern: string): Promise<void>;
};

type MemoryCacheEntry = { value: string; expiresAt: number };

const memoryCache: Map<string, MemoryCacheEntry> =
  ((globalThis as typeof globalThis & { __brassMemoryCache?: Map<string, MemoryCacheEntry> })
    .__brassMemoryCache ??= new Map());

let adapterPromise: Promise<CacheAdapter | null> | null = null;
let testAdapter: CacheAdapter | null | undefined;

function cacheEnabled(): boolean {
  return process.env.CACHE_ENABLED === "true";
}

function logCache(event: string, detail: unknown) {
  if (process.env.NODE_ENV !== "production" || process.env.PERF_LOG === "true") {
    const hit = event === "hit";
    const miss = event === "miss";
    if (hit || miss) {
      console.info(`[cache] key=${String(detail)} hit=${hit} ttl=—`);
      return;
    }
    console.info(`[cache:${event}]`, detail);
  }
}

function memoryGet(key: string): string | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

function memorySet(key: string, value: string, ttlSeconds: number): void {
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

function memoryDeleteByPattern(pattern: string): void {
  const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")}$`);
  for (const key of memoryCache.keys()) {
    if (re.test(key)) memoryCache.delete(key);
  }
}

async function createUpstashAdapter(url: string, token: string): Promise<CacheAdapter> {
  const redis = new UpstashRedis({ url, token });
  return {
    async get(key) {
      const value = await redis.get<string>(key);
      return typeof value === "string" ? value : value == null ? null : JSON.stringify(value);
    },
    async set(key, value, ttlSeconds) {
      await redis.set(key, value, { ex: ttlSeconds });
    },
    async delete(key) {
      await redis.del(key);
    },
    async deleteByPattern(pattern) {
      let cursor = 0;
      do {
        const [nextCursor, keys] = await redis.scan(cursor, { match: pattern, count: 100 });
        cursor = Number(nextCursor);
        if (keys.length > 0) await redis.del(...keys);
      } while (cursor !== 0);
    },
  };
}

async function createNodeRedisAdapter(url: string): Promise<CacheAdapter> {
  const { createClient } = await import("redis");
  const connectMs = getRedisTimeoutMs();
  const client = createClient({
    url,
    socket: {
      connectTimeout: connectMs,
      reconnectStrategy: (retries) => (retries > 2 ? false : Math.min(retries * 200, 1000)),
    },
  });
  client.on("error", (error) => logCache("redis-error", error));
  try {
    await withRedisTimeout(
      (async () => {
        if (!client.isOpen) await client.connect();
      })(),
      "redis-connect",
    );
  } catch (error) {
    markRedisUnavailable();
    void client.destroy();
    throw error;
  }

  return {
    async get(key) {
      return withRedisTimeout(client.get(key), "redis-get");
    },
    async set(key, value, ttlSeconds) {
      await withRedisTimeout(client.set(key, value, { EX: ttlSeconds }), "redis-set");
    },
    async delete(key) {
      await withRedisTimeout(client.del(key), "redis-del");
    },
    async deleteByPattern(pattern) {
      await withRedisTimeout(
        (async () => {
          const keys: string[] = [];
          for await (const key of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
            keys.push(String(key));
            if (keys.length >= 100) {
              await client.del(keys.splice(0, keys.length));
            }
          }
          if (keys.length > 0) await client.del(keys);
        })(),
        "redis-scan-del",
      );
    },
  };
}

async function createAdapter(): Promise<CacheAdapter | null> {
  if (!cacheEnabled()) return null;
  if (isRedisCircuitOpen()) return null;

  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;

  const token = process.env.REDIS_TOKEN?.trim();
  if (token) {
    return createUpstashAdapter(url, token);
  }

  if (url.startsWith("redis://") || url.startsWith("rediss://")) {
    return createNodeRedisAdapter(url);
  }

  logCache("disabled", "REDIS_TOKEN is required for HTTP Redis URLs");
  return null;
}

async function getAdapter(): Promise<CacheAdapter | null> {
  if (testAdapter !== undefined) return testAdapter;
  if (!adapterPromise) {
    adapterPromise = withRedisTimeout(createAdapter(), "adapter").catch((error) => {
      logCache("adapter-error", error);
      markRedisUnavailable();
      adapterPromise = null;
      return null;
    });
  }
  return adapterPromise;
}

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const memoryCached = memoryGet(key);
    if (memoryCached != null) {
      logCache("hit", `${key} source=memory`);
      return JSON.parse(memoryCached) as T;
    }

    const adapter = await getAdapter();
    if (!adapter) return null;

    const cached = await withRedisTimeout(adapter.get(key), "get");
    if (cached == null) {
      logCache("miss", key);
      return null;
    }

    logCache("hit", key);
    return JSON.parse(cached) as T;
  } catch (error) {
    logCache("error", { key, error });
    markRedisUnavailable();
    return null;
  }
}

export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<boolean> {
  if (value === undefined) return false;

  try {
    const serialized = JSON.stringify(value);
    const sizeBytes = Buffer.byteLength(serialized, "utf8");
    const maxBytes = getMaxCachePayloadBytes();
    if (sizeBytes > maxBytes) {
      if (process.env.NODE_ENV !== "production" || process.env.PERF_LOG === "true") {
        console.info(
          `[cache] key=${key} skipped=true reason=payload_too_large sizeBytes=${sizeBytes} maxBytes=${maxBytes}`
        );
      }
      return false;
    }

    memorySet(key, serialized, ttlSeconds);
    const adapter = await getAdapter();
    if (!adapter) return true;
    await adapter.set(key, serialized, ttlSeconds);
    return true;
  } catch (error) {
    logCache("set-error", { key, error });
    markRedisUnavailable();
    try {
      const serialized = JSON.stringify(value);
      if (Buffer.byteLength(serialized, "utf8") <= getMaxCachePayloadBytes()) {
        memorySet(key, serialized, ttlSeconds);
        return true;
      }
    } catch {
      /* ignore memory fallback serialization errors */
    }
    return false;
  }
}

export async function deleteCache(key: string): Promise<void> {
  try {
    const adapter = await getAdapter();
    memoryCache.delete(key);
    if (!adapter) return;
    await adapter.delete(key);
  } catch (error) {
    logCache("delete-error", { key, error });
    markRedisUnavailable();
  }
}

export async function deleteByPattern(pattern: string): Promise<void> {
  try {
    const adapter = await getAdapter();
    memoryDeleteByPattern(pattern);
    if (!adapter?.deleteByPattern) return;
    await adapter.deleteByPattern(pattern);
  } catch (error) {
    logCache("delete-pattern-error", { pattern, error });
    markRedisUnavailable();
  }
}

const getOrSetInflight =
  ((globalThis as typeof globalThis & {
    __brassGetOrSetInflight?: Map<string, Promise<unknown>>;
  }).__brassGetOrSetInflight ??= new Map());

export async function getOrSetCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<T> {
  const cached = await getCache<T>(key);
  if (cached !== null) {
    logPerf("getOrSetCache", { key, cacheHit: true, ttlSeconds });
    return cached;
  }

  const existing = getOrSetInflight.get(key) as Promise<T> | undefined;
  if (existing) {
    logPerf("getOrSetCache", { key, cacheHit: false, coalesced: true, ttlSeconds });
    return existing;
  }

  logPerf("getOrSetCache", { key, cacheHit: false, ttlSeconds });
  const pending = (async () => {
    const value = await fetcher();
    await setCache(key, value, ttlSeconds);
    return value;
  })().finally(() => {
    getOrSetInflight.delete(key);
  });

  getOrSetInflight.set(key, pending);
  return pending;
}

export async function invalidateTableCache(table: string): Promise<void> {
  await deleteByPattern(tablePattern(table));
}

export async function invalidateTenantCache(table: string, tenantId: string): Promise<void> {
  await deleteByPattern(tenantPattern(table, tenantId));
}

export async function invalidateUserCache(table: string, userId: string): Promise<void> {
  await deleteByPattern(userPattern(table, userId));
}

export async function invalidateResourceCache(table: string, resourceId: string): Promise<void> {
  await deleteByPattern(resourcePattern(table, resourceId));
}

export function __setCacheAdapterForTests(adapter: CacheAdapter | null | undefined): void {
  testAdapter = adapter;
  adapterPromise = null;
}

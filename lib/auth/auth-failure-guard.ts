import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type Bucket = { count: number; expiresAt: number };

const buckets = new Map<string, Bucket>();

const DEFAULT_LIMIT = 30;
const DEFAULT_WINDOW_MS = 10 * 60 * 1000;

export type AuthFailureInput = {
  ip: string;
  method: string;
  path: string;
  status: 401 | 403;
  reason: string;
  userId?: string | null;
  /** False for expected denials such as password setup, so retries are logged but not throttled. */
  count?: boolean;
};

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function limit(): number {
  return positiveInt(process.env.AUTH_FAILURE_LIMIT, DEFAULT_LIMIT);
}

function windowMs(): number {
  return positiveInt(process.env.AUTH_FAILURE_WINDOW_MS, DEFAULT_WINDOW_MS);
}

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = headers.get("x-real-ip")?.trim();
  const cfIp = headers.get("cf-connecting-ip")?.trim();
  return forwarded || realIp || cfIp || "unknown";
}

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

function cleanToken(value: string, max: number, fallback: string): string {
  const cleaned = value.replace(/[^a-z0-9_]/gi, "_").replace(/_+/g, "_").slice(0, max);
  return cleaned || fallback;
}

function cleanPath(path: string): string {
  const pathname = path.split("?")[0]?.split("#")[0] ?? "/";
  const trimmed = pathname.trim().slice(0, 200);
  return trimmed.startsWith("/") ? trimmed : "/";
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanUserId(userId: string | null | undefined): string | null {
  const value = userId?.trim().toLowerCase() ?? "";
  return UUID_RE.test(value) ? value : null;
}

function increment(ipHash: string, now: number): { count: number; retryAfterSec: number } {
  const window = windowMs();
  const existing = buckets.get(ipHash);
  if (!existing || existing.expiresAt <= now) {
    buckets.set(ipHash, { count: 1, expiresAt: now + window });
    return { count: 1, retryAfterSec: Math.max(1, Math.ceil(window / 1000)) };
  }
  existing.count += 1;
  return {
    count: existing.count,
    retryAfterSec: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)),
  };
}

function logEvent(row: {
  event: "unauthenticated" | "forbidden" | "rate_limited";
  httpStatus: number;
  method: string;
  path: string;
  reason: string;
  userId: string | null;
  ipHash: string;
  retryAfterSec?: number;
}): void {
  console.warn(
    JSON.stringify({
      source: "security-auth",
      event: row.event,
      status: row.httpStatus,
      method: row.method,
      path: row.path,
      reason: row.reason,
      userId: row.userId,
      ipHash: row.ipHash,
      retryAfterSec: row.retryAfterSec ?? null,
    })
  );
}

async function persistEvent(row: {
  event: "unauthenticated" | "forbidden" | "rate_limited";
  http_status: number;
  method: string;
  path: string;
  reason: string;
  user_id: string | null;
  ip_hash: string;
}): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  const supabase = createServiceRoleClient();
  if (!supabase) return;
  try {
    const write = supabase.from("security_auth_events").insert(row);
    await Promise.race([
      write,
      new Promise((resolve) => setTimeout(resolve, 800)),
    ]);
  } catch (error) {
    console.error("[security-auth] log write failed", error instanceof Error ? error.message : "unknown");
  }
}

/**
 * Log an authentication or authorization failure and throttle repeated attempts
 * from the same client IP. Returns 429 once the window limit is exceeded.
 */
export async function noteAuthFailure(input: AuthFailureInput): Promise<NextResponse | null> {
  const method = cleanToken(input.method.toUpperCase(), 16, "GET");
  const path = cleanPath(input.path);
  const reason = cleanToken(input.reason, 80, "denied");
  const userId = cleanUserId(input.userId);
  const ipHash = hashIp(input.ip.trim() || "unknown");
  const shouldCount = input.count !== false;
  const now = Date.now();
  const attempt = shouldCount ? increment(ipHash, now) : null;

  if (attempt && attempt.count > limit()) {
    const row = {
      event: "rate_limited" as const,
      httpStatus: 429,
      method,
      path,
      reason,
      userId,
      ipHash,
      retryAfterSec: attempt.retryAfterSec,
    };
    logEvent(row);
    await persistEvent({
      event: row.event,
      http_status: 429,
      method,
      path,
      reason,
      user_id: userId,
      ip_hash: ipHash,
    });
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(attempt.retryAfterSec) },
      }
    );
  }

  const event = input.status === 401 ? "unauthenticated" : "forbidden";
  logEvent({
    event,
    httpStatus: input.status,
    method,
    path,
    reason,
    userId,
    ipHash,
  });
  await persistEvent({
    event,
    http_status: input.status,
    method,
    path,
    reason,
    user_id: userId,
    ip_hash: ipHash,
  });
  return null;
}

export function __resetAuthFailureGuardForTests(): void {
  buckets.clear();
}

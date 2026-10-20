"use client";

import type { Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase-browser";

const LOCK_RETRY_DELAYS_MS = [150, 400, 1000];

/**
 * Supabase serialises session access through a navigator lock. When several callers race on page
 * load (auth sync, idle guard, staff guard), a waiter that times out steals the lock and the holder
 * rejects with "Lock … was released because another request stole it".
 */
export function isAuthLockContentionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  const text = typeof message === "string" ? message : "";
  return (
    name === "NavigatorLockAcquireTimeoutError" ||
    /another request stole it/i.test(text) ||
    (name === "AbortError" && /lock:/i.test(text))
  );
}

let inflight: Promise<Session | null> | null = null;

async function readSessionWithRetry(): Promise<Session | null> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      return data.session;
    } catch (error) {
      const delay = LOCK_RETRY_DELAYS_MS[attempt];
      if (!isAuthLockContentionError(error) || delay == null) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * `auth.getSession()` for client components: concurrent callers share one read, and lock
 * contention is retried. Throws if the lock still can't be taken, so callers must not treat a
 * failure as "signed out".
 */
export function getBrowserSession(): Promise<Session | null> {
  if (!inflight) {
    inflight = readSessionWithRetry().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

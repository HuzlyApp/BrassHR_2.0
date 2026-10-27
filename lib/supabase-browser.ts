"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAuthCookieOptions } from "@/lib/auth/session-cookie";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase-env";

let client: SupabaseClient | undefined;

function getClient(): SupabaseClient {
  if (!client) {
    const url = getSupabaseUrl();
    const key = getSupabaseAnonKey();
    if (!url || !key) {
      throw new Error(
        "Missing Supabase URL or anon key (NEXT_PUBLIC_* or EXPO_PUBLIC_* in .env.local)"
      );
    }
    client = createBrowserClient(url, key, {
      cookieOptions: supabaseAuthCookieOptions(),
    });
  }
  return client;
}

/**
 * Lazy browser client so modules can load during `next build` without Supabase env.
 * Real calls happen in effects/handlers after hydration.
 */
export const supabaseBrowser = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const c = getClient();
    const value = Reflect.get(c, prop, receiver);
    return typeof value === "function" ? value.bind(c) : value;
  },
});

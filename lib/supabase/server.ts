import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAuthCookieOptions } from '@/lib/auth/session-cookie';
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase-env';

export async function createClient() {
  const cookieStore = await cookies();

  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    throw new Error("Missing Supabase URL or anon key in environment");
  }

  return createServerClient(
    url,
    key,
    {
      cookieOptions: supabaseAuthCookieOptions(),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}
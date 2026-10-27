import type { CookieOptions } from "@supabase/ssr";

/**
 * Cookie flags for the Supabase Auth session written by @supabase/ssr 0.8.
 *
 * The installed library defaults to `httpOnly: false` (`utils/constants.js`).
 * `createBrowserClient` reads and refreshes that cookie through `document.cookie`.
 * Browsers do not expose HttpOnly cookies to JavaScript, so setting `httpOnly: true`
 * hides the session from the browser client and stops token refresh.
 * The access token and the long-lived refresh token therefore remain readable by
 * same-origin scripts. Server code still treats that cookie as untrusted and
 * verifies it with `auth.getUser()`.
 */
export function supabaseAuthCookieOptions(nodeEnv: string | undefined = process.env.NODE_ENV): CookieOptions {
  return {
    path: "/",
    sameSite: "lax",
    secure: nodeEnv === "production",
    httpOnly: false,
  };
}

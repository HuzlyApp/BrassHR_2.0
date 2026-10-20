"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { getBrowserSession, isAuthLockContentionError } from "@/lib/auth/browser-session";
import {
  IDLE_ACTIVITY_THROTTLE_MS,
  IDLE_CHECK_INTERVAL_MS,
  IDLE_SESSION_COOKIE,
  idleLogoutRedirectPath,
  idleSessionCookieOptions,
  isIdleSessionExpired,
  parseLastActivityMs,
} from "@/lib/auth/idle-session";

function readActivityCookie(): number | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${IDLE_SESSION_COOKIE}=`));
  if (!match) return null;
  return parseLastActivityMs(decodeURIComponent(match.slice(IDLE_SESSION_COOKIE.length + 1)));
}

function writeActivityCookie(atMs: number) {
  if (typeof document === "undefined") return;
  const { path, sameSite, maxAge } = idleSessionCookieOptions();
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${IDLE_SESSION_COOKIE}=${encodeURIComponent(String(atMs))}; Path=${path}; Max-Age=${maxAge}; SameSite=${sameSite}${secure}`;
}

function clearActivityCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${IDLE_SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=lax`;
}

function isTrackedSessionUser(user: { id?: string; is_anonymous?: boolean } | null | undefined): boolean {
  return Boolean(user?.id) && user?.is_anonymous !== true;
}

/**
 * Ends non-anonymous sessions after {@link IDLE_TIMEOUT_MS} of no user interaction.
 * Anonymous applicant onboarding sessions are left alone.
 */
export default function IdleSessionGuard() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const lastWriteRef = useRef(0);
  const signingOutRef = useRef(false);
  const trackedRef = useRef(false);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    let cancelled = false;

    const touchActivity = (force = false) => {
      const now = Date.now();
      if (!force && now - lastWriteRef.current < IDLE_ACTIVITY_THROTTLE_MS) return;
      lastWriteRef.current = now;
      writeActivityCookie(now);
    };

    const signOutForIdle = async () => {
      if (cancelled || signingOutRef.current) return;
      signingOutRef.current = true;
      trackedRef.current = false;
      try {
        clearActivityCookie();
        await supabaseBrowser.auth.signOut();
      } catch {
        /* still redirect */
      }
      if (!cancelled) {
        router.replace(idleLogoutRedirectPath(pathnameRef.current));
      }
      signingOutRef.current = false;
    };

    const enforceIfIdle = async () => {
      if (cancelled || signingOutRef.current || !trackedRef.current) return;

      const last = readActivityCookie();
      if (last == null) {
        touchActivity(true);
        return;
      }
      if (isIdleSessionExpired(last)) {
        await signOutForIdle();
      }
    };

    const onUserActivity = () => {
      if (!trackedRef.current || signingOutRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        // visibilitychange to hidden is not activity; visible + other events are.
        return;
      }
      if (isIdleSessionExpired(readActivityCookie())) {
        void signOutForIdle();
        return;
      }
      touchActivity();
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "pointerdown",
      "mousemove",
    ];

    const onVisibility = () => {
      if (document.visibilityState === "visible") onUserActivity();
    };

    for (const event of activityEvents) {
      window.addEventListener(event, onUserActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);

    const {
      data: { subscription },
    } = supabaseBrowser.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        trackedRef.current = false;
        clearActivityCookie();
        return;
      }

      const tracked = isTrackedSessionUser(session?.user);
      trackedRef.current = tracked;
      if (!tracked) return;

      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        if (isIdleSessionExpired(readActivityCookie())) {
          void signOutForIdle();
          return;
        }
        touchActivity(true);
      }
    });

    void (async () => {
      let session: Session | null;
      try {
        session = await getBrowserSession();
      } catch (error) {
        if (!isAuthLockContentionError(error)) {
          console.warn("[idle-session-guard] could not read session", error);
        }
        return;
      }
      if (cancelled) return;
      trackedRef.current = isTrackedSessionUser(session?.user);
      if (trackedRef.current) {
        if (isIdleSessionExpired(readActivityCookie())) {
          await signOutForIdle();
        } else {
          touchActivity(true);
        }
      }
    })();

    const intervalId = window.setInterval(() => {
      void enforceIfIdle();
    }, IDLE_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      subscription.unsubscribe();
      for (const event of activityEvents) {
        window.removeEventListener(event, onUserActivity);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  return null;
}

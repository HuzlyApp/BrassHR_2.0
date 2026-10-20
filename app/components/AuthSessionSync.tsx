"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { clearStaffListSessionCache } from "@/lib/lists/staff-list-session-cache";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { getBrowserSession, isAuthLockContentionError } from "@/lib/auth/browser-session";
import { idleLogoutRedirectPath } from "@/lib/auth/idle-session";
import {
  authSyncEventFromAuthChange,
  createAuthSyncBus,
  isAuthEntryPath,
  isSessionGuardedPath,
  reconcileAuthSessionFromStorage,
  type AuthSyncMessage,
} from "@/lib/auth/cross-tab-session-sync";

/**
 * Keeps open same-origin tabs aligned with the shared cookie session.
 * Relies on Supabase Auth BroadcastChannel for in-SDK events, plus our
 * token-free bus (BroadcastChannel + storage) so UI/middleware refresh promptly.
 */
export default function AuthSessionSync() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const lastHandledAtRef = useRef(0);
  const applyingRemoteRef = useRef(false);
  const clearingRef = useRef(false);
  const lastUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const bus = createAuthSyncBus();

    const clearInvalidSession = async () => {
      if (cancelled || clearingRef.current) return;
      clearingRef.current = true;
      try {
        await supabaseBrowser.auth.signOut();
      } catch {
        /* still continue */
      } finally {
        clearingRef.current = false;
      }
    };

    const applyReconcile = async (source: "remote" | "reload", knownSession?: Session | null) => {
      if (cancelled) return;

      let session: Session | null;
      if (knownSession !== undefined) {
        session = knownSession;
      } else {
        try {
          session = await getBrowserSession();
        } catch (error) {
          if (!isAuthLockContentionError(error)) {
            console.warn("[auth-session-sync] could not read session", error);
          }
          return;
        }
      }
      if (cancelled) return;
      const result = reconcileAuthSessionFromStorage(session);
      const path = pathnameRef.current;

      if (result.status === "rejected") {
        lastUserIdRef.current = null;
        await clearInvalidSession();
        if (cancelled) return;
        if (isSessionGuardedPath(path)) {
          router.replace(idleLogoutRedirectPath(path));
        } else {
          router.refresh();
        }
        return;
      }

      if (result.status === "signed_out") {
        clearStaffListSessionCache();
        const wasSignedIn = Boolean(lastUserIdRef.current);
        lastUserIdRef.current = null;
        if (source === "remote" || wasSignedIn) {
          if (isSessionGuardedPath(path)) {
            router.replace(idleLogoutRedirectPath(path));
          } else if (source === "remote") {
            router.refresh();
          }
        }
        return;
      }

      const previousUserId = lastUserIdRef.current;
      lastUserIdRef.current = result.userId;
      if (previousUserId && result.userId && previousUserId !== result.userId) {
        clearStaffListSessionCache();
      }
      const sessionChanged = previousUserId !== result.userId;

      // Remote sign-in or reload onto an auth entry page: refresh so middleware redirects.
      if (source === "remote" && sessionChanged) {
        router.refresh();
        return;
      }
      if (source === "reload" && isAuthEntryPath(path)) {
        router.refresh();
      }
    };

    const handleRemoteMessage = (message: AuthSyncMessage) => {
      if (cancelled) return;
      if (message.at <= lastHandledAtRef.current) return;
      lastHandledAtRef.current = message.at;

      applyingRemoteRef.current = true;
      void (async () => {
        try {
          await applyReconcile("remote");
        } finally {
          applyingRemoteRef.current = false;
        }
      })();
    };

    const unsubscribeBus = bus.subscribe(handleRemoteMessage);

    const {
      data: { subscription },
    } = supabaseBrowser.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;

      if (event === "INITIAL_SESSION") {
        // This callback runs while auth-js holds its session lock, so reuse its session.
        void applyReconcile("reload", session);
        return;
      }

      const syncType = authSyncEventFromAuthChange(event);
      if (!syncType) return;

      // Publish only for locally originated changes (storage fallback for other tabs).
      // Cross-tab Supabase BroadcastChannel already delivers onAuthStateChange elsewhere.
      if (!applyingRemoteRef.current) {
        const message: AuthSyncMessage = {
          type: syncType,
          at: Date.now(),
          userId: session?.user?.id ?? null,
        };
        lastHandledAtRef.current = message.at;
        bus.publish(message);
      }

      if (event === "SIGNED_OUT") {
        clearStaffListSessionCache();
        lastUserIdRef.current = null;
        if (isSessionGuardedPath(pathnameRef.current)) {
          router.replace(idleLogoutRedirectPath(pathnameRef.current));
        } else {
          router.refresh();
        }
        return;
      }

      const nextUserId = session?.user?.id ?? null;
      if (
        event === "USER_UPDATED" ||
        (event === "SIGNED_IN" &&
          lastUserIdRef.current &&
          nextUserId &&
          lastUserIdRef.current !== nextUserId)
      ) {
        clearStaffListSessionCache();
      }

      lastUserIdRef.current = nextUserId;

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        router.refresh();
      }
    });

    const onVisibility = () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      void applyReconcile("reload");
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      unsubscribeBus();
      bus.close();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  return null;
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { getBrowserSession, isAuthLockContentionError } from "@/lib/auth/browser-session";
import { recruiterLogoutLoginHref } from "@/lib/auth/recruiter-sign-in";

/**
 * Blocks anonymous / missing sessions on recruiter admin routes.
 * Applicant onboarding used to replace staff cookies — this sends users back to sign in.
 */
export function AdminStaffAuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const verify = async () => {
      let session: Session | null;
      try {
        session = await getBrowserSession();
      } catch (error) {
        // Unreadable is not signed out: check again shortly instead of logging out.
        if (!isAuthLockContentionError(error)) {
          console.warn("[admin-staff-auth-guard] could not read session", error);
        }
        if (!cancelled) setTimeout(() => void verify(), 2000);
        return;
      }
      const user = session?.user;

      if (!user?.id || user.is_anonymous === true) {
        if (!cancelled) {
          router.replace(recruiterLogoutLoginHref());
        }
        return;
      }

      if (!cancelled) setAllowed(true);
    };

    void verify();

    const {
      data: { subscription },
    } = supabaseBrowser.auth.onAuthStateChange(() => {
      // Defer: auth-js runs this callback while holding its session lock.
      setTimeout(() => void verify(), 0);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-sm text-slate-600">
        Checking sign-in…
      </div>
    );
  }

  return <>{children}</>;
}

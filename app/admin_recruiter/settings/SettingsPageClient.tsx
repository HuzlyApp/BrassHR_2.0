"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy entry — company settings now live under /settings/[section]. */
export default function SettingsPageClient() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin_recruiter/settings/branding");
  }, [router]);
  return null;
}

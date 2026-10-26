import type { SupabaseClient } from "@supabase/supabase-js";
import { loadStaffRoles, staffStorageKeys } from "@/lib/admin/staff-roles";

/**
 * Recipients for onboarding failure alerts: env override first, then tenant staff users.
 */
export async function resolveHrNotifyEmails(
  supabase: SupabaseClient,
  tenantId: string
): Promise<string[]> {
  const fromEnv =
    process.env.ONBOARDING_HR_NOTIFY_EMAILS?.split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@")) ?? [];

  if (fromEnv.length) {
    return [...new Set(fromEnv)];
  }

  let staffRoles = new Set<string>();
  try {
    staffRoles = new Set(staffStorageKeys(await loadStaffRoles(supabase)));
  } catch (error) {
    console.warn("[onboarding] resolveHrNotifyEmails catalog", error instanceof Error ? error.message : error);
    return [];
  }
  if (staffRoles.size === 0) return [];

  const { data, error } = await supabase
    .from("users")
    .select("email, role")
    .eq("tenant_id", tenantId);

  if (error) {
    console.warn("[onboarding] resolveHrNotifyEmails", error.message);
    return [];
  }

  const emails = (data ?? [])
    .filter((row) => staffRoles.has(String(row.role ?? "").trim().toLowerCase()))
    .map((row) => String(row.email ?? "").trim().toLowerCase())
    .filter((e) => e.includes("@"));

  return [...new Set(emails)];
}

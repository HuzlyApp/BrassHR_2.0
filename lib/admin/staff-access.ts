import type { SupabaseClient } from "@supabase/supabase-js";
import { loadStaffRoles, staffStorageKeys } from "@/lib/admin/staff-roles";

export type StaffAccessFlags = {
  userActive: boolean;
  membershipActive: boolean;
  mustChangePassword: boolean;
  hasStaffMembership: boolean;
};

const DEFAULT_FLAGS: StaffAccessFlags = {
  userActive: true,
  membershipActive: true,
  mustChangePassword: false,
  hasStaffMembership: true,
};

function isMissingColumnError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();
  return (
    error.code === "42703" ||
    (message.includes("column") && message.includes("does not exist")) ||
    message.includes("schema cache")
  );
}

/**
 * Fresh (uncached) staff access flags for login and API gates.
 * Missing columns on older databases are treated as active.
 */
export async function loadStaffAccessFlags(
  supabase: SupabaseClient,
  userId: string,
  tenantId?: string | null
): Promise<StaffAccessFlags> {
  const fullProfile = await supabase
    .from("users")
    .select("is_active, must_change_password, role, tenant_id")
    .eq("id", userId)
    .maybeSingle();

  let profile = fullProfile.data as {
    is_active?: boolean | null;
    must_change_password?: boolean | null;
    role?: string | null;
    tenant_id?: string | null;
  } | null;
  let profileError = fullProfile.error;

  if (profileError && isMissingColumnError(profileError)) {
    const fallback = await supabase
      .from("users")
      .select("is_active, role, tenant_id")
      .eq("id", userId)
      .maybeSingle();
    profile = fallback.data as typeof profile;
    profileError = fallback.error;
  }

  if (profileError || !profile) {
    return DEFAULT_FLAGS;
  }

  const userActive = profile.is_active !== false;
  const mustChangePassword = profile.must_change_password === true;

  let roleQuery = supabase
    .from("user_roles")
    .select("tenant_id, role, is_active")
    .eq("user_id", userId);

  if (tenantId) {
    roleQuery = roleQuery.eq("tenant_id", tenantId);
  }

  const { data: roleRows, error: roleError } = await roleQuery;
  const roles = !roleError
    ? ((roleRows ?? []) as Array<{ tenant_id?: string | null; role?: string | null; is_active?: boolean | null }>)
    : [];

  let staffRoles = new Set<string>();
  try {
    staffRoles = new Set(staffStorageKeys(await loadStaffRoles(supabase)));
  } catch {
    staffRoles = new Set();
  }
  const isStaffToken = (role: string | null | undefined) => {
    const key = String(role ?? "").trim().toLowerCase();
    if (!key || key === "worker") return false;
    return staffRoles.size === 0 || staffRoles.has(key);
  };
  const matching = tenantId
    ? roles.filter((row) => row.tenant_id === tenantId)
    : roles;

  const membershipFromRoles =
    matching.length === 0
      ? null
      : matching.some((row) => isStaffToken(row.role) && row.is_active !== false);

  const profileIsStaff =
    isStaffToken(profile.role) &&
    (!tenantId || profile.tenant_id === tenantId);

  const hasStaffMembership = membershipFromRoles === true || (membershipFromRoles === null && profileIsStaff);
  const membershipActive =
    userActive && (membershipFromRoles === true || (membershipFromRoles === null && profileIsStaff && userActive));

  return {
    userActive,
    membershipActive,
    mustChangePassword,
    hasStaffMembership,
  };
}

export function staffAccessDeniedMessage(flags: StaffAccessFlags): string | null {
  if (flags.mustChangePassword) {
    return "Set your password using the invitation email before signing in.";
  }
  if (!flags.userActive || !flags.membershipActive) {
    return "This account has been disabled. Contact your administrator.";
  }
  return null;
}

import type { User } from "@supabase/supabase-js";
import { appRoleToConsoleRole, staffRoleLabel } from "@/lib/admin/staff-directory-types";
import type { AccountOrganization, AccountProfile } from "./types";

export function buildFullName(firstName?: string | null, lastName?: string | null): string | null {
  const full = [firstName, lastName].filter(Boolean).join(" ").trim();
  return full || null;
}

export function getAccountDisplayName(
  profile: AccountProfile | null | undefined,
  user: User | null | undefined
): string {
  const fromProfile =
    profile?.full_name?.trim() ||
    buildFullName(profile?.first_name, profile?.last_name) ||
    null;

  const meta = user?.user_metadata as Record<string, string | undefined> | undefined;

  return (
    fromProfile ||
    meta?.full_name?.trim() ||
    meta?.name?.trim() ||
    user?.email?.trim() ||
    "Account user"
  );
}

export function getOrganizationDisplayName(
  organization: AccountOrganization | null | undefined,
  profile: AccountProfile | null | undefined,
  user: User | null | undefined
): string {
  return (
    organization?.name?.trim() ||
    organization?.subdomain?.trim() ||
    profile?.full_name?.trim() ||
    user?.email?.trim() ||
    "Organization"
  );
}

export function formatRoleLabel(role: string | null | undefined): string {
  const consoleRole = appRoleToConsoleRole(role);
  if (consoleRole) return staffRoleLabel(consoleRole);
  if (!role) return "Account Owner";
  return role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatAccountNumber(organizationId: string | null | undefined): string | null {
  if (!organizationId) return null;
  return organizationId.replace(/-/g, "").slice(-6).toUpperCase();
}

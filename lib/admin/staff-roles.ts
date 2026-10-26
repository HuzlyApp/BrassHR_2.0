import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffRole = {
  key: string;
  label: string;
  storageKey: string;
  aliases: string[];
  isAdmin: boolean;
  isStaff: boolean;
  isAssignable: boolean;
  sortOrder: number;
};

/** Seeded catalog used by unit tests. Runtime invite and access checks load staff_roles. */
export const SEEDED_STAFF_ROLES: StaffRole[] = [
  { key: "hr", label: "HR", storageKey: "hr", aliases: [], isAdmin: false, isStaff: true, isAssignable: true, sortOrder: 10 },
  { key: "recruiter", label: "Recruiter", storageKey: "client", aliases: [], isAdmin: false, isStaff: true, isAssignable: true, sortOrder: 20 },
  { key: "manager", label: "Manager", storageKey: "manager", aliases: [], isAdmin: false, isStaff: true, isAssignable: true, sortOrder: 30 },
  { key: "finance", label: "Finance", storageKey: "finance", aliases: [], isAdmin: false, isStaff: true, isAssignable: true, sortOrder: 40 },
  { key: "support", label: "Support", storageKey: "support", aliases: [], isAdmin: false, isStaff: true, isAssignable: true, sortOrder: 50 },
  { key: "admin", label: "Admin", storageKey: "admin", aliases: ["owner"], isAdmin: true, isStaff: true, isAssignable: true, sortOrder: 60 },
];

type StaffRoleRow = {
  key: string;
  label: string;
  storage_key: string;
  aliases: string[] | null;
  is_admin: boolean | null;
  is_staff: boolean | null;
  is_assignable: boolean | null;
  sort_order: number | null;
};

export function matchStaffRole(value: unknown, roles: StaffRole[]): StaffRole | null {
  if (typeof value !== "string") return null;
  const token = value.trim().toLowerCase();
  if (!token) return null;
  return (
    roles.find(
      (role) => role.key === token || role.storageKey === token || role.aliases.includes(token)
    ) ?? null
  );
}

export function labelForRole(value: unknown, roles: StaffRole[]): string | null {
  return matchStaffRole(value, roles)?.label ?? null;
}

export function storageKeyForRole(value: unknown, roles: StaffRole[]): string | null {
  return matchStaffRole(value, roles)?.storageKey ?? null;
}

export function staffStorageKeys(roles: StaffRole[]): string[] {
  const keys = new Set<string>();
  for (const role of roles) {
    if (!role.isStaff) continue;
    keys.add(role.key);
    keys.add(role.storageKey);
    for (const alias of role.aliases) keys.add(alias);
  }
  return [...keys];
}

export function adminStorageKeys(roles: StaffRole[]): string[] {
  const keys = new Set<string>();
  for (const role of roles) {
    if (!role.isAdmin) continue;
    keys.add(role.key);
    keys.add(role.storageKey);
    for (const alias of role.aliases) keys.add(alias);
  }
  return [...keys];
}

export async function loadStaffRoles(supabase: SupabaseClient): Promise<StaffRole[]> {
  const { data, error } = await supabase
    .from("staff_roles")
    .select("key, label, storage_key, aliases, is_admin, is_staff, is_assignable, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as StaffRoleRow[]).map((row) => ({
    key: String(row.key),
    label: String(row.label),
    storageKey: String(row.storage_key),
    aliases: Array.isArray(row.aliases) ? row.aliases.map((alias) => String(alias).toLowerCase()) : [],
    isAdmin: row.is_admin === true,
    isStaff: row.is_staff !== false,
    isAssignable: row.is_assignable !== false,
    sortOrder: Number(row.sort_order ?? 0),
  }));
}

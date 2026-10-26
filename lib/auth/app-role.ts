const ROLE_KEY = /^[a-z][a-z0-9_]{0,63}$/;

/** Stored role token. Names come from public.staff_roles; worker is the applicant role. */
export type AppRole = string;

export function parseAppRole(v: unknown): AppRole | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (s === "god_admin" || s === "owner") return "admin";
  if (s === "client") return "recruiter";
  return ROLE_KEY.test(s) ? s : null;
}

export function isStaffRole(role: AppRole): boolean {
  return role !== "worker";
}

export function roleRank(role: AppRole): number {
  if (role === "admin") return 4;
  if (role === "worker") return 1;
  return 2;
}

export function roleAtLeast(role: AppRole, min: AppRole): boolean {
  return roleRank(role) >= roleRank(min);
}

/** Catalog key from public.staff_roles. Recruiter is stored as "client". */
export type StaffConsoleRole = string;

export const STAFF_ACCOUNT_STATUSES = [
  "pending",
  "active",
  "suspended",
  "expired",
  "failed",
] as const;
export type StaffAccountStatus = (typeof STAFF_ACCOUNT_STATUSES)[number];

export type StaffDirectoryRow = {
  id: string;
  kind: "member" | "invitation";
  userId: string | null;
  invitationId: string | null;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  role: StaffConsoleRole;
  roleLabel: string;
  status: StaffAccountStatus;
  statusLabel: string;
  invitationDate: string | null;
  lastLogin: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  canResend: boolean;
  canChangeRole: boolean;
  canSuspend: boolean;
  canReactivate: boolean;
  canRemove: boolean;
};

export type InviteStaffInput = {
  firstName: string;
  lastName: string;
  email: string;
  role: StaffConsoleRole;
  requirePasswordChange: boolean;
};

export type StaffDirectoryErrorCode =
  | "VALIDATION"
  | "DUPLICATE_MEMBERSHIP"
  | "EMAIL_TAKEN"
  | "WORKER_EMAIL"
  | "OWNER_EMAIL"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "RATE_LIMIT"
  | "CONFIG"
  | "SEND_FAILED"
  | "INTERNAL";

export class StaffDirectoryError extends Error {
  constructor(
    message: string,
    public readonly code: StaffDirectoryErrorCode,
    public readonly status: number = 400
  ) {
    super(message);
    this.name = "StaffDirectoryError";
  }
}

const FULL_CONSOLE_ROLES = new Set(["admin", "owner", "god_admin"]);

/** Non-admin staff see the limited console. Admin rank comes from the catalog flag when known. */
export function isLimitedStaffConsoleRole(role: string | null | undefined, isAdmin?: boolean): boolean {
  if (isAdmin === true) return false;
  if (typeof role !== "string") return false;
  const key = role.trim().toLowerCase();
  if (!key || key === "worker") return false;
  return !FULL_CONSOLE_ROLES.has(key);
}

export function staffStatusLabel(status: StaffAccountStatus): string {
  switch (status) {
    case "pending":
      return "Invitation Pending";
    case "active":
      return "Active";
    case "suspended":
      return "Suspended";
    case "expired":
      return "Expired";
    case "failed":
      return "Invite Failed";
  }
}

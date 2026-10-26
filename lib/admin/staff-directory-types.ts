import type { AppRole } from "@/lib/auth/app-role";

export const STAFF_CONSOLE_ROLES = ["recruiter", "admin"] as const;
export type StaffConsoleRole = (typeof STAFF_CONSOLE_ROLES)[number];

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

export function isStaffConsoleRole(value: unknown): value is StaffConsoleRole {
  return value === "recruiter" || value === "admin";
}

export function appRoleToConsoleRole(role: AppRole | string | null | undefined): StaffConsoleRole | null {
  if (typeof role !== "string") return null;
  const normalized = role.trim().toLowerCase();
  if (normalized === "admin" || normalized === "owner") return "admin";
  if (normalized === "recruiter" || normalized === "client") return "recruiter";
  return null;
}

export function consoleRoleToDbRole(role: StaffConsoleRole): "client" | "admin" {
  return role === "admin" ? "admin" : "client";
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

export function staffRoleLabel(role: StaffConsoleRole): string {
  return role === "admin" ? "Admin" : "Recruiter";
}

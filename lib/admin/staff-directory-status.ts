import { isPersonNameTooLong, personNameTooLongMessage } from "@/lib/person-name";
import { normalizeTenantEmail } from "@/lib/tenant/tenant-email-uniqueness";
import { matchStaffRole, type StaffRole } from "@/lib/admin/staff-roles";
import {
  staffStatusLabel,
  type InviteStaffInput,
  type StaffAccountStatus,
  type StaffDirectoryRow,
} from "@/lib/admin/staff-directory-types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invites must send a set-password link unless the person already has a working login
 * and the admin explicitly skipped password setup. Having a users row is not enough:
 * earlier invites created auth users with an unusable password and no last_login.
 */
export function staffInviteNeedsPasswordSetup(params: {
  existingUserId: string | null;
  existingProfile: {
    must_change_password?: boolean | null;
    last_login?: string | null;
  } | null;
  requirePasswordChange?: boolean;
}): boolean {
  if (!params.existingUserId) return true;
  if (params.existingProfile?.must_change_password === true) return true;
  if (!params.existingProfile?.last_login) return true;
  return params.requirePasswordChange === true;
}

export function validateInviteStaffInput(
  input: {
    firstName?: unknown;
    lastName?: unknown;
    email?: unknown;
    role?: unknown;
    requirePasswordChange?: unknown;
  },
  roles: StaffRole[]
): InviteStaffInput | { error: string } {
  const firstName = typeof input.firstName === "string" ? input.firstName.trim() : "";
  const lastName = typeof input.lastName === "string" ? input.lastName.trim() : "";
  const email = normalizeTenantEmail(typeof input.email === "string" ? input.email : "");
  const roleRaw = typeof input.role === "string" && input.role.trim() ? input.role : "recruiter";
  const role = matchStaffRole(roleRaw, roles);

  if (!firstName) return { error: "First name is required." };
  if (isPersonNameTooLong(firstName)) return { error: personNameTooLongMessage("First name") };
  if (!lastName) return { error: "Last name is required." };
  if (isPersonNameTooLong(lastName)) return { error: personNameTooLongMessage("Last name") };
  if (!email.includes("@") || !EMAIL_RE.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (email.length > 254) return { error: "Email address is too long." };
  if (!role?.isStaff || !role.isAssignable) {
    return { error: "Choose a role from the list." };
  }

  return {
    firstName,
    lastName,
    email,
    role: role.key,
    requirePasswordChange: input.requirePasswordChange !== false,
  };
}

export function deriveInvitationStatus(params: {
  status: string;
  expiresAt: string | null;
  nowMs?: number;
}): StaffAccountStatus {
  const now = params.nowMs ?? Date.now();
  if (params.status === "failed") return "failed";
  if (params.status === "revoked") return "expired";
  if (params.status === "accepted") return "active";
  if (params.status === "expired") return "expired";
  if (params.expiresAt) {
    const expires = Date.parse(params.expiresAt);
    if (Number.isFinite(expires) && expires <= now) return "expired";
  }
  return "pending";
}

export function deriveMemberStatus(params: {
  membershipActive: boolean;
  mustChangePassword: boolean;
  invitationStatus: StaffAccountStatus | null;
}): StaffAccountStatus {
  if (!params.membershipActive) return "suspended";
  if (params.invitationStatus === "failed") return "failed";
  if (params.invitationStatus === "expired") return "expired";
  if (params.mustChangePassword || params.invitationStatus === "pending") return "pending";
  return "active";
}

export function displayName(firstName: string | null | undefined, lastName: string | null | undefined, email: string): string {
  const full = [firstName, lastName].filter(Boolean).join(" ").trim();
  return full || email;
}

export function toDirectoryMemberRow(params: {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  dbRole: string | null;
  membershipActive: boolean;
  mustChangePassword: boolean;
  invitationId: string | null;
  invitationStatus: StaffAccountStatus | null;
  invitationDate: string | null;
  lastLogin: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  isSelf: boolean;
  isLastAdmin: boolean;
  roles: StaffRole[];
}): StaffDirectoryRow {
  const match = matchStaffRole(params.dbRole, params.roles);
  const role = match?.key ?? "recruiter";
  const isAdmin = match?.isAdmin === true;
  const status = deriveMemberStatus({
    membershipActive: params.membershipActive,
    mustChangePassword: params.mustChangePassword,
    invitationStatus: params.invitationStatus,
  });
  const canMutate = !params.isSelf;
  return {
    id: `member:${params.userId}`,
    kind: "member",
    userId: params.userId,
    invitationId: params.invitationId,
    firstName: params.firstName ?? "",
    lastName: params.lastName ?? "",
    name: displayName(params.firstName, params.lastName, params.email),
    email: params.email,
    role,
    roleLabel: match?.label ?? "Recruiter",
    status,
    statusLabel: staffStatusLabel(status),
    invitationDate: params.invitationDate,
    lastLogin: params.lastLogin,
    createdByUserId: params.createdByUserId,
    createdByName: params.createdByName,
    canResend:
      canMutate &&
      Boolean(params.invitationId) &&
      (status === "pending" ||
        status === "expired" ||
        status === "failed" ||
        !params.lastLogin),
    canChangeRole: canMutate && status !== "pending" && !(params.isLastAdmin && isAdmin),
    canSuspend: canMutate && status === "active",
    canReactivate: canMutate && status === "suspended",
    canRemove: canMutate && !(params.isLastAdmin && isAdmin),
  };
}

export function toDirectoryInvitationRow(params: {
  invitationId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  dbRole: string | null;
  invitationStatus: StaffAccountStatus;
  invitationDate: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  roles: StaffRole[];
}): StaffDirectoryRow {
  const match = matchStaffRole(params.dbRole, params.roles);
  const role = match?.key ?? "recruiter";
  const status = params.invitationStatus;
  return {
    id: `invitation:${params.invitationId}`,
    kind: "invitation",
    userId: null,
    invitationId: params.invitationId,
    firstName: params.firstName ?? "",
    lastName: params.lastName ?? "",
    name: displayName(params.firstName, params.lastName, params.email),
    email: params.email,
    role,
    roleLabel: match?.label ?? "Recruiter",
    status,
    statusLabel: staffStatusLabel(status),
    invitationDate: params.invitationDate,
    lastLogin: null,
    createdByUserId: params.createdByUserId,
    createdByName: params.createdByName,
    canResend: status === "pending" || status === "expired" || status === "failed",
    canChangeRole: false,
    canSuspend: false,
    canReactivate: false,
    canRemove: true,
  };
}

const SENSITIVE_AUDIT_KEYS = [
  "password",
  "temporary_password",
  "temp_password",
  "token",
  "token_hash",
  "hashed_token",
  "action_link",
  "recovery_link",
  "invitation_token",
  "session",
  "access_token",
  "refresh_token",
  "service_role",
  "service_key",
];

export function sanitizeStaffAuditMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!metadata) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const lowered = key.toLowerCase();
    if (SENSITIVE_AUDIT_KEYS.some((blocked) => lowered.includes(blocked))) continue;
    if (typeof value === "string" && /token|password|secret|bearer/i.test(value) && value.length > 20) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function invitationExpiryHours(): number {
  const raw = Number(process.env.STAFF_INVITE_TTL_HOURS);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 24 * 14) : 72;
}

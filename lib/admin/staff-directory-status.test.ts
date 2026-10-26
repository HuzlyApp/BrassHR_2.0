import { describe, expect, it } from "vitest";
import {
  deriveInvitationStatus,
  deriveMemberStatus,
  sanitizeStaffAuditMetadata,
  staffInviteNeedsPasswordSetup,
  toDirectoryInvitationRow,
  toDirectoryMemberRow,
  validateInviteStaffInput,
} from "@/lib/admin/staff-directory-status";
import { buildStaffActivationUrl } from "@/lib/admin/send-staff-invite-email";
import { SEEDED_STAFF_ROLES } from "@/lib/admin/staff-roles";

function validateInvite(input: Parameters<typeof validateInviteStaffInput>[0]) {
  return validateInviteStaffInput(input, SEEDED_STAFF_ROLES);
}

describe("staff invite validation", () => {
  it("normalizes email and defaults role to recruiter", () => {
    const result = validateInvite({
      firstName: " Ada ",
      lastName: "Lovelace",
      email: "Ada@Example.COM",
    });
    expect(result).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      role: "recruiter",
      requirePasswordChange: true,
    });
  });

  it("rejects invalid email and blank names", () => {
    expect(validateInvite({ firstName: "", lastName: "L", email: "a@b.com" })).toEqual({
      error: "First name is required.",
    });
    expect(validateInvite({ firstName: "A", lastName: "L", email: "not-an-email" })).toEqual({
      error: "Enter a valid email address.",
    });
  });

  it("accepts HR, manager, finance, and support without changing recruiter", () => {
    expect(
      validateInvite({ firstName: "A", lastName: "L", email: "a@b.com", role: "hr" })
    ).toMatchObject({ role: "hr" });
    expect(
      validateInvite({ firstName: "A", lastName: "L", email: "a@b.com", role: "manager" })
    ).toMatchObject({ role: "manager" });
    expect(
      validateInvite({ firstName: "A", lastName: "L", email: "a@b.com", role: "finance" })
    ).toMatchObject({ role: "finance" });
    expect(
      validateInvite({ firstName: "A", lastName: "L", email: "a@b.com", role: "support" })
    ).toMatchObject({ role: "support" });
    expect(
      validateInvite({ firstName: "A", lastName: "L", email: "a@b.com", role: "client" })
    ).toMatchObject({ role: "recruiter" });
    expect(validateInvite({ firstName: "A", lastName: "L", email: "a@b.com", role: "worker" })).toEqual({
      error: "Choose a role from the list.",
    });
  });

  it("rejects names longer than 50 characters", () => {
    expect(
      validateInvite({ firstName: "a".repeat(51), lastName: "L", email: "a@b.com" })
    ).toEqual({ error: "First name must be 50 characters or fewer." });
    expect(
      validateInvite({ firstName: "A", lastName: "a".repeat(51), email: "a@b.com" })
    ).toEqual({ error: "Last name must be 50 characters or fewer." });
  });
});

describe("staff directory status", () => {
  it("marks expired pending invitations", () => {
    expect(
      deriveInvitationStatus({
        status: "pending",
        expiresAt: "2020-01-01T00:00:00.000Z",
        nowMs: Date.parse("2026-08-28T00:00:00.000Z"),
      })
    ).toBe("expired");
  });

  it("keeps members pending until password setup completes", () => {
    expect(
      deriveMemberStatus({
        membershipActive: true,
        mustChangePassword: true,
        invitationStatus: "pending",
      })
    ).toBe("pending");
    expect(
      deriveMemberStatus({
        membershipActive: true,
        mustChangePassword: false,
        invitationStatus: null,
      })
    ).toBe("active");
  });

  it("does not treat a pending member as Active", () => {
    const row = toDirectoryMemberRow({
      roles: SEEDED_STAFF_ROLES,
      userId: "user-1",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      dbRole: "client",
      membershipActive: true,
      mustChangePassword: true,
      invitationId: "inv-1",
      invitationStatus: "pending",
      invitationDate: "2026-08-28T00:00:00.000Z",
      lastLogin: null,
      createdByUserId: "admin-1",
      createdByName: "Owner",
      isSelf: false,
      isLastAdmin: false,
    });
    expect(row.status).toBe("pending");
    expect(row.statusLabel).toBe("Invitation Pending");
    expect(row.roleLabel).toBe("Recruiter");
    expect(row.canResend).toBe(true);
  });

  it("does not offer resend when there is no invitation to resend", () => {
    const row = toDirectoryMemberRow({
      roles: SEEDED_STAFF_ROLES,
      userId: "user-3",
      firstName: "Pat",
      lastName: "Lee",
      email: "pat@example.com",
      dbRole: "admin",
      membershipActive: true,
      mustChangePassword: true,
      invitationId: null,
      invitationStatus: "pending",
      invitationDate: null,
      lastLogin: null,
      createdByUserId: "admin-1",
      createdByName: "Owner",
      isSelf: false,
      isLastAdmin: false,
    });
    expect(row.status).toBe("pending");
    expect(row.canResend).toBe(false);
  });

  it("lets admins resend pending admin and recruiter invitations", () => {
    const recruiter = toDirectoryInvitationRow({
      roles: SEEDED_STAFF_ROLES,
      invitationId: "inv-recruiter",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      dbRole: "client",
      invitationStatus: "pending",
      invitationDate: "2026-08-28T00:00:00.000Z",
      createdByUserId: "admin-1",
      createdByName: "Owner",
    });
    const admin = toDirectoryInvitationRow({
      roles: SEEDED_STAFF_ROLES,
      invitationId: "inv-admin",
      firstName: "Grace",
      lastName: "Hopper",
      email: "grace@example.com",
      dbRole: "admin",
      invitationStatus: "expired",
      invitationDate: "2026-08-28T00:00:00.000Z",
      createdByUserId: "admin-1",
      createdByName: "Owner",
    });
    expect(recruiter.canResend).toBe(true);
    expect(recruiter.roleLabel).toBe("Recruiter");
    expect(admin.canResend).toBe(true);
    expect(admin.roleLabel).toBe("Admin");
  });

  it("lets admins resend when an accepted invitee never signed in", () => {
    const row = toDirectoryMemberRow({
      roles: SEEDED_STAFF_ROLES,
      userId: "user-2",
      firstName: "Carl",
      lastName: "Elipan",
      email: "carl@example.com",
      dbRole: "client",
      membershipActive: true,
      mustChangePassword: false,
      invitationId: "inv-2",
      invitationStatus: "active",
      invitationDate: "2026-08-28T00:00:00.000Z",
      lastLogin: null,
      createdByUserId: "admin-1",
      createdByName: "Owner",
      isSelf: false,
      isLastAdmin: false,
    });
    expect(row.canResend).toBe(true);
  });
});

describe("staff audit sanitization", () => {
  it("strips passwords, tokens, and service keys", () => {
    const sanitized = sanitizeStaffAuditMetadata({
      email: "ada@example.com",
      role: "recruiter",
      password: "secret",
      hashed_token: "abc",
      action_link: "https://example.com/auth/v1/verify?token=abc",
      notes: "invited",
    });
    expect(sanitized).toEqual({ email: "ada@example.com", role: "recruiter", notes: "invited" });
  });
});

describe("staff invite password setup", () => {
  it("sends a set-password link when the invitee has never signed in", () => {
    expect(
      staffInviteNeedsPasswordSetup({
        existingUserId: "user-1",
        existingProfile: { must_change_password: false, last_login: null },
        requirePasswordChange: false,
      })
    ).toBe(true);
  });

  it("sends a set-password link for brand-new accounts", () => {
    expect(
      staffInviteNeedsPasswordSetup({
        existingUserId: null,
        existingProfile: null,
        requirePasswordChange: true,
      })
    ).toBe(true);
  });

  it("keeps existing accounts on sign-in only when they already have a working password", () => {
    expect(
      staffInviteNeedsPasswordSetup({
        existingUserId: "user-1",
        existingProfile: { must_change_password: false, last_login: "2026-08-01T00:00:00.000Z" },
        requirePasswordChange: false,
      })
    ).toBe(false);
  });

  it("sends a set-password link when the existing account still must change password", () => {
    expect(
      staffInviteNeedsPasswordSetup({
        existingUserId: "user-1",
        existingProfile: { must_change_password: true, last_login: "2026-08-01T00:00:00.000Z" },
        requirePasswordChange: false,
      })
    ).toBe(true);
  });

  it("honors require-password-setup for accounts that can already sign in", () => {
    expect(
      staffInviteNeedsPasswordSetup({
        existingUserId: "user-1",
        existingProfile: { must_change_password: false, last_login: "2026-08-01T00:00:00.000Z" },
        requirePasswordChange: true,
      })
    ).toBe(true);
  });
});

describe("staff activation URL", () => {
  it("uses the app-hosted reset page and never includes a password", () => {
    const url = buildStaffActivationUrl({
      appOrigin: "https://jobs.brasshr.com",
      hashedToken: "hashed-token-value",
      tenantSlug: "acme",
    });
    expect(url).toContain("/reset-password");
    expect(url).toContain("token_hash=hashed-token-value");
    expect(url).not.toMatch(/password=/i);
  });
});

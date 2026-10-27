import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeActivityLog } from "@/lib/audit/activity-log";
import { NEXUS_PLATFORM } from "@/lib/auth/platform-shared";
import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-by-email";
import { invalidateUserCache } from "@/lib/cache";
import {
  deriveInvitationStatus,
  invitationExpiryHours,
  sanitizeStaffAuditMetadata,
  staffInviteNeedsPasswordSetup,
  toDirectoryInvitationRow,
  toDirectoryMemberRow,
  validateInviteStaffInput,
} from "@/lib/admin/staff-directory-status";
import {
  adminStorageKeys,
  labelForRole,
  loadAssignableStaffRoles,
  loadStaffRoles,
  matchStaffRole,
  type StaffRole,
} from "@/lib/admin/staff-roles";
import {
  StaffDirectoryError,
  type StaffConsoleRole,
  type StaffDirectoryRow,
} from "@/lib/admin/staff-directory-types";
import {
  buildStaffActivationUrl,
  buildStaffSignInUrl,
  sendStaffInviteEmail,
} from "@/lib/admin/send-staff-invite-email";
import {
  findGlobalWorkerEmailConflict,
  findPlatformOwnerEmailConflict,
  findStaffTenantEmailConflict,
  findWorkerTenantEmailConflict,
  normalizeTenantEmail,
} from "@/lib/tenant/tenant-email-uniqueness";

type DirectoryActor = {
  userId: string;
  email: string | null;
};

type TenantInfo = {
  id: string;
  name: string;
  slug: string | null;
};

type UserRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  is_active: boolean | null;
  last_login: string | null;
  must_change_password?: boolean | null;
  tenant_id: string | null;
  god_admin?: boolean | null;
};

type RoleRow = {
  user_id: string;
  tenant_id: string;
  role: string;
  is_active?: boolean | null;
  created_at?: string | null;
  created_by?: string | null;
};

type InvitationRow = {
  id: string;
  tenant_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  invited_by: string | null;
  invited_user_id: string | null;
  status: string;
  expires_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  created_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function generateUnusablePassword(): string {
  const bytes = randomBytes(32);
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  let out = "";
  for (const b of bytes) out += chars[b % chars.length];
  return `A1!${out}`;
}

async function revokeAuthSessions(supabase: SupabaseClient, userId: string): Promise<void> {
  try {
    await supabase.auth.admin.signOut(userId, "global");
  } catch (error) {
    console.warn("[staff-directory] could not revoke sessions", error instanceof Error ? error.message : error);
  }
}

function classifyGenerateLinkError(message: string): "rate_limit" | "not_found" | "send_failed" {
  const lower = message.toLowerCase();
  if (
    lower.includes("security purposes") ||
    lower.includes("only request this after") ||
    lower.includes("rate limit")
  ) {
    return "rate_limit";
  }
  if (lower.includes("not found") || lower.includes("unable to find")) return "not_found";
  return "send_failed";
}

async function loadTenant(supabase: SupabaseClient, tenantId: string): Promise<TenantInfo> {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, slug, subdomain")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new StaffDirectoryError(error.message, "INTERNAL", 500);
  if (!data?.id) throw new StaffDirectoryError("Tenant not found.", "NOT_FOUND", 404);
  const row = data as { id: string; name: string | null; slug: string | null; subdomain?: string | null };
  return {
    id: String(row.id),
    name: String(row.name ?? "your organization"),
    slug: (row.subdomain || row.slug || null)?.toLowerCase() ?? null,
  };
}

async function loadNameMap(supabase: SupabaseClient, userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data } = await supabase
    .from("users")
    .select("id, first_name, last_name, email")
    .in("id", unique);
  for (const row of (data ?? []) as UserRow[]) {
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.email || "Unknown";
    map.set(row.id, name);
  }
  return map;
}

async function countActiveAdmins(
  supabase: SupabaseClient,
  tenantId: string,
  excludeUserId?: string
): Promise<number> {
  const adminKeys = adminStorageKeys(await loadStaffRoles(supabase));
  if (adminKeys.length === 0) return 0;
  const { data: roles } = await supabase
    .from("user_roles")
    .select("user_id, role, is_active")
    .eq("tenant_id", tenantId)
    .in("role", adminKeys);
  const roleRows = (roles ?? []) as RoleRow[];
  const ids = roleRows
    .filter((row) => row.is_active !== false && row.user_id !== excludeUserId)
    .map((row) => row.user_id);

  const { data: users } = await supabase
    .from("users")
    .select("id, role, is_active, tenant_id")
    .eq("tenant_id", tenantId)
    .in("role", adminKeys);
  const userRows = (users ?? []) as UserRow[];
  const fromUsers = userRows
    .filter((row) => row.is_active !== false && row.id !== excludeUserId)
    .map((row) => row.id);

  return new Set([...ids, ...fromUsers]).size;
}

async function findMembership(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string
): Promise<RoleRow | UserRow | null> {
  const { data: role } = await supabase
    .from("user_roles")
    .select("user_id, tenant_id, role, is_active, created_at, created_by")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (role) return role as RoleRow;

  const { data: user } = await supabase
    .from("users")
    .select("id, email, first_name, last_name, role, is_active, last_login, must_change_password, tenant_id, god_admin")
    .eq("id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return (user as UserRow | null) ?? null;
}

async function audit(
  params: {
    actorUserId: string;
    tenantId: string;
    action: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
    request?: Request;
  }
): Promise<void> {
  await writeActivityLog({
    actorUserId: params.actorUserId,
    action: params.action,
    entityType: "staff_user",
    entityId: params.entityId ?? null,
    tenantId: params.tenantId,
    metadata: sanitizeStaffAuditMetadata({
      outcome: "success",
      ...(params.metadata ?? {}),
    }),
    request: params.request,
  });
}

async function mergeStaffInviteAppMetadata(params: {
  supabase: SupabaseClient;
  userId: string;
  tenantId: string;
  dbRole: string;
  roles: StaffRole[];
  firstName: string;
  lastName: string;
  keepHomeTenant: boolean;
  homeTenantId?: string | null;
}): Promise<void> {
  const { data } = await params.supabase.auth.admin.getUserById(params.userId);
  const current = (data.user?.app_metadata ?? {}) as Record<string, unknown>;
  const currentRole = typeof current.role === "string" ? current.role : null;
  const keepAdminRole = matchStaffRole(currentRole, params.roles)?.isAdmin === true;
  const homeTenantId =
    params.keepHomeTenant && params.homeTenantId ? params.homeTenantId : params.tenantId;
  await params.supabase.auth.admin.updateUserById(params.userId, {
    email_confirm: true,
    app_metadata: {
      ...current,
      platform: NEXUS_PLATFORM,
      role: keepAdminRole ? currentRole : params.dbRole,
      tenant_id: homeTenantId,
      signup_completed: true,
      tenant_onboarding_completed: true,
    },
    user_metadata: {
      ...(typeof data.user?.user_metadata === "object" && data.user.user_metadata
        ? data.user.user_metadata
        : {}),
      first_name: params.firstName,
      last_name: params.lastName,
    },
  });
}

async function generateRecoveryHashedToken(
  supabase: SupabaseClient,
  email: string
): Promise<{ hashedToken: string } | { error: string; reason: "rate_limit" | "not_found" | "send_failed" }> {
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  const hashedToken = linkData?.properties?.hashed_token?.trim();
  if (linkError || !hashedToken) {
    const reason = classifyGenerateLinkError(linkError?.message || "");
    if (reason === "rate_limit") {
      return { error: "Please wait a minute before sending another invitation.", reason };
    }
    return { error: "Could not create an activation link. Try again.", reason };
  }
  return { hashedToken };
}

export async function listStaffDirectory(
  supabase: SupabaseClient,
  params: { tenantId: string; actorUserId: string }
): Promise<StaffDirectoryRow[]> {
  const catalog = await loadAssignableStaffRoles(supabase, params.tenantId);
  const { data: roleData, error: roleError } = await supabase
    .from("user_roles")
    .select("user_id, tenant_id, role, is_active, created_at, created_by")
    .eq("tenant_id", params.tenantId);
  if (roleError) throw new StaffDirectoryError(roleError.message, "INTERNAL", 500);
  const roles = (roleData ?? []) as RoleRow[];

  const { data: homeUsers, error: homeError } = await supabase
    .from("users")
    .select("id, email, first_name, last_name, role, is_active, last_login, must_change_password, tenant_id, god_admin")
    .eq("tenant_id", params.tenantId);
  if (homeError && !/must_change_password/i.test(homeError.message)) {
    throw new StaffDirectoryError(homeError.message, "INTERNAL", 500);
  }

  const usersById = new Map<string, UserRow>();
  for (const row of (homeUsers ?? []) as UserRow[]) {
    usersById.set(row.id, row);
  }

  const roleUserIds = roles.map((row) => row.user_id).filter((id) => !usersById.has(id));
  if (roleUserIds.length > 0) {
    const { data: extraUsers, error: extraError } = await supabase
      .from("users")
      .select("id, email, first_name, last_name, role, is_active, last_login, must_change_password, tenant_id, god_admin")
      .in("id", roleUserIds);
    if (extraError && !/must_change_password/i.test(extraError.message)) {
      throw new StaffDirectoryError(extraError.message, "INTERNAL", 500);
    }
    for (const row of (extraUsers ?? []) as UserRow[]) {
      usersById.set(row.id, row);
    }
  }

  const { data: inviteData, error: inviteError } = await supabase
    .from("staff_invitations")
    .select(
      "id, tenant_id, email, first_name, last_name, role, invited_by, invited_user_id, status, expires_at, sent_at, accepted_at, created_at"
    )
    .eq("tenant_id", params.tenantId)
    .in("status", ["pending", "failed", "expired", "accepted"])
    .order("created_at", { ascending: false });
  if (inviteError) throw new StaffDirectoryError(inviteError.message, "INTERNAL", 500);
  const invitations = (inviteData ?? []) as InvitationRow[];

  const createdByIds = [
    ...roles.map((row) => row.created_by).filter((id): id is string => Boolean(id)),
    ...invitations.map((row) => row.invited_by).filter((id): id is string => Boolean(id)),
  ];
  const nameMap = await loadNameMap(supabase, createdByIds);

  const adminCount = await countActiveAdmins(supabase, params.tenantId);
  const memberIds = new Set<string>();
  const rows: StaffDirectoryRow[] = [];

  const roleByUser = new Map(roles.map((row) => [row.user_id, row]));
  const allMemberIds = new Set([...roleByUser.keys(), ...usersById.keys()]);

  for (const userId of allMemberIds) {
    const user = usersById.get(userId);
    const email = user?.email;
    if (!user || !email) continue;
    const membership = roleByUser.get(userId);
    const dbRole = membership?.role ?? user.role;
    const consoleRole = matchStaffRole(dbRole, catalog);
    if (!consoleRole?.isStaff) continue;

    const invite = invitations.find(
      (row) => row.invited_user_id === userId || normalizeTenantEmail(row.email) === normalizeTenantEmail(email)
    );
    const invitationStatus = invite
      ? deriveInvitationStatus({ status: invite.status, expiresAt: invite.expires_at })
      : null;
    const membershipActive = (membership?.is_active ?? user.is_active) !== false && user.is_active !== false;
    const isLastAdmin = consoleRole.isAdmin && adminCount <= 1;

    rows.push(
      toDirectoryMemberRow({
        userId,
        firstName: user.first_name,
        lastName: user.last_name,
        email: normalizeTenantEmail(email),
        dbRole,
        membershipActive,
        mustChangePassword: user.must_change_password === true,
        invitationId: invite?.id ?? null,
        invitationStatus,
        invitationDate: invite?.created_at ?? membership?.created_at ?? null,
        lastLogin: user.last_login,
        createdByUserId: membership?.created_by ?? invite?.invited_by ?? null,
        createdByName:
          nameMap.get(membership?.created_by ?? invite?.invited_by ?? "") ??
          (membership?.created_by || invite?.invited_by ? null : "System"),
        isSelf: userId === params.actorUserId,
        isLastAdmin,
        roles: catalog,
      })
    );
    memberIds.add(userId);
    if (invite) memberIds.add(invite.id);
  }

  for (const invite of invitations) {
    if (invite.invited_user_id && memberIds.has(invite.invited_user_id)) continue;
    if (invite.status === "accepted") continue;
    const email = normalizeTenantEmail(invite.email);
    if (rows.some((row) => row.email === email && row.kind === "member")) continue;
    rows.push(
      toDirectoryInvitationRow({
        invitationId: invite.id,
        firstName: invite.first_name,
        lastName: invite.last_name,
        email,
        dbRole: invite.role,
        invitationStatus: deriveInvitationStatus({ status: invite.status, expiresAt: invite.expires_at }),
        invitationDate: invite.created_at,
        createdByUserId: invite.invited_by,
        createdByName: invite.invited_by ? nameMap.get(invite.invited_by) ?? null : "System",
        roles: catalog,
      })
    );
  }

  rows.sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
  return rows;
}

async function assertInviteEligibility(
  supabase: SupabaseClient,
  tenantId: string,
  email: string
): Promise<{ existingUserId: string | null; existingProfile: UserRow | null }> {
  if (await findWorkerTenantEmailConflict(supabase, { tenantId, email })) {
    throw new StaffDirectoryError(
      "This email is already used by an applicant in this organization.",
      "WORKER_EMAIL",
      409
    );
  }
  if (await findGlobalWorkerEmailConflict(supabase, email)) {
    throw new StaffDirectoryError(
      "This email is already used by an applicant account.",
      "WORKER_EMAIL",
      409
    );
  }
  if (await findPlatformOwnerEmailConflict(supabase, email)) {
    throw new StaffDirectoryError(
      "This email is already registered as an organization owner.",
      "OWNER_EMAIL",
      409
    );
  }
  if (await findStaffTenantEmailConflict(supabase, { tenantId, email })) {
    throw new StaffDirectoryError(
      "This person already has a login for this organization.",
      "DUPLICATE_MEMBERSHIP",
      409
    );
  }

  const existingUserId = await findAuthUserIdByEmail(supabase, email);
  let existingProfile: UserRow | null = null;
  if (existingUserId) {
    const { data } = await supabase
      .from("users")
      .select("id, email, first_name, last_name, role, is_active, last_login, must_change_password, tenant_id, god_admin")
      .eq("id", existingUserId)
      .maybeSingle();
    existingProfile = (data as UserRow | null) ?? null;
    if (existingProfile?.god_admin) {
      throw new StaffDirectoryError("This email belongs to a platform administrator.", "FORBIDDEN", 409);
    }
    const membership = await findMembership(supabase, tenantId, existingUserId);
    if (membership) {
      throw new StaffDirectoryError(
        "This person already has a login for this organization.",
        "DUPLICATE_MEMBERSHIP",
        409
      );
    }
  }

  const { data: pending } = await supabase
    .from("staff_invitations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  if (pending?.id) {
    throw new StaffDirectoryError(
      "An invitation is already pending for this email. Resend it instead.",
      "CONFLICT",
      409
    );
  }

  return { existingUserId, existingProfile };
}

async function upsertMembership(params: {
  supabase: SupabaseClient;
  tenantId: string;
  userId: string;
  dbRole: string;
  createdBy: string;
  isHomeTenant: boolean;
  firstName: string;
  lastName: string;
  email: string;
  mustChangePassword: boolean;
}): Promise<void> {
  const now = nowIso();
  if (params.isHomeTenant) {
    const { error: userError } = await params.supabase.from("users").upsert(
      {
        id: params.userId,
        tenant_id: params.tenantId,
        email: params.email,
        first_name: params.firstName,
        last_name: params.lastName,
        role: params.dbRole,
        is_active: true,
        email_verified: true,
        must_change_password: params.mustChangePassword,
        signup_completed_at: now,
        tenant_onboarding_completed_at: now,
        onboarding_completed: true,
      },
      { onConflict: "id" }
    );
    if (userError) {
      if (userError.code === "23505") {
        throw new StaffDirectoryError(
          "This person already has a login for this organization.",
          "DUPLICATE_MEMBERSHIP",
          409
        );
      }
      throw new StaffDirectoryError(userError.message, "INTERNAL", 500);
    }
  }

  const { error: roleError } = await params.supabase.from("user_roles").upsert(
    {
      user_id: params.userId,
      tenant_id: params.tenantId,
      role: params.dbRole,
      is_active: true,
      created_by: params.createdBy,
    },
    { onConflict: "user_id,tenant_id" }
  );
  if (roleError) {
    if (roleError.code === "23505") {
      throw new StaffDirectoryError(
        "This person already has a login for this organization.",
        "DUPLICATE_MEMBERSHIP",
        409
      );
    }
    throw new StaffDirectoryError(roleError.message, "INTERNAL", 500);
  }
}

async function insertInvitation(params: {
  supabase: SupabaseClient;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  dbRole: string;
  invitedBy: string;
  invitedUserId: string;
  status: "pending" | "accepted" | "failed";
  lastErrorCode?: string | null;
}): Promise<InvitationRow> {
  const now = nowIso();
  const expiresAt = new Date(Date.now() + invitationExpiryHours() * 60 * 60 * 1000).toISOString();
  const { data, error } = await params.supabase
    .from("staff_invitations")
    .insert({
      tenant_id: params.tenantId,
      email: params.email,
      first_name: params.firstName,
      last_name: params.lastName,
      role: params.dbRole,
      invited_by: params.invitedBy,
      invited_user_id: params.invitedUserId,
      status: params.status,
      expires_at: expiresAt,
      sent_at: params.status === "pending" || params.status === "accepted" ? now : null,
      accepted_at: params.status === "accepted" ? now : null,
      last_error_code: params.lastErrorCode ?? null,
      created_at: now,
      updated_at: now,
    })
    .select(
      "id, tenant_id, email, first_name, last_name, role, invited_by, invited_user_id, status, expires_at, sent_at, accepted_at, created_at"
    )
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      throw new StaffDirectoryError(
        "An invitation is already pending for this email. Resend it instead.",
        "CONFLICT",
        409
      );
    }
    throw new StaffDirectoryError(error?.message ?? "Could not record invitation.", "INTERNAL", 500);
  }
  return data as InvitationRow;
}

export async function inviteStaff(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    actor: DirectoryActor;
    appOrigin: string;
    input: unknown;
    request?: Request;
  }
): Promise<{ row: StaffDirectoryRow; existingAccount: boolean }> {
  const catalog = await loadAssignableStaffRoles(supabase, params.tenantId);
  const parsed = validateInviteStaffInput((params.input ?? {}) as Record<string, unknown>, catalog);
  if ("error" in parsed) {
    throw new StaffDirectoryError(parsed.error, "VALIDATION", 400);
  }

  const tenant = await loadTenant(supabase, params.tenantId);
  const invitedRole = matchStaffRole(parsed.role, catalog);
  const dbRole = invitedRole?.storageKey;
  if (!dbRole) {
    throw new StaffDirectoryError("Choose a role from the list.", "VALIDATION", 400);
  }
  const { existingUserId, existingProfile } = await assertInviteEligibility(
    supabase,
    params.tenantId,
    parsed.email
  );

  const hasHomeTenant = Boolean(existingUserId && existingProfile?.tenant_id);
  const needsPasswordSetup = staffInviteNeedsPasswordSetup({
    existingUserId,
    existingProfile,
    requirePasswordChange: parsed.requirePasswordChange,
  });
  let userId = existingUserId;
  let createdAuthUser = false;
  let provisioned = false;

  try {
    if (!userId) {
      const password = generateUnusablePassword();
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: parsed.email,
        password,
        email_confirm: true,
        app_metadata: {
          platform: NEXUS_PLATFORM,
          role: dbRole,
          tenant_id: params.tenantId,
          signup_completed: true,
          tenant_onboarding_completed: true,
        },
        user_metadata: {
          first_name: parsed.firstName,
          last_name: parsed.lastName,
        },
      });
      if (createError || !created.user?.id) {
        const message = createError?.message ?? "Could not create the login account.";
        const status = message.toLowerCase().includes("already") ? 409 : 500;
        throw new StaffDirectoryError(
          status === 409 ? "This email is already registered." : message,
          status === 409 ? "EMAIL_TAKEN" : "INTERNAL",
          status
        );
      }
      userId = created.user.id;
      createdAuthUser = true;
    } else {
      await mergeStaffInviteAppMetadata({
        supabase,
        userId,
        tenantId: params.tenantId,
        dbRole,
        roles: catalog,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        keepHomeTenant: hasHomeTenant,
        homeTenantId: existingProfile?.tenant_id,
      });
    }

    await upsertMembership({
      supabase,
      tenantId: params.tenantId,
      userId,
      dbRole,
      createdBy: params.actor.userId,
      isHomeTenant: !hasHomeTenant,
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: parsed.email,
      mustChangePassword: needsPasswordSetup,
    });
    if (needsPasswordSetup && hasHomeTenant) {
      await supabase.from("users").update({ must_change_password: true }).eq("id", userId);
    }
    provisioned = true;

    if (!needsPasswordSetup) {
      const invitation = await insertInvitation({
        supabase,
        tenantId: params.tenantId,
        email: parsed.email,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        dbRole,
        invitedBy: params.actor.userId,
        invitedUserId: userId,
        status: "accepted",
      });
      const sent = await sendStaffInviteEmail({
        email: parsed.email,
        firstName: parsed.firstName,
        tenantName: tenant.name,
        roleLabel: invitedRole?.label ?? "Staff",
        actionUrl: buildStaffSignInUrl({ appOrigin: params.appOrigin, tenantSlug: tenant.slug }),
        existingAccount: true,
      });
      if (!sent.ok) {
        await supabase
          .from("staff_invitations")
          .update({ last_error_code: sent.reason, updated_at: nowIso() })
          .eq("id", invitation.id);
      }
      await invalidateUserCache("users", userId);
      await audit({
        actorUserId: params.actor.userId,
        tenantId: params.tenantId,
        action: "staff.invite.added_existing",
        entityId: userId,
        metadata: { role: parsed.role, email: parsed.email, existing_account: true, email_sent: sent.ok },
        request: params.request,
      });
      const rows = await listStaffDirectory(supabase, {
        tenantId: params.tenantId,
        actorUserId: params.actor.userId,
      });
      const row = rows.find((item) => item.userId === userId);
      if (!row) throw new StaffDirectoryError("Invitation saved but the directory could not be refreshed.", "INTERNAL", 500);
      if (!sent.ok) {
        throw new StaffDirectoryError(sent.message, sent.reason === "config" ? "CONFIG" : "SEND_FAILED", sent.reason === "config" ? 503 : 502);
      }
      return { row, existingAccount: true };
    }

    const token = await generateRecoveryHashedToken(supabase, parsed.email);
    const invitationStatus = "hashedToken" in token ? "pending" : "failed";
    const invitation = await insertInvitation({
      supabase,
      tenantId: params.tenantId,
      email: parsed.email,
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      dbRole,
      invitedBy: params.actor.userId,
      invitedUserId: userId,
      status: invitationStatus,
      lastErrorCode: "error" in token ? token.reason : null,
    });

    if (!("hashedToken" in token)) {
      await audit({
        actorUserId: params.actor.userId,
        tenantId: params.tenantId,
        action: "staff.invite.failed",
        entityId: userId,
        metadata: { role: parsed.role, email: parsed.email, error_code: token.reason },
        request: params.request,
      });
      throw new StaffDirectoryError(
        token.error,
        token.reason === "rate_limit" ? "RATE_LIMIT" : "SEND_FAILED",
        token.reason === "rate_limit" ? 429 : 502
      );
    }

    const actionUrl = buildStaffActivationUrl({
      appOrigin: params.appOrigin,
      hashedToken: token.hashedToken,
      tenantSlug: tenant.slug,
    });
    const sent = await sendStaffInviteEmail({
      email: parsed.email,
      firstName: parsed.firstName,
      tenantName: tenant.name,
      roleLabel: invitedRole?.label ?? "Staff",
      actionUrl,
      existingAccount: false,
    });

    if (!sent.ok) {
      await supabase
        .from("staff_invitations")
        .update({ status: "failed", last_error_code: sent.reason, updated_at: nowIso() })
        .eq("id", invitation.id);
      await audit({
        actorUserId: params.actor.userId,
        tenantId: params.tenantId,
        action: "staff.invite.failed",
        entityId: userId,
        metadata: { role: parsed.role, email: parsed.email, error_code: sent.reason },
        request: params.request,
      });
      throw new StaffDirectoryError(
        sent.message,
        sent.reason === "config" ? "CONFIG" : sent.reason === "rate_limit" ? "RATE_LIMIT" : "SEND_FAILED",
        sent.reason === "config" ? 503 : sent.reason === "rate_limit" ? 429 : 502
      );
    }

    await invalidateUserCache("users", userId);
    await audit({
      actorUserId: params.actor.userId,
      tenantId: params.tenantId,
      action: "staff.invite.created",
      entityId: userId,
      metadata: { role: parsed.role, email: parsed.email, existing_account: false },
      request: params.request,
    });

    const rows = await listStaffDirectory(supabase, {
      tenantId: params.tenantId,
      actorUserId: params.actor.userId,
    });
    const row = rows.find((item) => item.userId === userId || item.invitationId === invitation.id);
    if (!row) throw new StaffDirectoryError("Invitation sent but the directory could not be refreshed.", "INTERNAL", 500);
    return { row, existingAccount: false };
  } catch (error) {
    if (createdAuthUser && userId && !provisioned) {
      await supabase.from("user_roles").delete().eq("user_id", userId).eq("tenant_id", params.tenantId);
      await supabase.from("staff_invitations").delete().eq("invited_user_id", userId).eq("tenant_id", params.tenantId);
      await supabase.from("users").delete().eq("id", userId);
      await supabase.auth.admin.deleteUser(userId);
    }
    throw error;
  }
}

export async function resendStaffInvitation(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    actor: DirectoryActor;
    invitationId: string;
    appOrigin: string;
    request?: Request;
  }
): Promise<StaffDirectoryRow> {
  const { data, error } = await supabase
    .from("staff_invitations")
    .select(
      "id, tenant_id, email, first_name, last_name, role, invited_by, invited_user_id, status, expires_at, sent_at, accepted_at, created_at"
    )
    .eq("id", params.invitationId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();
  if (error) throw new StaffDirectoryError(error.message, "INTERNAL", 500);
  const invitation = data as InvitationRow | null;
  if (!invitation) throw new StaffDirectoryError("Invitation not found.", "NOT_FOUND", 404);
  if (invitation.status === "revoked") {
    throw new StaffDirectoryError("This invitation can no longer be resent.", "CONFLICT", 409);
  }
  if (invitation.status === "accepted") {
    let allowResend = false;
    if (invitation.invited_user_id) {
      const { data: profile } = await supabase
        .from("users")
        .select("last_login, must_change_password")
        .eq("id", invitation.invited_user_id)
        .maybeSingle();
      const row = profile as { last_login?: string | null; must_change_password?: boolean | null } | null;
      allowResend = !row?.last_login || row?.must_change_password === true;
    }
    if (!allowResend) {
      throw new StaffDirectoryError("This invitation can no longer be resent.", "CONFLICT", 409);
    }
  }

  const tenant = await loadTenant(supabase, params.tenantId);
  const email = normalizeTenantEmail(invitation.email);
  const token = await generateRecoveryHashedToken(supabase, email);
  if (!("hashedToken" in token)) {
    await supabase
      .from("staff_invitations")
      .update({ status: "failed", last_error_code: token.reason, updated_at: nowIso() })
      .eq("id", invitation.id);
    throw new StaffDirectoryError(
      token.error,
      token.reason === "rate_limit" ? "RATE_LIMIT" : "SEND_FAILED",
      token.reason === "rate_limit" ? 429 : 502
    );
  }

  const expiresAt = new Date(Date.now() + invitationExpiryHours() * 60 * 60 * 1000).toISOString();
  const sent = await sendStaffInviteEmail({
    email,
    firstName: invitation.first_name ?? "there",
    tenantName: tenant.name,
    roleLabel: labelForRole(invitation.role, await loadAssignableStaffRoles(supabase, params.tenantId)) ?? "Staff",
    actionUrl: buildStaffActivationUrl({
      appOrigin: params.appOrigin,
      hashedToken: token.hashedToken,
      tenantSlug: tenant.slug,
    }),
    existingAccount: false,
  });
  if (!sent.ok) {
    await supabase
      .from("staff_invitations")
      .update({ status: "failed", last_error_code: sent.reason, updated_at: nowIso() })
      .eq("id", invitation.id);
    throw new StaffDirectoryError(
      sent.message,
      sent.reason === "config" ? "CONFIG" : sent.reason === "rate_limit" ? "RATE_LIMIT" : "SEND_FAILED",
      sent.reason === "config" ? 503 : sent.reason === "rate_limit" ? 429 : 502
    );
  }

  await supabase
    .from("staff_invitations")
    .update({
      status: "pending",
      sent_at: nowIso(),
      expires_at: expiresAt,
      last_error_code: null,
      updated_at: nowIso(),
    })
    .eq("id", invitation.id);

  if (invitation.invited_user_id) {
    await supabase
      .from("users")
      .update({ must_change_password: true })
      .eq("id", invitation.invited_user_id);
    await invalidateUserCache("users", invitation.invited_user_id);
  }

  await audit({
    actorUserId: params.actor.userId,
    tenantId: params.tenantId,
    action: "staff.invite.resent",
    entityId: invitation.invited_user_id ?? invitation.id,
    metadata: { email, invitation_id: invitation.id },
    request: params.request,
  });

  const rows = await listStaffDirectory(supabase, {
    tenantId: params.tenantId,
    actorUserId: params.actor.userId,
  });
  const row = rows.find((item) => item.invitationId === invitation.id);
  if (!row) throw new StaffDirectoryError("Invitation resent but the directory could not be refreshed.", "INTERNAL", 500);
  return row;
}

export async function updateStaffMembership(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    actor: DirectoryActor;
    userId: string;
    action: "change_role" | "suspend" | "reactivate";
    role?: StaffConsoleRole;
    request?: Request;
  }
): Promise<StaffDirectoryRow> {
  if (params.userId === params.actor.userId) {
    throw new StaffDirectoryError("You cannot change your own access.", "FORBIDDEN", 403);
  }

  const membership = await findMembership(supabase, params.tenantId, params.userId);
  if (!membership) throw new StaffDirectoryError("User is not a member of this organization.", "NOT_FOUND", 404);

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, first_name, last_name, role, is_active, last_login, must_change_password, tenant_id, god_admin")
    .eq("id", params.userId)
    .maybeSingle();
  const user = profile as UserRow | null;
  if (user?.god_admin) {
    throw new StaffDirectoryError("Platform administrators cannot be managed here.", "FORBIDDEN", 403);
  }

  const catalog = await loadAssignableStaffRoles(supabase, params.tenantId);
  const currentRole = matchStaffRole(membership.role, catalog) ?? matchStaffRole(user?.role, catalog);

  if (params.action === "change_role") {
    const nextRole = matchStaffRole(params.role, catalog);
    if (!nextRole?.isAssignable || !nextRole.isStaff) {
      throw new StaffDirectoryError("Choose a role from the list.", "VALIDATION", 400);
    }
    if (currentRole?.isAdmin && !nextRole.isAdmin) {
      const remaining = await countActiveAdmins(supabase, params.tenantId, params.userId);
      if (remaining < 1) {
        throw new StaffDirectoryError("Keep at least one active admin in this organization.", "CONFLICT", 409);
      }
    }
    const dbRole = nextRole.storageKey;
    await supabase
      .from("user_roles")
      .upsert(
        { user_id: params.userId, tenant_id: params.tenantId, role: dbRole, is_active: true },
        { onConflict: "user_id,tenant_id" }
      );
    if (user?.tenant_id === params.tenantId) {
      await supabase.from("users").update({ role: dbRole }).eq("id", params.userId);
      const { data: authUser } = await supabase.auth.admin.getUserById(params.userId);
      const current = (authUser.user?.app_metadata ?? {}) as Record<string, unknown>;
      await supabase.auth.admin.updateUserById(params.userId, {
        app_metadata: {
          ...current,
          role: dbRole,
          tenant_id: params.tenantId,
          platform: NEXUS_PLATFORM,
        },
      });
    }
    await audit({
      actorUserId: params.actor.userId,
      tenantId: params.tenantId,
      action: "staff.role.changed",
      entityId: params.userId,
      metadata: { previous_role: currentRole?.key ?? null, new_role: params.role },
      request: params.request,
    });
  }

  if (params.action === "suspend") {
    if (currentRole?.isAdmin) {
      const remaining = await countActiveAdmins(supabase, params.tenantId, params.userId);
      if (remaining < 1) {
        throw new StaffDirectoryError("Keep at least one active admin in this organization.", "CONFLICT", 409);
      }
    }
    await supabase
      .from("user_roles")
      .update({ is_active: false, updated_at: nowIso() })
      .eq("user_id", params.userId)
      .eq("tenant_id", params.tenantId);
    const remainingStaff = await supabase
      .from("user_roles")
      .select("tenant_id")
      .eq("user_id", params.userId)
      .eq("is_active", true);
    if (!remainingStaff.data?.length && user?.tenant_id === params.tenantId) {
      await supabase.from("users").update({ is_active: false }).eq("id", params.userId);
      await revokeAuthSessions(supabase, params.userId);
    }
    await audit({
      actorUserId: params.actor.userId,
      tenantId: params.tenantId,
      action: "staff.access.suspended",
      entityId: params.userId,
      metadata: { previous_status: "active", new_status: "suspended" },
      request: params.request,
    });
  }

  if (params.action === "reactivate") {
    await supabase
      .from("user_roles")
      .update({ is_active: true, updated_at: nowIso() })
      .eq("user_id", params.userId)
      .eq("tenant_id", params.tenantId);
    await supabase.from("users").update({ is_active: true }).eq("id", params.userId);
    await audit({
      actorUserId: params.actor.userId,
      tenantId: params.tenantId,
      action: "staff.access.reactivated",
      entityId: params.userId,
      metadata: { previous_status: "suspended", new_status: "active" },
      request: params.request,
    });
  }

  await invalidateUserCache("users", params.userId);
  const rows = await listStaffDirectory(supabase, {
    tenantId: params.tenantId,
    actorUserId: params.actor.userId,
  });
  const row = rows.find((item) => item.userId === params.userId);
  if (!row) throw new StaffDirectoryError("Update saved but the directory could not be refreshed.", "INTERNAL", 500);
  return row;
}

export async function removeStaffMembership(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    actor: DirectoryActor;
    userId?: string | null;
    invitationId?: string | null;
    request?: Request;
  }
): Promise<void> {
  if (params.invitationId && !params.userId) {
    const { data, error } = await supabase
      .from("staff_invitations")
      .select("id, invited_user_id, email, status")
      .eq("id", params.invitationId)
      .eq("tenant_id", params.tenantId)
      .maybeSingle();
    if (error) throw new StaffDirectoryError(error.message, "INTERNAL", 500);
    if (!data) throw new StaffDirectoryError("Invitation not found.", "NOT_FOUND", 404);
    const invite = data as { id: string; invited_user_id: string | null; email: string; status: string };
    if (invite.invited_user_id) {
      return removeStaffMembership(supabase, {
        ...params,
        userId: invite.invited_user_id,
        invitationId: invite.id,
      });
    }
    await supabase
      .from("staff_invitations")
      .update({ status: "revoked", updated_at: nowIso() })
      .eq("id", invite.id);
    await audit({
      actorUserId: params.actor.userId,
      tenantId: params.tenantId,
      action: "staff.invite.revoked",
      entityId: invite.id,
      metadata: { email: normalizeTenantEmail(invite.email) },
      request: params.request,
    });
    return;
  }

  const userId = params.userId?.trim();
  if (!userId) throw new StaffDirectoryError("User is required.", "VALIDATION", 400);
  if (userId === params.actor.userId) {
    throw new StaffDirectoryError("You cannot remove your own access.", "FORBIDDEN", 403);
  }

  const { data: profile } = await supabase
    .from("users")
    .select("id, role, tenant_id, god_admin")
    .eq("id", userId)
    .maybeSingle();
  const user = profile as { id: string; role: string | null; tenant_id: string | null; god_admin?: boolean | null } | null;
  if (user?.god_admin) {
    throw new StaffDirectoryError("Platform administrators cannot be managed here.", "FORBIDDEN", 403);
  }

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();
  const membershipRole = (roleRow as { role?: string } | null)?.role;
  const catalog = await loadAssignableStaffRoles(supabase, params.tenantId);
  const effectiveRole = matchStaffRole(membershipRole, catalog) ?? matchStaffRole(user?.role, catalog);
  if (effectiveRole?.isAdmin) {
    const remaining = await countActiveAdmins(supabase, params.tenantId, userId);
    if (remaining < 1) {
      throw new StaffDirectoryError("Keep at least one active admin in this organization.", "CONFLICT", 409);
    }
  }

  await supabase.from("user_roles").delete().eq("user_id", userId).eq("tenant_id", params.tenantId);
  await supabase
    .from("staff_invitations")
    .update({ status: "revoked", updated_at: nowIso() })
    .eq("tenant_id", params.tenantId)
    .eq("invited_user_id", userId)
    .in("status", ["pending", "failed", "expired"]);

  if (user?.tenant_id === params.tenantId) {
    const { data: otherRoles } = await supabase
      .from("user_roles")
      .select("tenant_id, role")
      .eq("user_id", userId)
      .limit(1);
    const next = (otherRoles ?? [])[0] as { tenant_id?: string; role?: string } | undefined;
    if (next?.tenant_id) {
      await supabase.from("users").update({ tenant_id: next.tenant_id, role: next.role ?? "client" }).eq("id", userId);
    } else {
      await supabase.from("users").update({ is_active: false }).eq("id", userId);
      await revokeAuthSessions(supabase, userId);
    }
  }

  await invalidateUserCache("users", userId);
  await audit({
    actorUserId: params.actor.userId,
    tenantId: params.tenantId,
    action: "staff.membership.removed",
    entityId: userId,
    metadata: { previous_role: effectiveRole },
    request: params.request,
  });
}

export function staffDirectoryErrorResponse(error: unknown) {
  if (error instanceof StaffDirectoryError) {
    return { error: error.message, code: error.code, status: error.status };
  }
  console.error("[staff-directory]", error);
  return {
    error: error instanceof Error ? error.message : "Could not complete user management request.",
    code: "INTERNAL" as const,
    status: 500,
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { loadStaffRoles, staffStorageKeys } from "@/lib/admin/staff-roles";
import { invalidateUserCache } from "@/lib/cache";
import { getSupabaseUrl } from "@/lib/supabase-env";

export type CreateNotificationInput = {
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
};

export type NotificationRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  type: string | null;
  title: string | null;
  body: string | null;
  link: string | null;
  is_read: boolean;
  sent_at: string;
};

function getNotificationWriteClient(preferred?: SupabaseClient): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    return createClient(url, key);
  }
  return preferred ?? null;
}

/** Insert a single in-app notification. Failures are logged; callers should not abort business ops. */
export async function createNotification(
  supabase: SupabaseClient,
  input: CreateNotificationInput
): Promise<NotificationRow | null> {
  const userId = input.userId?.trim();
  const tenantId = input.tenantId?.trim();
  if (!userId || !tenantId || !input.title.trim()) return null;

  const writeClient = getNotificationWriteClient(supabase);
  if (!writeClient) {
    console.error("[notifications:create] No writable Supabase client configured");
    return null;
  }

  const { data, error } = await writeClient
    .from("notifications")
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      type: input.type.trim() || "general",
      title: input.title.trim().slice(0, 200),
      body: input.body?.trim() ? input.body.trim().slice(0, 500) : null,
      link: input.link?.trim() || null,
      is_read: false,
    })
    .select("id, tenant_id, user_id, type, title, body, link, is_read, sent_at")
    .maybeSingle();

  if (error) {
    console.error("[notifications:create]", error.message);
    return null;
  }

  await invalidateUserCache("admin_header_data", userId).catch(() => undefined);
  await invalidateUserCache("notifications", userId).catch(() => undefined);
  return (data as NotificationRow | null) ?? null;
}

export async function createNotificationsForUsers(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    userIds: string[];
    type: string;
    title: string;
    body?: string | null;
    link?: string | null;
  }
): Promise<number> {
  const unique = Array.from(
    new Set(params.userIds.map((id) => id.trim()).filter(Boolean))
  );
  if (!unique.length) return 0;

  let created = 0;
  for (const userId of unique) {
    const row = await createNotification(supabase, {
      tenantId: params.tenantId,
      userId,
      type: params.type,
      title: params.title,
      body: params.body,
      link: params.link,
    });
    if (row) created += 1;
  }
  return created;
}

/** Staff recipients for a tenant (users.role + user_roles), excluding given ids. */
export async function listTenantStaffUserIds(
  supabase: SupabaseClient,
  tenantId: string,
  excludeUserIds: string[] = []
): Promise<string[]> {
  const readClient = getNotificationWriteClient(supabase) ?? supabase;
  const exclude = new Set(excludeUserIds.map((id) => id.trim()).filter(Boolean));
  const ids = new Set<string>();
  let storageKeys: string[] = [];
  try {
    storageKeys = staffStorageKeys(await loadStaffRoles(readClient));
  } catch (error) {
    console.error("[notifications:list-staff:catalog]", error instanceof Error ? error.message : error);
    return [];
  }
  if (storageKeys.length === 0) return [];

  const { data: users, error: usersError } = await readClient
    .from("users")
    .select("id, role")
    .eq("tenant_id", tenantId)
    .in("role", storageKeys);

  if (usersError) {
    console.error("[notifications:list-staff:users]", usersError.message);
  } else {
    for (const row of users ?? []) {
      if (!exclude.has(String(row.id))) ids.add(String(row.id));
    }
  }

  const { data: roleRows, error: rolesError } = await readClient
    .from("user_roles")
    .select("user_id, role")
    .eq("tenant_id", tenantId)
    .in("role", storageKeys);

  if (rolesError) {
    console.error("[notifications:list-staff:roles]", rolesError.message);
  } else {
    for (const row of roleRows ?? []) {
      const userId = String(row.user_id);
      if (!exclude.has(userId)) ids.add(userId);
    }
  }

  return Array.from(ids);
}

export function supportTicketStaffLink(ticketId: string): string {
  return `/admin_recruiter/messages?tab=support&ticket=${encodeURIComponent(ticketId)}`;
}

export function supportTicketApplicantLink(ticketId: string): string {
  return `/application/applicant-dashboard/tickets?ticket=${encodeURIComponent(ticketId)}`;
}

export async function notifySupportTicketCreated(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    ticketId: string;
    subject: string;
    createdByUserId: string;
    notifyStaff?: boolean;
    notifyApplicantUserId?: string | null;
  }
): Promise<void> {
  const subject = params.subject.trim() || "Support request";

  if (params.notifyStaff !== false) {
    const staffIds = await listTenantStaffUserIds(supabase, params.tenantId, [
      params.createdByUserId,
    ]);
    await createNotificationsForUsers(supabase, {
      tenantId: params.tenantId,
      userIds: staffIds,
      type: "support_ticket_created",
      title: "New support ticket",
      body: subject,
      link: supportTicketStaffLink(params.ticketId),
    });
  }

  if (params.notifyApplicantUserId) {
    await createNotification(supabase, {
      tenantId: params.tenantId,
      userId: params.notifyApplicantUserId,
      type: "support_ticket_created",
      title: "Support ticket opened",
      body: subject,
      link: supportTicketApplicantLink(params.ticketId),
    });
  }
}

export async function notifySupportTicketReply(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    ticketId: string;
    subject: string | null;
    senderRole: "applicant" | "staff";
    senderUserId: string;
    applicantUserId: string | null;
  }
): Promise<void> {
  const subject = params.subject?.trim() || "Support ticket";

  if (params.senderRole === "applicant") {
    const staffIds = await listTenantStaffUserIds(supabase, params.tenantId, [
      params.senderUserId,
    ]);
    await createNotificationsForUsers(supabase, {
      tenantId: params.tenantId,
      userIds: staffIds,
      type: "support_ticket_reply",
      title: "New support reply",
      body: subject,
      link: supportTicketStaffLink(params.ticketId),
    });
    return;
  }

  if (params.applicantUserId && params.applicantUserId !== params.senderUserId) {
    await createNotification(supabase, {
      tenantId: params.tenantId,
      userId: params.applicantUserId,
      type: "support_ticket_reply",
      title: "Support team replied",
      body: subject,
      link: supportTicketApplicantLink(params.ticketId),
    });
  }
}

export async function notifySupportTicketClosed(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    ticketId: string;
    subject: string | null;
    applicantUserId: string | null;
    closedByUserId: string;
  }
): Promise<void> {
  if (!params.applicantUserId || params.applicantUserId === params.closedByUserId) return;

  await createNotification(supabase, {
    tenantId: params.tenantId,
    userId: params.applicantUserId,
    type: "support_ticket_closed",
    title: "Support ticket closed",
    body: params.subject?.trim() || "Your support ticket was closed.",
    link: supportTicketApplicantLink(params.ticketId),
  });
}

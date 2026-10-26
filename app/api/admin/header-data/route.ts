import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase-env";
import { getCachedStaffApiSession, getCachedStaffTenantScope } from "@/lib/auth/cached-staff-auth";
import {
  buildCacheKey,
  CACHE_TTL_SECONDS,
  getOrSetCache,
  invalidateUserCache,
} from "@/lib/cache";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { loadStaffUserProfileCached } from "@/lib/auth/staff-user-profile";
import { formatRoleLabel } from "@/lib/account/display-name";
import { loadStaffRoles } from "@/lib/admin/staff-roles";
import { randomUUID } from "crypto";

type HeaderNotification = {
  id: string;
  title: string | null;
  body: string | null;
  type: string | null;
  link: string | null;
  is_read: boolean | null;
  sent_at: string | null;
};

export type AdminHeaderDataResponse = {
  userId: string;
  displayName: string;
  role: string | null;
  roleLabel: string;
  tenantId: string | null;
  tenantName: string | null;
  avatarUrl: string | null;
  notifications: HeaderNotification[];
  unreadNotifications: number;
  correlationId: string;
};

function getServiceClient() {
  const url = getSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function isMissingColumnError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();
  return (
    error.code === "42703" ||
    (message.includes("column") && message.includes("does not exist")) ||
    message.includes("schema cache")
  );
}

async function loadNotifications(
  supabase: SupabaseClient,
  userId: string,
  correlationId: string
): Promise<{ notifications: HeaderNotification[]; unreadNotifications: number }> {
  const withLink = await supabase
    .from("notifications")
    .select("id, title, body, type, link, is_read, sent_at")
    .eq("user_id", userId)
    .order("sent_at", { ascending: false })
    .limit(20);

  let rows: Array<Record<string, unknown>> | null = null;
  let notificationsError = withLink.error;

  if (withLink.error && isMissingColumnError(withLink.error)) {
    console.warn("[admin/header-data] notifications.link unavailable; falling back", {
      correlationId,
      code: withLink.error.code,
    });
    const withoutLink = await supabase
      .from("notifications")
      .select("id, title, body, type, is_read, sent_at")
      .eq("user_id", userId)
      .order("sent_at", { ascending: false })
      .limit(20);
    rows = (withoutLink.data ?? null) as Array<Record<string, unknown>> | null;
    notificationsError = withoutLink.error;
  } else if (!withLink.error) {
    rows = (withLink.data ?? null) as Array<Record<string, unknown>> | null;
  }

  if (notificationsError) {
    console.error("[admin/header-data] notifications query failed", {
      correlationId,
      code: notificationsError.code,
      message: notificationsError.message,
    });
    return { notifications: [], unreadNotifications: 0 };
  }

  const unreadCountRes = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (unreadCountRes.error) {
    console.error("[admin/header-data] unread count failed", {
      correlationId,
      code: unreadCountRes.error.code,
      message: unreadCountRes.error.message,
    });
  }

  const notifications = (rows ?? []).map((item) => ({
    id: String(item.id),
    title: (item.title as string | null) ?? null,
    body: (item.body as string | null) ?? null,
    type: (item.type as string | null) ?? null,
    link: (item.link as string | null) ?? null,
    is_read: (item.is_read as boolean | null) ?? null,
    sent_at: (item.sent_at as string | null) ?? null,
  }));

  return {
    notifications,
    unreadNotifications: Math.max(0, unreadCountRes.count ?? 0),
  };
}

async function loadHeaderProfile(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string | null,
  correlationId: string
): Promise<{
  displayName: string;
  role: string | null;
  roleLabel: string;
  tenantName: string | null;
  avatarUrl: string | null;
}> {
  const profile = await loadStaffUserProfileCached(userId).catch((error) => {
    console.error("[admin/header-data] staff profile load failed", {
      correlationId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("first_name, last_name, email, role, tenant_id, profile_photo")
    .eq("id", userId)
    .maybeSingle();

  if (userError) {
    console.error("[admin/header-data] users row load failed", {
      correlationId,
      code: userError.code,
      message: userError.message,
    });
  }

  const resolvedTenantId =
    tenantId ??
    (typeof userRow?.tenant_id === "string" ? userRow.tenant_id : null) ??
    profile?.tenant_id ??
    null;

  let tenantName: string | null = null;
  if (resolvedTenantId) {
    const { data: tenantRow, error: tenantError } = await supabase
      .from("tenants")
      .select("name")
      .eq("id", resolvedTenantId)
      .maybeSingle();
    if (tenantError) {
      console.error("[admin/header-data] tenant name load failed", {
        correlationId,
        code: tenantError.code,
        message: tenantError.message,
      });
    } else {
      tenantName = typeof tenantRow?.name === "string" ? tenantRow.name : null;
    }
  }

  const fullName =
    [userRow?.first_name, userRow?.last_name].filter(Boolean).join(" ").trim() ||
    (typeof userRow?.email === "string" && userRow.email.trim()) ||
    "Account";

  const role =
    (typeof userRow?.role === "string" && userRow.role) ||
    profile?.role ||
    null;

  let roleLabel = formatRoleLabel(role);
  try {
    roleLabel = formatRoleLabel(role, await loadStaffRoles(supabase));
  } catch (error) {
    console.error("[admin/header-data] staff role catalog", {
      correlationId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    displayName: fullName,
    role,
    roleLabel,
    tenantName,
    avatarUrl: typeof userRow?.profile_photo === "string" ? userRow.profile_photo : null,
  };
}

export async function GET() {
  const correlationId = randomUUID();

  try {
    const auth = await getCachedStaffApiSession();
    if (auth instanceof NextResponse) return auth;

    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase service role not configured", correlationId },
        { status: 503 }
      );
    }

    const userId = auth.userId;
    let scopeKey = "all";
    let tenantId: string | null = null;
    try {
      const scope = await getCachedStaffTenantScope(auth.authUser);
      scopeKey = scope.mode === "scoped" ? scope.tenantId : "all";
      tenantId = scope.mode === "scoped" ? scope.tenantId : null;
    } catch (scopeError) {
      console.error("[admin/header-data] tenant scope failed", {
        correlationId,
        message: scopeError instanceof Error ? scopeError.message : String(scopeError),
      });
    }

    const cacheKey = buildCacheKey("admin_header_data", ["user", userId, "tenant", scopeKey], {
      v: 4,
    });

    const data = await getOrSetCache(
      cacheKey,
      async (): Promise<Omit<AdminHeaderDataResponse, "correlationId">> => {
        const [{ notifications, unreadNotifications }, profile] = await Promise.all([
          loadNotifications(supabase, userId, correlationId),
          loadHeaderProfile(supabase, userId, tenantId, correlationId),
        ]);

        return {
          userId,
          displayName: profile.displayName,
          role: profile.role,
          roleLabel: profile.roleLabel,
          tenantId,
          tenantName: profile.tenantName,
          avatarUrl: profile.avatarUrl,
          notifications,
          unreadNotifications,
        };
      },
      Math.min(CACHE_TTL_SECONDS.userScoped, 15)
    );

    return NextResponse.json({ ...data, correlationId });
  } catch (error) {
    console.error("[admin/header-data] unhandled failure", {
      correlationId,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: "Failed to fetch header data",
        correlationId,
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const correlationId = randomUUID();
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase service role not configured", correlationId },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    notificationId?: string;
  };

  if (body.action === "mark_notification_read") {
    const notificationId = body.notificationId?.trim();
    if (!notificationId) {
      return NextResponse.json(
        { error: "notificationId is required.", correlationId },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("user_id", auth.userId)
      .eq("is_read", false)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[admin/header-data] mark read failed", {
        correlationId,
        code: error.code,
        message: error.message,
      });
      return NextResponse.json(
        { error: "Failed to update notification", correlationId },
        { status: 500 }
      );
    }

    await invalidateUserCache("admin_header_data", auth.userId);
    await invalidateUserCache("notifications", auth.userId);
    return NextResponse.json({ ok: true, updated: Boolean(data), correlationId });
  }

  if (body.action === "mark_notifications_read") {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", auth.userId)
      .eq("is_read", false);

    if (error) {
      console.error("[admin/header-data] mark all read failed", {
        correlationId,
        code: error.code,
        message: error.message,
      });
      return NextResponse.json(
        { error: "Failed to update notifications", correlationId },
        { status: 500 }
      );
    }

    await invalidateUserCache("admin_header_data", auth.userId);
    await invalidateUserCache("notifications", auth.userId);
    return NextResponse.json({ ok: true, correlationId });
  }

  if (body.action === "clear_notifications" || body.action === "clear_all_notifications") {
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("user_id", auth.userId);

    if (error) {
      console.error("[admin/header-data] clear notifications failed", {
        correlationId,
        code: error.code,
        message: error.message,
      });
      return NextResponse.json(
        { error: "Failed to clear notifications", correlationId },
        { status: 500 }
      );
    }

    await invalidateUserCache("admin_header_data", auth.userId);
    await invalidateUserCache("notifications", auth.userId);
    return NextResponse.json({ ok: true, correlationId });
  }

  return NextResponse.json({ error: "Unsupported action", correlationId }, { status: 400 });
}

export async function DELETE(request: Request) {
  const correlationId = randomUUID();
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase service role not configured", correlationId },
      { status: 503 }
    );
  }

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("user_id", auth.userId);

  if (error) {
    console.error("[admin/header-data] delete notifications failed", {
      correlationId,
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      { error: "Failed to clear notifications", correlationId },
      { status: 500 }
    );
  }

  await invalidateUserCache("admin_header_data", auth.userId);
  await invalidateUserCache("notifications", auth.userId);
  return NextResponse.json({ ok: true, correlationId });
}

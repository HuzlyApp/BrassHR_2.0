import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireStaffApiSession, type StaffApiAuthContext } from "@/lib/auth/api-session";
import { requireUserManagement } from "@/lib/auth/user-management";
import { RESERVED_ROLE_KEYS, roleKeyFromLabel, type StoredGrant } from "@/lib/auth/permission-catalog";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadStaffRoles, matchStaffRole } from "@/lib/admin/staff-roles";

export const runtime = "nodejs";

type PermissionBody = {
  resourceKey?: unknown;
  canView?: unknown;
  canEdit?: unknown;
  canDelete?: unknown;
};

type RoleBody = {
  label?: unknown;
  description?: unknown;
  permissions?: unknown;
};

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

async function editableResourceKeys(supabase: SupabaseClient): Promise<Set<string> | null> {
  const { data, error } = await supabase
    .from("permission_resources")
    .select("key, always_granted")
    .eq("always_granted", false);
  if (error) return null;
  const keys = new Set(((data ?? []) as { key?: string }[]).map((row) => String(row.key ?? "")).filter(Boolean));
  return keys.size ? keys : null;
}

function readPermissions(value: unknown, allowed: Set<string>): Array<{ resourceKey: string } & StoredGrant> | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  const grants = [];
  for (const item of value as PermissionBody[]) {
    const resourceKey = typeof item?.resourceKey === "string" ? item.resourceKey.trim() : "";
    if (!allowed.has(resourceKey) || seen.has(resourceKey)) return null;
    seen.add(resourceKey);
    grants.push({
      resourceKey,
      canView: item.canView === true,
      canEdit: item.canEdit === true,
      canDelete: item.canDelete === true,
    });
  }
  for (const key of allowed) {
    if (!seen.has(key)) grants.push({ resourceKey: key, canView: false, canEdit: false, canDelete: false });
  }
  return grants;
}

async function countUsers(supabase: SupabaseClient, tenantId: string): Promise<Map<string, number> | null> {
  const [{ data: roles, error: roleError }, catalog] = await Promise.all([
    supabase.from("user_roles").select("role, is_active").eq("tenant_id", tenantId),
    loadStaffRoles(supabase).catch(() => null),
  ]);
  if (roleError || !catalog) return null;
  const counts = new Map<string, number>();
  for (const row of (roles ?? []) as { role?: string | null; is_active?: boolean | null }[]) {
    if (row.is_active === false) continue;
    const matched = matchStaffRole(row.role, catalog);
    const key = matched?.key ?? (typeof row.role === "string" ? row.role.trim().toLowerCase() : "");
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export async function GET() {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const forbidden = await requireUserManagement(auth, "view");
  if (forbidden) return forbidden;

  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Forbidden", detail: "Permission data unavailable" }, { status: 403 });

  try {
    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "Forbidden", detail: "Insufficient permission" }, { status: 403 });

    const [{ data: roles, error: roleError }, { data: resources, error: resourceError }, { data: grants, error: grantError }, counts] =
      await Promise.all([
        supabase
          .from("tenant_roles")
          .select("role_key, label, description, is_system, is_admin")
          .eq("tenant_id", tenantId)
          .order("is_system", { ascending: false })
          .order("label", { ascending: true }),
        supabase
          .from("permission_resources")
          .select("key, label, description, kind, sort_order, always_granted")
          .eq("always_granted", false)
          .order("sort_order", { ascending: true }),
        supabase
          .from("tenant_role_permissions")
          .select("role_key, resource_key, can_view, can_edit, can_delete")
          .eq("tenant_id", tenantId),
        countUsers(supabase, tenantId),
      ]);
    if (roleError || resourceError || grantError || !counts) {
      return NextResponse.json({ error: "Forbidden", detail: "Permission data unavailable" }, { status: 403 });
    }

    const permissionsByRole = new Map<string, Array<{ resourceKey: string; canView: boolean; canEdit: boolean; canDelete: boolean }>>();
    for (const row of (grants ?? []) as {
      role_key: string;
      resource_key: string;
      can_view?: boolean;
      can_edit?: boolean;
      can_delete?: boolean;
    }[]) {
      const list = permissionsByRole.get(row.role_key) ?? [];
      list.push({
        resourceKey: row.resource_key,
        canView: row.can_view === true,
        canEdit: row.can_edit === true,
        canDelete: row.can_delete === true,
      });
      permissionsByRole.set(row.role_key, list);
    }

    return NextResponse.json({
      roles: ((roles ?? []) as {
        role_key: string;
        label: string;
        description?: string | null;
        is_system?: boolean;
        is_admin?: boolean;
      }[]).map((role) => ({
        roleKey: role.role_key,
        label: role.label,
        description: role.description ?? "",
        isSystem: role.is_system === true,
        isAdmin: role.is_admin === true,
        userCount: counts.get(role.role_key) ?? 0,
        permissions: permissionsByRole.get(role.role_key) ?? [],
      })),
      resources: ((resources ?? []) as {
        key: string;
        label: string;
        description?: string | null;
        kind: string;
        sort_order?: number;
      }[]).map((resource) => ({
        key: resource.key,
        label: resource.label,
        description: resource.description ?? "",
        kind: resource.kind,
        sortOrder: Number(resource.sort_order ?? 0),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Forbidden", detail: "Permission data unavailable" }, { status: 403 });
  }
}

async function tenantForWrite(auth: StaffApiAuthContext) {
  const forbidden = await requireUserManagement(auth, "edit");
  if (forbidden) return { error: forbidden };
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return {
      error: NextResponse.json({ error: "Forbidden", detail: "Permission data unavailable" }, { status: 403 }),
    };
  }
  const tenantId = await resolveStaffTenantId(supabase, auth);
  if (!tenantId) {
    return { error: NextResponse.json({ error: "Forbidden", detail: "Insufficient permission" }, { status: 403 }) };
  }
  return { supabase, tenantId };
}

export async function POST(request: Request) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const ready = await tenantForWrite(auth);
  if ("error" in ready) return ready.error;
  const { supabase, tenantId } = ready;

  const body = (await request.json().catch(() => null)) as RoleBody | null;
  const label = cleanText(body?.label, 80);
  const description = cleanText(body?.description, 240);
  const roleKey = roleKeyFromLabel(label);
  if (!label || !roleKey || RESERVED_ROLE_KEYS.has(roleKey)) {
    return NextResponse.json({ error: "Enter a role name that is not already reserved." }, { status: 400 });
  }

  const allowed = await editableResourceKeys(supabase);
  if (!allowed) return NextResponse.json({ error: "Forbidden", detail: "Permission data unavailable" }, { status: 403 });
  const permissions = readPermissions(body?.permissions, allowed);
  if (!permissions) return NextResponse.json({ error: "Permissions are invalid." }, { status: 400 });

  const { error: insertError } = await supabase.from("tenant_roles").insert({
    tenant_id: tenantId,
    role_key: roleKey,
    label,
    description,
    is_system: false,
    is_admin: false,
  });
  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "A role with that name already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Forbidden", detail: "Permission data unavailable" }, { status: 403 });
  }

  const { error: grantError } = await supabase.from("tenant_role_permissions").insert(
    permissions.map((permission) => ({
      tenant_id: tenantId,
      role_key: roleKey,
      resource_key: permission.resourceKey,
      can_view: permission.canView,
      can_edit: permission.canEdit,
      can_delete: permission.canDelete,
    }))
  );
  if (grantError) {
    await supabase.from("tenant_roles").delete().eq("tenant_id", tenantId).eq("role_key", roleKey);
    return NextResponse.json({ error: "Forbidden", detail: "Permission data unavailable" }, { status: 403 });
  }

  return NextResponse.json({ ok: true, roleKey });
}

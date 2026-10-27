import { NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { requireUserManagement } from "@/lib/auth/user-management";
import type { StoredGrant } from "@/lib/auth/permission-catalog";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadStaffRoles, matchStaffRole } from "@/lib/admin/staff-roles";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ roleKey: string }> };

type PermissionBody = {
  resourceKey?: unknown;
  canView?: unknown;
  canEdit?: unknown;
  canDelete?: unknown;
};

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

async function readPermissions(
  supabase: ReturnType<typeof createServiceRoleClient>,
  value: unknown
): Promise<Array<{ resourceKey: string } & StoredGrant> | null> {
  if (!supabase || !Array.isArray(value)) return null;
  const { data, error } = await supabase.from("permission_resources").select("key").eq("always_granted", false);
  if (error || !data?.length) return null;
  const allowed = new Set((data as { key: string }[]).map((row) => row.key));
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

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const forbidden = await requireUserManagement(auth, "edit");
  if (forbidden) return forbidden;

  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Forbidden", detail: "Permission data unavailable" }, { status: 403 });
  const tenantId = await resolveStaffTenantId(supabase, auth);
  if (!tenantId) return NextResponse.json({ error: "Forbidden", detail: "Insufficient permission" }, { status: 403 });

  const { roleKey } = await context.params;
  const key = roleKey?.trim().toLowerCase() ?? "";
  const { data: existing, error: existingError } = await supabase
    .from("tenant_roles")
    .select("role_key, is_system, is_admin")
    .eq("tenant_id", tenantId)
    .eq("role_key", key)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: "Forbidden", detail: "Permission data unavailable" }, { status: 403 });
  if (!existing) return NextResponse.json({ error: "Role not found." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as {
    label?: unknown;
    description?: unknown;
    permissions?: unknown;
  } | null;
  const label = cleanText(body?.label, 80);
  const description = cleanText(body?.description, 240);
  const permissions = await readPermissions(supabase, body?.permissions);
  if (!label || !permissions) return NextResponse.json({ error: "Role details are invalid." }, { status: 400 });

  const role = existing as { is_admin?: boolean; is_system?: boolean };
  const company = permissions.find((permission) => permission.resourceKey === "settings_company");
  if (role.is_admin && role.is_system && (!company?.canView || !company.canEdit)) {
    return NextResponse.json(
      { error: "The admin role must keep access to edit company settings." },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabase
    .from("tenant_roles")
    .update({ label, description })
    .eq("tenant_id", tenantId)
    .eq("role_key", key);
  if (updateError) return NextResponse.json({ error: "Forbidden", detail: "Permission data unavailable" }, { status: 403 });

  const { error: deleteError } = await supabase
    .from("tenant_role_permissions")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("role_key", key);
  if (deleteError) return NextResponse.json({ error: "Forbidden", detail: "Permission data unavailable" }, { status: 403 });

  const { error: insertError } = await supabase.from("tenant_role_permissions").insert(
    permissions.map((permission) => ({
      tenant_id: tenantId,
      role_key: key,
      resource_key: permission.resourceKey,
      can_view: permission.canView,
      can_edit: permission.canEdit,
      can_delete: permission.canDelete,
    }))
  );
  if (insertError) return NextResponse.json({ error: "Forbidden", detail: "Permission data unavailable" }, { status: 403 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const forbidden = await requireUserManagement(auth, "delete");
  if (forbidden) return forbidden;

  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Forbidden", detail: "Permission data unavailable" }, { status: 403 });
  const tenantId = await resolveStaffTenantId(supabase, auth);
  if (!tenantId) return NextResponse.json({ error: "Forbidden", detail: "Insufficient permission" }, { status: 403 });

  const { roleKey } = await context.params;
  const key = roleKey?.trim().toLowerCase() ?? "";
  const { data: existing, error: existingError } = await supabase
    .from("tenant_roles")
    .select("role_key, is_system")
    .eq("tenant_id", tenantId)
    .eq("role_key", key)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: "Forbidden", detail: "Permission data unavailable" }, { status: 403 });
  if (!existing) return NextResponse.json({ error: "Role not found." }, { status: 404 });
  if ((existing as { is_system?: boolean }).is_system) {
    return NextResponse.json({ error: "System roles cannot be deleted." }, { status: 400 });
  }

  const catalog = await loadStaffRoles(supabase);
  const { data: members, error: memberError } = await supabase
    .from("user_roles")
    .select("role, is_active")
    .eq("tenant_id", tenantId);
  if (memberError) return NextResponse.json({ error: "Forbidden", detail: "Permission data unavailable" }, { status: 403 });
  const assigned = ((members ?? []) as { role?: string | null; is_active?: boolean | null }[]).some((row) => {
    if (row.is_active === false) return false;
    const matched = matchStaffRole(row.role, catalog);
    return (matched?.key ?? row.role?.trim().toLowerCase()) === key;
  });
  if (assigned) return NextResponse.json({ error: "Reassign users before deleting this role." }, { status: 409 });

  const { error } = await supabase.from("tenant_roles").delete().eq("tenant_id", tenantId).eq("role_key", key);
  if (error) return NextResponse.json({ error: "Forbidden", detail: "Permission data unavailable" }, { status: 403 });
  return NextResponse.json({ ok: true });
}

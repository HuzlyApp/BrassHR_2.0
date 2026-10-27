import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isGodAdminUser } from "@/lib/auth/god-admin";
import {
  GOD_ADMIN_API_PREFIXES,
  SHELL_API_PREFIXES,
  actionForMethod,
  grantAllows,
  matchPrefixedKey,
  pathMatchesPrefix,
  type PermissionAction,
  type StoredGrant,
} from "@/lib/auth/permission-catalog";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AccessDenialCode = "not_staff" | "denied" | "unavailable";

export type AccessDecision =
  | { ok: true }
  | {
      ok: false;
      status: 401 | 403;
      error: "Unauthorized" | "Forbidden";
      detail: string;
      code: AccessDenialCode;
    };

type ResourceRow = {
  key: string;
  page_prefixes: string[] | null;
  api_prefixes: string[] | null;
  always_granted: boolean | null;
};

type AliasRow = {
  key: string;
  storage_key: string;
  aliases: string[] | null;
};

function forbidden(detail: string, code: AccessDenialCode = "denied"): Extract<AccessDecision, { ok: false }> {
  return { ok: false, status: 403, error: "Forbidden", detail, code };
}

function normalizeId(value: string | null | undefined): string | null {
  const token = value?.trim().toLowerCase() ?? "";
  return UUID_RE.test(token) ? token : null;
}

function tenantIdFromUser(user: User): string | null {
  const metadata = user.app_metadata as Record<string, unknown> | undefined;
  return normalizeId(metadata?.tenant_id == null ? null : String(metadata.tenant_id));
}

function sameId(left: string | null, right: string | null): boolean {
  return Boolean(left && right && left === right);
}

async function userIsGodAdmin(supabase: SupabaseClient, user: User): Promise<boolean | "error"> {
  if (isGodAdminUser(user)) return true;
  const { data, error } = await supabase.from("users").select("god_admin").eq("id", user.id).maybeSingle();
  if (error) return "error";
  return (data as { god_admin?: boolean } | null)?.god_admin === true;
}

async function loadResources(supabase: SupabaseClient): Promise<ResourceRow[] | null> {
  const { data, error } = await supabase
    .from("permission_resources")
    .select("key, page_prefixes, api_prefixes, always_granted")
    .order("sort_order", { ascending: true });
  if (error || !data?.length) return null;
  return data as ResourceRow[];
}

function classifyLoaded(pathname: string, resources: ResourceRow[]): {
  kind: "shell" | "god_only" | "resource" | "unmapped";
  resourceKey?: string;
  alwaysGranted?: boolean;
} {
  const path = pathname.split("?")[0] || "/";
  if (GOD_ADMIN_API_PREFIXES.some((prefix) => pathMatchesPrefix(path, prefix))) return { kind: "god_only" };
  if (SHELL_API_PREFIXES.some((prefix) => pathMatchesPrefix(path, prefix))) return { kind: "shell" };
  const resourceKey = matchPrefixedKey(
    path,
    resources.map((resource) => ({
      key: resource.key,
      prefixes: path.startsWith("/api/") ? (resource.api_prefixes ?? []) : (resource.page_prefixes ?? []),
    }))
  );
  if (!resourceKey) return { kind: "unmapped" };
  const row = resources.find((resource) => resource.key === resourceKey);
  return { kind: "resource", resourceKey, alwaysGranted: row?.always_granted === true };
}

async function resolveTenantId(
  supabase: SupabaseClient,
  user: User,
  tenantSlug: string | null,
  profileTenantId: string | null
): Promise<string | null> {
  const jwtTenantId = tenantIdFromUser(user);
  const slug = tenantSlug?.trim().toLowerCase() ?? "";
  const safeSlug = /^[a-z0-9-]{2,63}$/.test(slug) ? slug : "";
  if (safeSlug) {
    const { data, error } = await supabase
      .from("tenants")
      .select("id")
      .or(`slug.eq.${safeSlug},subdomain.eq.${safeSlug}`)
      .eq("is_active", true)
      .maybeSingle();
    if (error) return null;
    const fromSlug = normalizeId((data as { id?: string } | null)?.id ?? null);
    if (fromSlug && (sameId(jwtTenantId, fromSlug) || sameId(profileTenantId, fromSlug))) return fromSlug;
    if (fromSlug) {
      const { data: memberships, error: memberError } = await supabase
        .from("user_roles")
        .select("tenant_id, role, is_active")
        .eq("user_id", user.id)
        .eq("tenant_id", fromSlug);
      if (memberError) return null;
      const member = (memberships ?? []).some((row: { role?: string | null; is_active?: boolean | null }) => {
        return row.is_active !== false && typeof row.role === "string" && row.role.trim().length > 0;
      });
      if (member) return fromSlug;
    }
  }
  return jwtTenantId ?? profileTenantId;
}

function canonicalRoleKey(raw: string | null | undefined, aliases: AliasRow[], tenantRoleKeys: Set<string>): string | null {
  if (typeof raw !== "string") return null;
  const token = raw.trim().toLowerCase();
  if (!token || token === "worker") return null;
  if (tenantRoleKeys.has(token)) return token;
  const match = aliases.find(
    (row) =>
      row.key === token ||
      row.storage_key === token ||
      (Array.isArray(row.aliases) && row.aliases.map((alias) => alias.toLowerCase()).includes(token))
  );
  return match?.key ?? null;
}

async function loadGrant(
  supabase: SupabaseClient,
  tenantId: string,
  roleKey: string,
  resourceKey: string
): Promise<StoredGrant | null | "error"> {
  const { data, error } = await supabase
    .from("tenant_role_permissions")
    .select("can_view, can_edit, can_delete")
    .eq("tenant_id", tenantId)
    .eq("role_key", roleKey)
    .eq("resource_key", resourceKey)
    .maybeSingle();
  if (error) return "error";
  if (!data) return null;
  const row = data as { can_view?: boolean; can_edit?: boolean; can_delete?: boolean };
  return {
    canView: row.can_view === true,
    canEdit: row.can_edit === true,
    canDelete: row.can_delete === true,
  };
}

export async function authorizeStaffHttpAccess(input: {
  user: User;
  pathname: string;
  method: string;
  tenantSlug?: string | null;
  viewAsTenantId?: string | null;
}): Promise<AccessDecision> {
  const supabase = createServiceRoleClient();
  if (!supabase) return forbidden("Permission data unavailable", "unavailable");

  const godAdmin = await userIsGodAdmin(supabase, input.user);
  if (godAdmin === "error") return forbidden("Permission data unavailable", "unavailable");
  if (godAdmin) return { ok: true };

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("tenant_id, role, is_active")
    .eq("id", input.user.id)
    .maybeSingle();
  if (profileError) return forbidden("Permission data unavailable", "unavailable");
  const profileRow = profile as { tenant_id?: string | null; role?: string | null; is_active?: boolean | null } | null;
  if (profileRow?.is_active === false) return forbidden("This account has been disabled.");

  const resources = await loadResources(supabase);
  if (!resources) return forbidden("Permission data unavailable", "unavailable");

  const classified = classifyLoaded(input.pathname, resources);
  if (classified.kind === "god_only") return forbidden("Insufficient permission");
  if (classified.kind === "unmapped") return forbidden("Insufficient permission");

  const tenantId = await resolveTenantId(
    supabase,
    input.user,
    input.tenantSlug ?? null,
    normalizeId(profileRow?.tenant_id ?? null)
  );
  if (!tenantId) return forbidden("Insufficient permission");

  const [{ data: aliasData, error: aliasError }, { data: roleData, error: roleError }, { data: membership, error: membershipError }] =
    await Promise.all([
      supabase.from("staff_roles").select("key, storage_key, aliases").eq("is_active", true),
      supabase.from("tenant_roles").select("role_key").eq("tenant_id", tenantId),
      supabase
        .from("user_roles")
        .select("role, is_active")
        .eq("user_id", input.user.id)
        .eq("tenant_id", tenantId)
        .maybeSingle(),
    ]);
  if (aliasError || roleError || membershipError) return forbidden("Permission data unavailable", "unavailable");

  const tenantRoleKeys = new Set(
    ((roleData ?? []) as { role_key?: string }[]).map((row) => String(row.role_key ?? "").toLowerCase()).filter(Boolean)
  );
  const membershipRole = (membership as { role?: string | null; is_active?: boolean | null } | null)?.is_active === false
    ? null
    : (membership as { role?: string | null } | null)?.role;
  const rawRole = membershipRole ?? (sameId(normalizeId(profileRow?.tenant_id ?? null), tenantId) ? profileRow?.role : null);
  const roleKey = canonicalRoleKey(rawRole, (aliasData ?? []) as AliasRow[], tenantRoleKeys);
  if (!roleKey || !tenantRoleKeys.has(roleKey)) return forbidden("Insufficient permission", "not_staff");

  if (classified.kind === "shell" || classified.alwaysGranted) return { ok: true };

  const action: PermissionAction = actionForMethod(input.method);
  const grant = await loadGrant(supabase, tenantId, roleKey, classified.resourceKey ?? "");
  if (grant === "error") return forbidden("Permission data unavailable", "unavailable");
  if (!grantAllows(grant, action)) return forbidden("Insufficient permission");
  return { ok: true };
}

/** Grants for the signed-in user. Tenant and role come from the server session, not the client. */
export async function loadSessionGrants(input: {
  user: User;
  tenantSlug?: string | null;
}): Promise<
  | { ok: true; godAdmin: boolean; grants: Array<{ key: string } & StoredGrant> }
  | Extract<AccessDecision, { ok: false }>
> {
  const supabase = createServiceRoleClient();
  if (!supabase) return forbidden("Permission data unavailable", "unavailable");

  const godAdmin = await userIsGodAdmin(supabase, input.user);
  if (godAdmin === "error") return forbidden("Permission data unavailable", "unavailable");

  const resources = await loadResources(supabase);
  if (!resources) return forbidden("Permission data unavailable", "unavailable");
  if (godAdmin) {
    return {
      ok: true,
      godAdmin: true,
      grants: resources.map((resource) => ({
        key: resource.key,
        canView: true,
        canEdit: true,
        canDelete: true,
      })),
    };
  }

  const opened = await authorizeStaffHttpAccess({
    user: input.user,
    pathname: "/api/admin/access",
    method: "GET",
    tenantSlug: input.tenantSlug,
  });
  if (!opened.ok) return opened;

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", input.user.id)
    .maybeSingle();
  if (profileError) return forbidden("Permission data unavailable", "unavailable");
  const profileRow = profile as { tenant_id?: string | null; role?: string | null } | null;
  const tenantId = await resolveTenantId(
    supabase,
    input.user,
    input.tenantSlug ?? null,
    normalizeId(profileRow?.tenant_id ?? null)
  );
  if (!tenantId) return forbidden("Insufficient permission");

  const [{ data: aliasData, error: aliasError }, { data: roleData, error: roleError }, { data: membership, error: membershipError }] =
    await Promise.all([
      supabase.from("staff_roles").select("key, storage_key, aliases").eq("is_active", true),
      supabase.from("tenant_roles").select("role_key").eq("tenant_id", tenantId),
      supabase.from("user_roles").select("role, is_active").eq("user_id", input.user.id).eq("tenant_id", tenantId).maybeSingle(),
    ]);
  if (aliasError || roleError || membershipError) return forbidden("Permission data unavailable", "unavailable");

  const tenantRoleKeys = new Set(
    ((roleData ?? []) as { role_key?: string }[]).map((row) => String(row.role_key ?? "").toLowerCase()).filter(Boolean)
  );
  const membershipRole =
    (membership as { is_active?: boolean | null } | null)?.is_active === false
      ? null
      : (membership as { role?: string | null } | null)?.role;
  const roleKey = canonicalRoleKey(
    membershipRole ?? (sameId(normalizeId(profileRow?.tenant_id ?? null), tenantId) ? profileRow?.role : null),
    (aliasData ?? []) as AliasRow[],
    tenantRoleKeys
  );
  if (!roleKey) return forbidden("Insufficient permission", "not_staff");

  const { data: ownGrants, error: ownError } = await supabase
    .from("tenant_role_permissions")
    .select("resource_key, can_view, can_edit, can_delete")
    .eq("tenant_id", tenantId)
    .eq("role_key", roleKey);
  if (ownError) return forbidden("Permission data unavailable", "unavailable");

  const grantMap = new Map(
    ((ownGrants ?? []) as { resource_key: string; can_view?: boolean; can_edit?: boolean; can_delete?: boolean }[]).map(
      (row) => [row.resource_key, row]
    )
  );

  return {
    ok: true,
    godAdmin: false,
    grants: resources.map((resource) => {
      if (resource.always_granted) return { key: resource.key, canView: true, canEdit: true, canDelete: true };
      const row = grantMap.get(resource.key);
      return {
        key: resource.key,
        canView: row?.can_view === true,
        canEdit: row?.can_edit === true,
        canDelete: row?.can_delete === true,
      };
    }),
  };
}

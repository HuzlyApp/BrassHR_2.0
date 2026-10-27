import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { StaffApiAuthContext } from "@/lib/auth/api-session";
import { authorizeStaffHttpAccess } from "@/lib/auth/module-access.server";
import type { PermissionAction } from "@/lib/auth/permission-catalog";
import { ONBOARDING_TENANT_SLUG_COOKIE } from "@/lib/tenant/constants";

/** Company-settings edit is a stored grant. A role name by itself does not grant it. */
export function canManageStaffUsers(
  auth: Pick<StaffApiAuthContext, "godAdmin" | "devBypass">,
  companySettings: { canEdit: boolean } | null
): boolean {
  if (auth.godAdmin || auth.devBypass) return true;
  return companySettings?.canEdit === true;
}

export async function requireUserManagement(
  auth: StaffApiAuthContext,
  action: PermissionAction = "edit"
): Promise<NextResponse | null> {
  if (auth.godAdmin || auth.devBypass) return null;
  const method = action === "view" ? "GET" : action === "delete" ? "DELETE" : "POST";
  const jar = await cookies();
  const decision = await authorizeStaffHttpAccess({
    user: auth.authUser,
    pathname: "/api/admin/users",
    method,
    tenantSlug: jar.get(ONBOARDING_TENANT_SLUG_COOKIE)?.value ?? null,
  });
  if (decision.ok) return null;
  return NextResponse.json(
    { error: decision.error, detail: decision.detail || "You do not have permission to manage users." },
    { status: decision.status }
  );
}

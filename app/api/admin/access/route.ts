import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { loadSessionGrants } from "@/lib/auth/module-access.server";
import { ONBOARDING_TENANT_SLUG_COOKIE } from "@/lib/tenant/constants";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const jar = await cookies();
  const result = await loadSessionGrants({
    user: auth.authUser,
    tenantSlug: jar.get(ONBOARDING_TENANT_SLUG_COOKIE)?.value ?? null,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, detail: result.detail }, { status: result.status });
  }
  return NextResponse.json({
    godAdmin: result.godAdmin,
    grants: result.grants,
    viewKeys: result.grants.filter((grant) => grant.canView).map((grant) => grant.key),
  });
}

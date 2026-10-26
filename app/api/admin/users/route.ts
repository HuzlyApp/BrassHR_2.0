import { NextRequest, NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { requireUserManagement } from "@/lib/auth/user-management";
import { inviteStaff, listStaffDirectory, staffDirectoryErrorResponse } from "@/lib/admin/staff-directory";
import { loadStaffRoles } from "@/lib/admin/staff-roles";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import { isAllowedAppOrigin, resolveAppOrigin } from "@/lib/resolve-app-origin";
import { enforceRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const forbidden = requireUserManagement(auth);
  if (forbidden) return forbidden;

  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "Select a tenant before managing users." }, { status: 400 });
    const users = await listStaffDirectory(supabase, { tenantId, actorUserId: auth.userId });
    let roles: Array<{ key: string; label: string; isAdmin: boolean }> = [];
    try {
      roles = (await loadStaffRoles(supabase))
        .filter((role) => role.isStaff && role.isAssignable)
        .map((role) => ({ key: role.key, label: role.label, isAdmin: role.isAdmin }));
    } catch (error) {
      console.error("[admin/users] staff role catalog", error instanceof Error ? error.message : error);
    }
    return NextResponse.json({ users, roles, canManage: true });
  } catch (error) {
    const mapped = staffDirectoryErrorResponse(error);
    return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const forbidden = requireUserManagement(auth);
  if (forbidden) return forbidden;

  const limited = await enforceRateLimit(req, {
    namespace: "staff-invite",
    key: `${auth.userId}:${getClientIp(req)}`,
    limit: Number(process.env.RATE_LIMIT_STAFF_INVITE_PER_15_MIN ?? 8),
    windowMs: 15 * 60 * 1000,
    failClosed: true,
  });
  if (limited) return limited;

  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "Select a tenant before managing users." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const clientOrigin = typeof body?.origin === "string" ? body.origin : null;
    const appOrigin = resolveAppOrigin(req, clientOrigin);
    if (!appOrigin || !isAllowedAppOrigin(appOrigin)) {
      return NextResponse.json({ error: "Invalid redirect origin for invitation." }, { status: 400 });
    }

    const result = await inviteStaff(supabase, {
      tenantId,
      actor: { userId: auth.userId, email: auth.email },
      appOrigin,
      input: body,
      request: req,
    });

    return NextResponse.json(
      {
        ok: true,
        user: result.row,
        existingAccount: result.existingAccount,
      },
      { status: 201 }
    );
  } catch (error) {
    const mapped = staffDirectoryErrorResponse(error);
    return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status });
  }
}

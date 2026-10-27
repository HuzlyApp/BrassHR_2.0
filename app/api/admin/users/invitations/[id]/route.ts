import { NextRequest, NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { requireUserManagement } from "@/lib/auth/user-management";
import { removeStaffMembership, resendStaffInvitation, staffDirectoryErrorResponse } from "@/lib/admin/staff-directory";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import { isAllowedAppOrigin, resolveAppOrigin } from "@/lib/resolve-app-origin";
import { enforceRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const forbidden = await requireUserManagement(auth, "edit");
  if (forbidden) return forbidden;

  const limited = await enforceRateLimit(req, {
    namespace: "staff-invite-resend",
    key: `${auth.userId}:${getClientIp(req)}`,
    limit: Number(process.env.RATE_LIMIT_STAFF_INVITE_RESEND_PER_15_MIN ?? 8),
    windowMs: 15 * 60 * 1000,
    failClosed: true,
  });
  if (limited) return limited;

  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Invitation is required." }, { status: 400 });

    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "Select a tenant before managing users." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { origin?: unknown } | null;
    const clientOrigin = typeof body?.origin === "string" ? body.origin : null;
    const appOrigin = resolveAppOrigin(req, clientOrigin);
    if (!appOrigin || !isAllowedAppOrigin(appOrigin)) {
      return NextResponse.json({ error: "Invalid redirect origin for invitation." }, { status: 400 });
    }

    const user = await resendStaffInvitation(supabase, {
      tenantId,
      actor: { userId: auth.userId, email: auth.email },
      invitationId: id,
      appOrigin,
      request: req,
    });

    return NextResponse.json({ ok: true, user });
  } catch (error) {
    const mapped = staffDirectoryErrorResponse(error);
    return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const forbidden = await requireUserManagement(auth, "delete");
  if (forbidden) return forbidden;

  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Invitation is required." }, { status: 400 });

    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "Select a tenant before managing users." }, { status: 400 });

    await removeStaffMembership(supabase, {
      tenantId,
      actor: { userId: auth.userId, email: auth.email },
      invitationId: id,
      request: req,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const mapped = staffDirectoryErrorResponse(error);
    return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status });
  }
}

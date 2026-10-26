import { NextRequest, NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { requireUserManagement } from "@/lib/auth/user-management";
import {
  removeStaffMembership,
  staffDirectoryErrorResponse,
  updateStaffMembership,
} from "@/lib/admin/staff-directory";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ userId: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const forbidden = requireUserManagement(auth);
  if (forbidden) return forbidden;

  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const { userId } = await context.params;
    if (!userId) return NextResponse.json({ error: "User is required." }, { status: 400 });

    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "Select a tenant before managing users." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { action?: unknown; role?: unknown } | null;
    const action = body?.action;
    if (action !== "change_role" && action !== "suspend" && action !== "reactivate") {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }
    const user = await updateStaffMembership(supabase, {
      tenantId,
      actor: { userId: auth.userId, email: auth.email },
      userId,
      action,
      role: action === "change_role" && typeof body?.role === "string" ? body.role : undefined,
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
  const forbidden = requireUserManagement(auth);
  if (forbidden) return forbidden;

  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const { userId } = await context.params;
    if (!userId) return NextResponse.json({ error: "User is required." }, { status: 400 });

    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "Select a tenant before managing users." }, { status: 400 });

    await removeStaffMembership(supabase, {
      tenantId,
      actor: { userId: auth.userId, email: auth.email },
      userId,
      request: req,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const mapped = staffDirectoryErrorResponse(error);
    return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status });
  }
}

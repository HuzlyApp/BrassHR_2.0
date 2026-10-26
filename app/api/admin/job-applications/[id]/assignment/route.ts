import { NextRequest, NextResponse } from "next/server";
import { loadStaffRoles, matchStaffRole } from "@/lib/admin/staff-roles";
import { writeActivityLog } from "@/lib/audit/activity-log";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { syncAssigneeFromApplication } from "@/lib/candidates/sync-recruiter-assignment";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const tenantId = await resolveStaffTenantId(supabase, auth).catch(() => null);
  if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });

  const { id } = await context.params;
  const body = (await req.json().catch(() => ({}))) as { assignedRecruiterUserId?: string | null };
  const assigned =
    typeof body.assignedRecruiterUserId === "string" && body.assignedRecruiterUserId.trim()
      ? body.assignedRecruiterUserId.trim()
      : null;

  if (assigned) {
    const { data: member } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", assigned)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const catalog = await loadStaffRoles(supabase);
    if (!member || matchStaffRole(member.role, catalog)?.isStaff !== true) {
      return NextResponse.json(
        { error: "Assigned user must be a staff member for this tenant." },
        { status: 400 }
      );
    }
  }

  const syncResult = await syncAssigneeFromApplication(supabase, {
    tenantId,
    applicationId: id,
    assignedRecruiterUserId: assigned,
  });
  if (syncResult.error === "Application not found") {
    return NextResponse.json({ error: syncResult.error }, { status: 404 });
  }
  if (syncResult.error) {
    return NextResponse.json({ error: syncResult.error }, { status: 500 });
  }

  let assignedRecruiter: { id: string; name: string } | null = null;
  if (syncResult.assignedRecruiterUserId) {
    const { data: user } = await supabase
      .from("users")
      .select("id, first_name, last_name, email")
      .eq("id", syncResult.assignedRecruiterUserId)
      .maybeSingle();
    if (user) {
      assignedRecruiter = {
        id: String(user.id),
        name:
          `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() ||
          String(user.email ?? "").trim() ||
          "Team member",
      };
    }
  }

  void writeActivityLog({
    actorUserId: auth.devBypass ? null : auth.userId,
    action: "job_application.recruiter_assigned",
    entityType: "job_application",
    entityId: id,
    tenantId,
    request: req,
    metadata: {
      assignedRecruiterUserId: assigned,
      workerId: syncResult.workerId,
      syncedWorker: Boolean(syncResult.workerId),
    },
  });

  return NextResponse.json({
    ok: true,
    assignedRecruiterUserId: syncResult.assignedRecruiterUserId,
    assignedRecruiter,
  });
}

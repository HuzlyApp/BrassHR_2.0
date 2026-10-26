import { NextRequest, NextResponse } from "next/server";
import { resolveStaffProfilePhotoUrl } from "@/lib/account/staff-profile-photo";
import { loadStaffRoles, matchStaffRole } from "@/lib/admin/staff-roles";
import { writeActivityLog } from "@/lib/audit/activity-log";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { syncAssigneeFromWorker } from "@/lib/candidates/sync-recruiter-assignment";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ workerId: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const tenantId = await resolveStaffTenantId(supabase, auth).catch(() => null);
  if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });

  const { workerId } = await context.params;
  if (!workerId?.trim()) {
    return NextResponse.json({ error: "Missing workerId" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { assignedRecruiterUserId?: string | null };
  const assigned =
    typeof body.assignedRecruiterUserId === "string" && body.assignedRecruiterUserId.trim()
      ? body.assignedRecruiterUserId.trim()
      : null;

  if (assigned) {
    const { data: member } = await supabase
      .from("users")
      .select("id, role, first_name, last_name, email")
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

  const { data: worker, error: workerErr } = await supabase
    .from("worker")
    .select("id, tenant_id")
    .eq("id", workerId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (workerErr) return NextResponse.json({ error: workerErr.message }, { status: 500 });
  if (!worker) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

  const syncResult = await syncAssigneeFromWorker(supabase, {
    tenantId,
    workerId,
    assignedRecruiterUserId: assigned,
  });
  if (syncResult.error) {
    return NextResponse.json({ error: syncResult.error }, { status: 500 });
  }

  let assignedRecruiter: { id: string; name: string; profilePhotoUrl: string | null } | null = null;
  if (assigned) {
    const { data: user } = await supabase
      .from("users")
      .select("id, first_name, last_name, email, profile_photo")
      .eq("id", assigned)
      .maybeSingle();
    if (user) {
      assignedRecruiter = {
        id: String(user.id),
        name:
          `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() ||
          String(user.email ?? "").trim() ||
          "Team member",
        profilePhotoUrl: await resolveStaffProfilePhotoUrl(supabase, user.profile_photo),
      };
    }
  }

  void writeActivityLog({
    actorUserId: auth.devBypass ? null : auth.userId,
    action: "worker.recruiter_assigned",
    entityType: "worker",
    entityId: workerId,
    tenantId,
    request: req,
    metadata: { assignedRecruiterUserId: assigned, syncedApplications: true },
  });

  return NextResponse.json({
    ok: true,
    assignedRecruiterUserId: assigned,
    assignedRecruiter,
  });
}

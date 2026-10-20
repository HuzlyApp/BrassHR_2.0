import { NextRequest, NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import {
  ApplicationStatusError,
  changeApplicationStatus,
  changeApplicationStatusBySystemKey,
} from "@/lib/jobs/application-statuses";
import {
  isApplicationPipelineStatus,
  type ApplicationPipelineStatus,
} from "@/lib/jobs/application-status";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import { JOB_APPLICATION_APPLICANT_EMBED } from "@/lib/jobs/application-applicant-display";
import { guardJobApplicationStatusChange } from "@/lib/jobs/msp-submission-service";
import { resolveApplicantEmailAppOrigin } from "@/lib/resolve-app-origin";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * PATCH — update application status.
 * Preferred: { statusId, note? }
 * Legacy: { status: pipelineKey, note? }
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });

    const { id } = await context.params;
    const applicationId = id?.trim();
    if (!applicationId) {
      return NextResponse.json({ error: "Application id is required" }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as {
      status?: unknown;
      statusId?: unknown;
      note?: unknown;
    } | null;

    const note =
      typeof body?.note === "string"
        ? body.note
        : body?.note === null
          ? null
          : undefined;
    const statusId = typeof body?.statusId === "string" ? body.statusId.trim() : "";
    const status =
      typeof body?.status === "string" ? body.status.trim().toLowerCase() : "";
    const origin = resolveApplicantEmailAppOrigin(req);

    if (statusId || isApplicationPipelineStatus(status)) {
      await guardJobApplicationStatusChange(supabase, {
        tenantId,
        applicationId,
        statusId: statusId || undefined,
        systemKey: statusId ? undefined : status,
      });
    }

    let result;
    if (statusId) {
      result = await changeApplicationStatus(supabase, {
        tenantId,
        applicationId,
        statusId,
        changedByUserId: auth.userId,
        note,
        origin,
      });
    } else if (isApplicationPipelineStatus(status)) {
      result = await changeApplicationStatusBySystemKey(supabase, {
        tenantId,
        applicationId,
        systemKey: status as ApplicationPipelineStatus,
        changedByUserId: auth.userId,
        note,
        origin,
      });
    } else {
      return NextResponse.json({ error: "Invalid application status" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("job_applications")
      .select(
        "id, status, status_id, workflow_phase, post_hire_activated_at, created_at, submitted_at, updated_at, job_requisition_id, workflow_id, applicant_workflow_instance_id, worker_id"
      )
      .eq("id", applicationId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Application not found" }, { status: 404 });

    return NextResponse.json({
      application: data,
      unchanged: result.unchanged,
      history: result.history,
      statusName: result.application.statusName,
    });
  } catch (error) {
    if (error instanceof ApplicationStatusError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update application" },
      { status: 500 }
    );
  }
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });

    const { id } = await context.params;
    const applicationId = id?.trim();
    if (!applicationId) {
      return NextResponse.json({ error: "Application id is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("job_applications")
      .select(
        `id, status, status_id, workflow_phase, post_hire_activated_at, created_at, submitted_at, updated_at, job_requisition_id, workflow_id, applicant_workflow_instance_id, worker_id, job_requisitions(public_title, source_type, location, facility, facility_name, professions(name)), onboarding_flows(name), ${JOB_APPLICATION_APPLICANT_EMBED}`
      )
      .eq("id", applicationId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Application not found" }, { status: 404 });

    return NextResponse.json({ application: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load application" },
      { status: 500 }
    );
  }
}

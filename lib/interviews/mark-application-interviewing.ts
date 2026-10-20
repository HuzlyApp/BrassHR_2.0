import type { SupabaseClient } from "@supabase/supabase-js";
import {
  changeApplicationStatus,
  changeApplicationStatusBySystemKey,
  getStatusBySystemKey,
} from "@/lib/jobs/application-statuses";
import type { ApplicationPipelineStatus } from "@/lib/jobs/application-status";

const INTERVIEWING_STATUS: ApplicationPipelineStatus = "interviewing";

async function resolveInterviewScheduledTarget(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ id: string; name?: string | null } | null> {
  const byKey = await getStatusBySystemKey(supabase, tenantId, INTERVIEWING_STATUS);
  const byKeyName = (byKey?.name ?? "").trim().toLowerCase();
  if (byKey && byKeyName !== "interview complete" && byKeyName !== "interview completed") {
    return byKey;
  }

  // If system_key was mapped to "Interview Complete", look up active status by name "Interview Scheduled"
  const { data: byName } = await supabase
    .from("application_statuses")
    .select("id, name, is_active")
    .eq("tenant_id", tenantId)
    .ilike("name", "interview scheduled")
    .eq("is_active", true)
    .maybeSingle();

  if (byName) return byName;
  return byKey;
}

/**
 * Mark a job application as interviewing (Interview Scheduled).
 * Requires applicationId, or (workerId + jobId). Never falls back to "latest application by worker".
 * Writes status history via change_job_application_status RPC.
 */
export async function markApplicationInterviewing(params: {
  supabase: SupabaseClient;
  tenantId: string;
  workerId: string;
  applicationId?: string | null;
  jobId?: string | null;
  changedByUserId?: string | null;
}): Promise<{ updated: boolean; applicationId: string | null }> {
  const explicitApplicationId = params.applicationId?.trim() || null;

  let applicationId = explicitApplicationId;

  if (!applicationId) {
    if (!params.jobId?.trim()) {
      return { updated: false, applicationId: null };
    }

    const { data: appRow, error: findError } = await params.supabase
      .from("job_applications")
      .select("id")
      .eq("tenant_id", params.tenantId)
      .eq("job_requisition_id", params.jobId.trim())
      .eq("worker_id", params.workerId)
      .not("status", "in", '("rejected","withdrawn")')
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError) throw findError;
    applicationId = appRow?.id ?? null;
    if (!applicationId) {
      return { updated: false, applicationId: null };
    }
  }

  const target = await resolveInterviewScheduledTarget(params.supabase, params.tenantId);

  let result;
  if (target) {
    result = await changeApplicationStatus(params.supabase, {
      tenantId: params.tenantId,
      applicationId,
      statusId: target.id,
      changedByUserId: params.changedByUserId ?? null,
      note: "Interview scheduled",
    });
  } else {
    result = await changeApplicationStatusBySystemKey(params.supabase, {
      tenantId: params.tenantId,
      applicationId,
      systemKey: INTERVIEWING_STATUS,
      changedByUserId: params.changedByUserId ?? null,
      note: "Interview scheduled",
    });
  }

  return {
    updated: !result.unchanged,
    applicationId,
  };
}

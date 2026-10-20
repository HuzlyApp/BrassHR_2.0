import type { SupabaseClient } from "@supabase/supabase-js";

const INACTIVE_APPLICATION_STATUSES = '("rejected","withdrawn","archived")';

export type InferredApplicantJob = { jobToken: string; applicationId: string };

/**
 * Job token for an applicant session that arrived without one: the requested application, or the
 * applicant's only active application. Several active applications are ambiguous and yield null.
 */
export async function inferApplicantJobToken(
  supabase: SupabaseClient,
  params: { tenantId: string; workerId: string; userId?: string | null; applicationId?: string | null }
): Promise<InferredApplicantJob | null> {
  const ownerFilter = params.userId
    ? `worker_id.eq.${params.workerId},applicant_auth_user_id.eq.${params.userId}`
    : `worker_id.eq.${params.workerId}`;

  let query = supabase
    .from("job_applications")
    .select("id, job_requisition_id")
    .eq("tenant_id", params.tenantId)
    .or(ownerFilter)
    .not("status", "in", INACTIVE_APPLICATION_STATUSES)
    .limit(2);
  const applicationId = params.applicationId?.trim();
  if (applicationId) query = query.eq("id", applicationId);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; job_requisition_id: string | null }>;
  if (rows.length !== 1 || !rows[0].job_requisition_id) return null;

  const { data: job, error: jobError } = await supabase
    .from("job_requisitions")
    .select("public_job_token")
    .eq("id", rows[0].job_requisition_id)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();
  if (jobError) throw jobError;
  const jobToken = String((job as { public_job_token?: string | null } | null)?.public_job_token ?? "").trim();
  return jobToken ? { jobToken, applicationId: String(rows[0].id) } : null;
}

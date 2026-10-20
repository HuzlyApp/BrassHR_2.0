import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseApplicantLifecyclePhase,
  type ApplicantLifecyclePhase,
} from "@/lib/onboarding/workflow-phase";
import { normalizeJobToken } from "@/lib/jobs/public-application-routing";

export type ApplicationWorkflowPhaseRecord = {
  applicationId: string;
  tenantId: string;
  workerId: string | null;
  applicantAuthUserId: string | null;
  jobRequisitionId: string | null;
  status: string | null;
  phase: ApplicantLifecyclePhase;
  postHireActivatedAt: string | null;
  postHireActivationEmailSentAt: string | null;
  hiredAt: string | null;
  postHireSuspendedAt: string | null;
};

type ApplicationPhaseRow = {
  id: string;
  tenant_id: string;
  worker_id: string | null;
  applicant_auth_user_id?: string | null;
  job_requisition_id: string | null;
  status: string | null;
  workflow_phase?: string | null;
  post_hire_activated_at?: string | null;
  post_hire_activation_email_sent_at?: string | null;
  hired_at?: string | null;
  post_hire_suspended_at?: string | null;
};

const PHASE_SELECT =
  "id, tenant_id, worker_id, applicant_auth_user_id, job_requisition_id, status, workflow_phase, post_hire_activated_at, post_hire_activation_email_sent_at, hired_at, post_hire_suspended_at";
const FALLBACK_SELECT = "id, tenant_id, worker_id, applicant_auth_user_id, job_requisition_id, status";

function toRecord(row: ApplicationPhaseRow): ApplicationWorkflowPhaseRecord {
  return {
    applicationId: String(row.id),
    tenantId: String(row.tenant_id),
    workerId: row.worker_id ? String(row.worker_id) : null,
    applicantAuthUserId: row.applicant_auth_user_id ? String(row.applicant_auth_user_id) : null,
    jobRequisitionId: row.job_requisition_id ? String(row.job_requisition_id) : null,
    status: row.status ? String(row.status) : null,
    phase: parseApplicantLifecyclePhase(row.workflow_phase),
    postHireActivatedAt: row.post_hire_activated_at ?? null,
    postHireActivationEmailSentAt: row.post_hire_activation_email_sent_at ?? null,
    hiredAt: row.hired_at ?? null,
    postHireSuspendedAt: row.post_hire_suspended_at ?? null,
  };
}

function isMissingColumnError(error: { message?: string; code?: string } | null): boolean {
  const message = String(error?.message ?? "");
  return error?.code === "42703" || /workflow_phase|post_hire_activated_at|hired_at|post_hire_suspended_at|does not exist/i.test(message);
}

async function loadWorkerAuthUserId(
  supabase: SupabaseClient,
  tenantId: string,
  workerId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("worker")
    .select("user_id")
    .eq("id", workerId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  const userId = (data as { user_id?: string | null } | null)?.user_id;
  return userId ? String(userId) : null;
}

/** Applications started under another worker row still belong to the same signed-in applicant. */
function applicationBelongsToApplicant(
  record: ApplicationWorkflowPhaseRecord,
  workerId: string,
  authUserId: string | null
): boolean {
  if (!record.workerId || record.workerId === workerId) return true;
  return Boolean(authUserId && record.applicantAuthUserId === authUserId);
}

async function maybeSingleApplication(
  query: PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>
): Promise<ApplicationPhaseRow | null> {
  const { data, error } = await query;
  if (error) throw error;
  return (data as ApplicationPhaseRow | null) ?? null;
}

export async function loadApplicationWorkflowPhase(
  supabase: SupabaseClient,
  params: { tenantId: string; applicationId: string }
): Promise<ApplicationWorkflowPhaseRecord | null> {
  const primary = await supabase
    .from("job_applications")
    .select(PHASE_SELECT)
    .eq("id", params.applicationId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();

  if (primary.error && isMissingColumnError(primary.error)) {
    const fallback = await supabase
      .from("job_applications")
      .select(FALLBACK_SELECT)
      .eq("id", params.applicationId)
      .eq("tenant_id", params.tenantId)
      .maybeSingle();
    const row = await maybeSingleApplication(Promise.resolve(fallback));
    return row ? toRecord(row) : null;
  }

  const row = await maybeSingleApplication(Promise.resolve(primary));
  return row ? toRecord(row) : null;
}

/**
 * Resolve the job application whose workflow phase should gate this applicant session.
 * Never falls back to "the worker's first application".
 */
export async function resolveApplicationWorkflowPhase(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    workerId?: string | null;
    applicationId?: string | null;
    jobToken?: string | null;
  }
): Promise<ApplicationWorkflowPhaseRecord | null> {
  const applicationId = params.applicationId?.trim() || "";
  const workerId = params.workerId?.trim() || "";
  if (applicationId) {
    const row = await loadApplicationWorkflowPhase(supabase, {
      tenantId: params.tenantId,
      applicationId,
    });
    if (!row) return null;
    if (workerId && row.workerId && row.workerId !== workerId) {
      const authUserId = await loadWorkerAuthUserId(supabase, params.tenantId, workerId);
      if (!applicationBelongsToApplicant(row, workerId, authUserId)) return null;
    }
    return row;
  }

  const jobToken = normalizeJobToken(params.jobToken ?? null);
  if (!jobToken || !workerId) return null;

  const { data: job, error: jobError } = await supabase
    .from("job_requisitions")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("public_job_token", jobToken)
    .maybeSingle();
  if (jobError) throw jobError;
  if (!job?.id) return null;

  const authUserId = await loadWorkerAuthUserId(supabase, params.tenantId, workerId);
  const ownerFilter = authUserId
    ? `worker_id.eq.${workerId},applicant_auth_user_id.eq.${authUserId}`
    : `worker_id.eq.${workerId}`;

  const primary = await supabase
    .from("job_applications")
    .select(PHASE_SELECT)
    .eq("tenant_id", params.tenantId)
    .eq("job_requisition_id", job.id)
    .or(ownerFilter)
    .not("status", "in", '("rejected","withdrawn","archived")')
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (primary.error && isMissingColumnError(primary.error)) {
    const fallback = await supabase
      .from("job_applications")
      .select(FALLBACK_SELECT)
      .eq("tenant_id", params.tenantId)
      .eq("job_requisition_id", job.id)
      .or(ownerFilter)
      .not("status", "in", '("rejected","withdrawn","archived")')
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = await maybeSingleApplication(Promise.resolve(fallback));
    return row ? toRecord(row) : null;
  }

  const row = await maybeSingleApplication(Promise.resolve(primary));
  return row ? toRecord(row) : null;
}

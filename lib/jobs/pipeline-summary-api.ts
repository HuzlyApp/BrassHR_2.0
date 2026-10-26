import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import {
  loadConvertedIdentitiesForApplications,
  withoutConvertedWorkerApplications,
} from "@/lib/admin/converted-worker-identities";
import {
  tallyJobPipelineSummary,
  type JobPipelineSummary,
  type JobPipelineSummaryRow,
} from "@/lib/jobs/pipeline-summary";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const PIPELINE_APPLICATION_SELECT =
  "id, worker_id, status, status_id, application_statuses!status_id(system_key, name)";

type PipelineApplicationRow = JobPipelineSummaryRow & {
  id?: string | null;
  worker_id?: string | null;
};

/** Applications that still appear on the Job candidates list for this job. */
export async function loadVisibleJobApplications(
  supabase: SupabaseClient,
  tenantId: string,
  jobId: string
): Promise<PipelineApplicationRow[]> {
  const { data, error } = await supabase
    .from("job_applications")
    .select(PIPELINE_APPLICATION_SELECT)
    .eq("job_requisition_id", jobId)
    .eq("tenant_id", tenantId);
  if (error) throw error;
  const applications = (data ?? []) as PipelineApplicationRow[];
  const identities = await loadConvertedIdentitiesForApplications(supabase, applications);
  return withoutConvertedWorkerApplications(applications, identities);
}

export async function loadJobPipelineSummaryForStaff(
  supabase: SupabaseClient,
  tenantId: string,
  jobId: string
): Promise<JobPipelineSummary | { error: string; status: number }> {
  const { data: job, error: jobError } = await supabase
    .from("job_requisitions")
    .select("id, source_type")
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (jobError) throw jobError;
  if (!job) return { error: "Job not found", status: 404 };

  const applications = await loadVisibleJobApplications(supabase, tenantId, jobId);

  const showSubmission =
    String(job.source_type ?? "")
      .trim()
      .toLowerCase() === "msp";

  return tallyJobPipelineSummary(applications ?? [], { showSubmission });
}

export async function getJobPipelineSummaryResponse(
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });

    const { id } = await context.params;
    const result = await loadJobPipelineSummaryForStaff(supabase, tenantId, id);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load pipeline summary" },
      { status: 500 }
    );
  }
}

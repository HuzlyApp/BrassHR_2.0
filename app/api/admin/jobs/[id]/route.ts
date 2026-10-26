import { NextRequest, NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import {
  jobScreeningQuestionToInput,
  loadJobScreeningQuestions,
} from "@/lib/jobs/screening-questions";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { buildPublicJobSharePath } from "@/lib/jobs/public-job-share";
import { isOpenJobRequisitionStatus, normalizeJobRequisitionStatus } from "@/lib/jobs/job-status";
import { loadVisibleJobApplications } from "@/lib/jobs/pipeline-summary-api";
import {
  jobDetailsStatsFromPipelineSummary,
  tallyJobPipelineSummary,
} from "@/lib/jobs/pipeline-summary";
import { JobValidationError, jobValidationHttpStatus } from "@/lib/jobs/types";
import { parseJobRequisitionPatch, normalizeJobTags } from "@/lib/jobs/job-requisition-patch";
import { patchJobRequisition } from "@/lib/jobs/service";
import { createPerfTimer, logPerf } from "@/lib/perf";

export const runtime = "nodejs";

const JOB_DETAILS_SELECT = [
  "id",
  "status",
  "public_title",
  "source_type",
  "source_job_title",
  "location",
  "facility",
  "facility_name",
  "postal_code",
  "worksite_city",
  "worksite_state",
  "worksite_postal_code",
  "published_at",
  "created_at",
  "public_description",
  "responsibilities",
  "qualifications",
  "benefits",
  "schedule",
  "location_type",
  "pay_rate_min",
  "pay_rate_max",
  "pay_rate_period",
  "rate_unit",
  "pay_rate",
  "required_credentials",
  "special_requirements",
  "public_job_token",
  "application_deadline",
  "workflow_id",
  "workflow_assignment_mode",
  "workflow_assignment_error",
  "msp_name",
  "msp_client",
  "msp_client_name",
  "tags",
  "assigned_recruiter_user_id",
  "is_hot",
  "onboarding_flows!workflow_id(id, name)",
].join(", ");

type JobRequisitionRow = {
  source_type?: string | null;
  public_job_token?: string | null;
  status?: string | null;
  tags?: unknown;
  assigned_recruiter_user_id?: string | null;
  is_hot?: boolean | null;
};

function formatApiError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const timer = createPerfTimer();
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });
    const { id } = await context.params;
    const detailsView = new URL(req.url).searchParams.get("view") === "details";
    const jobSelect = detailsView
      ? JOB_DETAILS_SELECT
      : "*, onboarding_flows!workflow_id(id, name)";

    const [
      { data: job, error: jobError },
      { data: tenant, error: tenantError },
      applications,
      screeningQuestionRows,
    ] = await Promise.all([
      supabase
        .from("job_requisitions")
        .select(jobSelect)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      supabase
        .from("tenants")
        .select("id, slug, subdomain, name")
        .eq("id", tenantId)
        .maybeSingle(),
      loadVisibleJobApplications(supabase, tenantId, id),
      detailsView
        ? Promise.resolve([])
        : loadJobScreeningQuestions(supabase, tenantId, id),
    ]);

    if (jobError) throw jobError;
    if (tenantError) throw tenantError;
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const jobRow = job as unknown as JobRequisitionRow & Record<string, unknown>;

    const showSubmission =
      String(jobRow.source_type ?? "")
        .trim()
        .toLowerCase() === "msp";

    const pipelineSummary = tallyJobPipelineSummary(applications ?? [], {
      showSubmission,
    });
    const stats = jobDetailsStatsFromPipelineSummary(pipelineSummary);

    const tenantSlug = String(tenant?.slug ?? tenant?.subdomain ?? "")
      .trim()
      .toLowerCase();
    const publicToken =
      typeof jobRow.public_job_token === "string" ? jobRow.public_job_token.trim() : "";
    const publicJobPath =
      isOpenJobRequisitionStatus(String(jobRow.status ?? "")) && publicToken && tenantSlug
        ? buildPublicJobSharePath(tenantSlug, publicToken)
        : null;

    logPerf("jobs.details.load", {
      totalMs: timer.elapsedMs(),
      jobId: id,
      tenantId,
      detailsView,
      applications: (applications ?? []).length,
    });

    return NextResponse.json({
      job: {
        ...jobRow,
        status: normalizeJobRequisitionStatus(String(jobRow.status ?? "")),
        tags: normalizeJobTags(jobRow.tags),
        assigned_recruiter_user_id: jobRow.assigned_recruiter_user_id ?? null,
        is_hot: Boolean(jobRow.is_hot),
      },
      tenant: tenant
        ? {
            id: String(tenant.id),
            slug: tenantSlug,
            name: String(tenant.name ?? ""),
          }
        : null,
      publicJobPath,
      screeningQuestions: screeningQuestionRows.map(jobScreeningQuestionToInput),
      stats,
      pipelineSummary,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load job" },
      { status: 500 }
    );
  }
}

/**
 * FSD PUT /api/requisitions/{id} — partial update: status, assignee, tags, is_hot.
 * Admin path: PUT /api/admin/jobs/{id}
 */
export async function PUT(
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
    const body = await req.json().catch(() => null);
    const patch = parseJobRequisitionPatch(body);
    const job = await patchJobRequisition(supabase, tenantId, auth.userId, id, patch);
    return NextResponse.json({ job });
  } catch (error) {
    if (error instanceof JobValidationError) {
      return NextResponse.json(
        { error: error.message, code: error.code, fieldErrors: error.fieldErrors },
        { status: jobValidationHttpStatus(error) }
      );
    }
    return NextResponse.json(
      { error: formatApiError(error, "Failed to update job") },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { JobValidationError, jobValidationHttpStatus, JOB_STATUSES, type JobStatus } from "@/lib/jobs/types";
import { jobMutationSchema } from "@/lib/jobs/validation";
import {
  bulkDeleteJobRequisitions,
  listInternalJobs,
  listJobPickerOptions,
  openJobRequisition,
  parseBulkDeleteIds,
  publishExistingJob,
  saveJobRequisition,
  transitionJobStatus,
  unarchiveJobRequisition,
} from "@/lib/jobs/service";
import { normalizeJobRequisitionStatus } from "@/lib/jobs/job-status";
import { parseScreeningQuestionsFromBody } from "@/lib/jobs/screening-questions";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { countUniqueActiveCandidateProfiles } from "@/lib/workers/count-unique-active-candidate-profiles";
import { TenantWaitlistedError } from "@/lib/service-area/errors";
import { isServiceAreaValidationCode } from "@/lib/service-area/http";
import { serviceAreaMessage } from "@/lib/service-area/copy";

export const runtime = "nodejs";
/** Background Quick Match after a job-description edit runs in `after()` on this route. */
export const maxDuration = 300;

function formatApiError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const record = error as { message?: unknown; details?: unknown; hint?: unknown };
    const parts = [record.message, record.details, record.hint]
      .map((part) => (typeof part === "string" ? part.trim() : ""))
      .filter(Boolean);
    if (parts.length) return parts.join(" — ");
  }
  return fallback;
}

const STATUS_FILTER_VALUES = new Set([
  "draft",
  "open",
  "published",
  "paused",
  "filled",
  "closed",
  "archived",
]);

function parseJobStatusFilter(value: string | null): JobStatus | undefined {
  if (!value || !STATUS_FILTER_VALUES.has(value)) return undefined;
  return normalizeJobRequisitionStatus(value);
}

function parseTargetJobStatus(raw: unknown): JobStatus | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (!(JOB_STATUSES as readonly string[]).includes(trimmed) && trimmed !== "published") {
    return null;
  }
  return normalizeJobRequisitionStatus(trimmed);
}

export async function GET(req: NextRequest) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });

    if (req.nextUrl.searchParams.get("fields") === "picker") {
      const jobs = await listJobPickerOptions(supabase, tenantId);
      return NextResponse.json({ jobs });
    }

    const status = parseJobStatusFilter(req.nextUrl.searchParams.get("status"));
    const [jobs, tenantResult, totalCandidateCount] = await Promise.all([
      listInternalJobs(supabase, tenantId, {
        status,
        professionId: req.nextUrl.searchParams.get("professionId") || undefined,
        employmentType: req.nextUrl.searchParams.get("employmentType") || undefined,
        createdBy: req.nextUrl.searchParams.get("createdBy") || undefined,
      }),
      supabase.from("tenants").select("slug, subdomain").eq("id", tenantId).maybeSingle(),
      countUniqueActiveCandidateProfiles(supabase, tenantId),
    ]);
    if (tenantResult.error) throw tenantResult.error;
    const tenantSlug = String(tenantResult.data?.slug ?? tenantResult.data?.subdomain ?? "")
      .trim()
      .toLowerCase();
    return NextResponse.json({
      jobs,
      tenantId,
      tenantSlug: tenantSlug || null,
      totalCandidateCount,
    });
  } catch (error) {
    return NextResponse.json(
      { error: formatApiError(error, "Failed to load jobs") },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const raw = await req.json().catch(() => null);
  const rawRecord = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const action = typeof rawRecord.action === "string" ? rawRecord.action : "";
  const jobId = typeof rawRecord.jobId === "string" ? rawRecord.jobId.trim() : "";

  try {
    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });

    if (
      (action === "unpublish" ||
        action === "close" ||
        action === "archive" ||
        action === "unarchive" ||
        action === "pause" ||
        action === "resume" ||
        action === "fill" ||
        action === "set_status") &&
      !jobId
    ) {
      return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
    }

    const hasJobPayload = rawRecord.job != null && typeof rawRecord.job === "object";

    // List-page republish: action=publish + jobId, no job body.
    // Create/edit "Save and Publish": action=publish + job body (+ optional jobId).
    if (action === "publish" && !hasJobPayload) {
      if (!jobId) {
        return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
      }
      const result = await publishExistingJob(supabase, tenantId, auth.userId, jobId);
      return NextResponse.json({ job: result });
    }

    if (action === "unarchive") {
      const result = await unarchiveJobRequisition(supabase, tenantId, auth.userId, jobId);
      return NextResponse.json({ job: result });
    }

    if (action === "set_status") {
      const target = parseTargetJobStatus(rawRecord.status);
      if (!target) {
        return NextResponse.json({ error: "Valid status is required" }, { status: 400 });
      }
      if (target === "open") {
        const result = await openJobRequisition(supabase, tenantId, auth.userId, jobId);
        return NextResponse.json({ job: result });
      }
      const result = await transitionJobStatus(supabase, tenantId, auth.userId, jobId, target);
      return NextResponse.json({ job: result });
    }

    if (
      action === "unpublish" ||
      action === "close" ||
      action === "archive" ||
      action === "pause" ||
      action === "resume" ||
      action === "fill"
    ) {
      if (action === "resume") {
        const result = await openJobRequisition(supabase, tenantId, auth.userId, jobId);
        return NextResponse.json({ job: result });
      }
      const status: JobStatus =
        action === "unpublish"
          ? "draft"
          : action === "close"
            ? "closed"
            : action === "archive"
              ? "archived"
              : action === "pause"
                ? "paused"
                : "filled";
      const result = await transitionJobStatus(supabase, tenantId, auth.userId, jobId, status);
      return NextResponse.json({ job: result });
    }

    const parsed = jobMutationSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid job requisition", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const result = await saveJobRequisition(supabase, tenantId, auth.userId, parsed.data.job, {
      jobId: jobId || undefined,
      publish: parsed.data.action === "publish",
      confirmRoutingChange: rawRecord.confirmRoutingChange === true,
      resetToAutomatic: rawRecord.resetToAutomatic === true,
      overrideWorkflowId:
        typeof rawRecord.overrideWorkflowId === "string"
          ? rawRecord.overrideWorkflowId.trim() || null
          : rawRecord.overrideWorkflowId === null
            ? null
            : undefined,
      screeningQuestions: parseScreeningQuestionsFromBody(rawRecord.screeningQuestions),
    });
    return NextResponse.json(result, { status: jobId ? 200 : 201 });
  } catch (error) {
    if (error instanceof JobValidationError) {
      const field = Object.keys(error.fieldErrors)[0] || "location";
      const messageKey = isServiceAreaValidationCode(error.code)
        ? "location_not_enabled"
        : undefined;
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          messageKey,
          field,
          fieldErrors: error.fieldErrors,
        },
        { status: jobValidationHttpStatus(error) }
      );
    }
    if (error instanceof TenantWaitlistedError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          messageKey: "signup_waitlist",
          field: "worksite_state",
          fieldErrors: { location: serviceAreaMessage("signup_waitlist") },
        },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { error: formatApiError(error, "Failed to save job") },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
    const ids = parseBulkDeleteIds(body?.ids);
    if (!ids.length) {
      return NextResponse.json({ error: "At least one job id is required" }, { status: 400 });
    }

    const { deletedIds } = await bulkDeleteJobRequisitions(supabase, tenantId, ids);
    if (!deletedIds.length) {
      return NextResponse.json({ error: "No jobs were deleted" }, { status: 404 });
    }

    return NextResponse.json({ deletedIds, count: deletedIds.length });
  } catch (error) {
    return NextResponse.json(
      { error: formatApiError(error, "Failed to delete jobs") },
      { status: 500 }
    );
  }
}

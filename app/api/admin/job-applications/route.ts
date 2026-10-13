import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { createAdminJobApplication, bulkDeleteJobApplications, deleteOrphanWorkersAfterApplicationDelete, parseBulkDeleteIds } from "@/lib/jobs/service";
import { JobValidationError } from "@/lib/jobs/types";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import {
  JOB_APPLICATION_APPLICANT_EMBED,
  resolveApplicationApplicantEmail,
  resolveApplicationApplicantName,
  resolveApplicationWorkerId,
  type ApplicationApplicantSource,
} from "@/lib/jobs/application-applicant-display";
import {
  loadTenantConvertedWorkerIdentities,
  isConvertedWorkerOrApplication,
} from "@/lib/admin/converted-worker-identities";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadStaffUsersByIds } from "@/lib/account/resolve-staff-users";
import { isUuid } from "@/lib/validation/uuid";
import { JOB_CANDIDATE_LIST_HIDDEN_STATUS_IN_FILTER } from "@/lib/jobs/application-status";
import { WORKER_RESUMES_BUCKET } from "@/lib/supabase-storage-buckets";
import { buildWorkerResumeFileName, splitFullName } from "@/lib/resume/worker-resume-file-name";
import {
  listingCountsForAnalyzedApplication,
  loadRequirementOutcomeCountsByApplication,
} from "@/lib/jobs/match-analysis/load-requirement-outcome-counts";
import {
  filterWorkerIdsMatchingSkills,
  parseSkillsFilterParam,
} from "@/lib/jobs/application-skills-filter";
import { loadStaffApplicationPage } from "@/lib/admin/load-staff-application-page";

export const runtime = "nodejs";

const MAX_RESUME_BYTES = Number(process.env.MAX_RESUME_UPLOAD_BYTES ?? 10 * 1024 * 1024);
const ALLOWED_RESUME_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function formatApiError(error: unknown, fallback: string): string {
  if (error instanceof JobValidationError) return error.message;
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

export async function GET(req: NextRequest) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const db = supabase;

  try {
    const tenantId = await resolveStaffTenantId(db, auth);
    if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });

    const listParams = req.nextUrl.searchParams;
    if (
      listParams.has("page") ||
      listParams.get("idsOnly") === "1" ||
      listParams.get("export") === "1"
    ) {
      const body = await loadStaffApplicationPage(db, tenantId, listParams);
      return NextResponse.json(body);
    }

    const jobId = req.nextUrl.searchParams.get("jobId")?.trim();
    const workerId = req.nextUrl.searchParams.get("workerId")?.trim();
    const rawStatusId = req.nextUrl.searchParams.get("statusId")?.trim();
    const statusId = rawStatusId && isUuid(rawStatusId) ? rawStatusId : "";
    const matchScore = req.nextUrl.searchParams.get("matchScore")?.trim();
    const skillsFilter = parseSkillsFilterParam(req.nextUrl.searchParams.get("skills"));

    const sortBy = req.nextUrl.searchParams.get("sortBy")?.trim();
    const ascending = req.nextUrl.searchParams.get("sortDir") === "asc";
    const PAGE_SIZE = 1000;

    const applicationSelect = `id, status, status_id, workflow_phase, post_hire_activated_at, created_at, submitted_at, updated_at, job_requisition_id, workflow_id, applicant_workflow_instance_id, worker_id, assigned_recruiter_user_id, ai_match_status, ai_match_score, ai_match_category, ai_match_action, ai_match_readiness, ai_match_display_category, ai_match_stage, ai_analyzed_at, ai_analysis_error, ai_analysis_progress, application_statuses(id, name, system_key, color), job_requisitions(public_title, profession_id, employment_type, location, facility, facility_name, internal_requisition_number, source_type, msp_name, professions(name)), onboarding_flows(name), ${JOB_APPLICATION_APPLICANT_EMBED}`;

    function buildListQuery() {
      let query = db
        .from("job_applications")
        .select(applicationSelect)
        .eq("tenant_id", tenantId);

      if (jobId) {
        query = query.eq("job_requisition_id", jobId);
      } else if (workerId) {
        query = query.eq("worker_id", workerId);
      }

      if (statusId) {
        query = query.eq("status_id", statusId);
      }

      if (matchScore === "90_plus" || matchScore === "90_100") {
        query = query.gte("ai_match_score", 90);
      }

      if (sortBy === "ai_match_score") {
        query = query.order("ai_match_score", {
          ascending,
          nullsFirst: false,
        });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      const status = req.nextUrl.searchParams.get("status");
      const workflowId = req.nextUrl.searchParams.get("workflowId");
      const from = req.nextUrl.searchParams.get("from");
      const to = req.nextUrl.searchParams.get("to");
      if (status) query = query.eq("status", status);
      if (workflowId) query = query.eq("workflow_id", workflowId);
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to);
      return query;
    }

    const pages: Array<Record<string, unknown>> = [];
    let pageFrom = 0;
    while (pageFrom < 20_000) {
      const { data, error } = await buildListQuery().range(pageFrom, pageFrom + PAGE_SIZE - 1);
      if (error) throw error;
      const chunk = data ?? [];
      pages.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
      pageFrom += PAGE_SIZE;
    }

    let applications: Array<{
      id: string;
      worker_id?: string | null;
      assigned_recruiter_user_id?: string | null;
      application_statuses?: unknown;
      job_requisitions?:
        | { profession_id?: string; employment_type?: string }
        | Array<{ profession_id?: string; employment_type?: string }>
        | null;
      [key: string]: unknown;
    }> = pages as Array<{
      id: string;
      worker_id?: string | null;
      assigned_recruiter_user_id?: string | null;
      application_statuses?: unknown;
      job_requisitions?:
        | { profession_id?: string; employment_type?: string }
        | Array<{ profession_id?: string; employment_type?: string }>
        | null;
      [key: string]: unknown;
    }>;
    const professionId = req.nextUrl.searchParams.get("professionId");
    const employmentType = req.nextUrl.searchParams.get("employmentType");
    if (professionId || employmentType) {
      applications = applications.filter((row) => {
        const job = Array.isArray(row.job_requisitions)
          ? row.job_requisitions[0]
          : row.job_requisitions;
        return (
          (!professionId || job?.profession_id === professionId) &&
          (!employmentType || job?.employment_type === employmentType)
        );
      });
    }

    if (skillsFilter.length) {
      const candidateWorkerIds = Array.from(
        new Set(
          applications
            .map((row) => (row as { worker_id?: string | null }).worker_id)
            .filter((id): id is string => Boolean(id))
        )
      );
      const matchingWorkers = await filterWorkerIdsMatchingSkills(
        supabase,
        tenantId,
        candidateWorkerIds,
        skillsFilter
      );
      applications = applications.filter((row) => {
        const workerId = (row as { worker_id?: string | null }).worker_id;
        return Boolean(workerId && matchingWorkers.has(workerId));
      });
    }

    const identities = await loadTenantConvertedWorkerIdentities(db, tenantId);
    applications = applications.filter((app) => {
      const workerId = resolveApplicationWorkerId(app as ApplicationApplicantSource);
      const email = resolveApplicationApplicantEmail(app as ApplicationApplicantSource);
      const name = resolveApplicationApplicantName(app as ApplicationApplicantSource);
      const statusObj = Array.isArray(app.application_statuses)
        ? app.application_statuses[0]
        : app.application_statuses;
      const systemKey = (statusObj as { system_key?: string } | null)?.system_key ?? null;

      const isConverted = isConvertedWorkerOrApplication(
        {
          id: String(app.id ?? ""),
          applicationId: String(app.id ?? ""),
          workerId,
          email,
          name,
          status: String(app.status ?? ""),
          systemKey,
          workflowPhase: String(app.workflow_phase ?? ""),
        },
        identities
      );
      return !isConverted;
    });

    const countByWorker = new Map<string, number>();
    const workerIds = Array.from(
      new Set(
        applications
          .map((row) => (row as { worker_id?: string | null }).worker_id)
          .filter((id): id is string => Boolean(id))
      )
    );
    if (workerIds.length > 0) {
      const { data: workerApps } = await supabase
        .from("job_applications")
        .select("worker_id")
        .eq("tenant_id", tenantId)
        .in("worker_id", workerIds)
        .not("status", "in", JOB_CANDIDATE_LIST_HIDDEN_STATUS_IN_FILTER);
      for (const app of workerApps ?? []) {
        const workerIdValue = (app as { worker_id?: string | null }).worker_id;
        if (!workerIdValue) continue;
        countByWorker.set(workerIdValue, (countByWorker.get(workerIdValue) ?? 0) + 1);
      }
    }

    const noteByApplication = new Map<string, string>();
    const applicationIds = applications.map((row) => (row as { id: string }).id).filter(Boolean);
    if (applicationIds.length > 0) {
      const { data: historyRows } = await supabase
        .from("application_status_history")
        .select("application_id, note, created_at")
        .eq("tenant_id", tenantId)
        .in("application_id", applicationIds)
        .order("created_at", { ascending: false });
      for (const history of historyRows ?? []) {
        const applicationId = (history as { application_id?: string }).application_id;
        if (!applicationId || noteByApplication.has(applicationId)) continue;
        const note = String((history as { note?: string | null }).note ?? "").trim();
        noteByApplication.set(applicationId, note);
      }
    }

    const recruiterIds = Array.from(
      new Set(
        applications
          .map(
            (row) =>
              (row as { assigned_recruiter_user_id?: string | null }).assigned_recruiter_user_id
          )
          .filter((id): id is string => Boolean(id))
      )
    );
    const recruitersById = await loadStaffUsersByIds(supabase, tenantId, recruiterIds);
    const requirementCountsByApplication =
      applicationIds.length > 0
        ? await loadRequirementOutcomeCountsByApplication(supabase, tenantId, applicationIds)
        : new Map();

    return NextResponse.json({
      applications: applications.map((row) => {
        const statusJoin = Array.isArray(
          (row as { application_statuses?: unknown }).application_statuses
        )
          ? (row as { application_statuses: Array<{ name?: string }> }).application_statuses[0]
          : (row as { application_statuses?: { name?: string } | null }).application_statuses;
        const workerIdValue = (row as { worker_id?: string | null }).worker_id;
        const applicationId = (row as { id: string }).id;
        const assignedRecruiterUserId = (row as { assigned_recruiter_user_id?: string | null })
          .assigned_recruiter_user_id;
        return {
          ...row,
          statusName: statusJoin?.name ?? null,
          appliedJobCount: workerIdValue ? countByWorker.get(workerIdValue) ?? 1 : 1,
          statusNote: noteByApplication.get(applicationId) || null,
          assignedRecruiter: assignedRecruiterUserId
            ? recruitersById.get(String(assignedRecruiterUserId)) ?? {
                id: String(assignedRecruiterUserId),
                name: "Team member",
                profilePhotoUrl: null,
              }
            : null,
          ai_requirement_counts: listingCountsForAnalyzedApplication(
            requirementCountsByApplication,
            applicationId,
            (row as { ai_match_status?: string | null }).ai_match_status
          ),
        };
      }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load applications" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });

    const contentType = req.headers.get("content-type") ?? "";
    let jobRequisitionId = "";
    let name = "";
    let email = "";
    let phone = "";
    let streetAddress = "";
    let cityStateZip = "";
    let country = "";
    let lastJobTitle = "";
    let lastCompany = "";
    let resumeFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      jobRequisitionId = String(form.get("jobId") ?? form.get("jobRequisitionId") ?? "").trim();
      name = String(form.get("name") ?? "").trim();
      email = String(form.get("email") ?? "").trim();
      phone = String(form.get("phone") ?? "").trim();
      streetAddress = String(form.get("streetAddress") ?? form.get("street") ?? "").trim();
      cityStateZip = String(form.get("cityStateZip") ?? "").trim();
      country = String(form.get("country") ?? "").trim();
      lastJobTitle = String(form.get("lastJobTitle") ?? "").trim();
      lastCompany = String(form.get("lastCompany") ?? "").trim();
      const file = form.get("resume");
      if (file instanceof File && file.size > 0) resumeFile = file;
    } else {
      const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
      jobRequisitionId = String(body?.jobId ?? body?.jobRequisitionId ?? "").trim();
      name = String(body?.name ?? "").trim();
      email = String(body?.email ?? "").trim();
      phone = String(body?.phone ?? "").trim();
      streetAddress = String(body?.streetAddress ?? body?.street ?? "").trim();
      cityStateZip = String(body?.cityStateZip ?? "").trim();
      country = String(body?.country ?? "").trim();
      lastJobTitle = String(body?.lastJobTitle ?? "").trim();
      lastCompany = String(body?.lastCompany ?? "").trim();
    }

    if (!jobRequisitionId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (!phone) {
      return NextResponse.json({ error: "Phone is required" }, { status: 400 });
    }

    let resumePath: string | null = null;
    let resumeFileName: string | null = null;

    if (resumeFile) {
      if (resumeFile.size > MAX_RESUME_BYTES) {
        return NextResponse.json(
          { error: "Resume must be 10 MB or smaller." },
          { status: 400 }
        );
      }
      const mime = (resumeFile.type || "").toLowerCase();
      const lowerName = resumeFile.name.toLowerCase();
      const extOk =
        lowerName.endsWith(".pdf") || lowerName.endsWith(".doc") || lowerName.endsWith(".docx");
      if (!ALLOWED_RESUME_MIME.has(mime) && !extOk) {
        return NextResponse.json(
          { error: "Resume must be a PDF or Word document." },
          { status: 400 }
        );
      }

      const { firstName, lastName } = splitFullName(name);
      const safeName = buildWorkerResumeFileName({
        firstName,
        lastName,
        originalFileName: resumeFile.name || "resume.pdf",
      });
      resumePath = `admin-candidates/${tenantId}/${randomUUID()}/${safeName}`;
      resumeFileName = safeName;
      const bytes = Buffer.from(await resumeFile.arrayBuffer());
      const { error: uploadError } = await supabase.storage
        .from(WORKER_RESUMES_BUCKET)
        .upload(resumePath, bytes, {
          contentType: mime || "application/octet-stream",
          upsert: false,
        });
      if (uploadError) {
        return NextResponse.json(
          { error: uploadError.message || "Failed to upload resume" },
          { status: 500 }
        );
      }
    }

    const result = await createAdminJobApplication(supabase, {
      tenantId,
      jobRequisitionId,
      name,
      email,
      phone,
      streetAddress,
      cityStateZip,
      country,
      lastJobTitle,
      lastCompany,
      createdByStaffUserId: auth.devBypass ? null : auth.userId,
      resumePath,
      resumeFileName,
    });

    return NextResponse.json(
      {
        application: result.application,
        applicantProfileId: result.applicantProfileId,
        jobTitle: result.jobTitle,
      },
      { status: 201 }
    );
  } catch (error) {
    const status = error instanceof JobValidationError ? 400 : 500;
    return NextResponse.json({ error: formatApiError(error, "Failed to add candidate") }, { status });
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
      return NextResponse.json({ error: "At least one application id is required" }, { status: 400 });
    }

    const { deletedIds, workerIds } = await bulkDeleteJobApplications(supabase, tenantId, ids);
    if (!deletedIds.length) {
      return NextResponse.json({ error: "No candidates were deleted" }, { status: 404 });
    }

    const { deletedWorkerIds } = await deleteOrphanWorkersAfterApplicationDelete(
      supabase,
      tenantId,
      workerIds
    );

    return NextResponse.json({
      deletedIds,
      deletedWorkerIds,
      count: deletedIds.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: formatApiError(error, "Failed to delete candidates") },
      { status: 500 }
    );
  }
}

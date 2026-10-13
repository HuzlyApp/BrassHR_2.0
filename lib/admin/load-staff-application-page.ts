import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getStateCodeFromName } from "@/lib/us-state-names";
import { isUuid } from "@/lib/validation/uuid";
import { JOB_APPLICATION_APPLICANT_EMBED } from "@/lib/jobs/application-applicant-display";
import { JOB_CANDIDATE_LIST_HIDDEN_STATUS_IN_FILTER } from "@/lib/jobs/application-status";
import {
  filterWorkerIdsMatchingSkills,
  parseSkillsFilterParam,
} from "@/lib/jobs/application-skills-filter";
import {
  listingCountsForAnalyzedApplication,
  loadRequirementOutcomeCountsByApplication,
} from "@/lib/jobs/match-analysis/load-requirement-outcome-counts";
import { loadStaffUsersByIds } from "@/lib/account/resolve-staff-users";
import {
  appliedDateWindow,
  matchScoreBounds,
  type ApplicationListBucket,
} from "@/lib/admin/staff-application-list-query";

const APPLICATION_SELECT = `id, status, status_id, workflow_phase, post_hire_activated_at, created_at, submitted_at, updated_at, job_requisition_id, workflow_id, applicant_workflow_instance_id, worker_id, assigned_recruiter_user_id, ai_match_status, ai_match_score, ai_match_category, ai_match_action, ai_match_readiness, ai_match_display_category, ai_match_stage, ai_analyzed_at, ai_analysis_error, ai_analysis_progress, application_statuses(id, name, system_key, color), job_requisitions(public_title, profession_id, employment_type, location, facility, facility_name, internal_requisition_number, source_type, msp_name, professions(name)), onboarding_flows(name), ${JOB_APPLICATION_APPLICANT_EMBED}`;

const HYDRATE_CHUNK = 80;

type ListId = { id: string; aiMatchStatus: string | null };

type ListPageJson = {
  ids?: ListId[];
  total?: number;
  unanalyzedCount?: number;
  scopeUnanalyzedCount?: number;
  multiJobApplicantCount?: number;
  buckets?: ApplicationListBucket[];
  locations?: string[];
  workflows?: string[];
  stages?: string[];
};

function likeLiteral(value: string): string {
  return value.replace(/[%_\\]/g, "").trim();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

async function workerIdsInScope(
  supabase: SupabaseClient,
  tenantId: string,
  jobId: string
): Promise<string[]> {
  const ids = new Set<string>();
  for (let from = 0; from < 20_000; from += 1000) {
    let query = supabase
      .from("job_applications")
      .select("worker_id")
      .eq("tenant_id", tenantId)
      .not("worker_id", "is", null);
    if (jobId) query = query.eq("job_requisition_id", jobId);
    const { data, error } = await query.range(from, from + 999);
    if (error) throw error;
    const chunk = data ?? [];
    for (const row of chunk) {
      const workerId = String((row as { worker_id?: string | null }).worker_id ?? "").trim();
      if (workerId) ids.add(workerId);
    }
    if (chunk.length < 1000) break;
  }
  return [...ids];
}

async function hydrateApplications(
  supabase: SupabaseClient,
  tenantId: string,
  ids: string[]
): Promise<Array<Record<string, unknown>>> {
  const byId = new Map<string, Record<string, unknown>>();
  for (let offset = 0; offset < ids.length; offset += HYDRATE_CHUNK) {
    const chunk = ids.slice(offset, offset + HYDRATE_CHUNK);
    const { data, error } = await supabase
      .from("job_applications")
      .select(APPLICATION_SELECT)
      .eq("tenant_id", tenantId)
      .in("id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "");
      if (id) byId.set(id, row as Record<string, unknown>);
    }
  }
  return ids.map((id) => byId.get(id)).filter((row): row is Record<string, unknown> => Boolean(row));
}

async function decorateApplications(
  supabase: SupabaseClient,
  tenantId: string,
  applications: Array<Record<string, unknown>>
) {
  const countByWorker = new Map<string, number>();
  const workerIds = Array.from(
    new Set(
      applications
        .map((row) => String(row.worker_id ?? "").trim())
        .filter(Boolean)
    )
  );
  if (workerIds.length > 0) {
    for (let offset = 0; offset < workerIds.length; offset += HYDRATE_CHUNK) {
      const chunk = workerIds.slice(offset, offset + HYDRATE_CHUNK);
      const { data: workerApps, error } = await supabase
        .from("job_applications")
        .select("worker_id")
        .eq("tenant_id", tenantId)
        .in("worker_id", chunk)
        .not("status", "in", JOB_CANDIDATE_LIST_HIDDEN_STATUS_IN_FILTER);
      if (error) throw error;
      for (const app of workerApps ?? []) {
        const workerIdValue = String((app as { worker_id?: string | null }).worker_id ?? "");
        if (!workerIdValue) continue;
        countByWorker.set(workerIdValue, (countByWorker.get(workerIdValue) ?? 0) + 1);
      }
    }
  }

  const noteByApplication = new Map<string, string>();
  const applicationIds = applications.map((row) => String(row.id ?? "")).filter(Boolean);
  if (applicationIds.length > 0) {
    for (let offset = 0; offset < applicationIds.length; offset += HYDRATE_CHUNK) {
      const chunk = applicationIds.slice(offset, offset + HYDRATE_CHUNK);
      const { data: historyRows, error } = await supabase
        .from("application_status_history")
        .select("application_id, note, created_at")
        .eq("tenant_id", tenantId)
        .in("application_id", chunk)
        .order("created_at", { ascending: false });
      if (error) throw error;
      for (const history of historyRows ?? []) {
        const applicationId = String((history as { application_id?: string }).application_id ?? "");
        if (!applicationId || noteByApplication.has(applicationId)) continue;
        noteByApplication.set(applicationId, String((history as { note?: string | null }).note ?? "").trim());
      }
    }
  }

  const recruiterIds = Array.from(
    new Set(applications.map((row) => String(row.assigned_recruiter_user_id ?? "").trim()).filter(Boolean))
  );
  const recruitersById = await loadStaffUsersByIds(supabase, tenantId, recruiterIds);
  const requirementCountsByApplication =
    applicationIds.length > 0
      ? await loadRequirementOutcomeCountsByApplication(supabase, tenantId, applicationIds)
      : new Map();

  return applications.map((row) => {
    const statusJoin = Array.isArray(row.application_statuses)
      ? (row.application_statuses[0] as { name?: string } | undefined)
      : (row.application_statuses as { name?: string } | null);
    const workerIdValue = String(row.worker_id ?? "").trim();
    const applicationId = String(row.id ?? "");
    const assignedRecruiterUserId = String(row.assigned_recruiter_user_id ?? "").trim();
    return {
      ...row,
      statusName: statusJoin?.name ?? null,
      appliedJobCount: workerIdValue ? countByWorker.get(workerIdValue) ?? 1 : 1,
      statusNote: noteByApplication.get(applicationId) || null,
      assignedRecruiter: assignedRecruiterUserId
        ? recruitersById.get(assignedRecruiterUserId) ?? {
            id: assignedRecruiterUserId,
            name: "Team member",
            profilePhotoUrl: null,
          }
        : null,
      ai_requirement_counts: listingCountsForAnalyzedApplication(
        requirementCountsByApplication,
        applicationId,
        row.ai_match_status as string | null | undefined
      ),
    };
  });
}

/**
 * One page of the recruiter applications list.
 * `tenantId` is the staff session's tenant, never a client-supplied id.
 */
export async function loadStaffApplicationPage(
  supabase: SupabaseClient,
  tenantId: string,
  params: URLSearchParams
) {
  const idsOnly = params.get("idsOnly") === "1";
  const exporting = params.get("export") === "1";
  const scopeOnly = params.get("scopeOnly") === "1" || idsOnly;
  const jobId = params.get("jobId")?.trim() ?? "";
  const workerId = params.get("workerId")?.trim() ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const pageSize = Math.min(50, Math.max(1, Number(params.get("pageSize") ?? "10") || 10));
  const skills = parseSkillsFilterParam(params.get("skills"));
  const bounds = matchScoreBounds(params.get("matchScore") ?? "");
  const tzOffset = Number(params.get("tzOffset") ?? "0");
  const dates = scopeOnly
    ? { from: null, to: null, before: null }
    : appliedDateWindow(params.get("dateApplied")?.trim() ?? "", Number.isFinite(tzOffset) ? tzOffset : 0);
  const location = scopeOnly ? "" : likeLiteral(params.get("location") ?? "");
  const locationCode = location ? getStateCodeFromName(location) ?? "" : "";
  const listingStatus = params.get("statusId")?.trim() ?? "";
  const listingJob = params.get("listingJobId")?.trim() ?? "";
  const sort = params.get("sort")?.trim() || "evaluation";
  const sortDir = params.get("sortDir") === "asc" ? "asc" : "desc";

  let workerIds: string[] | null = null;
  if (skills.length) {
    const scopeIds = await workerIdsInScope(supabase, tenantId, isUuid(jobId) ? jobId : "");
    workerIds = [...(await filterWorkerIdsMatchingSkills(supabase, tenantId, scopeIds, skills))];
    if (workerIds.length === 0) {
      return {
        paged: true,
        idsOnly,
        applications: [],
        ids: [],
        total: 0,
        unanalyzedCount: 0,
        scopeUnanalyzedCount: 0,
        multiJobApplicantCount: 0,
        buckets: [],
        locations: [],
        workflows: [],
        stages: [],
      };
    }
  }

  const limit = idsOnly || exporting ? 20000 : pageSize;
  const offset = idsOnly || exporting ? 0 : (page - 1) * pageSize;

  const { data, error } = await supabase.rpc("staff_application_list_page", {
    p_tenant_id: tenantId,
    p_job_id: isUuid(jobId) ? jobId : null,
    p_worker_id: isUuid(workerId) ? workerId : null,
    p_worker_ids: workerIds,
    p_tab: scopeOnly ? null : params.get("tab")?.trim() || null,
    p_status_id: !scopeOnly && isUuid(listingStatus) ? listingStatus : null,
    p_query: scopeOnly ? null : params.get("q")?.trim() || null,
    p_location: location || null,
    p_location_code: locationCode || null,
    p_listing_job_id: !scopeOnly && isUuid(listingJob) ? listingJob : null,
    p_stage: scopeOnly ? null : params.get("stage")?.trim() || null,
    p_evaluation: scopeOnly ? null : params.get("evaluation")?.trim() || null,
    p_workflow: scopeOnly ? null : params.get("workflow")?.trim() || null,
    p_match_min: bounds.min,
    p_match_max: bounds.max,
    p_match_max_inclusive: bounds.maxInclusive,
    p_match_no_score: bounds.noScore,
    p_apply_match: bounds.apply,
    p_date_from: dates.from,
    p_date_to: dates.to,
    p_date_before: dates.before,
    p_multi_job: !scopeOnly && params.get("multiJob") === "1",
    p_sort: sort,
    p_sort_dir: sortDir,
    p_limit: limit,
    p_offset: offset,
    p_ids_only: idsOnly || exporting,
  });
  if (error) throw error;

  const pageJson = (
    typeof data === "string" ? JSON.parse(data) : data ?? {}
  ) as ListPageJson;
  const ids = Array.isArray(pageJson.ids) ? pageJson.ids : [];
  const buckets = Array.isArray(pageJson.buckets) ? pageJson.buckets : [];

  if (idsOnly) {
    return {
      paged: true,
      idsOnly: true,
      ids,
      total: Number(pageJson.total ?? 0),
      scopeUnanalyzedCount: Number(pageJson.scopeUnanalyzedCount ?? 0),
    };
  }

  const applications = await decorateApplications(
    supabase,
    tenantId,
    await hydrateApplications(
      supabase,
      tenantId,
      ids.map((row) => String(row.id ?? "")).filter(Boolean)
    )
  );

  return {
    paged: true,
    applications,
    total: Number(pageJson.total ?? 0),
    unanalyzedCount: Number(pageJson.unanalyzedCount ?? 0),
    scopeUnanalyzedCount: Number(pageJson.scopeUnanalyzedCount ?? 0),
    multiJobApplicantCount: Number(pageJson.multiJobApplicantCount ?? 0),
    buckets,
    locations: asStringArray(pageJson.locations),
    workflows: asStringArray(pageJson.workflows),
    stages: asStringArray(pageJson.stages),
  };
}

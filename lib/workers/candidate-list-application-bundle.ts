import type { SupabaseClient } from "@supabase/supabase-js";
import { queryInChunks } from "@/lib/supabase/chunked-in-query";
import type { WorkerApplicationStatusSummary } from "@/lib/jobs/application-statuses/attach-worker-application-status";
import {
  pickWorkerJobMatchSummary,
  type WorkerJobMatchSummariesResult,
  type WorkerJobMatchSummary,
} from "@/lib/workers/worker-job-match-summary";
import type {
  WorkerAppliedJob,
  WorkerJobAssigneeEntry,
} from "@/lib/workers/worker-application-job-titles";

type BundleAppRow = {
  id: string;
  worker_id: string | null;
  status: string | null;
  status_id: string | null;
  assigned_recruiter_user_id?: string | null;
  job_requisition_id?: string | null;
  ai_match_status: string | null;
  ai_match_score: number | null;
  ai_match_category: string | null;
  ai_match_display_category: string | null;
  ai_match_stage?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  application_statuses:
    | { id: string; name: string; system_key: string | null }
    | { id: string; name: string; system_key: string | null }[]
    | null;
  job_requisitions:
    | {
        public_title: string | null;
        source_job_title?: string | null;
        source_type?: string | null;
        msp_name?: string | null;
        external_requisition_id?: string | null;
      }
    | {
        public_title: string | null;
        source_job_title?: string | null;
        source_type?: string | null;
        msp_name?: string | null;
        external_requisition_id?: string | null;
      }[]
    | null;
};

export type CandidateListApplicationBundle = {
  summaries: Map<string, WorkerApplicationStatusSummary>;
  appliedJobCounts: Map<string, number>;
  matchBundle: WorkerJobMatchSummariesResult;
  appliedJobsByWorker: Map<string, WorkerAppliedJob[]>;
  jobAssigneesByWorker: Map<string, WorkerJobAssigneeEntry[]>;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function isActivePipelineStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return s !== "rejected" && s !== "withdrawn";
}

function jobTitle(row: BundleAppRow): string {
  const job = one(row.job_requisitions);
  return (
    String(job?.public_title ?? "").trim() ||
    String(job?.source_job_title ?? "").trim()
  );
}

function clientNameFromJob(
  job: {
    source_type?: string | null;
    msp_name?: string | null;
  } | null
): string | null {
  if (!job) return null;
  const source = String(job.source_type ?? "").trim().toLowerCase();
  if (source !== "msp") return null;
  const name = job.msp_name?.trim() || "";
  return name || null;
}

function rowTimestamp(row: BundleAppRow): number {
  const t = new Date(row.updated_at || row.created_at || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

function toStatusSummary(
  row: BundleAppRow,
  ambiguous: boolean
): WorkerApplicationStatusSummary {
  const status = one(row.application_statuses);
  const job = one(row.job_requisitions);
  const sourceJobId = job?.external_requisition_id?.trim() || "";
  return {
    applicationId: row.id,
    statusId: status?.id ?? row.status_id,
    statusName: status?.name ?? null,
    systemKey: status?.system_key ?? row.status,
    jobTitle: job?.public_title ?? null,
    clientName: clientNameFromJob(job),
    sourceJobId: sourceJobId || null,
    sourceType: job?.source_type?.trim() || null,
    ambiguous,
  };
}

function isAnalyzedWithScore(row: BundleAppRow): boolean {
  return (
    row.ai_match_status === "ANALYZED" &&
    row.ai_match_score != null &&
    Number.isFinite(Number(row.ai_match_score))
  );
}

/**
 * One chunked read of job_applications for the candidates list, then derive
 * status / match / applied-jobs / assignees / counts in memory.
 * Replaces five parallel PostgREST round-trips that each re-queried the same rows.
 */
export async function loadCandidateListApplicationBundle(
  supabase: SupabaseClient,
  args: { tenantId?: string | null; workerIds: string[] }
): Promise<CandidateListApplicationBundle> {
  const workerIds = Array.from(new Set(args.workerIds.filter(Boolean)));
  const emptyMatch: WorkerJobMatchSummariesResult = {
    summaries: new Map(),
    analyzedApplicationIds: [],
    appsByWorker: new Map(),
  };
  if (workerIds.length === 0) {
    return {
      summaries: new Map(),
      appliedJobCounts: new Map(),
      matchBundle: emptyMatch,
      appliedJobsByWorker: new Map(),
      jobAssigneesByWorker: new Map(),
    };
  }

  const { data, error } = await queryInChunks(workerIds, async (chunk) => {
    let query = supabase
      .from("job_applications")
      .select(
        [
          "id",
          "worker_id",
          "status",
          "status_id",
          "assigned_recruiter_user_id",
          "job_requisition_id",
          "ai_match_status",
          "ai_match_score",
          "ai_match_category",
          "ai_match_display_category",
          "ai_match_stage",
          "updated_at",
          "created_at",
          "application_statuses(id, name, system_key)",
          "job_requisitions(public_title, source_job_title, source_type, msp_name, external_requisition_id)",
        ].join(", ")
      )
      .in("worker_id", chunk);

    if (args.tenantId) {
      query = query.eq("tenant_id", args.tenantId);
    }

    const result = await query.order("updated_at", { ascending: false });
    return {
      data: (result.data ?? []) as unknown as BundleAppRow[],
      error: result.error,
    };
  });
  if (error) throw error;

  const appliedJobCounts = new Map<string, number>();
  const summaries = new Map<string, WorkerApplicationStatusSummary>();
  const matchSummaries = new Map<string, WorkerJobMatchSummary>();
  const appsByWorker = new Map<string, BundleAppRow[]>();
  const appliedJobsByWorker = new Map<string, WorkerAppliedJob[]>();
  const jobAssigneesByWorker = new Map<string, WorkerJobAssigneeEntry[]>();
  const analyzedApplicationIds: string[] = [];

  for (const row of data) {
    const workerId = row.worker_id?.trim();
    if (!workerId) continue;

    appliedJobCounts.set(workerId, (appliedJobCounts.get(workerId) ?? 0) + 1);

    if (!isActivePipelineStatus(row.status)) continue;

    const activeList = appsByWorker.get(workerId) ?? [];
    activeList.push(row);
    appsByWorker.set(workerId, activeList);

    if (isAnalyzedWithScore(row)) analyzedApplicationIds.push(row.id);

    const jobId =
      typeof row.job_requisition_id === "string" ? row.job_requisition_id.trim() : "";
    const title = jobTitle(row);
    if (jobId && title) {
      const jobs = appliedJobsByWorker.get(workerId) ?? [];
      if (!jobs.some((entry) => entry.jobId === jobId)) {
        jobs.push({ jobId, title });
        appliedJobsByWorker.set(workerId, jobs);
      }
    }

    const applicationId = typeof row.id === "string" ? row.id.trim() : "";
    if (applicationId && title) {
      const assignees = jobAssigneesByWorker.get(workerId) ?? [];
      if (!assignees.some((entry) => entry.applicationId === applicationId)) {
        const assigneeId =
          typeof row.assigned_recruiter_user_id === "string"
            ? row.assigned_recruiter_user_id.trim()
            : "";
        assignees.push({
          applicationId,
          jobTitle: title,
          assignedRecruiterUserId: assigneeId || null,
        });
        jobAssigneesByWorker.set(workerId, assignees);
      }
    }
  }

  for (const [workerId, apps] of appsByWorker) {
    const sorted = [...apps].sort((a, b) => rowTimestamp(b) - rowTimestamp(a));
    const newest = sorted[0];
    if (newest) {
      summaries.set(workerId, toStatusSummary(newest, sorted.length > 1));
    }
    const match = pickWorkerJobMatchSummary(apps);
    if (match) matchSummaries.set(workerId, match);
  }

  return {
    summaries,
    appliedJobCounts,
    matchBundle: {
      summaries: matchSummaries,
      analyzedApplicationIds,
      appsByWorker: appsByWorker as WorkerJobMatchSummariesResult["appsByWorker"],
    },
    appliedJobsByWorker,
    jobAssigneesByWorker,
  };
}

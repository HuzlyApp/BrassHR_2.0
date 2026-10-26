import { normalizeApplicationStatus } from "@/lib/jobs/application-status";
import { isVisibleOnJobCandidatesAllTab } from "@/lib/jobs/application-status-tab";
import { isStrongAiMatchScore } from "@/lib/jobs/match-analysis/display";
import { inProcessApplicationRedirectTab } from "@/lib/jobs/pipeline-summary";

export type JobListApplicationMetricRow = {
  job_requisition_id?: string | null;
  status?: string | null;
  status_id?: string | null;
  application_statuses?:
    | { system_key?: string | null; name?: string | null }
    | { system_key?: string | null; name?: string | null }[]
    | null;
  ai_match_status?: string | null;
  ai_match_score?: number | string | null;
  ai_match_readiness?: string | null;
  ai_analyzed_at?: string | null;
};

export type JobListMetricCounts = {
  applicantCount: number;
  newCount: number;
  inProcessCount: number;
  analyzedCount: number;
  strongCount: number;
  readyCount: number;
  hiredCount: number;
  /** Best `?tab=` for the In Process applicants chip (status with the most in-process apps). */
  inProcessRedirectTab: string | null;
};

function emptyCounts(): JobListMetricCounts {
  return {
    applicantCount: 0,
    newCount: 0,
    inProcessCount: 0,
    analyzedCount: 0,
    strongCount: 0,
    readyCount: 0,
    hiredCount: 0,
    inProcessRedirectTab: null,
  };
}

function bestRedirectTab(tabCounts: Map<string, number>): string | null {
  let bestTab: string | null = null;
  let bestCount = 0;
  for (const [tab, count] of tabCounts) {
    if (count > bestCount) {
      bestTab = tab;
      bestCount = count;
    }
  }
  return bestTab;
}

/** Same set as the jobs dashboard ANALYSIS count and the Analyzed applicants tab. */
export function isAnalyzedJobApplication(row: {
  ai_match_status?: string | null;
  ai_match_score?: number | string | null;
  ai_analyzed_at?: string | null;
}): boolean {
  if (String(row.ai_match_status ?? "") === "ANALYZED") return true;
  if (row.ai_analyzed_at) return true;
  if (row.ai_match_score == null || row.ai_match_score === "") return false;
  return Number.isFinite(Number(row.ai_match_score));
}

function addApplicationToCounts(
  current: JobListMetricCounts,
  row: JobListApplicationMetricRow,
  inProcessTabCounts: Map<string, number>
): void {
  if (!isVisibleOnJobCandidatesAllTab(row)) return;

  const status = String(row.status ?? "").toLowerCase();
  const pipeline = normalizeApplicationStatus(status);
  current.applicantCount += 1;
  if (status === "new" || status === "submitted" || pipeline === "new") current.newCount += 1;
  if (
    pipeline === "reviewing" ||
    pipeline === "shortlisted" ||
    pipeline === "interviewing"
  ) {
    current.inProcessCount += 1;
    const tab = inProcessApplicationRedirectTab(row);
    inProcessTabCounts.set(tab, (inProcessTabCounts.get(tab) ?? 0) + 1);
  }
  if (pipeline === "hired") current.hiredCount += 1;

  const analysisDone = isAnalyzedJobApplication(row);

  if (analysisDone) current.analyzedCount += 1;
  if (isStrongAiMatchScore(row.ai_match_score)) current.strongCount += 1;
  if (analysisDone && String(row.ai_match_readiness ?? "") === "READY_TO_SUBMIT") {
    current.readyCount += 1;
  }
}

/** Metrics for one job's nested `job_applications` rows. */
export function tallyApplicationMetrics(
  rows: JobListApplicationMetricRow[]
): JobListMetricCounts {
  const current = emptyCounts();
  const inProcessTabCounts = new Map<string, number>();
  for (const row of rows) {
    addApplicationToCounts(current, row, inProcessTabCounts);
  }
  current.inProcessRedirectTab = bestRedirectTab(inProcessTabCounts);
  return current;
}

/**
 * Per-job metrics for the jobs grid/list. Counts match the Job candidates "All" tab
 * (every application for the job, including archived, rejected, and withdrawn).
 */
export function tallyJobListApplicationMetrics(
  rows: JobListApplicationMetricRow[]
): Map<string, JobListMetricCounts> {
  const metricsByJob = new Map<string, JobListMetricCounts>();
  const inProcessTabCountsByJob = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const id = String(row.job_requisition_id ?? "");
    if (!id) continue;
    const current = metricsByJob.get(id) ?? emptyCounts();
    const inProcessTabs = inProcessTabCountsByJob.get(id) ?? new Map<string, number>();
    addApplicationToCounts(current, row, inProcessTabs);
    metricsByJob.set(id, current);
    inProcessTabCountsByJob.set(id, inProcessTabs);
  }
  for (const [id, metrics] of metricsByJob) {
    metrics.inProcessRedirectTab = bestRedirectTab(
      inProcessTabCountsByJob.get(id) ?? new Map()
    );
  }
  return metricsByJob;
}

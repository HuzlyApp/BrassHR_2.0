import { normalizeApplicationStatus } from "@/lib/jobs/application-status";
import { isVisibleOnJobCandidatesAllTab } from "@/lib/jobs/application-status-tab";

/** FSD-JOB-UX-001 / Stage Pipeline Spec v4.1 pipeline-summary response. */
export type JobPipelineSummary = {
  all: number;
  intake: number;
  screening: number;
  interview: number;
  submission: number;
  selected: number;
  onboarding: number;
  closed: number;
  show_submission: boolean;
  /**
   * Best applications-list `?tab=` for the Closed card (system key or status name slug).
   * Closed spans rejected / undecided / archived (+ custom statuses that roll into closed).
   */
  closed_redirect_tab: string | null;
  /**
   * Best applications-list `?tab=` for the In Process card (system key or status name slug).
   * In Process spans screening + interview (reviewing / shortlisted / interviewing + customs).
   */
  in_process_redirect_tab: string | null;
};

export type JobPipelineSummaryRow = {
  status?: string | null;
  status_id?: string | null;
  application_statuses?:
    | { system_key?: string | null; name?: string | null }
    | { system_key?: string | null; name?: string | null }[]
    | null;
};

const CLOSED_PIPELINE_KEYS = new Set(["rejected", "undecided", "archived"]);
const IN_PROCESS_PIPELINE_KEYS = new Set(["reviewing", "shortlisted", "interviewing"]);

function applicationSystemKey(row: JobPipelineSummaryRow): string {
  const joined = Array.isArray(row.application_statuses)
    ? row.application_statuses[0]
    : row.application_statuses;
  return String(joined?.system_key ?? "")
    .trim()
    .toLowerCase();
}

function applicationStatusName(row: JobPipelineSummaryRow): string {
  const joined = Array.isArray(row.application_statuses)
    ? row.application_statuses[0]
    : row.application_statuses;
  return String(joined?.name ?? "")
    .trim()
    .toLowerCase();
}

function statusNameSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Prefer real status catalog key/name so Closed redirects to the tab that has the row. */
export function closedApplicationRedirectTab(row: JobPipelineSummaryRow): string {
  const key = applicationSystemKey(row);
  if (CLOSED_PIPELINE_KEYS.has(key)) return key;

  const name = applicationStatusName(row);
  if (name) {
    const slug = statusNameSlug(name);
    if (slug) return slug;
  }

  const pipeline = normalizeApplicationStatus(String(row.status ?? ""));
  if (CLOSED_PIPELINE_KEYS.has(pipeline)) return pipeline;
  return "rejected";
}

/** Prefer real status catalog key/name so In Process redirects to the tab that has the row. */
export function inProcessApplicationRedirectTab(row: JobPipelineSummaryRow): string {
  const key = applicationSystemKey(row);
  if (key) return key;

  const name = applicationStatusName(row);
  if (name) {
    const slug = statusNameSlug(name);
    if (slug) return slug;
  }

  const pipeline = normalizeApplicationStatus(String(row.status ?? ""));
  if (IN_PROCESS_PIPELINE_KEYS.has(pipeline)) return pipeline;
  return "reviewing";
}

export function isClosedPipelineApplication(row: JobPipelineSummaryRow): boolean {
  if (isAtMspPipelineApplication(row) || isOnboardingPipelineApplication(row)) return false;
  const pipeline = normalizeApplicationStatus(String(row.status ?? ""));
  return CLOSED_PIPELINE_KEYS.has(pipeline);
}

/** Screening + interview stages that roll into the In Process card / list chip. */
export function isInProcessPipelineApplication(row: JobPipelineSummaryRow): boolean {
  if (isAtMspPipelineApplication(row) || isOnboardingPipelineApplication(row)) return false;
  const pipeline = normalizeApplicationStatus(String(row.status ?? ""));
  return IN_PROCESS_PIPELINE_KEYS.has(pipeline);
}

export function isAtMspPipelineApplication(row: JobPipelineSummaryRow): boolean {
  const key = applicationSystemKey(row);
  if (key === "submitted" || key === "msp_submitted" || key === "at_msp") return true;
  const name = applicationStatusName(row);
  return (
    name === "submitted to msp" ||
    name === "submitted for msp review" ||
    name === "at msp" ||
    name === "at msp submission"
  );
}

function isOnboardingPipelineApplication(row: JobPipelineSummaryRow): boolean {
  const key = applicationSystemKey(row);
  if (key === "onboarding" || key === "onboarded" || key === "post_hire") return true;
  const name = applicationStatusName(row);
  return name.includes("onboard");
}

export function emptyJobPipelineSummary(
  showSubmission = false
): JobPipelineSummary {
  return {
    all: 0,
    intake: 0,
    screening: 0,
    interview: 0,
    submission: 0,
    selected: 0,
    onboarding: 0,
    closed: 0,
    show_submission: showSubmission,
    closed_redirect_tab: null,
    in_process_redirect_tab: null,
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

/**
 * Per-box counts for Job Details cards / list chips.
 * Mapping (FSD): New=intake; In process=screening+interview;
 * At MSP=submission when show_submission; Hired=selected+onboarding.
 */
export function tallyJobPipelineSummary(
  rows: JobPipelineSummaryRow[],
  options: { showSubmission: boolean }
): JobPipelineSummary {
  const summary = emptyJobPipelineSummary(options.showSubmission);
  const closedTabCounts = new Map<string, number>();
  const inProcessTabCounts = new Map<string, number>();

  for (const row of rows) {
    if (!isVisibleOnJobCandidatesAllTab(row)) continue;
    summary.all += 1;

    if (options.showSubmission && isAtMspPipelineApplication(row)) {
      summary.submission += 1;
      continue;
    }

    if (isOnboardingPipelineApplication(row)) {
      summary.onboarding += 1;
      continue;
    }

    const pipeline = normalizeApplicationStatus(String(row.status ?? ""));
    switch (pipeline) {
      case "new":
        summary.intake += 1;
        break;
      case "reviewing": {
        summary.screening += 1;
        const tab = inProcessApplicationRedirectTab(row);
        inProcessTabCounts.set(tab, (inProcessTabCounts.get(tab) ?? 0) + 1);
        break;
      }
      case "shortlisted":
      case "interviewing": {
        summary.interview += 1;
        const tab = inProcessApplicationRedirectTab(row);
        inProcessTabCounts.set(tab, (inProcessTabCounts.get(tab) ?? 0) + 1);
        break;
      }
      case "hired":
        summary.selected += 1;
        break;
      case "rejected":
      case "undecided":
      case "archived": {
        summary.closed += 1;
        const tab = closedApplicationRedirectTab(row);
        closedTabCounts.set(tab, (closedTabCounts.get(tab) ?? 0) + 1);
        break;
      }
      default: {
        summary.screening += 1;
        const tab = inProcessApplicationRedirectTab(row);
        inProcessTabCounts.set(tab, (inProcessTabCounts.get(tab) ?? 0) + 1);
        break;
      }
    }
  }

  summary.closed_redirect_tab = bestRedirectTab(closedTabCounts);
  summary.in_process_redirect_tab = bestRedirectTab(inProcessTabCounts);

  return summary;
}

/** Legacy Job Details `stats` fields derived from the FSD pipeline-summary buckets. */
export function jobDetailsStatsFromPipelineSummary(summary: JobPipelineSummary) {
  return {
    applicationsAll: summary.all,
    applicationsNew: summary.intake,
    applicationsInProcess: summary.screening + summary.interview,
    applicationsAtMsp: summary.submission,
    applicationsHired: summary.selected + summary.onboarding,
    applicationsClosed: summary.closed,
    applicationsStarted: summary.screening + summary.interview,
    applicationsSubmittedOrHired: summary.intake + summary.selected + summary.onboarding,
    showSubmission: summary.show_submission,
    impressions: 0,
    clicks: 0,
    totalCost: 0,
  };
}

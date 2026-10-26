import type { ApplicationColumnId } from "@/app/admin_recruiter/applications/application-columns";
import {
  resolveApplicationApplicantEmail,
  resolveApplicationApplicantLocation,
  resolveApplicationApplicantName,
  resolveApplicationApplicantPhone,
} from "@/lib/jobs/application-applicant-display";
import { applicationCurrentStageMeta, applicationStatusLabel } from "@/lib/jobs/application-status";
import { matchCategoryRelevanceRank } from "@/lib/jobs/match-analysis/display";
import {
  fitBandSortRank,
  listingDisplayFitBand,
} from "@/lib/jobs/match-analysis/progression";

export const APPLICATION_LIST_SORTABLE_COLUMNS = [
  "candidates",
  "contact",
  "jobRole",
  "workType",
  "matches",
  "fit",
  "conf",
  "verify",
  "notMet",
  "location",
  "activity",
  "currentStage",
  "assignee",
  "status",
  "email",
  "workflow",
  "dateApplied",
  "evaluation",
] as const satisfies readonly ApplicationColumnId[];

export type ApplicationListSortColumn = (typeof APPLICATION_LIST_SORTABLE_COLUMNS)[number];
export type ApplicationListSortDirection = "asc" | "desc";

export type ApplicationListSortState = {
  column: ApplicationListSortColumn | null;
  direction: ApplicationListSortDirection;
};

const SORTABLE_COLUMN_SET = new Set<string>(APPLICATION_LIST_SORTABLE_COLUMNS);

/** Default: most recently analyzed first (unanalyzed last). */
export const EMPTY_APPLICATION_LIST_SORT: ApplicationListSortState = {
  column: "evaluation",
  direction: "desc",
};

export type ApplicationListSortRow = {
  id: string;
  status: string;
  statusName?: string | null;
  created_at: string;
  submitted_at: string | null;
  updated_at?: string | null;
  workflow_id: string;
  ai_match_status?: string | null;
  ai_match_score?: number | null;
  ai_match_category?: string | null;
  ai_match_stage?: string | null;
  ai_analyzed_at?: string | null;
  ai_requirement_counts?: {
    confirmed?: number | null;
    verify?: number | null;
    notMet?: number | null;
    mandatory?: number | null;
    blocking?: number | null;
    mandatoryConfirmed?: number | null;
    quickRoute?: "STRONG" | "REVIEW" | "LOW_MATCH" | null;
  } | null;
  assignedRecruiter?: { name?: string | null } | null;
  application_statuses?:
    | { name?: string | null }
    | { name?: string | null }[]
    | null;
  onboarding_flows?: Record<string, unknown> | Record<string, unknown>[] | null;
  applicant_profiles?: Record<string, unknown> | Record<string, unknown>[] | null;
  worker?: Record<string, unknown> | Record<string, unknown>[] | null;
};

export function isApplicationListSortableColumn(
  columnId: string
): columnId is ApplicationListSortColumn {
  return SORTABLE_COLUMN_SET.has(columnId);
}

export function applicationListHeaderAlign(
  columnId: ApplicationColumnId
): "left" | "center" {
  if (
    columnId === "candidates" ||
    columnId === "contact" ||
    columnId === "clientName" ||
    columnId === "location" ||
    columnId === "currentStage"
  ) {
    return "left";
  }
  return "center";
}

export function defaultApplicationListSortDirection(
  column: ApplicationListSortColumn
): ApplicationListSortDirection {
  return column === "matches" ||
    column === "fit" ||
    column === "dateApplied" ||
    column === "activity" ||
    column === "evaluation" ||
    column === "conf" ||
    column === "verify" ||
    column === "notMet"
    ? "desc"
    : "asc";
}

export function toggleApplicationListSort(
  current: ApplicationListSortState,
  column: ApplicationListSortColumn
): ApplicationListSortState {
  if (current.column !== column) {
    return { column, direction: defaultApplicationListSortDirection(column) };
  }
  return {
    column,
    direction: current.direction === "asc" ? "desc" : "asc",
  };
}

/** Map toolbar Apply-date / Score controls onto column sort state. */
export function applicationListSortFromToolbar(
  sortBy: "newest" | "oldest" | "matchScore" | "matchScoreAsc"
): ApplicationListSortState {
  if (sortBy === "oldest") return { column: "dateApplied", direction: "asc" };
  if (sortBy === "newest") return { column: "dateApplied", direction: "desc" };
  if (sortBy === "matchScoreAsc") return { column: "matches", direction: "asc" };
  return { column: "matches", direction: "desc" };
}

export function applicationToolbarSortBy(
  sort: ApplicationListSortState
): "newest" | "oldest" | "matchScore" | "matchScoreAsc" {
  if (sort.column === "dateApplied") {
    return sort.direction === "asc" ? "oldest" : "newest";
  }
  if (sort.column === "matches") {
    return sort.direction === "asc" ? "matchScoreAsc" : "matchScore";
  }
  // Non date/score column sorts: keep Apply-date toolbar cleared (it only lights for newest/oldest).
  return "matchScore";
}

export function applicationToolbarScoreSort(
  sort: ApplicationListSortState
): "" | "high-low" | "low-high" {
  if (sort.column !== "matches") return "";
  return sort.direction === "asc" ? "low-high" : "high-low";
}

function oneRecord(
  value: Record<string, unknown> | Record<string, unknown>[] | null | undefined
): Record<string, unknown> {
  if (!value) return {};
  return Array.isArray(value) ? value[0] ?? {} : value;
}

function oneStatusName(
  value: ApplicationListSortRow["application_statuses"]
): string {
  if (!value) return "";
  const row = Array.isArray(value) ? value[0] ?? null : value;
  return row?.name?.trim() || "";
}

function compareName(a: ApplicationListSortRow, b: ApplicationListSortRow): number {
  return resolveApplicationApplicantName(a).localeCompare(
    resolveApplicationApplicantName(b),
    undefined,
    { sensitivity: "base" }
  );
}

function compareTextValues(a: string, b: string): number {
  return a.trim().localeCompare(b.trim(), undefined, { numeric: true, sensitivity: "base" });
}

function compareEmptyLast(
  aEmpty: boolean,
  bEmpty: boolean,
  valueCmp: number,
  directionMultiplier: number
): number {
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  return valueCmp * directionMultiplier;
}

function compareDateValues(aIso: string, bIso: string): number {
  return new Date(aIso).getTime() - new Date(bIso).getTime();
}

function progressStatusText(row: ApplicationListSortRow): string {
  return (
    row.statusName?.trim() ||
    oneStatusName(row.application_statuses) ||
    applicationStatusLabel(row.status) ||
    ""
  );
}

function evaluationAnalyzedAt(row: ApplicationListSortRow): string {
  return row.ai_analyzed_at?.trim() || "";
}

function requirementCount(
  row: ApplicationListSortRow,
  key: "confirmed" | "verify" | "notMet"
): number | null {
  const value = row.ai_requirement_counts?.[key];
  return value == null ? null : Number(value);
}

function compareMatchScore(a: ApplicationListSortRow, b: ApplicationListSortRow): number {
  const aScore = a.ai_match_score == null ? -1 : Number(a.ai_match_score);
  const bScore = b.ai_match_score == null ? -1 : Number(b.ai_match_score);
  if (aScore !== bScore) return aScore - bScore;
  const aRelevance = matchCategoryRelevanceRank(a.ai_match_category);
  const bRelevance = matchCategoryRelevanceRank(b.ai_match_category);
  if (aRelevance !== bRelevance) return aRelevance - bRelevance;
  return compareName(a, b);
}

function compareNumericNullLast(
  aValue: number | null,
  bValue: number | null,
  directionMultiplier: number
): number {
  const aEmpty = aValue == null || Number.isNaN(aValue);
  const bEmpty = bValue == null || Number.isNaN(bValue);
  return compareEmptyLast(
    aEmpty,
    bEmpty,
    (aValue ?? 0) - (bValue ?? 0),
    directionMultiplier
  );
}

function compareColumn(
  column: ApplicationListSortColumn,
  a: ApplicationListSortRow,
  b: ApplicationListSortRow,
  directionMultiplier: number
): number {
  switch (column) {
    case "candidates":
      return compareName(a, b) * directionMultiplier;
    case "contact": {
      const aEmail = resolveApplicationApplicantEmail(a);
      const bEmail = resolveApplicationApplicantEmail(b);
      const emailCmp = compareEmptyLast(
        !aEmail,
        !bEmail,
        compareTextValues(aEmail, bEmail),
        directionMultiplier
      );
      if (emailCmp !== 0) return emailCmp;
      const aPhone = resolveApplicationApplicantPhone(a);
      const bPhone = resolveApplicationApplicantPhone(b);
      return compareEmptyLast(!aPhone, !bPhone, compareTextValues(aPhone, bPhone), directionMultiplier);
    }
    case "jobRole": {
      const aTitle = String((a as Record<string, any>).job_requisitions?.public_title ?? "");
      const bTitle = String((b as Record<string, any>).job_requisitions?.public_title ?? "");
      return compareEmptyLast(!aTitle, !bTitle, compareTextValues(aTitle, bTitle), directionMultiplier);
    }
    case "workType": {
      const aType = String((a as Record<string, any>).job_requisitions?.employment_type ?? "");
      const bType = String((b as Record<string, any>).job_requisitions?.employment_type ?? "");
      return compareEmptyLast(!aType, !bType, compareTextValues(aType, bType), directionMultiplier);
    }
    case "matches":
      return compareMatchScore(a, b) * directionMultiplier;
    case "fit": {
      const aBand = listingDisplayFitBand({
        analyzed: a.ai_match_status === "ANALYZED",
        stage: a.ai_match_stage,
        category: a.ai_match_category,
        score: a.ai_match_score,
        counts: a.ai_requirement_counts,
      });
      const bBand = listingDisplayFitBand({
        analyzed: b.ai_match_status === "ANALYZED",
        stage: b.ai_match_stage,
        category: b.ai_match_category,
        score: b.ai_match_score,
        counts: b.ai_requirement_counts,
      });
      return compareNumericNullLast(
        fitBandSortRank(aBand),
        fitBandSortRank(bBand),
        directionMultiplier
      );
    }
    case "conf":
      return compareNumericNullLast(
        requirementCount(a, "confirmed"),
        requirementCount(b, "confirmed"),
        directionMultiplier
      );
    case "verify":
      return compareNumericNullLast(
        requirementCount(a, "verify"),
        requirementCount(b, "verify"),
        directionMultiplier
      );
    case "notMet":
      return compareNumericNullLast(
        requirementCount(a, "notMet"),
        requirementCount(b, "notMet"),
        directionMultiplier
      );
    case "location": {
      const aLoc = resolveApplicationApplicantLocation(a);
      const bLoc = resolveApplicationApplicantLocation(b);
      return compareEmptyLast(!aLoc, !bLoc, compareTextValues(aLoc, bLoc), directionMultiplier);
    }
    case "activity": {
      const aWhen = a.updated_at || a.submitted_at || a.created_at;
      const bWhen = b.updated_at || b.submitted_at || b.created_at;
      return compareEmptyLast(!aWhen, !bWhen, compareDateValues(aWhen, bWhen), directionMultiplier);
    }
    case "currentStage": {
      const aStage = applicationCurrentStageMeta(a.status, a.statusName).label;
      const bStage = applicationCurrentStageMeta(b.status, b.statusName).label;
      return compareEmptyLast(!aStage, !bStage, compareTextValues(aStage, bStage), directionMultiplier);
    }
    case "assignee": {
      const aName = a.assignedRecruiter?.name?.trim() || "";
      const bName = b.assignedRecruiter?.name?.trim() || "";
      return compareEmptyLast(!aName, !bName, compareTextValues(aName, bName), directionMultiplier);
    }
    case "status": {
      const aStatus = progressStatusText(a);
      const bStatus = progressStatusText(b);
      return compareEmptyLast(!aStatus, !bStatus, compareTextValues(aStatus, bStatus), directionMultiplier);
    }
    case "email": {
      const aEmail = resolveApplicationApplicantEmail(a);
      const bEmail = resolveApplicationApplicantEmail(b);
      return compareEmptyLast(!aEmail, !bEmail, compareTextValues(aEmail, bEmail), directionMultiplier);
    }
    case "workflow": {
      const aFlow = String(oneRecord(a.onboarding_flows).name ?? a.workflow_id ?? "").trim();
      const bFlow = String(oneRecord(b.onboarding_flows).name ?? b.workflow_id ?? "").trim();
      return compareEmptyLast(!aFlow, !bFlow, compareTextValues(aFlow, bFlow), directionMultiplier);
    }
    case "dateApplied": {
      const aWhen = a.submitted_at || a.created_at;
      const bWhen = b.submitted_at || b.created_at;
      return compareEmptyLast(!aWhen, !bWhen, compareDateValues(aWhen, bWhen), directionMultiplier);
    }
    case "evaluation": {
      const aWhen = evaluationAnalyzedAt(a);
      const bWhen = evaluationAnalyzedAt(b);
      return compareEmptyLast(!aWhen, !bWhen, compareDateValues(aWhen, bWhen), directionMultiplier);
    }
  }
}

export function sortApplicationRows<T extends ApplicationListSortRow>(
  rows: T[],
  sort: ApplicationListSortState
): T[] {
  if (!sort.column) return rows;

  const sorted = [...rows];
  const directionMultiplier = sort.direction === "asc" ? 1 : -1;

  sorted.sort((a, b) => {
    const cmp = compareColumn(sort.column!, a, b, directionMultiplier);
    if (cmp !== 0) return cmp;
    return compareName(a, b);
  });

  return sorted;
}

import {
  CANDIDATE_MATCH_SCORE_RANGE_OPTIONS,
  isCustomMatchScoreFilter,
  parseCustomMatchScoreRange,
} from "@/lib/admin/candidate-match-score-filter";
import { parseSkillsFilterParam } from "@/lib/jobs/application-skills-filter";
import { normalizeCandidateListSearchText } from "@/lib/workers/candidate-search-normalize";
import { parseWorkersListParams } from "@/lib/workers/workers-status-filter";
import type { WorkerStatus } from "@/lib/workers/workers-status-types";

/**
 * Candidates list search logic (server-side):
 * - `q` free-text ORs across name, email, phone, job title/role, apps, resume, profile skills.
 * - `skills` (comma-separated) ANDs: every skill must appear in profile skills and/or resume text.
 * - When both `q` and `skills` are set, results must match BOTH (AND between the two fields).
 * - Search runs only via `list_candidate_ids_page` (one paged RPC); never scan the tenant in the app.
 */

export const DEFAULT_CANDIDATES_PAGE_SIZE = 15;
export const CANDIDATES_PAGE_SIZE_OPTIONS = [15, 25, 50, 100] as const;

const SERVER_SORT_COLUMNS = new Set([
  "name",
  "firstName",
  "lastName",
  "email",
  "phone",
  "jobRole",
  "status",
  "city",
  "state",
  "createdDate",
  "created_at",
  "jobMatch",
]);

export type CandidateListQueryParams = {
  limit: number;
  offset: number;
  status: WorkerStatus | null;
  q: string;
  /** Parsed skill phrases from `skills` query param (AND filter). */
  skills: string[];
  jobRole: string;
  city: string;
  state: string;
  location: string;
  appliedFrom: string;
  appliedTo: string;
  matchScore: string;
  progressStatusId: string;
  jobTitle: string;
  stage: string;
  assignee: string;
  sort: string;
  sortDir: "asc" | "desc";
  includePhotoUrls: boolean;
  conversion: string;
  headOnly: boolean;
  excludeConverted: boolean;
};

/** True when the request needs RPC search/filter (must not use the unfiltered legacy path). */
export function candidateListRequiresRpcSearch(params: CandidateListQueryParams): boolean {
  return Boolean(
    params.q ||
      params.skills.length ||
      params.jobRole ||
      params.city ||
      params.state ||
      params.appliedFrom ||
      params.appliedTo ||
      params.matchScore ||
      params.progressStatusId ||
      params.jobTitle
  );
}

/** True when the request needs server search/filter (must not use the unfiltered legacy path). */
export function candidateListRequiresServerSearch(params: CandidateListQueryParams): boolean {
  return candidateListRequiresRpcSearch(params) || Boolean(params.assignee);
}

function parseStatus(v: string | null): WorkerStatus | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (
    s === "new" ||
    s === "pending" ||
    s === "for_approval" ||
    s === "approved" ||
    s === "disapproved" ||
    s === "active" ||
    s === "inactive" ||
    s === "cancelled" ||
    s === "banned"
  ) {
    return s;
  }
  return null;
}

function parseLocationParts(location: string): { city: string; state: string } {
  const trimmed = location.trim();
  if (!trimmed) return { city: "", state: "" };
  const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { city: parts[0] ?? "", state: parts[parts.length - 1] ?? "" };
  }
  return { city: trimmed, state: "" };
}

function endOfDayIso(dateOnly: string): string | null {
  const trimmed = dateOnly.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(`${trimmed}T23:59:59.999Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Use next day exclusive bound for `<` filters
  const next = new Date(trimmed + "T00:00:00.000Z");
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

function startOfDayIso(dateOnly: string): string | null {
  const trimmed = dateOnly.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseMatchScoreBounds(matchScoreFilter: string): {
  min: number | null;
  max: number | null;
  maxInclusive: boolean;
} {
  if (!matchScoreFilter) return { min: null, max: null, maxInclusive: true };

  if (isCustomMatchScoreFilter(matchScoreFilter)) {
    const { min, max } = parseCustomMatchScoreRange(matchScoreFilter);
    const minValue = Number(min);
    const maxValue = Number(max);
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
      return { min: null, max: null, maxInclusive: true };
    }
    return {
      min: Math.min(minValue, maxValue),
      max: Math.max(minValue, maxValue),
      maxInclusive: true,
    };
  }

  const option = CANDIDATE_MATCH_SCORE_RANGE_OPTIONS.find((row) => row.id === matchScoreFilter);
  if (!option) return { min: null, max: null, maxInclusive: true };
  return {
    min: option.min,
    max: option.max,
    maxInclusive: option.maxInclusive,
  };
}

export function parseCandidateListQueryParams(
  searchParams: URLSearchParams
): CandidateListQueryParams {
  const { limit: rawLimit, offset } = parseWorkersListParams(searchParams);
  const requestedLimit = Number(searchParams.get("limit"));
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.max(requestedLimit, 1), 500)
      : DEFAULT_CANDIDATES_PAGE_SIZE;
  void rawLimit;

  const status = parseStatus(
    searchParams.get("worker_status") ?? searchParams.get("status")
  );
  const location = (searchParams.get("location") ?? "").trim();
  const locationParts = parseLocationParts(location);
  const city = (searchParams.get("city") ?? locationParts.city).trim();
  const state = (searchParams.get("state") ?? locationParts.state).trim();
  const sortRaw = (searchParams.get("sort") ?? "createdDate").trim();
  const sort = SERVER_SORT_COLUMNS.has(sortRaw) ? sortRaw : "createdDate";
  const sortDirRaw = (searchParams.get("sortDir") ?? searchParams.get("sort_dir") ?? "desc")
    .trim()
    .toLowerCase();
  const sortDir: "asc" | "desc" = sortDirRaw === "asc" ? "asc" : "desc";
  const conversion = searchParams.get("conversion")?.trim().toLowerCase() ?? "";

  return {
    limit: Number.isFinite(Number(searchParams.get("limit"))) ? limit : DEFAULT_CANDIDATES_PAGE_SIZE,
    offset,
    status,
    q: normalizeCandidateListSearchText(
      searchParams.get("q") ?? searchParams.get("search") ?? ""
    ),
    skills: parseSkillsFilterParam(searchParams.get("skills")),
    jobRole: (searchParams.get("jobRole") ?? searchParams.get("job_role") ?? "").trim(),
    city,
    state,
    location,
    appliedFrom: (searchParams.get("appliedFrom") ?? searchParams.get("applied_from") ?? "").trim(),
    appliedTo: (searchParams.get("appliedTo") ?? searchParams.get("applied_to") ?? "").trim(),
    matchScore: (searchParams.get("matchScore") ?? searchParams.get("match_score") ?? "").trim(),
    progressStatusId: (
      searchParams.get("progressStatusId") ??
      searchParams.get("progress_status_id") ??
      ""
    ).trim(),
    jobTitle: (searchParams.get("jobTitle") ?? searchParams.get("job_title") ?? "").trim(),
    stage: (searchParams.get("stage") ?? "").trim(),
    assignee: (searchParams.get("assignee") ?? searchParams.get("assigned_recruiter") ?? "").trim(),
    sort,
    sortDir,
    includePhotoUrls: searchParams.get("includePhotoUrls") === "1",
    conversion,
    headOnly: searchParams.get("head") === "1",
    excludeConverted:
      conversion !== "all" && (status == null || status === "approved" || conversion === "pending"),
  };
}

export function toListCandidateIdsRpcArgs(params: CandidateListQueryParams, tenantId: string) {
  const scoreBounds = parseMatchScoreBounds(params.matchScore);
  const createdFrom = startOfDayIso(params.appliedFrom);
  const createdToExclusive = endOfDayIso(params.appliedTo);
  const sortKey = params.sort
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/_/g, "")
    .toLowerCase();

  // Omit null optional params so PostgREST can match older RPC signatures
  // that predate p_assignee / similar additions (extra keys → schema-cache miss).
  const args: Record<string, unknown> = {
    p_tenant_id: tenantId,
    p_pipeline_status: params.status,
    p_exclude_converted: params.excludeConverted,
    p_search: params.q || null,
    p_job_role: params.jobRole || null,
    p_city: params.city || null,
    p_state: params.state || null,
    p_created_from: createdFrom,
    p_created_to: createdToExclusive,
    p_sort: sortKey || "created_at",
    p_sort_dir: params.sortDir,
    p_limit: params.limit,
    p_offset: params.offset,
    p_match_score_min: scoreBounds.min,
    p_match_score_max: scoreBounds.max,
    p_match_score_max_inclusive: scoreBounds.maxInclusive,
    p_progress_status_id: params.progressStatusId || null,
    p_job_title: params.jobTitle || null,
    p_skills: params.skills.length ? params.skills : null,
  };
  if (params.assignee) {
    args.p_assignee = params.assignee;
  }
  return args;
}

export function buildCandidatesListUrl(
  baseUrl: string,
  params: Partial<{
    limit: number;
    offset: number;
    q: string;
    skills: string;
    jobRole: string;
    location: string;
    appliedFrom: string;
    appliedTo: string;
    status: string;
    matchScore: string;
    progressStatusId: string;
    jobTitle: string;
    stage: string;
    assignee: string;
    sort: string;
    sortDir: "asc" | "desc";
    includePhotoUrls: boolean;
  }>
): string {
  const parsed = new URL(baseUrl, "http://localhost");
  const setIfProvided = (key: string, value: string | number | boolean | undefined | null) => {
    if (value === undefined) return;
    if (value == null || value === "" || value === false) {
      parsed.searchParams.delete(key);
      return;
    }
    parsed.searchParams.set(key, String(value));
  };

  setIfProvided("limit", params.limit);
  setIfProvided("offset", params.offset);
  setIfProvided("q", params.q ? normalizeCandidateListSearchText(params.q) : params.q);
  setIfProvided("skills", params.skills);
  setIfProvided("jobRole", params.jobRole);
  setIfProvided("location", params.location);
  setIfProvided("appliedFrom", params.appliedFrom);
  setIfProvided("appliedTo", params.appliedTo);
  setIfProvided("status", params.status);
  setIfProvided("matchScore", params.matchScore);
  setIfProvided("progressStatusId", params.progressStatusId);
  setIfProvided("jobTitle", params.jobTitle);
  setIfProvided("stage", params.stage);
  setIfProvided("assignee", params.assignee);
  setIfProvided("sort", params.sort);
  setIfProvided("sortDir", params.sortDir);
  if (params.includePhotoUrls === true) parsed.searchParams.set("includePhotoUrls", "1");
  if (params.includePhotoUrls === false) parsed.searchParams.delete("includePhotoUrls");

  return `${parsed.pathname}${parsed.search}`;
}

// app/admin_recruiter/candidates/page.tsx
"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EditColumnsModal } from "./EditColumnsModal";
import {
  columnLabel,
  candidateListColumnAlignmentClassName,
  candidateListColumnClassName,
  candidateListHeaderAlign,
  CANDIDATE_LIST_TABLE_CLASS,
  CANDIDATE_LIST_TABLE_SCROLL_CLASS,
  DEFAULT_CANDIDATE_COLUMNS,
  loadColumnOrder,
  saveColumnOrder,
  type CandidateColumnId,
} from "./column-config";
import { renderListCell } from "./render-list-cell";
import {
  mapWorkerProgressStatusFields,
  useCandidateProgressStatus,
} from "./CandidateProgressStatusCell";
import { CandidateGridCard } from "./CandidateGridCard";
import { CandidatesCardBulkSelectHeader } from "./CandidatesCardBulkSelectHeader";
import { CandidateListSortableHeader } from "./CandidateListSortableHeader";
import type { CandidateRow } from "./types";
import AdvancedSearchModal from "../components/AdvancedSearchModal";
import CandidateCommunicationDialog from "../components/CandidateCommunicationDialog";
import { CandidatesListShell } from "../components/CandidatesListShell";
import { BulkDeleteConfirmModal } from "../components/BulkDeleteConfirmModal";
import { ListTableCheckbox } from "../components/ListTableCheckbox";
import { exportCandidatesCsv, exportCandidatesXls } from "./export-candidates";
import { formatCandidateStatusLabel } from "./candidate-status-badge";
import { CandidatesListSkeleton } from "./CandidatesListSkeleton";
import { useCandidateKpiMetrics } from "./useCandidateKpiMetrics";
import { CandidateAiAnalysisLink } from "./CandidateAiAnalysisLink";
import { CandidateRowActionsMenu } from "../applications/CandidateRowActionsMenu";
import UpdateResumeModal from "../applications/UpdateResumeModal";
import { AssignRecruiterModal, type AssignableTeamMember } from "./AssignRecruiterModal";
import AddCandidateModal from "../applications/AddCandidateModal";
import ImportCandidatesModal from "../applications/ImportCandidatesModal";
import { ScheduleInterviewModal } from "@/app/admin_recruiter/calendar/components/ScheduleInterviewModal";
import {
  invitationSuccessMessage,
  type ScheduleInterviewPayload,
} from "@/lib/interviews/schedule-payload";
import { normalizeApplicationStatus } from "@/lib/jobs/application-status";
import { filterApplicationStatusesForSource } from "@/lib/jobs/msp-submission";
import SuccessModal from "@/app/components/SuccessModal";
import ErrorModal from "@/app/components/ErrorModal";
import { countMultiJobApplicants } from "@/lib/admin/multi-job-applicants";
import { parseSkillsFilterParam } from "@/lib/jobs/application-skills-filter";
import {
  getCandidateJobTitleOptions,
} from "@/lib/admin/candidate-match-job-title";
import {
  describeBulkMatchAnalysisOutcome,
  partitionMatchAnalysisTargets,
  postBulkMatchAnalysis,
} from "@/lib/admin/bulk-match-analysis";
import { useMatchAnalysisProvider } from "@/app/admin_recruiter/applications/MatchAnalysisModelSelect";
import {
  ACTIVE_CANDIDATE_PIPELINE_STATUSES,
  formatPipelineStatusLabel,
} from "@/lib/workers/candidate-status-label";
import {
  buildCandidateStageOptions,
} from "@/lib/admin/candidate-list-stage";
import {
  EMPTY_CANDIDATE_LIST_SORT,
  isCandidateListSortableColumn,
  toggleCandidateListSort,
  type CandidateListSortColumn,
  type CandidateListSortState,
} from "@/lib/admin/candidate-list-sort";
import { useAdminHeaderData } from "@/lib/admin/hooks/use-admin-header-data";
import { usePageSelection } from "../hooks/usePageSelection";
import { CandidateBulkSelectionBar } from "../components/CandidateBulkSelectionBar";
import { ClaimCandidatesConfirmModal } from "../components/ClaimCandidatesConfirmModal";
import { postClaimCandidates } from "./claim-client";
import {
  parseListingRequirementCounts,
  requirementCountsFromAnalyzePayload,
} from "@/lib/jobs/match-analysis/workspace";
import type { AnalysisMode } from "@/lib/jobs/match-analysis/schema";
import { bulkArchiveApplications } from "@/lib/admin/bulk-archive-applications";
import {
  fetchWorkersPageFromApi,
} from "@/lib/workers/candidates-list-fetch";
import { DEFAULT_CANDIDATES_PAGE_SIZE } from "@/lib/workers/candidate-list-params";
import {
  candidatesListPath,
  parseCandidatesListUrlState,
  serializeCandidatesListUrlState,
  type CandidatesListUrlState,
} from "@/lib/workers/candidates-list-url";
import { toPersistedCandidateRow } from "@/lib/lists/staff-list-cache-rows";
import {
  invalidateCandidatesListCache,
  isLatestCandidatesListRequest,
  nextCandidatesListRequest,
  readCandidatesListCache,
  writeCandidatesListCache,
} from "@/lib/workers/candidates-list-session-cache";
import {
  buildAssigneeFilterOptions,
  candidateMatchesAssigneeFilter,
} from "@/lib/candidates/assignee-filter";
import toast from "react-hot-toast";
import {
  formatCityStateFromParts,
  uniqueCityStateOptions,
} from "@/lib/location/city-state";

const ACTION_TOAST_DURATION_MS = 3500;
const SEARCH_DEBOUNCE_MS = 300;

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

type JobPickerOption = {
  id: string;
  title: string;
  status: string;
  clientName: string | null;
};

function resolveCandidateApplicationId(row: CandidateRow): string {
  return (row.matchApplicationId ?? row.progressStatusApplicationId ?? "").trim();
}

type WorkerProfile = {
  id: string;
  user_id?: string | null;
  first_name: string | null;
  last_name: string | null;
  job_role: string | null;
  email: string | null;
  phone: string | null;
  user_email?: string | null;
  user_phone?: string | null;
  applicant_email?: string | null;
  applicant_phone?: string | null;
  address1: string | null;
  address2?: string | null;
  city: string | null;
  state: string | null;
  zip?: string | null;
  created_at: string | null;
  status?: string | null;
  profile_photo?: string | null;
  profile_photo_url?: string | null;
  applied_job_count?: number | null;
  assigned_recruiter_user_id?: string | null;
  assigned_recruiter_name?: string | null;
  assigned_recruiter_photo_url?: string | null;
  application_job_assignees?: Array<{
    application_id?: string | null;
    job_title?: string | null;
    assigned_recruiter_user_id?: string | null;
    assigned_recruiter_name?: string | null;
  }> | null;
  application_id?: string | null;
  application_status_id?: string | null;
  application_status_name?: string | null;
  application_status_key?: string | null;
  application_status_ambiguous?: boolean | null;
  application_job_title?: string | null;
  application_job_titles_text?: string | null;
  application_search_text?: string | null;
  application_client_name?: string | null;
  application_applied_jobs?: Array<{
    job_id?: string | null;
    title?: string | null;
  }> | null;
  application_source_job_id?: string | null;
  application_source_type?: string | null;
  match_application_id?: string | null;
  ai_match_status?: string | null;
  ai_match_score?: number | null;
  ai_match_category?: string | null;
  ai_match_display_category?: string | null;
  ai_match_stage?: string | null;
  ai_requirement_counts?: {
    confirmed?: number | null;
    verify?: number | null;
    notMet?: number | null;
    mandatory?: number | null;
    blocking?: number | null;
  } | null;
};

/** Fixed `en-US` locale so SSR and browser produce identical strings (avoids hydration mismatch). */
function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-US", { timeZone: "America/New_York", 
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const time = d.toLocaleTimeString("en-US", { timeZone: "America/New_York", 
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${date} • ${time}`;
}

function formatDateShort(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { timeZone: "America/New_York", 
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

const DEFAULT_PAGE_SIZE = DEFAULT_CANDIDATES_PAGE_SIZE;
const ADVANCED_SEARCH_STORAGE_KEY = "admin_recruiter_candidates_advanced_search";
type AdvancedSearchParams = { lat: number; lng: number; radius: number; place?: string };

function pickFirstNonEmpty(values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function resolveCandidateContact(item: WorkerProfile) {
  const emailCandidates = [
    { source: "candidate.email", value: item.email },
    { source: "worker.email", value: item.email },
    { source: "profile.email", value: item.user_email },
    { source: "applicant.email", value: item.applicant_email },
  ];
  const phoneCandidates = [
    { source: "candidate.phone", value: item.phone },
    { source: "worker.phone", value: item.phone },
    { source: "profile.phone", value: item.user_phone },
    { source: "applicant.phone", value: item.applicant_phone },
  ];
  const selectedEmail = pickFirstNonEmpty(emailCandidates.map((entry) => entry.value));
  const selectedPhone = pickFirstNonEmpty(phoneCandidates.map((entry) => entry.value));
  const emailSource =
    emailCandidates.find((entry) => typeof entry.value === "string" && entry.value.trim())?.source ?? "none";
  const phoneSource =
    phoneCandidates.find((entry) => typeof entry.value === "string" && entry.value.trim())?.source ?? "none";

  console.debug("[CandidatesCardContactDebug]", {
    candidate_id: item.id,
    worker_id: item.id,
    user_id: item.user_id ?? null,
    selected_email: selectedEmail || null,
    selected_phone: selectedPhone || null,
    email_source: emailSource,
    phone_source: phoneSource,
    raw_contact_fields: {
      worker_email: item.email ?? null,
      worker_phone: item.phone ?? null,
      profile_email: item.user_email ?? null,
      profile_phone: item.user_phone ?? null,
      applicant_email: item.applicant_email ?? null,
      applicant_phone: item.applicant_phone ?? null,
    },
  });

  return { email: selectedEmail, phone: selectedPhone };
}

function mapWorkerMatchFields(item: WorkerProfile) {
  return {
    matchApplicationId: item.match_application_id ?? item.application_id ?? null,
    aiMatchStatus: item.ai_match_status ?? null,
    aiMatchScore: item.ai_match_score ?? null,
    aiMatchCategory: item.ai_match_category ?? null,
    aiMatchDisplayCategory: item.ai_match_display_category ?? null,
    aiMatchStage: item.ai_match_stage ?? null,
    aiRequirementCounts: parseListingRequirementCounts(item.ai_requirement_counts),
  };
}

export default function CandidatesPage() {
  const router = useRouter();
  const [analysisProvider, setAnalysisProvider] = useMatchAnalysisProvider();
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const {
    statusOptions: progressStatusOptions,
    statusMenu: progressStatusMenu,
    setStatusMenu: setProgressStatusMenu,
    statusBusyWorkerId,
    progressStatusUi,
  } = useCandidateProgressStatus(candidates, setCandidates);
  const [totalFromApi, setTotalFromApi] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [jobRoleFilter, setJobRoleFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [appliedDateFrom, setAppliedDateFrom] = useState("");
  const [appliedDateTo, setAppliedDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [progressStatusFilter, setProgressStatusFilter] = useState("");
  const [jobFilter, setJobFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [matchScoreFilter, setMatchScoreFilter] = useState("");
  const [clientNameFilter, setClientNameFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [listSort, setListSort] = useState<CandidateListSortState>(EMPTY_CANDIDATE_LIST_SORT);
  const [view, setView] = useState<"card" | "list">("list");
  const [cardBulkSelectMode, setCardBulkSelectMode] = useState(false);
  const [listColumnOrder, setListColumnOrder] = useState<CandidateColumnId[]>(DEFAULT_CANDIDATE_COLUMNS);
  const [editColumnsOpen, setEditColumnsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [listReady, setListReady] = useState(false);
  const [facetOptions, setFacetOptions] = useState<{
    jobRoles: string[];
    locations: string[];
    statuses: string[];
    jobs: string[];
    clientNames: string[];
    stages: ReturnType<typeof buildCandidateStageOptions>;
  }>({ jobRoles: [], locations: [], statuses: [], jobs: [], clientNames: [], stages: [] });
  const loadAbortRef = useRef<AbortController | null>(null);
  const {
    kpiCards,
    refresh: refreshKpis,
  } = useCandidateKpiMetrics();
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
  const [advancedSearchParams, setAdvancedSearchParams] = useState<AdvancedSearchParams | null>(null);
  const [commTarget, setCommTarget] = useState<CandidateRow | null>(null);
  const [rowActionsMenu, setRowActionsMenu] = useState<{ rowId: string; anchor: HTMLElement } | null>(
    null
  );
  const [assignRecruiterTarget, setAssignRecruiterTarget] = useState<CandidateRow | null>(null);
  const [assignRecruiterMembers, setAssignRecruiterMembers] = useState<AssignableTeamMember[]>([]);
  const [assignRecruiterMembersLoading, setAssignRecruiterMembersLoading] = useState(false);
  const [assignRecruiterBusy, setAssignRecruiterBusy] = useState(false);
  const [assignRecruiterError, setAssignRecruiterError] = useState<string | null>(null);
  // Highlight Multi-Job Applicants is disabled on the legacy /admin_recruiter/candidates screen.
  // const [highlightMultiJob, setHighlightMultiJob] = useState(false);
  // const [filterMultiJobOnly, setFilterMultiJobOnly] = useState(false);
  const [highlightMultiJob, setHighlightMultiJob] = useState(false);
  const [skillsFilter, setSkillsFilter] = useState("");
  const [matchImportJobId, setMatchImportJobId] = useState<string | null>(null);
  const [matchJobPickerOpen, setMatchJobPickerOpen] = useState(false);
  const [matchJobPickerValue, setMatchJobPickerValue] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [claimConfirmOpen, setClaimConfirmOpen] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [matchAnalyzingApplicationIds, setMatchAnalyzingApplicationIds] = useState<Set<string>>(
    () => new Set()
  );
  const [bulkAnalyzingIds, setBulkAnalyzingIds] = useState<Set<string>>(() => new Set());
  const [addCandidateOpen, setAddCandidateOpen] = useState(false);
  const [addCandidateJobs, setAddCandidateJobs] = useState<JobPickerOption[]>([]);
  const [updateResumeApplicationId, setUpdateResumeApplicationId] = useState<string | null>(null);
  const [resumeSuccessOpen, setResumeSuccessOpen] = useState(false);
  const [resumeErrorOpen, setResumeErrorOpen] = useState(false);
  const [resumeErrorMessage, setResumeErrorMessage] = useState("");
  const [interviewTarget, setInterviewTarget] = useState<CandidateRow | null>(null);
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [interviewSubmitting, setInterviewSubmitting] = useState(false);
  const [interviewError, setInterviewError] = useState<string | null>(null);
  const { userId: currentUserId, displayName: currentUserName, tenantId: currentTenantId } =
    useAdminHeaderData();
  const clearSelectionRef = useRef<() => void>(() => {});
  const userIdRef = useRef(currentUserId);
  const tenantIdRef = useRef(currentTenantId);
  const applyingUrlRef = useRef(false);
  const networkListKeyRef = useRef<string | null>(null);
  userIdRef.current = currentUserId;
  tenantIdRef.current = currentTenantId;

  const advancedSearchContext = useMemo(() => {
    if (!advancedSearchParams) {
      return { active: false, lat: 0, lng: 0, radius: 0, place: "" };
    }
    return {
      active: true,
      lat: advancedSearchParams.lat,
      lng: advancedSearchParams.lng,
      radius: advancedSearchParams.radius,
      place: (advancedSearchParams.place ?? "").trim(),
    };
  }, [advancedSearchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(ADVANCED_SEARCH_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<AdvancedSearchParams>;
      const lat = Number(parsed.lat);
      const lng = Number(parsed.lng);
      const radius = Number(parsed.radius);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(radius) && radius > 0) {
        setAdvancedSearchParams({
          lat,
          lng,
          radius,
          place: typeof parsed.place === "string" ? parsed.place : "",
        });
      }
    } catch {
      window.sessionStorage.removeItem(ADVANCED_SEARCH_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("advancedSearch") === "1") {
      setAdvancedSearchOpen(true);
      router.replace("/admin_recruiter/candidates");
    }
  }, [router]);

  const applyAdvancedSearchParams = useCallback((params: AdvancedSearchParams | null) => {
    setAdvancedSearchParams(params);
    if (typeof window === "undefined") return;
    if (!params) {
      window.sessionStorage.removeItem(ADVANCED_SEARCH_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(ADVANCED_SEARCH_STORAGE_KEY, JSON.stringify(params));
  }, []);

  useEffect(() => {
    setListColumnOrder(loadColumnOrder());
  }, []);

  const loadAddCandidateJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/jobs?fields=picker", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to load jobs");
      setAddCandidateJobs((payload.jobs ?? []) as JobPickerOption[]);
    } catch {
      setAddCandidateJobs([]);
    }
  }, []);

  useEffect(() => {
    void loadAddCandidateJobs();
  }, [loadAddCandidateJobs]);

  const addCandidateJobOptions = useMemo(
    () =>
      addCandidateJobs
        .map((job) => ({
          id: job.id,
          title: job.title,
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [addCandidateJobs]
  );

  const mapWorkerToRow = useCallback((item: WorkerProfile): CandidateRow => {
    const { email, phone } = resolveCandidateContact(item);
    return {
      id: item.id,
      name: `${item.first_name || ""} ${item.last_name || ""}`.trim(),
      firstName: item.first_name ?? "",
      lastName: item.last_name ?? "",
      role: item.job_role || "N/A",
      applicationJobTitle: item.application_job_title ?? null,
      applicationJobTitlesText: item.application_job_titles_text ?? null,
      applicationSearchText: item.application_search_text ?? null,
      applicationClientName: item.application_client_name ?? null,
      appliedJobs: Array.isArray(item.application_applied_jobs)
        ? item.application_applied_jobs
            .map((entry) => {
              const jobId = String(entry?.job_id ?? "").trim();
              const title = String(entry?.title ?? "").trim();
              if (!jobId || !title) return null;
              return { jobId, title };
            })
            .filter((entry): entry is { jobId: string; title: string } => Boolean(entry))
        : [],
      applicationSourceJobId: item.application_source_job_id ?? null,
      email,
      phone,
      address: [item.address1, item.city, item.state].filter(Boolean).join(", "),
      city: item.city ?? "",
      state: item.state ?? "",
      zip: item.zip ?? "",
      address1: item.address1 ?? "",
      address2: item.address2 ?? "",
      status: formatCandidateStatusLabel(item.status as string | undefined),
      statusKey: item.status ?? null,
      ...mapWorkerProgressStatusFields(item),
      createdAt: item.created_at,
      reference: item.id.slice(0, 7).toUpperCase(),
      dateOfBirth: null,
      profilePhotoUrl: item.profile_photo_url ?? null,
      appliedJobCount: Number(item.applied_job_count ?? 1),
      assignedRecruiterUserId: item.assigned_recruiter_user_id ?? null,
      assignedRecruiterName: item.assigned_recruiter_name ?? null,
      assignedRecruiterPhotoUrl: item.assigned_recruiter_photo_url ?? null,
      jobAssignees: Array.isArray(item.application_job_assignees)
        ? item.application_job_assignees
            .map((entry) => {
              const applicationId = String(entry?.application_id ?? "").trim();
              const jobTitle = String(entry?.job_title ?? "").trim();
              if (!applicationId || !jobTitle) return null;
              return {
                applicationId,
                jobTitle,
                assignedRecruiterUserId:
                  String(entry?.assigned_recruiter_user_id ?? "").trim() || null,
                assignedRecruiterName:
                  String(entry?.assigned_recruiter_name ?? "").trim() || null,
              };
            })
            .filter(
              (
                entry
              ): entry is NonNullable<CandidateRow["jobAssignees"]>[number] =>
                Boolean(entry)
            )
        : [],
      ...mapWorkerMatchFields(item),
    };
  }, []);

  const loadCandidates = useCallback(async (overrideAdvancedSearch?: AdvancedSearchParams | null) => {
    const activeSearch = overrideAdvancedSearch === undefined ? advancedSearchParams : overrideAdvancedSearch;
    const requestId = nextCandidatesListRequest();
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const listUrlState: CandidatesListUrlState = {
      q: debouncedQuery,
      skills: skillsFilter,
      jobRole: jobRoleFilter,
      location: locationFilter,
      appliedFrom: appliedDateFrom,
      appliedTo: appliedDateTo,
      status: statusFilter,
      progressStatusId: progressStatusFilter,
      jobTitle: jobFilter,
      stage: stageFilter,
      matchScore: matchScoreFilter,
      clientName: clientNameFilter,
      assignee: assigneeFilter,
      sortColumn: listSort.column,
      sortDir: listSort.direction,
      page,
      pageSize,
      multiJob: highlightMultiJob,
    };
    const cacheScope = `${userIdRef.current ?? ""}:${tenantIdRef.current ?? ""}`;
    const cacheKey = serializeCandidatesListUrlState(listUrlState);
    const cached = activeSearch ? null : readCandidatesListCache<CandidateRow>(cacheScope, cacheKey);
    if (cached) {
      setCandidates(cached.rows);
      setTotalFromApi(cached.total);
      setLoading(false);
      setListError(null);
    } else {
      setLoading(true);
      setListError(null);
      setCandidates([]);
      setTotalFromApi(null);
    }
    try {
      if (activeSearch) {
        const res = await fetch("/api/search-workers", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            lat: activeSearch.lat,
            lng: activeSearch.lng,
            radius: activeSearch.radius,
            ...(activeSearch.place ? { place: activeSearch.place } : {}),
          }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to fetch search results");

        const rows: WorkerProfile[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.workers)
            ? data.workers
            : [];
        const mapped = rows.map(mapWorkerToRow);
        setTotalFromApi(mapped.length);
        setCandidates(mapped);
        clearSelectionRef.current();
        return;
      }

      const skillTags = parseSkillsFilterParam(skillsFilter);
      const { workers: rows, total } = await fetchWorkersPageFromApi<WorkerProfile>(
        "/api/workers",
        {
          page,
          pageSize,
          q: debouncedQuery || undefined,
          skills: skillTags.length ? skillTags.join(",") : undefined,
          jobRole: jobRoleFilter || undefined,
          location: locationFilter || undefined,
          appliedFrom: appliedDateFrom || undefined,
          appliedTo: appliedDateTo || undefined,
          status: statusFilter
            ? ACTIVE_CANDIDATE_PIPELINE_STATUSES.find(
                (s) => formatPipelineStatusLabel(s) === statusFilter
              ) || undefined
            : undefined,
          matchScore: matchScoreFilter || undefined,
          progressStatusId: progressStatusFilter || undefined,
          jobTitle: jobFilter || undefined,
          stage: stageFilter || undefined,
          assignee: assigneeFilter || undefined,
          sort: listSort.column ?? "createdDate",
          sortDir: listSort.column ? listSort.direction : "desc",
          includePhotoUrls: true,
        },
        { signal: controller.signal }
      );
      setTotalFromApi(total);

      const mapped = rows.map(mapWorkerToRow);
      if (!isLatestCandidatesListRequest(requestId)) return;
      networkListKeyRef.current = cacheKey;
      setCandidates(mapped);
      setFacetOptions((prev) => {
        const jobRoles = new Set(prev.jobRoles);
        const locations = new Set(prev.locations);
        const statuses = new Set(
          ACTIVE_CANDIDATE_PIPELINE_STATUSES.map((status) => formatPipelineStatusLabel(status))
        );
        const jobs = new Set(prev.jobs);
        const clientNames = new Set(prev.clientNames);
        for (const c of mapped) {
          if (c.role && c.role !== "N/A") jobRoles.add(c.role);
          const loc = formatCityStateFromParts(c.city, c.state);
          if (loc) locations.add(loc);
          if (c.status) statuses.add(c.status);
          for (const title of getCandidateJobTitleOptions(c)) jobs.add(title);
          const clientName = c.applicationClientName?.trim();
          if (clientName) clientNames.add(clientName);
        }
        return {
          jobRoles: Array.from(jobRoles).sort((a, b) => a.localeCompare(b)),
          locations: uniqueCityStateOptions(Array.from(locations)),
          statuses: Array.from(statuses).sort((a, b) => a.localeCompare(b)),
          jobs: Array.from(jobs).sort((a, b) => a.localeCompare(b)),
          clientNames: Array.from(clientNames).sort((a, b) => a.localeCompare(b)),
          stages: buildCandidateStageOptions([...mapped]),
        };
      });
      const writeScope = `${userIdRef.current ?? ""}:${tenantIdRef.current ?? ""}`;
      writeCandidatesListCache(
        writeScope,
        cacheKey,
        mapped,
        total,
        mapped.map(toPersistedCandidateRow)
      );
      clearSelectionRef.current();
    } catch (err) {
      if (isAbortError(err)) return;
      if (!isLatestCandidatesListRequest(requestId)) return;
      console.error("Failed to fetch workers:", err);
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) {
        invalidateCandidatesListCache();
        setCandidates([]);
        setTotalFromApi(null);
      } else if (!cached) {
        setCandidates([]);
        setTotalFromApi(null);
      }
      setListError(err instanceof Error ? err.message : "Failed to search candidates");
      clearSelectionRef.current();
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [
    advancedSearchParams,
    mapWorkerToRow,
    page,
    pageSize,
    debouncedQuery,
    skillsFilter,
    jobRoleFilter,
    locationFilter,
    appliedDateFrom,
    appliedDateTo,
    statusFilter,
    matchScoreFilter,
    progressStatusFilter,
    jobFilter,
    stageFilter,
    assigneeFilter,
    listSort,
    clientNameFilter,
    highlightMultiJob,
  ]);

  useEffect(() => {
    const parsed = parseCandidatesListUrlState(new URLSearchParams(window.location.search));
    applyingUrlRef.current = true;
    setQuery(parsed.q);
    setDebouncedQuery(parsed.q.trim());
    setSkillsFilter(parsed.skills);
    setJobRoleFilter(parsed.jobRole);
    setLocationFilter(parsed.location);
    setAppliedDateFrom(parsed.appliedFrom);
    setAppliedDateTo(parsed.appliedTo);
    setStatusFilter(parsed.status);
    setProgressStatusFilter(parsed.progressStatusId);
    setJobFilter(parsed.jobTitle);
    setStageFilter(parsed.stage);
    setMatchScoreFilter(parsed.matchScore);
    setClientNameFilter(parsed.clientName);
    setAssigneeFilter(parsed.assignee);
    setListSort(
      parsed.sortColumn
        ? { column: parsed.sortColumn, direction: parsed.sortDir }
        : EMPTY_CANDIDATE_LIST_SORT
    );
    setPage(parsed.page);
    setPageSize(parsed.pageSize);
    setHighlightMultiJob(parsed.multiJob);
    setListReady(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const jobRoleOptions = facetOptions.jobRoles;
  const locationOptions = facetOptions.locations;
  const statusOptions = facetOptions.statuses;
  const jobOptions = facetOptions.jobs;
  const stageOptions = facetOptions.stages;
  const clientNameOptions = useMemo(() => {
    const names = new Set(facetOptions.clientNames);
    for (const job of addCandidateJobs) {
      const clientName = job.clientName?.trim();
      if (clientName) names.add(clientName);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [facetOptions.clientNames, addCandidateJobs]);

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeFilterOptions(
        candidates.flatMap((row) => {
          const fromJobs = (row.jobAssignees ?? [])
            .map((entry) => ({
              id: entry.assignedRecruiterUserId,
              name: entry.assignedRecruiterName,
            }))
            .filter((entry) => Boolean(entry.id));
          if (fromJobs.length > 0) return fromJobs;
          return [
            {
              id: row.assignedRecruiterUserId,
              name: row.assignedRecruiterName,
            },
          ];
        })
      ),
    [candidates]
  );

  const progressStatusFilterOptions = useMemo(() => {
    const jobNeedle = jobFilter.trim().toLowerCase();
    const scopedRows = jobNeedle
      ? candidates.filter((row) => {
          const titles = [
            row.applicationJobTitle,
            row.applicationJobTitlesText,
            ...(row.appliedJobs ?? []).map((job) => job.title),
          ]
            .map((value) => String(value ?? "").trim().toLowerCase())
            .filter(Boolean);
          return titles.some((title) => title === jobNeedle || title.includes(jobNeedle));
        })
      : candidates;
    const sources = new Set(
      scopedRows
        .map((row) => String(row.applicationSourceType ?? "").trim().toLowerCase())
        .filter((source) => source === "msp" || source === "internal")
    );
    const scopedOptions =
      sources.size === 1
        ? filterApplicationStatusesForSource(progressStatusOptions, [...sources][0])
        : progressStatusOptions;
    return scopedOptions.map((option) => ({
      value: option.id,
      label: option.name,
      sortOrder: option.sortOrder,
      groupName: option.groupName,
      groupDescription: option.groupDescription,
      groupSortOrder: option.groupSortOrder,
      groupSystemKey: option.groupSystemKey,
    }));
  }, [candidates, jobFilter, progressStatusOptions]);

  const multiJobApplicantCount = useMemo(
    () => countMultiJobApplicants(candidates, (candidate) => Number(candidate.appliedJobCount ?? 1)),
    [candidates]
  );

  const visibleCandidates = useMemo(() => {
    return candidates.filter((row) => {
      if (highlightMultiJob && Number(row.appliedJobCount ?? 1) <= 1) return false;
      if (clientNameFilter.trim()) {
        const wanted = clientNameFilter.trim().toLowerCase();
        if ((row.applicationClientName ?? "").trim().toLowerCase() !== wanted) return false;
      }
      return candidateMatchesAssigneeFilter(
        row.assignedRecruiterUserId,
        assigneeFilter,
        (row.jobAssignees ?? []).map((entry) => entry.assignedRecruiterUserId)
      );
    });
  }, [
    candidates,
    highlightMultiJob,
    clientNameFilter,
    assigneeFilter,
    advancedSearchContext.active,
  ]);
  const hasClientSideListFilter =
    highlightMultiJob ||
    Boolean(clientNameFilter.trim()) ||
    (advancedSearchContext.active && Boolean(assigneeFilter.trim()));
  const listDisplayTotal = hasClientSideListFilter
    ? visibleCandidates.length
    : (totalFromApi ?? candidates.length);

  const listUrlState = useMemo<CandidatesListUrlState>(
    () => ({
      q: debouncedQuery,
      skills: skillsFilter,
      jobRole: jobRoleFilter,
      location: locationFilter,
      appliedFrom: appliedDateFrom,
      appliedTo: appliedDateTo,
      status: statusFilter,
      progressStatusId: progressStatusFilter,
      jobTitle: jobFilter,
      stage: stageFilter,
      matchScore: matchScoreFilter,
      clientName: clientNameFilter,
      assignee: assigneeFilter,
      sortColumn: listSort.column,
      sortDir: listSort.direction,
      page,
      pageSize,
      multiJob: highlightMultiJob,
    }),
    [
      debouncedQuery,
      skillsFilter,
      jobRoleFilter,
      locationFilter,
      appliedDateFrom,
      appliedDateTo,
      statusFilter,
      progressStatusFilter,
      jobFilter,
      stageFilter,
      matchScoreFilter,
      clientNameFilter,
      assigneeFilter,
      listSort,
      page,
      pageSize,
      highlightMultiJob,
    ]
  );
  const filterKey = serializeCandidatesListUrlState({ ...listUrlState, page: 1 });
  const listFetchKey = `${serializeCandidatesListUrlState(listUrlState)}|geo:${
    advancedSearchContext.active
      ? `${advancedSearchContext.lat},${advancedSearchContext.lng},${advancedSearchContext.radius},${advancedSearchContext.place}`
      : ""
  }`;
  const loadCandidatesRef = useRef(loadCandidates);
  loadCandidatesRef.current = loadCandidates;
  const lastFetchedListKeyRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!listReady || !currentUserId || !currentTenantId || advancedSearchContext.active) return;
    const key = serializeCandidatesListUrlState(listUrlState);
    if (networkListKeyRef.current === key) return;
    const cached = readCandidatesListCache<CandidateRow>(`${currentUserId}:${currentTenantId}`, key);
    if (!cached) return;
    setCandidates(cached.rows);
    setTotalFromApi(cached.total);
    setLoading(false);
    setListError(null);
  }, [advancedSearchContext.active, currentTenantId, currentUserId, listReady, listUrlState]);

  useLayoutEffect(() => {
    if (!listReady) return;
    if (lastFetchedListKeyRef.current === listFetchKey) return;
    lastFetchedListKeyRef.current = listFetchKey;
    void loadCandidatesRef.current();
    return () => loadAbortRef.current?.abort();
  }, [listReady, listFetchKey]);
  const filterKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!listReady) return;
    if (applyingUrlRef.current) {
      applyingUrlRef.current = false;
      filterKeyRef.current = filterKey;
      return;
    }
    if (filterKeyRef.current === null) {
      filterKeyRef.current = filterKey;
      return;
    }
    if (filterKeyRef.current !== filterKey) {
      filterKeyRef.current = filterKey;
      setPage(1);
    }
  }, [filterKey, listReady]);

  useEffect(() => {
    if (!listReady) return;
    if (!window.location.pathname.endsWith("/admin_recruiter/candidates")) return;
    const currentSerialized = serializeCandidatesListUrlState(
      parseCandidatesListUrlState(new URLSearchParams(window.location.search))
    );
    const nextSerialized = serializeCandidatesListUrlState(listUrlState);
    if (currentSerialized === nextSerialized) return;
    const currentFilters = serializeCandidatesListUrlState({
      ...parseCandidatesListUrlState(new URLSearchParams(window.location.search)),
      page: 1,
    });
    const nextFilters = serializeCandidatesListUrlState({ ...listUrlState, page: 1 });
    if (currentFilters !== nextFilters && listUrlState.page !== 1) return;
    const nextPath = candidatesListPath(listUrlState);
    window.history.pushState(null, "", nextPath);
  }, [listReady, listUrlState]);

  useEffect(() => {
    const onPopState = () => {
      const parsed = parseCandidatesListUrlState(new URLSearchParams(window.location.search));
      applyingUrlRef.current = true;
      setQuery(parsed.q);
      setDebouncedQuery(parsed.q.trim());
      setSkillsFilter(parsed.skills);
      setJobRoleFilter(parsed.jobRole);
      setLocationFilter(parsed.location);
      setAppliedDateFrom(parsed.appliedFrom);
      setAppliedDateTo(parsed.appliedTo);
      setStatusFilter(parsed.status);
      setProgressStatusFilter(parsed.progressStatusId);
      setJobFilter(parsed.jobTitle);
      setStageFilter(parsed.stage);
      setMatchScoreFilter(parsed.matchScore);
      setClientNameFilter(parsed.clientName);
      setAssigneeFilter(parsed.assignee);
      setListSort(
        parsed.sortColumn
          ? { column: parsed.sortColumn, direction: parsed.sortDir }
          : EMPTY_CANDIDATE_LIST_SORT
      );
      setPage(parsed.page);
      setPageSize(parsed.pageSize);
      setHighlightMultiJob(parsed.multiJob);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const paginated = visibleCandidates;

  const handleListSort = useCallback((column: CandidateListSortColumn) => {
    setListSort((current) => toggleCandidateListSort(current, column));
  }, []);

  const pageSelectableRows = useMemo(
    () =>
      paginated.map((candidate) => ({
        id: candidate.id,
        // Selection is for export / archive / delete / analyze — not claim-gated.
        eligible: true,
      })),
    [paginated]
  );
  const selectionClearKey = useMemo(
    () =>
      [
        page,
        pageSize,
        debouncedQuery,
        skillsFilter,
        jobRoleFilter,
        statusFilter,
        progressStatusFilter,
        jobFilter,
        stageFilter,
        matchScoreFilter,
        clientNameFilter,
        assigneeFilter,
        locationFilter,
        appliedDateFrom,
        appliedDateTo,
        advancedSearchContext.active ? "adv" : "std",
      ].join("|"),
    [
      page,
      pageSize,
      debouncedQuery,
      skillsFilter,
      jobRoleFilter,
      statusFilter,
      progressStatusFilter,
      jobFilter,
      stageFilter,
      matchScoreFilter,
      clientNameFilter,
      assigneeFilter,
      locationFilter,
      appliedDateFrom,
      appliedDateTo,
      advancedSearchContext.active,
    ]
  );

  const selection = usePageSelection({
    pageRows: pageSelectableRows,
    clearKey: selectionClearKey,
  });
  clearSelectionRef.current = selection.clearSelection;

  const selectedCandidates = useMemo(
    () => candidates.filter((row) => selection.selectedIds.has(row.id)),
    [candidates, selection.selectedIds]
  );

  const exportCandidates = useMemo(() => {
    if (selection.selectedCount === 0) return visibleCandidates;
    const selected = visibleCandidates.filter((row) => selection.selectedIds.has(row.id));
    return selected.length > 0 ? selected : visibleCandidates;
  }, [visibleCandidates, selection.selectedCount, selection.selectedIds]);

  const selectedMatchTargets = useMemo(
    () =>
      selectedCandidates.map((row) => ({
        applicationId: row.matchApplicationId,
        status: row.aiMatchStatus,
      })),
    [selectedCandidates]
  );

  const { analyzeIds: selectedAnalyzeIds, reanalyzeIds: selectedReanalyzeIds } = useMemo(
    () => partitionMatchAnalysisTargets(selectedMatchTargets),
    [selectedMatchTargets]
  );

  const { analyzeIds: pageAnalyzeIds } = useMemo(
    () =>
      partitionMatchAnalysisTargets(
        candidates.map((row) => ({
          applicationId: row.matchApplicationId,
          status: row.aiMatchStatus,
        }))
      ),
    [candidates]
  );

  const handleExportCandidatesCsv = useCallback(() => {
    if (exportCandidates.length === 0) {
      toast.error("No candidates to export");
      return;
    }
    exportCandidatesCsv(exportCandidates, { columnOrder: listColumnOrder });
  }, [exportCandidates, listColumnOrder]);

  const handleExportCandidatesXls = useCallback(() => {
    if (exportCandidates.length === 0) {
      toast.error("No candidates to export");
      return;
    }
    exportCandidatesXls(exportCandidates, { columnOrder: listColumnOrder });
  }, [exportCandidates, listColumnOrder]);

  async function handleBulkArchiveSelected() {
    const applicationIds = selectedCandidates
      .map((row) => row.matchApplicationId?.trim() ?? "")
      .filter(Boolean);
    if (archiveBusy) return;
    if (applicationIds.length === 0) {
      toast.error("Selected candidates have no linked job applications to archive.");
      return;
    }
    setArchiveBusy(true);
    try {
      const { archived, failed } = await bulkArchiveApplications(applicationIds);
      if (archived > 0) {
        invalidateCandidatesListCache();
        toast.success(`Archived ${archived} candidate${archived === 1 ? "" : "s"}`, {
          duration: ACTION_TOAST_DURATION_MS,
        });
        if (advancedSearchContext.active) {
          void loadCandidates(null);
        } else {
          void loadCandidates();
        }
        selection.clearSelection();
      } else if (failed === 0) {
        toast.success("No candidates needed archiving");
      }
      if (failed > 0) {
        toast.error(`Failed to archive ${failed} candidate${failed === 1 ? "" : "s"}`);
      }
    } catch (archiveErr) {
      toast.error(
        archiveErr instanceof Error ? archiveErr.message : "Failed to archive candidates"
      );
    } finally {
      setArchiveBusy(false);
    }
  }

  function openClaimConfirm() {
    if (selection.selectedEligibleCount === 0) {
      toast("Select eligible unclaimed candidates first.");
      return;
    }
    setClaimError(null);
    setClaimConfirmOpen(true);
  }

  async function runMatchAnalyze(applicationId: string, mode: AnalysisMode = "analyze") {
    const candidate = candidates.find((row) => row.matchApplicationId === applicationId);
    setMatchAnalyzingApplicationIds((current) => new Set(current).add(applicationId));
    try {
      const response = await fetch(`/api/admin/job-applications/${applicationId}/match-analysis`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisMode: mode, analysisProvider }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Match analysis failed");
      setCandidates((current) =>
        current.map((row) =>
          row.matchApplicationId === applicationId
            ? {
                ...row,
                aiMatchStatus: payload.status ?? row.aiMatchStatus,
                aiMatchScore: payload.score ?? row.aiMatchScore,
                aiMatchCategory: payload.category ?? row.aiMatchCategory,
                aiMatchDisplayCategory:
                  payload.analysis?.candidate_match?.display_category ?? row.aiMatchDisplayCategory,
                aiMatchStage: payload.stage ?? payload.ai_match_stage ?? row.aiMatchStage,
                aiRequirementCounts:
                  requirementCountsFromAnalyzePayload(payload) ?? row.aiRequirementCounts,
              }
            : row
        )
      );
      if (payload.status === "NEEDS_REVIEW") {
        toast.error(payload.error || "Needs résumé text before analysis");
      } else {
        toast.success(
          `${candidate?.name || "Candidate"}: ${mode === "deep" ? "deeper match analysis" : "match analysis"} complete`,
          {
            duration: ACTION_TOAST_DURATION_MS,
          }
        );
      }
    } catch (analyzeError) {
      toast.error(analyzeError instanceof Error ? analyzeError.message : "Match analysis failed");
    } finally {
      setMatchAnalyzingApplicationIds((current) => {
        const next = new Set(current);
        next.delete(applicationId);
        return next;
      });
    }
  }

  async function runBulkMatchAnalyze(
    ids: string[],
    label: "Analyze" | "Reanalyze",
    options?: { emptyMessage?: string }
  ) {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (!uniqueIds.length) {
      toast.error(
        options?.emptyMessage ??
          (label === "Reanalyze"
            ? "None of the selected candidates have been analyzed yet"
            : "Selected candidates are already analyzed — use Reanalyze")
      );
      return;
    }
    if (bulkAnalyzingIds.size > 0 || matchAnalyzingApplicationIds.size > 0) return;

    setBulkAnalyzingIds(new Set(uniqueIds));
    setCandidates((current) =>
      current.map((row) =>
        row.matchApplicationId && uniqueIds.includes(row.matchApplicationId)
          ? { ...row, aiMatchStatus: "ANALYZING" }
          : row
      )
    );

    try {
      const summary = await postBulkMatchAnalysis(
        uniqueIds,
        (chunk) => {
          const byId = new Map(chunk.map((item) => [item.jobApplicationId, item]));
          setCandidates((current) =>
            current.map((row) => {
              const applicationId = row.matchApplicationId?.trim() ?? "";
              const item = applicationId ? byId.get(applicationId) : undefined;
              if (!item?.result) return row;
              const result = item.result;
              return {
                ...row,
                aiMatchStatus: result.status ?? row.aiMatchStatus,
                aiMatchScore: result.score ?? row.aiMatchScore,
                aiMatchCategory: result.category ?? row.aiMatchCategory,
                aiMatchDisplayCategory:
                  result.analysis?.candidate_match?.display_category ?? row.aiMatchDisplayCategory,
                aiMatchStage: result.stage ?? result.ai_match_stage ?? row.aiMatchStage,
                aiRequirementCounts: result.requirementCounts ?? row.aiRequirementCounts,
              };
            })
          );
        },
        { analysisProvider }
      );
      const outcome = describeBulkMatchAnalysisOutcome(summary);
      if (outcome.ok) {
        toast.success(outcome.message, { duration: ACTION_TOAST_DURATION_MS });
      } else {
        toast.error(outcome.message);
      }
    } catch (analyzeError) {
      setCandidates((current) =>
        current.map((row) =>
          row.matchApplicationId &&
          uniqueIds.includes(row.matchApplicationId) &&
          row.aiMatchStatus === "ANALYZING"
            ? { ...row, aiMatchStatus: "FAILED" }
            : row
        )
      );
      toast.error(
        analyzeError instanceof Error ? analyzeError.message : "Bulk match analysis failed"
      );
    } finally {
      setBulkAnalyzingIds(new Set());
    }
  }

  const bulkAnalyzeBusy = bulkAnalyzingIds.size > 0;

  function beginUpdateResume(workerId: string) {
    const row = candidates.find((item) => item.id === workerId);
    if (!row) return;
    const applicationId = resolveCandidateApplicationId(row);
    if (!applicationId) {
      setResumeErrorMessage(
        "This candidate has no linked job application yet. Open a job application to update the resume."
      );
      setResumeErrorOpen(true);
      return;
    }
    setUpdateResumeApplicationId(applicationId);
  }

  function handleResumeUpdated(
    applicationId: string,
    result: {
      resumeUploaded: boolean;
      firstName: string;
      lastName: string;
      autoQuickMatch?: {
        status: string;
        error: string | null;
        score: number | null;
        category: string | null;
        displayCategory?: string | null;
        requirementCounts?: {
          confirmed: number;
          verify: number;
          notMet: number;
        } | null;
      } | null;
    }
  ) {
    const nextName =
      [result.firstName, result.lastName].filter(Boolean).join(" ").trim() || "Candidate";
    const match = result.resumeUploaded ? result.autoQuickMatch : null;
    const matchOk = match?.status === "ANALYZED";
    const matchFailed = Boolean(
      result.resumeUploaded && match && match.status !== "ANALYZED"
    );

    setCandidates((current) =>
      current.map((row) => {
        if (resolveCandidateApplicationId(row) !== applicationId) return row;
        const renamed: CandidateRow = {
          ...row,
          firstName: result.firstName,
          lastName: result.lastName,
          name: nextName,
        };
        if (!result.resumeUploaded) return renamed;
        if (matchOk && match) {
          return {
            ...renamed,
            aiMatchStatus: match.status,
            aiMatchScore: match.score ?? null,
            aiMatchCategory: match.category ?? null,
            aiMatchDisplayCategory: match.displayCategory ?? null,
            aiMatchStage: "quick",
            aiRequirementCounts: match.requirementCounts ?? null,
          };
        }
        return {
          ...renamed,
          aiMatchStatus: matchFailed ? "FAILED" : "READY",
          aiMatchScore: null,
          aiMatchCategory: null,
          aiMatchDisplayCategory: null,
          aiMatchStage: null,
          aiRequirementCounts: null,
        };
      })
    );

    if (result.resumeUploaded) {
      invalidateCandidatesListCache();
      toast.success(`${nextName}: resume updated successfully`, {
        duration: ACTION_TOAST_DURATION_MS,
      });
      setResumeSuccessOpen(true);
      if (matchOk) {
        toast.success(`${nextName}: Quick Match complete`, {
          duration: ACTION_TOAST_DURATION_MS,
        });
      } else if (matchFailed) {
        toast.error(
          match?.error?.trim() ||
            "Quick Match did not finish — use Re-run Quick Match to try again."
        );
      }
    } else {
      invalidateCandidatesListCache();
      toast.success(`${nextName}: candidate details updated`, {
        duration: ACTION_TOAST_DURATION_MS,
      });
    }
  }

  function beginSetupInterview(workerId: string) {
    const row = candidates.find((item) => item.id === workerId);
    if (!row) return;
    if (!resolveCandidateApplicationId(row)) {
      toast.error("Candidate has no linked job application yet");
      return;
    }
    setInterviewTarget(row);
    setInterviewError(null);
    setInterviewOpen(true);
  }

  async function handleScheduleInterview(payload: ScheduleInterviewPayload) {
    if (!interviewTarget) return;
    const applicationId = resolveCandidateApplicationId(interviewTarget);
    if (!applicationId) {
      toast.error("Candidate has no linked job application yet");
      return;
    }
    setInterviewSubmitting(true);
    setInterviewError(null);
    try {
      const response = await fetch("/api/admin/applicant-appointments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          applicationId,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        statusUpdated?: boolean;
        invitation?: {
          sentCount: number;
          failedCount: number;
          skippedCount: number;
          invitationStatus: "sent" | "partial" | "failed" | "pending";
        };
      };
      if (!response.ok) throw new Error(data.error || "Failed to schedule interview");
      if (data.statusUpdated) {
        setCandidates((current) =>
          current.map((row) =>
            row.id === interviewTarget.id
              ? {
                  ...row,
                  status: "interviewing",
                  statusKey: "interviewing",
                  progressStatusKey: "interviewing",
                }
              : row
          )
        );
      }
      setInterviewOpen(false);
      setInterviewError(null);
      setInterviewTarget(null);
      toast.success(
        `${interviewTarget.name || "Candidate"}: ${invitationSuccessMessage(data.invitation)}`,
        { duration: ACTION_TOAST_DURATION_MS }
      );
    } catch (scheduleError) {
      const message =
        scheduleError instanceof Error ? scheduleError.message : "Failed to schedule interview";
      setInterviewError(message);
      toast.error(message);
    } finally {
      setInterviewSubmitting(false);
    }
  }

  async function openAssignRecruiter(row: CandidateRow) {
    setAssignRecruiterTarget(row);
    setAssignRecruiterError(null);
    setAssignRecruiterMembersLoading(true);
    try {
      const response = await fetch("/api/admin/team-members", {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        members?: AssignableTeamMember[];
      };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load team members");
      }
      setAssignRecruiterMembers(payload.members ?? []);
    } catch (err) {
      setAssignRecruiterMembers([]);
      setAssignRecruiterError(err instanceof Error ? err.message : "Failed to load team members");
    } finally {
      setAssignRecruiterMembersLoading(false);
    }
  }

  async function confirmAssignRecruiter(assigneeUserId: string | null) {
    if (!assignRecruiterTarget || assignRecruiterBusy) return;
    setAssignRecruiterBusy(true);
    setAssignRecruiterError(null);
    try {
      const response = await fetch(
        `/api/admin/workers/${encodeURIComponent(assignRecruiterTarget.id)}/assignment`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignedRecruiterUserId: assigneeUserId }),
        }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        assignedRecruiterUserId?: string | null;
        assignedRecruiter?: { id: string; name: string; profilePhotoUrl?: string | null } | null;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to assign recruiter");
      }
      const nextId = payload.assignedRecruiterUserId ?? null;
      const nextName = payload.assignedRecruiter?.name?.trim() || null;
      const nextPhoto = payload.assignedRecruiter?.profilePhotoUrl ?? null;
      setCandidates((current) =>
        current.map((row) =>
          row.id === assignRecruiterTarget.id
            ? {
                ...row,
                assignedRecruiterUserId: nextId,
                assignedRecruiterName: nextName,
                assignedRecruiterPhotoUrl: nextId ? nextPhoto : null,
              }
            : row
        )
      );
      toast.success(nextName ? `Assigned to ${nextName}` : "Recruiter unassigned");
      invalidateCandidatesListCache();
      setAssignRecruiterTarget(null);
    } catch (err) {
      setAssignRecruiterError(err instanceof Error ? err.message : "Failed to assign recruiter");
    } finally {
      setAssignRecruiterBusy(false);
    }
  }

  async function confirmClaimCandidates() {
    if (claimBusy || selection.selectedEligibleIds.length === 0) return;
    setClaimBusy(true);
    setClaimError(null);
    try {
      const result = await postClaimCandidates(selection.selectedEligibleIds);
      invalidateCandidatesListCache();
      toast.success(result.summary);
      const claimed = new Set(result.claimed);
      const ownerId = result.recruiter?.id ?? currentUserId;
      const ownerName = result.recruiter?.name ?? currentUserName ?? "You";
      if (claimed.size > 0) {
        setCandidates((current) =>
          current.map((row) =>
            claimed.has(row.id)
              ? {
                  ...row,
                  assignedRecruiterUserId: ownerId,
                  assignedRecruiterName: ownerName,
                }
              : row
          )
        );
      }
      // Clear successful claims; keep failed/not-found for retry.
      selection.removeIds([...result.claimed, ...result.already_claimed, ...result.ineligible]);
      if (result.failed.length === 0 && result.not_found.length === 0) {
        selection.clearSelection();
        setClaimConfirmOpen(false);
      }
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : "Failed to claim candidates");
    } finally {
      setClaimBusy(false);
    }
  }

  async function handleConfirmDeleteCandidates() {
    const idsToDelete = [...selection.selectedIds];
    if (deleteBusy || idsToDelete.length === 0) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const response = await fetch("/api/admin/workers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsToDelete }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string" ? payload.error : "Failed to delete candidates"
        );
      }
      const deletedIds = new Set<string>(
        Array.isArray(payload.deletedIds) ? payload.deletedIds.map(String) : idsToDelete
      );
      setCandidates((current) => current.filter((row) => !deletedIds.has(row.id)));
      setTotalFromApi((current) =>
        typeof current === "number" ? Math.max(0, current - deletedIds.size) : current
      );
      selection.removeIds(deletedIds);
      invalidateCandidatesListCache();
      setDeleteConfirmOpen(false);
      const deletedCount =
        typeof payload.count === "number" ? payload.count : deletedIds.size;
      toast.success(`Deleted ${deletedCount} candidate${deletedCount === 1 ? "" : "s"}`, {
        duration: ACTION_TOAST_DURATION_MS,
      });
    } catch (deleteErr) {
      const message =
        deleteErr instanceof Error ? deleteErr.message : "Failed to delete candidates";
      setDeleteError(message);
      toast.error(message);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <CandidatesListShell
        query={query}
        onQueryChange={setQuery}
        onRefresh={() => {
          if (advancedSearchContext.active) {
            applyAdvancedSearchParams(null);
            void loadCandidates(null);
            refreshKpis();
            return;
          }
          void loadCandidates();
          refreshKpis();
        }}
        refreshLabel={advancedSearchContext.active ? "Reset Search" : "Refresh"}
        jobRoleFilter={jobRoleFilter}
        onJobRoleFilterChange={setJobRoleFilter}
        locationFilter={locationFilter}
        onLocationFilterChange={setLocationFilter}
        appliedDateFrom={appliedDateFrom}
        appliedDateTo={appliedDateTo}
        onAppliedDateFromChange={setAppliedDateFrom}
        onAppliedDateToChange={setAppliedDateTo}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={statusOptions}
        progressStatusFilter={progressStatusFilter}
        onProgressStatusFilterChange={setProgressStatusFilter}
        progressStatusOptions={progressStatusFilterOptions}
        jobFilter={jobFilter}
        onJobFilterChange={setJobFilter}
        jobOptions={jobOptions}
        stageFilter={stageFilter}
        onStageFilterChange={setStageFilter}
        stageOptions={stageOptions}
        matchScoreFilter={matchScoreFilter}
        onMatchScoreFilterChange={setMatchScoreFilter}
        clientNameFilter={clientNameFilter}
        onClientNameFilterChange={setClientNameFilter}
        assigneeFilter={assigneeFilter}
        onAssigneeFilterChange={setAssigneeFilter}
        clientNameOptions={clientNameOptions}
        assigneeOptions={assigneeOptions}
        jobRoleOptions={jobRoleOptions}
        locationOptions={locationOptions}
        kpiCards={kpiCards}
        layoutVariant="all-candidates"
        simplifiedToolbarFilters
        skillsFilter={skillsFilter}
        onApplySearch={({ query: nextQuery, skillsFilter: nextSkills }) => {
          const trimmed = nextQuery.trim();
          setQuery(trimmed);
          setDebouncedQuery(trimmed);
          setSkillsFilter(nextSkills);
          setPage(1);
        }}
        onResetSearch={() => {
          setQuery("");
          setDebouncedQuery("");
          setSkillsFilter("");
          setJobRoleFilter("");
          setLocationFilter("");
          setAppliedDateFrom("");
          setAppliedDateTo("");
          setStatusFilter("");
          setProgressStatusFilter("");
          setJobFilter("");
          setStageFilter("");
          setMatchScoreFilter("");
          setClientNameFilter("");
          setAssigneeFilter("");
          setListSort(EMPTY_CANDIDATE_LIST_SORT);
          applyAdvancedSearchParams(null);
          setPage(1);
          setListError(null);
          setCandidates([]);
          setTotalFromApi(null);
        }}
        onAddCandidate={() => setAddCandidateOpen(true)}
        onMatchExistingCandidate={() => {
          setMatchJobPickerValue("");
          setMatchJobPickerOpen(true);
        }}
        onAnalyzeAll={() =>
          void runBulkMatchAnalyze(pageAnalyzeIds, "Analyze", {
            emptyMessage: "All candidates on this page are already analyzed",
          })
        }
        analyzeAllLabel="Analyze all"
        analyzeBusy={bulkAnalyzeBusy}
        analyzeDisabled={pageAnalyzeIds.length === 0 || matchAnalyzingApplicationIds.size > 0}
        analysisProvider={analysisProvider}
        onAnalysisProviderChange={setAnalysisProvider}
        view={view}
        onViewChange={(nextView) => {
          setView(nextView);
          if (nextView !== "card") {
            setCardBulkSelectMode(false);
            selection.clearSelection();
          }
        }}
        onEditColumns={() => setEditColumnsOpen(true)}
        onAdvancedSearch={() => setAdvancedSearchOpen(true)}
        totalCount={listDisplayTotal}
        loading={loading}
        totalLabel="applicants"
        advancedSearchActive={advancedSearchContext.active}
        advancedSearchPlace={advancedSearchContext.place}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        totalFiltered={listDisplayTotal}
        showMultiJobHighlight
        highlightMultiJob={highlightMultiJob}
        onHighlightMultiJobChange={setHighlightMultiJob}
        multiJobApplicantCount={multiJobApplicantCount}
        onViewAllMultiJobApplicants={() => setHighlightMultiJob(true)}
      >
        {(() => {
          const formatDate = formatDateShort;

          if (loading) {
            return <CandidatesListSkeleton rows={Math.min(pageSize, 10)} view={view} label="Loading candidates" />;
          }
          if (listError) {
            return (
              <div className="py-12 text-center text-red-600" role="alert">
                <div className="font-medium">Search failed</div>
                <div className="mt-1 text-sm text-red-500">{listError}</div>
                <button
                  type="button"
                  onClick={() => void loadCandidates()}
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-[color:var(--brand-primary)] px-5 text-sm font-semibold text-white hover:brightness-95"
                >
                  Try again
                </button>
              </div>
            );
          }
          if (visibleCandidates.length === 0) {
            return (
              <div className="py-12 text-center text-gray-600">
                <div>
                  {highlightMultiJob
                    ? "No multi-job applicants match these filters."
                    : debouncedQuery || parseSkillsFilterParam(skillsFilter).length
                      ? "No candidates match your search."
                      : "No candidates found."}
                </div>
                {debouncedQuery ||
                parseSkillsFilterParam(skillsFilter).length ||
                advancedSearchContext.active ||
                highlightMultiJob ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setDebouncedQuery("");
                      setSkillsFilter("");
                      setHighlightMultiJob(false);
                      applyAdvancedSearchParams(null);
                      setPage(1);
                      void loadCandidates(null);
                    }}
                    className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-[color:var(--brand-primary)] px-5 text-sm font-semibold text-white hover:brightness-95"
                  >
                    Reset Search
                  </button>
                ) : null}
              </div>
            );
          }

          if (view === "list") {
            const cols = listColumnOrder.length ? listColumnOrder : DEFAULT_CANDIDATE_COLUMNS;
            return (
              <div className="w-full">
                <CandidateBulkSelectionBar
                  selectedCount={selection.selectedCount}
                  eligibleCount={selection.selectedEligibleCount}
                  scopeLabel={selection.selectionScopeLabel}
                  claimBusy={claimBusy}
                  archiveBusy={archiveBusy}
                  deleteBusy={deleteBusy}
                  analyzeBusy={bulkAnalyzeBusy}
                  onArchive={() => void handleBulkArchiveSelected()}
                  onDelete={() => {
                    setDeleteError(null);
                    setDeleteConfirmOpen(true);
                  }}
                  onAnalyze={() => void runBulkMatchAnalyze(selectedAnalyzeIds, "Analyze")}
                  onReanalyze={() => void runBulkMatchAnalyze(selectedReanalyzeIds, "Reanalyze")}
                  analyzeDisabled={selectedAnalyzeIds.length === 0}
                  reanalyzeDisabled={selectedReanalyzeIds.length === 0}
                  onExportCsv={handleExportCandidatesCsv}
                  onExportXls={handleExportCandidatesXls}
                  exportDisabled={exportCandidates.length === 0}
                  hideClaim
                  onClear={selection.clearSelection}
                />
                <div className={CANDIDATE_LIST_TABLE_SCROLL_CLASS}>
                  <table className={CANDIDATE_LIST_TABLE_CLASS}>
                    <thead className="bg-brand-lite text-black">
                      <tr className="border-b border-[#E5E7EB]">
                        <th className="w-12 border-r border-[#E5E7EB] bg-brand-lite px-3 py-3 text-center">
                          <ListTableCheckbox
                            size="md"
                            checked={selection.headerChecked}
                            indeterminate={selection.headerIndeterminate}
                            disabled={paginated.length === 0}
                            onChange={selection.toggleAllEligibleOnPage}
                            aria-label="Select all candidates on this page"
                          />
                        </th>
                        {cols.map((colId) => (
                          <th
                            key={colId}
                            className={`border-r border-[#E5E7EB] bg-brand-lite px-4 py-3 text-sm font-medium normal-case tracking-normal text-black first:pl-6 ${candidateListColumnAlignmentClassName(colId)} ${candidateListColumnClassName(colId)}`}
                          >
                            {isCandidateListSortableColumn(colId) ? (
                              <CandidateListSortableHeader
                                column={colId}
                                label={columnLabel(colId)}
                                align={candidateListHeaderAlign(colId)}
                                sort={listSort}
                                onSort={handleListSort}
                              />
                            ) : (
                              columnLabel(colId)
                            )}
                          </th>
                        ))}
                        <th className="whitespace-nowrap border-r-0 bg-brand-lite px-4 py-3 text-center text-sm font-medium normal-case tracking-normal text-black last:pr-6">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map((c) => {
                        return (
                        <tr
                          key={c.id}
                          className="border-b border-[#E9EDF3] hover:bg-[#F9FBFB]"
                        >
                          <td
                            className="w-12 border-r border-[#EEF2F7] px-3 py-4 text-center align-middle"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <ListTableCheckbox
                              size="md"
                              checked={selection.selectedIds.has(c.id)}
                              onChange={() => selection.toggleOne(c.id, true)}
                              aria-label={`Select ${c.name || "candidate"}`}
                            />
                          </td>
                          {cols.map((colId) => (
                            <td
                              key={colId}
                              className={`border-r border-[#EEF2F7] px-4 py-4 align-middle first:pl-6 ${candidateListColumnAlignmentClassName(colId)} ${candidateListColumnClassName(colId)}`}
                            >
                              {renderListCell(colId, c, formatDate, {
                                highlightMultiJob,
                                matchAnalyzingApplicationIds,
                                onAnalyzeMatch: (applicationId, mode) =>
                                  void runMatchAnalyze(applicationId, mode),
                                progressStatusOptions,
                                progressStatusMenuWorkerId: progressStatusMenu?.workerId ?? null,
                                progressStatusBusyWorkerId: statusBusyWorkerId,
                                onToggleProgressStatusMenu: (workerId, anchor) => {
                                  setRowActionsMenu(null);
                                  setProgressStatusMenu((current) =>
                                    current?.workerId === workerId ? null : { workerId, anchor }
                                  );
                                },
                              })}
                            </td>
                          ))}
                          <td className="border-r-0 px-4 py-4 align-middle last:pr-6">
                            <div className="flex items-center justify-center gap-2">
                              <CandidateAiAnalysisLink
                                workerId={c.id}
                                applicationId={c.matchApplicationId}
                                candidateName={c.name}
                              />
                              <button
                                type="button"
                                aria-label={`Actions for ${c.name || "candidate"}`}
                                aria-expanded={rowActionsMenu?.rowId === c.id}
                                onClick={(event) => {
                                  const anchor = event.currentTarget;
                                  setProgressStatusMenu(null);
                                  setRowActionsMenu((current) =>
                                    current?.rowId === c.id ? null : { rowId: c.id, anchor }
                                  );
                                }}
                                className="inline-flex size-[18px] items-center justify-center overflow-hidden"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src="/icons/admin-recruiter/candidates/three-dot.svg"
                                  alt=""
                                  width={16}
                                  height={16}
                                  className="size-4"
                                />
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          }

          return (
            <div className="w-full">
              {cardBulkSelectMode ? (
                <CandidateBulkSelectionBar
                  selectedCount={selection.selectedCount}
                  eligibleCount={selection.selectedEligibleCount}
                  scopeLabel={selection.selectionScopeLabel}
                  claimBusy={claimBusy}
                  archiveBusy={archiveBusy}
                  deleteBusy={deleteBusy}
                  analyzeBusy={bulkAnalyzeBusy}
                  onArchive={() => void handleBulkArchiveSelected()}
                  onDelete={() => {
                    setDeleteError(null);
                    setDeleteConfirmOpen(true);
                  }}
                  onAnalyze={() => void runBulkMatchAnalyze(selectedAnalyzeIds, "Analyze")}
                  onReanalyze={() => void runBulkMatchAnalyze(selectedReanalyzeIds, "Reanalyze")}
                  analyzeDisabled={selectedAnalyzeIds.length === 0}
                  reanalyzeDisabled={selectedReanalyzeIds.length === 0}
                  onExportCsv={handleExportCandidatesCsv}
                  onExportXls={handleExportCandidatesXls}
                  exportDisabled={exportCandidates.length === 0}
                  hideClaim
                  onClear={selection.clearSelection}
                />
              ) : null}
              <CandidatesCardBulkSelectHeader
                bulkSelectEnabled={cardBulkSelectMode}
                onBulkSelectEnabledChange={(enabled) => {
                  setCardBulkSelectMode(enabled);
                  if (!enabled) selection.clearSelection();
                }}
                selectAllChecked={selection.headerChecked}
                selectAllIndeterminate={selection.headerIndeterminate}
                selectAllDisabled={paginated.length === 0}
                onSelectAllChange={selection.toggleAllEligibleOnPage}
              />
              <div className="grid grid-cols-1 gap-4 px-4 pb-5 pt-3 sm:gap-5 sm:px-5 sm:pb-6 md:grid-cols-2 xl:grid-cols-3">
                {paginated.map((c) => {
                  return (
                    <CandidateGridCard
                      key={c.id}
                      candidate={c}
                      formatDateTime={formatDateTime}
                      onMessage={setCommTarget}
                      selectionMode={cardBulkSelectMode}
                      selected={selection.selectedIds.has(c.id)}
                      onToggleSelect={
                        cardBulkSelectMode
                          ? () => selection.toggleOne(c.id, true)
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            </div>
          );
        })()}
      </CandidatesListShell>

      <EditColumnsModal
        key={editColumnsOpen ? "edit-cols-open" : "edit-cols-closed"}
        open={editColumnsOpen}
        onOpenChange={setEditColumnsOpen}
        value={listColumnOrder}
        onSave={(order) => {
          setListColumnOrder(order);
          saveColumnOrder(order);
        }}
      />
      {progressStatusUi}
      <BulkDeleteConfirmModal
        open={deleteConfirmOpen}
        entity="candidate"
        count={selection.selectedCount}
        busy={deleteBusy}
        error={deleteError}
        onCancel={() => {
          if (deleteBusy) return;
          setDeleteConfirmOpen(false);
          setDeleteError(null);
        }}
        onConfirm={() => void handleConfirmDeleteCandidates()}
      />
      <AdvancedSearchModal
        open={advancedSearchOpen}
        onClose={() => setAdvancedSearchOpen(false)}
        initialParams={
          advancedSearchContext.active
            ? {
                lat: advancedSearchContext.lat,
                lng: advancedSearchContext.lng,
                radius: advancedSearchContext.radius,
                place: advancedSearchContext.place,
              }
            : undefined
        }
        onViewResults={(params) => {
          const nextParams: AdvancedSearchParams = {
            lat: params.lat,
            lng: params.lng,
            radius: params.radius,
            ...(params.place ? { place: params.place } : {}),
          };
          applyAdvancedSearchParams(nextParams);
          void loadCandidates(nextParams);
          router.replace("/admin_recruiter/candidates");
          setAdvancedSearchOpen(false);
        }}
      />

      {rowActionsMenu ? (
        <CandidateRowActionsMenu
          anchor={rowActionsMenu.anchor}
          analyzing={(() => {
            const applicationId = candidates
              .find((item) => item.id === rowActionsMenu.rowId)
              ?.matchApplicationId?.trim();
            return Boolean(applicationId && matchAnalyzingApplicationIds.has(applicationId));
          })()}
          isAnalyzed={
            candidates.find((item) => item.id === rowActionsMenu.rowId)?.aiMatchStatus === "ANALYZED"
          }
          hired={(() => {
            const status = candidates.find((item) => item.id === rowActionsMenu.rowId)?.status ?? "";
            const normalized = status.trim().toLowerCase().replace(/\s+/g, "_");
            return normalized === "hired" || normalized === "converted";
          })()}
          resumeUploading={Boolean(updateResumeApplicationId)}
          onClose={() => setRowActionsMenu(null)}
          onAnalyze={(mode) => {
            const applicationId = candidates
              .find((item) => item.id === rowActionsMenu.rowId)
              ?.matchApplicationId?.trim();
            if (!applicationId) {
              toast("Open a job application to run match analysis for this candidate.");
              return;
            }
            void runMatchAnalyze(applicationId, mode);
          }}
          onUpdateResume={() => beginUpdateResume(rowActionsMenu.rowId)}
          onArchive={() => toast("Archive is available from the candidate application.")}
          onUnarchive={() => toast("Unarchive is available from the candidate application.")}
          onMessage={() => {
            const row = candidates.find((item) => item.id === rowActionsMenu.rowId);
            if (row) setCommTarget(row);
          }}
          onCall={() => {
            const row = candidates.find((item) => item.id === rowActionsMenu.rowId);
            if (row?.phone) {
              window.location.href = `tel:${row.phone}`;
              return;
            }
            toast("No phone number on file for this candidate.");
          }}
          onSetupInterview={() => beginSetupInterview(rowActionsMenu.rowId)}
          onAssignRecruiter={() => {
            const row = candidates.find((item) => item.id === rowActionsMenu.rowId);
            if (row) void openAssignRecruiter(row);
          }}
          onViewStatusHistory={() => toast("Status history is available from the candidate application.")}
          onDeleteCandidate={() => toast("Delete candidate from the candidate application.")}
          onMarkAsHired={() => toast("Mark as hired from the candidate application.")}
        />
      ) : null}

      {(() => {
        const target = updateResumeApplicationId
          ? candidates.find((row) => resolveCandidateApplicationId(row) === updateResumeApplicationId) ??
            null
          : null;
        if (!updateResumeApplicationId) return null;
        return (
          <UpdateResumeModal
            open
            applicationId={updateResumeApplicationId}
            candidateName={target?.name || ""}
            initialFirstName={target?.firstName || ""}
            initialLastName={target?.lastName || ""}
            onClose={() => setUpdateResumeApplicationId(null)}
            onUpdated={(result) => handleResumeUpdated(updateResumeApplicationId, result)}
          />
        );
      })()}

      {interviewTarget ? (
        <ScheduleInterviewModal
          open={interviewOpen}
          applicants={[
            {
              id: interviewTarget.id,
              name: interviewTarget.name || "Candidate",
              status: normalizeApplicationStatus(
                interviewTarget.progressStatusKey ||
                  interviewTarget.statusKey ||
                  interviewTarget.status ||
                  ""
              ),
            },
          ]}
          submitting={interviewSubmitting}
          error={interviewError}
          onClose={() => {
            setInterviewOpen(false);
            setInterviewError(null);
            setInterviewTarget(null);
          }}
          onSubmit={(payload) => void handleScheduleInterview(payload)}
          fixedWorkerId={interviewTarget.id}
          fixedApplicantName={interviewTarget.name || "Candidate"}
          fixedApplicationId={resolveCandidateApplicationId(interviewTarget) || undefined}
          fixedJobTitle={interviewTarget.applicationJobTitle || undefined}
          defaultTitle={
            interviewTarget.name
              ? `Interview with ${interviewTarget.name}`
              : undefined
          }
        />
      ) : null}

      <SuccessModal
        open={resumeSuccessOpen}
        onClose={() => setResumeSuccessOpen(false)}
        title="Success!"
        message="Resume updated successfully."
        size="large"
        actionLabel="Close"
        onAction={() => setResumeSuccessOpen(false)}
      />

      <ErrorModal
        open={resumeErrorOpen}
        onClose={() => {
          setResumeErrorOpen(false);
          setResumeErrorMessage("");
        }}
        title="Upload failed"
        message={resumeErrorMessage || "Failed to upload resume. Please try again."}
      />

      {commTarget ? (
        <CandidateCommunicationDialog
          open={Boolean(commTarget)}
          onClose={() => setCommTarget(null)}
          workerId={commTarget.id}
          candidateName={commTarget.name || "Candidate"}
          email={commTarget.email}
          phone={commTarget.phone}
        />
      ) : null}

      <ClaimCandidatesConfirmModal
        open={claimConfirmOpen}
        selectedCount={selection.selectedCount}
        eligibleCount={selection.selectedEligibleCount}
        excludedCount={Math.max(0, selection.selectedCount - selection.selectedEligibleCount)}
        recruiterName={currentUserName?.trim() || "You"}
        busy={claimBusy}
        error={claimError}
        onCancel={() => {
          if (claimBusy) return;
          setClaimConfirmOpen(false);
          setClaimError(null);
        }}
        onConfirm={() => void confirmClaimCandidates()}
      />

      <AssignRecruiterModal
        open={Boolean(assignRecruiterTarget)}
        candidateName={assignRecruiterTarget?.name || "Candidate"}
        currentAssigneeId={assignRecruiterTarget?.assignedRecruiterUserId ?? null}
        members={assignRecruiterMembers}
        membersLoading={assignRecruiterMembersLoading}
        busy={assignRecruiterBusy}
        error={assignRecruiterError}
        onOpenChange={(open) => {
          if (assignRecruiterBusy) return;
          if (!open) {
            setAssignRecruiterTarget(null);
            setAssignRecruiterError(null);
          }
        }}
        onAssign={(assigneeUserId) => void confirmAssignRecruiter(assigneeUserId)}
      />

      <AddCandidateModal
        open={addCandidateOpen}
        onClose={() => setAddCandidateOpen(false)}
        jobOptions={addCandidateJobOptions}
        onSuccess={() => {
          if (advancedSearchContext.active) {
            void loadCandidates(null);
            return;
          }
          void loadCandidates();
        }}
      />

      {matchJobPickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-[#111827]">Match Existing Candidate</h2>
            <p className="mt-1 text-sm text-[#64748B]">
              Select a job to browse and import candidates from your talent database.
            </p>
            <label className="mt-4 block text-sm font-medium text-[#374151]" htmlFor="match-existing-job">
              Job
            </label>
            <select
              id="match-existing-job"
              value={matchJobPickerValue}
              onChange={(event) => setMatchJobPickerValue(event.target.value)}
              className="mt-1.5 h-10 w-full cursor-pointer appearance-none rounded-lg border border-[#CBD5E1] bg-white bg-[length:12px_12px] bg-[right_12px_center] bg-no-repeat px-3 pr-9 text-sm font-normal leading-6 text-[#111827] outline-none hover:bg-zinc-50 focus:border-[color:var(--brand-primary)]"
              style={{
                backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
                  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="#94A3B8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
                )}")`,
                color: "#111827",
              }}
            >
              <option value="" className="text-[#111827]">
                Select a job
              </option>
              {addCandidateJobOptions.map((option) => (
                <option key={option.id} value={option.id} className="text-[#111827]">
                  {option.title}
                </option>
              ))}
            </select>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMatchJobPickerOpen(false)}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#475569] transition hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!matchJobPickerValue}
                onClick={() => {
                  if (!matchJobPickerValue) return;
                  setMatchImportJobId(matchJobPickerValue);
                  setMatchJobPickerOpen(false);
                }}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-[color:var(--brand-primary)] px-3 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {matchImportJobId ? (
        <ImportCandidatesModal
          open
          jobId={matchImportJobId}
          onClose={() => setMatchImportJobId(null)}
          onImported={() => {
            setMatchImportJobId(null);
            if (advancedSearchContext.active) {
              void loadCandidates(null);
              return;
            }
            void loadCandidates();
          }}
        />
      ) : null}
    </>
  );
}

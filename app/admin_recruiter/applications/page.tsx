"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  HelpCircle,
  Mail,
  MoreHorizontal,
  Phone,
  X,
} from "lucide-react";
import {
  ApplicationsJobHeaderCard,
  formatJobPostedOn,
} from "@/app/admin_recruiter/applications/ApplicationsJobHeaderCard";
import { ApplicationsListToolbar } from "@/app/admin_recruiter/applications/ApplicationsListToolbar";
import ImportCandidatesModal from "@/app/admin_recruiter/applications/ImportCandidatesModal";
import { CandidatesListSkeleton } from "@/app/admin_recruiter/candidates/CandidatesListSkeleton";
import { ListSortableHeader } from "@/app/admin_recruiter/components/ListSortableHeader";
import {
  applicationListHeaderAlign,
  applicationListSortFromToolbar,
  applicationToolbarSortBy,
  EMPTY_APPLICATION_LIST_SORT,
  isApplicationListSortableColumn,
  sortApplicationRows,
  toggleApplicationListSort,
  type ApplicationListSortState,
} from "@/lib/admin/application-list-sort";
import {
  exportApplicationsCsv,
  exportApplicationsXls,
} from "@/app/admin_recruiter/applications/export-applications";
import {
  applicationMatchesDateAppliedFilter,
  applicationMatchesMatchScoreFilter,
  EditApplicationsFiltersModal,
  type ApplicationsExtendedFilterValues,
} from "@/app/admin_recruiter/applications/EditApplicationsFiltersModal";
import { JobsBreadcrumb } from "@/app/admin_recruiter/jobs/JobsBreadcrumb";
import { CandidateListAvatar } from "@/app/admin_recruiter/components/CandidateListAvatar";
import { ColumnsEditorModal } from "@/app/admin_recruiter/components/ColumnsEditorModal";
import { BulkDeleteConfirmModal } from "@/app/admin_recruiter/components/BulkDeleteConfirmModal";
import { CandidateBulkSelectionBar } from "@/app/admin_recruiter/components/CandidateBulkSelectionBar";
import { ClaimCandidatesConfirmModal } from "@/app/admin_recruiter/components/ClaimCandidatesConfirmModal";
import { ListPaginationControls, ListPaginationShowLabel } from "@/app/admin_recruiter/components/ListPaginationControls";
import { ListTableCheckbox } from "@/app/admin_recruiter/components/ListTableCheckbox";
import { CurrentStageCell } from "@/app/admin_recruiter/components/CurrentStageCell";
import { MultiJobApplicantsBanner } from "@/app/admin_recruiter/components/MultiJobApplicantsBanner";
import { postClaimApplications } from "@/app/admin_recruiter/candidates/claim-client";
import { isApplicationClaimEligible } from "@/lib/candidates/claim";
import { useAdminHeaderData } from "@/lib/admin/hooks/use-admin-header-data";
import AddCallLogModal from "@/app/admin_recruiter/components/AddCallLogModal";
import CandidateCommunicationDialog from "@/app/admin_recruiter/components/CandidateCommunicationDialog";
import { ScheduleInterviewModal } from "@/app/admin_recruiter/calendar/components/ScheduleInterviewModal";
import {
  invitationSuccessMessage,
  type ScheduleInterviewPayload,
} from "@/lib/interviews/schedule-payload";
import SuccessModal from "@/app/components/SuccessModal";
import ErrorModal from "@/app/components/ErrorModal";
import { CandidateProfileIconLink } from "@/app/admin_recruiter/candidates/CandidateProfileIconLink";
import { CandidatePreHireIconLink } from "@/app/admin_recruiter/candidates/CandidatePreHireIconLink";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import {
  CANDIDATES_PAGE_TITLE_CLASS,
  CANDIDATES_PAGE_TITLE_STYLE,
} from "@/app/admin_recruiter/candidates/candidates-typography";
import {
  resolveApplicationApplicantEmail,
  resolveApplicationApplicantLocation,
  resolveApplicationApplicantName,
  resolveApplicationApplicantPhone,
  resolveApplicationWorkerId,
} from "@/lib/jobs/application-applicant-display";
import {
  applicationCurrentStageMeta,
  applicationStatusDotClassName,
  applicationStatusLabel,
  normalizeApplicationStatus,
  type ApplicationPipelineStatus,
} from "@/lib/jobs/application-status";
import {
  applicationRowStatusId,
  isApplicationRowArchived,
  matchesApplicationStatusTab,
} from "@/lib/jobs/application-status-tab";
import { isClosedPipelineApplication, isInProcessPipelineApplication } from "@/lib/jobs/pipeline-summary";
import toast from "react-hot-toast";
import { brandingToCssVars } from "@/lib/tenant/tenant-branding";
import {
  APPLICATION_EDITABLE_COLUMNS,
  DEFAULT_APPLICATION_COLUMNS,
  applicationColumnLabel,
  applicationListColumnClassName,
  ensureActionsLast,
  loadApplicationColumnOrder,
  saveApplicationColumnOrder,
  type ApplicationColumnId,
} from "./application-columns";
import { CandidateAiAnalysisButton } from "./CandidateAiAnalysisButton";
import {
  ApplicationStatusChangeModal,
  ApplicationStatusHistoryDialog,
  type ApplicationStatusOption,
} from "./ApplicationStatusUi";
import { GroupedFilterOptions, GroupedStatusMenuList } from "@/app/admin_recruiter/components/GroupedStatusMenu";
import { groupStatuses, readStatusGroupFields } from "@/lib/jobs/application-statuses/groups";
import { CandidateRowActionsMenu } from "./CandidateRowActionsMenu";
import { MatchScoreCell, RequirementOutcomeCountCell, FitBandCell } from "./MatchAnalysisPanel";
import UpdateResumeModal from "./UpdateResumeModal";
import {
  AssignRecruiterModal,
  type AssignableTeamMember,
} from "@/app/admin_recruiter/candidates/AssignRecruiterModal";
import {
  listingRequirementOutcomeCounts,
  type ListingRequirementOutcomeCounts,
} from "@/lib/jobs/match-analysis/workspace";
import { listingDisplayFitBand } from "@/lib/jobs/match-analysis/progression";
import type { AnalysisMode } from "@/lib/jobs/match-analysis/schema";
import { useMatchAnalysisProvider } from "@/app/admin_recruiter/applications/MatchAnalysisModelSelect";
import {
  describeBulkMatchAnalysisOutcome,
  partitionMatchAnalysisTargets,
  postBulkMatchAnalysis,
  type BulkMatchAnalysisItem,
} from "@/lib/admin/bulk-match-analysis";
import { countUniqueMultiJobApplicants } from "@/lib/admin/multi-job-applicants";
import { JobPublicViewLink } from "@/app/admin_recruiter/jobs/JobPublicViewLink";
import AddCandidateModal from "./AddCandidateModal";
import { matchesApplicationListSearch } from "@/lib/admin/candidate-list-search";
import {
  bestPipelineStatusId,
  tabCountsFromBuckets,
  type ApplicationListBucket,
} from "@/lib/admin/staff-application-list-query";
import { filterApplicationStatusesForSource } from "@/lib/jobs/msp-submission";

type ApplicationStatus = string;

type ApplicationTab = "all" | string;

type ApplicationRow = {
  id: string;
  status: ApplicationStatus | string;
  status_id?: string | null;
  statusName?: string | null;
  statusNote?: string | null;
  created_at: string;
  submitted_at: string | null;
  updated_at?: string | null;
  job_requisition_id: string;
  workflow_id: string;
  applicant_workflow_instance_id: string;
  worker_id?: string | null;
  appliedJobCount?: number | null;
  workflow_phase?: string | null;
  ai_match_status?: string | null;
  ai_match_score?: number | null;
  ai_match_category?: string | null;
  ai_match_action?: string | null;
  ai_match_readiness?: string | null;
  ai_match_display_category?: string | null;
  ai_match_stage?: string | null;
  ai_analyzed_at?: string | null;
  ai_requirement_counts?: ListingRequirementOutcomeCounts | null;
  assigned_recruiter_user_id?: string | null;
  assignedRecruiter?: { id: string; name: string; profilePhotoUrl?: string | null } | null;
  application_statuses?:
    | { id?: string; name?: string; system_key?: string | null; color?: string | null }
    | { id?: string; name?: string; system_key?: string | null; color?: string | null }[]
    | null;
  job_requisitions: Record<string, unknown> | Record<string, unknown>[] | null;
  onboarding_flows: Record<string, unknown> | Record<string, unknown>[] | null;
  applicant_profiles: Record<string, unknown> | Record<string, unknown>[] | null;
  worker?: Record<string, unknown> | Record<string, unknown>[] | null;
};

function requirementCountsFromAnalyzePayload(payload: {
  requirementCounts?: ListingRequirementOutcomeCounts | null;
  requirements?: Array<{
    requirement_type?: string;
    status?: string;
    requirement_outcome?: string;
    verification_required?: boolean;
    recruiter_verified?: boolean;
  }>;
}): ListingRequirementOutcomeCounts | null {
  if (payload.requirementCounts) return payload.requirementCounts;
  if (Array.isArray(payload.requirements) && payload.requirements.length) {
    return listingRequirementOutcomeCounts(
      payload.requirements.map((row) => ({
        requirement_type: String(row.requirement_type ?? ""),
        status: String(row.status ?? ""),
        requirement_outcome: String(row.requirement_outcome ?? ""),
        verification_required: Boolean(row.verification_required),
        recruiter_verified: Boolean(row.recruiter_verified),
      }))
    );
  }
  return null;
}

type JobHeader = {
  id: string;
  public_title: string | null;
  location: string | null;
  facility: string | null;
  facility_name: string | null;
  status?: string | null;
  internal_requisition_number?: string | null;
  created_at?: string | null;
  published_at?: string | null;
  shift_type?: string | null;
  schedule?: string | null;
  source_type?: string | null;
};

type JobOption = {
  id: string;
  public_title: string | null;
  location: string | null;
  facility: string | null;
  facility_name: string | null;
  status?: string;
  internal_requisition_number?: string | null;
  created_at?: string | null;
  published_at?: string | null;
  shift_type?: string | null;
  schedule?: string | null;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const FORM_SURFACE_CLASS = "rounded-lg border border-[#CBD5E1] bg-white";
const FILTER_SELECT_CLASS = `${FORM_SURFACE_CLASS} h-8 cursor-pointer appearance-none bg-[length:12px_12px] bg-[right_10px_center] bg-no-repeat px-2.5 pr-8 text-sm font-normal leading-6 text-[#334155] hover:bg-zinc-50 focus:border-[color:var(--brand-primary)] focus:outline-none focus:ring-0`;
const FILTER_SELECT_CHEVRON = {
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="#94A3B8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  )}")`,
} as const;

const STATUS_DROPDOWN_WIDTH = 240;
const STATUS_DROPDOWN_ESTIMATED_HEIGHT = 420;

function StatusDropdownPortal({
  options,
  currentStatusId,
  anchor,
  busy,
  onClose,
  onSelect,
}: {
  options: ApplicationStatusOption[];
  currentStatusId: string | null;
  anchor: HTMLElement;
  busy: boolean;
  onClose: () => void;
  onSelect: (option: ApplicationStatusOption) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });

  const updatePosition = useCallback(() => {
    const rect = anchor.getBoundingClientRect();
    let top = rect.bottom + 4;
    if (top + STATUS_DROPDOWN_ESTIMATED_HEIGHT > window.innerHeight - 8) {
      top = Math.max(8, rect.top - STATUS_DROPDOWN_ESTIMATED_HEIGHT - 4);
    }
    setStyle({
      position: "fixed",
      top,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - STATUS_DROPDOWN_WIDTH - 8)),
      width: STATUS_DROPDOWN_WIDTH,
      visibility: "visible",
    });
  }, [anchor]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition]);

  useEffect(() => {
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [updatePosition]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchor.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [anchor, onClose]);

  if (typeof document === "undefined") return null;

  const selectable = options.filter((option) => option.id !== currentStatusId);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={style}
      className="z-[200] max-h-72 overflow-y-auto rounded-xl border border-[#E5E7EB] bg-white py-1 text-left shadow-lg"
    >
      {selectable.length === 0 ? (
        <p className="px-3 py-2 text-sm text-[#94A3B8]">No other statuses</p>
      ) : (
        <GroupedStatusMenuList
          options={selectable}
          renderOption={(option) => (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                onSelect(option);
                onClose();
              }}
              className="flex w-full items-center px-3 py-2 text-left text-sm text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-50"
            >
              {option.name}
            </button>
          )}
        />
      )}
    </div>,
    document.body
  );
}

function one(value: Record<string, unknown> | Record<string, unknown>[] | null) {
  return Array.isArray(value) ? value[0] ?? {} : value ?? {};
}

function formatJobLocation(job: JobHeader | null, fallbackJob?: Record<string, unknown>): string {
  if (job) {
    return (
      job.location?.trim() ||
      job.facility_name?.trim() ||
      job.facility?.trim() ||
      "—"
    );
  }
  if (!fallbackJob) return "—";
  return (
    String(fallbackJob.location ?? "").trim() ||
    String(fallbackJob.facility_name ?? "").trim() ||
    String(fallbackJob.facility ?? "").trim() ||
    "—"
  );
}

function jobReference(option: Pick<JobOption, "id" | "internal_requisition_number">): string {
  return option.internal_requisition_number?.trim() || option.id.slice(0, 8).toUpperCase();
}

function jobCompanyName(job: JobHeader | JobOption | null): string {
  if (!job) return "—";
  return job.facility_name?.trim() || job.facility?.trim() || "—";
}

function jobTypeLabel(job: JobHeader | JobOption | null): string {
  if (!job) return "—";
  return job.shift_type?.trim() || job.schedule?.trim() || "—";
}

function toJobHeader(row: Partial<JobHeader> & { id: string }): JobHeader {
  return {
    id: row.id,
    public_title: row.public_title ?? null,
    location: row.location ?? null,
    facility: row.facility ?? null,
    facility_name: row.facility_name ?? null,
    status: row.status ?? null,
    internal_requisition_number: row.internal_requisition_number ?? null,
    created_at: row.created_at ?? null,
    published_at: row.published_at ?? null,
    shift_type: row.shift_type ?? null,
    schedule: row.schedule ?? null,
    source_type: row.source_type ?? null,
  };
}

function oneStatusJoin(
  value:
    | { id?: string; name?: string; system_key?: string | null; color?: string | null }
    | { id?: string; name?: string; system_key?: string | null; color?: string | null }[]
    | null
    | undefined
) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function rowStatusId(row: ApplicationRow): string | null {
  return applicationRowStatusId(row);
}

function rowStatusName(row: ApplicationRow, options: ApplicationStatusOption[]): string {
  const joined = oneStatusJoin(row.application_statuses);
  return (
    row.statusName?.trim() ||
    joined?.name?.trim() ||
    options.find((option) => option.id === rowStatusId(row))?.name ||
    applicationStatusLabel(row.status)
  );
}

function rowCurrentStage(row: ApplicationRow, options: ApplicationStatusOption[]) {
  return applicationCurrentStageMeta(row.status, rowStatusName(row, options));
}

function rowStatusDotColor(row: ApplicationRow, options: ApplicationStatusOption[]): string | null {
  const joined = oneStatusJoin(row.application_statuses);
  const fromJoin = typeof joined?.color === "string" ? joined.color.trim() : "";
  if (fromJoin) return fromJoin;
  const fromOption = options.find((option) => option.id === rowStatusId(row))?.color?.trim();
  return fromOption || null;
}

function isRowArchived(row: ApplicationRow, options: ApplicationStatusOption[]): boolean {
  return isApplicationRowArchived(row, options);
}

function matchesTab(
  row: ApplicationRow,
  tab: ApplicationTab,
  options: ApplicationStatusOption[]
): boolean {
  if (tab === "closed") {
    return isClosedPipelineApplication(row);
  }
  if (tab === "in_process" || tab === "in-process") {
    return isInProcessPipelineApplication(row);
  }
  return matchesApplicationStatusTab(row, tab, options);
}

/** Resolve ?tab= from status id, system key, or name slug (e.g. submitted-for-msp-review). */
function resolveApplicationTabParam(
  tabParam: string,
  options: ApplicationStatusOption[]
): ApplicationTab {
  const raw = tabParam.trim();
  if (!raw || raw === "all") return "all";
  if (raw === "closed") return "closed";
  if (raw === "in_process" || raw === "in-process") return "in_process";

  const byId = options.find((option) => option.id === raw);
  if (byId) return byId.id;

  const byKey = options.find((option) => option.systemKey === raw);
  if (byKey) return byKey.id;

  const slug = raw.toLowerCase();
  const nameSlugOf = (name: string) =>
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const byNameSlug = options.find(
    (option) => nameSlugOf(option.name) === slug || option.name.trim().toLowerCase() === slug
  );
  if (byNameSlug) return byNameSlug.id;

  const submissionAlias =
    slug === "submitted-to-msp"
      ? "submitted-for-msp-review"
      : slug === "submitted-for-msp-review"
        ? "submitted-to-msp"
        : null;
  if (submissionAlias) {
    const alias = options.find((option) => nameSlugOf(option.name) === submissionAlias);
    if (alias) return alias.id;
  }

  return raw;
}

function formatTimeAgo(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const days = Math.floor(Math.max(0, Date.now() - date.getTime()) / 86400000);
  if (days >= 7) {
    return date.toLocaleDateString("en-US", { timeZone: "America/New_York",  month: "long", day: "numeric", year: "numeric" });
  }
  return formatTimeAgo(iso);
}

function formatApplicationDate(iso: string | null | undefined): { relative: string; absolute: string } {
  if (!iso) return { relative: "—", absolute: "" };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { relative: "—", absolute: "" };
  return {
    relative: formatTimeAgo(iso),
    absolute: date.toLocaleDateString("en-US", { timeZone: "America/New_York", 
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
  };
}

function formatActivity(row: ApplicationRow): string {
  const when = row.updated_at || row.submitted_at || row.created_at;
  const relative = formatRelativeTime(when);
  if (row.status === "submitted" || row.status === "new") return `New Applicant • ${relative}`;
  return `${relative} • ${new Date(when).toLocaleDateString("en-US", { timeZone: "America/New_York", 
    month: "long",
    day: "numeric",
    year: "numeric",
  })}`;
}

const ACTION_TOAST_DURATION_MS = 4000;

function statusChangeSuccessMessage(
  systemKey: string | null,
  statusName: string,
  candidateName: string
): string {
  switch (systemKey) {
    case "hired":
      return `${candidateName} marked as hired successfully`;
    case "rejected":
      return `${candidateName} marked as rejected`;
    case "undecided":
      return `${candidateName} marked as undecided`;
    case "shortlisted":
      return `${candidateName} shortlisted successfully`;
    case "interviewing":
      return `${candidateName} moved to interviewing`;
    case "reviewing":
      return `${candidateName} moved to reviewing`;
    case "new":
      return `${candidateName} moved to new`;
    default:
      return `${candidateName} status updated to ${statusName}`;
  }
}

function applicantName(row: ApplicationRow): string {
  return resolveApplicationApplicantName(row);
}

function applicantEmail(row: ApplicationRow): string {
  return resolveApplicationApplicantEmail(row);
}

function applicantLocation(row: ApplicationRow): string {
  return resolveApplicationApplicantLocation(row);
}

function applicantPhone(row: ApplicationRow): string {
  return resolveApplicationApplicantPhone(row);
}

/** MSP end client (job form Contract Group / Client → msp_name). Non-MSP or empty → "". */
function applicationClientName(row: ApplicationRow): string {
  const job = one(row.job_requisitions);
  const source = String(job.source_type ?? "").trim().toLowerCase();
  if (source !== "msp") return "";
  return String(job.msp_name ?? "").trim();
}

/** Split name for edit fields — worker is authoritative after Match Analysis edits; profile is fallback. */
function applicantNameParts(row: ApplicationRow): { firstName: string; lastName: string } {
  const profile = one(row.applicant_profiles);
  const worker = one(row.worker ?? null);
  const workerFirst = String(worker.first_name ?? "").trim();
  const workerLast = String(worker.last_name ?? "").trim();
  if (workerFirst || workerLast) {
    return { firstName: workerFirst, lastName: workerLast };
  }
  return {
    firstName: String(profile.first_name ?? "").trim(),
    lastName: String(profile.last_name ?? "").trim(),
  };
}

function workflowName(row: ApplicationRow): string {
  return String(one(row.onboarding_flows).name ?? row.workflow_id);
}

export default function JobApplicationsPage() {
  const branding = useTenantBranding();
  const brandStyle = brandingToCssVars(branding) as CSSProperties;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const jobMenuRef = useRef<HTMLDivElement>(null);

  const jobId = searchParams.get("jobId")?.trim() ?? "";
  const [analysisProvider, setAnalysisProvider] = useMatchAnalysisProvider();
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [listMeta, setListMeta] = useState<{
    paged: boolean;
    total: number;
    buckets: ApplicationListBucket[];
    locations: string[];
    workflows: string[];
    stages: string[];
    multiJobApplicantCount: number;
    scopeUnanalyzedCount: number;
  }>({
    paged: false,
    total: 0,
    buckets: [],
    locations: [],
    workflows: [],
    stages: [],
    multiJobApplicantCount: 0,
    scopeUnanalyzedCount: 0,
  });
  const [job, setJob] = useState<JobHeader | null>(null);
  const [publicJobPath, setPublicJobPath] = useState<string | null>(null);
  const [jobOptions, setJobOptions] = useState<JobOption[]>([]);
  const [jobMenuOpen, setJobMenuOpen] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobSearch, setJobSearch] = useState("");
  const [jobStatusFilter, setJobStatusFilter] = useState("");
  const [jobLocationFilter, setJobLocationFilter] = useState("");
  const [jobSortBy, setJobSortBy] = useState<"newest" | "oldest">("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<ApplicationTab>(() => {
    return searchParams.get("tab")?.trim() || "all";
  });
  const statusTabsScrollRef = useRef<HTMLElement>(null);
  const activeStatusTabRef = useRef<HTMLButtonElement>(null);
  const [editColumnsOpen, setEditColumnsOpen] = useState(false);
  const [editFiltersOpen, setEditFiltersOpen] = useState(false);
  const [listColumnOrder, setListColumnOrder] = useState<ApplicationColumnId[]>([
    ...DEFAULT_APPLICATION_COLUMNS,
  ]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [listSort, setListSort] = useState<ApplicationListSortState>(EMPTY_APPLICATION_LIST_SORT);
  const sortBy = applicationToolbarSortBy(listSort);
  const [locationFilter, setLocationFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [candidateSearchQuery, setCandidateSearchQuery] = useState("");
  const [listingStatusFilter, setListingStatusFilter] = useState("");
  const [listingJobFilter, setListingJobFilter] = useState("");
  const [listingStageFilter, setListingStageFilter] = useState("");
  const [evaluationFilter, setEvaluationFilter] = useState("");
  const [workflowFilter, setWorkflowFilter] = useState("");
  const [matchScoreFilter, setMatchScoreFilter] = useState(
    () => searchParams.get("matchScore")?.trim() || ""
  );
  const [dateAppliedFilter, setDateAppliedFilter] = useState("");
  const [skillsFilter, setSkillsFilter] = useState<string[]>([]);
  const [highlightMultiJobApplicants, setHighlightMultiJobApplicants] = useState(false);
  const [rowActionsMenu, setRowActionsMenu] = useState<{
    rowId: string;
    anchor: HTMLElement;
  } | null>(null);
  const [statusMenu, setStatusMenu] = useState<{
    rowId: string;
    anchor: HTMLElement;
  } | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [statusOptions, setStatusOptions] = useState<ApplicationStatusOption[]>([]);
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    applicationId: string;
    fromLabel: string;
    toOption: ApplicationStatusOption;
  } | null>(null);
  const [statusChangeNote, setStatusChangeNote] = useState("");
  const [historyDialog, setHistoryDialog] = useState<{
    applicationId: string;
    candidateName: string;
  } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<
    Array<{
      id: string;
      fromStatus: { id: string | null; name: string | null };
      toStatus: { id: string | null; name: string };
      note: string | null;
      changedBy: { id: string | null; name: string | null };
      changedAt: string;
    }>
  >([]);
  const [matchAnalyzingId, setMatchAnalyzingId] = useState<string | null>(null);
  const [bulkAnalyzingIds, setBulkAnalyzingIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [actionTargetRowId, setActionTargetRowId] = useState<string | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [interviewSubmitting, setInterviewSubmitting] = useState(false);
  const [interviewError, setInterviewError] = useState<string | null>(null);
  const [updateResumeApplicationId, setUpdateResumeApplicationId] = useState<string | null>(null);
  const [resumeSuccessOpen, setResumeSuccessOpen] = useState(false);
  const [resumeErrorOpen, setResumeErrorOpen] = useState(false);
  const [resumeErrorMessage, setResumeErrorMessage] = useState("");
  const [addCandidateOpen, setAddCandidateOpen] = useState(false);
  const [importCandidatesOpen, setImportCandidatesOpen] = useState(false);
  const [applicationsRefreshNonce, setApplicationsRefreshNonce] = useState(0);
  const [claimConfirmOpen, setClaimConfirmOpen] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [assignRecruiterTarget, setAssignRecruiterTarget] = useState<ApplicationRow | null>(null);
  const [assignRecruiterMembers, setAssignRecruiterMembers] = useState<AssignableTeamMember[]>([]);
  const [assignRecruiterMembersLoading, setAssignRecruiterMembersLoading] = useState(false);
  const [assignRecruiterBusy, setAssignRecruiterBusy] = useState(false);
  const [assignRecruiterError, setAssignRecruiterError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const { userId: currentUserId, displayName: currentUserName } = useAdminHeaderData();

  useEffect(() => {
    setListColumnOrder(loadApplicationColumnOrder());
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
    setLocationFilter("");
    setPage(1);
    setCandidateSearchQuery("");
    setListingStatusFilter("");
    setListingJobFilter("");
    setListingStageFilter("");
    setEvaluationFilter("");
    setWorkflowFilter("");
    setMatchScoreFilter("");
    setDateAppliedFilter("");
    setSkillsFilter([]);
    setRowActionsMenu(null);
    setStatusMenu(null);
    setStatusBusyId(null);
    setPendingStatusChange(null);
    setStatusChangeNote("");
    setHistoryDialog(null);
    setRows([]);
    setLoading(true);
    if (!jobId) {
      setJob(null);
      setError("");
      return;
    }
    setJob((current) => (current?.id === jobId ? current : null));
  }, [jobId]);

  useEffect(() => {
    const tabParam = searchParams.get("tab")?.trim() || "all";
    if (tabParam === "all") {
      setActiveTab("all");
      return;
    }
    if (statusOptions.length === 0) {
      setActiveTab(tabParam);
      return;
    }
    setActiveTab(resolveApplicationTabParam(tabParam, statusOptions));
  }, [searchParams, statusOptions]);

  useEffect(() => {
    const next = searchParams.get("matchScore")?.trim() || "";
    setMatchScoreFilter((current) => (current === next ? current : next));
  }, [searchParams]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/application-statuses?activeOnly=1", {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Failed to load statuses");
        setStatusOptions(
          ((payload.statuses ?? []) as Array<Record<string, unknown>>).map((row) => ({
            id: String(row.id),
            name: String(row.name),
            systemKey: (row.systemKey as string | null) ?? null,
            color: (row.color as string | null) ?? null,
            sortOrder: Number(row.sortOrder ?? 0),
            ...readStatusGroupFields(row),
          }))
        );
      } catch {
        setStatusOptions([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!jobMenuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!jobMenuRef.current?.contains(event.target as Node)) {
        setJobMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setJobMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [jobMenuOpen]);

  const loadJobOptions = useCallback(async () => {
    setJobsLoading(true);
    try {
      const response = await fetch("/api/admin/jobs", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to load jobs");
      setJobOptions((payload.jobs ?? []) as JobOption[]);
    } catch {
      setJobOptions([]);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobOptions();
  }, [loadJobOptions]);

  const selectJob = useCallback(
    (nextJob: JobOption) => {
      setJob(toJobHeader(nextJob));
      setRows([]);
      setSelectedIds(new Set());
      setLocationFilter("");
      setJobMenuOpen(false);
      setLoading(true);

      const params = new URLSearchParams(searchParams.toString());
      params.set("jobId", nextJob.id);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const selectAllJobs = useCallback(() => {
    setJob(null);
    setRows([]);
    setSelectedIds(new Set());
    setLocationFilter("");
    setJobMenuOpen(false);
    setLoading(true);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("jobId");
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  }, [pathname, router, searchParams]);

  const handleViewAllMultiJobApplicants = useCallback(() => {
    setHighlightMultiJobApplicants(true);
    setActiveTab("all");
    setJob(null);
    setRows([]);
    setSelectedIds(new Set());
    setLocationFilter("");
    setJobMenuOpen(false);
    setLoading(true);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("jobId");
    params.delete("tab");
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  }, [pathname, router, searchParams]);

  const clearJobDropdownFilters = useCallback(() => {
    setJobSearch("");
    setJobStatusFilter("");
    setJobLocationFilter("");
    setJobSortBy("newest");
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const requestJobId = jobId;
      const tab = resolveApplicationTabParam(String(activeTab), statusOptions);
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      params.set("tzOffset", String(new Date().getTimezoneOffset()));
      params.set("sort", listSort.column ?? "evaluation");
      params.set("sortDir", listSort.direction);
      if (requestJobId) params.set("jobId", requestJobId);
      if (matchScoreFilter) params.set("matchScore", matchScoreFilter);
      if (skillsFilter.length) params.set("skills", skillsFilter.join(","));
      if (tab !== "all") params.set("tab", tab);
      if (candidateSearchQuery.trim()) params.set("q", candidateSearchQuery.trim());
      if (locationFilter) params.set("location", locationFilter);
      if (listingStatusFilter) params.set("statusId", listingStatusFilter);
      if (listingJobFilter) params.set("listingJobId", listingJobFilter);
      if (listingStageFilter) params.set("stage", listingStageFilter);
      if (evaluationFilter) params.set("evaluation", evaluationFilter);
      if (workflowFilter) params.set("workflow", workflowFilter);
      if (dateAppliedFilter) params.set("dateApplied", dateAppliedFilter);
      if (highlightMultiJobApplicants) params.set("multiJob", "1");
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/job-applications?${params}`, { cache: "no-store" });
        const payload = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(payload.error || "Failed to load applications");
        const applications = (payload.applications ?? []) as ApplicationRow[];
        setRows(applications);
        setListMeta({
          paged: Boolean(payload.paged),
          total: Number(payload.total ?? applications.length),
          buckets: Array.isArray(payload.buckets) ? payload.buckets : [],
          locations: Array.isArray(payload.locations) ? payload.locations.map(String) : [],
          workflows: Array.isArray(payload.workflows) ? payload.workflows.map(String) : [],
          stages: Array.isArray(payload.stages) ? payload.stages.map(String) : [],
          multiJobApplicantCount: Number(payload.multiJobApplicantCount ?? 0),
          scopeUnanalyzedCount: Number(payload.scopeUnanalyzedCount ?? 0),
        });
        setError("");
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load applications");
        setRows([]);
        setListMeta({
          paged: false,
          total: 0,
          buckets: [],
          locations: [],
          workflows: [],
          stages: [],
          multiJobApplicantCount: 0,
          scopeUnanalyzedCount: 0,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [jobId, applicationsRefreshNonce, matchScoreFilter, skillsFilter, page, pageSize, activeTab, statusOptions, candidateSearchQuery, locationFilter, listingStatusFilter, listingJobFilter, listingStageFilter, evaluationFilter, workflowFilter, dateAppliedFilter, highlightMultiJobApplicants, listSort]);

  function openAddCandidateModal() {
    if (!jobId) {
      toast.error("Select a job before adding a candidate.");
      return;
    }
    setAddCandidateOpen(true);
  }

  function openMatchExistingCandidateModal() {
    if (!jobId) {
      toast.error("Select a job before matching an existing candidate.");
      return;
    }
    setImportCandidatesOpen(true);
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!jobId) {
        setJob(null);
        setPublicJobPath(null);
        return;
      }
      try {
        const response = await fetch(`/api/admin/jobs/${encodeURIComponent(jobId)}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(payload.error || "Failed to load job");
        const data = payload.job ?? null;
        setJob(data ? toJobHeader(data) : null);
        setPublicJobPath(
          typeof payload.publicJobPath === "string" ? payload.publicJobPath : null
        );
      } catch {
        if (!cancelled) {
          setJob(null);
          setPublicJobPath(null);
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, locationFilter, pageSize, jobId, candidateSearchQuery, highlightMultiJobApplicants, listingStatusFilter, listingJobFilter, listingStageFilter, evaluationFilter, workflowFilter, matchScoreFilter, dateAppliedFilter, skillsFilter]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, pageSize, activeTab, locationFilter, jobId, candidateSearchQuery, highlightMultiJobApplicants, listingStatusFilter, listingJobFilter, listingStageFilter, evaluationFilter, workflowFilter, matchScoreFilter, dateAppliedFilter, skillsFilter]);
  // Sorting intentionally preserves selection (stable IDs) and does not reset the page.

  function handleSortByChange(value: "newest" | "oldest" | "matchScore" | "matchScoreAsc") {
    setListSort(applicationListSortFromToolbar(value));
  }

  function handleListColumnSort(columnId: string) {
    if (!isApplicationListSortableColumn(columnId)) return;
    setListSort((current) => toggleApplicationListSort(current, columnId));
  }

  function handleClaimCandidates() {
    const eligibleIds = [...selectedIds].filter((id) => {
      const row = rows.find((item) => item.id === id);
      if (!row) return false;
      return isApplicationClaimEligible({
        assignedRecruiterUserId: row.assigned_recruiter_user_id,
        status: row.status,
        currentUserId: currentUserId ?? "",
      }).eligible;
    });
    if (eligibleIds.length === 0) {
      toast("Select eligible unclaimed candidates first.");
      return;
    }
    setClaimError(null);
    setClaimConfirmOpen(true);
  }

  async function confirmClaimCandidates() {
    const eligibleIds = [...selectedIds].filter((id) => {
      const row = rows.find((item) => item.id === id);
      if (!row) return false;
      return isApplicationClaimEligible({
        assignedRecruiterUserId: row.assigned_recruiter_user_id,
        status: row.status,
        currentUserId: currentUserId ?? "",
      }).eligible;
    });
    if (claimBusy || eligibleIds.length === 0) return;
    setClaimBusy(true);
    setClaimError(null);
    try {
      const result = await postClaimApplications(eligibleIds);
      toast.success(result.summary);
      const claimed = new Set(result.claimed);
      const ownerId = result.recruiter?.id ?? currentUserId;
      const ownerName = result.recruiter?.name ?? currentUserName ?? "You";
      if (claimed.size > 0) {
        setRows((current) =>
          current.map((row) =>
            claimed.has(row.id)
              ? {
                  ...row,
                  assigned_recruiter_user_id: ownerId,
                  assignedRecruiter: ownerId
                    ? {
                        id: ownerId,
                        name: ownerName,
                        profilePhotoUrl: row.assignedRecruiter?.profilePhotoUrl ?? null,
                      }
                    : null,
                }
              : row
          )
        );
      }
      setSelectedIds((current) => {
        const next = new Set(current);
        for (const id of [...result.claimed, ...result.already_claimed, ...result.ineligible]) {
          next.delete(id);
        }
        if (result.failed.length === 0 && result.not_found.length === 0) {
          return new Set();
        }
        return next;
      });
      if (result.failed.length === 0 && result.not_found.length === 0) {
        setClaimConfirmOpen(false);
      }
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : "Failed to claim candidates");
    } finally {
      setClaimBusy(false);
    }
  }

  async function openAssignRecruiter(row: ApplicationRow) {
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
        `/api/admin/job-applications/${encodeURIComponent(assignRecruiterTarget.id)}/assignment`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignedRecruiterUserId: assigneeUserId }),
        }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        assignedRecruiterUserId?: string | null;
        assignedRecruiter?: { id: string; name: string } | null;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to assign recruiter");
      }
      const nextId = payload.assignedRecruiterUserId ?? null;
      const nextName = payload.assignedRecruiter?.name?.trim() || null;
      setRows((current) =>
        current.map((row) =>
          row.id === assignRecruiterTarget.id
            ? {
                ...row,
                assigned_recruiter_user_id: nextId,
                assignedRecruiter: nextId
                  ? {
                      id: nextId,
                      name: nextName || "Team member",
                      profilePhotoUrl: null,
                    }
                  : null,
              }
            : row
        )
      );
      toast.success(nextName ? `Assigned to ${nextName}` : "Recruiter unassigned");
      setAssignRecruiterTarget(null);
    } catch (err) {
      setAssignRecruiterError(err instanceof Error ? err.message : "Failed to assign recruiter");
    } finally {
      setAssignRecruiterBusy(false);
    }
  }

  const selectedJobOption = useMemo(
    () => jobOptions.find((option) => option.id === jobId) ?? null,
    [jobOptions, jobId]
  );

  const jobDropdownLocations = useMemo(() => {
    const set = new Set<string>();
    for (const option of jobOptions) {
      const loc = formatJobLocation(option);
      if (loc && loc !== "—") set.add(loc);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [jobOptions]);

  const filteredJobOptions = useMemo(() => {
    const query = jobSearch.trim().toLowerCase();
    let next = jobOptions.filter((option) => {
      if (jobStatusFilter && option.status !== jobStatusFilter) return false;
      if (jobLocationFilter) {
        const loc = formatJobLocation(option);
        if (loc !== jobLocationFilter) return false;
      }
      if (query) {
        const title = (option.public_title || "").toLowerCase();
        const ref = jobReference(option).toLowerCase();
        if (!title.includes(query) && !ref.includes(query)) return false;
      }
      return true;
    });
    next = [...next].sort((a, b) => {
      const aTime = new Date(a.created_at || 0).getTime();
      const bTime = new Date(b.created_at || 0).getTime();
      return jobSortBy === "newest" ? bTime - aTime : aTime - bTime;
    });
    return next;
  }, [jobOptions, jobSearch, jobStatusFilter, jobLocationFilter, jobSortBy]);

  const jobTitle =
    job?.public_title?.trim() ||
    selectedJobOption?.public_title?.trim() ||
    (jobId ? "Job" : "All jobs");
  const jobLocation = formatJobLocation(job ?? selectedJobOption);
  const activeJob = job ?? selectedJobOption;
  const jobPostedOn = formatJobPostedOn(activeJob?.published_at || activeJob?.created_at);
  const jobIdLabel = activeJob ? jobReference(activeJob) : "—";
  const jobCompany = jobCompanyName(activeJob);
  const jobType = jobTypeLabel(activeJob);

  const jobScopedStatusOptions = useMemo(() => {
    if (!jobId) return statusOptions;
    return filterApplicationStatusesForSource(statusOptions, job?.source_type);
  }, [job?.source_type, jobId, statusOptions]);

  const listingStatusOptions = useMemo(
    () =>
      jobScopedStatusOptions.map((option) => ({
        value: option.id,
        label: option.name,
        sortOrder: option.sortOrder,
        groupName: option.groupName,
        groupDescription: option.groupDescription,
        groupSortOrder: option.groupSortOrder,
        groupSystemKey: option.groupSystemKey,
      })),
    [jobScopedStatusOptions]
  );

  const listingJobOptions = useMemo(
    () =>
      jobOptions.map((option) => ({
        value: option.id,
        label: option.public_title?.trim() || "Untitled job",
      })),
    [jobOptions]
  );

  const listingStageOptions = useMemo(() => {
    if (listMeta.paged) {
      return listMeta.stages.map((label) => ({ value: label, label }));
    }
    const labels = new Set<string>();
    for (const row of rows) {
      labels.add(rowCurrentStage(row, statusOptions).label);
    }
    return Array.from(labels)
      .sort((a, b) => a.localeCompare(b))
      .map((label) => ({ value: label, label }));
  }, [rows, statusOptions, listMeta.paged, listMeta.stages]);

  const workflowOptions = useMemo(() => {
    if (listMeta.paged) return listMeta.workflows;
    const labels = new Set<string>();
    for (const row of rows) {
      const name = workflowName(row).trim();
      if (name) labels.add(name);
    }
    return Array.from(labels).sort((a, b) => a.localeCompare(b));
  }, [rows, listMeta.paged, listMeta.workflows]);

  const editFiltersValue = useMemo(
    (): ApplicationsExtendedFilterValues => ({
      status: listingStatusFilter,
      stage: listingStageFilter,
      location: locationFilter,
      evaluation: evaluationFilter,
      workflow: workflowFilter,
      matchScore: matchScoreFilter,
      dateApplied: dateAppliedFilter,
      job: listingJobFilter,
      skills: skillsFilter,
    }),
    [
      listingStatusFilter,
      listingStageFilter,
      locationFilter,
      evaluationFilter,
      workflowFilter,
      matchScoreFilter,
      dateAppliedFilter,
      listingJobFilter,
      skillsFilter,
    ]
  );

  const handleSaveEditFilters = useCallback((next: ApplicationsExtendedFilterValues) => {
    setListingStatusFilter(next.status);
    setListingStageFilter(next.stage);
    setLocationFilter(next.location);
    setEvaluationFilter(next.evaluation);
    setWorkflowFilter(next.workflow);
    setMatchScoreFilter(next.matchScore);
    setDateAppliedFilter(next.dateApplied);
    setListingJobFilter(next.job);
    setSkillsFilter(next.skills);
  }, []);

  const activeFilterCount = useMemo(() => {
    return [
      listingStatusFilter,
      listingStageFilter,
      locationFilter,
      evaluationFilter,
      workflowFilter,
      matchScoreFilter,
      dateAppliedFilter,
      listingJobFilter,
    ].filter(Boolean).length;
  }, [
    listingStatusFilter,
    listingStageFilter,
    locationFilter,
    evaluationFilter,
    workflowFilter,
    matchScoreFilter,
    dateAppliedFilter,
    listingJobFilter,
  ]);

  const handleApplyApplicationsSearch = useCallback(
    (next: { query: string; skills: string[] }) => {
      setCandidateSearchQuery(next.query);
      setSkillsFilter(next.skills);
      setPage(1);
    },
    []
  );

  const handleResetApplicationsSearch = useCallback(() => {
    setCandidateSearchQuery("");
    setSkillsFilter([]);
    setPage(1);
  }, []);

  const statusTabs = useMemo(() => {
    const pipeline = jobScopedStatusOptions.filter((option) => option.systemKey !== "archived");
    const archivedTab = statusOptions.find((option) => option.systemKey === "archived");
    const visible = archivedTab
      ? [...pipeline.filter((option) => option.id !== archivedTab.id), archivedTab]
      : pipeline;
    return [
      { id: "all" as const, label: "All", sortOrder: -1, groupId: null, groupName: null, groupDescription: null, groupSortOrder: null, groupSystemKey: null },
      ...visible.map((option) => ({
        id: option.id,
        label: option.name,
        sortOrder: option.sortOrder,
        groupId: option.groupId ?? null,
        groupName: option.groupName ?? null,
        groupDescription: option.groupDescription ?? null,
        groupSortOrder: option.groupSortOrder ?? null,
        groupSystemKey: option.groupSystemKey ?? null,
      })),
    ];
  }, [jobScopedStatusOptions, statusOptions]);

  const pipelineTabSections = useMemo(() => {
    const rest = statusTabs.filter((tab) => tab.id !== "all");
    return groupStatuses(
      rest.map((tab) => ({
        ...tab,
        id: tab.id,
        name: tab.label,
      }))
    );
  }, [statusTabs]);

  const resolvedActiveTab = useMemo(
    () => resolveApplicationTabParam(String(activeTab), statusOptions),
    [activeTab, statusOptions]
  );

  /** When ?tab=closed, jump to the concrete status tab that owns the closed candidates. */
  useEffect(() => {
    if (resolvedActiveTab !== "closed") return;
    if (!listMeta.buckets.length || !statusOptions.length) return;
    const bestId = bestPipelineStatusId(listMeta.buckets, "closed");
    if (!bestId) return;

    setActiveTab(bestId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", bestId);
    router.replace(`${pathname}?${params.toString()}`);
  }, [resolvedActiveTab, listMeta.buckets, statusOptions, searchParams, router, pathname]);

  /** When ?tab=in_process, jump to the in-process status tab with the most candidates. */
  useEffect(() => {
    if (resolvedActiveTab !== "in_process") return;
    if (!listMeta.buckets.length || !statusOptions.length) return;
    const bestId = bestPipelineStatusId(listMeta.buckets, "in_process");
    if (!bestId) return;

    setActiveTab(bestId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", bestId);
    router.replace(`${pathname}?${params.toString()}`);
  }, [resolvedActiveTab, listMeta.buckets, statusOptions, searchParams, router, pathname]);

  useLayoutEffect(() => {
    const scroller = statusTabsScrollRef.current;
    const tabButton = activeStatusTabRef.current;
    if (!scroller || !tabButton) return;

    const scrollTabIntoView = () => {
      const scrollerRect = scroller.getBoundingClientRect();
      const tabRect = tabButton.getBoundingClientRect();
      const tabCenter = tabRect.left + tabRect.width / 2;
      const scrollerCenter = scrollerRect.left + scrollerRect.width / 2;
      const nextLeft = scroller.scrollLeft + (tabCenter - scrollerCenter);
      const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      scroller.scrollTo({
        left: Math.max(0, Math.min(maxLeft, nextLeft)),
        behavior: "smooth",
      });
    };

    scrollTabIntoView();
    const frame = window.requestAnimationFrame(scrollTabIntoView);
    const timer = window.setTimeout(scrollTabIntoView, 120);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [resolvedActiveTab, statusTabs]);

  const selectableStatusOptions = useMemo(
    () => statusOptions.filter((option) => option.systemKey !== "archived"),
    [statusOptions]
  );

  const tabCounts = useMemo(() => {
    if (listMeta.paged) return tabCountsFromBuckets(listMeta.buckets, statusOptions);
    const counts: Record<string, number> = { all: 0 };
    for (const option of statusOptions) counts[option.id] = 0;
    for (const row of rows) {
      counts.all += 1;

      const archived = isRowArchived(row, statusOptions);
      const statusId = rowStatusId(row);
      if (statusId && statusId in counts) {
        counts[statusId] += 1;
        continue;
      }
      const byKey = statusOptions.find(
        (option) =>
          option.systemKey &&
          option.systemKey ===
            (archived ? "archived" : normalizeApplicationStatus(row.status))
      );
      if (byKey) counts[byKey.id] += 1;
    }
    return counts;
  }, [rows, statusOptions, listMeta.paged, listMeta.buckets]);

  const baseFilteredRows = useMemo(() => {
    if (listMeta.paged) return rows;
    let next = rows.filter((row) => matchesTab(row, resolvedActiveTab, statusOptions));
    if (locationFilter) {
      next = next.filter((row) => {
        const loc = applicantLocation(row);
        return loc.toLowerCase().includes(locationFilter.toLowerCase());
      });
    }
    const query = candidateSearchQuery.trim();
    if (query) {
      next = next.filter((row) => matchesApplicationListSearch(row, query));
    }
    if (listingStatusFilter) {
      next = next.filter((row) => rowStatusId(row) === listingStatusFilter);
    }
    if (listingJobFilter) {
      next = next.filter((row) => row.job_requisition_id === listingJobFilter);
    }
    if (listingStageFilter) {
      next = next.filter(
        (row) => rowCurrentStage(row, statusOptions).label === listingStageFilter
      );
    }
    if (evaluationFilter === "analyzed") {
      next = next.filter((row) => row.ai_match_status === "ANALYZED");
    } else if (evaluationFilter === "not_yet") {
      next = next.filter((row) => row.ai_match_status !== "ANALYZED");
    }
    if (workflowFilter) {
      next = next.filter((row) => workflowName(row) === workflowFilter);
    }
    if (matchScoreFilter) {
      next = next.filter((row) =>
        applicationMatchesMatchScoreFilter(row.ai_match_score, matchScoreFilter)
      );
    }
    if (dateAppliedFilter) {
      next = next.filter((row) =>
        applicationMatchesDateAppliedFilter(row.submitted_at || row.created_at, dateAppliedFilter)
      );
    }
    return sortApplicationRows(next, listSort);
  }, [rows, resolvedActiveTab, locationFilter, listSort, candidateSearchQuery, statusOptions, listingStatusFilter, listingJobFilter, listingStageFilter, evaluationFilter, workflowFilter, matchScoreFilter, dateAppliedFilter, listMeta.paged]);

  const multiJobApplicantCount = useMemo(() => {
    if (listMeta.paged) return listMeta.multiJobApplicantCount;
    return countUniqueMultiJobApplicants(
      baseFilteredRows,
      (row) => Number(row.appliedJobCount ?? 1),
      (row) => resolveApplicationWorkerId(row) || row.id
    );
  }, [baseFilteredRows, listMeta.paged, listMeta.multiJobApplicantCount]);

  const filteredRows = useMemo(() => {
    if (listMeta.paged) return rows;
    if (!highlightMultiJobApplicants) return baseFilteredRows;
    return baseFilteredRows.filter((row) => Number(row.appliedJobCount ?? 1) > 1);
  }, [baseFilteredRows, highlightMultiJobApplicants, listMeta.paged, rows]);

  const resultTotal = listMeta.paged ? listMeta.total : filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(resultTotal / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = resultTotal === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = listMeta.paged
    ? rows.length === 0
      ? 0
      : pageStart + rows.length - 1
    : Math.min(currentPage * pageSize, resultTotal);
  const paginatedRows = listMeta.paged
    ? rows
    : filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const listColumns = ensureActionsLast(
    listColumnOrder.length ? listColumnOrder : DEFAULT_APPLICATION_COLUMNS
  );
  // Selection is for export / archive / delete / analyze — not claim-gated.
  const allVisibleSelected =
    paginatedRows.length > 0 && paginatedRows.every((row) => selectedIds.has(row.id));

  const someVisibleSelected = paginatedRows.some((row) => selectedIds.has(row.id));

  const selectedOnPageCount = paginatedRows.filter((row) => selectedIds.has(row.id)).length;

  const selectedEligibleCount = useMemo(
    () =>
      [...selectedIds].filter((id) => {
        const row = rows.find((item) => item.id === id);
        if (!row) return false;
        return isApplicationClaimEligible({
          assignedRecruiterUserId: row.assigned_recruiter_user_id,
          status: row.status,
          currentUserId: currentUserId ?? "",
        }).eligible;
      }).length,
    [selectedIds, rows, currentUserId]
  );

  const { analyzeIds: jobAnalyzeIds } = useMemo(
    () =>
      partitionMatchAnalysisTargets(
        rows.map((row) => ({ applicationId: row.id, status: row.ai_match_status }))
      ),
    [rows]
  );
  const analyzeAllCount = listMeta.paged ? listMeta.scopeUnanalyzedCount : jobAnalyzeIds.length;

  const { analyzeIds: selectedAnalyzeIds, reanalyzeIds: selectedReanalyzeIds } = useMemo(
    () =>
      partitionMatchAnalysisTargets(
        [...selectedIds].map((id) => {
          const row = rows.find((r) => r.id === id);
          return { applicationId: id, status: row?.ai_match_status };
        })
      ),
    [selectedIds, rows]
  );
  const bulkAnalyzeBusy = bulkAnalyzingIds.size > 0;

  const exportFilenameBase = jobId ? `job-candidates-${jobId.slice(0, 8)}` : "job-candidates";

  async function rowsForExport() {
    if (selectedIds.size > 0) {
      const selected = rows.filter((row) => selectedIds.has(row.id));
      const base = selected.length > 0 ? selected : rows;
      return base.map((row) => ({
        ...row,
        statusName: rowStatusName(row, statusOptions),
      }));
    }

    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("export", "1");
    params.set("tzOffset", String(new Date().getTimezoneOffset()));
    params.set("sort", listSort.column ?? "evaluation");
    params.set("sortDir", listSort.direction);
    if (jobId) params.set("jobId", jobId);
    if (matchScoreFilter) params.set("matchScore", matchScoreFilter);
    if (skillsFilter.length) params.set("skills", skillsFilter.join(","));
    const tab = resolveApplicationTabParam(String(activeTab), statusOptions);
    if (tab !== "all") params.set("tab", tab);
    if (candidateSearchQuery.trim()) params.set("q", candidateSearchQuery.trim());
    if (locationFilter) params.set("location", locationFilter);
    if (listingStatusFilter) params.set("statusId", listingStatusFilter);
    if (listingJobFilter) params.set("listingJobId", listingJobFilter);
    if (listingStageFilter) params.set("stage", listingStageFilter);
    if (evaluationFilter) params.set("evaluation", evaluationFilter);
    if (workflowFilter) params.set("workflow", workflowFilter);
    if (dateAppliedFilter) params.set("dateApplied", dateAppliedFilter);
    if (highlightMultiJobApplicants) params.set("multiJob", "1");
    const response = await fetch(`/api/admin/job-applications?${params}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Failed to export applications");
    const applications = (payload.applications ?? []) as ApplicationRow[];
    return applications.map((row) => ({
      ...row,
      statusName: row.statusName || rowStatusName(row, statusOptions),
    }));
  }

  async function handleExportApplicationsCsv() {
    exportApplicationsCsv(await rowsForExport(), {
      includeJob: !jobId,
      filename: `${exportFilenameBase}.csv`,
    });
  }

  async function handleExportApplicationsXls() {
    exportApplicationsXls(await rowsForExport(), {
      includeJob: !jobId,
      filename: `${exportFilenameBase}.xls`,
    });
  }

  const locationOptions = useMemo(() => {
    if (listMeta.paged) return listMeta.locations;
    const set = new Set<string>();
    for (const row of rows) {
      const loc = applicantLocation(row);
      if (loc) set.add(loc);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, listMeta.paged, listMeta.locations]);

  function toggleSelectAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      const pageIds = paginatedRows.map((row) => row.id);
      const allSelected =
        pageIds.length > 0 && pageIds.every((id) => next.has(id));
      if (allSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleConfirmDeleteCandidates() {
    const idsToDelete =
      pendingDeleteIds.length > 0 ? pendingDeleteIds : [...selectedIds];
    if (deleteBusy || idsToDelete.length === 0) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const response = await fetch("/api/admin/job-applications", {
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
        Array.isArray(payload.deletedIds) ? payload.deletedIds.map(String) : []
      );
      setRows((current) => current.filter((row) => !deletedIds.has(row.id)));
      setSelectedIds((current) => {
        const next = new Set(current);
        for (const id of deletedIds) next.delete(id);
        return next;
      });
      setPendingDeleteIds([]);
      setDeleteConfirmOpen(false);
      const deletedCount =
        typeof payload.count === "number" ? payload.count : deletedIds.size;
      toast.success(
        `Deleted ${deletedCount} candidate${deletedCount === 1 ? "" : "s"}`,
        { duration: ACTION_TOAST_DURATION_MS }
      );
    } catch (deleteErr) {
      const message =
        deleteErr instanceof Error ? deleteErr.message : "Failed to delete candidates";
      setDeleteError(message);
      toast.error(message);
    } finally {
      setDeleteBusy(false);
    }
  }

  function actionRow(): ApplicationRow | null {
    if (!actionTargetRowId) return null;
    return rows.find((row) => row.id === actionTargetRowId) ?? null;
  }

  function beginDeleteCandidate(applicationId: string) {
    setPendingDeleteIds([applicationId]);
    setDeleteError(null);
    setDeleteConfirmOpen(true);
  }

  async function handleBulkArchiveSelected() {
    const ids = [...selectedIds];
    if (archiveBusy || ids.length === 0) return;
    const archivedOption = statusOptions.find((option) => option.systemKey === "archived");
    if (!archivedOption) {
      toast.error("Archived status is not configured for this organization.");
      return;
    }
    setArchiveBusy(true);
    let archived = 0;
    try {
      for (const id of ids) {
        const row = rows.find((item) => item.id === id);
        if (!row || isRowArchived(row, statusOptions)) continue;
        const ok = await applyApplicationStatus(
          id,
          archivedOption,
          "Archived from candidates list"
        );
        if (ok) archived += 1;
      }
      if (archived > 0) {
        toast.success(`Archived ${archived} candidate${archived === 1 ? "" : "s"}`, {
          duration: ACTION_TOAST_DURATION_MS,
        });
        setSelectedIds(new Set());
      } else {
        toast.success("No candidates needed archiving");
      }
    } finally {
      setArchiveBusy(false);
    }
  }

  function beginUpdateResume(applicationId: string) {
    const row = rows.find((item) => item.id === applicationId);
    if (!row) return;
    const workerId = resolveApplicationWorkerId(row);
    const profile = Array.isArray(row.applicant_profiles)
      ? row.applicant_profiles[0]
      : row.applicant_profiles;
    const profileId =
      profile && typeof profile === "object" && typeof (profile as { id?: unknown }).id === "string"
        ? String((profile as { id: string }).id).trim()
        : "";
    if (!workerId && !profileId) {
      setResumeErrorMessage("Candidate profile is not linked yet. Cannot update resume.");
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
        action: string | null;
        readiness: string | null;
        displayCategory?: string | null;
        stage?: string | null;
        requirementCounts?: ListingRequirementOutcomeCounts | null;
      } | null;
    }
  ) {
    const match = result.resumeUploaded ? result.autoQuickMatch : null;
    const matchOk = match?.status === "ANALYZED";
    const matchFailed = Boolean(
      result.resumeUploaded && match && match.status !== "ANALYZED"
    );

    setRows((current) =>
      current.map((row) => {
        if (row.id !== applicationId) return row;
        const profile = one(row.applicant_profiles);
        const worker = one(row.worker ?? null);
        const renamed = {
          ...row,
          applicant_profiles: {
            ...profile,
            first_name: result.firstName,
            last_name: result.lastName,
          },
          worker: { ...worker, first_name: result.firstName, last_name: result.lastName },
        } as ApplicationRow;

        if (!result.resumeUploaded) return renamed;
        if (matchOk && match) {
          return {
            ...renamed,
            ai_match_status: match.status,
            ai_match_score: match.score ?? null,
            ai_match_category: match.category ?? null,
            ai_match_action: match.action ?? null,
            ai_match_readiness: match.readiness ?? null,
            ai_match_display_category: match.displayCategory ?? null,
            ai_match_stage: match.stage ?? "quick",
            ai_requirement_counts: match.requirementCounts ?? null,
          };
        }
        return {
          ...renamed,
          ai_match_status: matchFailed ? "FAILED" : "READY",
          ai_match_score: null,
          ai_match_category: null,
          ai_match_action: null,
          ai_match_readiness: null,
          ai_match_display_category: null,
          ai_match_stage: null,
          ai_requirement_counts: null,
        };
      })
    );

    const candidateLabel =
      [result.firstName, result.lastName].filter(Boolean).join(" ").trim() || "Candidate";
    if (result.resumeUploaded) {
      toast.success(`${candidateLabel}: resume updated successfully`, {
        duration: ACTION_TOAST_DURATION_MS,
      });
      setResumeSuccessOpen(true);
      if (matchOk) {
        toast.success(`${candidateLabel}: Quick Match complete`, {
          duration: ACTION_TOAST_DURATION_MS,
        });
      } else if (matchFailed) {
        toast.error(
          match?.error?.trim() ||
            "Quick Match did not finish — use Re-run Quick Match to try again."
        );
      }
    } else {
      toast.success(`${candidateLabel}: candidate details updated`, {
        duration: ACTION_TOAST_DURATION_MS,
      });
    }
  }

  function beginArchiveCandidate(applicationId: string) {
    const archivedOption = statusOptions.find((option) => option.systemKey === "archived");
    if (!archivedOption) {
      toast.error("Archived status is not configured for this organization.");
      return;
    }
    const row = rows.find((item) => item.id === applicationId);
    if (!row) return;
    if (isRowArchived(row, statusOptions)) {
      toast.success("Candidate is already archived");
      return;
    }
    void applyApplicationStatus(applicationId, archivedOption, "Archived from candidates list", {
      switchToArchivedTab: true,
    });
  }

  function beginUnarchiveCandidate(applicationId: string) {
    const newOption = statusOptions.find((option) => option.systemKey === "new");
    if (!newOption) {
      toast.error("New status is not configured for this organization.");
      return;
    }
    const row = rows.find((item) => item.id === applicationId);
    if (!row) return;
    if (!isRowArchived(row, statusOptions)) {
      toast.success("Candidate is not archived");
      return;
    }
    void applyApplicationStatus(applicationId, newOption, "Restored from archive");
  }

  async function applyApplicationStatus(
    applicationId: string,
    toOption: ApplicationStatusOption,
    note?: string,
    options?: { switchToArchivedTab?: boolean }
  ) {
    if (statusBusyId) {
      toast.error("Please wait — a status update is already in progress.");
      return false;
    }
    const previousRow = rows.find((item) => item.id === applicationId);
    const wasArchived = previousRow ? isRowArchived(previousRow, statusOptions) : false;
    setStatusBusyId(applicationId);
    try {
      const response = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationId)}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            statusId: toOption.id,
            note: note?.trim() || undefined,
          }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string" ? payload.error : "Failed to update status"
        );
      }
      const nextStatus = String(payload.application?.status ?? toOption.systemKey ?? "custom");
      const nextStatusId = String(payload.application?.statusId ?? toOption.id);
      const nextStatusName = String(payload.application?.statusName ?? toOption.name);
      setRows((current) =>
        current.map((row) =>
          row.id === applicationId
            ? {
                ...row,
                status: nextStatus,
                status_id: nextStatusId,
                statusName: nextStatusName,
                statusNote: note?.trim() || payload.history?.note || null,
                application_statuses: {
                  id: nextStatusId,
                  name: nextStatusName,
                  system_key: toOption.systemKey,
                  color: toOption.color,
                },
              }
            : row
        )
      );
      setPendingStatusChange(null);
      setStatusChangeNote("");
      if (toOption.systemKey === "archived") {
        const candidateLabel = previousRow ? applicantName(previousRow) : "Candidate";
        toast.success(`${candidateLabel} archived successfully`, { duration: ACTION_TOAST_DURATION_MS });
        if (options?.switchToArchivedTab) {
          window.setTimeout(() => {
            setActiveTab(toOption.id);
            const params = new URLSearchParams(searchParams.toString());
            params.set("tab", toOption.id);
            router.replace(`${pathname}?${params.toString()}`);
          }, 300);
        }
      } else if (wasArchived && toOption.systemKey !== "archived") {
        const candidateLabel = previousRow ? applicantName(previousRow) : "Candidate";
        toast.success(`${candidateLabel} restored from archive`, { duration: ACTION_TOAST_DURATION_MS });
      } else if (payload.unchanged) {
        toast.success("Status unchanged");
      } else {
        const candidateLabel = previousRow ? applicantName(previousRow) : "Candidate";
        toast.success(
          statusChangeSuccessMessage(toOption.systemKey, nextStatusName, candidateLabel),
          { duration: ACTION_TOAST_DURATION_MS }
        );
      }
      if (historyDialog?.applicationId === applicationId) {
        void loadStatusHistory(applicationId);
      }
      return true;
    } catch (updateError) {
      toast.error(
        updateError instanceof Error ? updateError.message : "Failed to update status"
      );
      return false;
    } finally {
      setStatusBusyId(null);
    }
  }

  async function handleScheduleInterview(payload: ScheduleInterviewPayload) {
    const row = actionRow();
    if (!row) return;
    setInterviewSubmitting(true);
    setInterviewError(null);
    try {
      const response = await fetch("/api/admin/applicant-appointments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          applicationId: row.id,
          jobId: jobId || row.job_requisition_id,
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
        setRows((current) =>
          current.map((item) =>
            item.id === row.id ? { ...item, status: "interviewing" } : item
          )
        );
      }
      setInterviewOpen(false);
      setInterviewError(null);
      setActionTargetRowId(null);
      const candidateLabel = applicantName(row);
      toast.success(`${candidateLabel}: ${invitationSuccessMessage(data.invitation)}`, {
        duration: ACTION_TOAST_DURATION_MS,
      });
    } catch (scheduleError) {
      const message =
        scheduleError instanceof Error ? scheduleError.message : "Failed to schedule interview";
      setInterviewError(message);
      toast.error(message);
    } finally {
      setInterviewSubmitting(false);
    }
  }

  function beginQuickStatusChange(
    applicationId: string,
    systemKey: ApplicationPipelineStatus,
    note?: string
  ) {
    const option = statusOptions.find((item) => item.systemKey === systemKey);
    if (!option) {
      toast.error("That status is not configured for this organization.");
      return;
    }
    const row = rows.find((item) => item.id === applicationId);
    if (!row) return;
    if (rowStatusId(row) === option.id) {
      toast.success(`Candidate is already ${option.name.toLowerCase()}`);
      return;
    }
    void applyApplicationStatus(applicationId, option, note);
  }

  function beginStatusChange(applicationId: string, toOption: ApplicationStatusOption) {
    const row = rows.find((item) => item.id === applicationId);
    if (!row) return;
    if (rowStatusId(row) === toOption.id) {
      setStatusMenu(null);
      return;
    }
    setStatusMenu(null);
    setRowActionsMenu(null);
    setPendingStatusChange({
      applicationId,
      fromLabel: rowStatusName(row, statusOptions),
      toOption,
    });
    setStatusChangeNote("");
  }

  function beginStatusChangeBySystemKey(
    applicationId: string,
    systemKey: ApplicationPipelineStatus
  ) {
    const option = statusOptions.find((item) => item.systemKey === systemKey);
    if (!option) {
      toast.error("That status is not configured for this organization.");
      return;
    }
    beginStatusChange(applicationId, option);
  }

  async function confirmStatusChange() {
    if (!pendingStatusChange || statusBusyId) return;
    const { applicationId, toOption } = pendingStatusChange;
    await applyApplicationStatus(
      applicationId,
      toOption,
      statusChangeNote.trim() || undefined
    );
  }

  async function loadStatusHistory(applicationId: string) {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationId)}/status-history`,
        { cache: "no-store" }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string" ? payload.error : "Failed to load status history"
        );
      }
      setHistoryEntries(payload.history ?? []);
    } catch (err) {
      setHistoryEntries([]);
      setHistoryError(err instanceof Error ? err.message : "Failed to load status history");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openStatusHistory(row: ApplicationRow) {
    setHistoryDialog({
      applicationId: row.id,
      candidateName: applicantName(row),
    });
    await loadStatusHistory(row.id);
  }

  function applyBulkMatchItem(row: ApplicationRow, item: BulkMatchAnalysisItem): ApplicationRow {
    const result = item.result ?? {};
    if (result.status === "FAILED") {
      return { ...row, ai_match_status: "FAILED" };
    }
    return {
      ...row,
      ai_match_status: result.status ?? row.ai_match_status,
      ai_match_score: result.score ?? row.ai_match_score,
      ai_match_category: result.category ?? row.ai_match_category,
      ai_match_action: result.action ?? row.ai_match_action,
      ai_match_readiness: result.readiness ?? row.ai_match_readiness,
      ai_match_display_category:
        result.analysis?.candidate_match?.display_category ?? row.ai_match_display_category,
      ai_match_stage: result.stage ?? result.ai_match_stage ?? row.ai_match_stage,
      ai_requirement_counts: result.requirementCounts ?? row.ai_requirement_counts,
      ai_analyzed_at:
        result.status === "ANALYZED"
          ? result.analyzedAt ?? new Date().toISOString()
          : row.ai_analyzed_at,
    };
  }

  async function runBulkMatchAnalyze(
    ids: string[],
    label: "Analyze" | "Reanalyze" = "Analyze",
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
    if (bulkAnalyzeBusy || matchAnalyzingId) return;

    setBulkAnalyzingIds(new Set(uniqueIds));
    setRows((current) =>
      current.map((row) =>
        uniqueIds.includes(row.id) ? { ...row, ai_match_status: "ANALYZING" } : row
      )
    );

    try {
      const summary = await postBulkMatchAnalysis(
        uniqueIds,
        (chunk) => {
          const byId = new Map(chunk.map((item) => [item.jobApplicationId, item]));
          setRows((current) =>
            current.map((row) => {
              const item = byId.get(row.id);
              return item ? applyBulkMatchItem(row, item) : row;
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
      setRows((current) =>
        current.map((row) =>
          uniqueIds.includes(row.id) && row.ai_match_status === "ANALYZING"
            ? { ...row, ai_match_status: "FAILED" }
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

  async function runMatchAnalyze(applicationId: string, mode: AnalysisMode = "analyze") {
    if (bulkAnalyzeBusy) return;
    setMatchAnalyzingId(applicationId);
    const candidateLabel = applicantName(
      rows.find((row) => row.id === applicationId) ?? ({ id: applicationId } as ApplicationRow)
    );
    try {
      const response = await fetch(
        `/api/admin/job-applications/${applicationId}/match-analysis`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analysisMode: mode, analysisProvider }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Match analysis failed");
      setRows((current) =>
        current.map((row) =>
          row.id === applicationId
            ? {
                ...row,
                ai_match_status: payload.status ?? row.ai_match_status,
                ai_match_score: payload.score ?? row.ai_match_score,
                ai_match_category: payload.category ?? row.ai_match_category,
                ai_match_action: payload.action ?? row.ai_match_action,
                ai_match_readiness: payload.readiness ?? row.ai_match_readiness,
                ai_match_display_category:
                  payload.analysis?.candidate_match?.display_category ??
                  row.ai_match_display_category,
                ai_match_stage: payload.stage ?? payload.ai_match_stage ?? row.ai_match_stage,
                ai_requirement_counts:
                  requirementCountsFromAnalyzePayload(payload) ?? row.ai_requirement_counts,
                ai_analyzed_at:
                  payload.status === "ANALYZED"
                    ? payload.analyzedAt ?? new Date().toISOString()
                    : row.ai_analyzed_at,
              }
            : row
        )
      );
      if (payload.status === "NEEDS_REVIEW") {
        toast.error(payload.error || "Needs résumé text before analysis");
      } else {
        toast.success(
          `${candidateLabel}: ${mode === "deep" ? "deeper match analysis" : "match analysis"} complete`,
          {
            duration: ACTION_TOAST_DURATION_MS,
          }
        );
      }
    } catch (analyzeError) {
      toast.error(
        analyzeError instanceof Error ? analyzeError.message : "Match analysis failed"
      );
    } finally {
      setMatchAnalyzingId(null);
    }
  }

  function renderCell(colId: ApplicationColumnId, row: ApplicationRow) {
    switch (colId) {
      case "candidates": {
        const name = applicantName(row);
        const workerId = resolveApplicationWorkerId(row);
        const detailHref = `/admin_recruiter/applications/review?jobId=${encodeURIComponent(row.job_requisition_id)}&applicationId=${encodeURIComponent(row.id)}`;
        const appliedJobCount = Number(row.appliedJobCount ?? 1);
        return (
          <div className="flex w-full min-w-0 items-center gap-3">
            <CandidateListAvatar name={name || "NA"} />
            <div className="min-w-0 flex-1">
              <Link
                href={detailHref}
                className="block truncate text-sm font-semibold leading-5 hover:underline"
                style={{ color: branding.secondaryHex || "#012352" }}
              >
                {name}
              </Link>
              {appliedJobCount > 1 && highlightMultiJobApplicants ? (
                <span
                  className="mt-1 inline-flex rounded-[4px] bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-medium leading-4"
                  style={{ color: branding.primaryHex || "var(--brand-primary)" }}
                >
                  Applied to {appliedJobCount} jobs
                </span>
              ) : null}
              {!jobId ? (
                <p className="mt-0.5 truncate text-[11px] leading-4 text-[#64748B]">
                  {String(one(row.job_requisitions).public_title ?? "").trim() || "Untitled job"}
                </p>
              ) : null}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <CandidateProfileIconLink
                workerId={workerId}
                candidateName={name}
                jobId={jobId || undefined}
                from="applications"
              />
              <CandidatePreHireIconLink workerId={workerId} candidateName={name} />
            </div>
          </div>
        );
      }
      case "contact": {
        const email = applicantEmail(row);
        const phone = applicantPhone(row);
        const brandColor = branding.primaryHex || "var(--brand-primary)";
        return (
          <div className="flex min-w-0 flex-col gap-1 text-left">
            <p className="flex min-w-0 items-center gap-1.5 text-sm leading-5" style={{ color: brandColor }}>
              <Mail className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
              <span className="truncate">{email || "—"}</span>
            </p>
            <p className="flex min-w-0 items-center gap-1.5 text-sm leading-5">
              <Phone className="h-3.5 w-3.5 shrink-0" strokeWidth={2} style={{ color: brandColor }} aria-hidden />
              <span className="truncate text-[#374151]">{phone || "—"}</span>
            </p>
          </div>
        );
      }
      case "clientName": {
        const clientName = applicationClientName(row);
        if (!clientName) {
          return (
            <span className="block w-full text-center text-sm leading-5 text-[#0F172A]">—</span>
          );
        }
        return (
          <span
            className="block max-w-[200px] truncate text-sm leading-5 text-[#0F172A]"
            title={clientName}
          >
            {clientName}
          </span>
        );
      }
      case "matches":
        return (
          <MatchScoreCell
            status={row.ai_match_status}
            score={row.ai_match_score}
            analyzing={matchAnalyzingId === row.id || bulkAnalyzingIds.has(row.id)}
            onAnalyze={(mode) => void runMatchAnalyze(row.id, mode)}
          />
        );
      case "fit":
        return (
          <FitBandCell
            analyzed={row.ai_match_status === "ANALYZED"}
            band={listingDisplayFitBand({
              analyzed: row.ai_match_status === "ANALYZED",
              stage: row.ai_match_stage,
              category: row.ai_match_category,
              displayCategory: row.ai_match_display_category,
              score: row.ai_match_score,
              counts: row.ai_requirement_counts,
            })}
          />
        );
      case "conf":
        return (
          <RequirementOutcomeCountCell
            tone="conf"
            analyzed={row.ai_match_status === "ANALYZED"}
            value={row.ai_requirement_counts?.confirmed}
          />
        );
      case "verify":
        return (
          <RequirementOutcomeCountCell
            tone="verify"
            analyzed={row.ai_match_status === "ANALYZED"}
            value={row.ai_requirement_counts?.verify}
          />
        );
      case "notMet":
        return (
          <RequirementOutcomeCountCell
            tone="notMet"
            analyzed={row.ai_match_status === "ANALYZED"}
            value={row.ai_requirement_counts?.notMet}
          />
        );
      case "location": {
        const loc = applicantLocation(row);
        return <span className="text-sm leading-5 text-[#0F172A]">{loc || "—"}</span>;
      }
      case "activity":
        return <p className="text-sm leading-5 text-[#475569]">{formatActivity(row)}</p>;
      case "currentStage": {
        const stage = rowCurrentStage(row, statusOptions);
        return (
          <CurrentStageCell
            label={stage.label}
            note={row.statusNote?.trim() || stage.subtitle}
            progress={stage.progress}
            barColor={stage.barColor}
          />
        );
      }
      case "interest": {
        const currentStatus = normalizeApplicationStatus(row.status);
        const busy = statusBusyId === row.id;
        return (
          <div className="inline-flex items-center gap-1 rounded-lg bg-[#F1F5F9] px-1.5 py-1">
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#16A34A] transition hover:bg-white"
              aria-label="Accept candidate"
              title="Accept"
              onClick={() => beginStatusChangeBySystemKey(row.id, "hired")}
              disabled={busy || currentStatus === "hired"}
            >
              <Check className="h-4 w-4" strokeWidth={2.25} />
            </button>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#64748B] transition hover:bg-white"
              aria-label="Mark as maybe"
              title="Maybe"
              onClick={() => beginStatusChangeBySystemKey(row.id, "undecided")}
              disabled={busy || currentStatus === "undecided"}
            >
              <HelpCircle className="h-4 w-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#DC2626] transition hover:bg-white"
              aria-label="Reject candidate"
              title="Reject"
              onClick={() => beginStatusChangeBySystemKey(row.id, "rejected")}
              disabled={busy || currentStatus === "rejected"}
            >
              <X className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>
        );
      }
      case "actions": {
        const menuOpen = rowActionsMenu?.rowId === row.id;
        const busy = statusBusyId === row.id;
        return (
          <div className="inline-flex items-center justify-center gap-2">
            <CandidateAiAnalysisButton
              applicationId={row.id}
              jobId={jobId || undefined}
              candidateName={applicantName(row)}
            />
            <button
              type="button"
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-[#64748B] transition hover:bg-[#F1F5F9] ${
                menuOpen ? "bg-[#F1F5F9] ring-1 ring-[#CBD5E1]" : ""
              }`}
              aria-label="More actions"
              title="More actions"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              disabled={busy}
              onClick={(event) => {
                const anchor = event.currentTarget;
                setStatusMenu(null);
                setRowActionsMenu((current) =>
                  current?.rowId === row.id ? null : { rowId: row.id, anchor }
                );
              }}
            >
              <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        );
      }
      case "status": {
        const label = rowStatusName(row, statusOptions);
        const menuOpen = statusMenu?.rowId === row.id;
        const busy = statusBusyId === row.id;
        const customDot = rowStatusDotColor(row, statusOptions);
        return (
          <div className="inline-flex justify-center">
            <button
              type="button"
              disabled={busy || statusOptions.length === 0}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={(event) => {
                const anchor = event.currentTarget;
                setRowActionsMenu(null);
                setStatusMenu((current) =>
                  current?.rowId === row.id ? null : { rowId: row.id, anchor }
                );
              }}
              className={`inline-flex h-8 w-fit items-center justify-center gap-2 whitespace-nowrap px-2.5 text-sm text-[#334155] transition hover:bg-zinc-50 disabled:opacity-50 ${FORM_SURFACE_CLASS}`}
              title="Change status"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  customDot ? "" : applicationStatusDotClassName(row.status)
                }`}
                style={customDot ? { backgroundColor: customDot } : undefined}
                aria-hidden
              />
              <span className="max-w-[7.5rem] truncate">{label}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-[#94A3B8] ${menuOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>
        );
      }
      case "email":
        return <span className="text-sm text-[#475569]">{applicantEmail(row) || "—"}</span>;
      case "workflow":
        return <span className="text-sm text-[#475569]">{workflowName(row)}</span>;
      case "dateApplied": {
        const applied = formatApplicationDate(row.submitted_at || row.created_at);
        return (
          <div className="text-center">
            <p className="text-sm font-medium leading-5 text-[#0F172A]">{applied.relative}</p>
            {applied.absolute && applied.absolute !== applied.relative ? (
              <p className="text-xs leading-4 text-[#64748B]">{applied.absolute}</p>
            ) : null}
          </div>
        );
      }
      case "evaluation": {
        const analyzing = matchAnalyzingId === row.id || bulkAnalyzingIds.has(row.id);
        const analyzed = row.ai_match_status === "ANALYZED";
        const analyzedWhen = analyzed ? formatApplicationDate(row.ai_analyzed_at) : null;
        return (
          <div className="text-center">
            <span
              className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-sm font-medium ${
                analyzing
                  ? "bg-[#F1F5F9] text-[#64748B]"
                  : analyzed
                    ? "bg-[#EFF6FF] text-[#2563EB]"
                    : "bg-[#F1F5F9] text-[#64748B]"
              }`}
            >
              {analyzing ? "Analyzing…" : analyzed ? "Analyzed" : "Not Yet"}
            </span>
            {analyzedWhen && analyzedWhen.relative !== "—" ? (
              <p className="mt-1 text-[11px] leading-4 text-[#64748B]" title={analyzedWhen.absolute || undefined}>
                {analyzedWhen.relative}
              </p>
            ) : null}
          </div>
        );
      }
      case "assignee": {
        const name = row.assignedRecruiter?.name?.trim();
        if (!name) return <span className="text-sm text-[#94A3B8]">—</span>;
        return (
          <div className="flex items-center justify-center gap-2">
            <CandidateListAvatar
              name={name}
              photoUrl={row.assignedRecruiter?.profilePhotoUrl}
              size="sm"
            />
            <span className="max-w-[120px] truncate text-sm text-[#475569]" title={name}>
              {name}
            </span>
          </div>
        );
      }
      default:
        return null;
    }
  }

  return (
    <div
      className="box-border w-full min-w-0 max-w-full px-3 pb-8 pt-4 sm:px-5 sm:pt-5 lg:px-8"
      style={brandStyle}
    >
      <div className="mb-9 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <JobsBreadcrumb page="job-candidates" />
          <h1 className={CANDIDATES_PAGE_TITLE_CLASS} style={CANDIDATES_PAGE_TITLE_STYLE}>
            {jobId ? "Job candidates" : "All candidates"}
          </h1>

          <div className="mt-4 flex min-w-0 flex-col gap-1">
            <div className="relative min-w-0" ref={jobMenuRef}>
              {jobId ? (
                <ApplicationsJobHeaderCard
                  status={activeJob?.status}
                  companyName={jobCompany}
                  jobIdLabel={jobIdLabel}
                  postedOn={jobPostedOn}
                  jobType={jobType}
                  location={jobLocation}
                  titleSlot={
                    <>
                      <button
                        type="button"
                        onClick={() => setJobMenuOpen((open) => !open)}
                        className="inline-flex min-h-7 min-w-0 max-w-full items-center gap-1.5 text-left text-[#0F172A] transition hover:opacity-80"
                        aria-expanded={jobMenuOpen}
                        aria-haspopup="listbox"
                        aria-label="Select job"
                      >
                        <span className="text-base font-semibold leading-7 tracking-normal break-words sm:text-lg">
                          {jobTitle}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-[#94A3B8] transition ${jobMenuOpen ? "rotate-180" : ""}`}
                          aria-hidden
                        />
                      </button>
                      <JobPublicViewLink href={publicJobPath} />
                    </>
                  }
                />
              ) : (
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setJobMenuOpen((open) => !open)}
                    className="inline-flex min-h-7 min-w-0 max-w-full items-center gap-1.5 text-left text-black transition hover:opacity-80"
                    aria-expanded={jobMenuOpen}
                    aria-haspopup="listbox"
                    aria-label="Select job"
                  >
                    <span className="text-base font-semibold leading-7 tracking-normal break-words">
                      {jobTitle}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-[#94A3B8] transition ${jobMenuOpen ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                  </button>
                </div>
              )}

              {jobMenuOpen ? (
                <div
                  className="absolute left-0 z-40 mt-2 flex w-[min(100%,calc(100vw-1.5rem))] max-w-[680px] max-h-[min(80vh,36rem)] flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-[0_12px_40px_rgba(15,23,42,0.12)] sm:w-[min(100vw-2rem,680px)]"
                  role="listbox"
                  aria-label="Jobs"
                >
                  <div className="space-y-3 border-b border-[#E5E7EB] p-3 sm:p-4">
                    <div className="flex items-center gap-2">
                      <label className="relative block min-w-0 flex-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/search-candidate-jobs.svg"
                          alt=""
                          width={20}
                          height={20}
                          className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2"
                          aria-hidden
                        />
                        <input
                          type="search"
                          value={jobSearch}
                          onChange={(e) => setJobSearch(e.target.value)}
                          placeholder="Search by job title or reference number"
                          className="h-10 w-full rounded-lg border border-[#CBD5E1] bg-white py-2 pl-11 pr-3 text-sm text-[#334155] placeholder:text-[#94A3B8] focus:border-[color:var(--brand-primary)] focus:outline-none focus:ring-0 [&::-webkit-search-cancel-button]:cursor-pointer [&::-webkit-search-decoration]:cursor-pointer"
                          autoFocus
                        />
                      </label>
                      <button
                        type="button"
                        onClick={clearJobDropdownFilters}
                        className="shrink-0 px-1 text-sm font-bold whitespace-nowrap text-black transition hover:opacity-80"
                      >
                        Clear all
                      </button>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                        <select
                          value={jobStatusFilter}
                          onChange={(e) => setJobStatusFilter(e.target.value)}
                          className={`${FILTER_SELECT_CLASS} shrink-0`}
                          style={FILTER_SELECT_CHEVRON}
                          aria-label="Filter by status"
                        >
                          <option value="">Status</option>
                          <option value="published">Open</option>
                          <option value="draft">Draft</option>
                          <option value="closed">Closed</option>
                          <option value="archived">Archived</option>
                        </select>

                        <select
                          value={jobLocationFilter}
                          onChange={(e) => setJobLocationFilter(e.target.value)}
                          className={`${FILTER_SELECT_CLASS} min-w-0 max-w-[120px] flex-1 sm:max-w-[140px] sm:flex-none`}
                          style={FILTER_SELECT_CHEVRON}
                          aria-label="Filter by location"
                        >
                          <option value="">Location</option>
                          {jobDropdownLocations.map((loc) => (
                            <option key={loc} value={loc}>
                              {loc}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex shrink-0 items-center justify-end gap-2 sm:ml-auto sm:gap-3">
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-sm whitespace-nowrap text-[#64748B]">Sort by</span>
                          <select
                            value={jobSortBy}
                            onChange={(e) => setJobSortBy(e.target.value as "newest" | "oldest")}
                            className={`${FILTER_SELECT_CLASS} shrink-0`}
                            style={FILTER_SELECT_CHEVRON}
                            aria-label="Sort jobs"
                          >
                            <option value="newest">Newest</option>
                            <option value="oldest">Oldest</option>
                          </select>
                        </div>
                        <p className="inline-flex min-w-0 items-center gap-1.5 text-sm whitespace-nowrap text-[#64748B]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src="/jobs-count-icon.svg"
                            alt=""
                            width={14}
                            height={14}
                            className="h-3.5 w-3.5 shrink-0"
                            aria-hidden
                          />
                          <span>
                            {filteredJobOptions.length} of {jobOptions.length} jobs
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-b border-[#E5E7EB] px-3 py-3 sm:px-4">
                    <p className="text-sm font-semibold leading-5 text-[#1E293B]">
                      Candidates for all open and paused jobs
                    </p>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <button
                      type="button"
                      role="option"
                      aria-selected={!jobId}
                      onClick={selectAllJobs}
                      className="flex w-full items-center gap-3 border-b border-[#E5E7EB] px-3 py-3.5 text-left transition hover:bg-[#F8FAFC] sm:px-4"
                    >
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
                        {!jobId ? (
                          <Check
                            className="h-5 w-5"
                            style={{ color: branding.primaryHex }}
                            strokeWidth={2.75}
                            aria-label="Selected all jobs"
                          />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold leading-5 text-[#1E293B]">
                          All jobs
                        </span>
                        <span className="mt-0.5 block text-xs leading-4 text-[#64748B]">
                          Candidates across every job
                        </span>
                      </span>
                    </button>
                    {jobsLoading ? (
                      <p className="px-4 py-6 text-sm text-[#64748B]">Loading jobs…</p>
                    ) : filteredJobOptions.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-[#64748B]">No jobs match these filters.</p>
                    ) : (
                      filteredJobOptions.map((option) => {
                        const title = option.public_title?.trim() || "Untitled job";
                        const location = formatJobLocation(option);
                        const selected = option.id === jobId;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => selectJob(option)}
                            className="flex w-full items-center gap-3 border-b border-[#E5E7EB] px-3 py-3.5 text-left transition last:border-b-0 hover:bg-[#F8FAFC] sm:px-4"
                          >
                            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
                              {selected ? (
                                <Check
                                  className="h-5 w-5"
                                  style={{ color: branding.primaryHex }}
                                  strokeWidth={2.75}
                                  aria-label="Selected job"
                                />
                              ) : null}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold leading-5 text-[#1E293B]">
                                {title}
                              </span>
                              <span className="mt-0.5 block text-xs leading-4 text-[#64748B]">
                                {location !== "—" ? location : jobReference(option)}
                              </span>
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <nav
        ref={statusTabsScrollRef}
        className="applications-status-tabs-scroll mb-4 w-full min-w-0 overflow-x-auto"
        aria-label="Candidates status"
      >
        <div className="flex w-max flex-nowrap items-end justify-start gap-5">
          {statusTabs
            .filter((tab) => tab.id === "all")
            .map((tab) => {
              const active = resolvedActiveTab === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={active ? activeStatusTabRef : undefined}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    const params = new URLSearchParams(searchParams.toString());
                    params.delete("tab");
                    router.replace(`${pathname}?${params.toString()}`);
                  }}
                  className={`relative inline-flex shrink-0 flex-col items-center px-2 pb-2.5 pt-0 text-sm font-medium leading-none whitespace-nowrap transition-colors ${
                    active
                      ? "text-[color:var(--brand-primary)]"
                      : "text-[#2B3D51] hover:text-[color:var(--brand-primary)]"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="inline-flex items-center gap-2">
                    <span>{tab.label}</span>
                    <span className="admin-recruiter-tab-count rounded-sm">
                      {tabCounts[tab.id] ?? 0}
                    </span>
                  </span>
                  <span
                    className={`absolute inset-x-0 bottom-0 block h-0.5 rounded-full ${
                      active ? "bg-[color:var(--brand-primary)]" : "bg-transparent"
                    }`}
                    aria-hidden
                  />
                </button>
              );
            })}
          {pipelineTabSections.map((section) => (
            <div key={section.key} className="flex items-end gap-4 border-l border-[#E5E7EB] pl-4">
              <span
                className="pb-2.5 text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]"
                title={section.description ?? undefined}
              >
                {section.name}
              </span>
              {section.statuses.map((tab) => {
                const active = resolvedActiveTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    ref={active ? activeStatusTabRef : undefined}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      const params = new URLSearchParams(searchParams.toString());
                      params.set("tab", tab.id);
                      router.replace(`${pathname}?${params.toString()}`);
                    }}
                    className={`relative inline-flex shrink-0 flex-col items-center px-2 pb-2.5 pt-0 text-sm font-medium leading-none whitespace-nowrap transition-colors ${
                      active
                        ? "text-[color:var(--brand-primary)]"
                        : "text-[#2B3D51] hover:text-[color:var(--brand-primary)]"
                    }`}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span>{tab.name}</span>
                      <span className="admin-recruiter-tab-count rounded-sm">
                        {tabCounts[tab.id] ?? 0}
                      </span>
                    </span>
                    <span
                      className={`absolute inset-x-0 bottom-0 block h-0.5 rounded-full ${
                        active ? "bg-[color:var(--brand-primary)]" : "bg-transparent"
                      }`}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </nav>

      <div className="w-full overflow-hidden rounded-[12px] border border-[#E5E7EB] bg-white">
        <ApplicationsListToolbar
          query={candidateSearchQuery}
          skillsFilter={skillsFilter}
          onApplySearch={handleApplyApplicationsSearch}
          onResetSearch={handleResetApplicationsSearch}
          onOpenFilters={() => setEditFiltersOpen(true)}
          onEditColumns={() => setEditColumnsOpen(true)}
          onAddCandidate={openAddCandidateModal}
          onMatchExistingCandidate={openMatchExistingCandidateModal}
          activeFilterCount={activeFilterCount}
          highlightMultiJob={highlightMultiJobApplicants}
          onHighlightMultiJobChange={setHighlightMultiJobApplicants}
          searching={loading}
          onAnalyzeAll={
            jobId
              ? () => {
                  void (async () => {
                    const params = new URLSearchParams();
                    params.set("page", "1");
                    params.set("idsOnly", "1");
                    params.set("scopeOnly", "1");
                    params.set("jobId", jobId);
                    if (matchScoreFilter) params.set("matchScore", matchScoreFilter);
                    if (skillsFilter.length) params.set("skills", skillsFilter.join(","));
                    const response = await fetch(`/api/admin/job-applications?${params}`, {
                      cache: "no-store",
                    });
                    const payload = await response.json();
                    if (!response.ok) {
                      toast.error(payload.error || "Failed to load candidates");
                      return;
                    }
                    const { analyzeIds } = partitionMatchAnalysisTargets(
                      ((payload.ids ?? []) as Array<{ id?: string; aiMatchStatus?: string | null }>).map(
                        (row) => ({
                          applicationId: row.id,
                          status: row.aiMatchStatus,
                        })
                      )
                    );
                    await runBulkMatchAnalyze(analyzeIds, "Analyze", {
                      emptyMessage: "All candidates on this job are already analyzed",
                    });
                  })();
                }
              : undefined
          }
          analyzeAllLabel="Analyze all"
          analyzeBusy={bulkAnalyzeBusy}
          analyzeDisabled={analyzeAllCount === 0 || Boolean(matchAnalyzingId)}
          analysisProvider={analysisProvider}
          onAnalysisProviderChange={setAnalysisProvider}
        />

        <CandidateBulkSelectionBar
          selectedCount={selectedIds.size}
          eligibleCount={selectedEligibleCount}
          scopeLabel={
            selectedIds.size === 0
              ? undefined
              : allVisibleSelected
                ? `All ${selectedOnPageCount} candidate${selectedOnPageCount === 1 ? "" : "s"} on this page selected`
                : `${selectedIds.size} candidate${selectedIds.size === 1 ? "" : "s"} selected on this page`
          }
          claimBusy={claimBusy}
          archiveBusy={archiveBusy}
          deleteBusy={deleteBusy}
          analyzeBusy={bulkAnalyzeBusy}
          onArchive={() => void handleBulkArchiveSelected()}
          onDelete={() => {
            setPendingDeleteIds([]);
            setDeleteError(null);
            setDeleteConfirmOpen(true);
          }}
          onAnalyze={() => void runBulkMatchAnalyze(selectedAnalyzeIds, "Analyze")}
          onReanalyze={() => void runBulkMatchAnalyze(selectedReanalyzeIds, "Reanalyze")}
          analyzeDisabled={selectedAnalyzeIds.length === 0 || Boolean(matchAnalyzingId)}
          reanalyzeDisabled={selectedReanalyzeIds.length === 0 || Boolean(matchAnalyzingId)}
          onExportCsv={handleExportApplicationsCsv}
          onExportXls={handleExportApplicationsXls}
          exportDisabled={resultTotal === 0 && selectedIds.size === 0}
          hideClaim
          onClear={() => setSelectedIds(new Set())}
        />

        {error ? (
          <div className="mx-[14px] mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="px-[14px] py-4">
            <CandidatesListSkeleton
              rows={Math.min(pageSize, 10)}
              view="list"
              label="Loading candidates"
            />
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[960px] w-full border-collapse text-left text-sm xl:min-w-full">
            <thead className="border-b border-[#E5E7EB] bg-brand-lite text-sm font-medium text-black">
              <tr>
                <th className="w-12 border-r border-[#E5E7EB] bg-brand-lite px-[14px] py-3">
                  <ListTableCheckbox
                    checked={allVisibleSelected}
                    indeterminate={someVisibleSelected && !allVisibleSelected}
                    disabled={paginatedRows.length === 0}
                    onChange={toggleSelectAllVisible}
                    aria-label="Select all candidates on this page"
                  />
                </th>
                {listColumns.map((colId) => {
                  const sortable = isApplicationListSortableColumn(colId);
                  const sortActive = sortable && listSort.column === colId;
                  return (
                    <th
                      key={colId}
                      className={`border-r border-[#E5E7EB] bg-brand-lite px-[14px] py-3 font-medium normal-case tracking-normal last:border-r-0 ${applicationListColumnClassName(colId)}`}
                      aria-sort={
                        sortActive
                          ? listSort.direction === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      {sortable ? (
                        <ListSortableHeader
                          label={applicationColumnLabel(colId)}
                          align={applicationListHeaderAlign(colId)}
                          active={Boolean(sortActive)}
                          direction={listSort.direction}
                          onSort={() => handleListColumnSort(colId)}
                        />
                      ) : (
                        applicationColumnLabel(colId)
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length === 0 ? (
                <tr className="border-b border-[#E9EDF3]">
                  <td
                    colSpan={listColumns.length + 1}
                    className={`px-[14px] text-center text-[#64748B] ${
                      highlightMultiJobApplicants ? "py-24" : "py-12"
                    }`}
                  >
                    {highlightMultiJobApplicants
                      ? "No applicants have applied to multiple jobs."
                      : jobId
                        ? "No candidates match these filters."
                        : "No candidates in this status yet."}
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[#E9EDF3] align-middle hover:bg-[#FAFBFC]"
                  >
                    <td
                      className="border-r border-[#E5E7EB] px-[14px] py-2.5 align-middle"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <ListTableCheckbox
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        aria-label={`Select ${applicantName(row)}`}
                      />
                    </td>
                    {listColumns.map((colId) => (
                      <td
                        key={colId}
                        className={`border-r border-[#E5E7EB] px-[14px] py-2.5 align-middle last:border-r-0 ${applicationListColumnClassName(colId)}`}
                      >
                        {renderCell(colId, row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        )}

        <div className="flex flex-col gap-3 rounded-b-[12px] border-t border-[#E5E7EB] bg-white px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <p className="text-sm text-[#64748B]">
            Showing {pageStart}-{pageEnd} of {resultTotal} results
          </p>

          <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:flex-wrap sm:justify-end">
            <ListPaginationShowLabel
              pageSize={pageSize}
              options={PAGE_SIZE_OPTIONS}
              onPageSizeChange={setPageSize}
            />

            <ListPaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setPage}
              activeStyle={{ backgroundColor: branding.secondaryHex, borderColor: branding.secondaryHex }}
            />
          </div>
        </div>
      </div>

      {highlightMultiJobApplicants && multiJobApplicantCount > 0 ? (
        <MultiJobApplicantsBanner
          count={multiJobApplicantCount}
          onViewAll={handleViewAllMultiJobApplicants}
        />
      ) : null}

      <ColumnsEditorModal
        key={editColumnsOpen ? "application-cols-open" : "application-cols-closed"}
        open={editColumnsOpen}
        onOpenChange={setEditColumnsOpen}
        options={APPLICATION_EDITABLE_COLUMNS}
        value={listColumnOrder.filter((id) => id !== "actions")}
        defaultValue={DEFAULT_APPLICATION_COLUMNS.filter((id) => id !== "actions")}
        title="Edit Columns"
        description="Choose which columns appear in the candidates list and drag to reorder them."
        onSave={(order) => {
          const next = ensureActionsLast(order);
          setListColumnOrder(next);
          saveApplicationColumnOrder(next);
        }}
      />

      <EditApplicationsFiltersModal
        key={editFiltersOpen ? "application-filters-open" : "application-filters-closed"}
        open={editFiltersOpen}
        onOpenChange={setEditFiltersOpen}
        value={editFiltersValue}
        sortBy={sortBy}
        onSortByChange={handleSortByChange}
        options={{
          statuses: listingStatusOptions,
          stages: listingStageOptions,
          locations: locationOptions,
          workflows: workflowOptions,
          jobs: listingJobOptions,
          showJobFilter: !jobId,
        }}
        onSave={handleSaveEditFilters}
      />

      {rowActionsMenu ? (
        <CandidateRowActionsMenu
          anchor={rowActionsMenu.anchor}
          analyzing={
            matchAnalyzingId === rowActionsMenu.rowId || bulkAnalyzingIds.has(rowActionsMenu.rowId)
          }
          isAnalyzed={
            rows.find((item) => item.id === rowActionsMenu.rowId)?.ai_match_status === "ANALYZED"
          }
          hired={normalizeApplicationStatus(
            rows.find((item) => item.id === rowActionsMenu.rowId)?.status ?? ""
          ) === "hired"}
          archived={(() => {
            const row = rows.find((item) => item.id === rowActionsMenu.rowId);
            return row ? isRowArchived(row, statusOptions) : false;
          })()}
          resumeUploading={Boolean(updateResumeApplicationId)}
          onClose={() => setRowActionsMenu(null)}
          onAnalyze={(mode) => {
            void runMatchAnalyze(rowActionsMenu.rowId, mode);
          }}
          onUpdateResume={() => beginUpdateResume(rowActionsMenu.rowId)}
          onArchive={() => beginArchiveCandidate(rowActionsMenu.rowId)}
          onUnarchive={() => beginUnarchiveCandidate(rowActionsMenu.rowId)}
          onMessage={() => {
            const row = rows.find((item) => item.id === rowActionsMenu.rowId);
            if (!row) return;
            const workerId = resolveApplicationWorkerId(row);
            if (!workerId) {
              toast.error("Candidate profile is not linked yet");
              return;
            }
            setActionTargetRowId(row.id);
            setMessageOpen(true);
          }}
          onCall={() => {
            const row = rows.find((item) => item.id === rowActionsMenu.rowId);
            if (!row) return;
            const workerId = resolveApplicationWorkerId(row);
            if (!workerId) {
              toast.error("Candidate profile is not linked yet");
              return;
            }
            setActionTargetRowId(row.id);
            setCallOpen(true);
          }}
          onSetupInterview={() => {
            const row = rows.find((item) => item.id === rowActionsMenu.rowId);
            if (!row) return;
            const workerId = resolveApplicationWorkerId(row);
            if (!workerId) {
              toast.error("Candidate profile is not linked yet");
              return;
            }
            setActionTargetRowId(row.id);
            setInterviewError(null);
            setInterviewOpen(true);
          }}
          onAssignRecruiter={() => {
            const row = rows.find((item) => item.id === rowActionsMenu.rowId);
            if (!row) return;
            void openAssignRecruiter(row);
          }}
          onViewStatusHistory={() => {
            const row = rows.find((item) => item.id === rowActionsMenu.rowId);
            if (!row) return;
            void openStatusHistory(row);
          }}
          onDeleteCandidate={() => beginDeleteCandidate(rowActionsMenu.rowId)}
          onMarkAsHired={() =>
            beginQuickStatusChange(
              rowActionsMenu.rowId,
              "hired",
              "Marked as hired from candidates list"
            )
          }
        />
      ) : null}

      <AssignRecruiterModal
        open={Boolean(assignRecruiterTarget)}
        candidateName={
          assignRecruiterTarget ? applicantName(assignRecruiterTarget) : "Candidate"
        }
        currentAssigneeId={assignRecruiterTarget?.assigned_recruiter_user_id ?? null}
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

      {statusMenu ? (
        <StatusDropdownPortal
          options={(() => {
            const menuRow = rows.find((row) => row.id === statusMenu.rowId);
            const source = String(
              one(menuRow?.job_requisitions ?? null).source_type ?? job?.source_type ?? ""
            );
            return filterApplicationStatusesForSource(
              selectableStatusOptions,
              source,
              menuRow ? rowStatusId(menuRow) : null
            );
          })()}
          currentStatusId={(() => {
            const menuRow = rows.find((row) => row.id === statusMenu.rowId);
            return menuRow ? rowStatusId(menuRow) : null;
          })()}
          anchor={statusMenu.anchor}
          busy={statusBusyId === statusMenu.rowId}
          onClose={() => setStatusMenu(null)}
          onSelect={(option) => beginStatusChange(statusMenu.rowId, option)}
        />
      ) : null}

      <ApplicationStatusChangeModal
        open={Boolean(pendingStatusChange)}
        candidateName={
          pendingStatusChange
            ? applicantName(
                rows.find((row) => row.id === pendingStatusChange.applicationId) ??
                  ({
                    id: pendingStatusChange.applicationId,
                    status: "new",
                    created_at: "",
                    submitted_at: null,
                    job_requisition_id: "",
                    workflow_id: "",
                    applicant_workflow_instance_id: "",
                    job_requisitions: null,
                    onboarding_flows: null,
                    applicant_profiles: { first_name: "Candidate", last_name: "" },
                  } as ApplicationRow)
              )
            : ""
        }
        fromLabel={pendingStatusChange?.fromLabel ?? ""}
        toLabel={pendingStatusChange?.toOption.name ?? ""}
        note={statusChangeNote}
        busy={Boolean(pendingStatusChange && statusBusyId === pendingStatusChange.applicationId)}
        onNoteChange={setStatusChangeNote}
        onCancel={() => {
          if (statusBusyId) return;
          setPendingStatusChange(null);
          setStatusChangeNote("");
        }}
        onConfirm={() => void confirmStatusChange()}
      />

      <ApplicationStatusHistoryDialog
        open={Boolean(historyDialog)}
        candidateName={historyDialog?.candidateName ?? ""}
        loading={historyLoading}
        error={historyError}
        history={historyEntries}
        onClose={() => {
          setHistoryDialog(null);
          setHistoryEntries([]);
          setHistoryError(null);
        }}
      />

      <BulkDeleteConfirmModal
        open={deleteConfirmOpen}
        entity="candidate"
        count={pendingDeleteIds.length > 0 ? pendingDeleteIds.length : selectedIds.size}
        busy={deleteBusy}
        error={deleteError}
        onCancel={() => {
          if (deleteBusy) return;
          setDeleteConfirmOpen(false);
          setPendingDeleteIds([]);
          setDeleteError(null);
        }}
        onConfirm={() => void handleConfirmDeleteCandidates()}
      />

      {(() => {
        const target = updateResumeApplicationId
          ? rows.find((row) => row.id === updateResumeApplicationId) ?? null
          : null;
        if (!updateResumeApplicationId) return null;
        const nameParts = target
          ? applicantNameParts(target)
          : { firstName: "", lastName: "" };
        return (
          <UpdateResumeModal
            open
            applicationId={updateResumeApplicationId}
            candidateName={target ? applicantName(target) : ""}
            initialFirstName={nameParts.firstName}
            initialLastName={nameParts.lastName}
            onClose={() => setUpdateResumeApplicationId(null)}
            onUpdated={(result) => handleResumeUpdated(updateResumeApplicationId, result)}
          />
        );
      })()}

      <ClaimCandidatesConfirmModal
        open={claimConfirmOpen}
        selectedCount={selectedIds.size}
        eligibleCount={selectedEligibleCount}
        excludedCount={Math.max(0, selectedIds.size - selectedEligibleCount)}
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

      <AddCandidateModal
        open={addCandidateOpen}
        onClose={() => setAddCandidateOpen(false)}
        jobId={jobId}
        jobTitle={jobTitle}
        jobLocation={jobLocation !== "—" ? jobLocation : null}
        onSuccess={() => setApplicationsRefreshNonce((value) => value + 1)}
      />

      <ImportCandidatesModal
        open={importCandidatesOpen}
        jobId={jobId}
        onClose={() => setImportCandidatesOpen(false)}
        onImported={() => {
          setImportCandidatesOpen(false);
          setApplicationsRefreshNonce((value) => value + 1);
        }}
      />

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

      {(() => {
        const target = actionRow();
        if (!target) return null;
        const workerId = resolveApplicationWorkerId(target);
        if (!workerId) return null;
        const name = applicantName(target);
        const email = applicantEmail(target);
        const phone = applicantPhone(target);
        return (
          <>
            <CandidateCommunicationDialog
              open={messageOpen}
              onClose={() => {
                setMessageOpen(false);
                setActionTargetRowId(null);
              }}
              workerId={workerId}
              candidateName={name}
              email={email || null}
              phone={phone || null}
            />
            <AddCallLogModal
              open={callOpen}
              workerId={workerId}
              candidateName={name}
              onClose={() => {
                setCallOpen(false);
                setActionTargetRowId(null);
              }}
            />
            <ScheduleInterviewModal
              open={interviewOpen}
              applicants={[
                {
                  id: workerId,
                  name,
                  status: normalizeApplicationStatus(target.status),
                },
              ]}
              submitting={interviewSubmitting}
              error={interviewError}
              onClose={() => {
                setInterviewOpen(false);
                setInterviewError(null);
                setActionTargetRowId(null);
              }}
              onSubmit={(payload) => void handleScheduleInterview(payload)}
              fixedWorkerId={workerId}
              fixedApplicantName={name}
              fixedApplicationId={target.id}
            />
          </>
        );
      })()}
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  HelpCircle,
  X,
} from "lucide-react";
import { ApplicantJobsPopover } from "@/app/admin_recruiter/applications/ApplicantJobsPopover";
import { ApplicantsMetricsCards } from "@/app/admin_recruiter/applications/ApplicantsMetricsCards";
import { ApplicantsFilterBar } from "@/app/admin_recruiter/applications/ApplicantsFilterBar";
import { applicantGroupKey, groupApplicantRows } from "@/app/admin_recruiter/applications/group-applicant-rows";
import {
  ApplicationsJobHeaderCard,
  formatJobPostedOn,
} from "@/app/admin_recruiter/applications/ApplicationsJobHeaderCard";
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
import {
  BRAAS_PRIMARY,
  BRAAS_SECONDARY,
  brandingToCssVars,
  readableTextOnBrand,
} from "@/lib/tenant/tenant-branding";
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

export type ApplicationRow = {
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
  job_requisitions?: Record<string, unknown> | Record<string, unknown>[] | null;
  onboarding_flows?: Record<string, unknown> | Record<string, unknown>[] | null;
  applicant_profiles?: Record<string, unknown> | Record<string, unknown>[] | null;
  worker?: Record<string, unknown> | Record<string, unknown>[] | null;
  work_type?: string | null;
  experience_years?: number | string | null;
  job_role?: string | null;
  match_status?: "STRONG" | "REVIEW" | "NOT MATCH" | string | null;
  groupedApplications?: ApplicationRow[];
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

function one(value: Record<string, unknown> | Record<string, unknown>[] | null | undefined) {
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

function rowWorkType(row: ApplicationRow): string {
  if (row.work_type?.trim()) return row.work_type.trim();
  const raw = String(one(row.job_requisitions).employment_type ?? "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (upper.includes("1099") || upper.includes("CONTRACT")) return "1099";
  if (upper.includes("W2") || upper.includes("W-2")) return "W2";
  return raw;
}

function experienceLabel(row: ApplicationRow): string {
  const years = row.experience_years;
  if (years == null || years === "") return "";
  const numeric = Number(years);
  if (!Number.isFinite(numeric)) return `${years} experience`;
  return `${numeric} yr${numeric === 1 ? "" : "s"} experience`;
}

function pageNumberWindow(current: number, total: number, size = 5): number[] {
  if (total <= size) return Array.from({ length: total }, (_, index) => index + 1);
  let start = Math.max(1, current - Math.floor(size / 2));
  let end = start + size - 1;
  if (end > total) {
    end = total;
    start = Math.max(1, end - size + 1);
  }
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
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
  const primaryColor = branding.primaryHex || BRAAS_PRIMARY;
  const secondaryColor = branding.secondaryHex || BRAAS_SECONDARY || "#012352";
  const textOnSecondary = readableTextOnBrand(secondaryColor);
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
  const [keywordQuery, setKeywordQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [matchFilter, setMatchFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("Me");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
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
  const [jobsPopover, setJobsPopover] = useState<{
    key: string;
    anchor: HTMLElement;
    name: string;
    applications: ApplicationRow[];
    loading: boolean;
  } | null>(null);
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
      if (jobOptions.length > 0) {
        selectJob(jobOptions[0]);
        setAddCandidateOpen(true);
        return;
      }
      toast.error("Please select a job first or create a job requisition.");
      return;
    }
    setAddCandidateOpen(true);
  }

  function openMatchExistingCandidateModal() {
    if (!jobId) {
      if (jobOptions.length > 0) {
        selectJob(jobOptions[0]);
        setImportCandidatesOpen(true);
        return;
      }
      toast.error("Please select a job first or create a job requisition.");
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
    setJobsPopover(null);
  }, [page, jobId, candidateSearchQuery]);
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

  const displayRows = useMemo(() => {
    // Server pages are already sized. Collapsing people on the page shortens it
    // (page 4 of 10 was showing 9) and the footer no longer matches the page.
    if (listMeta.paged || jobId) return paginatedRows;
    return groupApplicantRows(paginatedRows);
  }, [jobId, listMeta.paged, paginatedRows]);

  const displayTotal = resultTotal;

  const listColumns = ensureActionsLast(
    listColumnOrder.length ? listColumnOrder : DEFAULT_APPLICATION_COLUMNS
  );
  // Selection is for export / archive / delete / analyze — not claim-gated.
  const allVisibleSelected =
    displayRows.length > 0 && displayRows.every((row) => selectedIds.has(row.id));

  const someVisibleSelected = displayRows.some((row) => selectedIds.has(row.id));

  const selectedOnPageCount = displayRows.filter((row) => selectedIds.has(row.id)).length;

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
      const pageIds = (displayRows.length > 0 ? displayRows : paginatedRows).map((row) => row.id);
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

  async function openApplicantJobs(row: ApplicationRow, anchor: HTMLElement) {
    const key = applicantGroupKey(row);
    const name = applicantName(row);
    const local = row.groupedApplications?.length ? row.groupedApplications : [row];
    const expected = Math.max(Number(row.appliedJobCount ?? 1) || 1, local.length);
    setJobsPopover({
      key,
      anchor,
      name,
      applications: local,
      loading: local.length < expected,
    });
    if (local.length >= expected) return;

    try {
      const params = new URLSearchParams({ page: "1", pageSize: "50" });
      const email = applicantEmail(row).trim().toLowerCase();
      if (row.worker_id) params.set("workerId", row.worker_id);
      else if (email) params.set("q", email);
      const response = await fetch(`/api/admin/job-applications?${params}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Failed to load applications");
      let applications = (payload.applications ?? []) as ApplicationRow[];
      if (!row.worker_id && email) {
        applications = applications.filter(
          (item) => applicantEmail(item).trim().toLowerCase() === email
        );
      }
      if (!applications.length) applications = local;
      setJobsPopover((current) =>
        current?.key === key ? { ...current, applications, loading: false } : current
      );
    } catch {
      setJobsPopover((current) =>
        current?.key === key ? { ...current, loading: false } : current
      );
    }
  }

  function renderCell(colId: ApplicationColumnId, row: ApplicationRow) {
    switch (colId) {
      case "candidates": {
        const name = applicantName(row);
        const detailHref = `/admin_recruiter/applications/review?jobId=${encodeURIComponent(row.job_requisition_id)}&applicationId=${encodeURIComponent(row.id)}`;
        const appliedJobCount = Number(row.appliedJobCount ?? 1);
        const experience = experienceLabel(row);
        const multiJob = appliedJobCount > 1;
        return (
          <div className="flex w-full min-w-0 items-center gap-3">
            <div className="min-w-0 flex-1">
              {multiJob ? (
                <button
                  type="button"
                  className="block max-w-full truncate text-left text-xs font-semibold leading-4 text-[#374151] hover:underline"
                  onClick={(event) => {
                    event.stopPropagation();
                    const same = jobsPopover?.key === applicantGroupKey(row);
                    if (same) {
                      setJobsPopover(null);
                      return;
                    }
                    void openApplicantJobs(row, event.currentTarget);
                  }}
                >
                  {name}
                </button>
              ) : (
                <Link
                  href={detailHref}
                  className="block max-w-full truncate text-xs font-semibold leading-4 text-[#374151] hover:underline"
                >
                  {name}
                </Link>
              )}
              {experience ? (
                <p className="text-[10px] leading-[15px] text-[#6B7280]">{experience}</p>
              ) : null}
            </div>
            {multiJob ? (
              <span className="inline-flex shrink-0 items-center justify-center rounded bg-[#F7EEDC] px-1.5 py-0.5 text-[10px] font-semibold leading-[15px] text-[#8A5A12]">
                {appliedJobCount}
              </span>
            ) : null}
          </div>
        );
      }
      case "contact": {
        const email = applicantEmail(row);
        const phone = applicantPhone(row);
        return (
          <div className="flex min-w-0 flex-col text-left">
            <span className="truncate text-xs font-medium text-[#334155]">{email || "—"}</span>
            <span className="mt-0.5 truncate text-xs text-[#64748B]">{phone || "—"}</span>
          </div>
        );
      }
      case "jobRole": {
        const role =
          row.job_role ||
          String(one(row.job_requisitions).public_title ?? "").trim() ||
          "—";
        return (
          <span className="block truncate text-xs font-medium text-[#334155]" title={role}>
            {role}
          </span>
        );
      }
      case "status": {
        const label = rowStatusName(row, statusOptions) || "New";
        return (
          <div className="inline-flex justify-center">
            <span className="inline-flex items-center justify-center rounded-full border border-[#CBD5E1] bg-white px-2.5 py-0.5 text-[11px] font-medium text-[#334155]">
              {label}
            </span>
          </div>
        );
      }
      case "workType": {
        const type = rowWorkType(row);
        if (!type) {
          return <span className="text-xs text-[#94A3B8]">—</span>;
        }
        const isW2 = type.toUpperCase() === "W2";
        return (
          <div className="inline-flex justify-center">
            <span
              className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-[15px] ${
                isW2 ? "bg-[#DBEAFE] text-[#1D4ED8]" : "bg-[#F3E8FF] text-[#7E22CE]"
              }`}
            >
              {type}
            </span>
          </div>
        );
      }
      case "currentStage": {
        const stage = rowCurrentStage(row, statusOptions);
        const stageLabel = row.statusNote?.trim() || row.workflow_phase || stage.label || "Need review";
        const norm = stageLabel.toLowerCase().trim();
        let badgeStyle = "bg-[#F0F9FF] text-[#0284C7] border-[#BAE6FD]";
        if (norm.includes("offer")) {
          badgeStyle = "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]";
        } else if (norm.includes("submitted")) {
          badgeStyle = "bg-[#EEF2FF] text-[#4F46E5] border-[#C7D2FE]";
        } else if (norm.includes("interview")) {
          badgeStyle = "bg-[#FEF3C7] text-[#D97706] border-[#FDE68A]";
        } else if (norm.includes("screening")) {
          badgeStyle = "bg-[#FEF9C3] text-[#CA8A04] border-[#FEF08A]";
        } else if (norm.includes("hired")) {
          badgeStyle = "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]";
        }
        return (
          <div className="inline-flex justify-center">
            <span
              className={`inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${badgeStyle}`}
            >
              {stageLabel}
            </span>
          </div>
        );
      }
      case "fit": {
        const analyzed =
          row.ai_match_status === "ANALYZED" ||
          row.ai_match_score != null ||
          Boolean(row.ai_match_category) ||
          Boolean(row.ai_match_display_category);
        const band = listingDisplayFitBand({
          analyzed,
          stage: row.ai_match_stage,
          category: row.ai_match_category,
          displayCategory: row.ai_match_display_category,
          score: row.ai_match_score,
          counts: row.ai_requirement_counts,
        });
        if (!band) {
          return <span className="text-xs text-[#94A3B8]">—</span>;
        }
        const matchText = band === "strong" ? "STRONG" : band === "low" ? "NOT MATCH" : "REVIEW";
        const colorClass =
          band === "strong"
            ? "text-[#16A34A]"
            : band === "review"
              ? "text-[#2563EB]"
              : "text-[#EA580C]";
        return (
          <div className="inline-flex justify-center">
            <span className={`text-xs font-bold tracking-wider ${colorClass}`}>
              {matchText}
            </span>
          </div>
        );
      }
      case "dateApplied": {
        const d = new Date(row.submitted_at || row.created_at);
        const formatted = isNaN(d.getTime())
          ? "—"
          : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return <span className="text-xs font-medium text-[#475569]">{formatted}</span>;
      }
      case "actions": {
        const menuOpen = rowActionsMenu?.rowId === row.id;
        const busy = statusBusyId === row.id;
        const detailHref = `/admin_recruiter/applications/review?jobId=${encodeURIComponent(row.job_requisition_id)}&applicationId=${encodeURIComponent(row.id)}`;
        return (
          <div className="inline-flex items-center justify-center gap-1.5">
            <Link
              href={detailHref}
              className="inline-flex size-[23px] items-center justify-center rounded-md border border-[#E2E8F0] bg-white transition hover:bg-[#F8FAFC]"
              title="Review applicant"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/applicants/icon-review.svg" alt="" />
            </Link>
            <button
              type="button"
              className={`inline-flex size-[23px] items-center justify-center rounded-md text-[#64748B] transition hover:bg-[#F1F5F9] ${
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/applicants/icon-more.svg" alt="" />
            </button>
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
      case "email":
        return <span className="text-sm text-[#475569]">{applicantEmail(row) || "—"}</span>;
      case "workflow":
        return <span className="text-sm text-[#475569]">{workflowName(row)}</span>;
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
      className="box-border flex w-full min-w-0 max-w-full flex-col gap-5 px-4 pb-8 pt-[30px] sm:px-5 lg:px-8"
      style={brandStyle}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold leading-7 text-black">
            Applicants
          </h1>
          <p className="text-xs leading-4 text-[#374151]">
            Manage teams in one place
          </p>
        </div>

        {/* Optional Job selector */}
        {jobOptions.length > 0 && (
          <div className="relative min-w-0" ref={jobMenuRef}>
            <button
              type="button"
              onClick={() => setJobMenuOpen((open) => !open)}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-semibold text-[#334155] shadow-sm transition hover:bg-[#F8FAFC]"
            >
              <span>{jobTitle}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-[#94A3B8] transition ${jobMenuOpen ? "rotate-180" : ""}`}
              />
            </button>
            {jobMenuOpen && (
              <div
                className="absolute right-0 z-40 mt-2 max-h-80 w-72 overflow-y-auto rounded-xl border border-[#E5E7EB] bg-white p-2 shadow-xl"
                role="listbox"
              >
                <button
                  type="button"
                  onClick={() => {
                    selectAllJobs();
                    setJobMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
                >
                  <span>All jobs</span>
                  {!jobId && <Check className="h-3.5 w-3.5" style={{ color: primaryColor }} />}
                </button>
                {filteredJobOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      selectJob(opt);
                      setJobMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
                  >
                    <span className="truncate">{opt.public_title || "Untitled job"}</span>
                    {jobId === opt.id && <Check className="h-3.5 w-3.5" style={{ color: primaryColor }} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4 Metric Stat Cards matching Figma */}
      <ApplicantsMetricsCards
        totalApplicants={listMeta.paged ? listMeta.total : tabCounts.all || rows.length}
        shortlistedCount={statusOptions.reduce((sum, option) => {
          return option.systemKey === "shortlisted" ? sum + (tabCounts[option.id] || 0) : sum;
        }, 0)}
        underReviewCount={statusOptions.reduce((sum, option) => {
          return option.systemKey === "reviewing" ? sum + (tabCounts[option.id] || 0) : sum;
        }, 0)}
        hiredCount={statusOptions.reduce((sum, option) => {
          return option.systemKey === "hired" ? sum + (tabCounts[option.id] || 0) : sum;
        }, 0)}
      />

      {/* Search & Filter Toolbar matching Figma */}
      <ApplicantsFilterBar
        applicantQuery={candidateSearchQuery}
        onApplicantQueryChange={setCandidateSearchQuery}
        keywordQuery={keywordQuery}
        onKeywordQueryChange={setKeywordQuery}
        onSearch={() => setPage(1)}
        roleFilter={roleFilter}
        onRoleFilterChange={(role) => {
          setRoleFilter(role);
          setPage(1);
        }}
        clientFilter={clientFilter}
        onClientFilterChange={(client) => {
          setClientFilter(client);
          setPage(1);
        }}
        matchFilter={matchFilter}
        onMatchFilterChange={(match) => {
          setMatchFilter(match);
          setPage(1);
        }}
        ownerFilter={ownerFilter}
        onOwnerFilterChange={setOwnerFilter}
        highlightMultiJob={highlightMultiJobApplicants}
        onHighlightMultiJobChange={setHighlightMultiJobApplicants}
        onAddApplicant={openAddCandidateModal}
        onMatchToJob={openMatchExistingCandidateModal}
        onOpenAllFilters={() => setEditFiltersOpen(true)}
        onEditColumns={() => setEditColumnsOpen(true)}
        activeFilterCount={activeFilterCount}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        searching={loading}
      />

      {/* Main Table Container */}
      <div className="w-full overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
        <CandidateBulkSelectionBar
          selectedCount={selectedIds.size}
          eligibleCount={selectedEligibleCount}
          scopeLabel={
            selectedIds.size === 0
              ? undefined
              : allVisibleSelected
                ? `All ${selectedOnPageCount} applicant${selectedOnPageCount === 1 ? "" : "s"} on this page selected`
                : `${selectedIds.size} applicant${selectedIds.size === 1 ? "" : "s"} selected on this page`
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
          <div className="mx-4 mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="px-4 py-6">
            <CandidatesListSkeleton
              rows={Math.min(pageSize, 8)}
              view="list"
              label="Loading applicants"
            />
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {displayRows.map((row) => {
              const name = applicantName(row);
              const email = applicantEmail(row);
              const phone = applicantPhone(row);
              const role =
                row.job_role ||
                String(one(row.job_requisitions).public_title ?? "").trim() ||
                "—";
              const detailHref = `/admin_recruiter/applications/review?jobId=${encodeURIComponent(row.job_requisition_id)}&applicationId=${encodeURIComponent(row.id)}`;
              const exp = experienceLabel(row);
              const appliedJobCount = Number(row.appliedJobCount ?? 1);
              const multiJob = appliedJobCount > 1;
              return (
                <div
                  key={row.id}
                  className="flex flex-col justify-between rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm transition hover:shadow-md"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <CandidateListAvatar name={name || "NA"} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {multiJob ? (
                              <button
                                type="button"
                                className="truncate text-left text-xs font-semibold text-[#374151] hover:underline"
                                onClick={(event) => {
                                  const same = jobsPopover?.key === applicantGroupKey(row);
                                  if (same) {
                                    setJobsPopover(null);
                                    return;
                                  }
                                  void openApplicantJobs(row, event.currentTarget);
                                }}
                              >
                                {name}
                              </button>
                            ) : (
                              <Link
                                href={detailHref}
                                className="truncate text-xs font-semibold text-[#374151] hover:underline"
                              >
                                {name}
                              </Link>
                            )}
                            {multiJob ? (
                              <span className="inline-flex items-center justify-center rounded bg-[#F7EEDC] px-1.5 py-0.5 text-[10px] font-semibold leading-[15px] text-[#8A5A12]">
                                {appliedJobCount}
                              </span>
                            ) : null}
                          </div>
                          {exp ? <p className="text-[10px] leading-[15px] text-[#6B7280]">{exp}</p> : null}
                        </div>
                      </div>
                      {renderCell("fit", row)}
                    </div>

                    <div className="mt-3.5 space-y-1 text-xs">
                      <p className="font-medium text-[#0F172A]">{role}</p>
                      <p className="truncate text-[#64748B]">{email}</p>
                      <p className="text-[#94A3B8]">{phone}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-[#F1F5F9] pt-3">
                    <div className="flex items-center gap-2">
                      {renderCell("workType", row)}
                      {renderCell("currentStage", row)}
                    </div>
                    {renderCell("actions", row)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[960px] w-full border-collapse text-left text-sm xl:min-w-full">
              <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <tr>
                  <th className="w-12 px-4 py-3.5 text-center">
                    <ListTableCheckbox
                      checked={allVisibleSelected}
                      indeterminate={someVisibleSelected && !allVisibleSelected}
                      disabled={displayRows.length === 0}
                      onChange={toggleSelectAllVisible}
                      aria-label="Select all applicants on this page"
                    />
                  </th>
                  {listColumns.map((colId) => {
                    const sortable = isApplicationListSortableColumn(colId);
                    const sortActive = sortable && listSort.column === colId;
                    return (
                      <th
                        key={colId}
                        className={`px-3 py-3.5 text-xs font-semibold uppercase tracking-wider text-[#475569] ${applicationListColumnClassName(colId)}`}
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
                              className="text-[10px] font-semibold uppercase tracking-normal text-[#374151]"
                              iconClassName="size-3.5"
                            />
                        ) : (
                          applicationColumnLabel(colId)
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {displayRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={listColumns.length + 1}
                      className={`px-4 text-center text-sm text-[#64748B] ${
                        highlightMultiJobApplicants ? "py-24" : "py-16"
                      }`}
                    >
                      {highlightMultiJobApplicants
                        ? "No applicants have applied to multiple jobs."
                        : "No applicants match these filters."}
                    </td>
                  </tr>
                ) : (
                  displayRows.map((row) => (
                    <tr
                      key={row.id}
                      className="align-middle transition-colors hover:bg-[#F8FAFC]"
                    >
                      <td
                        className="px-4 py-3 text-center align-middle"
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
                          className={`px-3 py-3 align-middle ${applicationListColumnClassName(colId)}`}
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

        {/* Footer pagination matching Figma */}
        <div className="flex flex-col gap-3 rounded-b-2xl border-t border-[#E2E8F0] bg-white px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-[#64748B]">
            Showing{" "}
            <span className="font-semibold text-[#0F172A]">
              {resultTotal === 0 ? "0" : `${pageStart}–${pageEnd}`}
            </span>{" "}
            of <span className="font-semibold text-[#0F172A]">{displayTotal}</span> results
          </p>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#64748B]">Show</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-medium text-[#334155] focus:outline-none"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                className="rounded-lg px-2.5 py-1 font-medium text-[#64748B] hover:text-[#0F172A] disabled:opacity-40"
              >
                Previous
              </button>
              {pageNumberWindow(currentPage, totalPages).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  style={
                    currentPage === p
                      ? { backgroundColor: secondaryColor, color: textOnSecondary }
                      : undefined
                  }
                  className={`flex h-7 w-7 items-center justify-center rounded-lg font-bold text-xs ${
                    currentPage === p
                      ? "shadow-sm"
                      : "text-[#64748B] hover:bg-[#F1F5F9]"
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                className="rounded-lg px-2.5 py-1 font-medium text-[#64748B] hover:text-[#0F172A] disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {jobsPopover ? (
        <ApplicantJobsPopover
          anchor={jobsPopover.anchor}
          applicantName={jobsPopover.name}
          applications={jobsPopover.applications}
          loading={jobsPopover.loading}
          onClose={() => setJobsPopover(null)}
        />
      ) : null}

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

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ColumnsEditorModal } from "@/app/admin_recruiter/components/ColumnsEditorModal";
import { BulkDeleteConfirmModal } from "@/app/admin_recruiter/components/BulkDeleteConfirmModal";
import { ListPaginationControls, ListPaginationShowLabel } from "@/app/admin_recruiter/components/ListPaginationControls";
import { ListTableCheckbox } from "@/app/admin_recruiter/components/ListTableCheckbox";
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import ErrorModal from "@/app/components/ErrorModal";
import SuccessModal from "@/app/components/SuccessModal";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import toast from "react-hot-toast";
import { normalizeJobRequisitionStatus, jobStatusDisplayLabel } from "@/lib/jobs/job-status";
import { employmentTypeDisplayLabel } from "@/lib/jobs/employment-type";
import { prefetchJobDetails } from "@/lib/admin/staff-detail-fetch-cache";
import { useAdminHeaderData } from "@/lib/admin/hooks/use-admin-header-data";
import { toPersistedJobListRow } from "@/lib/lists/staff-list-cache-rows";
import {
  invalidateJobsListCache,
  readJobsListCache,
  writeJobsListCache,
} from "@/lib/lists/staff-list-session-cache";
import {
  EditJobsFiltersModal,
  EMPTY_JOBS_EXTENDED_FILTERS,
  jobMatchesDatePostedFilter,
  jobMatchesPayRateFilter,
  type JobsExtendedFilterValues,
} from "./EditJobsFiltersModal";
import {
  CANDIDATES_PAGE_SUBTITLE_STYLE,
  CANDIDATES_PAGE_TITLE_CLASS,
  CANDIDATES_PAGE_TITLE_STYLE,
  CANDIDATES_PAGE_SUBTITLE_CLASS,
} from "@/app/admin_recruiter/candidates/candidates-typography";
import { brandingToCssVars } from "@/lib/tenant/tenant-branding";
import {
  locationsMatchCityState,
  uniqueCityStateOptions,
} from "@/lib/location/city-state";
import { isJobRequisitionOpen } from "@/lib/jobs/public-application-routing";
import {
  DEFAULT_JOB_COLUMNS,
  JOB_COLUMN_OPTIONS,
  jobColumnLabel,
  jobListColumnClassName,
  isSortableJobColumn,
  isCenterAlignedJobColumn,
  loadJobColumnOrder,
  saveJobColumnOrder,
  visibleJobColumnsForTab,
  type JobColumnId,
  type JobSortField,
} from "./job-columns";
import { exportJobsCsv, exportJobsXls } from "./export-jobs";
import { JobsDashboard } from "./JobsDashboard";
import { JobsBreadcrumb } from "./JobsBreadcrumb";
import { JobsGridView } from "./JobsGridView";
import { JobsBulkSelectionSnackbar } from "./JobsBulkSelectionSnackbar";
import { JobsCardBulkSelectHeader } from "./JobsCardBulkSelectHeader";
import { JobsViewToggle, type JobsListingView } from "./JobsViewToggle";
import { JobsAdvancedSearchBar } from "./JobsAdvancedSearchBar";
import { jobMatchesDashboardSearchTags } from "@/lib/jobs/jobs-list-search";
import { jobFormJobTypesInclude, parseJobFormJobTypes } from "./job-form-shared";
import { parseSkillsFilterParam } from "@/lib/jobs/application-skills-filter";
import { CandidatesListSkeleton } from "@/app/admin_recruiter/candidates/CandidatesListSkeleton";
import AddCandidateModal from "@/app/admin_recruiter/applications/AddCandidateModal";
import ImportCandidatesModal from "@/app/admin_recruiter/applications/ImportCandidatesModal";
import {
  AssignRecruiterModal,
  type AssignableTeamMember,
} from "@/app/admin_recruiter/candidates/AssignRecruiterModal";
import { JobTagsModal } from "./JobTagsModal";
import { statusActionForTarget } from "./job-details-helpers";
import type { JobStatus } from "@/lib/jobs/types";
import { readServiceAreaApiMessage } from "@/lib/service-area/copy";
import {
  jobContractGroup,
  jobListDisplayTitle,
  jobLocation,
  jobPlacementType,
  jobProfession,
  jobShiftType,
  jobSortValue,
  publicJobPathFor,
  renderJobListCell,
  type JobListCellContext,
  type JobListRow,
} from "./render-job-list-cell";

function relationNameFromJob(
  value: JobListRow["professions"] | JobListRow["specialties"] | JobListRow["onboarding_flows"]
): string {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.name?.trim() || "";
}

type JobTab = "all" | "internal" | "msp" | "draft" | "open" | "closed" | "hot" | "archived";

/** Figma Client job listing: source + status + hot tabs. */
const JOB_TABS: Array<{ id: JobTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "internal", label: "Internal" },
  { id: "msp", label: "MSP" },
  { id: "draft", label: "Draft" },
  { id: "open", label: "Open" },
  { id: "closed", label: "Closed" },
  { id: "hot", label: "Hot Jobs" },
  { id: "archived", label: "Archived" },
];

function jobsTabEmptyMessage(tab: JobTab, starredOnly: boolean): string {
  if (starredOnly || tab === "hot") {
    return "No Hot jobs yet. Mark a job as Hot from the job actions menu.";
  }
  switch (tab) {
    case "draft":
      return "No draft jobs to show.";
    case "open":
      return "No open jobs to show.";
    case "closed":
      return "No closed jobs to show.";
    case "internal":
      return "No internal jobs to show.";
    case "msp":
      return "No MSP jobs to show.";
    case "archived":
      return "No archived jobs to show.";
    default:
      return "No jobs match these filters.";
  }
}

function parseJobTab(value: string | null): JobTab {
  if (value && JOB_TABS.some((tab) => tab.id === value)) return value as JobTab;
  return "all";
}

const PAGE_SIZE_OPTIONS = [10, 20, 50];

/** Figma form fields: 8px radius, #CBD5E1 border, white background */
const JOBS_FORM_SURFACE_CLASS = "rounded-lg border border-[#CBD5E1] bg-white";

const JOBS_TOOLBAR_ICON_BUTTON_CLASS =
  "inline-flex h-8 w-9 shrink-0 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white transition hover:bg-zinc-50";

const JOBS_TOOLBAR_ICON_BUTTON_ACTIVE_CLASS =
  "inline-flex h-8 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent bg-[color:var(--brand-primary)] transition hover:brightness-95";

const JOBS_CREATE_BUTTON_CLASS =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg bg-[color:var(--brand-primary)] px-3 text-xs font-semibold leading-4 text-white no-underline transition hover:brightness-95";

const JOBS_OUTLINE_ACTION_BUTTON_CLASS =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-[color:var(--brand-primary)] bg-white px-3 text-xs font-semibold leading-4 text-[color:var(--brand-primary)] no-underline transition hover:bg-[color:color-mix(in_srgb,var(--brand-primary)_6%,white)]";

const JOBS_MORE_FILTERS_BUTTON_CLASS =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[color:var(--brand-primary)] bg-white px-3 text-xs font-semibold leading-4 text-[color:var(--brand-primary)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-primary)_6%,white)]";

const JOBS_COLUMNS_ICON_SRC = "/icons/jobs-icons/columns.svg";
const JOBS_CREATE_PLUS_ICON_SRC = "/icons/jobs-icons/create-plus.svg";
const JOBS_MORE_FILTERS_ICON_SRC = "/icons/jobs-icons/more-filters.svg";
/** Same filter control icon as Candidates listing toolbar. */
const JOBS_FILTERS_ICON_BTN_SRC = "/icons/candidates-icons/filters-icon-btn.svg";
const JOBS_VIEW_STORAGE_KEY = "adminRecruiterJobsView";
const JOB_SORT_ICON_SRC = "/sort-icon.svg";
const ACTION_TOAST_DURATION_MS = 4000;

function formatJobActionToastMessage(
  count: number,
  action: "deleted" | "archived",
  jobTitle?: string
): string {
  if (count === 1 && jobTitle) {
    return `${jobTitle} ${action} successfully`;
  }
  const noun = count === 1 ? "job" : "jobs";
  return `${count} ${noun} ${action} successfully`;
}

type JobActionErrorModalState = {
  title: string;
  message: string;
  editJobId?: string;
};

type JobActionSuccessModalState = {
  title: string;
  message: string;
  viewJobId: string;
};

type JobLifecycleAction =
  | "publish"
  | "unpublish"
  | "close"
  | "archive"
  | "unarchive"
  | "pause"
  | "resume"
  | "fill"
  | "set_status";

function resolveJobActionErrorModal({
  code,
  message,
  jobTitle,
  jobId,
  action,
}: {
  code?: string;
  message: string;
  jobTitle: string;
  jobId: string;
  action: JobLifecycleAction;
}): JobActionErrorModalState {
  if (code === "JOB_DEADLINE_EXPIRED") {
    return {
      title: "Application deadline has passed",
      message: `"${jobTitle}" cannot be opened because its application deadline has already passed. Update the deadline in the job editor, then try again.`,
      editJobId: jobId,
    };
  }
  if (code === "JOB_ALREADY_PUBLISHED") {
    return {
      title: "Job already open",
      message: `"${jobTitle}" is already open.`,
    };
  }
  if (code === "JOB_ARCHIVED") {
    return {
      title: "Job is archived",
      message: `Unarchive "${jobTitle}" before opening it again.`,
    };
  }
  if (code === "JOB_NOT_FOUND") {
    return {
      title: "Job not found",
      message: "This job could not be found. Refresh the page and try again.",
    };
  }

  const actionLabel =
    action === "publish" || action === "resume"
      ? "open"
      : action === "unpublish"
        ? "move to draft"
        : action === "close"
          ? "close"
          : action === "archive"
            ? "archive"
            : action === "pause"
              ? "pause"
              : action === "fill"
                ? "mark filled"
                : "restore";

  return {
    title: `Unable to ${actionLabel} job`,
    message: message || `Could not ${actionLabel} "${jobTitle}". Please try again.`,
  };
}

function JobsListingGlyph({
  src,
  outer,
  leafWidth,
  leafHeight,
}: {
  src: string;
  outer: number;
  leafWidth: number;
  leafHeight: number;
}) {
  return (
    <span
      className="relative shrink-0 overflow-hidden"
      style={{ width: outer, height: outer }}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={leafWidth}
        height={leafHeight}
        className="absolute left-1/2 top-1/2 shrink-0 -translate-x-1/2 -translate-y-1/2"
        style={{ width: leafWidth, height: leafHeight }}
      />
    </span>
  );
}

function loadJobsListingView(): JobsListingView {
  if (typeof window === "undefined") return "list";
  try {
    const raw = localStorage.getItem(JOBS_VIEW_STORAGE_KEY);
    return raw === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

function saveJobsListingView(view: JobsListingView) {
  try {
    localStorage.setItem(JOBS_VIEW_STORAGE_KEY, view);
  } catch {
    /* ignore */
  }
}

function JobsFilterIcon() {
  return (
    <JobsListingGlyph src={JOBS_MORE_FILTERS_ICON_SRC} outer={16} leafWidth={13.5} leafHeight={13.5} />
  );
}

function JobsColumnsIcon() {
  return <JobsListingGlyph src={JOBS_COLUMNS_ICON_SRC} outer={16} leafWidth={12.33} leafHeight={10} />;
}

function JobsQuickFilterSelect({
  label,
  value,
  displayValue,
  onChange,
  children,
}: {
  label: string;
  value: string;
  /** Visible selected text (defaults to value or "All"). */
  displayValue?: string;
  onChange: (next: string) => void;
  children: ReactNode;
}) {
  const shown = displayValue ?? (value.trim() ? value : "All");
  return (
    <label className="relative inline-flex h-8 min-w-[9.5rem] max-w-full cursor-pointer items-center gap-1 overflow-hidden rounded-lg border border-[#CBD5E1] bg-white px-2.5 text-xs text-[#475569]">
      <span className="pointer-events-none relative z-0 flex min-w-0 flex-1 items-center gap-1 pr-4">
        <span className="shrink-0 whitespace-nowrap font-medium text-[#64748B]">{label}:</span>
        <span className="min-w-0 truncate font-semibold text-[#334155]">{shown}</span>
      </span>
      <span
        className="pointer-events-none absolute right-2 top-1/2 z-0 size-0 -translate-y-1/2 border-x-[4px] border-t-[5px] border-x-transparent border-t-[#64748B]"
        aria-hidden
      />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
      >
        <option value="">All</option>
        {children}
      </select>
    </label>
  );
}

type SortDirection = "asc" | "desc";

function JobTableSortHeader({
  colId,
  sortField,
  sortDirection,
  onToggleSort,
}: {
  colId: JobSortField;
  sortField: JobSortField | null;
  sortDirection: SortDirection;
  onToggleSort: (field: JobSortField) => void;
}) {
  const isActive = sortField === colId;
  const centered = isCenterAlignedJobColumn(colId);

  return (
    <button
      type="button"
      onClick={() => onToggleSort(colId)}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-medium normal-case tracking-normal text-black transition hover:opacity-80 ${
        centered ? "w-full justify-center" : ""
      }`}
      aria-label={`Sort by ${jobColumnLabel(colId)}${
        isActive ? `, ${sortDirection === "asc" ? "ascending" : "descending"}` : ""
      }`}
    >
      <span className="whitespace-nowrap">{jobColumnLabel(colId)}</span>
      <img src={JOB_SORT_ICON_SRC} width={12} height={12} className="h-3 w-3 shrink-0" alt="" aria-hidden />
    </button>
  );
}

/** Custom horizontal scrollbar so hover can use cursor:pointer (native bars force the arrow). */
function JobsListScrollArea({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbWidthRef = useRef(0);
  const dragRef = useRef<{ startX: number; startScrollLeft: number } | null>(null);
  const [scrollState, setScrollState] = useState({
    canScroll: false,
    thumbWidth: 0,
    thumbLeft: 0,
  });

  const syncThumb = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const { scrollWidth, clientWidth, scrollLeft } = viewport;
    const canScroll = scrollWidth > clientWidth + 1;
    if (!canScroll) {
      thumbWidthRef.current = 0;
      setScrollState((prev) =>
        prev.canScroll || prev.thumbWidth || prev.thumbLeft
          ? { canScroll: false, thumbWidth: 0, thumbLeft: 0 }
          : prev
      );
      return;
    }
    const ratio = clientWidth / scrollWidth;
    const thumbWidth = Math.max(40, clientWidth * ratio);
    const maxThumbLeft = clientWidth - thumbWidth;
    const maxScrollLeft = scrollWidth - clientWidth;
    const thumbLeft =
      maxScrollLeft <= 0 ? 0 : (scrollLeft / maxScrollLeft) * maxThumbLeft;
    thumbWidthRef.current = thumbWidth;
    setScrollState((prev) =>
      prev.canScroll === canScroll &&
      prev.thumbWidth === thumbWidth &&
      Math.abs(prev.thumbLeft - thumbLeft) < 0.5
        ? prev
        : { canScroll: true, thumbWidth, thumbLeft }
    );
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    syncThumb();
    const onScroll = () => syncThumb();
    viewport.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(() => syncThumb());
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    window.addEventListener("resize", syncThumb);
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      observer.disconnect();
      window.removeEventListener("resize", syncThumb);
    };
  }, [syncThumb]);

  // Re-measure after column/data updates change table width.
  useLayoutEffect(() => {
    syncThumb();
  });

  useEffect(() => {
    function onMove(event: MouseEvent) {
      const drag = dragRef.current;
      const viewport = viewportRef.current;
      if (!drag || !viewport) return;
      const thumbWidth = thumbWidthRef.current;
      const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;
      const maxThumbLeft = viewport.clientWidth - thumbWidth;
      if (maxThumbLeft <= 0 || maxScrollLeft <= 0) return;
      const deltaX = event.clientX - drag.startX;
      const nextScroll =
        drag.startScrollLeft + (deltaX / maxThumbLeft) * maxScrollLeft;
      viewport.scrollLeft = Math.min(maxScrollLeft, Math.max(0, nextScroll));
    }
    function onUp() {
      dragRef.current = null;
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <div className="jobs-list-table-scroll">
      <div ref={viewportRef} className="jobs-list-table-viewport overflow-x-auto">
        {children}
      </div>
      {scrollState.canScroll ? (
        <div
          ref={trackRef}
          className="jobs-list-table-scrollbar-track"
          onMouseDown={(event) => {
            const viewport = viewportRef.current;
            const track = trackRef.current;
            if (!viewport || !track) return;
            const trackRect = track.getBoundingClientRect();
            const clickX = event.clientX - trackRect.left;
            const thumbWidth = thumbWidthRef.current;
            const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;
            const maxThumbLeft = viewport.clientWidth - thumbWidth;
            if (maxThumbLeft <= 0) return;
            const targetLeft = Math.min(
              maxThumbLeft,
              Math.max(0, clickX - thumbWidth / 2)
            );
            viewport.scrollLeft = (targetLeft / maxThumbLeft) * maxScrollLeft;
          }}
        >
          <div
            className="jobs-list-table-scrollbar-thumb"
            style={{
              width: scrollState.thumbWidth,
              transform: `translateX(${scrollState.thumbLeft}px)`,
            }}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const viewport = viewportRef.current;
              if (!viewport) return;
              dragRef.current = {
                startX: event.clientX,
                startScrollLeft: viewport.scrollLeft,
              };
              document.body.style.cursor = "pointer";
              document.body.style.userSelect = "none";
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function jobSourceType(job: JobListRow): "Internal" | "MSP" {
  const raw = String(job.source_type ?? "").trim().toLowerCase();
  if (raw === "msp") return "MSP";
  return "Internal";
}

function jobListStatus(job: JobListRow) {
  return normalizeJobRequisitionStatus(String(job.status ?? ""));
}

function matchesJobTab(job: JobListRow, tab: JobTab): boolean {
  const status = jobListStatus(job);
  switch (tab) {
    case "all":
      return status !== "archived";
    case "internal":
      return status !== "archived" && jobSourceType(job) === "Internal";
    case "msp":
      return status !== "archived" && jobSourceType(job) === "MSP";
    case "draft":
      return status === "draft";
    case "open":
      return status === "open";
    case "closed":
      return status === "closed" || status === "filled";
    case "hot":
      return status !== "archived" && Boolean(job.is_hot);
    case "archived":
      return status === "archived";
    default:
      return true;
  }
}

const JOB_ACTIONS_MENU_WIDTH = 200;
const JOB_ACTIONS_MENU_ESTIMATED_HEIGHT = 360;

function canRepublishClosedJob(job: JobListRow): boolean {
  return isJobRequisitionOpen({ application_deadline: job.application_deadline });
}

function JobActionsMenuPortal({
  job,
  anchor,
  tenantSlug,
  duplicateBusy = false,
  onClose,
  onImportFromMsp,
  onAddCandidate,
  onImportCandidates,
  onCopyApplyLink,
  onTags,
  onAssignRecruiter,
  onDuplicate,
}: {
  job: JobListRow;
  anchor: HTMLElement;
  tenantSlug: string | null;
  duplicateBusy?: boolean;
  onClose: () => void;
  onImportFromMsp: () => void;
  onAddCandidate: (job: JobListRow) => void;
  onImportCandidates: (job: JobListRow) => void;
  onCopyApplyLink: (job: JobListRow) => void;
  onTags: (job: JobListRow) => void;
  onAssignRecruiter: (job: JobListRow) => void;
  onDuplicate: (job: JobListRow) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });

  const updatePosition = useCallback(() => {
    const rect = anchor.getBoundingClientRect();
    let top = rect.bottom + 4;
    if (top + JOB_ACTIONS_MENU_ESTIMATED_HEIGHT > window.innerHeight - 8) {
      top = Math.max(8, rect.top - JOB_ACTIONS_MENU_ESTIMATED_HEIGHT - 4);
    }
    setStyle({
      position: "fixed",
      top,
      left: Math.max(8, rect.right - JOB_ACTIONS_MENU_WIDTH),
      width: JOB_ACTIONS_MENU_WIDTH,
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

  const status = jobListStatus(job);
  const publicHref = publicJobPathFor(job, tenantSlug);
  const menuItemClass =
    "block w-full px-3 py-2 text-left text-sm text-[#012352] hover:bg-[#F8FAFC]";
  // Match Job Details ⋮ (FSD): Import / Add / Copy link / Tags / Assign / Duplicate.
  const figmaMenuItems = (
    <>
      {status !== "archived" ? (
        <>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onImportCandidates(job);
              onClose();
            }}
            className={menuItemClass}
          >
            Import candidates
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onAddCandidate(job);
              onClose();
            }}
            className={menuItemClass}
          >
            Add candidate
          </button>
        </>
      ) : null}
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onCopyApplyLink(job);
          onClose();
        }}
        className={menuItemClass}
      >
        Copy apply link
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onTags(job);
          onClose();
        }}
        className={menuItemClass}
      >
        Tags
      </button>
      {/* Assign recruiter — hidden for now; restore later
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onAssignRecruiter(job);
          onClose();
        }}
        className={menuItemClass}
      >
        Assign recruiter
      </button>
      */}
      <button
        type="button"
        role="menuitem"
        disabled={duplicateBusy}
        onClick={() => {
          onDuplicate(job);
        }}
        className={`${menuItemClass} disabled:opacity-60`}
      >
        {duplicateBusy ? "Duplicating…" : "Duplicate"}
      </button>
      {status !== "archived" ? (
        <Link
          href={`/admin_recruiter/jobs/${job.id}/edit`}
          role="menuitem"
          className={menuItemClass}
          onClick={onClose}
        >
          Edit
        </Link>
      ) : null}
      {publicHref ? (
        <Link
          href={publicHref}
          target="_blank"
          rel="noopener noreferrer"
          role="menuitem"
          className={menuItemClass}
          onClick={onClose}
        >
          View Public Listing
        </Link>
      ) : null}
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onImportFromMsp();
          onClose();
        }}
        className={menuItemClass}
      >
        Import from MSP
      </button>
    </>
  );

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={style}
      className={`z-[200] min-w-[150px] ${JOBS_FORM_SURFACE_CLASS} py-2.5 shadow-xl`}
    >
      {figmaMenuItems}
      <div className="my-1 border-t border-[#E5E7EB]" aria-hidden />
      <Link
        href={`/admin_recruiter/jobs/${job.id}`}
        role="menuitem"
        className="block px-3 py-2 text-sm text-[#334155] hover:bg-[#F8FAFC]"
        onMouseEnter={() => prefetchJobDetails(job.id)}
        onFocus={() => prefetchJobDetails(job.id)}
        onClick={onClose}
      >
        View
      </Link>
    </div>,
    document.body
  );
}

export default function AdminRecruiterJobsPage() {
  const branding = useTenantBranding();
  const brandStyle = brandingToCssVars(branding);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const showListing = searchParams.get("view") === "all";

  const [jobs, setJobs] = useState<JobListRow[]>([]);
  const [totalCandidateCount, setTotalCandidateCount] = useState<number | null>(null);
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const { userId: currentUserId, tenantId: currentTenantId } = useAdminHeaderData();
  const jobsUserIdRef = useRef(currentUserId);
  const jobsTenantIdRef = useRef(currentTenantId);
  jobsUserIdRef.current = currentUserId;
  jobsTenantIdRef.current = currentTenantId;
  const jobsRequestRef = useRef(0);
  const jobsNetworkReadyRef = useRef(false);
  const [jobTab, setJobTab] = useState<JobTab>(() => parseJobTab(searchParams.get("tab")));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionErrorModal, setActionErrorModal] = useState<JobActionErrorModalState | null>(null);
  const [actionSuccessModal, setActionSuccessModal] = useState<JobActionSuccessModalState | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [listColumnOrder, setListColumnOrder] = useState<JobColumnId[]>(DEFAULT_JOB_COLUMNS);
  const [editColumnsOpen, setEditColumnsOpen] = useState(false);
  const [openActionsMenu, setOpenActionsMenu] = useState<{
    job: JobListRow;
    anchor: HTMLElement;
  } | null>(null);
  const [publishBusyIds, setPublishBusyIds] = useState<Set<string>>(new Set());
  const [hotBusyIds, setHotBusyIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [addCandidateJob, setAddCandidateJob] = useState<{
    id: string;
    title: string;
    location: string | null;
  } | null>(null);
  const [importCandidateJobId, setImportCandidateJobId] = useState<string | null>(null);
  const [tagsJob, setTagsJob] = useState<JobListRow | null>(null);
  const [tagsBusy, setTagsBusy] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [assignJob, setAssignJob] = useState<JobListRow | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<AssignableTeamMember[]>([]);
  const [teamMembersLoading, setTeamMembersLoading] = useState(false);
  const [duplicateBusyId, setDuplicateBusyId] = useState<string | null>(null);

  const [professionFilter, setProfessionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  /** Employment Type filter (shift_type) — kept name for existing inline filter bar. */
  const [placementTypeFilter, setPlacementTypeFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [locationTypeFilter, setLocationTypeFilter] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [contractGroupFilter, setContractGroupFilter] = useState("");
  const [w2TypeFilter, setW2TypeFilter] = useState("");
  const [sourceTypeFilter, setSourceTypeFilter] = useState("");
  const [workflowFilter, setWorkflowFilter] = useState("");
  const [payRateFilter, setPayRateFilter] = useState("");
  const [datePostedFilter, setDatePostedFilter] = useState("");
  const [searchTags, setSearchTags] = useState<string[]>(() => {
    const q = searchParams.get("q") || searchParams.get("search");
    return q ? [q.trim()] : [];
  });
  const [industryFilter, setIndustryFilter] = useState("");
  const [editFiltersOpen, setEditFiltersOpen] = useState(false);
  const [filtersBarOpen, setFiltersBarOpen] = useState(false);
  const [sortField, setSortField] = useState<JobSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [listingView, setListingView] = useState<JobsListingView>("list");
  const [listingCardBulkSelectMode, setListingCardBulkSelectMode] = useState(false);

  const handleToggleSort = useCallback((field: JobSortField) => {
    setSortField((current) => {
      if (current === field) {
        setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
        return field;
      }
      setSortDirection("asc");
      return field;
    });
    setPage(1);
  }, []);

  const handleListingViewChange = useCallback((next: JobsListingView) => {
    setListingView(next);
    saveJobsListingView(next);
    setListingCardBulkSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const selectJobTab = useCallback(
    (next: JobTab) => {
      setJobTab(next);
      // FSD: Internal hides MSP/Client — drop a filter that would never match visible rows.
      if (next === "internal") {
        setContractGroupFilter("");
      }
      // Status tabs already scope by status — clear conflicting status filter.
      if (next === "draft" || next === "open" || next === "closed" || next === "archived") {
        setStatusFilter("");
      }
      if (searchParams.get("view") !== "all") return;
      const params = new URLSearchParams(searchParams.toString());
      if (next === "all") params.delete("tab");
      else params.set("tab", next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    const next = parseJobTab(searchParams.get("tab"));
    setJobTab((current) => (current === next ? current : next));
  }, [searchParams]);

  const applyJobsCache = useCallback((scope: string) => {
    if (jobsNetworkReadyRef.current) return false;
    const cached = readJobsListCache<JobListRow>(scope);
    if (!cached) return false;
    setJobs(cached.rows);
    const candidateCount = cached.meta?.candidateCount;
    setTotalCandidateCount(typeof candidateCount === "number" ? candidateCount : null);
    const slug = cached.meta?.tenantSlug;
    setTenantSlug(typeof slug === "string" && slug ? slug : null);
    setLoading(false);
    setError("");
    return true;
  }, []);

  useLayoutEffect(() => {
    const scope =
      currentUserId && currentTenantId ? `${currentUserId}:${currentTenantId}` : "";
    if (!scope) return;
    applyJobsCache(scope);
  }, [applyJobsCache, currentTenantId, currentUserId]);

  const load = useCallback(async (mode: "navigate" | "refresh" = "navigate") => {
    const requestId = ++jobsRequestRef.current;
    const scopeNow = () =>
      jobsUserIdRef.current && jobsTenantIdRef.current
        ? `${jobsUserIdRef.current}:${jobsTenantIdRef.current}`
        : "";
    if (mode === "refresh") {
      invalidateJobsListCache();
      jobsNetworkReadyRef.current = false;
      setLoading(true);
      setError("");
    } else if (!applyJobsCache(scopeNow())) {
      setLoading(true);
      setError("");
    }
    try {
      const response = await fetch("/api/admin/jobs", { cache: "no-store" });
      const payload = await response.json();
      if (requestId !== jobsRequestRef.current) return;
      if (response.status === 401 || response.status === 403) {
        invalidateJobsListCache();
        jobsNetworkReadyRef.current = true;
        setJobs([]);
        setTotalCandidateCount(null);
        setTenantSlug(null);
        throw new Error(payload.error || "Failed to load jobs");
      }
      if (!response.ok) throw new Error(payload.error || "Failed to load jobs");
      const nextJobs = (payload.jobs ?? []) as JobListRow[];
      const nextCount =
        typeof payload.totalCandidateCount === "number" ? payload.totalCandidateCount : null;
      const nextSlug =
        typeof payload.tenantSlug === "string" && payload.tenantSlug.trim()
          ? payload.tenantSlug.trim().toLowerCase()
          : null;
      jobsNetworkReadyRef.current = true;
      setJobs(nextJobs);
      setTotalCandidateCount(nextCount);
      setTenantSlug(nextSlug);
      const scope = scopeNow();
      if (scope) {
        writeJobsListCache(
          scope,
          nextJobs,
          nextJobs.length,
          nextJobs.map((job) => toPersistedJobListRow(job)),
          { candidateCount: nextCount, tenantSlug: nextSlug }
        );
      }
    } catch (loadError) {
      if (requestId !== jobsRequestRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Failed to load jobs");
    } finally {
      if (requestId === jobsRequestRef.current) setLoading(false);
    }
  }, [applyJobsCache]);

  useEffect(() => {
    void load("navigate");
  }, [load]);

  useEffect(() => {
    if (!jobsNetworkReadyRef.current) return;
    const scope =
      currentUserId && currentTenantId ? `${currentUserId}:${currentTenantId}` : "";
    if (!scope) return;
    writeJobsListCache(
      scope,
      jobs,
      jobs.length,
      jobs.map((job) => toPersistedJobListRow(job)),
      { candidateCount: totalCandidateCount, tenantSlug }
    );
  }, [currentTenantId, currentUserId, jobs, tenantSlug, totalCandidateCount]);

  useEffect(() => {
    setListColumnOrder(loadJobColumnOrder());
    setListingView(loadJobsListingView());
  }, []);

  useEffect(() => {
    setPage(1);
  }, [
    jobTab,
    professionFilter,
    statusFilter,
    placementTypeFilter,
    locationFilter,
    locationTypeFilter,
    specialtyFilter,
    contractGroupFilter,
    w2TypeFilter,
    sourceTypeFilter,
    workflowFilter,
    payRateFilter,
    datePostedFilter,
    searchTags,
    industryFilter,
    showStarredOnly,
    pageSize,
  ]);

  async function transition(
    jobId: string,
    action: JobLifecycleAction,
    nextStatus?: JobStatus
  ) {
    setPublishBusyIds((current) => new Set(current).add(jobId));
    const job = jobs.find((item) => item.id === jobId);
    const jobTitle = job ? jobListDisplayTitle(job) : "Job";
    try {
      const response = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "set_status"
            ? { jobId, action, status: nextStatus }
            : { jobId, action }
        ),
      });
      const payload = await response.json();
      if (!response.ok) {
        const message = readServiceAreaApiMessage(payload, "Failed to update job");
        const code = typeof payload.code === "string" ? payload.code : undefined;
        setActionErrorModal(
          resolveJobActionErrorModal({
            code,
            message,
            jobTitle,
            jobId,
            action,
          })
        );
        return;
      }
      setOpenActionsMenu(null);
      setError("");
      if (action === "archive") {
        toast.success(`${jobTitle} archived successfully`, { duration: ACTION_TOAST_DURATION_MS });
        setStatusFilter("archived");
        selectJobTab("all");
      } else if (action === "unarchive") {
        toast.success(`${jobTitle} restored from archive`, { duration: ACTION_TOAST_DURATION_MS });
        setStatusFilter("draft");
        selectJobTab("all");
      } else if (action === "close") {
        toast.success(`${jobTitle} closed`, { duration: ACTION_TOAST_DURATION_MS });
      } else if (action === "publish" || action === "resume") {
        setActionSuccessModal({
          title: "Job opened successfully",
          message: `"${jobTitle}" is now open for applications.`,
          viewJobId: jobId,
        });
      } else if (action === "unpublish") {
        toast.success(`${jobTitle} moved to draft`, { duration: ACTION_TOAST_DURATION_MS });
      } else if (action === "pause") {
        toast.success(`${jobTitle} paused`, { duration: ACTION_TOAST_DURATION_MS });
      } else if (action === "fill") {
        toast.success(`${jobTitle} marked filled`, { duration: ACTION_TOAST_DURATION_MS });
      } else if (action === "set_status" && nextStatus) {
        toast.success(`${jobTitle} status updated`, { duration: ACTION_TOAST_DURATION_MS });
      }
      await load("refresh");
    } finally {
      setPublishBusyIds((current) => {
        const next = new Set(current);
        next.delete(jobId);
        return next;
      });
    }
  }

  function handleStatusChange(job: JobListRow, nextStatus: JobStatus) {
    if (publishBusyIds.has(job.id)) return;
    const action = statusActionForTarget(jobListStatus(job), nextStatus);
    if (!action) return;
    if (action === "set_status") {
      void transition(job.id, "set_status", nextStatus);
      return;
    }
    void transition(job.id, action);
  }

  function handlePublishToggle(job: JobListRow) {
    if (publishBusyIds.has(job.id)) return;
    const status = jobListStatus(job);
    if (status === "open") {
      void transition(job.id, "unpublish");
      return;
    }
    if (status === "paused") {
      void transition(job.id, "resume");
      return;
    }
    if (status === "draft") {
      void transition(job.id, "publish");
      return;
    }
    if ((status === "closed" || status === "filled") && canRepublishClosedJob(job)) {
      void transition(job.id, "publish");
    }
  }

  const tabCounts = useMemo(() => {
    const counts: Record<JobTab, number> = {
      all: 0,
      internal: 0,
      msp: 0,
      draft: 0,
      open: 0,
      closed: 0,
      hot: 0,
      archived: 0,
    };
    for (const job of jobs) {
      const status = jobListStatus(job);
      if (status !== "archived") counts.all += 1;
      if (matchesJobTab(job, "internal")) counts.internal += 1;
      if (matchesJobTab(job, "msp")) counts.msp += 1;
      if (matchesJobTab(job, "draft")) counts.draft += 1;
      if (matchesJobTab(job, "open")) counts.open += 1;
      if (matchesJobTab(job, "closed")) counts.closed += 1;
      if (matchesJobTab(job, "hot")) counts.hot += 1;
      if (matchesJobTab(job, "archived")) counts.archived += 1;
    }
    return counts;
  }, [jobs]);

  const hotJobIds = useMemo(() => {
    const ids = new Set<string>();
    for (const job of jobs) {
      if (job.is_hot) ids.add(job.id);
    }
    return ids;
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (!matchesJobTab(job, jobTab)) return false;

      if (showStarredOnly && !job.is_hot) return false;

      if (searchTags.length > 0 && !jobMatchesDashboardSearchTags(job, searchTags)) return false;

      if (professionFilter && jobProfession(job) !== professionFilter) return false;

      if (statusFilter && jobListStatus(job) !== statusFilter) return false;

      if (placementTypeFilter && !jobFormJobTypesInclude(jobShiftType(job), placementTypeFilter)) {
        return false;
      }

      if (locationFilter && !locationsMatchCityState(jobLocation(job), locationFilter)) return false;

      if (locationTypeFilter && jobPlacementType(job) !== locationTypeFilter) return false;

      if (specialtyFilter && relationNameFromJob(job.specialties) !== specialtyFilter) return false;

      if (contractGroupFilter && jobContractGroup(job) !== contractGroupFilter) return false;

      if (w2TypeFilter && (job.employment_type || "").trim() !== w2TypeFilter) return false;

      if (sourceTypeFilter) {
        const source = String(job.source_type ?? "").trim();
        if (source.toLowerCase() !== sourceTypeFilter.toLowerCase()) return false;
      }

      if (workflowFilter && relationNameFromJob(job.onboarding_flows) !== workflowFilter) {
        return false;
      }

      if (!jobMatchesPayRateFilter(job, payRateFilter)) return false;

      if (!jobMatchesDatePostedFilter(job, datePostedFilter)) return false;

      if (industryFilter && String(job.industry_key ?? "") !== industryFilter) return false;

      return true;
    });
  }, [
    jobs,
    jobTab,
    showStarredOnly,
    professionFilter,
    statusFilter,
    placementTypeFilter,
    locationFilter,
    locationTypeFilter,
    specialtyFilter,
    contractGroupFilter,
    w2TypeFilter,
    sourceTypeFilter,
    workflowFilter,
    payRateFilter,
    datePostedFilter,
    searchTags,
    industryFilter,
  ]);

  const sortedJobs = useMemo(() => {
    if (!sortField) return filteredJobs;

    const next = [...filteredJobs];
    next.sort((a, b) => {
      const left = jobSortValue(a, sortField);
      const right = jobSortValue(b, sortField);
      let cmp = 0;
      if (typeof left === "number" && typeof right === "number") {
        cmp = left - right;
      } else {
        cmp = String(left).localeCompare(String(right), undefined, {
          sensitivity: "base",
          numeric: true,
        });
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return next;
  }, [filteredJobs, sortField, sortDirection]);

  /** Selected rows when any are checked; otherwise current filtered/sorted result set. */
  const exportJobs = useMemo(() => {
    if (selectedIds.size === 0) return sortedJobs;
    const selected = jobs.filter((job) => selectedIds.has(job.id));
    return selected.length > 0 ? selected : sortedJobs;
  }, [jobs, sortedJobs, selectedIds]);

  const listColumns = useMemo(
    () =>
      visibleJobColumnsForTab(
        listColumnOrder.length ? listColumnOrder : DEFAULT_JOB_COLUMNS,
        jobTab
      ),
    [jobTab, listColumnOrder]
  );

  const handleExportCsv = useCallback(() => {
    if (exportJobs.length === 0) {
      toast.error("No jobs to export");
      return;
    }
    exportJobsCsv(exportJobs, { columnOrder: listColumns });
  }, [exportJobs, listColumns]);

  const handleExportXls = useCallback(() => {
    if (exportJobs.length === 0) {
      toast.error("No jobs to export");
      return;
    }
    exportJobsXls(exportJobs, { columnOrder: listColumns });
  }, [exportJobs, listColumns]);

  const totalPages = Math.max(1, Math.ceil(sortedJobs.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = sortedJobs.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(currentPage * pageSize, sortedJobs.length);
  const paginatedJobs = sortedJobs.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const allVisibleSelected =
    paginatedJobs.length > 0 && paginatedJobs.every((job) => selectedIds.has(job.id));

  function toggleSelectAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const job of paginatedJobs) next.delete(job.id);
      } else {
        for (const job of paginatedJobs) next.add(job.id);
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

  async function handleConfirmDeleteJobs() {
    if (deleteBusy || selectedIds.size === 0) return;
    const idsToDelete = [...selectedIds];
    const singleJob = idsToDelete.length === 1 ? jobs.find((job) => job.id === idsToDelete[0]) : undefined;
    const singleJobTitle = singleJob ? jobListDisplayTitle(singleJob) : undefined;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const response = await fetch("/api/admin/jobs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsToDelete }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Failed to delete jobs");
      }
      const deletedIds = new Set<string>(
        Array.isArray(payload.deletedIds) ? payload.deletedIds.map(String) : []
      );
      const deletedCount =
        typeof payload.count === "number" ? payload.count : deletedIds.size;
      setJobs((current) => current.filter((job) => !deletedIds.has(job.id)));
      invalidateJobsListCache();
      setSelectedIds(new Set());
      setDeleteConfirmOpen(false);
      if (deletedCount > 0) {
        toast.success(
          formatJobActionToastMessage(deletedCount, "deleted", singleJobTitle),
          { duration: ACTION_TOAST_DURATION_MS }
        );
      } else {
        toast.error("No jobs were deleted", { duration: ACTION_TOAST_DURATION_MS });
      }
    } catch (deleteErr) {
      const message = deleteErr instanceof Error ? deleteErr.message : "Failed to delete jobs";
      setDeleteError(message);
      toast.error(message, { duration: ACTION_TOAST_DURATION_MS });
    } finally {
      setDeleteBusy(false);
    }
  }

  function handleImportFromMsp() {
    toast("Import from MSP is not available yet.");
  }

  function handleCopyApplyLink(job: JobListRow) {
    const publicHref = publicJobPathFor(job, tenantSlug);
    if (!publicHref) {
      toast.error("Public apply link is not available for this job yet");
      return;
    }
    void (async () => {
      try {
        const absolute =
          typeof window !== "undefined"
            ? new URL(publicHref, window.location.origin).toString()
            : publicHref;
        await navigator.clipboard.writeText(absolute);
        toast.success("Apply link copied");
      } catch {
        toast.error("Could not copy apply link");
      }
    })();
  }

  async function loadTeamMembersForAssign() {
    setTeamMembersLoading(true);
    try {
      const response = await fetch("/api/admin/team-members", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string" ? payload.error : "Failed to load team members"
        );
      }
      const rows = Array.isArray(payload.members) ? payload.members : [];
      setTeamMembers(
        rows
          .map((row: Record<string, unknown>) => ({
            id: String(row.id ?? ""),
            name: String(row.name ?? "").trim() || String(row.email ?? "Unknown"),
            email: typeof row.email === "string" ? row.email : undefined,
            role: typeof row.role === "string" ? row.role : undefined,
          }))
          .filter((member: AssignableTeamMember) => Boolean(member.id))
      );
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Failed to load team members");
      setTeamMembers([]);
    } finally {
      setTeamMembersLoading(false);
    }
  }

  async function saveListJobTags(nextTags: string[]) {
    if (!tagsJob || tagsBusy) return;
    setTagsBusy(true);
    setTagsError(null);
    try {
      const response = await fetch(`/api/admin/jobs/${encodeURIComponent(tagsJob.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: nextTags }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Failed to save tags");
      }
      setJobs((current) =>
        current.map((job) => (job.id === tagsJob.id ? { ...job, tags: nextTags } : job))
      );
      toast.success("Tags updated");
      setTagsJob(null);
    } catch (err) {
      setTagsError(err instanceof Error ? err.message : "Failed to save tags");
    } finally {
      setTagsBusy(false);
    }
  }

  async function assignListJobRecruiter(assigneeUserId: string | null) {
    if (!assignJob || assignBusy) return;
    setAssignBusy(true);
    setAssignError(null);
    try {
      const response = await fetch(`/api/admin/jobs/${encodeURIComponent(assignJob.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignee: assigneeUserId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string" ? payload.error : "Failed to assign recruiter"
        );
      }
      setJobs((current) =>
        current.map((job) =>
          job.id === assignJob.id
            ? { ...job, assigned_recruiter_user_id: assigneeUserId }
            : job
        )
      );
      toast.success(assigneeUserId ? "Recruiter assigned" : "Recruiter cleared");
      setAssignJob(null);
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Failed to assign recruiter");
    } finally {
      setAssignBusy(false);
    }
  }

  async function duplicateListJob(job: JobListRow) {
    if (duplicateBusyId) return;
    setDuplicateBusyId(job.id);
    try {
      const response = await fetch(`/api/admin/jobs/${encodeURIComponent(job.id)}/duplicate`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string" ? payload.error : "Failed to duplicate job"
        );
      }
      const newId = payload?.job?.id ? String(payload.job.id) : "";
      if (!newId) throw new Error("Duplicate job id missing");
      setOpenActionsMenu(null);
      toast.success("Job duplicated");
      router.push(`/admin_recruiter/jobs/${encodeURIComponent(newId)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to duplicate job");
    } finally {
      setDuplicateBusyId(null);
    }
  }

  async function handleBulkUnpublish() {
    const targets = jobs.filter(
      (job) => selectedIds.has(job.id) && jobListStatus(job) === "open"
    );
    if (targets.length === 0) return;
    for (const job of targets) {
      await transition(job.id, "unpublish");
    }
  }

  async function handleBulkArchive() {
    const targets = jobs.filter(
      (job) => selectedIds.has(job.id) && jobListStatus(job) !== "archived"
    );
    if (targets.length === 0 || archiveBusy) return;

    setArchiveBusy(true);
    let successCount = 0;
    try {
      for (const job of targets) {
        const response = await fetch("/api/admin/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: job.id, action: "archive" }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message =
            typeof payload.error === "string"
              ? payload.error
              : `Failed to archive ${jobListDisplayTitle(job)}`;
          toast.error(message, { duration: ACTION_TOAST_DURATION_MS });
          continue;
        }
        successCount += 1;
      }

      if (successCount > 0) {
        const singleJobTitle =
          successCount === 1 ? jobListDisplayTitle(targets[0]) : undefined;
        toast.success(
          formatJobActionToastMessage(successCount, "archived", singleJobTitle),
          { duration: ACTION_TOAST_DURATION_MS }
        );
        setSelectedIds(new Set());
        setStatusFilter("archived");
        selectJobTab("all");
        await load("refresh");
      } else if (targets.length > 0) {
        toast.error("No jobs could be archived", { duration: ACTION_TOAST_DURATION_MS });
      }
    } finally {
      setArchiveBusy(false);
    }
  }

  const selectedPublishedCount = useMemo(() => {
    let count = 0;
    for (const job of jobs) {
      if (selectedIds.has(job.id) && jobListStatus(job) === "open") count += 1;
    }
    return count;
  }, [jobs, selectedIds]);

  const selectedArchivableCount = useMemo(() => {
    let count = 0;
    for (const job of jobs) {
      if (selectedIds.has(job.id) && jobListStatus(job) !== "archived") count += 1;
    }
    return count;
  }, [jobs, selectedIds]);

  const professionOptions = useMemo(() => {
    const values = new Set<string>();
    for (const job of jobs) {
      const profession = jobProfession(job);
      if (profession) values.add(profession);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const placementTypeOptions = useMemo(() => {
    const values = new Set<string>();
    for (const job of jobs) {
      for (const type of parseJobFormJobTypes(jobShiftType(job))) {
        values.add(type);
      }
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const locationOptions = useMemo(() => {
    return uniqueCityStateOptions(
      jobs.flatMap((job) => [job.location, job.facility_name, job.facility, jobLocation(job)])
    );
  }, [jobs]);

  const locationTypeOptions = useMemo(() => {
    const values = new Set<string>();
    for (const job of jobs) {
      const value = jobPlacementType(job);
      if (value) values.add(value);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const specialtyOptions = useMemo(() => {
    const values = new Set<string>();
    for (const job of jobs) {
      const value = relationNameFromJob(job.specialties);
      if (value) values.add(value);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const contractGroupOptions = useMemo(() => {
    const values = new Set<string>();
    for (const job of jobs) {
      const value = jobContractGroup(job);
      if (value) values.add(value);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const w2TypeOptions = useMemo(() => {
    const values = new Set<string>();
    for (const job of jobs) {
      const value = (job.employment_type || "").trim();
      if (value) values.add(value);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const sourceTypeOptions = useMemo(() => {
    const values = new Set<string>();
    for (const job of jobs) {
      const value = String(job.source_type ?? "").trim();
      if (value) values.add(value);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const workflowOptions = useMemo(() => {
    const values = new Set<string>();
    for (const job of jobs) {
      const value = relationNameFromJob(job.onboarding_flows);
      if (value) values.add(value);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const hasActiveFilters = Boolean(
    professionFilter ||
      statusFilter ||
      placementTypeFilter ||
      locationFilter ||
      locationTypeFilter ||
      specialtyFilter ||
      contractGroupFilter ||
      w2TypeFilter ||
      sourceTypeFilter ||
      workflowFilter ||
      payRateFilter ||
      datePostedFilter ||
      searchTags.length > 0 ||
      industryFilter ||
      showStarredOnly
  );

  const activeAttributeFilterCount = [
    professionFilter,
    statusFilter,
    placementTypeFilter,
    locationFilter,
    locationTypeFilter,
    specialtyFilter,
    contractGroupFilter,
    w2TypeFilter,
    sourceTypeFilter,
    workflowFilter,
    payRateFilter,
    datePostedFilter,
    industryFilter,
  ].filter(Boolean).length;

  const editFiltersValue = useMemo(
    (): JobsExtendedFilterValues => ({
      searchTags: searchTags.join(", "),
      profession: professionFilter,
      status: statusFilter,
      employmentType: placementTypeFilter,
      location: locationFilter,
      placementType: locationTypeFilter,
      specialty: specialtyFilter,
      contractGroup: contractGroupFilter,
      w2Type: w2TypeFilter,
      sourceType: sourceTypeFilter,
      workflow: workflowFilter,
      payRate: payRateFilter,
      datePosted: datePostedFilter,
      industry: industryFilter,
    }),
    [
      searchTags,
      professionFilter,
      statusFilter,
      placementTypeFilter,
      locationFilter,
      locationTypeFilter,
      specialtyFilter,
      contractGroupFilter,
      w2TypeFilter,
      sourceTypeFilter,
      workflowFilter,
      payRateFilter,
      datePostedFilter,
      industryFilter,
    ]
  );

  const handleSaveEditFilters = useCallback((next: JobsExtendedFilterValues) => {
    setSearchTags(parseSkillsFilterParam(next.searchTags));
    setProfessionFilter(next.profession);
    setStatusFilter(next.status);
    setPlacementTypeFilter(next.employmentType);
    setLocationFilter(next.location);
    setLocationTypeFilter(next.placementType);
    setSpecialtyFilter(next.specialty);
    setContractGroupFilter(next.contractGroup);
    setW2TypeFilter(next.w2Type);
    setSourceTypeFilter(next.sourceType);
    setWorkflowFilter(next.workflow);
    setPayRateFilter(next.payRate);
    setDatePostedFilter(next.datePosted);
    setIndustryFilter(next.industry);
    setPage(1);
  }, []);

  const handleApplyJobsSearch = useCallback((tags: string[]) => {
    setSearchTags(tags.map((tag) => tag.trim()).filter(Boolean));
    setPage(1);
  }, []);

  const handleResetJobsSearch = useCallback(() => {
    setSearchTags([]);
    setPage(1);
  }, []);

  const handleResetFilters = useCallback(() => {
    handleSaveEditFilters(EMPTY_JOBS_EXTENDED_FILTERS);
    setShowStarredOnly(false);
  }, [handleSaveEditFilters]);

  const toggleJobHot = useCallback(
    async (jobId: string) => {
      if (hotBusyIds.has(jobId)) return;
      const current = jobs.find((job) => job.id === jobId);
      if (!current) return;
      const previousHot = Boolean(current.is_hot);
      const nextHot = !previousHot;

      setHotBusyIds((busy) => {
        const next = new Set(busy);
        next.add(jobId);
        return next;
      });
      setJobs((list) =>
        list.map((job) => (job.id === jobId ? { ...job, is_hot: nextHot } : job))
      );

      try {
        const response = await fetch(`/api/admin/jobs/${encodeURIComponent(jobId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_hot: nextHot }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            typeof payload.error === "string" ? payload.error : "Failed to update Hot status"
          );
        }
      } catch (err) {
        setJobs((list) =>
          list.map((job) => (job.id === jobId ? { ...job, is_hot: previousHot } : job))
        );
        toast.error(err instanceof Error ? err.message : "Failed to update Hot status", {
          duration: ACTION_TOAST_DURATION_MS,
        });
      } finally {
        setHotBusyIds((busy) => {
          const next = new Set(busy);
          next.delete(jobId);
          return next;
        });
      }
    },
    [hotBusyIds, jobs]
  );

  const jobListCellContext = useMemo((): JobListCellContext => {
    return {
      brandingSecondaryHex: branding.secondaryHex,
      tenantSlug,
      onToggleHot: (jobId) => {
        void toggleJobHot(jobId);
      },
      hotBusyIds,
      openActionsJobId: openActionsMenu?.job.id ?? null,
      onOpenActionsMenu: (job, anchor) => {
        setOpenActionsMenu((current) => (current?.job.id === job.id ? null : { job, anchor }));
      },
      publishBusyIds,
      onPublishToggle: handlePublishToggle,
      onStatusChange: handleStatusChange,
    };
  }, [
    branding.secondaryHex,
    tenantSlug,
    hotBusyIds,
    openActionsMenu?.job.id,
    publishBusyIds,
    toggleJobHot,
  ]);

  if (true) {
    return (
      <div className="box-border w-full min-w-0 max-w-full px-3 pb-8 pt-4 sm:px-5 sm:pt-5 lg:px-8" style={brandStyle}>
        {error ? (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
        ) : null}
        <JobsDashboard
          jobs={jobs}
          loading={loading}
          tenantSlug={tenantSlug}
          totalCandidateCount={totalCandidateCount}
          hotJobIds={hotJobIds}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onSelectAll={(jobIds) => setSelectedIds(new Set(jobIds))}
          onClearSelection={() => setSelectedIds(new Set())}
          selectedPublishedCount={selectedPublishedCount}
          selectedArchivableCount={selectedArchivableCount}
          archiveBusy={archiveBusy}
          deleteBusy={deleteBusy}
          exportDisabled={exportJobs.length === 0}
          onBulkUnpublish={() => void handleBulkUnpublish()}
          onBulkArchive={() => void handleBulkArchive()}
          onBulkDelete={() => {
            setDeleteError(null);
            setDeleteConfirmOpen(true);
          }}
          onExportCsv={handleExportCsv}
          onExportXls={handleExportXls}
          onImportFromMsp={handleImportFromMsp}
          onAddCandidate={(job) => {
            setAddCandidateJob({
              id: job.id,
              title: jobListDisplayTitle(job),
              location: jobLocation(job) !== "—" ? jobLocation(job) : null,
            });
          }}
          onImportCandidates={(job) => {
            setImportCandidateJobId(job.id);
          }}
          onDelete={(jobId) => {
            setSelectedIds(new Set([jobId]));
            setDeleteError(null);
            setDeleteConfirmOpen(true);
          }}
          onArchive={(jobId) => {
            void transition(jobId, "archive");
          }}
          onUnarchive={(jobId) => {
            void transition(jobId, "unarchive");
          }}
          initialViewMode={showListing ? "list" : "grid"}
          onPublishToggle={handlePublishToggle}
          onCopyApplyLink={handleCopyApplyLink}
          onTags={(job) => {
            setTagsError(null);
            setTagsJob(job);
          }}
          onDuplicate={(job) => void duplicateListJob(job)}
          onOpenColumnsModal={() => setEditColumnsOpen(true)}
          onOpenFiltersModal={() => setEditFiltersOpen(true)}
        />
        <ColumnsEditorModal
          key={editColumnsOpen ? "job-cols-open" : "job-cols-closed"}
          open={editColumnsOpen}
          onOpenChange={setEditColumnsOpen}
          options={JOB_COLUMN_OPTIONS}
          value={listColumnOrder}
          defaultValue={DEFAULT_JOB_COLUMNS}
          title="Edit Columns"
          description="Choose which columns appear in the jobs list and drag to reorder them."
          onSave={(order) => {
            setListColumnOrder(order);
            saveJobColumnOrder(order);
          }}
        />
        <EditJobsFiltersModal
          key={editFiltersOpen ? "job-filters-open" : "job-filters-closed"}
          open={editFiltersOpen}
          onOpenChange={setEditFiltersOpen}
          value={editFiltersValue}
          options={{
            professions: professionOptions,
            employmentTypes: placementTypeOptions,
            locations: locationOptions,
            placementTypes: locationTypeOptions,
            specialties: specialtyOptions,
            contractGroups: contractGroupOptions,
            w2Types: w2TypeOptions,
            sourceTypes: sourceTypeOptions,
            workflows: workflowOptions,
          }}
          onSave={handleSaveEditFilters}
        />
        <JobTagsModal
          open={Boolean(tagsJob)}
          jobTitle={tagsJob ? jobListDisplayTitle(tagsJob) : ""}
          tags={tagsJob && Array.isArray(tagsJob.tags) ? tagsJob.tags : []}
          busy={tagsBusy}
          error={tagsError}
          onOpenChange={(open) => {
            if (!open) setTagsJob(null);
          }}
          onSave={(nextTags) => void saveListJobTags(nextTags)}
        />
        <AddCandidateModal
          open={Boolean(addCandidateJob)}
          onClose={() => setAddCandidateJob(null)}
          jobId={addCandidateJob?.id ?? ""}
          jobTitle={addCandidateJob?.title}
          jobLocation={addCandidateJob?.location}
          onSuccess={() => {
            void load("refresh");
          }}
        />
        <ImportCandidatesModal
          open={Boolean(importCandidateJobId)}
          jobId={importCandidateJobId ?? ""}
          onClose={() => setImportCandidateJobId(null)}
          onImported={() => {
            setImportCandidateJobId(null);
            void load("refresh");
          }}
        />
        <BulkDeleteConfirmModal
          open={deleteConfirmOpen}
          entity="job"
          count={selectedIds.size}
          busy={deleteBusy}
          error={deleteError}
          requireConfirmationText="DELETE"
          onCancel={() => {
            if (deleteBusy) return;
            setDeleteConfirmOpen(false);
            setDeleteError(null);
          }}
          onConfirm={() => void handleConfirmDeleteJobs()}
        />
        <ErrorModal
          open={Boolean(actionErrorModal)}
          onClose={() => setActionErrorModal(null)}
          title={actionErrorModal?.title ?? "Unable to update job"}
          message={actionErrorModal?.message ?? ""}
          actionLabel={actionErrorModal?.editJobId ? "Edit job" : "Close"}
          onAction={
            actionErrorModal?.editJobId
              ? () => {
                  const editJobId = actionErrorModal.editJobId;
                  if (editJobId) router.push(`/admin_recruiter/jobs/${editJobId}/edit`);
                }
              : undefined
          }
        />
        <SuccessModal
          open={Boolean(actionSuccessModal)}
          onClose={() => setActionSuccessModal(null)}
          title={actionSuccessModal?.title ?? "Success!"}
          message={actionSuccessModal?.message ?? ""}
          size="large"
          actionLabel="View job"
          actionHref={
            actionSuccessModal?.viewJobId
              ? `/admin_recruiter/jobs/${String(actionSuccessModal.viewJobId)}`
              : undefined
          }
        />
      </div>
    );
  }

  // Legacy listing UI kept below for restore; currently unreachable via `if (true)` above.
  const legacyActionsMenu = openActionsMenu;
  const legacyTagsJob = tagsJob;
  const legacyRawTags = legacyTagsJob?.tags;
  const legacyTagsList: string[] = Array.isArray(legacyRawTags)
    ? (legacyRawTags as string[])
    : [];
  const legacyTagsTitle = legacyTagsJob
    ? jobListDisplayTitle(legacyTagsJob as JobListRow)
    : "";
  const legacyErrorEditJobId = actionErrorModal?.editJobId ?? null;
  const legacySuccessViewJobId = actionSuccessModal?.viewJobId ?? null;

  return (
    <div className="box-border w-full min-w-0 max-w-full px-3 pb-8 pt-4 sm:px-5 sm:pt-5 lg:px-8" style={brandStyle}>
      <div className="mb-8">
        <JobsBreadcrumb page="jobs" />
        <h1 className={CANDIDATES_PAGE_TITLE_CLASS} style={CANDIDATES_PAGE_TITLE_STYLE}>
          Jobs
        </h1>
        <p className={CANDIDATES_PAGE_SUBTITLE_CLASS} style={CANDIDATES_PAGE_SUBTITLE_STYLE}>
          Manage jobs posting in one place
        </p>
      </div>

      <nav
        className="mb-4 w-full min-w-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Jobs navigation"
      >
        <div className="flex w-max flex-nowrap items-center gap-5">
          {JOB_TABS.map((tab) => {
            const active = jobTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectJobTab(tab.id)}
                className={`relative inline-flex h-[34px] shrink-0 items-center gap-2 px-2 pb-2.5 pt-1 text-sm font-normal leading-5 whitespace-nowrap transition-colors ${
                  active
                    ? "text-[color:var(--brand-primary)] after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:bg-[color:var(--brand-primary)]"
                    : "text-[#012352] hover:text-[color:var(--brand-primary)]"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <span>{tab.label}</span>
                <span className="inline-flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-[#EAE6E0] p-0.5 text-[10px] font-normal leading-[15px] text-[#374151]">
                  {tabCounts[tab.id]}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="w-full overflow-hidden rounded-[12px] border border-[#E5E7EB] bg-white">
        <JobsAdvancedSearchBar
          tags={searchTags}
          onApplySearch={handleApplyJobsSearch}
          onResetSearch={handleResetJobsSearch}
          searching={loading}
        />

        <div className="flex w-full flex-col gap-3 border-b border-[#E5E7EB] px-[14px] py-3">
          <div className="flex w-full flex-wrap items-center justify-between gap-3 max-[419px]:flex-nowrap max-[419px]:gap-2">
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setEditColumnsOpen(true)}
                className={JOBS_TOOLBAR_ICON_BUTTON_CLASS}
                aria-label="Edit columns"
                title="Columns"
              >
                <JobsColumnsIcon />
              </button>
              <button
                type="button"
                onClick={() => {
                  // Mobile: all filters live in the modal. Desktop: toggle the quick-filter row.
                  if (
                    typeof window !== "undefined" &&
                    window.matchMedia("(max-width: 639px)").matches
                  ) {
                    setEditFiltersOpen(true);
                    return;
                  }
                  setFiltersBarOpen((open) => !open);
                }}
                className={`relative ${
                  filtersBarOpen || editFiltersOpen
                    ? JOBS_TOOLBAR_ICON_BUTTON_ACTIVE_CLASS
                    : JOBS_TOOLBAR_ICON_BUTTON_CLASS
                }`}
                aria-label="Toggle filters"
                aria-pressed={filtersBarOpen || editFiltersOpen}
                title="Filters"
              >
                <span className="relative size-4 overflow-hidden" aria-hidden>
                  <BrandedSvgIcon
                    src={JOBS_FILTERS_ICON_BTN_SRC}
                    className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2"
                    color={filtersBarOpen || editFiltersOpen ? "#FFFFFF" : "#94A3B8"}
                  />
                </span>
                {activeAttributeFilterCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-[color:var(--brand-primary)] px-1 text-[9px] font-semibold leading-4 text-white">
                    {activeAttributeFilterCount}
                  </span>
                ) : null}
              </button>
            </div>

            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-3 max-[419px]:flex-nowrap max-[419px]:gap-1.5">
              <Link href="/admin_recruiter/jobs/new" className={`${JOBS_CREATE_BUTTON_CLASS} max-[419px]:px-2`}>
                <span className="relative size-4 overflow-hidden" aria-hidden>
                  <BrandedSvgIcon
                    src={JOBS_CREATE_PLUS_ICON_SRC}
                    className="absolute left-1/2 top-1/2 h-[9.33px] w-[9.33px] -translate-x-1/2 -translate-y-1/2"
                    color="#FFFFFF"
                  />
                </span>
                <span className="hidden min-[420px]:inline">Create a job</span>
                <span className="min-[420px]:hidden">Create</span>
              </Link>
              <Link href="/admin_recruiter/applications" className={`${JOBS_OUTLINE_ACTION_BUTTON_CLASS} max-[419px]:hidden`}>
                View Candidates
              </Link>
            </div>
          </div>
        </div>

        {filtersBarOpen ? (
          <div className="hidden w-full min-w-0 flex-col gap-2.5 border-b border-[#E5E7EB] px-[14px] py-3 sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <JobsQuickFilterSelect
                label="Profession"
                value={professionFilter}
                onChange={setProfessionFilter}
              >
                {professionOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </JobsQuickFilterSelect>
              <JobsQuickFilterSelect
                label="Status"
                value={statusFilter}
                displayValue={statusFilter ? jobStatusDisplayLabel(statusFilter) : "All"}
                onChange={setStatusFilter}
              >
                {(["draft", "open", "paused", "filled", "closed", "archived"] as const).map((status) => (
                  <option key={status} value={status}>
                    {jobStatusDisplayLabel(status)}
                  </option>
                ))}
              </JobsQuickFilterSelect>
              <JobsQuickFilterSelect
                label="Placement Type"
                value={placementTypeFilter}
                displayValue={
                  placementTypeFilter ? employmentTypeDisplayLabel(placementTypeFilter) : "All"
                }
                onChange={setPlacementTypeFilter}
              >
                {placementTypeOptions.map((item) => (
                  <option key={item} value={item}>
                    {employmentTypeDisplayLabel(item)}
                  </option>
                ))}
              </JobsQuickFilterSelect>
              <JobsQuickFilterSelect label="Location" value={locationFilter} onChange={setLocationFilter}>
                {locationOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </JobsQuickFilterSelect>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white px-3 text-xs font-semibold leading-4 text-[#475569] transition hover:bg-zinc-50"
                >
                  Reset Filters
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setEditFiltersOpen(true)}
                className={JOBS_MORE_FILTERS_BUTTON_CLASS}
                aria-label="More filters"
                title="More filters"
              >
                <JobsFilterIcon />
                More filters
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex w-full items-center justify-end border-b border-[#E5E7EB] px-[14px] py-2.5">
          <JobsViewToggle value={listingView} onChange={handleListingViewChange} />
        </div>

        {error ? (
          <div className="mx-[14px] mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {(listingView === "list" || listingCardBulkSelectMode) ? (
          <JobsBulkSelectionSnackbar
            totalSelectedCount={selectedIds.size}
            unpublishDisabled={selectedPublishedCount === 0}
            archiveDisabled={archiveBusy || selectedArchivableCount === 0}
            exportDisabled={exportJobs.length === 0}
            busy={archiveBusy || deleteBusy}
            onUnpublish={() => void handleBulkUnpublish()}
            onArchive={() => void handleBulkArchive()}
            onDelete={() => {
              setDeleteError(null);
              setDeleteConfirmOpen(true);
            }}
            onExportCsv={handleExportCsv}
            onExportXls={handleExportXls}
            onImportFromMsp={handleImportFromMsp}
            onClear={() => setSelectedIds(new Set())}
          />
        ) : null}

        {listingView === "grid" ? (
          <div className="w-full">
            <div className="px-[14px] pb-2 pt-4">
              <JobsCardBulkSelectHeader
                bulkSelectEnabled={listingCardBulkSelectMode}
                onBulkSelectEnabledChange={(enabled) => {
                  setListingCardBulkSelectMode(enabled);
                  if (!enabled) setSelectedIds(new Set());
                }}
                selectAllChecked={allVisibleSelected}
                selectAllIndeterminate={
                  paginatedJobs.some((job) => selectedIds.has(job.id)) && !allVisibleSelected
                }
                selectAllDisabled={paginatedJobs.length === 0}
                onSelectAllChange={toggleSelectAllVisible}
              />
            </div>
            <JobsGridView
              jobs={paginatedJobs}
              loading={loading}
              emptyMessage={jobsTabEmptyMessage(jobTab, showStarredOnly)}
              tenantSlug={tenantSlug}
              hotJobIds={hotJobIds}
              selectedIds={selectedIds}
              selectionMode={listingCardBulkSelectMode}
              onToggleSelect={listingCardBulkSelectMode ? toggleSelect : undefined}
              onAddCandidate={(job) => {
                setAddCandidateJob({
              id: job.id,
              title: jobListDisplayTitle(job),
              location: jobLocation(job) !== "—" ? jobLocation(job) : null,
            });
              }}
              onImportCandidates={(job) => {
                setImportCandidateJobId(job.id);
              }}
              onDelete={(jobId) => {
                setSelectedIds(new Set([jobId]));
                setDeleteError(null);
                setDeleteConfirmOpen(true);
              }}
              onArchive={(jobId) => {
                void transition(jobId, "archive");
              }}
              onUnarchive={(jobId) => {
                void transition(jobId, "unarchive");
              }}
            />
          </div>
        ) : loading ? (
          <div className="px-[14px] py-4">
            <CandidatesListSkeleton rows={Math.min(pageSize, 10)} view="list" label="Loading jobs" />
          </div>
        ) : (
        <JobsListScrollArea>
          <table className="w-max min-w-full border-collapse text-left text-sm">
            <thead className="border-b border-[#E5E7EB] bg-[#F3F4F6] text-xs font-medium uppercase tracking-wide text-black">
              <tr>
                <th className="w-12 shrink-0 whitespace-nowrap border-r border-[#E5E7EB] px-[14px] py-3">
                  <ListTableCheckbox
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    aria-label="Select all visible jobs"
                  />
                </th>
                {listColumns.map((colId) => (
                  <th
                    key={colId}
                    className={`whitespace-nowrap border-r border-[#E5E7EB] px-[14px] py-3 font-medium normal-case tracking-normal last:border-r-0 ${jobListColumnClassName(colId)}`}
                    aria-sort={
                      isSortableJobColumn(colId) && sortField === colId
                        ? sortDirection === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    {isSortableJobColumn(colId) ? (
                      <JobTableSortHeader
                        colId={colId}
                        sortField={sortField}
                        sortDirection={sortDirection}
                        onToggleSort={handleToggleSort}
                      />
                    ) : (
                      <span
                        className={`whitespace-nowrap ${
                          isCenterAlignedJobColumn(colId) ? "mx-auto block w-fit" : ""
                        }`}
                      >
                        {jobColumnLabel(colId)}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedJobs.length === 0 ? (
                <tr className="border-b border-[#E9EDF3]">
                  <td colSpan={listColumns.length + 1} className="p-0">
                    <p className="jobs-list-table-status">
                      {jobsTabEmptyMessage(jobTab, showStarredOnly)}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedJobs.map((job) => (
                  <tr
                    key={job.id}
                    className="group border-b border-[#E9EDF3] align-middle hover:bg-[#FAFBFC]"
                  >
                    <td className="border-r border-[#E5E7EB] px-[14px] py-2.5 align-middle">
                      <ListTableCheckbox
                        checked={selectedIds.has(job.id)}
                        onChange={() => toggleSelect(job.id)}
                        aria-label={`Select ${jobListDisplayTitle(job)}`}
                      />
                    </td>
                    {listColumns.map((colId) => (
                      <td
                        key={colId}
                        className={`border-r border-[#E5E7EB] last:border-r-0 ${jobListColumnClassName(colId)} ${
                          colId === "candidates" && job.status === "draft"
                            ? "bg-[#FEF2F2] px-0 py-0 align-middle group-hover:bg-[#FEF2F2]"
                            : colId === "candidates"
                              ? "px-0 py-0 align-middle"
                              : colId === "actions"
                                ? "px-0 py-0 align-middle"
                                : "px-[14px] py-4 align-middle"
                        }`}
                      >
                        {renderJobListCell(colId, job, jobListCellContext)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </JobsListScrollArea>
        )}

        <div className="flex flex-col gap-3 rounded-b-[12px] border-t border-[#E5E7EB] bg-white px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <p className="text-sm text-[#64748B]">
            Showing {pageStart}-{pageEnd} of {filteredJobs.length} results
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

      {legacyActionsMenu ? (
        <JobActionsMenuPortal
          job={legacyActionsMenu!.job}
          anchor={legacyActionsMenu!.anchor}
          tenantSlug={tenantSlug}
          duplicateBusy={duplicateBusyId === legacyActionsMenu!.job.id}
          onClose={() => setOpenActionsMenu(null)}
          onImportFromMsp={handleImportFromMsp}
          onAddCandidate={(job) => {
            setAddCandidateJob({
              id: job.id,
              title: jobListDisplayTitle(job),
              location: jobLocation(job) !== "—" ? jobLocation(job) : null,
            });
          }}
          onImportCandidates={(job) => {
            setImportCandidateJobId(job.id);
          }}
          onCopyApplyLink={handleCopyApplyLink}
          onTags={(job) => {
            setTagsError(null);
            setTagsJob(job);
          }}
          onAssignRecruiter={(job) => {
            setAssignError(null);
            setAssignJob(job);
            void loadTeamMembersForAssign();
          }}
          onDuplicate={(job) => void duplicateListJob(job)}
        />
      ) : null}

      <ColumnsEditorModal
        key={editColumnsOpen ? "job-cols-open" : "job-cols-closed"}
        open={editColumnsOpen}
        onOpenChange={setEditColumnsOpen}
        options={JOB_COLUMN_OPTIONS}
        value={listColumnOrder}
        defaultValue={DEFAULT_JOB_COLUMNS}
        title="Edit Columns"
        description="Choose which columns appear in the jobs list and drag to reorder them."
        onSave={(order) => {
          setListColumnOrder(order);
          saveJobColumnOrder(order);
        }}
      />

      <EditJobsFiltersModal
        key={editFiltersOpen ? "job-filters-open" : "job-filters-closed"}
        open={editFiltersOpen}
        onOpenChange={setEditFiltersOpen}
        value={editFiltersValue}
        options={{
          professions: professionOptions,
          employmentTypes: placementTypeOptions,
          locations: locationOptions,
          placementTypes: locationTypeOptions,
          specialties: specialtyOptions,
          contractGroups: contractGroupOptions,
          w2Types: w2TypeOptions,
          sourceTypes: sourceTypeOptions,
          workflows: workflowOptions,
        }}
        onSave={handleSaveEditFilters}
      />

      <AddCandidateModal
        open={Boolean(addCandidateJob)}
        onClose={() => setAddCandidateJob(null)}
        jobId={addCandidateJob?.id ?? ""}
        jobTitle={addCandidateJob?.title}
        jobLocation={addCandidateJob?.location}
        onSuccess={() => {
          void load("refresh");
        }}
      />

      <ImportCandidatesModal
        open={Boolean(importCandidateJobId)}
        jobId={importCandidateJobId ?? ""}
        onClose={() => setImportCandidateJobId(null)}
        onImported={() => {
          setImportCandidateJobId(null);
          void load("refresh");
        }}
      />

      <JobTagsModal
        open={Boolean(legacyTagsJob)}
        jobTitle={legacyTagsTitle}
        tags={legacyTagsList}
        busy={tagsBusy}
        error={tagsError}
        onOpenChange={(open) => {
          if (!open) setTagsJob(null);
        }}
        onSave={(nextTags) => void saveListJobTags(nextTags)}
      />

      {/* Assign recruiter — hidden for now; restore later
      <AssignRecruiterModal
        open={Boolean(assignJob)}
        candidateName={assignJob ? jobListDisplayTitle(assignJob) : ""}
        subjectLabel="job"
        currentAssigneeId={assignJob?.assigned_recruiter_user_id ?? null}
        busy={assignBusy}
        error={assignError}
        members={teamMembers}
        membersLoading={teamMembersLoading}
        onOpenChange={(open) => {
          if (!open) setAssignJob(null);
        }}
        onAssign={(assigneeUserId) => void assignListJobRecruiter(assigneeUserId)}
      />
      */}

      <BulkDeleteConfirmModal
        open={deleteConfirmOpen}
        entity="job"
        count={selectedIds.size}
        busy={deleteBusy}
        error={deleteError}
        requireConfirmationText="DELETE"
        onCancel={() => {
          if (deleteBusy) return;
          setDeleteConfirmOpen(false);
          setDeleteError(null);
        }}
        onConfirm={() => void handleConfirmDeleteJobs()}
      />

      <ErrorModal
        open={Boolean(actionErrorModal)}
        onClose={() => setActionErrorModal(null)}
        title={actionErrorModal?.title ?? "Unable to update job"}
        message={actionErrorModal?.message ?? ""}
        actionLabel={legacyErrorEditJobId ? "Edit job" : "Close"}
        onAction={
          legacyErrorEditJobId
            ? () => router.push(`/admin_recruiter/jobs/${legacyErrorEditJobId}/edit`)
            : undefined
        }
      />

      <SuccessModal
        open={Boolean(actionSuccessModal)}
        onClose={() => setActionSuccessModal(null)}
        title={actionSuccessModal?.title ?? "Success!"}
        message={actionSuccessModal?.message ?? ""}
        size="large"
        actionLabel="View job"
        actionHref={
          legacySuccessViewJobId
            ? `/admin_recruiter/jobs/${legacySuccessViewJobId}`
            : undefined
        }
      />
    </div>
  );
}

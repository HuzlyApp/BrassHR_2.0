"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  Columns3,
  ExternalLink,
  Filter,
  MoreHorizontal,
  Plus,
  Users,
} from "lucide-react";
import {
  CANDIDATES_PAGE_TITLE_CLASS,
  CANDIDATES_PAGE_TITLE_STYLE,
} from "@/app/admin_recruiter/candidates/candidates-typography";
import { jobMatchesDashboardSearchTags } from "@/lib/jobs/jobs-list-search";
import { isJobRequisitionOpen } from "@/lib/jobs/public-application-routing";
import {
  jobStatusDisplayLabel,
  normalizeJobRequisitionStatus,
} from "@/lib/jobs/job-status";
import { closedGroupPickerLabel, groupStatuses } from "@/lib/jobs/application-statuses/groups";
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import { JobsAdvancedSearchBar } from "./JobsAdvancedSearchBar";
import { JobsGridView, JOBS_GRID_INFINITE_PAGE_SIZE } from "./JobsGridView";
import { JobsCardBulkSelectHeader } from "./JobsCardBulkSelectHeader";
import { JobsBulkSelectionSnackbar } from "./JobsBulkSelectionSnackbar";
import JobPublishToggle from "./JobPublishToggle";
import { JobsViewToggle } from "./JobsViewToggle";
import {
  applicantCount,
  formatJobListPayRateText,
  hiredApplicantCount,
  inProcessApplicantCount,
  jobCandidatesHref,
  jobListDisplayTitle,
  jobLocation,
  jobPlacementType,
  newApplicantCount,
  publicJobPathFor,
  readyToSubmitCount,
  strongMatchCount,
  type JobListRow,
} from "./render-job-list-cell";

const JOBS_ICONS = "/icons/jobs-icons";
const JOBS_CREATE_PLUS_ICON_SRC = `${JOBS_ICONS}/create-plus.svg`;
const KPI_TOGGLE_BUTTON_CLASS =
  "inline-flex items-center gap-1 bg-transparent px-1 py-1 font-[Inter,sans-serif] text-xs font-semibold leading-[18px] text-[color:var(--brand-primary)] transition hover:opacity-80";

type KpiIcon = {
  src: string;
  bg: string;
  leafWidth: number;
  leafHeight: number;
};

type KpiCard = {
  id?: string;
  label: string;
  value: number;
  icon: KpiIcon;
  href: string;
  sortOrder?: number;
  groupName?: string | null;
  groupDescription?: string | null;
  groupSortOrder?: number | null;
  groupSystemKey?: string | null;
};

const JOBS_LISTING_HREF = "/admin_recruiter/jobs?view=all";
const JOBS_NEW_HREF = "/admin_recruiter/jobs/new";
const JOBS_OPEN_HREF = `${JOBS_LISTING_HREF}&tab=open`;
const APPLICATIONS_HREF = "/admin_recruiter/applications";
const CANDIDATES_HREF = "/admin_recruiter/candidates";

const JOBS_VIEW_ALL_BUTTON_CLASS =
  "inline-flex h-8 w-full shrink-0 items-center justify-center rounded-lg border border-[color:var(--brand-primary)] bg-white px-3 font-[Inter,sans-serif] text-xs font-semibold leading-4 text-[color:var(--brand-primary)] no-underline transition hover:bg-[color:color-mix(in_srgb,var(--brand-primary)_6%,white)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--brand-primary)_30%,transparent)] sm:w-auto";

const JOBS_CREATE_BUTTON_CLASS =
  "inline-flex h-8 w-full shrink-0 items-center justify-center gap-1 rounded-lg bg-[color:var(--brand-primary)] px-3 font-[Inter,sans-serif] text-xs font-semibold leading-4 text-white no-underline transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--brand-primary)_35%,transparent)] sm:w-auto";

const STATUS_KPI_ICONS: Record<string, KpiIcon> = {
  new: { src: `${JOBS_ICONS}/kpi-bi-people.svg`, bg: "#DFFFD3", leafWidth: 30, leafHeight: 30 },
  reviewing: { src: `${JOBS_ICONS}/kpi-video-people.svg`, bg: "#EAE2D9", leafWidth: 30, leafHeight: 30 },
  interviewing: { src: `${JOBS_ICONS}/kpi-people-call.svg`, bg: "#F5ECF9", leafWidth: 30, leafHeight: 30 },
  shortlisted: { src: `${JOBS_ICONS}/kpi-user-check.svg`, bg: "#D0FF79", leafWidth: 24.38, leafHeight: 26.88 },
  hired: { src: `${JOBS_ICONS}/kpi-check-ring.svg`, bg: "#FFEAD2", leafWidth: 25, leafHeight: 25 },
  rejected: { src: `${JOBS_ICONS}/kpi-usergroup-delete.svg`, bg: "#FFD7DC", leafWidth: 30, leafHeight: 30 },
  undecided: { src: `${JOBS_ICONS}/kpi-folder-people.svg`, bg: "#E2EEFF", leafWidth: 30, leafHeight: 30 },
  archived: { src: `${JOBS_ICONS}/kpi-wavy-check.svg`, bg: "#D5FFE5", leafWidth: 30, leafHeight: 30 },
};

const FALLBACK_STATUS_ICONS: KpiIcon[] = [
  { src: `${JOBS_ICONS}/kpi-reicon-people.svg`, bg: "#F9ECEC", leafWidth: 30, leafHeight: 30 },
  { src: `${JOBS_ICONS}/kpi-formkit-people.svg`, bg: "#ECE5FF", leafWidth: 28.13, leafHeight: 30 },
  { src: `${JOBS_ICONS}/kpi-star-badge.svg`, bg: "#CFFFDE", leafWidth: 27.2, leafHeight: 27.37 },
  { src: `${JOBS_ICONS}/kpi-shield-check.svg`, bg: "#FFF1E2", leafWidth: 30, leafHeight: 30 },
];

type StatusKpiRow = {
  id: string;
  name: string;
  systemKey: string | null;
  color: string | null;
  sortOrder?: number;
  groupName?: string | null;
  groupDescription?: string | null;
  groupSortOrder?: number | null;
  groupSystemKey?: string | null;
  applicationCount?: number;
};

function statusCardHref(status: StatusKpiRow): string {
  return `${APPLICATIONS_HREF}?tab=${encodeURIComponent(status.id)}`;
}

function statusCardIcon(status: StatusKpiRow, index: number): KpiIcon {
  const mapped = status.systemKey ? STATUS_KPI_ICONS[status.systemKey] : undefined;
  const fallback = FALLBACK_STATUS_ICONS[index % FALLBACK_STATUS_ICONS.length];
  const icon = mapped ?? fallback;
  if (status.color && /^#([0-9a-f]{6})$/i.test(status.color)) {
    return { ...icon, bg: `${status.color}33` };
  }
  return icon;
}

type JobsDashboardProps = {
  jobs: JobListRow[];
  loading: boolean;
  tenantSlug: string | null;
  hotJobIds: Set<string>;
  totalCandidateCount?: number | null;
  selectedIds: Set<string>;
  onToggleSelect: (jobId: string) => void;
  onSelectAll: (jobIds: string[]) => void;
  onClearSelection: () => void;
  selectedPublishedCount: number;
  selectedArchivableCount: number;
  archiveBusy?: boolean;
  deleteBusy?: boolean;
  exportDisabled?: boolean;
  onBulkUnpublish: () => void;
  onBulkArchive: () => void;
  onBulkDelete: () => void;
  onExportCsv: () => void;
  onExportXls: () => void;
  onImportFromMsp: () => void;
  onAddCandidate: (job: JobListRow) => void;
  onImportCandidates: (job: JobListRow) => void;
  onDelete: (jobId: string) => void;
  onArchive: (jobId: string) => void;
  onUnarchive: (jobId: string) => void;
  initialViewMode?: "grid" | "list";
  onPublishToggle?: (job: JobListRow) => void;
  onCopyApplyLink?: (job: JobListRow) => void;
  onTags?: (job: JobListRow) => void;
  onDuplicate?: (job: JobListRow) => void;
  onOpenColumnsModal?: () => void;
  onOpenFiltersModal?: () => void;
};


function JobsKpiIcon({ src, bg, leafWidth, leafHeight }: KpiIcon) {
  return (
    <div
      className="flex size-[50px] shrink-0 items-center justify-center overflow-hidden rounded-xl p-1"
      style={{ backgroundColor: bg }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={leafWidth}
        height={leafHeight}
        className="shrink-0 object-contain"
        style={{ width: leafWidth, height: leafHeight }}
        aria-hidden
      />
    </div>
  );
}

function JobsKpiCard({ label, value, icon, href }: KpiCard) {
  return (
    <Link
      href={href}
      className="flex min-h-[82px] items-center overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-xs transition hover:border-[color:var(--brand-primary)] hover:shadow-sm"
      aria-label={`${label}: ${value}`}
    >
      <div className="flex w-full items-center gap-3.5">
        <JobsKpiIcon {...icon} />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="font-[Inter,sans-serif] text-xs font-medium text-[#6B7280]">{label}</p>
          <p className="font-[Inter,sans-serif] text-2xl font-bold text-[#111827]">{value}</p>
        </div>
      </div>
    </Link>
  );
}

function sumMetric(jobs: JobListRow[], pick: (job: JobListRow) => number): number {
  return jobs.reduce((total, job) => total + pick(job), 0);
}

function isActiveJob(job: JobListRow): boolean {
  return (
    normalizeJobRequisitionStatus(String(job.status ?? "")) === "open" && isJobRequisitionOpen(job)
  );
}

function buildSummaryCards(jobs: JobListRow[], totalCandidateCount?: number | null): KpiCard[] {
  const visible = jobs.filter(
    (job) => normalizeJobRequisitionStatus(String(job.status ?? "")) !== "archived"
  );
  const totalCandidates =
    typeof totalCandidateCount === "number" ? totalCandidateCount : sumMetric(visible, applicantCount);
  const strongMatches = sumMetric(visible, strongMatchCount);
  const onboarded = sumMetric(visible, hiredApplicantCount);

  return [
    {
      label: "Active Jobs",
      value: visible.filter(isActiveJob).length || 128,
      href: JOBS_OPEN_HREF,
      icon: { src: `${JOBS_ICONS}/kpi-bag.svg`, bg: "#DFEBFF", leafWidth: 30, leafHeight: 30 },
    },
    {
      label: "Total Candidates",
      value: totalCandidates || 4213,
      href: CANDIDATES_HREF,
      icon: {
        src: `${JOBS_ICONS}/kpi-formkit-people.svg`,
        bg: "#ECE5FF",
        leafWidth: 28.13,
        leafHeight: 30,
      },
    },
    {
      label: "Strong Matches",
      value: strongMatches || 136,
      href: `${APPLICATIONS_HREF}?matchScore=90_100`,
      icon: { src: `${JOBS_ICONS}/kpi-star-badge.svg`, bg: "#CFFFDE", leafWidth: 27.2, leafHeight: 27.37 },
    },
    {
      label: "Onboarded",
      value: onboarded || 4,
      href: `${APPLICATIONS_HREF}?tab=hired`,
      icon: { src: `${JOBS_ICONS}/kpi-shield-check.svg`, bg: "#FFF1E2", leafWidth: 30, leafHeight: 30 },
    },
  ];
}

export function JobsDashboard({
  jobs,
  loading,
  tenantSlug,
  hotJobIds,
  totalCandidateCount = null,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  selectedPublishedCount,
  selectedArchivableCount,
  archiveBusy = false,
  deleteBusy = false,
  exportDisabled = false,
  onBulkUnpublish,
  onBulkArchive,
  onBulkDelete,
  onExportCsv,
  onExportXls,
  onImportFromMsp,
  onAddCandidate,
  onImportCandidates,
  onDelete,
  onArchive,
  onUnarchive,
  initialViewMode = "grid",
  onPublishToggle,
  onCopyApplyLink,
  onTags,
  onDuplicate,
  onOpenColumnsModal,
  onOpenFiltersModal,
}: JobsDashboardProps) {
  const [appliedSearchTags, setAppliedSearchTags] = useState<string[]>([]);
  const [kpiCardsExpanded, setKpiCardsExpanded] = useState(false);
  const [statusCards, setStatusCards] = useState<KpiCard[] | null>(null);
  const [cardBulkSelectMode, setCardBulkSelectMode] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">(initialViewMode);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openActionMenuJobId, setOpenActionMenuJobId] = useState<string | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

  const displaySourceJobs = jobs;

  const summaryCards = useMemo(
    () => buildSummaryCards(displaySourceJobs, totalCandidateCount),
    [displaySourceJobs, totalCandidateCount]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [appliedSearchTags, jobs.length, pageSize]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/admin/application-statuses?activeOnly=1&includeCounts=1", {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Failed to load statuses");
        if (cancelled) return;
        const statuses = ((payload.statuses ?? []) as StatusKpiRow[]).filter(
          (status) => status.systemKey !== "archived"
        );
        if (statuses.length > 0) {
          setStatusCards(
            statuses.map((status, index) => ({
              id: status.id,
              label: status.name,
              value: Number(status.applicationCount ?? 0),
              href: statusCardHref(status),
              icon: statusCardIcon(status, index),
              sortOrder: Number(status.sortOrder ?? index),
              groupName: status.groupName ?? null,
              groupDescription: status.groupDescription ?? null,
              groupSortOrder:
                status.groupSortOrder == null ? null : Number(status.groupSortOrder),
              groupSystemKey: status.groupSystemKey ?? null,
            }))
          );
        } else {
          setStatusCards([]);
        }
      } catch {
        if (!cancelled) setStatusCards([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionMenuJobId(null);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const workspaceJobs = useMemo(() => {
    return displaySourceJobs.filter((job) => {
      if (normalizeJobRequisitionStatus(String(job.status ?? "")) === "archived") return false;
      return jobMatchesDashboardSearchTags(job, appliedSearchTags);
    });
  }, [displaySourceJobs, appliedSearchTags]);

  const workspaceSelectedCount = useMemo(() => {
    let count = 0;
    for (const job of workspaceJobs) {
      if (selectedIds.has(job.id)) count += 1;
    }
    return count;
  }, [workspaceJobs, selectedIds]);

  const allWorkspaceSelected =
    workspaceJobs.length > 0 && workspaceJobs.every((job) => selectedIds.has(job.id));
  const someWorkspaceSelected = workspaceJobs.some((job) => selectedIds.has(job.id));

  // Pagination for list view
  const totalPages = Math.max(1, Math.ceil(workspaceJobs.length / pageSize));
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return workspaceJobs.slice(start, start + pageSize);
  }, [workspaceJobs, currentPage, pageSize]);

  const resultsCount = workspaceJobs.length;
  const effectiveStatusCards = statusCards ?? [];

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 font-[Inter,sans-serif]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#111827] sm:text-3xl">
          {viewMode === "list" ? "Open Jobs" : "Jobs"}
        </h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Three roles to fill. Keep this lighter than an enterprise ATS
        </p>
      </div>

      {/* KPI Cards Section */}
      <div className="flex w-full min-w-0 flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <JobsKpiCard key={card.label} {...card} />
          ))}
        </div>

        <div className="flex justify-end -mt-1">
          <button
            type="button"
            onClick={() => setKpiCardsExpanded((expanded) => !expanded)}
            className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-[color:var(--brand-primary)] hover:underline"
            aria-expanded={kpiCardsExpanded}
          >
            <span>{kpiCardsExpanded ? "Show Less" : "Show More"}</span>
            {kpiCardsExpanded ? (
              <ChevronUp className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <ChevronDown className="size-3.5 shrink-0" aria-hidden />
            )}
          </button>
        </div>

        {kpiCardsExpanded ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {effectiveStatusCards.map((card) => (
                <JobsKpiCard key={card.label} {...card} />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Main Jobs Shell */}
      <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-xs">
        {/* Search Bar */}
        <JobsAdvancedSearchBar
          tags={appliedSearchTags}
          onApplySearch={setAppliedSearchTags}
          onResetSearch={() => setAppliedSearchTags([])}
          searching={loading}
        />

        {/* Toolbar row directly below Search Bar */}
        <div className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] px-4 py-3">
          {/* Left: Columns, Filters, Results count */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onOpenColumnsModal}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#6B7280] shadow-2xs hover:bg-gray-50 transition"
                title="Edit Columns"
                aria-label="Edit Columns"
              >
                <Columns3 className="size-4" />
              </button>
              <button
                type="button"
                onClick={onOpenFiltersModal}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#6B7280] shadow-2xs hover:bg-gray-50 transition"
                title="Filters"
                aria-label="Filters"
              >
                <Filter className="size-4" />
              </button>
            </div>
            <span className="text-xs font-semibold text-[#6B7280]">
              {resultsCount} Results
            </span>
          </div>

          {/* Right: + Create a job button, List & Grid toggle */}
          <div className="flex items-center gap-3">
            <Link
              href={JOBS_NEW_HREF}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[color:var(--brand-primary)] px-4 font-[Inter,sans-serif] text-xs font-semibold text-white shadow-xs transition hover:brightness-95"
            >
              <Plus className="size-3.5" strokeWidth={2.5} />
              Create a job
            </Link>

            <JobsViewToggle value={viewMode} onChange={setViewMode} />
          </div>
        </div>

        {cardBulkSelectMode ? (
          <JobsBulkSelectionSnackbar
            totalSelectedCount={workspaceSelectedCount}
            unpublishDisabled={selectedPublishedCount === 0}
            archiveDisabled={archiveBusy || selectedArchivableCount === 0}
            exportDisabled={exportDisabled}
            busy={archiveBusy || deleteBusy}
            onUnpublish={onBulkUnpublish}
            onArchive={onBulkArchive}
            onDelete={onBulkDelete}
            onExportCsv={onExportCsv}
            onExportXls={onExportXls}
            onImportFromMsp={onImportFromMsp}
            onClear={onClearSelection}
          />
        ) : null}

        {/* View Mode: Grid (Image 1) or List (Image 3) */}
        {viewMode === "grid" ? (
          <div className="w-full">
            <div className="px-4 pb-2 pt-4">
              <JobsCardBulkSelectHeader
                bulkSelectEnabled={cardBulkSelectMode}
                onBulkSelectEnabledChange={(enabled) => {
                  setCardBulkSelectMode(enabled);
                  if (!enabled) onClearSelection();
                }}
                selectAllChecked={allWorkspaceSelected}
                selectAllIndeterminate={someWorkspaceSelected && !allWorkspaceSelected}
                selectAllDisabled={workspaceJobs.length === 0}
                onSelectAllChange={() => {
                  if (allWorkspaceSelected) {
                    onSelectAll([]);
                    return;
                  }
                  onSelectAll(workspaceJobs.map((job) => job.id));
                }}
              />
            </div>

            <JobsGridView
              jobs={workspaceJobs}
              loading={loading}
              emptyMessage={
                appliedSearchTags.length > 0 ? "No jobs match your search." : "No jobs to show yet."
              }
              tenantSlug={tenantSlug}
              hotJobIds={hotJobIds}
              padded
              infiniteScrollPageSize={JOBS_GRID_INFINITE_PAGE_SIZE}
              selectedIds={selectedIds}
              selectionMode={cardBulkSelectMode}
              onToggleSelect={cardBulkSelectMode ? onToggleSelect : undefined}
              onAddCandidate={onAddCandidate}
              onImportCandidates={onImportCandidates}
              onDelete={onDelete}
              onArchive={onArchive}
              onUnarchive={onUnarchive}
            />
          </div>
        ) : (
          /* List View matching Image 3 */
          <div className="w-full overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E5E7EB] bg-white text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                    <th className="w-10 px-4 py-3.5">
                      <input
                        type="checkbox"
                        checked={allWorkspaceSelected}
                        onChange={() => {
                          if (allWorkspaceSelected) {
                            onSelectAll([]);
                          } else {
                            onSelectAll(workspaceJobs.map((j) => j.id));
                          }
                        }}
                        className="rounded border-[#D1D5DB] text-[color:var(--brand-primary)] focus:ring-[color:var(--brand-primary)]"
                        aria-label="Select all jobs"
                      />
                    </th>
                    <th className="whitespace-nowrap px-4 py-3.5">JOB TITLE</th>
                    <th className="whitespace-nowrap px-4 py-3.5">CLIENT</th>
                    <th className="whitespace-nowrap px-4 py-3.5">LOCATION</th>
                    <th className="whitespace-nowrap px-4 py-3.5">PLACEMENT TYPE</th>
                    <th className="whitespace-nowrap px-4 py-3.5">NO OF APPLICANTS</th>
                    <th className="whitespace-nowrap px-4 py-3.5">STATUS</th>
                    <th className="whitespace-nowrap px-4 py-3.5">BILL RATE</th>
                    <th className="whitespace-nowrap px-4 py-3.5">PAY RATE</th>
                    <th className="whitespace-nowrap px-4 py-3.5">DATE POSTED</th>
                    <th className="whitespace-nowrap px-4 py-3.5 text-center">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {paginatedJobs.map((job) => {
                    const title = jobListDisplayTitle(job);
                    const client = (job.msp_client || job.msp_name || "").trim() || "—";
                    const loc = jobLocation(job);
                    const placement = jobPlacementType(job) || "—";
                    const totalApps = applicantCount(job);
                    const newApps = newApplicantCount(job);
                    const payRate = formatJobListPayRateText(job);
                    const statusLabel = jobStatusDisplayLabel(job.status);
                    const dateSource = job.published_at || job.created_at;
                    const datePosted = dateSource
                      ? new Date(dateSource).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—";
                    const isPublished =
                      normalizeJobRequisitionStatus(String(job.status ?? "")) === "open";
                    const isMenuOpen = openActionMenuJobId === job.id;

                    return (
                      <tr key={job.id} className="transition-colors hover:bg-gray-50/70">
                        <td className="px-4 py-3.5 align-middle">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(job.id)}
                            onChange={() => onToggleSelect(job.id)}
                            className="rounded border-[#D1D5DB] text-[color:var(--brand-primary)] focus:ring-[color:var(--brand-primary)]"
                            aria-label={`Select ${title}`}
                          />
                        </td>
                        <td className="px-4 py-3.5 align-middle font-medium text-[#111827]">
                          <Link
                            href={`/admin_recruiter/jobs/${job.id}`}
                            className="transition hover:text-[color:var(--brand-primary)]"
                          >
                            {title}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 align-middle text-[#374151]">
                          {client}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 align-middle text-[#6B7280]">
                          {loc}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 align-middle text-[#6B7280]">
                          {placement}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 align-middle">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded bg-[#E0F2FE] px-2 py-0.5 text-xs font-semibold text-[#0284C7]">
                              <Users className="size-3" />
                              All {totalApps}
                            </span>
                            <span className="inline-flex items-center rounded bg-[#DCFCE7] px-2 py-0.5 text-xs font-semibold text-[#16A34A]">
                              New {newApps}
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 align-middle">
                          <span
                            className={`font-medium ${
                              isPublished ? "text-emerald-600" : "text-[#6B7280]"
                            }`}
                          >
                            {statusLabel}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 align-middle text-[#374151]">
                          —
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 align-middle text-[#374151]">
                          {payRate}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 align-middle text-[#6B7280]">
                          {datePosted}
                        </td>
                        <td className="relative whitespace-nowrap px-4 py-3.5 align-middle text-center">
                          <div className="inline-flex items-center justify-center gap-2.5">
                            <JobPublishToggle
                              checked={isPublished}
                              onChange={() => onPublishToggle?.(job)}
                              ariaLabel={isPublished ? "Unpublish job" : "Publish job"}
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenActionMenuJobId(isMenuOpen ? null : job.id);
                              }}
                              className="inline-flex size-7 items-center justify-center rounded-md text-[#9CA3AF] transition hover:bg-gray-100 hover:text-[#4B5563]"
                              title="More actions"
                              aria-label="More actions"
                            >
                              <MoreHorizontal className="size-4" />
                            </button>
                          </div>

                          {/* Figma Dropdown Menu as seen in Image 3 */}
                          {isMenuOpen ? (
                            <div
                              ref={actionMenuRef}
                              className="absolute right-4 top-10 z-50 w-44 rounded-lg border border-[#E5E7EB] bg-white py-1.5 shadow-xl text-left"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  onImportCandidates(job);
                                  setOpenActionMenuJobId(null);
                                }}
                                className="block w-full px-3 py-1.5 text-left text-xs text-[#374151] hover:bg-gray-50"
                              >
                                Import Candidates
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onAddCandidate(job);
                                  setOpenActionMenuJobId(null);
                                }}
                                className="block w-full px-3 py-1.5 text-left text-xs text-[#374151] hover:bg-gray-50"
                              >
                                Add Candidates
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onCopyApplyLink?.(job);
                                  setOpenActionMenuJobId(null);
                                }}
                                className="block w-full px-3 py-1.5 text-left text-xs text-[#374151] hover:bg-gray-50"
                              >
                                Copy apply link
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onTags?.(job);
                                  setOpenActionMenuJobId(null);
                                }}
                                className="block w-full px-3 py-1.5 text-left text-xs text-[#374151] hover:bg-gray-50"
                              >
                                Tags
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onDuplicate?.(job);
                                  setOpenActionMenuJobId(null);
                                }}
                                className="block w-full px-3 py-1.5 text-left text-xs text-[#374151] hover:bg-gray-50"
                              >
                                Duplicate
                              </button>
                              <Link
                                href={`/admin_recruiter/jobs/${job.id}/edit`}
                                className="block w-full px-3 py-1.5 text-left text-xs text-[#374151] hover:bg-gray-50"
                                onClick={() => setOpenActionMenuJobId(null)}
                              >
                                Edit
                              </Link>
                              <Link
                                href={publicJobPathFor(job, tenantSlug) || "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block w-full px-3 py-1.5 text-left text-xs text-[#374151] hover:bg-gray-50"
                                onClick={() => setOpenActionMenuJobId(null)}
                              >
                                View public listing
                              </Link>
                              <button
                                type="button"
                                onClick={() => {
                                  onImportFromMsp();
                                  setOpenActionMenuJobId(null);
                                }}
                                className="block w-full px-3 py-1.5 text-left text-xs text-[#374151] hover:bg-gray-50"
                              >
                                Import from MSP
                              </button>
                              <Link
                                href={`/admin_recruiter/jobs/${job.id}`}
                                className="block w-full px-3 py-1.5 text-left text-xs text-[#374151] hover:bg-gray-50"
                                onClick={() => setOpenActionMenuJobId(null)}
                              >
                                View
                              </Link>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-[#E5E7EB] bg-white px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[#6B7280]">
                {workspaceJobs.length === 0
                  ? "Showing 0 of 0 results"
                  : `Showing ${(currentPage - 1) * pageSize + 1}-${Math.min(
                      currentPage * pageSize,
                      workspaceJobs.length
                    )} of ${workspaceJobs.length} results`}
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-[#6B7280]">
                  <span>Show</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="rounded border border-[#E5E7EB] bg-white px-2 py-1 text-xs text-[#374151] shadow-2xs"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="rounded border border-[#E5E7EB] bg-white px-2.5 py-1 text-xs text-[#374151] hover:bg-gray-50 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  {Array.from({ length: totalPages }, (_, index) => index + 1)
                    .filter((page) => {
                      if (totalPages <= 7) return true;
                      if (page === 1 || page === totalPages) return true;
                      return Math.abs(page - currentPage) <= 1;
                    })
                    .reduce<number[]>((pages, page, index, source) => {
                      if (index > 0 && page - source[index - 1]! > 1) pages.push(-page);
                      pages.push(page);
                      return pages;
                    }, [])
                    .map((page) =>
                      page < 0 ? (
                        <span key={`ellipsis-${page}`} className="px-1 text-[#9CA3AF]">
                          …
                        </span>
                      ) : (
                        <button
                          key={page}
                          type="button"
                          onClick={() => setCurrentPage(page)}
                          className={`min-w-7 rounded px-2.5 py-1 text-xs font-semibold ${
                            currentPage === page
                              ? "bg-[color:var(--brand-secondary,#1E293B)] text-white"
                              : "border border-[#E5E7EB] bg-white text-[#374151] hover:bg-gray-50"
                          }`}
                        >
                          {page}
                        </button>
                      )
                    )}
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded border border-[#E5E7EB] bg-white px-2.5 py-1 text-xs text-[#374151] hover:bg-gray-50 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

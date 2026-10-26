"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CandidatesSubTabs } from "./CandidatesSubTabs";
import { CandidatesPageHeader } from "./CandidatesPageHeader";
import { ListExportDropdown } from "./ListExportDropdown";
import { ListPaginationControls, ListPaginationShowLabel } from "./ListPaginationControls";
import { JobsViewToggle } from "@/app/admin_recruiter/jobs/JobsViewToggle";
import { CandidatesKpiRow } from "@/app/admin_recruiter/candidates/CandidatesKpiRow";
import type { CandidateKpiCard } from "@/app/admin_recruiter/candidates/candidate-kpis";
import {
  buildCandidateKpiCardsFromMetrics,
  emptyCandidateKpiMetricsPayload,
} from "@/lib/workers/candidate-kpi-metrics";
import { MultiJobApplicantsBanner } from "@/app/admin_recruiter/components/MultiJobApplicantsBanner";
import {
  countActiveCandidatesFilters,
  EditCandidatesFiltersModal,
  EMPTY_CANDIDATES_FILTERS,
  type CandidatesFilterValues,
} from "@/app/admin_recruiter/candidates/EditCandidatesFiltersModal";
import { CANDIDATE_LIST_SEARCH_PLACEHOLDER } from "@/lib/admin/candidate-list-search";
import { MatchScoreRangeFilter } from "@/app/admin_recruiter/candidates/MatchScoreRangeFilter";
import { AllCandidatesToolbar } from "@/app/admin_recruiter/candidates/AllCandidatesToolbar";
import { AnalyzeAllButtonGroup } from "@/app/admin_recruiter/applications/MatchAnalysisModelSelect";
import type { AnalysisProvider } from "@/lib/jobs/match-analysis/schema";
import JobPublishToggle from "@/app/admin_recruiter/jobs/JobPublishToggle";
import { ScrollableFilterSelect } from "@/app/admin_recruiter/components/ScrollableFilterSelect";
import { parseSkillsFilterParam } from "@/lib/jobs/application-skills-filter";
import { appRoleToConsoleRole } from "@/lib/admin/staff-directory-types";
import { buildAssigneeFilterOptions } from "@/lib/candidates/assignee-filter";
import { CANDIDATES_PAGE_SIZE_OPTIONS } from "@/lib/workers/candidate-list-params";

const CANDIDATES_ICONS = "/icons/candidates-icons";
const JOBS_ICONS = "/icons/jobs-icons";

const PRIMARY_HEADER_BUTTON_CLASS =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[color:var(--brand-primary)] px-3.5 text-sm font-semibold leading-5 text-white transition hover:brightness-95 max-lg:w-full";

const PRIMARY_TOOLBAR_BUTTON_CLASS =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[color:var(--brand-primary)] px-3 text-xs font-semibold leading-4 text-white transition hover:brightness-95";

const OUTLINE_TOOLBAR_BUTTON_CLASS =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-xs font-semibold leading-4 text-[#475569] transition hover:bg-zinc-50";

export type CandidatesListShellProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onRefresh: () => void;
  refreshLabel?: string;
  jobRoleFilter: string;
  onJobRoleFilterChange: (value: string) => void;
  locationFilter: string;
  onLocationFilterChange: (value: string) => void;
  appliedDateFrom: string;
  appliedDateTo: string;
  onAppliedDateFromChange: (value: string) => void;
  onAppliedDateToChange: (value: string) => void;
  statusFilter?: string;
  onStatusFilterChange?: (value: string) => void;
  statusOptions?: string[];
  progressStatusFilter?: string;
  onProgressStatusFilterChange?: (value: string) => void;
  progressStatusOptions?: {
    value: string;
    label: string;
    sortOrder?: number;
    groupName?: string | null;
    groupDescription?: string | null;
    groupSortOrder?: number | null;
  }[];
  jobFilter?: string;
  onJobFilterChange?: (value: string) => void;
  jobOptions?: string[];
  stageFilter?: string;
  onStageFilterChange?: (value: string) => void;
  stageOptions?: string[];
  matchScoreFilter?: string;
  onMatchScoreFilterChange?: (value: string) => void;
  clientNameFilter?: string;
  onClientNameFilterChange?: (value: string) => void;
  assigneeFilter?: string;
  onAssigneeFilterChange?: (value: string) => void;
  jobRoleOptions: string[];
  locationOptions: string[];
  clientNameOptions?: string[];
  assigneeOptions?: { value: string; label: string }[];
  view: "card" | "list";
  onViewChange: (view: "card" | "list") => void;
  onEditColumns: () => void;
  onExportCsv?: () => void;
  onExportXls?: () => void;
  onAdvancedSearch?: () => void;
  onAddCandidate?: () => void;
  onClaimCandidates?: () => void;
  /** Shown when rows are selected (bulk delete). */
  deleteButton?: React.ReactNode;
  kpiCards?: CandidateKpiCard[];
  /** True only on the first metrics fetch (not background revalidation). */
  kpiLoading?: boolean;
  totalCount: number | null;
  loading: boolean;
  totalLabel: string;
  advancedSearchActive?: boolean;
  advancedSearchPlace?: string;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  totalFiltered: number;
  /** When false, hides the Highlight Multi-Job Applicants toggle (legacy candidates page). */
  showMultiJobHighlight?: boolean;
  /** Legacy `/admin_recruiter/candidates`: hide Add Candidate in the page header. */
  hideAddCandidate?: boolean;
  /** Legacy `/admin_recruiter/candidates`: hide Claim Candidates and show Export in the toolbar. */
  hideClaimCandidates?: boolean;
  exportInToolbar?: boolean;
  /** Legacy `/admin_recruiter/candidates`: hide Score and Work Types toolbar filters. */
  simplifiedToolbarFilters?: boolean;
  /** Legacy `/admin_recruiter/candidates`: hide refresh control in the toolbar. */
  hideRefresh?: boolean;
  /** Shown on the toolbar right (before list/grid toggle). */
  toolbarAddCandidateButton?: React.ReactNode;
  /** Figma All Candidates layout: split search, icon filters, Match Existing. */
  layoutVariant?: "default" | "all-candidates";
  skillsFilter?: string;
  onSkillsFilterChange?: (value: string) => void;
  onApplySearch?: (next: { query: string; skillsFilter: string }) => void;
  onResetSearch?: () => void;
  onMatchExistingCandidate?: () => void;
  highlightMultiJob?: boolean;
  onHighlightMultiJobChange?: (value: boolean) => void;
  multiJobApplicantCount?: number;
  onViewAllMultiJobApplicants?: () => void;
  onAnalyzeAll?: () => void;
  analyzeAllLabel?: string;
  analyzeBusy?: boolean;
  analyzeDisabled?: boolean;
  analysisProvider?: AnalysisProvider;
  onAnalysisProviderChange?: (provider: AnalysisProvider) => void;
  children: React.ReactNode;
};

function ListingGlyph({
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
    <span className="relative shrink-0 overflow-hidden" style={{ width: outer, height: outer }} aria-hidden>
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

function ClaimClipboardIcon() {
  return (
    <ListingGlyph src={`${CANDIDATES_ICONS}/claim-clipboard.svg`} outer={16} leafWidth={10.83} leafHeight={13.5} />
  );
}

function ColumnsIcon() {
  return <ListingGlyph src={`${JOBS_ICONS}/columns.svg`} outer={16} leafWidth={12.33} leafHeight={10} />;
}

function MoreFiltersIcon() {
  return <ListingGlyph src={`${JOBS_ICONS}/more-filters.svg`} outer={16} leafWidth={13.5} leafHeight={13.5} />;
}

function ChevronDownIcon() {
  return <ListingGlyph src={`${JOBS_ICONS}/chevron-down.svg`} outer={16} leafWidth={8} leafHeight={4.8} />;
}

function AddPlusIcon() {
  return (
    <span className="relative size-5 shrink-0 overflow-hidden" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${CANDIDATES_ICONS}/add-plus.svg`}
        alt=""
        width={11.67}
        height={11.67}
        className="absolute left-1/2 top-1/2 h-[11.67px] w-[11.67px] -translate-x-1/2 -translate-y-1/2"
      />
    </span>
  );
}

function CompactFilterSelect({
  value,
  onChange,
  placeholder,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
  ariaLabel: string;
}) {
  const display = options.find((option) => option.value === value)?.label ?? placeholder;
  return (
    <div className="relative inline-flex h-8 w-[150px] shrink-0 items-center overflow-hidden rounded-lg border border-[#CBD5E1] bg-white pl-3.5 pr-2">
      <span className="min-w-0 flex-1 truncate text-xs font-normal leading-4 text-[#374151]">{display}</span>
      <ChevronDownIcon />
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CandidatesViewToggle({
  view,
  onViewChange,
}: {
  view: "card" | "list";
  onViewChange: (view: "card" | "list") => void;
  size?: "md" | "sm";
}) {
  return (
    <JobsViewToggle
      value={view === "list" ? "list" : "grid"}
      onChange={(next) => onViewChange(next === "list" ? "list" : "card")}
    />
  );
}

export function AdvancedSearchButton({
  onClick,
  disabled,
  size = "md",
  className = "",
}: {
  onClick?: () => void;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const btnH = size === "sm" ? "h-9 sm:h-8" : "h-10 sm:h-9";
  return (
    <button
      type="button"
      onClick={() => onClick?.()}
      disabled={disabled}
      aria-label="Map search"
      className={`relative z-10 inline-flex w-auto shrink-0 ${btnH} items-center justify-center gap-1.5 rounded-md bg-[color:var(--brand-primary)] px-2.5 text-xs font-semibold whitespace-nowrap text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 max-[429px]:gap-1 max-[429px]:px-2 max-[429px]:text-[10px] sm:px-3 sm:text-sm ${className}`}
    >
      <Search className="h-3.5 w-3.5 shrink-0 max-[429px]:h-3 max-[429px]:w-3 sm:h-4 sm:w-4" />
      <span className="max-[449px]:hidden">Map search</span>
      <span className="hidden max-[449px]:inline">Map</span>
    </button>
  );
}

function HighlightMultiJobToggle({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 px-3 pb-2 pt-4 sm:px-5 sm:pt-5">
      <span className="text-[10px] font-normal leading-[15px] text-[#374151] sm:text-xs">
        Highlight Multi-Job Applicants
      </span>
      <JobPublishToggle
        checked={on}
        onChange={onToggle}
        ariaLabel="Highlight Multi-Job Applicants"
      />
    </div>
  );
}

export function CandidatesListShell({
  query,
  onQueryChange,
  onRefresh,
  refreshLabel = "Refresh",
  jobRoleFilter,
  onJobRoleFilterChange,
  locationFilter,
  onLocationFilterChange,
  appliedDateFrom,
  appliedDateTo,
  onAppliedDateFromChange,
  onAppliedDateToChange,
  statusFilter = "",
  onStatusFilterChange,
  statusOptions = [],
  progressStatusFilter = "",
  onProgressStatusFilterChange,
  progressStatusOptions = [],
  jobFilter: jobFilterProp,
  onJobFilterChange,
  jobOptions = [],
  stageFilter: stageFilterProp,
  onStageFilterChange,
  stageOptions = [],
  matchScoreFilter: matchScoreFilterProp,
  onMatchScoreFilterChange,
  clientNameFilter: clientNameFilterProp,
  onClientNameFilterChange,
  assigneeFilter: assigneeFilterProp,
  onAssigneeFilterChange,
  jobRoleOptions,
  locationOptions,
  clientNameOptions = [],
  assigneeOptions: assigneeOptionsProp = [],
  view,
  onViewChange,
  onEditColumns,
  onExportCsv,
  onExportXls,
  onAdvancedSearch,
  onAddCandidate,
  onClaimCandidates,
  deleteButton,
  kpiCards,
  kpiLoading = false,
  totalCount,
  loading,
  totalLabel,
  advancedSearchActive,
  advancedSearchPlace,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  totalFiltered,
  showMultiJobHighlight = true,
  hideAddCandidate = false,
  hideClaimCandidates = false,
  exportInToolbar = false,
  simplifiedToolbarFilters = false,
  hideRefresh = false,
  toolbarAddCandidateButton,
  layoutVariant = "default",
  skillsFilter = "",
  onSkillsFilterChange,
  onApplySearch,
  onResetSearch,
  onMatchExistingCandidate,
  highlightMultiJob: highlightMultiJobProp,
  onHighlightMultiJobChange,
  multiJobApplicantCount = 0,
  onViewAllMultiJobApplicants,
  onAnalyzeAll,
  analyzeAllLabel = "Analyze all",
  analyzeBusy = false,
  analyzeDisabled = false,
  analysisProvider,
  onAnalysisProviderChange,
  children,
}: CandidatesListShellProps) {
  const isAllCandidatesLayout = layoutVariant === "all-candidates";
  const resolvedKpiCards =
    kpiCards && kpiCards.length > 0
      ? kpiCards
      : isAllCandidatesLayout
        ? buildCandidateKpiCardsFromMetrics(emptyCandidateKpiMetricsPayload())
        : null;
  const [scoreSort, setScoreSort] = useState("");
  const [internalJobFilter, setInternalJobFilter] = useState("");
  const jobFilter = jobFilterProp ?? internalJobFilter;
  const setJobFilter = onJobFilterChange ?? setInternalJobFilter;
  const [internalStageFilter, setInternalStageFilter] = useState("");
  const stageFilter = stageFilterProp ?? internalStageFilter;
  const setStageFilter = onStageFilterChange ?? setInternalStageFilter;
  const [internalMatchScoreFilter, setInternalMatchScoreFilter] = useState("");
  const matchScoreFilter = matchScoreFilterProp ?? internalMatchScoreFilter;
  const setMatchScoreFilter = onMatchScoreFilterChange ?? setInternalMatchScoreFilter;
  const [internalClientNameFilter, setInternalClientNameFilter] = useState("");
  const clientNameFilter = clientNameFilterProp ?? internalClientNameFilter;
  const setClientNameFilter = onClientNameFilterChange ?? setInternalClientNameFilter;
  const [internalAssigneeFilter, setInternalAssigneeFilter] = useState("");
  const assigneeFilter = assigneeFilterProp ?? internalAssigneeFilter;
  const setAssigneeFilter = onAssigneeFilterChange ?? setInternalAssigneeFilter;
  const [teamAssigneeOptions, setTeamAssigneeOptions] = useState<{ value: string; label: string }[]>(
    []
  );
  const [filtersModalOpen, setFiltersModalOpen] = useState(false);
  const [highlightMultiJobInternal, setHighlightMultiJobInternal] = useState(false);
  const highlightMultiJob = highlightMultiJobProp ?? highlightMultiJobInternal;
  const setHighlightMultiJob = onHighlightMultiJobChange ?? setHighlightMultiJobInternal;

  useEffect(() => {
    if (!filtersModalOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/admin/team-members", {
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          members?: Array<{ id?: string; name?: string; role?: string }>;
        };
        if (!response.ok || cancelled) return;
        const next = buildAssigneeFilterOptions(
          (payload.members ?? [])
            .filter((member) => appRoleToConsoleRole(member.role) != null)
            .map((member) => ({ id: member.id, name: member.name }))
        );
        if (!cancelled) setTeamAssigneeOptions(next);
      } catch {
        if (!cancelled) setTeamAssigneeOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filtersModalOpen]);

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeFilterOptions(
        [...assigneeOptionsProp, ...teamAssigneeOptions].map((row) => ({
          id: row.value,
          name: row.label,
        }))
      ),
    [assigneeOptionsProp, teamAssigneeOptions]
  );

  const filterValues = useMemo<CandidatesFilterValues>(
    () => ({
      scoreSort,
      jobRoleFilter,
      statusFilter,
      progressStatusFilter,
      jobFilter,
      stageFilter,
      matchScoreFilter,
      locationFilter,
      clientNameFilter,
      assigneeFilter,
      skills: parseSkillsFilterParam(skillsFilter),
      appliedDateFrom,
      appliedDateTo,
    }),
    [
      scoreSort,
      jobRoleFilter,
      statusFilter,
      progressStatusFilter,
      jobFilter,
      stageFilter,
      matchScoreFilter,
      locationFilter,
      clientNameFilter,
      assigneeFilter,
      skillsFilter,
      appliedDateFrom,
      appliedDateTo,
    ]
  );

  const activeFilterCount = simplifiedToolbarFilters
    ? [
        statusFilter,
        progressStatusFilter,
        jobFilter,
        stageFilter,
        matchScoreFilter,
        locationFilter,
        clientNameFilter,
        assigneeFilter,
        skillsFilter.trim(),
        appliedDateFrom,
        appliedDateTo,
      ].filter(Boolean).length
    : countActiveCandidatesFilters(filterValues);

  function applySkillsFilter(skills: string[]) {
    const next = skills.join(", ");
    if (onSkillsFilterChange) {
      onSkillsFilterChange(next);
      return;
    }
    onApplySearch?.({ query, skillsFilter: next });
  }

  function applyFilterValues(next: CandidatesFilterValues) {
    setScoreSort(next.scoreSort);
    onJobRoleFilterChange(next.jobRoleFilter);
    onStatusFilterChange?.(next.statusFilter);
    onProgressStatusFilterChange?.(next.progressStatusFilter);
    setJobFilter(next.jobFilter);
    setStageFilter(next.stageFilter);
    setMatchScoreFilter(next.matchScoreFilter);
    onLocationFilterChange(next.locationFilter);
    setClientNameFilter(next.clientNameFilter);
    setAssigneeFilter(next.assigneeFilter);
    applySkillsFilter(next.skills);
    onAppliedDateFromChange(next.appliedDateFrom);
    onAppliedDateToChange(next.appliedDateTo);
  }

  function clearAllFilters() {
    if (simplifiedToolbarFilters) {
      onStatusFilterChange?.("");
      onProgressStatusFilterChange?.("");
      setJobFilter("");
      setStageFilter("");
      setMatchScoreFilter("");
      onLocationFilterChange("");
      setClientNameFilter("");
      setAssigneeFilter("");
      applySkillsFilter([]);
      onAppliedDateFromChange("");
      onAppliedDateToChange("");
      return;
    }
    applyFilterValues({ ...EMPTY_CANDIDATES_FILTERS });
  }

  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(page, totalPages);
  const rangeStart = totalFiltered === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, totalFiltered);

  // const totalText = advancedSearchActive ? (
  //   <>
  //     Total:{" "}
  //     <span className="font-semibold text-[#203130]">{loading ? "—" : totalCount ?? totalFiltered}</span> Results
  //     {advancedSearchPlace ? (
  //       <>
  //         {" "}
  //         found in <span className="font-semibold text-[#203130]">{advancedSearchPlace}</span>
  //       </>
  //     ) : null}
  //   </>
  // ) : (
  //   <>
  //     Total: <span className="font-semibold text-[#203130]">{loading ? "—" : totalCount ?? totalFiltered}</span>{" "}
  //     {loading ? "" : totalLabel}
  //   </>
  // );

  return (
    <div className="box-border w-full min-w-0 max-w-full px-3 pb-4 pt-4 sm:px-5 sm:pt-5 lg:px-8">
      <CandidatesSubTabs />

      <CandidatesPageHeader
        variant="page"
        title="Candidates"
        subtitle="Manage candidates in one place"
        actions={
          !isAllCandidatesLayout &&
          ((!hideAddCandidate && onAddCandidate) ||
            (!exportInToolbar && !hideAddCandidate && onExportCsv && onExportXls)) ? (
            <>
              {!hideAddCandidate && onAddCandidate ? (
                <button type="button" onClick={onAddCandidate} className={PRIMARY_HEADER_BUTTON_CLASS}>
                  <AddPlusIcon />
                  Add Candidate
                </button>
              ) : null}
              {!exportInToolbar && !hideAddCandidate && onExportCsv && onExportXls ? (
                <div className="max-lg:w-full max-lg:[&_button]:w-full">
                  <ListExportDropdown variant="header" onExportCsv={onExportCsv} onExportXls={onExportXls} />
                </div>
              ) : null}
            </>
          ) : undefined
        }
      />

      {resolvedKpiCards ? (
        <div className="mt-4 sm:mt-5">
          <CandidatesKpiRow cards={resolvedKpiCards} loading={kpiLoading} />
        </div>
      ) : null}

      <div className="mt-4 w-full overflow-hidden rounded-[12px] border border-[#E5E7EB] bg-white sm:mt-5">
        {isAllCandidatesLayout ? (
          <AllCandidatesToolbar
            query={query}
            skillsFilter={skillsFilter}
            searching={loading}
            onApplySearch={(next) => {
              if (onApplySearch) {
                onApplySearch(next);
                return;
              }
              onQueryChange(next.query);
            }}
            onResetSearch={() => {
              if (onResetSearch) {
                onResetSearch();
                return;
              }
              onQueryChange("");
            }}
            onOpenFilters={() => setFiltersModalOpen(true)}
            onEditColumns={onEditColumns}
            onAddCandidate={onAddCandidate}
            onMatchExistingCandidate={onMatchExistingCandidate}
            activeFilterCount={activeFilterCount}
            view={view}
            onViewChange={onViewChange}
            highlightMultiJob={highlightMultiJob}
            onHighlightMultiJobChange={setHighlightMultiJob}
            onAnalyzeAll={onAnalyzeAll}
            analyzeAllLabel={analyzeAllLabel}
            analyzeBusy={analyzeBusy}
            analyzeDisabled={analyzeDisabled}
            analysisProvider={analysisProvider}
            onAnalysisProviderChange={onAnalysisProviderChange}
          />
        ) : (
          <>
            <div className="flex w-full flex-col gap-2 border-b border-[#E5E7EB] px-3 py-3.5 lg:flex-row lg:items-center lg:justify-between lg:gap-3 sm:px-5">
              <div className="flex w-full items-center gap-2 lg:min-w-0 lg:flex-1 lg:gap-3">
                {exportInToolbar && onExportCsv && onExportXls ? (
                  <div className="min-w-0 shrink-0 flex-1 lg:flex-none">
                    <ListExportDropdown
                      variant="brand"
                      onExportCsv={onExportCsv}
                      onExportXls={onExportXls}
                    />
                  </div>
                ) : null}
                {!hideClaimCandidates && onClaimCandidates ? (
                  <button
                    type="button"
                    onClick={onClaimCandidates}
                    className={`${PRIMARY_TOOLBAR_BUTTON_CLASS} min-w-0 flex-1 lg:flex-none`}
                  >
                    <ClaimClipboardIcon />
                    <span className="max-[380px]:hidden">Claim Candidates</span>
                    <span className="hidden max-[380px]:inline">Claim</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onEditColumns}
                  className={`${OUTLINE_TOOLBAR_BUTTON_CLASS} min-w-0 flex-1 lg:flex-none`}
                >
                  <ColumnsIcon />
                  Columns
                </button>
                {deleteButton ? <div className="shrink-0">{deleteButton}</div> : null}
                {!hideRefresh ? (
                  <button
                    type="button"
                    onClick={onRefresh}
                    className="hidden size-8 shrink-0 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white text-[#475569] transition hover:bg-zinc-50 lg:inline-flex"
                    aria-label={refreshLabel}
                    title={refreshLabel}
                  >
                    <ListingGlyph src="/icons/admin-recruiter/candidates/refresh.svg" outer={16} leafWidth={16} leafHeight={16} />
                  </button>
                ) : null}
                {activeFilterCount > 0 ? (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className={`${OUTLINE_TOOLBAR_BUTTON_CLASS} hidden lg:inline-flex`}
                  >
                    Reset
                  </button>
                ) : null}
              </div>

              <div className="flex w-full items-center justify-end gap-2 lg:hidden">
                {activeFilterCount > 0 ? (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className={OUTLINE_TOOLBAR_BUTTON_CLASS}
                  >
                    Reset
                  </button>
                ) : null}
                {!hideRefresh ? (
                  <button
                    type="button"
                    onClick={onRefresh}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white text-[#475569] transition hover:bg-zinc-50"
                    aria-label={refreshLabel}
                    title={refreshLabel}
                  >
                    <ListingGlyph src="/icons/admin-recruiter/candidates/refresh.svg" outer={16} leafWidth={16} leafHeight={16} />
                  </button>
                ) : null}
                {onAnalyzeAll && analysisProvider && onAnalysisProviderChange ? (
                  <AnalyzeAllButtonGroup
                    onAnalyzeAll={onAnalyzeAll}
                    analyzeAllLabel={analyzeAllLabel}
                    analyzeBusy={analyzeBusy}
                    analyzeDisabled={analyzeDisabled}
                    analysisProvider={analysisProvider}
                    onAnalysisProviderChange={onAnalysisProviderChange}
                    buttonClassName={`${OUTLINE_TOOLBAR_BUTTON_CLASS} shrink-0 disabled:cursor-not-allowed disabled:opacity-50`}
                    title="Analyze all unanalyzed candidates on this page"
                  />
                ) : onAnalyzeAll ? (
                  <button
                    type="button"
                    onClick={onAnalyzeAll}
                    disabled={analyzeBusy || analyzeDisabled}
                    title="Analyze all unanalyzed candidates on this page"
                    className={`${OUTLINE_TOOLBAR_BUTTON_CLASS} shrink-0 disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {analyzeBusy ? "Analyzing…" : analyzeAllLabel}
                  </button>
                ) : null}
                {toolbarAddCandidateButton ? (
                  <div className="shrink-0 [&_button]:w-full min-[450px]:[&_button]:w-auto">{toolbarAddCandidateButton}</div>
                ) : null}
                <CandidatesViewToggle view={view} onViewChange={onViewChange} />
              </div>

              <div className="hidden shrink-0 items-center gap-2 lg:flex">
                {onAnalyzeAll && analysisProvider && onAnalysisProviderChange ? (
                  <AnalyzeAllButtonGroup
                    onAnalyzeAll={onAnalyzeAll}
                    analyzeAllLabel={analyzeAllLabel}
                    analyzeBusy={analyzeBusy}
                    analyzeDisabled={analyzeDisabled}
                    analysisProvider={analysisProvider}
                    onAnalysisProviderChange={onAnalysisProviderChange}
                    buttonClassName={`${OUTLINE_TOOLBAR_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
                    title="Analyze all unanalyzed candidates on this page"
                  />
                ) : onAnalyzeAll ? (
                  <button
                    type="button"
                    onClick={onAnalyzeAll}
                    disabled={analyzeBusy || analyzeDisabled}
                    title="Analyze all unanalyzed candidates on this page"
                    className={`${OUTLINE_TOOLBAR_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {analyzeBusy ? "Analyzing…" : analyzeAllLabel}
                  </button>
                ) : null}
                {toolbarAddCandidateButton ? <div className="shrink-0">{toolbarAddCandidateButton}</div> : null}
                <CandidatesViewToggle view={view} onViewChange={onViewChange} />
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 border-b border-[#E5E7EB] px-3 py-3.5 max-[449px]:flex-col min-[450px]:flex-row min-[450px]:flex-nowrap min-[450px]:items-center sm:px-5 lg:gap-3">
              <label className="flex h-8 w-full min-w-0 shrink-0 items-center gap-1 overflow-hidden rounded-lg border border-[#CBD5E1] bg-white px-2.5 min-[450px]:flex-1 lg:w-[320px] lg:flex-none xl:w-[400px]">
                <span className="relative flex size-5 shrink-0 items-center justify-center overflow-hidden" aria-hidden>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${JOBS_ICONS}/search.svg`}
                    alt=""
                    width={16.67}
                    height={16.67}
                    className="size-[16.67px] shrink-0"
                  />
                </span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => onQueryChange(event.target.value)}
                  placeholder={CANDIDATE_LIST_SEARCH_PLACEHOLDER}
                  aria-label={CANDIDATE_LIST_SEARCH_PLACEHOLDER}
                  className="min-w-0 flex-1 bg-transparent text-xs font-light leading-4 text-[#334155] outline-none placeholder:text-[#94A3B8]"
                />
              </label>

              <button
                type="button"
                onClick={() => setFiltersModalOpen(true)}
                className="inline-flex h-8 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[color:var(--brand-primary)] bg-white px-3 text-xs font-normal leading-4 text-[color:var(--brand-primary)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-primary)_6%,white)] min-[450px]:ml-auto min-[450px]:w-auto lg:hidden"
              >
                <MoreFiltersIcon />
                Filters
                {activeFilterCount > 0 ? (
                  <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-[color:var(--brand-primary)] px-1.5 text-[10px] font-semibold leading-4 text-white">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>

              <div className="hidden min-w-0 flex-1 flex-nowrap items-center gap-3 lg:flex">
                {!simplifiedToolbarFilters ? (
                  <>
                    <CompactFilterSelect
                      ariaLabel="Score"
                      placeholder="Score (high-low)"
                      value={scoreSort}
                      onChange={setScoreSort}
                      options={[
                        { value: "high-low", label: "Score (high-low)" },
                        { value: "low-high", label: "Score (low-high)" },
                      ]}
                    />
                    <CompactFilterSelect
                      ariaLabel="Work types"
                      placeholder="All Work Types"
                      value={jobRoleFilter}
                      onChange={onJobRoleFilterChange}
                      options={jobRoleOptions.map((role) => ({ value: role, label: role }))}
                    />
                  </>
                ) : null}
                <CompactFilterSelect
                  ariaLabel="Jobs"
                  placeholder="All Jobs"
                  value={jobFilter}
                  onChange={setJobFilter}
                  options={jobOptions.map((job) => ({ value: job, label: job }))}
                />
                <MatchScoreRangeFilter compact value={matchScoreFilter} onChange={setMatchScoreFilter} />
                <ScrollableFilterSelect
                  ariaLabel="Progress Status"
                  placeholder="Progress Status"
                  value={progressStatusFilter}
                  onChange={(value) => onProgressStatusFilterChange?.(value)}
                  options={progressStatusOptions}
                  triggerClassName="w-[160px]"
                />
                {!simplifiedToolbarFilters ? (
                  <CompactFilterSelect
                    ariaLabel="Stages"
                    placeholder="Stages"
                    value={stageFilter}
                    onChange={setStageFilter}
                    options={stageOptions.map((stage) => ({ value: stage, label: stage }))}
                  />
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setFiltersModalOpen(true)}
                className="hidden h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[color:var(--brand-primary)] bg-white px-3 text-xs font-normal leading-4 text-[color:var(--brand-primary)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-primary)_6%,white)] lg:inline-flex"
              >
                <MoreFiltersIcon />
                More Filters
                {activeFilterCount > 0 ? (
                  <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-[color:var(--brand-primary)] px-1.5 text-[10px] font-semibold leading-4 text-white">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
            </div>

            {showMultiJobHighlight ? (
              <HighlightMultiJobToggle on={highlightMultiJob} onToggle={() => setHighlightMultiJob(!highlightMultiJob)} />
            ) : null}
          </>
        )}

        <div className="w-full bg-white">{children}</div>

        {totalFiltered > 0 ? (
          <div className="flex flex-col gap-3 border-t border-[#E5E7EB] bg-white px-3 py-3 sm:px-5 xl:flex-row xl:flex-wrap xl:items-center xl:justify-between xl:gap-4">
            <p className="text-sm text-[#64748B]">
              Showing {rangeStart}-{rangeEnd} of {totalFiltered} results
            </p>
            <div className="flex w-full flex-col gap-3 xl:w-auto xl:flex-row xl:items-center xl:gap-3">
              <ListPaginationShowLabel
                pageSize={pageSize}
                options={[...CANDIDATES_PAGE_SIZE_OPTIONS]}
                onPageSizeChange={onPageSizeChange}
              />
              <ListPaginationControls
                currentPage={safePage}
                totalPages={totalPages}
                onPageChange={onPageChange}
                className="self-end xl:self-auto"
                activeStyle={{
                  backgroundColor: "var(--brand-secondary)",
                  borderColor: "var(--brand-secondary)",
                }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {showMultiJobHighlight && highlightMultiJob && multiJobApplicantCount > 0 ? (
        <MultiJobApplicantsBanner count={multiJobApplicantCount} onViewAll={onViewAllMultiJobApplicants} />
      ) : null}

      <EditCandidatesFiltersModal
        key={filtersModalOpen ? "candidate-filters-open" : "candidate-filters-closed"}
        open={filtersModalOpen}
        onOpenChange={setFiltersModalOpen}
        value={filterValues}
        options={{
          jobRoleOptions,
          statusOptions,
          progressStatusOptions,
          locationOptions,
          clientNameOptions,
          assigneeOptions,
          jobOptions,
          stageOptions,
        }}
        simplifiedFilters={simplifiedToolbarFilters}
        onSave={applyFilterValues}
        onAdvancedSearch={onAdvancedSearch}
      />
    </div>
  );
}

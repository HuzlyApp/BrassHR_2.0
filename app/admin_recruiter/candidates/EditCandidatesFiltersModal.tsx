"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import { brandingToCssVars } from "@/lib/tenant/tenant-branding";
import { CANDIDATES_PAGE_SUBTITLE_STYLE } from "./candidates-typography";
import { MatchScoreRangeFilter } from "./MatchScoreRangeFilter";
import { FilterChipInput } from "@/app/admin_recruiter/components/FilterChipInput";
import { GroupedFilterOptions } from "@/app/admin_recruiter/components/GroupedStatusMenu";
import { UNASSIGNED_ASSIGNEE_FILTER } from "@/lib/candidates/assignee-filter";

export type CandidatesFilterValues = {
  scoreSort: string;
  jobRoleFilter: string;
  statusFilter: string;
  progressStatusFilter: string;
  jobFilter: string;
  stageFilter: string;
  matchScoreFilter: string;
  locationFilter: string;
  clientNameFilter: string;
  assigneeFilter: string;
  skills: string[];
  appliedDateFrom: string;
  appliedDateTo: string;
};

export const EMPTY_CANDIDATES_FILTERS: CandidatesFilterValues = {
  scoreSort: "",
  jobRoleFilter: "",
  statusFilter: "",
  progressStatusFilter: "",
  jobFilter: "",
  stageFilter: "",
  matchScoreFilter: "",
  locationFilter: "",
  clientNameFilter: "",
  assigneeFilter: "",
  skills: [],
  appliedDateFrom: "",
  appliedDateTo: "",
};

export function hasActiveCandidatesFilters(value: CandidatesFilterValues): boolean {
  return (
    Boolean(value.scoreSort) ||
    Boolean(value.jobRoleFilter) ||
    Boolean(value.statusFilter) ||
    Boolean(value.progressStatusFilter) ||
    Boolean(value.jobFilter) ||
    Boolean(value.stageFilter) ||
    Boolean(value.matchScoreFilter) ||
    Boolean(value.locationFilter) ||
    Boolean(value.clientNameFilter) ||
    Boolean(value.assigneeFilter) ||
    value.skills.length > 0 ||
    Boolean(value.appliedDateFrom) ||
    Boolean(value.appliedDateTo)
  );
}

export function countActiveCandidatesFilters(value: CandidatesFilterValues): number {
  return (
    [
      value.scoreSort,
      value.jobRoleFilter,
      value.statusFilter,
      value.progressStatusFilter,
      value.jobFilter,
      value.stageFilter,
      value.matchScoreFilter,
      value.locationFilter,
      value.clientNameFilter,
      value.assigneeFilter,
      value.appliedDateFrom,
      value.appliedDateTo,
    ].filter(Boolean).length + (value.skills.length > 0 ? 1 : 0)
  );
}

type FilterOptions = {
  jobRoleOptions: string[];
  statusOptions: string[];
  progressStatusOptions?: {
    value: string;
    label: string;
    sortOrder?: number;
    groupName?: string | null;
    groupDescription?: string | null;
    groupSortOrder?: number | null;
  }[];
  locationOptions: string[];
  clientNameOptions?: string[];
  assigneeOptions?: { value: string; label: string }[];
  jobOptions?: string[];
  stageOptions?: string[];
};

type EditCandidatesFiltersModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: CandidatesFilterValues;
  options: FilterOptions;
  onSave: (next: CandidatesFilterValues) => void;
  onAdvancedSearch?: () => void;
  /** Legacy All candidates: hide Score and Work Type fields. */
  simplifiedFilters?: boolean;
};

const FIELD_SURFACE =
  "rounded-lg border border-[#CBD5E1] bg-white h-10 w-full min-w-0 cursor-pointer appearance-none bg-[length:12px_12px] bg-[right_12px_center] bg-no-repeat px-3 pr-9 text-sm font-normal leading-6 text-[#334155] hover:bg-zinc-50 focus:border-[color:var(--brand-primary)] focus:outline-none focus:ring-0";

const SELECT_CHEVRON = {
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="#94A3B8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  )}")`,
} as const;

function ModalFilterField({
  label,
  value,
  onChange,
  placeholder = "All",
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  children?: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-medium text-[#475569]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={`${FIELD_SURFACE} ${value ? "text-[#334155]" : "text-[#94A3B8]"}`}
        style={{ ...CANDIDATES_PAGE_SUBTITLE_STYLE, ...SELECT_CHEVRON }}
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
    </label>
  );
}

export function EditCandidatesFiltersModal({
  open,
  onOpenChange,
  value,
  options,
  onSave,
  onAdvancedSearch,
  simplifiedFilters = false,
}: EditCandidatesFiltersModalProps) {
  const branding = useTenantBranding();
  const brandVars = brandingToCssVars(branding) as CSSProperties;
  const [draft, setDraft] = useState<CandidatesFilterValues>(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  function setField<K extends keyof CandidatesFilterValues>(
    key: K,
    next: CandidatesFilterValues[K]
  ) {
    setDraft((current) => ({ ...current, [key]: next }));
  }

  function handleClear() {
    setDraft({ ...EMPTY_CANDIDATES_FILTERS });
  }

  function handleApply() {
    onSave(draft);
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/40 data-[state=open]:animate-in fade-in" />
        <Dialog.Content
          style={brandVars}
          className="fixed inset-x-0 bottom-0 top-auto z-[101] flex h-[94dvh] max-h-[94dvh] w-full max-w-full translate-x-0 translate-y-0 flex-col overflow-hidden rounded-t-[16px] bg-white shadow-2xl outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(680px,calc(100vh-2rem))] sm:max-h-[calc(100vh-2rem)] sm:w-[min(720px,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[20px] sm:border sm:border-zinc-200"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-zinc-300 sm:hidden" aria-hidden />

          <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3 sm:px-6 sm:py-4">
            <div className="min-w-0 pr-3">
              <Dialog.Title className="truncate text-lg font-semibold leading-6 text-gray-800 sm:text-2xl sm:leading-8">
                Filters
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                Filter the candidates list by status, skills, location, client name, assignee, and date.
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-black text-white hover:opacity-90 sm:h-8 sm:w-8 sm:p-1.5"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 [-webkit-overflow-scrolling:touch] sm:px-6 sm:py-6">
            <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 sm:gap-5">
              {!simplifiedFilters ? (
                <>
                  <ModalFilterField
                    label="Score"
                    value={draft.scoreSort}
                    onChange={(v) => setField("scoreSort", v)}
                    placeholder="Score (high-low)"
                  >
                    <option value="high-low">Score (high-low)</option>
                    <option value="low-high">Score (low-high)</option>
                  </ModalFilterField>

                  <ModalFilterField
                    label="Work Type"
                    value={draft.jobRoleFilter}
                    onChange={(v) => setField("jobRoleFilter", v)}
                    placeholder="All Work Types"
                  >
                    {options.jobRoleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </ModalFilterField>
                </>
              ) : null}

              <ModalFilterField
                label="Status"
                value={draft.statusFilter}
                onChange={(v) => setField("statusFilter", v)}
                placeholder="All Status"
              >
                {options.statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </ModalFilterField>

              <ModalFilterField
                label="Progress Status"
                value={draft.progressStatusFilter}
                onChange={(v) => setField("progressStatusFilter", v)}
                placeholder="All Progress Status"
              >
                <GroupedFilterOptions options={options.progressStatusOptions ?? []} />
              </ModalFilterField>

              <ModalFilterField
                label="Jobs"
                value={draft.jobFilter}
                onChange={(v) => setField("jobFilter", v)}
                placeholder="All Jobs"
              >
                {(options.jobOptions ?? []).map((job) => (
                  <option key={job} value={job}>
                    {job}
                  </option>
                ))}
              </ModalFilterField>

              <MatchScoreRangeFilter
                value={draft.matchScoreFilter}
                onChange={(v) => setField("matchScoreFilter", v)}
              />

              <ModalFilterField
                label="Location"
                value={draft.locationFilter}
                onChange={(v) => setField("locationFilter", v)}
                placeholder="All Locations"
              >
                {options.locationOptions.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </ModalFilterField>

              <ModalFilterField
                label="Current Stage"
                value={draft.stageFilter}
                onChange={(v) => setField("stageFilter", v)}
                placeholder="All Stages"
              >
                {(options.stageOptions ?? []).map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </ModalFilterField>

              <ModalFilterField
                label="Client name"
                value={draft.clientNameFilter}
                onChange={(v) => setField("clientNameFilter", v)}
                placeholder="All Client Names"
              >
                {(options.clientNameOptions ?? []).map((clientName) => (
                  <option key={clientName} value={clientName}>
                    {clientName}
                  </option>
                ))}
              </ModalFilterField>

              <ModalFilterField
                label="Assignee"
                value={draft.assigneeFilter}
                onChange={(v) => setField("assigneeFilter", v)}
                placeholder="All Assignees"
              >
                <option value={UNASSIGNED_ASSIGNEE_FILTER}>Unassigned</option>
                {(options.assigneeOptions ?? []).map((assignee) => (
                  <option key={assignee.value} value={assignee.value}>
                    {assignee.label}
                  </option>
                ))}
              </ModalFilterField>

              <label className="flex min-w-0 flex-col gap-1.5 min-[520px]:col-span-2">
                <span className="text-sm font-medium text-[#475569]">Skills</span>
                <FilterChipInput
                  values={draft.skills}
                  placeholder="Type a skill, then Enter or comma"
                  aria-label="Skills"
                  onChange={(skills) => setField("skills", skills)}
                />
              </label>

              <div className="min-[520px]:col-span-2">
                <span className="text-sm font-medium text-[#475569]">Applied Date</span>
                <div className="mt-1.5 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
                  <label className="flex min-w-0 flex-col gap-1.5">
                    <span className="text-xs font-normal text-[#64748B]">From</span>
                    <input
                      type="date"
                      value={draft.appliedDateFrom}
                      max={draft.appliedDateTo || undefined}
                      onChange={(e) => setField("appliedDateFrom", e.target.value)}
                      aria-label="Applied date from"
                      className="h-10 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm font-normal leading-6 text-[#334155] outline-none focus:border-[color:var(--brand-primary)]"
                    />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1.5">
                    <span className="text-xs font-normal text-[#64748B]">To</span>
                    <input
                      type="date"
                      value={draft.appliedDateTo}
                      min={draft.appliedDateFrom || undefined}
                      onChange={(e) => setField("appliedDateTo", e.target.value)}
                      aria-label="Applied date to"
                      className="h-10 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm font-normal leading-6 text-[#334155] outline-none focus:border-[color:var(--brand-primary)]"
                    />
                  </label>
                </div>
              </div>
            </div>

            {onAdvancedSearch ? (
              <div className="mt-5 border-t border-zinc-200 pt-5">
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    onAdvancedSearch();
                  }}
                  className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-[color:var(--brand-primary)] bg-white px-4 text-sm font-medium text-[color:var(--brand-primary)] transition hover:bg-[color-mix(in_srgb,var(--brand-primary)_8%,white)]"
                >
                  Map search
                </button>
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-zinc-200 px-4 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-6">
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-[#CBD5E1] bg-white px-4 text-sm font-semibold text-[#475569] transition hover:bg-zinc-50 sm:w-auto"
            >
              Clear All
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[color:var(--brand-primary)] px-5 text-sm font-semibold text-white transition hover:brightness-95 sm:w-auto"
            >
              Apply Filters
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Calendar, X } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import { brandingToCssVars } from "@/lib/tenant/tenant-branding";
import { CANDIDATES_PAGE_SUBTITLE_STYLE } from "@/app/admin_recruiter/candidates/candidates-typography";
import { GroupedFilterOptions } from "@/app/admin_recruiter/components/GroupedStatusMenu";
import {
  candidateMatchesMatchScoreFilter,
  encodeCustomMatchScoreRange,
  isCustomMatchScoreFilter,
  parseCustomMatchScoreRange,
} from "@/lib/admin/candidate-match-score-filter";
// Kept for restore — Figma filter modal uses From/To date inputs instead of preset chips.
// import { FilterChipInput } from "@/app/admin_recruiter/components/FilterChipInput";
// import { MatchScoreRangeFilter } from "@/app/admin_recruiter/candidates/MatchScoreRangeFilter";

export type ApplicationsExtendedFilterValues = {
  status: string;
  stage: string;
  location: string;
  evaluation: string;
  workflow: string;
  matchScore: string;
  dateApplied: string;
  job: string;
  skills: string[];
  /** Match strength (Strong / Review / Not Match) — same as ApplicantsFilterBar. */
  matchStatus: string;
  client: string;
  assignee: string;
};

export const EMPTY_APPLICATIONS_EXTENDED_FILTERS: ApplicationsExtendedFilterValues = {
  status: "",
  stage: "",
  location: "",
  evaluation: "",
  workflow: "",
  matchScore: "",
  dateApplied: "",
  job: "",
  skills: [],
  matchStatus: "",
  client: "",
  assignee: "",
};

export function hasActiveApplicationsExtendedFilters(
  value: ApplicationsExtendedFilterValues
): boolean {
  return (
    Boolean(value.status) ||
    Boolean(value.stage) ||
    Boolean(value.location) ||
    Boolean(value.evaluation) ||
    Boolean(value.workflow) ||
    Boolean(value.matchScore) ||
    Boolean(value.dateApplied) ||
    Boolean(value.job) ||
    value.skills.length > 0 ||
    Boolean(value.matchStatus && value.matchStatus !== "All") ||
    Boolean(value.client && value.client !== "All") ||
    Boolean(value.assignee && value.assignee !== "All" && value.assignee !== "All Recruiters")
  );
}

/** Legacy dashboard / deep-link ids from the previous All candidates filter. */
const LEGACY_APPLICATION_MATCH_SCORE_HANDLERS: Record<
  string,
  (score: number | null | undefined) => boolean
> = {
  "90_plus": (score) => score != null && Number.isFinite(Number(score)) && Number(score) >= 90,
  "70_89": (score) =>
    score != null && Number.isFinite(Number(score)) && Number(score) >= 70 && Number(score) < 90,
  "50_69": (score) =>
    score != null && Number.isFinite(Number(score)) && Number(score) >= 50 && Number(score) < 70,
  under_50: (score) => score != null && Number.isFinite(Number(score)) && Number(score) < 50,
  no_score: (score) => score == null || !Number.isFinite(Number(score)),
};

export function applicationMatchesMatchScoreFilter(
  score: number | null | undefined,
  matchScoreFilter: string
): boolean {
  const trimmed = matchScoreFilter.trim();
  if (!trimmed) return true;
  const legacy = LEGACY_APPLICATION_MATCH_SCORE_HANDLERS[trimmed];
  if (legacy) return legacy(score);
  return candidateMatchesMatchScoreFilter(score, trimmed);
}

export const APPLICATION_DATE_APPLIED_FILTER_OPTIONS = [
  { id: "today", label: "Today" },
  { id: "last_7", label: "Last 7 days" },
  { id: "last_14", label: "Last 14 days" },
  { id: "last_30", label: "Last 30 days" },
  { id: "last_90", label: "Last 90 days" },
  { id: "older_90", label: "Older than 90 days" },
] as const;

export const APPLICATION_EVALUATION_FILTER_OPTIONS = [
  { id: "analyzed", label: "Analyzed" },
  { id: "not_yet", label: "Not Yet" },
] as const;

export const APPLICATION_MATCH_STATUS_FILTER_OPTIONS = [
  { id: "Strong", label: "Strong" },
  { id: "Review", label: "Review" },
  { id: "Not Match", label: "Not Match" },
] as const;

const MATCH_SCORE_BOUND_OPTIONS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;

const DATE_RANGE_PREFIX = "range|";

export function encodeAppliedDateRange(from: string, to: string): string {
  const f = from.trim();
  const t = to.trim();
  if (!f && !t) return "";
  return `${DATE_RANGE_PREFIX}${f}|${t}`;
}

export function parseAppliedDateRange(value: string): { from: string; to: string } {
  if (!value.startsWith(DATE_RANGE_PREFIX)) return { from: "", to: "" };
  const raw = value.slice(DATE_RANGE_PREFIX.length);
  const [from = "", to = ""] = raw.split("|");
  return { from, to };
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysAgoFromToday(days: number, now = new Date()): Date {
  const start = startOfLocalDay(now);
  start.setDate(start.getDate() - days);
  return start;
}

function parseLocalDateInput(value: string): Date | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  return startOfLocalDay(date);
}

export function applicationMatchesDateAppliedFilter(
  appliedAt: string | null | undefined,
  dateAppliedFilter: string
): boolean {
  if (!dateAppliedFilter) return true;
  if (!appliedAt) return false;
  const posted = new Date(appliedAt);
  if (Number.isNaN(posted.getTime())) return false;
  const now = new Date();
  const today = startOfLocalDay(now);

  if (dateAppliedFilter.startsWith(DATE_RANGE_PREFIX)) {
    const { from, to } = parseAppliedDateRange(dateAppliedFilter);
    const fromDate = from ? parseLocalDateInput(from) : null;
    const toDate = to ? parseLocalDateInput(to) : null;
    if (fromDate && posted < fromDate) return false;
    if (toDate) {
      const end = new Date(toDate);
      end.setDate(end.getDate() + 1);
      if (posted >= end) return false;
    }
    return true;
  }

  switch (dateAppliedFilter) {
    case "today":
      return posted >= today;
    case "last_7":
      return posted >= daysAgoFromToday(7, now);
    case "last_14":
      return posted >= daysAgoFromToday(14, now);
    case "last_30":
      return posted >= daysAgoFromToday(30, now);
    case "last_90":
      return posted >= daysAgoFromToday(90, now);
    case "older_90":
      return posted < daysAgoFromToday(90, now);
    default:
      return true;
  }
}

type FilterOptions = {
  statuses: {
    value: string;
    label: string;
    sortOrder?: number;
    groupName?: string | null;
    groupDescription?: string | null;
    groupSortOrder?: number | null;
  }[];
  stages: { value: string; label: string }[];
  locations: string[];
  workflows: string[];
  jobs: { value: string; label: string }[];
  showJobFilter: boolean;
  suggestedSkills?: string[];
  clients?: string[];
  assignees?: string[];
};

type EditApplicationsFiltersModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: ApplicationsExtendedFilterValues;
  options: FilterOptions;
  onSave: (next: ApplicationsExtendedFilterValues) => void;
  sortBy?: "newest" | "oldest" | "matchScore" | "matchScoreAsc";
  onSortByChange?: (value: "newest" | "oldest" | "matchScore" | "matchScoreAsc") => void;
};

const FIELD_SURFACE =
  "h-11 w-full min-w-0 cursor-pointer appearance-none rounded-lg border border-[#D1D5DB] bg-white bg-[length:12px_12px] bg-[right_12px_center] bg-no-repeat px-3 pr-9 text-sm font-normal leading-6 text-[#334155] hover:bg-zinc-50 focus:border-[color:var(--brand-primary)] focus:outline-none focus:ring-0";

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
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-medium text-[#6B7280]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={`${FIELD_SURFACE} ${value ? "text-[#111827]" : "text-[#9CA3AF]"}`}
        style={{ ...CANDIDATES_PAGE_SUBTITLE_STYLE, ...SELECT_CHEVRON }}
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
    </label>
  );
}

function MatchScoreDualFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const custom = isCustomMatchScoreFilter(value) ? parseCustomMatchScoreRange(value) : null;
  const fromValue = custom?.min ?? "";
  const toValue = custom?.max ?? "";

  function commit(nextFrom: string, nextTo: string) {
    if (!nextFrom && !nextTo) {
      onChange("");
      return;
    }
    const min = nextFrom || "0";
    const max = nextTo || "100";
    if (min === "0" && max === "100") {
      onChange("");
      return;
    }
    onChange(encodeCustomMatchScoreRange(min, max));
  }

  return (
    <div className="col-span-full grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 sm:gap-5">
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-medium text-[#6B7280]">Match Score</span>
        <select
          aria-label="Match score from"
          value={fromValue}
          onChange={(e) => commit(e.target.value, toValue || "100")}
          className={`${FIELD_SURFACE} ${fromValue ? "text-[#111827]" : "text-[#9CA3AF]"}`}
          style={{ ...CANDIDATES_PAGE_SUBTITLE_STYLE, ...SELECT_CHEVRON }}
        >
          <option value="">0%</option>
          {MATCH_SCORE_BOUND_OPTIONS.map((n) => (
            <option key={`from-${n}`} value={String(n)}>
              {n}%
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-medium text-[#6B7280] opacity-0 max-[519px]:hidden" aria-hidden>
          To
        </span>
        <span className="text-sm font-medium text-[#6B7280] min-[520px]:hidden">To</span>
        <select
          aria-label="Match score to"
          value={toValue}
          onChange={(e) => commit(fromValue || "0", e.target.value)}
          className={`${FIELD_SURFACE} ${toValue ? "text-[#111827]" : "text-[#9CA3AF]"}`}
          style={{ ...CANDIDATES_PAGE_SUBTITLE_STYLE, ...SELECT_CHEVRON }}
        >
          <option value="">100%</option>
          {MATCH_SCORE_BOUND_OPTIONS.map((n) => (
            <option key={`to-${n}`} value={String(n)}>
              {n}%
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function AppliedDateRangeFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const range = value.startsWith(DATE_RANGE_PREFIX)
    ? parseAppliedDateRange(value)
    : { from: "", to: "" };

  // Preset date filters from older UI remain valid; show empty pickers until user picks dates.
  const from = range.from;
  const to = range.to;

  return (
    <div className="col-span-full grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 sm:gap-5">
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-medium text-[#6B7280]">Applied Date</span>
        <div className="relative">
          <input
            type="date"
            aria-label="Applied date from"
            value={from}
            onChange={(e) => onChange(encodeAppliedDateRange(e.target.value, to))}
            className={`${FIELD_SURFACE} pr-10 ${
              from ? "text-[#111827]" : "text-transparent"
            } [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0`}
            style={CANDIDATES_PAGE_SUBTITLE_STYLE}
          />
          {!from ? (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#9CA3AF]">
              From mm/dd/yyyy
            </span>
          ) : null}
          <Calendar
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#9CA3AF]"
            aria-hidden
          />
        </div>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-medium text-[#6B7280] opacity-0 max-[519px]:hidden" aria-hidden>
          To
        </span>
        <span className="text-sm font-medium text-[#6B7280] min-[520px]:hidden">To</span>
        <div className="relative">
          <input
            type="date"
            aria-label="Applied date to"
            value={to}
            onChange={(e) => onChange(encodeAppliedDateRange(from, e.target.value))}
            className={`${FIELD_SURFACE} pr-10 ${
              to ? "text-[#111827]" : "text-transparent"
            } [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0`}
            style={CANDIDATES_PAGE_SUBTITLE_STYLE}
          />
          {!to ? (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#9CA3AF]">
              To mm/dd/yyyy
            </span>
          ) : null}
          <Calendar
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#9CA3AF]"
            aria-hidden
          />
        </div>
      </label>
    </div>
  );
}

export function EditApplicationsFiltersModal({
  open,
  onOpenChange,
  value,
  options,
  onSave,
  sortBy = "newest",
  onSortByChange,
}: EditApplicationsFiltersModalProps) {
  const branding = useTenantBranding();
  const brandVars = brandingToCssVars(branding) as CSSProperties;
  const [draft, setDraft] = useState<ApplicationsExtendedFilterValues>(value);
  const [draftSortBy, setDraftSortBy] = useState(sortBy);

  useEffect(() => {
    if (open) {
      setDraft(value);
      setDraftSortBy(sortBy);
    }
  }, [open, value, sortBy]);

  function setField<K extends keyof ApplicationsExtendedFilterValues>(
    key: K,
    next: ApplicationsExtendedFilterValues[K]
  ) {
    setDraft((current) => ({ ...current, [key]: next }));
  }

  const clientOptions = (options.clients ?? []).filter((item) => item && item !== "All");
  const assigneeOptions = (options.assignees ?? []).filter(
    (item) => item && item !== "All" && item !== "All Recruiters"
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/40 data-[state=open]:animate-in fade-in" />
        <Dialog.Content
          style={brandVars}
          className="fixed inset-x-0 bottom-0 top-auto z-[101] flex h-[94dvh] max-h-[94dvh] w-full max-w-full translate-x-0 translate-y-0 flex-col overflow-hidden rounded-t-[16px] bg-white shadow-2xl outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[calc(100vh-2rem)] sm:w-[min(760px,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[16px] sm:border sm:border-[#E5E7EB]"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-zinc-300 sm:hidden" aria-hidden />

          <div className="flex shrink-0 items-center justify-between px-5 py-4 sm:px-8 sm:pt-6 sm:pb-2">
            <div className="min-w-0 pr-3">
              <Dialog.Title className="truncate text-xl font-semibold leading-7 text-[#111827]">
                Filter
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                Choose filters to narrow the applicants list.
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-black text-white hover:opacity-90"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 py-4 [-webkit-overflow-scrolling:touch] sm:px-8 sm:pb-6">
            <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 sm:gap-x-5 sm:gap-y-5">
              <ModalFilterField
                label="Status"
                value={draft.status}
                onChange={(v) => setField("status", v)}
                placeholder="All Status"
              >
                <GroupedFilterOptions options={options.statuses} />
              </ModalFilterField>

              <ModalFilterField
                label="Progress Status"
                value={draft.evaluation}
                onChange={(v) => setField("evaluation", v)}
                placeholder="AI Progress Status"
              >
                {APPLICATION_EVALUATION_FILTER_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </ModalFilterField>

              {options.showJobFilter ? (
                <ModalFilterField
                  label="Jobs"
                  value={draft.job}
                  onChange={(v) => setField("job", v)}
                  placeholder="All Jobs"
                >
                  {options.jobs.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </ModalFilterField>
              ) : null}

              <ModalFilterField
                label="Match Status"
                value={draft.matchStatus}
                onChange={(v) => setField("matchStatus", v)}
                placeholder="Select Match"
              >
                {APPLICATION_MATCH_STATUS_FILTER_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </ModalFilterField>

              <MatchScoreDualFilter
                value={draft.matchScore}
                onChange={(v) => setField("matchScore", v)}
              />

              <ModalFilterField
                label="Multiple Location"
                value={draft.location}
                onChange={(v) => setField("location", v)}
                placeholder="All Locations"
              >
                {options.locations.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </ModalFilterField>

              <ModalFilterField
                label="Current Stage"
                value={draft.stage}
                onChange={(v) => setField("stage", v)}
                placeholder="All Stages"
              >
                {options.stages.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </ModalFilterField>

              <ModalFilterField
                label="Client Name"
                value={draft.client}
                onChange={(v) => setField("client", v)}
                placeholder="All Client Names"
              >
                {clientOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </ModalFilterField>

              <ModalFilterField
                label="Assignee"
                value={draft.assignee}
                onChange={(v) => setField("assignee", v)}
                placeholder="All Assignees"
              >
                {assigneeOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </ModalFilterField>

              <AppliedDateRangeFilter
                value={draft.dateApplied}
                onChange={(v) => setField("dateApplied", v)}
              />

              {/* Figma filter modal does not show these — kept for quick restore.
              <ModalFilterField
                label="Apply date"
                value={draftSortBy === "newest" || draftSortBy === "oldest" ? draftSortBy : ""}
                onChange={(next) => {
                  setDraftSortBy(next === "newest" || next === "oldest" ? next : "newest");
                }}
                placeholder="Apply date (Newest first)"
              >
                <option value="newest">Apply date (Newest first)</option>
                <option value="oldest">Apply date (Oldest first)</option>
              </ModalFilterField>
              <ModalFilterField label="Workflow" value={draft.workflow} onChange={(v) => setField("workflow", v)}>
                {options.workflows.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </ModalFilterField>
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-sm font-medium text-[#6B7280]">Skills</span>
                <FilterChipInput ... />
              </label>
              */}
            </div>

            {/* Map Search — no map search handler in applicants listing yet; UI shell only. */}
            <button
              type="button"
              disabled
              title="Map Search coming soon"
              className="mt-5 flex h-14 w-full cursor-not-allowed items-center justify-center rounded-lg border border-[color:var(--brand-primary)] text-base font-semibold text-[color:var(--brand-primary)] opacity-90"
            >
              Map Search
            </button>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-[#E5E7EB] px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:gap-3 sm:px-8 sm:py-4">
            <button
              type="button"
              onClick={() => {
                setDraft({ ...EMPTY_APPLICATIONS_EXTENDED_FILTERS });
                setDraftSortBy("newest");
              }}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-[color:var(--brand-primary)] px-4 text-sm font-semibold text-[color:var(--brand-primary)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-primary)_8%,white)]"
            >
              Clear All
            </button>
            {/* Cancel kept for restore — Figma footer is Clear All + Apply Filter only.
            <Dialog.Close asChild>
              <button type="button" className="...">Cancel</button>
            </Dialog.Close>
            */}
            <button
              type="button"
              onClick={() => {
                onSave(draft);
                if (onSortByChange) onSortByChange(draftSortBy);
                onOpenChange(false);
              }}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-[color:var(--brand-primary)] px-4 text-sm font-semibold text-white transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--brand-primary)_35%,transparent)]"
            >
              Apply Filter
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

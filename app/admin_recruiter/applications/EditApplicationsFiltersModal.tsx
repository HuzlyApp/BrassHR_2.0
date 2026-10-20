"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import { brandingToCssVars } from "@/lib/tenant/tenant-branding";
import { CANDIDATES_PAGE_SUBTITLE_STYLE } from "@/app/admin_recruiter/candidates/candidates-typography";
import { MatchScoreRangeFilter } from "@/app/admin_recruiter/candidates/MatchScoreRangeFilter";
import { FilterChipInput } from "@/app/admin_recruiter/components/FilterChipInput";
import { GroupedFilterOptions } from "@/app/admin_recruiter/components/GroupedStatusMenu";
import { candidateMatchesMatchScoreFilter } from "@/lib/admin/candidate-match-score-filter";

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
    value.skills.length > 0
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

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysAgoFromToday(days: number, now = new Date()): Date {
  const start = startOfLocalDay(now);
  start.setDate(start.getDate() - days);
  return start;
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
  children: React.ReactNode;
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
                All Filters
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                Choose filters to narrow the candidates list.
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

              <ModalFilterField
                label="Progress Status"
                value={draft.status}
                onChange={(v) => setField("status", v)}
              >
                <GroupedFilterOptions options={options.statuses} />
              </ModalFilterField>

              <ModalFilterField
                label="Stages"
                value={draft.stage}
                onChange={(v) => setField("stage", v)}
              >
                {options.stages.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </ModalFilterField>

              <ModalFilterField
                label="Location"
                value={draft.location}
                onChange={(v) => setField("location", v)}
              >
                {options.locations.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </ModalFilterField>

              <ModalFilterField
                label="Evaluation"
                value={draft.evaluation}
                onChange={(v) => setField("evaluation", v)}
              >
                {APPLICATION_EVALUATION_FILTER_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </ModalFilterField>

              <ModalFilterField
                label="Workflow"
                value={draft.workflow}
                onChange={(v) => setField("workflow", v)}
              >
                {options.workflows.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </ModalFilterField>

              <MatchScoreRangeFilter
                value={draft.matchScore}
                onChange={(v) => setField("matchScore", v)}
              />

              <ModalFilterField
                label="Application Date"
                value={draft.dateApplied}
                onChange={(v) => setField("dateApplied", v)}
              >
                {APPLICATION_DATE_APPLIED_FILTER_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </ModalFilterField>

              {options.showJobFilter ? (
                <ModalFilterField
                  label="Job"
                  value={draft.job}
                  onChange={(v) => setField("job", v)}
                >
                  {options.jobs.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </ModalFilterField>
              ) : null}

              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-sm font-medium text-[#475569]">Skills</span>
                <FilterChipInput
                  values={draft.skills}
                  suggestions={options.suggestedSkills ?? []}
                  placeholder="Add a skill"
                  onChange={(skills) => setField("skills", skills)}
                />
              </label>
            </div>
          </div>

          <div className="flex shrink-0 gap-2 border-t border-zinc-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:justify-end sm:gap-3 sm:px-6 sm:py-4">
            <button
              type="button"
              onClick={() => {
                setDraft({ ...EMPTY_APPLICATIONS_EXTENDED_FILTERS });
                setDraftSortBy("newest");
              }}
              className="h-12 flex-1 rounded-lg border border-[#CBD5E1] px-4 text-sm font-medium text-[#475569] transition hover:bg-zinc-50 sm:h-auto sm:flex-none sm:px-5 sm:py-2"
            >
              Reset Filters
            </button>
            <Dialog.Close asChild>
              <button
                type="button"
                className="h-12 flex-1 rounded-lg border border-[color:var(--brand-primary)] px-4 text-sm font-medium text-[color:var(--brand-primary)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-primary)_8%,white)] sm:h-auto sm:flex-none sm:px-5 sm:py-2"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={() => {
                onSave(draft);
                if (onSortByChange) onSortByChange(draftSortBy);
                onOpenChange(false);
              }}
              className="h-12 flex-1 rounded-lg bg-[color:var(--brand-primary)] px-4 text-sm font-medium text-white transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--brand-primary)_35%,transparent)] sm:h-auto sm:flex-none sm:px-5 sm:py-2"
            >
              Save
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

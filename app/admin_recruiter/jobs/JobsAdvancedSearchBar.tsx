"use client";

import { useEffect, useRef, useState } from "react";
import {
  FilterChipInput,
  type FilterChipInputHandle,
} from "@/app/admin_recruiter/components/FilterChipInput";

const JOBS_ICONS = "/icons/jobs-icons";
const CANDIDATES_ICONS = "/icons/candidates-icons";

const PRIMARY_TOOLBAR_BUTTON_CLASS =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[color:var(--brand-primary)] px-4 text-xs font-semibold leading-4 text-white shadow-xs transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";

const OUTLINE_TOOLBAR_BUTTON_CLASS =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#D1D5DB] bg-white px-3.5 text-xs font-semibold leading-4 text-[#374151] shadow-xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50";

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

function JobSearchIcon() {
  return <ListingGlyph src={`${JOBS_ICONS}/search.svg`} outer={20} leafWidth={16.67} leafHeight={16.67} />;
}

function ResetSearchIcon() {
  return <ListingGlyph src={`${CANDIDATES_ICONS}/reset-search.svg`} outer={16} leafWidth={16} leafHeight={16} />;
}

function tagsKey(tags: string[]): string {
  return tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean).join("|");
}

export type JobsAdvancedSearchBarProps = {
  /** Applied search tags (title, skills, experience, location, profession). */
  tags: string[];
  onApplySearch: (tags: string[]) => void;
  onResetSearch: () => void;
  searching?: boolean;
};

/**
 * Unified tag search for jobs listing — same behavior as Jobs Dashboard.
 * Type + Enter/comma creates chips; every tag must match (AND).
 */
export function JobsAdvancedSearchBar({
  tags,
  onApplySearch,
  onResetSearch,
  searching = false,
}: JobsAdvancedSearchBarProps) {
  const chipRef = useRef<FilterChipInputHandle>(null);
  const [draftTags, setDraftTags] = useState(tags);
  const [draftText, setDraftText] = useState("");

  useEffect(() => {
    setDraftTags(tags);
  }, [tags]);

  const searchDirty = tagsKey(draftTags) !== tagsKey(tags);
  const hasAppliedSearch = tags.length > 0;
  const hasDraftSearch = draftTags.length > 0 || Boolean(draftText.trim());

  function submitSearch(nextTags?: string[]) {
    if (searching) return;
    const committed = nextTags ?? chipRef.current?.commitDraft() ?? draftTags;
    const normalized = committed.map((tag) => tag.trim()).filter(Boolean);
    setDraftTags(normalized);
    setDraftText("");
    onApplySearch(normalized);
  }

  function resetSearch() {
    if (searching) return;
    chipRef.current?.clearDraft();
    setDraftTags([]);
    setDraftText("");
    onResetSearch();
  }

  return (
    <div className="flex w-full flex-col gap-3.5 border-b border-[#E5E7EB] px-[14px] py-3.5">
      <div className="flex w-full flex-col gap-3 rounded-lg border border-[#E5E7EB] p-1.5 sm:flex-row sm:items-center sm:gap-3.5 sm:px-2 sm:py-1.5">
        <div className="flex min-h-10 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-md px-2 sm:px-3">
          <JobSearchIcon />
          <FilterChipInput
            ref={chipRef}
            embedded
            values={draftTags}
            placeholder="Search by job title, skills, experience, location..."
            aria-label="Search by job title, skills, experience, location, and profession"
            onChange={setDraftTags}
            onDraftTextChange={setDraftText}
            onEnterSubmit={(nextTags) => {
              setDraftTags(nextTags);
              submitSearch(nextTags);
            }}
          />
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3.5">
          <button
            type="button"
            onClick={() => submitSearch()}
            disabled={searching || (!searchDirty && !hasDraftSearch)}
            className={`${PRIMARY_TOOLBAR_BUTTON_CLASS} flex-1 sm:flex-none`}
          >
            {searching ? "Searching…" : "Search"}
          </button>
          <button
            type="button"
            onClick={resetSearch}
            disabled={searching || (!hasAppliedSearch && !hasDraftSearch)}
            className={`${OUTLINE_TOOLBAR_BUTTON_CLASS} flex-1 sm:flex-none`}
          >
            <ResetSearchIcon />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Archive, Loader2, PlusSquare, SquarePen, Trash2, UserPlus } from "lucide-react";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import { brandingToCssVars } from "@/lib/tenant/tenant-branding";
import { CandidatesListSkeleton } from "@/app/admin_recruiter/candidates/CandidatesListSkeleton";
import { prefetchJobDetails } from "@/lib/admin/staff-detail-fetch-cache";
import {
  jobStatusDisplayLabel,
  normalizeJobRequisitionStatus,
} from "@/lib/jobs/job-status";
import {
  analyzedApplicantCount,
  applicantCount,
  jobAnalyzedCandidatesHref,
  jobCandidatesHref,
  JobSourceTypeBadge,
  jobListDisplayTitle,
  jobLocation,
  publicJobPathFor,
  readyToSubmitCount,
  strongMatchCount,
  type JobListRow,
} from "./render-job-list-cell";

const JOB_OPEN_ICON_SRC = "/icons/jobs-icons/open.svg";
const JOB_DOTS_ICON_SRC = "/icons/jobs-icons/dots.svg";
/** Default batch size when infinite scroll is enabled on the jobs card grid. */
export const JOBS_GRID_INFINITE_PAGE_SIZE = 50;
const JOBS_GRID_LOAD_MORE_DELAY_MS = 450;

type JobsGridViewProps = {
  jobs: JobListRow[];
  loading: boolean;
  emptyMessage: string;
  tenantSlug: string | null;
  hotJobIds?: Set<string>;
  selectedIds?: Set<string>;
  onToggleSelect?: (jobId: string) => void;
  /**
   * When true, card click selects/deselects and navigation/action controls are disabled.
   * When false (default), `onToggleSelect` still allows click-to-select on empty areas
   * while links and menus remain interactive (listing grid behavior).
   */
  selectionMode?: boolean;
  padded?: boolean;
  /**
   * When set, render this many cards first and load the next batch on scroll
   * (Show more + loader). Omit on paginated list views.
   */
  infiniteScrollPageSize?: number;
  onAddCandidate: (job: JobListRow) => void;
  onImportCandidates: (job: JobListRow) => void;
  onDelete: (jobId: string) => void;
  onArchive: (jobId: string) => void;
  onUnarchive: (jobId: string) => void;
};

const MENU_WIDTH = 196;
const MENU_ESTIMATED_HEIGHT = 220;
const MENU_ITEM_CLASS =
  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-[color:var(--brand-secondary)] transition hover:bg-[color-mix(in_srgb,var(--brand-secondary)_6%,white)]";
const MENU_ICON_CLASS = "h-4 w-4 shrink-0 text-[#94A3B8]";

function gridStatusLabel(job: JobListRow): string {
  return jobStatusDisplayLabel(job.status);
}

function iconButtonClass(disabled?: boolean) {
  return `inline-flex size-[14px] items-center justify-center text-[#94A3B8] transition hover:opacity-80 ${
    disabled ? "cursor-not-allowed opacity-40 hover:opacity-40" : ""
  }`;
}

function menuTriggerClass(open: boolean) {
  return `inline-flex size-7 shrink-0 items-center justify-center rounded-md transition ${
    open
      ? "border border-[#94A3B8] bg-white shadow-sm"
      : "border border-transparent hover:border-[#E5E7EB] hover:bg-[#F8FAFC]"
  }`;
}

function JobGridCardMenu({
  job,
  anchor,
  onClose,
  onAddCandidate,
  onImportCandidates,
  onDelete,
  onArchive,
  onUnarchive,
}: {
  job: JobListRow;
  anchor: HTMLElement;
  onClose: () => void;
  onAddCandidate: (job: JobListRow) => void;
  onImportCandidates: (job: JobListRow) => void;
  onDelete: (jobId: string) => void;
  onArchive: (jobId: string) => void;
  onUnarchive: (jobId: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const branding = useTenantBranding();
  const brandVars = brandingToCssVars(branding) as CSSProperties;
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const archived = normalizeJobRequisitionStatus(String(job.status ?? "")) === "archived";

  const updatePosition = useCallback(() => {
    const rect = anchor.getBoundingClientRect();
    let top = rect.bottom + 4;
    if (top + MENU_ESTIMATED_HEIGHT > window.innerHeight - 8) {
      top = Math.max(8, rect.top - MENU_ESTIMATED_HEIGHT - 4);
    }
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    setStyle({
      position: "fixed",
      top,
      left,
      width: MENU_WIDTH,
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

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Job actions"
      style={{ ...brandVars, ...style }}
      className="z-[200] overflow-hidden rounded-xl border border-[#E5E7EB] bg-white py-1 shadow-lg"
    >
      <button
        type="button"
        role="menuitem"
        className={MENU_ITEM_CLASS}
        onClick={() => {
          onClose();
          onAddCandidate(job);
        }}
      >
        <PlusSquare className={MENU_ICON_CLASS} aria-hidden />
        Add Candidate
      </button>
      <button
        type="button"
        role="menuitem"
        className={MENU_ITEM_CLASS}
        onClick={() => {
          onClose();
          onImportCandidates(job);
        }}
      >
        <UserPlus className={MENU_ICON_CLASS} aria-hidden />
        Import Candidates
      </button>
      {!archived ? (
        <Link
          href={`/admin_recruiter/jobs/${job.id}/edit`}
          role="menuitem"
          className={MENU_ITEM_CLASS}
          onClick={onClose}
        >
          <SquarePen className={MENU_ICON_CLASS} aria-hidden />
          Edit Job
        </Link>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className={MENU_ITEM_CLASS}
        onClick={() => {
          onClose();
          onDelete(job.id);
        }}
      >
        <Trash2 className={MENU_ICON_CLASS} aria-hidden />
        Delete Job
      </button>
      <button
        type="button"
        role="menuitem"
        className={MENU_ITEM_CLASS}
        onClick={() => {
          onClose();
          if (archived) onUnarchive(job.id);
          else onArchive(job.id);
        }}
      >
        <Archive className={MENU_ICON_CLASS} aria-hidden />
        {archived ? "Unarchive Job" : "Archive Job"}
      </button>
    </div>,
    document.body
  );
}

function JobGridCard({
  job,
  tenantSlug,
  isHot,
  isSelected,
  menuOpen,
  selectionMode = false,
  onOpenMenu,
  onToggleSelect,
}: {
  job: JobListRow;
  tenantSlug: string | null;
  isHot: boolean;
  isSelected: boolean;
  menuOpen: boolean;
  selectionMode?: boolean;
  onOpenMenu: (job: JobListRow, anchor: HTMLElement) => void;
  onToggleSelect?: (jobId: string) => void;
}) {
  const title = jobListDisplayTitle(job);
  const location = jobLocation(job);
  const publicHref = publicJobPathFor(job, tenantSlug);
  const candidateCount = applicantCount(job);
  const candidatesHref = jobCandidatesHref(job.id);
  const canSelect = Boolean(onToggleSelect);
  const blockNavigation = selectionMode && canSelect;
  const metrics = [
    {
      label: "CAND",
      value: candidateCount,
      href: candidatesHref,
      ariaLabel: `View ${candidateCount} candidate${candidateCount === 1 ? "" : "s"} for ${title}`,
    },
    {
      label: "ANALYSIS",
      value: analyzedApplicantCount(job),
      href: jobAnalyzedCandidatesHref(job.id),
      ariaLabel: `View ${analyzedApplicantCount(job)} analyzed applicant${analyzedApplicantCount(job) === 1 ? "" : "s"} for ${title}`,
    },
    {
      label: "STRONG",
      value: strongMatchCount(job),
    },
    {
      label: "READY",
      value: readyToSubmitCount(job),
    },
  ];

  return (
    <article
      className={`flex cursor-pointer flex-col overflow-hidden rounded-lg bg-white transition-shadow ${
        isSelected
          ? "border-2 border-[color:var(--brand-primary)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--brand-primary)_35%,transparent)]"
          : "border border-[#E5E7EB] hover:border-[color:color-mix(in_srgb,var(--brand-primary)_45%,#E5E7EB)]"
      }`}
      onClick={(event) => {
        if (!canSelect) return;
        if (!selectionMode) {
          const target = event.target as HTMLElement;
          if (target.closest("a, button")) return;
        }
        onToggleSelect?.(job.id);
      }}
      onKeyDown={(event) => {
        if (!canSelect) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggleSelect?.(job.id);
        }
      }}
      role={canSelect ? "button" : undefined}
      tabIndex={canSelect ? 0 : undefined}
      aria-pressed={canSelect ? isSelected : undefined}
      aria-label={canSelect ? `${isSelected ? "Deselect" : "Select"} ${title}` : undefined}
    >
      <div className="flex items-start px-3 pb-1.5 pt-3">
        <div className="flex min-h-[31px] w-full items-start justify-between gap-1">
          <div className="min-w-0 flex-1">
            {blockNavigation ? (
              <p className="truncate font-[Inter,sans-serif] text-xs font-semibold leading-4 text-black">
                {title}
              </p>
            ) : (
              <Link
                href={`/admin_recruiter/jobs/${job.id}`}
                className="block truncate font-[Inter,sans-serif] text-xs font-semibold leading-4 text-black hover:underline"
                onMouseEnter={() => prefetchJobDetails(job.id)}
                onFocus={() => prefetchJobDetails(job.id)}
              >
                {title}
              </Link>
            )}
            <p className="truncate font-[Inter,sans-serif] text-[10px] font-light leading-[15px] text-[#6B7280]">
              {location}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="inline-flex items-center justify-center rounded-full border border-[#94A3B8] bg-white px-2 py-0.5 font-[Inter,sans-serif] text-[10px] font-semibold leading-[15px] text-[#374151]">
              {gridStatusLabel(job)}
            </span>
            {isHot ? (
              <span className="inline-flex items-center justify-center rounded-full bg-[#E11D48] px-2 py-0.5 font-[Inter,sans-serif] text-[10px] font-semibold leading-[15px] text-white">
                Hot
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-y border-[#E5E7EB] px-3 py-2.5">
        {metrics.map((metric) => {
          const metricClassName =
            "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded bg-[#F8F8F8] px-1 py-1.5 text-center";
          const body = (
            <>
              <p className="w-full font-[Inter,sans-serif] text-xs font-semibold leading-4 text-black">
                {metric.value}
              </p>
              <p className="w-full font-[Inter,sans-serif] text-[8px] font-normal leading-none text-[#6B7280]">
                {metric.label}
              </p>
            </>
          );
          if (!blockNavigation && "href" in metric && metric.href) {
            return (
              <Link
                key={metric.label}
                href={metric.href}
                aria-label={metric.ariaLabel}
                title={metric.ariaLabel}
                className={`${metricClassName} cursor-pointer transition hover:bg-[#F1F5F9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]`}
              >
                {body}
              </Link>
            );
          }
          return (
            <div key={metric.label} className={metricClassName}>
              {body}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <JobSourceTypeBadge job={job} />
        {!blockNavigation ? (
          <div className="flex shrink-0 items-center gap-2">
            {publicHref ? (
              <Link
                href={publicHref}
                target="_blank"
                rel="noopener noreferrer"
                className={iconButtonClass()}
                aria-label={`Open public page for ${title}`}
                title="Public view"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={JOB_OPEN_ICON_SRC}
                  alt=""
                  width={14}
                  height={14}
                  className="size-[14px] shrink-0"
                  aria-hidden
                />
              </Link>
            ) : (
              <span className={iconButtonClass(true)} title="Publish this job to view the public page">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={JOB_OPEN_ICON_SRC}
                  alt=""
                  width={14}
                  height={14}
                  className="size-[14px] shrink-0"
                  aria-hidden
                />
              </span>
            )}
            <button
              type="button"
              className={menuTriggerClass(menuOpen)}
              aria-label={`More actions for ${title}`}
              title="More actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={(event) => {
                event.stopPropagation();
                onOpenMenu(job, event.currentTarget);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={JOB_DOTS_ICON_SRC}
                alt=""
                width={14}
                height={14}
                className="size-[14px] shrink-0 rotate-90"
                aria-hidden
              />
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function JobsGridView({
  jobs,
  loading,
  emptyMessage,
  tenantSlug,
  hotJobIds,
  selectedIds,
  onToggleSelect,
  selectionMode = false,
  padded = true,
  infiniteScrollPageSize,
  onAddCandidate,
  onImportCandidates,
  onDelete,
  onArchive,
  onUnarchive,
}: JobsGridViewProps) {
  const [openMenu, setOpenMenu] = useState<{ job: JobListRow; anchor: HTMLElement } | null>(null);

  useEffect(() => {
    if (selectionMode) setOpenMenu(null);
  }, [selectionMode]);
  const pageSize =
    typeof infiniteScrollPageSize === "number" && infiniteScrollPageSize > 0
      ? Math.floor(infiniteScrollPageSize)
      : null;
  const infiniteEnabled = pageSize != null;
  const [visibleCount, setVisibleCount] = useState(pageSize ?? jobs.length);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadLockRef = useRef(false);
  const jobsSignature = jobs.map((job) => job.id).join("|");

  useEffect(() => {
    if (!infiniteEnabled || pageSize == null) {
      setVisibleCount(jobs.length);
      setIsLoadingMore(false);
      loadLockRef.current = false;
      return;
    }
    setVisibleCount(Math.min(pageSize, jobs.length));
    setIsLoadingMore(false);
    loadLockRef.current = false;
  }, [infiniteEnabled, pageSize, jobsSignature, jobs.length]);

  const visibleJobs = infiniteEnabled ? jobs.slice(0, visibleCount) : jobs;
  const hasMore = infiniteEnabled && visibleCount < jobs.length;

  const loadNextPage = useCallback(() => {
    if (!infiniteEnabled || pageSize == null || loadLockRef.current) return;
    if (visibleCount >= jobs.length) return;
    loadLockRef.current = true;
    setIsLoadingMore(true);
    window.setTimeout(() => {
      setVisibleCount((current) => Math.min(current + pageSize, jobs.length));
      setIsLoadingMore(false);
      loadLockRef.current = false;
    }, JOBS_GRID_LOAD_MORE_DELAY_MS);
  }, [infiniteEnabled, pageSize, visibleCount, jobs.length]);

  useEffect(() => {
    if (!hasMore || isLoadingMore) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        loadNextPage();
      },
      { root: null, rootMargin: "240px 0px", threshold: 0 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadNextPage, visibleCount]);

  if (loading) {
    return (
      <CandidatesListSkeleton
        view="card"
        rows={8}
        label="Loading jobs"
        cardGridClassName="grid grid-cols-1 gap-5 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        cardClassName="min-h-[200px] animate-pulse rounded-xl border border-[#E5E7EB] bg-gradient-to-br from-[#F8FAFC] to-[#EEF2F7]"
      />
    );
  }

  if (jobs.length === 0) {
    return <p className="px-4 py-12 text-center text-sm text-[#64748B]">{emptyMessage}</p>;
  }

  return (
    <>
      <div
        className={`grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${padded ? "p-4" : ""}`}
      >
        {visibleJobs.map((job) => (
          <JobGridCard
            key={job.id}
            job={job}
            tenantSlug={tenantSlug}
            isHot={Boolean(job.is_hot) || (hotJobIds?.has(job.id) ?? false)}
            isSelected={selectedIds?.has(job.id) ?? false}
            menuOpen={openMenu?.job.id === job.id}
            selectionMode={selectionMode}
            onToggleSelect={onToggleSelect}
            onOpenMenu={(nextJob, anchor) => {
              setOpenMenu((current) =>
                current?.job.id === nextJob.id ? null : { job: nextJob, anchor }
              );
            }}
          />
        ))}
      </div>

      {infiniteEnabled && (hasMore || isLoadingMore) ? (
        <div
          ref={sentinelRef}
          className="flex w-full items-center justify-center gap-2 py-5"
          aria-live="polite"
          aria-busy={isLoadingMore}
        >
          {isLoadingMore ? (
            <>
              <span className="font-[Inter,sans-serif] text-sm font-medium leading-5 text-[#94A3B8]">
                Show more
              </span>
              <Loader2
                className="size-4 shrink-0 animate-spin text-[#CBD5E1]"
                strokeWidth={2}
                aria-hidden
              />
              <span className="sr-only">Loading more jobs</span>
            </>
          ) : (
            <span className="h-4 w-px" aria-hidden />
          )}
        </div>
      ) : null}

      {openMenu ? (
        <JobGridCardMenu
          job={openMenu.job}
          anchor={openMenu.anchor}
          onClose={() => setOpenMenu(null)}
          onAddCandidate={onAddCandidate}
          onImportCandidates={onImportCandidates}
          onDelete={onDelete}
          onArchive={onArchive}
          onUnarchive={onUnarchive}
        />
      ) : null}
    </>
  );
}

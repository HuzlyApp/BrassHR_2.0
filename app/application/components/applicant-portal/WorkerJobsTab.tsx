"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MapPin, Search, X } from "lucide-react";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import {
  JobsViewToggle,
  type JobsListingView,
} from "@/app/admin_recruiter/jobs/JobsViewToggle";
import SearchableSelectField from "@/app/tenant-onboarding/SearchableSelectField";
import { applicantPortalApiPath, resolveApplicantPortalTenantSlug } from "@/lib/applicant-portal/client-tenant";
import type { WorkerJobApplicationListItem } from "@/lib/applicant-portal/list-worker-job-applications";
import { jobDescriptionPlainText } from "@/lib/jobs/job-description-html";
import {
  normalizeJobToken,
  publicJobDisplayTitle,
} from "@/lib/jobs/public-application-routing";
import { normalizeApplicationStatus } from "@/lib/jobs/application-status";
import { useUsLocationOptions } from "@/lib/location/use-us-location-options";
import { useApplicantPortal } from "./ApplicantPortalProvider";
import { WORKER_BTN_OUTLINE, WORKER_BTN_PRIMARY, WORKER_BTN_PRIMARY_SM } from "./worker-portal-buttons";
import { SERVICE_AREA_COPY } from "@/lib/service-area/copy";
import { normalizeStateCode } from "@/lib/service-area/normalize";
import { useServiceAreaPreview } from "@/lib/service-area/use-service-area-preview";
import {
  WORKER_PORTAL_PAGE_PAD_CLASS,
  WORKER_SCHEDULE_CARD_CLASS,
  WORKER_SCHEDULE_SUBTITLE_CLASS,
  WORKER_SCHEDULE_SUBTITLE_STYLE,
  WORKER_SCHEDULE_TITLE_CLASS,
  WORKER_SCHEDULE_TITLE_STYLE,
  WORKER_DOCUMENTS_PAGE_SECTION_TITLE_CLASS,
  WORKER_DOCUMENTS_PAGE_SECTION_TITLE_STYLE,
} from "./worker-schedule-typography";

type WorkerFacingStatus = "Open" | "Under Review" | "Hired" | "Rejected";

function workerFacingJobStatus(application: WorkerJobApplicationListItem | null): {
  label: WorkerFacingStatus;
  badgeClass: string;
  useBrand?: boolean;
} {
  if (!application) {
    return {
      label: "Open",
      badgeClass:
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
      useBrand: true,
    };
  }

  const pipeline = normalizeApplicationStatus(application.status);
  const name = (application.statusName || "").trim().toLowerCase();

  if (
    pipeline === "hired" ||
    name === "hired" ||
    name === "approved" ||
    name.includes("hired")
  ) {
    return {
      label: "Hired",
      badgeClass:
        "inline-flex items-center rounded-full bg-[#DCFCE7] px-2.5 py-1 text-xs font-medium text-[#15803D]",
    };
  }

  if (
    pipeline === "rejected" ||
    name === "rejected" ||
    name === "declined" ||
    name.includes("reject")
  ) {
    return {
      label: "Rejected",
      badgeClass:
        "inline-flex items-center rounded-full bg-[#FEE2E2] px-2.5 py-1 text-xs font-medium text-[#B91C1C]",
    };
  }

  // Applied / in-progress pipeline statuses (new, reviewing, interviewing, etc.)
  return {
    label: "Under Review",
    badgeClass:
      "inline-flex items-center rounded-full bg-[#DBEAFE] px-2.5 py-1 text-xs font-medium text-[#1D4ED8]",
  };
}

type PublicJob = {
  id?: string;
  public_job_token: string;
  public_title: string;
  source_job_title?: string | null;
  source_type?: string | null;
  public_description: string | null;
  location: string | null;
  schedule: string | null;
  employment_type: string | null;
  published_at: string | null;
  application_deadline?: string | null;
  pay_rate_min?: number | null;
  pay_rate_max?: number | null;
  professions: { name?: string } | { name?: string }[] | null;
  specialties: { name?: string } | { name?: string }[] | null;
};

type WorkerJobRow = {
  job: PublicJob;
  token: string;
  title: string;
  location: string;
  employmentType: string;
  profession: string;
  specialty: string;
  description: string;
  publishedAt: string | null;
  application: WorkerJobApplicationListItem | null;
  applied: boolean;
};

const FILTER_INPUT_CLASS =
  "h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm text-[#0F172A] outline-none transition placeholder:text-[#94A3B8] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--brand-primary)_20%,transparent)]";

const APPLY_ZIP_INPUT_CLASS =
  "mt-1 h-11 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm text-[#0F172A] outline-none transition placeholder:text-[#94A3B8] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--brand-primary)_20%,transparent)]";

const APPLY_RADIO_CLASS =
  "h-4 w-4 shrink-0 cursor-pointer accent-[color:var(--brand-checkbox,var(--brand-primary))]";

const SELECT_CHEVRON = {
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="#94A3B8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  )}")`,
} as const;

function relationName(value: PublicJob["professions"]): string {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.name?.trim() || "";
}

function formatAppliedDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { timeZone: "America/New_York", 
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function workTypeBadgeClass(workType: string): string {
  const value = workType.trim().toUpperCase();
  if (value === "1099") return "bg-[#F3E8FF] text-[#7E22CE]";
  if (value === "W2") return "bg-[#DBEAFE] text-[#1D4ED8]";
  if (value === "CONTRACT") return "bg-[#FFEDD5] text-[#C2410C]";
  return "bg-[#F1F5F9] text-[#475569]";
}

function StatusBadge({ status }: { status: ReturnType<typeof workerFacingJobStatus> }) {
  return (
    <span
      className={status.badgeClass}
      style={
        status.useBrand
          ? {
              backgroundColor: "color-mix(in srgb, var(--brand-primary) 16%, white)",
              color: "var(--brand-primary)",
            }
          : undefined
      }
    >
      {status.label}
    </span>
  );
}

function JobApplyAction({
  row,
  fullWidth = false,
  onApply,
}: {
  row: WorkerJobRow;
  fullWidth?: boolean;
  onApply: (row: WorkerJobRow) => void;
}) {
  if (row.applied) {
    return (
      <span
        className={`inline-flex h-9 items-center justify-center rounded-md border border-[#E5E7EB] px-3 text-xs font-semibold text-[#64748B] ${
          fullWidth ? "w-full" : ""
        }`}
      >
        Applied
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`${WORKER_BTN_PRIMARY_SM} ${fullWidth ? "w-full sm:w-auto" : ""}`}
      onClick={() => onApply(row)}
    >
      Apply
    </button>
  );
}

function JobMobileListCard({
  row,
  index,
  onApply,
}: {
  row: WorkerJobRow;
  index: number;
  onApply: (row: WorkerJobRow) => void;
}) {
  const status = workerFacingJobStatus(row.application);
  return (
    <article className="border-b border-[#F1F5F9] px-3 py-4 last:border-b-0 sm:px-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <span className="shrink-0 text-sm font-semibold leading-5 text-[color:var(--brand-primary)]">
            {index}.
          </span>
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold leading-5 text-[#0F172A]">{row.title}</p>
            {row.profession ? (
              <p className="mt-0.5 text-xs text-[#64748B]">
                {row.profession}
                {row.specialty ? ` · ${row.specialty}` : ""}
              </p>
            ) : null}
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="mt-3 space-y-2 text-sm text-[#334155]">
        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#94A3B8]" aria-hidden />
          <span className="min-w-0 break-words">{row.location}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {row.employmentType ? (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${workTypeBadgeClass(row.employmentType)}`}
            >
              {row.employmentType}
            </span>
          ) : null}
          <span className="text-xs text-[#64748B]">
            Applied: {row.applied ? formatAppliedDate(row.application?.appliedAt) : "—"}
          </span>
        </div>
      </div>

      <div className="mt-3">
        <JobApplyAction row={row} fullWidth onApply={onApply} />
      </div>
    </article>
  );
}

function JobGridCard({
  row,
  index,
  onApply,
}: {
  row: WorkerJobRow;
  index: number;
  onApply: (row: WorkerJobRow) => void;
}) {
  const status = workerFacingJobStatus(row.application);

  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex min-w-0 items-start gap-2 break-words text-lg font-semibold leading-6 text-[#0F172A]">
          <span className="shrink-0 text-[color:var(--brand-primary)]">{index}.</span>
          <span className="min-w-0">{row.title}</span>
        </h3>
        {row.employmentType ? (
          <span className="shrink-0 rounded-full bg-[color:color-mix(in_srgb,var(--brand-primary)_14%,white)] px-2.5 py-1 text-xs font-semibold text-[color:var(--brand-primary)]">
            {row.employmentType}
          </span>
        ) : null}
      </div>

      {row.profession ? (
        <p className="mt-2 text-sm font-medium text-[#334155]">{row.profession}</p>
      ) : null}
      {row.specialty ? <p className="mt-1 text-sm text-[#64748B]">{row.specialty}</p> : null}
      <p className="mt-2 text-sm font-medium text-[#64748B]">{row.location}</p>

      <p className="mt-4 line-clamp-3 flex-1 text-sm leading-6 text-[#64748B]">
        {row.description || "No description provided."}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={status} />
        {row.applied ? (
          <span className="text-xs text-[#64748B]">
            Applied {formatAppliedDate(row.application?.appliedAt)}
          </span>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {row.applied ? (
          <span className="inline-flex h-10 items-center justify-center rounded-lg border border-[#E5E7EB] px-4 text-sm font-semibold text-[#64748B]">
            Applied
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onApply(row)}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[color:var(--brand-primary)] px-4 text-sm font-semibold text-white transition hover:brightness-95"
          >
            Apply
          </button>
        )}
      </div>
    </article>
  );
}

type RelocateChoice = "onsite" | "relocate" | "remote";

function ApplyConfirmModal({
  open,
  jobTitle,
  jobLocation,
  submitting,
  error,
  workCity,
  workState,
  workPostal,
  relocate,
  previewMessage,
  previewLoading,
  submitDisabled,
  onWorkCity,
  onWorkState,
  onWorkPostal,
  onRelocate,
  onClose,
  onConfirm,
}: {
  open: boolean;
  jobTitle: string;
  jobLocation: string;
  submitting: boolean;
  error: string | null;
  workCity: string;
  workState: string;
  workPostal: string;
  relocate: RelocateChoice | "";
  previewMessage: string | null;
  previewLoading: boolean;
  submitDisabled: boolean;
  onWorkCity: (value: string) => void;
  onWorkState: (value: string) => void;
  onWorkPostal: (value: string) => void;
  onRelocate: (value: RelocateChoice) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const {
    stateOptions,
    cityOptions,
    locationLoading,
    citiesLoading,
    displayStateValue,
  } = useUsLocationOptions(workState, open);

  const effectiveCityOptions = useMemo(() => {
    const current = workCity.trim();
    if (!current || cityOptions.includes(current)) return cityOptions;
    return [...cityOptions, current].sort((a, b) => a.localeCompare(b));
  }, [workCity, cityOptions]);

  useEffect(() => {
    if (!open) return;
    const current = workCity.trim();
    if (!current || cityOptions.length === 0) return;
    if (cityOptions.includes(current)) return;
    const match = cityOptions.find(
      (option) => option.toLowerCase() === current.toLowerCase()
    );
    if (match) onWorkCity(match);
  }, [open, workCity, cityOptions, onWorkCity]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="worker-apply-job-title"
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-xl border border-[#E5E7EB] bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#E5E7EB] px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h3 id="worker-apply-job-title" className="text-base font-semibold text-[#0F172A]">
              Apply for job
            </h3>
            <p className="mt-1 break-words text-sm text-[#64748B]" title={jobTitle}>
              {jobTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#64748B] transition hover:bg-[#F1F5F9]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-5 sm:px-5">
          <p className="text-sm text-[#64748B]">
            Confirm where you will work this job. Home address, school, and travel city are not used.
            Your latest uploaded resume from Documents will be attached automatically.
          </p>

          <SearchableSelectField
            label="Work state"
            required
            compact
            loading={locationLoading}
            disabled={submitting || locationLoading}
            value={displayStateValue}
            onChange={(value) => {
              onWorkState(value);
              onWorkCity("");
            }}
            placeholder="Search state"
            searchPlaceholder="Type to search states"
            options={stateOptions}
            emptyMessage="No states found. Try another search."
          />

          <SearchableSelectField
            label="Work city"
            required
            compact
            loading={citiesLoading}
            disabled={
              submitting ||
              !displayStateValue ||
              citiesLoading ||
              (!cityOptions.length && !workCity.trim())
            }
            value={workCity}
            onChange={onWorkCity}
            placeholder={
              !displayStateValue
                ? "Select state first"
                : citiesLoading
                  ? "Loading…"
                  : "Search city"
            }
            searchPlaceholder="Type to search cities"
            options={effectiveCityOptions}
            emptyMessage="No cities found. Try another search."
          />

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[#0F172A]" htmlFor="worker-work-zip">
              ZIP (optional)
            </label>
            <input
              id="worker-work-zip"
              inputMode="numeric"
              autoComplete="postal-code"
              className={APPLY_ZIP_INPUT_CLASS}
              value={workPostal}
              disabled={submitting}
              onChange={(event) => onWorkPostal(event.target.value.replace(/\D/g, "").slice(0, 5))}
              placeholder="Code"
            />
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-[#0F172A]">
              Will you work on-site{jobLocation ? ` at ${jobLocation}` : ""}?
            </legend>
            {(
              [
                { value: "onsite", label: "Yes" },
                { value: "relocate", label: "Yes, I will relocate" },
                { value: "remote", label: "No, I would work remote from the location above" },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className="mt-2.5 flex cursor-pointer items-center gap-2.5 text-sm text-[#334155]"
              >
                <input
                  type="radio"
                  name="worker-relocate"
                  className={APPLY_RADIO_CLASS}
                  checked={relocate === option.value}
                  disabled={submitting}
                  onChange={() => onRelocate(option.value)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
          {previewMessage ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {previewMessage}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[#E5E7EB] px-4 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-5">
          <button type="button" disabled={submitting} onClick={onClose} className={WORKER_BTN_OUTLINE}>
            Cancel
          </button>
          <button
            type="button"
            disabled={submitDisabled || submitting || previewLoading}
            className={WORKER_BTN_PRIMARY}
            onClick={onConfirm}
          >
            {submitting ? "Applying…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WorkerJobsTab() {
  const { sessionReady, authHeaders } = useApplicantPortal();
  const branding = useTenantBranding();
  const searchParams = useSearchParams();
  const tenantSlug =
    branding.slug?.trim().toLowerCase() || resolveApplicantPortalTenantSlug() || "";
  const initialQuery = (searchParams?.get("q") ?? "").trim();

  const [jobsTab, setJobsTab] = useState<"active" | "applied">("active");
  const [view, setView] = useState<JobsListingView>("list");
  const [query, setQuery] = useState(initialQuery);
  const [employmentType, setEmploymentType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [applications, setApplications] = useState<WorkerJobApplicationListItem[]>([]);

  const [applyJob, setApplyJob] = useState<WorkerJobRow | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [workCity, setWorkCity] = useState("");
  const [workState, setWorkState] = useState("");
  const [workPostal, setWorkPostal] = useState("");
  const [relocate, setRelocate] = useState<RelocateChoice | "">("");

  const applyLocation = useMemo(() => {
    const stateCode = normalizeStateCode(workState);
    return applyJob && workCity.trim() && stateCode && relocate
      ? {
          city: workCity.trim(),
          state: stateCode,
          postalCode: workPostal.trim() || undefined,
          locationType: relocate === "remote" ? ("remote" as const) : ("onsite" as const),
          relocateToJobSite: relocate === "relocate" || relocate === "onsite",
        }
      : null;
  }, [applyJob, workCity, workState, workPostal, relocate]);
  const applyPreview = useServiceAreaPreview(applyLocation, "apply", {
    jobToken: applyJob?.token,
    tenantSlug,
    publicClient: true,
    enabled: Boolean(applyJob),
  });

  useEffect(() => {
    const next = (searchParams?.get("q") ?? "").trim();
    setQuery(next);
  }, [searchParams]);

  const load = useCallback(async () => {
    if (!sessionReady) return;
    if (!tenantSlug) {
      setError("Tenant could not be resolved. Refresh the page and try again.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      if (!headers) throw new Error("You need to sign in again.");

      const params = new URLSearchParams({
        tenant: tenantSlug,
        page: "1",
        pageSize: "50",
      });
      if (query.trim()) params.set("q", query.trim());
      if (employmentType) params.set("employmentType", employmentType);

      const [jobsRes, appsRes] = await Promise.all([
        fetch(`/api/public/jobs?${params}`, { cache: "no-store" }),
        fetch(applicantPortalApiPath("/api/applicant-portal/applications"), {
          headers,
          cache: "no-store",
        }),
      ]);

      const jobsPayload = (await jobsRes.json().catch(() => ({}))) as {
        jobs?: PublicJob[];
        error?: string;
      };
      const appsPayload = (await appsRes.json().catch(() => ({}))) as {
        applications?: WorkerJobApplicationListItem[];
        error?: string;
      };

      if (!jobsRes.ok) throw new Error(jobsPayload.error || "Could not load active jobs.");
      if (!appsRes.ok) throw new Error(appsPayload.error || "Could not load applications.");

      setJobs(jobsPayload.jobs ?? []);
      setApplications(appsPayload.applications ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load jobs.");
      setJobs([]);
      setApplications([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, employmentType, query, sessionReady, tenantSlug]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  const applicationByJobId = useMemo(() => {
    const map = new Map<string, WorkerJobApplicationListItem>();
    for (const app of applications) {
      const key = app.jobRequisitionId.trim();
      if (key && !map.has(key)) map.set(key, app);
    }
    return map;
  }, [applications]);

  const rows = useMemo<WorkerJobRow[]>(() => {
    return jobs
      .map((job) => {
        const token = normalizeJobToken(job.public_job_token) || "";
        const jobId = String(job.id ?? "").trim();
        const application = jobId ? applicationByJobId.get(jobId) ?? null : null;
        return {
          job,
          token,
          title: publicJobDisplayTitle(job),
          location: job.location?.trim() || "—",
          employmentType: job.employment_type?.trim() || "",
          profession: relationName(job.professions),
          specialty: relationName(job.specialties),
          description: jobDescriptionPlainText(job.public_description || ""),
          publishedAt: job.published_at,
          application,
          applied: Boolean(application),
        };
      })
      .filter((row) => Boolean(row.token));
  }, [applicationByJobId, jobs]);

  const appliedRows = useMemo<WorkerJobRow[]>(() => {
    // Source of truth = applications API (keeps closed/unpublished/removed-from-board jobs).
    const activeByJobId = new Map(
      rows
        .map((row) => [String(row.job.id ?? "").trim(), row] as const)
        .filter(([id]) => Boolean(id))
    );
    const q = query.trim().toLowerCase();

    return applications
      .map((app) => {
        const active = activeByJobId.get(app.jobRequisitionId.trim());
        // Prefer live active-job details when still published; otherwise use application snapshot.
        if (active) {
          return {
            ...active,
            application: app,
            applied: true,
            title: app.jobTitle || active.title,
            employmentType: app.workType?.trim() || active.employmentType,
            location: active.location !== "—" ? active.location : app.location?.trim() || "—",
          } satisfies WorkerJobRow;
        }

        return {
          job: {
            id: app.jobRequisitionId,
            public_job_token: app.jobRequisitionId,
            public_title: app.jobTitle,
            public_description: null,
            location: app.location || null,
            schedule: null,
            employment_type: app.workType || null,
            published_at: null,
            professions: null,
            specialties: null,
          },
          token: app.jobRequisitionId || app.id,
          title: app.jobTitle || "Untitled job",
          location: app.location?.trim() || "—",
          employmentType: app.workType?.trim() || "",
          profession: "",
          specialty: "",
          description: "",
          publishedAt: null,
          application: app,
          applied: true,
        } satisfies WorkerJobRow;
      })
      .filter((row) => {
        if (q) {
          const haystack = `${row.title} ${row.profession} ${row.specialty} ${row.location}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        if (employmentType && row.employmentType !== employmentType) return false;
        return true;
      });
  }, [applications, employmentType, query, rows]);

  const displayRows = jobsTab === "active" ? rows : appliedRows;
  const listTitle = jobsTab === "active" ? "Active jobs" : "Applied jobs";
  const listCountLabel =
    jobsTab === "active"
      ? `${displayRows.length} open ${displayRows.length === 1 ? "position" : "positions"}`
      : `${displayRows.length} applied ${displayRows.length === 1 ? "job" : "jobs"}`;
  const emptyMessage =
    jobsTab === "active"
      ? "There are no active jobs right now."
      : "You have not applied to any jobs yet.";
  const loadingMessage =
    jobsTab === "active" ? "Loading active jobs…" : "Loading applied jobs…";

  function openApplyModal(row: WorkerJobRow) {
    if (row.applied) return;
    setApplyJob(row);
    setApplyError(null);
    setWorkCity("");
    setWorkState("");
    setWorkPostal("");
    setRelocate("");
  }

  async function submitApplication() {
    if (!applyJob || !applyLocation || applyPreview.allowed === false) return;
    setApplying(true);
    setApplyError(null);
    try {
      const headers = await authHeaders();
      if (!headers) throw new Error("You need to sign in again.");
      const res = await fetch(applicantPortalApiPath("/api/applicant-portal/jobs/apply"), {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ jobToken: applyJob.token, workLocation: applyLocation }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string | { messageKey?: string; code?: string };
      };
      if (!res.ok) {
        const message =
          typeof payload.error === "string"
            ? payload.error
            : payload.error?.messageKey
              ? SERVICE_AREA_COPY[payload.error.messageKey as keyof typeof SERVICE_AREA_COPY] ??
                SERVICE_AREA_COPY.location_not_available
              : "Could not apply for this job.";
        throw new Error(message);
      }
      setApplyJob(null);
      await load();
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Could not apply for this job.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className={`${WORKER_PORTAL_PAGE_PAD_CLASS} max-w-full overflow-x-hidden pb-8`}>
      <div className="mb-4 min-w-0 sm:mb-5">
        <h1 className={WORKER_SCHEDULE_TITLE_CLASS} style={WORKER_SCHEDULE_TITLE_STYLE}>
          Jobs
        </h1>
        <p
          className={`${WORKER_SCHEDULE_SUBTITLE_CLASS} text-[14px] sm:text-[16px]`}
          style={WORKER_SCHEDULE_SUBTITLE_STYLE}
        >
          Browse active openings and apply with a resume from your Documents.
        </p>
      </div>

      <section className={`${WORKER_SCHEDULE_CARD_CLASS} mb-4 p-3 sm:mb-5 sm:p-4`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="relative block w-full min-w-0 sm:w-[280px] sm:max-w-[320px] sm:shrink-0">
            <span className="sr-only">Search jobs</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title or keyword"
              className={`${FILTER_INPUT_CLASS} pl-9`}
            />
          </label>
          <label className="block w-full min-w-0 sm:w-[180px] sm:shrink-0">
            <span className="sr-only">Work type</span>
            <select
              value={employmentType}
              onChange={(event) => setEmploymentType(event.target.value)}
              style={SELECT_CHEVRON}
              className={`${FILTER_INPUT_CLASS} cursor-pointer appearance-none bg-[length:12px_12px] bg-[right_12px_center] bg-no-repeat pr-9`}
            >
              <option value="">Work type</option>
              <option value="W2">W2</option>
              <option value="1099">1099</option>
              <option value="Contract">Contract</option>
            </select>
          </label>
          <div className="shrink-0 self-end sm:ml-auto sm:self-center">
            <JobsViewToggle value={view} onChange={setView} />
          </div>
        </div>
      </section>

      <nav className="mb-4 min-w-0 sm:mb-5" aria-label="Jobs sections">
        <div className="flex flex-wrap items-end gap-4 px-1 sm:gap-5">
          {(
            [
              { id: "active", label: "Active all jobs" },
              { id: "applied", label: "Applied jobs" },
            ] as const
          ).map((tab) => {
            const active = jobsTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setJobsTab(tab.id)}
                className={`inline-flex shrink-0 flex-col items-center whitespace-nowrap border-b-2 px-1 pb-3 text-[13px] leading-5 transition sm:text-[14px] ${
                  active
                    ? "border-[color:var(--brand-primary)] font-medium text-[color:var(--brand-primary)]"
                    : "border-transparent font-normal text-[#012352] hover:border-[color:color-mix(in_srgb,var(--brand-primary)_25%,transparent)] hover:text-[color:var(--brand-primary)]"
                }`}
                style={WORKER_SCHEDULE_SUBTITLE_STYLE}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      <section className={`${WORKER_SCHEDULE_CARD_CLASS} min-w-0`}>
        <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] px-3 py-3 sm:px-4 sm:py-4">
          <div className="min-w-0">
            <h2
              className={WORKER_DOCUMENTS_PAGE_SECTION_TITLE_CLASS}
              style={WORKER_DOCUMENTS_PAGE_SECTION_TITLE_STYLE}
            >
              {listTitle}
            </h2>
            <p className="mt-1 text-sm text-[#64748B]">{listCountLabel}</p>
          </div>
        </div>

        {loading ? (
          <p className="px-3 py-8 text-sm text-[#64748B] sm:px-4 sm:py-10">{loadingMessage}</p>
        ) : error ? (
          <p className="px-3 py-8 text-sm text-[#B91C1C] sm:px-4 sm:py-10">{error}</p>
        ) : displayRows.length === 0 ? (
          <p className="px-3 py-8 text-sm text-[#64748B] sm:px-4 sm:py-10">{emptyMessage}</p>
        ) : view === "list" ? (
          <>
            {/* Mobile / tablet / small laptop: stacked cards (table needs ~xl width with sidebar) */}
            <div className="xl:hidden">
              {displayRows.map((row, index) => (
                <JobMobileListCard
                  key={`${jobsTab}-${row.token}-${row.application?.id ?? "open"}`}
                  row={row}
                  index={index + 1}
                  onApply={(next) => void openApplyModal(next)}
                />
              ))}
            </div>

            {/* Wide desktop: table */}
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[880px] table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-[28%]" />
                  <col className="w-[22%]" />
                  <col className="w-[12%]" />
                  <col className="w-[14%]" />
                  <col className="w-[12%]" />
                  <col className="w-[12%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-[#E5E7EB] text-sm font-medium text-[#64748B]">
                    <th className="px-3 py-3 font-medium xl:px-4">Job title</th>
                    <th className="px-3 py-3 font-medium xl:px-4">Location</th>
                    <th className="px-3 py-3 text-center font-medium xl:px-4">Work type</th>
                    <th className="px-3 py-3 text-center font-medium xl:px-4">Status</th>
                    <th className="px-3 py-3 font-medium xl:px-4">Applied date</th>
                    <th className="px-3 py-3 text-center font-medium xl:px-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, index) => {
                    const status = workerFacingJobStatus(row.application);
                    return (
                      <tr
                        key={`${jobsTab}-${row.token}-${row.application?.id ?? "open"}`}
                        className="border-b border-[#F1F5F9] last:border-b-0"
                      >
                        <td className="min-w-0 px-3 py-3.5 align-top xl:px-4 xl:py-4">
                          <div className="flex min-w-0 items-start gap-2">
                            <span className="shrink-0 text-sm font-semibold leading-5 text-[color:var(--brand-primary)]">
                              {index + 1}.
                            </span>
                            <div className="min-w-0">
                              <p className="break-words text-sm font-semibold leading-5 text-[#0F172A]">
                                {row.title}
                              </p>
                              {row.profession ? (
                                <p className="mt-0.5 break-words text-xs leading-4 text-[#64748B]">
                                  {row.profession}
                                  {row.specialty ? ` · ${row.specialty}` : ""}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="min-w-0 px-3 py-3.5 align-top text-sm leading-5 text-[#334155] xl:px-4 xl:py-4">
                          <span className="break-words" title={row.location}>
                            {row.location}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-center align-middle xl:px-4 xl:py-4">
                          <div className="flex justify-center">
                            {row.employmentType ? (
                              <span
                                className={`inline-flex max-w-full items-center truncate rounded-full px-2.5 py-1 text-xs font-medium ${workTypeBadgeClass(row.employmentType)}`}
                              >
                                {row.employmentType}
                              </span>
                            ) : (
                              <span className="text-sm text-[#94A3B8]">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-center align-middle xl:px-4 xl:py-4">
                          <div className="flex justify-center">
                            <StatusBadge status={status} />
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 align-top text-sm text-[#334155] xl:px-4 xl:py-4">
                          {row.applied ? formatAppliedDate(row.application?.appliedAt) : "—"}
                        </td>
                        <td className="px-3 py-3.5 text-center align-middle xl:px-4 xl:py-4">
                          <div className="flex justify-center">
                            <JobApplyAction
                              row={row}
                              onApply={(next) => void openApplyModal(next)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-3 sm:p-4 md:grid-cols-2 lg:grid-cols-2">
            {displayRows.map((row, index) => (
              <JobGridCard
                key={`${jobsTab}-${row.token}-${row.application?.id ?? "open"}`}
                row={row}
                index={index + 1}
                onApply={(next) => void openApplyModal(next)}
              />
            ))}
          </div>
        )}
      </section>

      <ApplyConfirmModal
        open={Boolean(applyJob)}
        jobTitle={applyJob?.title || ""}
        jobLocation={applyJob?.location || ""}
        submitting={applying}
        error={applyError}
        workCity={workCity}
        workState={workState}
        workPostal={workPostal}
        relocate={relocate}
        previewMessage={applyPreview.message}
        previewLoading={applyPreview.loading}
        submitDisabled={!applyLocation || applyPreview.allowed === false || applyPreview.loading}
        onWorkCity={setWorkCity}
        onWorkState={setWorkState}
        onWorkPostal={setWorkPostal}
        onRelocate={setRelocate}
        onClose={() => {
          if (applying) return;
          setApplyJob(null);
          setApplyError(null);
        }}
        onConfirm={() => void submitApplication()}
      />
    </div>
  );
}

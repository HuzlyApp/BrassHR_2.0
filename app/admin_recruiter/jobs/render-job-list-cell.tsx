import type { ReactNode } from "react"
import Link from "next/link"
import { MoreHorizontal } from "lucide-react"
import type { JobColumnId, JobSortField } from "./job-columns"
import JobPublishToggle from "./JobPublishToggle"
import { JobListStatusDropdown } from "./JobListStatusDropdown"
import { isJobRequisitionOpen } from "@/lib/jobs/public-application-routing"
import { buildPublicJobSharePath } from "@/lib/jobs/public-job-share"
import { normalizeJobRequisitionStatus } from "@/lib/jobs/job-status"
import { isMspRecruitAndRelease, placementTypeFromApiRow } from "@/lib/jobs/placement"
import type { JobStatus, SourceType } from "@/lib/jobs/types"
import { employmentTypeDisplayLabel } from "@/lib/jobs/employment-type"
import { prefetchJobDetails } from "@/lib/admin/staff-detail-fetch-cache"
import { DraftJobIncompleteInfoIcon } from "./DraftJobIncompleteInfoIcon"
import { StaffProfileAvatar } from "@/app/admin_recruiter/components/StaffProfileAvatar"
import { formatCityState } from "@/lib/location/city-state"

const JOB_CANDIDATE_ICONS = {
  all: "/fluent_people-28-regular.svg",
  new: "/fluent_person-add-24-regular.svg",
  inProcess: "/fluent_people-28-regular.svg",
} as const

type JobCandidateMetricTone = "all" | "new" | "inProcess"

const JOB_CANDIDATE_METRIC_TONES: Record<
  JobCandidateMetricTone,
  { wrap: string; iconFilter?: string }
> = {
  all: {
    wrap: "border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]",
    iconFilter:
      "brightness(0) saturate(100%) invert(37%) sepia(98%) saturate(1456%) hue-rotate(204deg) brightness(95%) contrast(92%)",
  },
  new: {
    wrap: "border-[#BBF7D0] bg-[#F0FDF4] text-[#16A34A]",
    iconFilter:
      "brightness(0) saturate(100%) invert(42%) sepia(79%) saturate(480%) hue-rotate(88deg) brightness(94%) contrast(92%)",
  },
  inProcess: {
    wrap: "border-[#DDD6FE] bg-[#F5F3FF] text-[#7C3AED]",
    iconFilter:
      "brightness(0) saturate(100%) invert(32%) sepia(74%) saturate(2476%) hue-rotate(246deg) brightness(92%) contrast(93%)",
  },
}

function JobCandidateMetric({
  iconSrc,
  label,
  count,
  href,
  tone,
}: {
  iconSrc: string
  label: string
  count: number
  href?: string
  tone: JobCandidateMetricTone
}) {
  const toneClass = JOB_CANDIDATE_METRIC_TONES[tone]
  const body = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={iconSrc}
        alt=""
        width={12}
        height={12}
        className="h-[12px] w-[12px] shrink-0 object-contain"
        style={toneClass.iconFilter ? { filter: toneClass.iconFilter } : undefined}
        aria-hidden
      />
      <span className="whitespace-nowrap text-xs font-medium leading-4">
        {label} {count}
      </span>
    </>
  )

  const className = `inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 transition hover:opacity-90 ${toneClass.wrap}`

  if (href) {
    return (
      <Link href={href} className={className} aria-label={`${label} ${count}`}>
        {body}
      </Link>
    )
  }

  return <div className={className}>{body}</div>
}

export type JobListRow = {
  id: string
  internal_requisition_number: string | null
  /** MSP Source Job ID / Internal Reference (job form externalRequisitionId). */
  external_requisition_id?: string | null
  public_title: string | null
  public_job_token?: string | null
  employment_type: string
  source_type?: "Internal" | "MSP" | string | null
  placement_type?: string | null
  /** MSP R&R / EOR: source job title from Job Source Details. */
  source_job_title?: string | null
  /** MSP R&R commission fee fields. */
  commission_percent?: number | null
  commission_fixed_amount?: number | null
  /** MSP end client (Contract Group / Client on job form → msp_name). */
  msp_name?: string | null
  msp_client?: string | null
  status: "draft" | "open" | "paused" | "filled" | "closed" | "archived" | "published"
  /** FSD Hot tab — persisted on job_requisitions.is_hot. */
  is_hot?: boolean | null
  /** FSD job tags (⋮ Tags). */
  tags?: string[] | null
  /** FSD assigned recruiter (⋮ Assign recruiter). */
  assigned_recruiter_user_id?: string | null
  created_at: string
  published_at: string | null
  location: string | null
  facility: string | null
  facility_name: string | null
  application_deadline: string | null
  pay_rate_min?: number | null
  pay_rate_max?: number | null
  pay_rate_period?: string | null
  rate_unit?: string | null
  pay_rate?: number | null
  /** "Range" | "Exact amount" | "Starting amount" — from job create. */
  show_pay_by?: string | null
  location_type?: string | null
  schedule?: string | null
  shift_type?: string | null
  /** Text fields used by jobs listing skills search (AND with title query). */
  qualifications?: string | null
  public_description?: string | null
  responsibilities?: string | null
  special_requirements?: string | null
  required_credentials?: string | string[] | null
  professions: { name?: string } | { name?: string }[] | null
  specialties: { name?: string } | { name?: string }[] | null
  onboarding_flows: { name?: string } | { name?: string }[] | null
  job_applications: { count?: number }[] | null
  /** Candidate count — from listInternalJobs, same set as the Job candidates All tab. */
  /** Candidates with status new/submitted — from listInternalJobs. */
  new_application_count?: number
  /** Screening / interview pipeline candidates. */
  in_process_application_count?: number
  /** Best Job candidates `?tab=` for the In Process chip (status with most in-process apps). */
  in_process_redirect_tab?: string | null
  /** Applications with completed AI match analysis. */
  analyzed_application_count?: number
  /** Applications whose AI match score is 90% or higher. */
  strong_match_count?: number
  /** Analyzed applications ready to submit. */
  ready_to_submit_count?: number
  /** Applications with hired status. */
  hired_application_count?: number
  /** User-facing industry key from industry_catalog. */
  industry_key?: string | null
  created_by?: string | null
  createdBy?: { id: string; name: string; profilePhotoUrl: string | null } | null
}

const JOB_FORM_SURFACE_CLASS = "rounded-lg border border-[#CBD5E1] bg-white"

function relationName(value: JobListRow["professions"]): string {
  const row = Array.isArray(value) ? value[0] : value
  return row?.name ?? ""
}

export function jobProfession(job: JobListRow): string {
  return relationName(job.professions)
}

/** Employment type chips (shift_type) — jobs listing filter. */
export function jobShiftType(job: JobListRow): string {
  return job.shift_type?.trim() || ""
}

/** MSP/Client for MSP jobs (msp_name — not MSP Name / msp_client). */
export function jobContractGroup(job: JobListRow): string {
  const source = String(job.source_type ?? "").trim().toLowerCase()
  if (source !== "msp") return ""
  return job.msp_name?.trim() || ""
}

function jobListSourceType(job: JobListRow): SourceType {
  const raw = String(job.source_type ?? "").trim().toLowerCase()
  return raw === "msp" ? "MSP" : "Internal"
}

/** Internal / MSP badge for job title column and card footers. */
export function JobSourceTypeBadge({ job }: { job: JobListRow }) {
  const label = jobListSourceType(job)
  const isMsp = label === "MSP"
  return (
    <span
      className={`inline-flex max-w-full shrink-0 items-center truncate rounded-md px-2 py-0.5 font-[Inter,sans-serif] text-[10px] font-semibold leading-[15px] ${
        isMsp ? "bg-[#DCFCE7] text-[#15803D]" : "bg-[#DBEAFE] text-[#1D4ED8]"
      }`}
    >
      {label}
    </span>
  )
}

export function isJobListMspRecruitAndRelease(job: JobListRow): boolean {
  return isMspRecruitAndRelease({
    sourceType: jobListSourceType(job),
    placementType: placementTypeFromApiRow(
      jobListSourceType(job),
      job.placement_type,
      job.employment_type
    ),
  })
}

/** Job Title column: MSP uses Source Job Title; Internal uses public title. */
export function jobListDisplayTitle(job: JobListRow): string {
  const source = String(job.source_type ?? "").trim().toLowerCase()
  if (source === "msp") {
    return (
      job.source_job_title?.trim() ||
      job.public_title?.trim() ||
      "Untitled draft"
    )
  }
  return job.public_title?.trim() || "Untitled draft"
}

export function formatJobListCommissionFeeText(job: JobListRow): string {
  if (!isJobListMspRecruitAndRelease(job)) return "—"
  const parts: string[] = []
  const percent = toNumberOrNull(job.commission_percent)
  const fixed = toNumberOrNull(job.commission_fixed_amount)
  if (percent != null && percent > 0) {
    parts.push(`${formatPayAmount(percent)}%`)
  }
  if (fixed != null && fixed > 0) {
    parts.push(`$${formatPayAmount(fixed)} USD`)
  }
  return parts.length ? parts.join(" + ") : "—"
}

export function jobCommissionFeeSortValue(job: JobListRow): number {
  if (!isJobListMspRecruitAndRelease(job)) return -1
  const percent = toNumberOrNull(job.commission_percent)
  const fixed = toNumberOrNull(job.commission_fixed_amount)
  if (percent != null && percent > 0) return percent
  if (fixed != null && fixed > 0) return fixed
  return -1
}

/** Active candidates for the job — every application, same as the Job candidates All tab. */
export function applicantCount(job: JobListRow): number {
  return job.job_applications?.[0]?.count ?? 0
}

export function newApplicantCount(job: JobListRow): number {
  return job.new_application_count ?? 0
}

export function inProcessApplicantCount(job: JobListRow): number {
  return job.in_process_application_count ?? 0
}

export function inProcessCandidatesHref(job: JobListRow): string {
  // The candidates page picks the in-process status that actually has applicants.
  // A stored system key can match an empty catalog status and show a 0 count.
  return `${jobCandidatesHref(job.id)}&tab=in_process`
}

export function analyzedApplicantCount(job: JobListRow): number {
  return job.analyzed_application_count ?? 0
}

export function strongMatchCount(job: JobListRow): number {
  return job.strong_match_count ?? 0
}

export function readyToSubmitCount(job: JobListRow): number {
  return job.ready_to_submit_count ?? 0
}

export function hiredApplicantCount(job: JobListRow): number {
  return job.hired_application_count ?? 0
}

export function jobCandidatesHref(jobId: string): string {
  return `/admin_recruiter/applications?jobId=${encodeURIComponent(jobId)}`
}

/** Job candidates list filtered to the dashboard ANALYSIS count. */
export function jobAnalyzedCandidatesHref(jobId: string): string {
  return `${jobCandidatesHref(jobId)}&tab=analyzed`
}

export function jobHiredCandidatesHref(jobId: string): string {
  return `${jobCandidatesHref(jobId)}&tab=hired`
}

export function jobLocation(job: JobListRow): string {
  const raw =
    job.location?.trim() ||
    job.facility_name?.trim() ||
    job.facility?.trim() ||
    ""
  if (!raw) return "—"
  // Never fall back to raw Mapbox/junk strings in list UI or filters.
  return formatCityState(raw) || "—"
}

export function jobPlacementType(job: JobListRow): string {
  return job.location_type?.trim() || job.schedule?.trim() || ""
}

export function jobDisplayId(job: JobListRow): string {
  return job.internal_requisition_number?.trim() || job.id.slice(0, 8).toUpperCase()
}

/** MSP Source Job ID (Internal Reference / Source Job ID on the job form). */
export function jobSourceJobId(job: JobListRow): string {
  return job.external_requisition_id?.trim() || ""
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function formatPayAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "")
}

/** Normalize DB / form period labels to Figma style unit (e.g. "hour"). */
export function jobPayRatePeriodLabel(job: JobListRow): string {
  const raw = String(job.pay_rate_period || job.rate_unit || "").trim().toLowerCase()
  if (!raw) return ""
  if (raw.includes("hour")) return "hour"
  if (raw.includes("day")) return "day"
  if (raw.includes("week")) return "week"
  if (raw.includes("month")) return "month"
  if (raw.includes("year") || raw.includes("annual")) return "year"
  if (raw.includes("flat")) return "flat"
  return raw.replace(/^per\s+/i, "").trim()
}

export function jobPayRateSortValue(job: JobListRow): number {
  const min = toNumberOrNull(job.pay_rate_min)
  const max = toNumberOrNull(job.pay_rate_max)
  if (min != null && max != null) return Math.min(min, max)
  if (min != null) return min
  if (max != null) return max
  const suggested = toNumberOrNull(job.pay_rate)
  if (suggested != null) return suggested
  return -1
}

/** Plain-text pay rate for export / aria (e.g. "$50 / hour" or "$50 - $60 / hour"). */
export function formatJobListPayRateText(job: JobListRow): string {
  const parts = formatJobListPayRateParts(job)
  if (!parts) return "—"
  return parts.period ? `${parts.amount} / ${parts.period}` : parts.amount
}

export function formatJobListPayRateParts(
  job: JobListRow
): { amount: string; period: string } | null {
  const suggested = toNumberOrNull(job.pay_rate)
  const min = toNumberOrNull(job.pay_rate_min)
  const max = toNumberOrNull(job.pay_rate_max)
  const period = jobPayRatePeriodLabel(job)
  const showPayBy = String(job.show_pay_by ?? "").trim()
  const format = (value: number) => `$${formatPayAmount(value)}`

  const hasDistinctRange = min != null && max != null && min !== max
  const isRangeMode =
    showPayBy === "Range" ||
    (hasDistinctRange &&
      showPayBy !== "Exact amount" &&
      showPayBy !== "Starting amount")

  let amount = ""
  if (isRangeMode && hasDistinctRange) {
    amount = `${format(min)} - ${format(max)}`
  } else {
    // Exact / Starting / incomplete range — single value (never prefer suggested over min/max).
    const single = min ?? max ?? suggested
    if (single != null) amount = format(single)
  }

  if (!amount) return null
  return { amount, period }
}

export function jobStatusSortLabel(status: JobListRow["status"]): string {
  switch (normalizeJobRequisitionStatus(String(status ?? ""))) {
    case "open":
      return "Open"
    case "paused":
      return "Paused"
    case "filled":
      return "Filled"
    case "draft":
      return "Draft"
    case "closed":
      return "Closed"
    case "archived":
      return "Archived"
    default:
      return String(status ?? "")
  }
}

export function jobSortValue(job: JobListRow, field: JobSortField): string | number {
  switch (field) {
    case "jobTitle":
      return jobListDisplayTitle(job).toLowerCase()
    // case "jobId":
    //   return jobDisplayId(job).toLowerCase()
    case "sourceJobId":
      return jobSourceJobId(job).toLowerCase()
    case "contractGroup":
      return jobContractGroup(job).toLowerCase()
    case "candidates":
      return applicantCount(job)
    case "datePosted":
      return new Date(job.published_at || job.created_at || 0).getTime() || 0
    case "assignee":
      return (job.createdBy?.name?.trim() ?? "").toLowerCase()
    case "jobStatus":
      return jobStatusSortLabel(job.status).toLowerCase()
    case "payRate":
      return jobPayRateSortValue(job)
    case "commissionFee":
      return jobCommissionFeeSortValue(job)
    case "location":
      return jobLocation(job).toLowerCase()
    case "placementType":
      return jobPlacementType(job).toLowerCase()
    case "employmentType":
      return (job.employment_type || "").toLowerCase()
    case "jobType":
      return (job.shift_type || "").trim().toLowerCase()
    case "profession":
      return relationName(job.professions).toLowerCase()
    case "specialty":
      return relationName(job.specialties).toLowerCase()
    case "workflow":
      return relationName(job.onboarding_flows).toLowerCase()
    case "createdDate":
      return new Date(job.created_at || 0).getTime() || 0
    case "applicationDeadline":
      return new Date(job.application_deadline || 0).getTime() || 0
    default:
      return ""
  }
}

function isPublishToggleChecked(status: JobListRow["status"]): boolean {
  return normalizeJobRequisitionStatus(String(status ?? "")) === "open"
}

function isPublishToggleDisabled(job: JobListRow): boolean {
  const status = normalizeJobRequisitionStatus(String(job.status ?? ""))
  if (status === "archived") return true
  if (status === "closed") {
    return !isJobRequisitionOpen({ application_deadline: job.application_deadline })
  }
  return false
}

function formatPostedDate(iso: string | null): { relative: string; absolute: string } {
  if (!iso) return { relative: "—", absolute: "—" }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return { relative: "—", absolute: "—" }

  const absolute = date.toLocaleDateString("en-US", { timeZone: "America/New_York", 
    month: "long",
    day: "numeric",
    year: "numeric",
  })

  const diffMs = Date.now() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  let relative = "Just now"
  if (diffDays >= 1) relative = `${diffDays} day${diffDays === 1 ? "" : "s"} ago`
  else if (diffHours >= 1) relative = `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`

  return { relative, absolute }
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("en-US", { timeZone: "America/New_York", 
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export type JobListCellContext = {
  brandingSecondaryHex: string
  tenantSlug: string | null
  onToggleHot: (jobId: string) => void
  hotBusyIds?: Set<string>
  openActionsJobId: string | null
  onOpenActionsMenu: (job: JobListRow, anchor: HTMLElement) => void
  publishBusyIds: Set<string>
  onPublishToggle: (job: JobListRow) => void
  onStatusChange: (job: JobListRow, nextStatus: JobStatus) => void
}

export function publicJobPathFor(job: JobListRow, tenantSlug: string | null): string | null {
  if (normalizeJobRequisitionStatus(String(job.status ?? "")) !== "open") return null
  const token = typeof job.public_job_token === "string" ? job.public_job_token.trim() : ""
  const slug = tenantSlug?.trim().toLowerCase() ?? ""
  if (!token || !slug) return null
  return buildPublicJobSharePath(slug, token)
}

export function renderJobListCell(
  col: JobColumnId,
  job: JobListRow,
  ctx: JobListCellContext
): ReactNode {
  const posted = formatPostedDate(job.published_at || job.created_at)
  const totalCandidates = applicantCount(job)

  switch (col) {
    case "jobTitle":
      return (
        <div className="flex min-w-0 w-full items-center gap-2 pr-2">
          <Link
            href={`/admin_recruiter/jobs/${job.id}`}
            className="min-w-0 flex-1 truncate font-semibold hover:underline"
            style={{ color: ctx.brandingSecondaryHex }}
            onMouseEnter={() => prefetchJobDetails(job.id)}
            onFocus={() => prefetchJobDetails(job.id)}
          >
            {jobListDisplayTitle(job)}
          </Link>
          <JobSourceTypeBadge job={job} />
        </div>
      )
    // case "jobId":
    //   return <span className="text-sm text-[#475569]">{jobDisplayId(job)}</span>
    case "sourceJobId": {
      const sourceId = jobSourceJobId(job)
      return <span className="text-sm text-[#475569]">{sourceId || "—"}</span>
    }
    case "contractGroup": {
      const group = jobContractGroup(job)
      return <span className="text-sm text-[#475569]">{group || "—"}</span>
    }
    case "candidates":
      if (job.status === "draft") {
        return (
          <div className="box-border flex h-full min-h-full w-full min-w-0 items-center gap-2 bg-[#FEF2F2] px-3 py-4">
            <DraftJobIncompleteInfoIcon />
            <span className="min-w-0 flex-1 truncate text-left text-sm text-[#334155]">
              Your job post is incomplete
            </span>
            <Link
              href={`/admin_recruiter/jobs/${job.id}/edit`}
              onClick={(event) => event.stopPropagation()}
              className="inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-primary)] px-3 text-xs font-semibold text-white transition hover:brightness-95"
            >
              Finish posting
            </Link>
          </div>
        )
      }
      return (
        <div className="box-border flex h-[58px] w-full min-w-0 items-center justify-center gap-2 px-[14px]">
          <JobCandidateMetric
            tone="all"
            iconSrc={JOB_CANDIDATE_ICONS.all}
            label="All"
            count={totalCandidates}
            href={jobCandidatesHref(job.id)}
          />
          <JobCandidateMetric
            tone="new"
            iconSrc={JOB_CANDIDATE_ICONS.new}
            label="New"
            count={newApplicantCount(job)}
            href={`${jobCandidatesHref(job.id)}&tab=new`}
          />
          <JobCandidateMetric
            tone="inProcess"
            iconSrc={JOB_CANDIDATE_ICONS.inProcess}
            label="In Process"
            count={inProcessApplicantCount(job)}
            href={inProcessCandidatesHref(job)}
          />
        </div>
      )
    case "datePosted":
      return (
        <div className="text-[#475569]">
          <div className="text-sm">{posted.relative}</div>
          <div className="mt-0.5 text-xs text-[#94A3B8]">{posted.absolute}</div>
        </div>
      )
    case "assignee": {
      const creator = job.createdBy;
      const name = creator?.name?.trim();
      if (!name) return <span className="text-sm text-[#94A3B8]">—</span>;
      return (
        <div className="flex items-center justify-center gap-2">
          <StaffProfileAvatar name={name} photoUrl={creator?.profilePhotoUrl} size="sm" />
          <span className="max-w-[120px] truncate text-sm text-[#475569]" title={name}>
            {name}
          </span>
        </div>
      );
    }
    case "jobStatus":
      return (
        <JobListStatusDropdown
          status={String(job.status ?? "")}
          busy={ctx.publishBusyIds.has(job.id)}
          onSelect={(nextStatus) => ctx.onStatusChange(job, nextStatus)}
        />
      )
    case "payRate": {
      const pay = formatJobListPayRateParts(job)
      if (!pay) {
        return <span className="mx-auto block w-fit text-sm text-[#475569]">—</span>
      }
      return (
        <div className="flex w-full justify-center">
          <span className="inline-flex items-baseline whitespace-nowrap text-sm">
            <span className="font-semibold tabular-nums text-[#1D2739]">{pay.amount}</span>
            {pay.period ? (
              <span className="font-normal text-[#475569]">{` / ${pay.period}`}</span>
            ) : null}
          </span>
        </div>
      )
    }
    case "commissionFee": {
      const commission = formatJobListCommissionFeeText(job)
      return (
        <span className="mx-auto block w-fit text-sm tabular-nums text-[#475569]">
          {commission}
        </span>
      )
    }
    case "location":
      return <span className="text-sm text-[#475569]">{jobLocation(job)}</span>
    case "placementType":
      return (
        <span className="text-sm text-[#475569]">{jobPlacementType(job) || "—"}</span>
      )
    case "employmentType":
      return (
        <span className="text-sm text-[#475569]">
          {job.employment_type ? employmentTypeDisplayLabel(job.employment_type) : "—"}
        </span>
      )
    case "jobType":
      return <span className="text-sm text-[#475569]">{job.shift_type?.trim() || "—"}</span>
    case "profession":
      return <span className="text-sm text-[#475569]">{relationName(job.professions) || "—"}</span>
    case "specialty":
      return <span className="text-sm text-[#475569]">{relationName(job.specialties) || "—"}</span>
    case "workflow":
      return (
        <span className="text-sm text-[#475569]">{relationName(job.onboarding_flows) || "—"}</span>
      )
    case "createdDate":
      return <span className="text-sm text-[#475569]">{formatDateShort(job.created_at)}</span>
    case "applicationDeadline":
      return (
        <span className="text-sm text-[#475569]">{formatDateShort(job.application_deadline)}</span>
      )
    case "actions":
      return (
        <div className="flex min-h-[36px] items-center justify-center gap-3 overflow-visible px-2 py-2.5">
          <JobPublishToggle
            checked={isPublishToggleChecked(job.status)}
            disabled={isPublishToggleDisabled(job)}
            busy={ctx.publishBusyIds.has(job.id)}
            activeColor={ctx.brandingSecondaryHex}
            onChange={() => ctx.onPublishToggle(job)}
          />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              ctx.onOpenActionsMenu(job, event.currentTarget)
            }}
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#334155] transition ${
              ctx.openActionsJobId === job.id
                ? "bg-[#F1F5F9]"
                : "bg-transparent hover:bg-[#F1F5F9]"
            }`}
            aria-label="Job actions"
            aria-haspopup="menu"
            aria-expanded={ctx.openActionsJobId === job.id}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      )
    default:
      return "—"
  }
}

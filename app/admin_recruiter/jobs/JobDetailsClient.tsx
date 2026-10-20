"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import toast from "react-hot-toast";
import AddCandidateModal from "@/app/admin_recruiter/applications/AddCandidateModal";
import ImportCandidatesModal from "@/app/admin_recruiter/applications/ImportCandidatesModal";
import {
  AssignRecruiterModal,
  type AssignableTeamMember,
} from "@/app/admin_recruiter/candidates/AssignRecruiterModal";
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import {
  formatStoredJobDescriptionHtml,
  JobDescriptionHtml,
} from "@/lib/jobs/job-description-html";
import { brandingToCssVars } from "@/lib/tenant/tenant-branding";
import { JobsBreadcrumb } from "./JobsBreadcrumb";
import {
  JOB_FORM_OUTLINE_BUTTON_CLASS,
  JOB_FORM_PAGE_CARD_CLASS,
  JOB_FORM_SURFACE_CLASS,
} from "./job-form-shared";
import {
  JOB_POSTING_DESCRIPTION_CSS,
  JOB_POSTING_METADATA_CLASS,
} from "./job-posting-typography";
import { JobPublicViewLink } from "./JobPublicViewLink";
import { JobTagsModal } from "./JobTagsModal";
import {
  formatJobDetailsDate,
  formatJobDetailsClientName,
  formatJobDetailsLocation,
  formatJobDetailsPay,
  formatWorkLocationLabel,
  jobDetailsStatusDotClass,
  jobDetailsStatusLabel,
  preferredSkillsFromJob,
  splitJobListContent,
  type JobDetailsRow,
} from "./job-details-helpers";
import {
  allowedJobStatusTransitions,
  normalizeJobRequisitionStatus,
} from "@/lib/jobs/job-status";
import {
  emptyJobPipelineSummary,
  type JobPipelineSummary,
} from "@/lib/jobs/pipeline-summary";
import type { JobStatus } from "@/lib/jobs/types";
import { JOB_STATUSES } from "@/lib/jobs/types";
import { readServiceAreaApiMessage } from "@/lib/service-area/copy";
import { invalidateJobsListCache } from "@/lib/lists/staff-list-session-cache";
import {
  fetchStaffDetailJson,
  invalidateStaffDetailCache,
  jobDetailsApiUrl,
} from "@/lib/admin/staff-detail-fetch-cache";

type Props = {
  jobId: string;
};

/** How many tags to show beside the title before collapsing into “+N more”. */
const JOB_DETAILS_VISIBLE_TAG_COUNT = 3;

/** Figma action-menu icons — fixed slate, not tenant-branded. */
const JOB_DETAILS_ACTION_ICON_COLOR = "#94A3B8";
const JOB_DETAILS_ICON_BASE = "/icons/job-details-icons";

/** Figma Job Details typography */
const JOB_DETAILS_SECTION_TITLE_CLASS =
  "text-lg font-bold leading-6 tracking-tight text-black min-[400px]:text-xl min-[400px]:leading-7";
const JOB_DETAILS_CARD_TITLE_CLASS =
  "text-base font-bold leading-6 tracking-tight text-black min-[400px]:text-lg min-[400px]:leading-7";
const JOB_DETAILS_CARD_SUBTITLE_CLASS =
  "mt-1 text-sm font-normal leading-5 text-[#667085]";
const JOB_DETAILS_SUMMARY_LABEL_CLASS =
  "text-sm font-semibold leading-5 text-black";
const JOB_DETAILS_SUMMARY_VALUE_CLASS =
  "break-words text-sm font-normal leading-6 text-[#667085]";

function SummaryList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="mt-6">
      <h3 className={JOB_DETAILS_SUMMARY_LABEL_CLASS}>{title}</h3>
      <ul className={`mt-2 list-disc space-y-1.5 pl-5 ${JOB_DETAILS_SUMMARY_VALUE_CLASS}`}>
        {items.map((item) => (
          <li key={`${title}-${item}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function ActionMenuItem({
  iconSrc,
  label,
  onClick,
  disabled,
}: {
  iconSrc: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-60"
      onClick={onClick}
    >
      <BrandedSvgIcon
        src={iconSrc}
        className="h-3 w-3 shrink-0"
        color={JOB_DETAILS_ACTION_ICON_COLOR}
      />
      {label}
    </button>
  );
}

/** Figma Candidates Activity: link label stays navy (not tenant secondary). */
const JOB_DETAILS_ACTIVITY_LINK_COLOR = "#012352";

/** Figma candidate KPI card: primary 20×20 icon on top; link + count on one row. */
function CandidateCard({
  iconSrc,
  count,
  label,
  linkHref,
  primaryColor,
  secondaryColor,
}: {
  iconSrc: string;
  count: number;
  label: string;
  linkHref: string;
  primaryColor: string;
  secondaryColor: string;
}) {
  return (
    <Link
      href={linkHref}
      className="flex h-[86px] w-full min-w-0 flex-col gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-3 shadow-sm outline-none transition hover:border-[#D0D5DD] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:ring-offset-2 min-[400px]:px-4 min-[500px]:px-5 min-[500px]:py-3.5 min-[900px]:flex-1 min-[900px]:basis-[11.5rem]"
      aria-label={`${count} ${label}`}
    >
      <BrandedSvgIcon
        src={iconSrc}
        className="h-5 w-5 shrink-0"
        color={primaryColor}
      />
      <div className="flex min-w-0 items-center justify-between gap-2 min-[400px]:gap-3">
      <span
        className="min-w-0 truncate text-sm font-medium leading-5 no-underline"
        style={{ color: JOB_DETAILS_ACTIVITY_LINK_COLOR }}
      >
        {label}
      </span>
      <span
        className="shrink-0 text-2xl font-bold leading-8 tabular-nums tracking-tight min-[400px]:text-[28px]"
        style={{ color: secondaryColor }}
      >
        {count}
      </span>
      </div>
    </Link>
  );
}

export default function JobDetailsClient({ jobId }: Props) {
  const router = useRouter();
  const branding = useTenantBranding();
  const brandVars = brandingToCssVars(branding) as CSSProperties;
  const primaryColor = branding.primaryHex || "#BC8B41";
  const outlineBrandStyle: CSSProperties = {
    borderColor: primaryColor,
    color: primaryColor,
  };

  const [job, setJob] = useState<JobDetailsRow | null>(null);
  const [pipelineSummary, setPipelineSummary] = useState<JobPipelineSummary | null>(null);
  const [publicJobPath, setPublicJobPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [addCandidateOpen, setAddCandidateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [tagsBusy, setTagsBusy] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [duplicateBusy, setDuplicateBusy] = useState(false);
  const [teamMembers, setTeamMembers] = useState<AssignableTeamMember[]>([]);
  const [teamMembersLoading, setTeamMembersLoading] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const { ok, payload: jobPayload } = await fetchStaffDetailJson<{
        job?: JobDetailsRow;
        publicJobPath?: string;
        pipelineSummary?: JobPipelineSummary;
        error?: string;
      }>(jobDetailsApiUrl(jobId), { bust: silent });
      if (!ok) throw new Error(jobPayload.error || "Failed to load job");
      setJob(jobPayload.job as JobDetailsRow);
      setPublicJobPath(
        typeof jobPayload.publicJobPath === "string" ? jobPayload.publicJobPath : null
      );
      setPipelineSummary(
        jobPayload.pipelineSummary
          ? (jobPayload.pipelineSummary as JobPipelineSummary)
          : emptyJobPipelineSummary(
              String((jobPayload.job as JobDetailsRow | undefined)?.source_type ?? "")
                .trim()
                .toLowerCase() === "msp"
            )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load job");
      if (!silent) setJob(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (actionsRef.current && !actionsRef.current.contains(target)) setActionsOpen(false);
      if (statusMenuRef.current && !statusMenuRef.current.contains(target)) {
        setStatusMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  async function updateJobStatus(nextStatus: JobStatus) {
    if (!job || statusBusy) return;
    const current = normalizeJobRequisitionStatus(String(job.status ?? ""));
    if (current === nextStatus) return;
    setStatusBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/jobs/${encodeURIComponent(job.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(readServiceAreaApiMessage(payload, "Failed to update job status"));
      }
      toast.success(`Status updated to ${jobDetailsStatusLabel(nextStatus)}`);
      invalidateStaffDetailCache(`/api/admin/jobs/${encodeURIComponent(job.id)}`);
      invalidateJobsListCache();
      await load({ silent: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update job status";
      setError(message);
      toast.error(message);
    } finally {
      setStatusBusy(false);
    }
  }

  async function loadTeamMembers() {
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

  async function saveJobTags(nextTags: string[]) {
    if (!job || tagsBusy) return;
    setTagsBusy(true);
    setTagsError(null);
    try {
      const response = await fetch(`/api/admin/jobs/${encodeURIComponent(job.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: nextTags }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Failed to save tags");
      }
      toast.success("Tags updated");
      setTagsOpen(false);
      invalidateStaffDetailCache(`/api/admin/jobs/${encodeURIComponent(job.id)}`);
      invalidateJobsListCache();
      await load({ silent: true });
    } catch (err) {
      setTagsError(err instanceof Error ? err.message : "Failed to save tags");
    } finally {
      setTagsBusy(false);
    }
  }

  async function assignJobRecruiter(assigneeUserId: string | null) {
    if (!job || assignBusy) return;
    setAssignBusy(true);
    setAssignError(null);
    try {
      const response = await fetch(`/api/admin/jobs/${encodeURIComponent(job.id)}`, {
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
      toast.success(assigneeUserId ? "Recruiter assigned" : "Recruiter cleared");
      setAssignOpen(false);
      invalidateStaffDetailCache(`/api/admin/jobs/${encodeURIComponent(job.id)}`);
      invalidateJobsListCache();
      await load({ silent: true });
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Failed to assign recruiter");
    } finally {
      setAssignBusy(false);
    }
  }

  async function duplicateJob() {
    if (!job || duplicateBusy) return;
    setDuplicateBusy(true);
    setActionsOpen(false);
    try {
      const response = await fetch(
        `/api/admin/jobs/${encodeURIComponent(job.id)}/duplicate`,
        { method: "POST" }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string" ? payload.error : "Failed to duplicate job"
        );
      }
      const newId = String(payload.job?.id ?? "").trim();
      if (!newId) throw new Error("Duplicate job id missing");
      toast.success("Draft copy created");
      invalidateJobsListCache();
      router.push(`/admin_recruiter/jobs/${encodeURIComponent(newId)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to duplicate job");
    } finally {
      setDuplicateBusy(false);
    }
  }

  const title = (() => {
    if (!job) return "Untitled job";
    const isMsp = String(job.source_type ?? "").trim().toLowerCase() === "msp";
    if (isMsp) {
      return job.source_job_title?.trim() || job.public_title?.trim() || "Untitled job";
    }
    return job.public_title?.trim() || "Untitled job";
  })();
  const location = job ? formatJobDetailsLocation(job) : "—";
  const clientName = job ? formatJobDetailsClientName(job) : "";
  const pay = job ? formatJobDetailsPay(job) : "—";
  const posted = job ? formatJobDetailsDate(job.published_at || job.created_at) : "—";
  const responsibilities = useMemo(
    () => splitJobListContent(job?.responsibilities),
    [job?.responsibilities]
  );
  const qualifications = useMemo(
    () => splitJobListContent(job?.qualifications),
    [job?.qualifications]
  );
  const preferredSkills = useMemo(
    () => (job ? preferredSkillsFromJob(job) : []),
    [job]
  );
  const jobTags = useMemo(() => {
    if (!Array.isArray(job?.tags)) return [];
    return job.tags
      .map((tag) => String(tag ?? "").trim())
      .filter((tag) => tag.length > 0);
  }, [job?.tags]);
  const visibleJobTags = jobTags.slice(0, JOB_DETAILS_VISIBLE_TAG_COUNT);
  const hiddenJobTagCount = Math.max(0, jobTags.length - visibleJobTags.length);
  const benefits = useMemo(() => splitJobListContent(job?.benefits), [job?.benefits]);
  const workLocation = job ? formatWorkLocationLabel(job) : "—";
  const summaryHtml = useMemo(() => {
    const raw = job?.public_description?.trim() || "";
    return formatStoredJobDescriptionHtml(raw, {
      stripBenefits: benefits.length > 0,
    });
  }, [job?.public_description, benefits.length]);

  const isMspJob = String(job?.source_type ?? "").trim().toLowerCase() === "msp";
  const summary = pipelineSummary ?? emptyJobPipelineSummary(isMspJob);
  const showSubmissionCard = Boolean(summary.show_submission || isMspJob);
  const pipelineCards = useMemo(() => {
    const base = [
      {
        key: "all",
        label: "All Applications",
        count: summary.all,
        href: `/admin_recruiter/applications?jobId=${encodeURIComponent(jobId)}`,
        iconSrc: `${JOB_DETAILS_ICON_BASE}/all-applications.svg`,
      },
      {
        key: "new",
        label: "New Intake",
        count: summary.intake,
        href: `/admin_recruiter/applications?jobId=${encodeURIComponent(jobId)}&tab=new`,
        iconSrc: `${JOB_DETAILS_ICON_BASE}/new-intake.svg`,
      },
      {
        key: "in-process",
        label: showSubmissionCard
          ? "In Process"
          : "In Process Screening + Interview",
        count: summary.screening + summary.interview,
        href: `/admin_recruiter/applications?jobId=${encodeURIComponent(jobId)}&tab=${encodeURIComponent(
          summary.in_process_redirect_tab || "in_process"
        )}`,
        iconSrc: `${JOB_DETAILS_ICON_BASE}/in-process.svg`,
      },
    ];
    if (showSubmissionCard) {
      base.push({
        key: "at-msp",
        label: "At MSP Submission",
        count: summary.submission,
        href: `/admin_recruiter/applications?jobId=${encodeURIComponent(jobId)}&tab=submitted-to-msp`,
        iconSrc: `${JOB_DETAILS_ICON_BASE}/at-msp-submission.svg`,
      });
    }
    base.push(
      {
        key: "hired",
        label: "Selected/Hired",
        count: summary.selected + summary.onboarding,
        href: `/admin_recruiter/applications?jobId=${encodeURIComponent(jobId)}&tab=hired`,
        iconSrc: `${JOB_DETAILS_ICON_BASE}/selected-hired.svg`,
      },
      {
        key: "closed",
        label: "Closed",
        count: summary.closed,
        href: `/admin_recruiter/applications?jobId=${encodeURIComponent(jobId)}&tab=${encodeURIComponent(
          summary.closed_redirect_tab || "closed"
        )}`,
        iconSrc: `${JOB_DETAILS_ICON_BASE}/closed.svg`,
      }
    );
    return base;
  }, [jobId, showSubmissionCard, summary]);

  async function copyApplyLink() {
    setActionsOpen(false);
    if (!publicJobPath) {
      toast.error("Public apply link is not available for this job yet");
      return;
    }
    try {
      const absolute =
        typeof window !== "undefined"
          ? new URL(publicJobPath, window.location.origin).toString()
          : publicJobPath;
      await navigator.clipboard.writeText(absolute);
      toast.success("Apply link copied");
    } catch {
      toast.error("Could not copy apply link");
    }
  }

  const statusAndActions =
    job && !loading ? (
      <div className="flex w-full min-w-0 shrink-0 items-center gap-2 min-[500px]:w-auto">
        {(() => {
          const currentStatus = normalizeJobRequisitionStatus(String(job.status ?? ""));
          const allowed = new Set<JobStatus>([
            currentStatus,
            ...allowedJobStatusTransitions(currentStatus),
          ]);
          const statusOptions = JOB_STATUSES.filter((status) => allowed.has(status));
          return (
            <div className="relative min-w-0 flex-1 min-[500px]:flex-none" ref={statusMenuRef}>
              <button
                type="button"
                disabled={statusBusy}
                onClick={() => {
                  setActionsOpen(false);
                  setStatusMenuOpen((open) => !open);
                }}
                className={`inline-flex h-9 w-full min-w-0 cursor-pointer items-center gap-2 py-0 pl-3 pr-8 text-left text-sm text-[#334155] outline-none disabled:cursor-not-allowed disabled:opacity-60 min-[500px]:w-auto min-[500px]:min-w-[9.5rem] ${JOB_FORM_SURFACE_CLASS}`}
                aria-label={`Job status: ${jobDetailsStatusLabel(currentStatus)}`}
                aria-haspopup="listbox"
                aria-expanded={statusMenuOpen}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${jobDetailsStatusDotClass(currentStatus)}`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">
                  {jobDetailsStatusLabel(currentStatus)}
                </span>
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 bg-no-repeat"
                  style={{
                    backgroundImage:
                      'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\' fill=\'none\'%3E%3Cpath d=\'M3 4.5L6 7.5L9 4.5\' stroke=\'%2394A3B8\' stroke-width=\'1.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E")',
                    backgroundSize: "12px 12px",
                    backgroundPosition: "center",
                  }}
                />
              </button>
              {statusMenuOpen ? (
                <div
                  role="listbox"
                  aria-label="Job status"
                  className="absolute right-0 z-30 mt-1 min-w-full overflow-hidden rounded-lg border border-[#E5E7EB] bg-white py-1 shadow-lg"
                >
                  {statusOptions.map((status) => {
                    const selected = status === currentStatus;
                    return (
                      <button
                        key={status}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        disabled={statusBusy}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[#334155] transition hover:bg-[#F8FAFC] disabled:opacity-60 ${
                          selected ? "bg-[#EFF6FF]" : ""
                        }`}
                        onClick={() => {
                          setStatusMenuOpen(false);
                          if (status !== currentStatus) {
                            void updateJobStatus(status);
                          }
                        }}
                      >
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${jobDetailsStatusDotClass(status)}`}
                          aria-hidden
                        />
                        {jobDetailsStatusLabel(status)}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })()}

        <div className="relative" ref={actionsRef}>
          <button
            type="button"
            onClick={() => {
              setStatusMenuOpen(false);
              setActionsOpen((open) => !open);
            }}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white text-[#64748B] transition hover:bg-[#F8FAFC] disabled:opacity-60"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
          >
            <BrandedSvgIcon
              src={`${JOB_DETAILS_ICON_BASE}/more-actions.svg`}
              className="h-3.5 w-3.5"
              color="#0F172A"
            />
          </button>
          {actionsOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-30 mt-1 min-w-[200px] overflow-hidden rounded-lg border border-[#E5E7EB] bg-white py-1 shadow-lg"
            >
              <ActionMenuItem
                iconSrc={`${JOB_DETAILS_ICON_BASE}/copy-apply-link.svg`}
                label="Copy apply link"
                onClick={() => void copyApplyLink()}
              />
              <ActionMenuItem
                iconSrc={`${JOB_DETAILS_ICON_BASE}/add-remove-tags.svg`}
                label="Add/remove tags"
                onClick={() => {
                  setActionsOpen(false);
                  setTagsError(null);
                  setTagsOpen(true);
                }}
              />
              <ActionMenuItem
                iconSrc={`${JOB_DETAILS_ICON_BASE}/assign-recruiter.svg`}
                label="Assign recruiter"
                onClick={() => {
                  setActionsOpen(false);
                  setAssignError(null);
                  setAssignOpen(true);
                  void loadTeamMembers();
                }}
              />
              <ActionMenuItem
                iconSrc={`${JOB_DETAILS_ICON_BASE}/duplicate-job.svg`}
                label={duplicateBusy ? "Duplicating…" : "Duplicate job"}
                disabled={duplicateBusy}
                onClick={() => void duplicateJob()}
              />
            </div>
          ) : null}
        </div>
      </div>
    ) : null;

  return (
    <div
      className="box-border w-full min-w-0 max-w-full px-2.5 pb-6 pt-3 min-[400px]:px-3 min-[400px]:pb-8 min-[400px]:pt-4 min-[500px]:px-5 min-[500px]:pt-5 min-[900px]:px-8"
      style={brandVars}
    >
      <div className="mb-3 flex flex-col gap-3 min-[500px]:mb-4 min-[500px]:flex-row min-[500px]:flex-wrap min-[500px]:items-center min-[500px]:justify-between">
        <JobsBreadcrumb page="job-details" className="mb-0 min-w-0" />
        {statusAndActions}
      </div>
      {loading ? (
        <div className={`${JOB_FORM_PAGE_CARD_CLASS} p-4 sm:p-6 lg:p-8`}>
          <p className="mt-8 text-sm text-[#64748B]">Loading job details…</p>
        </div>
      ) : error && !job ? (
        <div className={`${JOB_FORM_PAGE_CARD_CLASS} p-4 sm:p-6 lg:p-8`}>
          <p className="mt-8 text-sm text-red-600">{error}</p>
        </div>
      ) : job ? (
        <>
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-3.5 shadow-sm min-[400px]:p-4 min-[500px]:p-5 min-[600px]:p-6">
            <div
              className={`flex flex-col gap-4 min-[500px]:gap-5 min-[900px]:flex-row min-[900px]:items-stretch ${
                job.status !== "archived" ? "min-[900px]:gap-0" : ""
              }`}
            >
              <div
                className={`min-w-0 ${
                  job.status !== "archived"
                    ? "flex flex-col min-[900px]:min-w-0 min-[900px]:flex-1 min-[900px]:basis-0 min-[900px]:pr-6"
                    : "w-full"
                }`}
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h1
                    className="min-w-0 break-words font-bold tracking-tight text-black text-[length:calc(1.125rem*1.1)] leading-[calc(1.5rem*1.1)] min-[400px]:text-[length:calc(1.25rem*1.1)] min-[400px]:leading-[calc(1.75rem*1.1)]"
                  >
                    {title}
                  </h1>
                  {jobTags.length > 0 ? (
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      {visibleJobTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex max-w-[8rem] truncate rounded-md px-2 py-0.5 text-xs font-semibold leading-4 text-white min-[400px]:max-w-[10rem]"
                          style={{ backgroundColor: branding.secondaryHex || "#012352" }}
                          title={tag}
                        >
                          {tag}
                        </span>
                      ))}
                      {hiddenJobTagCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setTagsError(null);
                            setTagsOpen(true);
                          }}
                          className="inline-flex shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold leading-4 text-white transition hover:opacity-90"
                          style={{ backgroundColor: branding.secondaryHex || "#012352" }}
                          aria-label={`Show ${hiddenJobTagCount} more tags`}
                        >
                          +{hiddenJobTagCount} more
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <p className={`mt-1.5 break-words ${JOB_POSTING_METADATA_CLASS}`}>
                  <span className="font-semibold text-[#1D2739]">Location:</span>{" "}
                  {location}
                  {branding.companyName?.trim() ? (
                    <>
                      <span className="mx-1.5 font-semibold text-[#1D2739]">•</span>
                      <span className="font-semibold text-[#1D2739]">Company:</span>{" "}
                      {branding.companyName.trim()}
                    </>
                  ) : null}
                  {clientName ? (
                    <>
                      <span className="mx-1.5 font-semibold text-[#1D2739]">•</span>
                      <span className="font-semibold text-[#1D2739]">Client:</span>{" "}
                      {clientName}
                    </>
                  ) : null}
                </p>
                {(() => {
                  const flow = job.onboarding_flows;
                  const workflowName = Array.isArray(flow)
                    ? flow[0]?.name
                    : flow?.name;
                  if (!workflowName && !job.workflow_assignment_error) return null;
                  return (
                    <p className="mt-2 break-words text-sm text-[#475569]">
                      Assigned workflow:{" "}
                      <span className="font-semibold text-[#111827]">
                        {workflowName || "Unmapped"}
                      </span>
                      {job.workflow_assignment_mode === "manual" ? (
                        <span className="ml-2 text-xs font-medium uppercase tracking-wide text-[#64748B]">
                          (manual override)
                        </span>
                      ) : workflowName ? (
                        <span className="ml-2 text-xs font-medium uppercase tracking-wide text-[#64748B]">
                          (automatic)
                        </span>
                      ) : null}
                      {job.workflow_assignment_error ? (
                        <span className="mt-1 block text-xs text-amber-700 whitespace-pre-line">
                          {job.workflow_assignment_error}
                        </span>
                      ) : null}
                    </p>
                  );
                })()}

                <div className="mt-auto flex w-full flex-col gap-2.5 pt-4 min-[400px]:gap-3 min-[500px]:flex-row min-[500px]:flex-wrap min-[500px]:items-center">
                  <Link
                    href={`/admin_recruiter/jobs/${job.id}/edit`}
                    className={`${JOB_FORM_OUTLINE_BUTTON_CLASS} w-full min-[500px]:w-auto`}
                    style={outlineBrandStyle}
                  >
                    <BrandedSvgIcon
                      src={`${JOB_DETAILS_ICON_BASE}/edit-job.svg`}
                      className="h-4 w-4 shrink-0"
                      color={primaryColor}
                    />
                    Edit Job
                  </Link>
                  <JobPublicViewLink
                    href={publicJobPath}
                    variant="button"
                    iconColor={primaryColor}
                    className="w-full min-[500px]:w-auto"
                    style={outlineBrandStyle}
                  />
                </div>
              </div>

              {job.status !== "archived" ? (
                <>
                  <div
                    className="hidden w-px shrink-0 self-stretch bg-[#E5E7EB] min-[900px]:block"
                    aria-hidden
                  />
                  <div className="flex min-w-0 flex-col items-start border-t border-[#E5E7EB] pt-4 text-left min-[500px]:pt-5 min-[900px]:min-w-0 min-[900px]:flex-1 min-[900px]:basis-0 min-[900px]:border-t-0 min-[900px]:pt-0 min-[900px]:pl-6">
                    <div className="mt-auto w-full min-w-0">
                      <h2 className={JOB_DETAILS_CARD_TITLE_CLASS}>Add Candidates</h2>
                      <p className={JOB_DETAILS_CARD_SUBTITLE_CLASS}>
                        Upload multiple résumés or import existing candidates
                        <br />
                        from your talent database.
                      </p>
                      <div className="mt-2 flex w-full flex-col gap-2.5 min-[400px]:gap-3 min-[500px]:flex-row min-[500px]:flex-wrap">
                        <button
                          type="button"
                          onClick={() => setImportOpen(true)}
                          className={`${JOB_FORM_OUTLINE_BUTTON_CLASS} w-full min-[500px]:w-auto`}
                          style={outlineBrandStyle}
                        >
                          <BrandedSvgIcon
                            src={`${JOB_DETAILS_ICON_BASE}/match-candidates.svg`}
                            className="h-4 w-4 shrink-0"
                            color={primaryColor}
                          />
                          Match Candidates
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddCandidateOpen(true)}
                          className={`${JOB_FORM_OUTLINE_BUTTON_CLASS} w-full min-[500px]:w-auto`}
                          style={outlineBrandStyle}
                        >
                          <BrandedSvgIcon
                            src={`${JOB_DETAILS_ICON_BASE}/upload-resumes.svg`}
                            className="h-4 w-4 shrink-0"
                            color={primaryColor}
                          />
                          Upload Resume&apos;s
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

          {normalizeJobRequisitionStatus(String(job.status)) === "paused" ? (
            <div
              role="status"
              className="mt-4 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-3 text-sm text-[#92400E] min-[400px]:px-4"
            >
              This job is paused. Public applications are blocked until it is reopened.
            </div>
          ) : null}

          <section className="mt-6 min-[500px]:mt-8">
            <h2 className={JOB_DETAILS_SECTION_TITLE_CLASS}>Candidates Activity</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 min-[600px]:grid-cols-2 min-[700px]:grid-cols-3 min-[900px]:mt-4 min-[900px]:flex min-[900px]:flex-row min-[900px]:flex-wrap">
              {pipelineCards.map((card) => (
                <CandidateCard
                  key={card.key}
                  iconSrc={card.iconSrc}
                  count={card.count}
                  label={card.label}
                  linkHref={card.href}
                  primaryColor={branding.primaryHex || "#BC8B41"}
                  secondaryColor={branding.secondaryHex || "#012352"}
                />
              ))}
            </div>
          </section>

          <section className="mt-6 rounded-xl border border-[#E5E7EB] bg-white p-3.5 shadow-sm min-[400px]:p-4 min-[500px]:mt-8 min-[500px]:p-5 min-[600px]:p-6">
            <h2 className={JOB_DETAILS_CARD_TITLE_CLASS}>Job post summary</h2>
            <div className="mt-4 border-t border-[#E5E7EB]" aria-hidden />
            <div className="mt-4">
              <p className={JOB_DETAILS_SUMMARY_VALUE_CLASS}>
                <span className={JOB_DETAILS_SUMMARY_LABEL_CLASS}>Date posted:</span> {posted}
              </p>
              <p className={`mt-1 ${JOB_DETAILS_SUMMARY_VALUE_CLASS}`}>
                <span className={JOB_DETAILS_SUMMARY_LABEL_CLASS}>Pay:</span> {pay}
              </p>

              <section className="mt-6">
                <h3 className={`mb-2 ${JOB_DETAILS_SUMMARY_LABEL_CLASS}`}>Job Summary:</h3>
                <style>
                  {JOB_POSTING_DESCRIPTION_CSS.replaceAll(
                    ".job-posting-description",
                    ".job-summary-description"
                  )}
                </style>
                <JobDescriptionHtml
                  html={summaryHtml}
                  className="job-summary-description mt-0 text-[#667085]"
                  emptyLabel="No job summary added yet."
                />
              </section>

              <SummaryList title="Key Responsibilities:" items={responsibilities} />
              <SummaryList title="Qualifications:" items={qualifications} />
              <SummaryList title="Preferred Skills:" items={preferredSkills} />

              {benefits.length ? (
                <section className="mt-6">
                  <h3 className={JOB_DETAILS_SUMMARY_LABEL_CLASS}>Benefits:</h3>
                  <p className={`mt-2 ${JOB_DETAILS_SUMMARY_VALUE_CLASS}`}>
                    {benefits.join(", ")}
                  </p>
                </section>
              ) : null}

              <section className="mt-6">
                <h3 className={JOB_DETAILS_SUMMARY_LABEL_CLASS}>Work Location:</h3>
                <p className={`mt-2 ${JOB_DETAILS_SUMMARY_VALUE_CLASS}`}>{workLocation}</p>
              </section>
            </div>
          </section>
        </>
      ) : null}

      <AddCandidateModal
        open={addCandidateOpen}
        onClose={() => setAddCandidateOpen(false)}
        jobId={jobId}
        jobTitle={title}
        jobLocation={location !== "—" ? location : null}
        onSuccess={() => {
          void load({ silent: true });
        }}
      />
      <ImportCandidatesModal
        open={importOpen}
        jobId={jobId}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          void load({ silent: true });
        }}
      />
      <JobTagsModal
        open={tagsOpen}
        jobTitle={title}
        tags={Array.isArray(job?.tags) ? job.tags : []}
        busy={tagsBusy}
        error={tagsError}
        onOpenChange={setTagsOpen}
        onSave={(nextTags) => void saveJobTags(nextTags)}
      />
      <AssignRecruiterModal
        open={assignOpen}
        candidateName={title}
        subjectLabel="job"
        currentAssigneeId={job?.assigned_recruiter_user_id ?? null}
        busy={assignBusy}
        error={assignError}
        members={teamMembers}
        membersLoading={teamMembersLoading}
        onOpenChange={setAssignOpen}
        onAssign={(assigneeUserId) => void assignJobRecruiter(assigneeUserId)}
      />
    </div>
  );
}

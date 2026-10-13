"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Loader2,
  MapPin,
  MoreVertical,
  Phone,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import AddCallLogModal from "@/app/admin_recruiter/components/AddCallLogModal";
import CandidateChatPopup from "@/app/admin_recruiter/components/CandidateChatPopup";
import CandidateCommunicationDialog from "@/app/admin_recruiter/components/CandidateCommunicationDialog";
import { ScheduleInterviewModal } from "@/app/admin_recruiter/calendar/components/ScheduleInterviewModal";
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import {
  CANDIDATES_PAGE_TITLE_CLASS,
  CANDIDATES_PAGE_TITLE_STYLE,
} from "@/app/admin_recruiter/candidates/candidates-typography";
import {
  resolveApplicationApplicantEmail,
  resolveApplicationApplicantName,
} from "@/lib/jobs/application-applicant-display";
import {
  applicationStatusLabel,
  normalizeApplicationStatus,
} from "@/lib/jobs/application-status";
import { formatInterviewDate, formatInterviewTimeRange } from "@/lib/interviews/format";
import { validateResumeUploadFile } from "@/lib/resume/validate-resume-upload";
import { adminWorkerResumePreviewHref } from "@/lib/resume/worker-resume-file-name";
import {
  MAX_RESUME_UPLOADS_PER_ROLE,
  resumeUploadLimitMessage,
} from "@/lib/resume/resume-upload-limit";
import { brandingToCssVars } from "@/lib/tenant/tenant-branding";
import type { AdminInterviewItem } from "@/app/api/admin/applicant-appointments/route";
import {
  invitationSuccessMessage,
  type ScheduleInterviewPayload,
} from "@/lib/interviews/schedule-payload";
import { JobPublicViewLink } from "@/app/admin_recruiter/jobs/JobPublicViewLink";
import { applicationAiAnalysisHref } from "./CandidateAiAnalysisButton";
// Overview match/screening/candidate form lives on AI Analysis Overview.
// import { CandidateAnalysisWorkspace } from "./CandidateAnalysisWorkspace";
import { CandidateActivityTimeline } from "./CandidateActivityTimeline";
import { MspSubmissionPanel } from "./MspSubmissionPanel";
import { filterApplicationStatusesForSource } from "@/lib/jobs/msp-submission";
import { readStatusGroupFields } from "@/lib/jobs/application-statuses/groups";
import { GroupedStatusMenuList } from "@/app/admin_recruiter/components/GroupedStatusMenu";
import { ReplaceResumeConfirmModal } from "./ReplaceResumeConfirmModal";
import { ResumeHistoryModal, type ResumeHistoryItem } from "./ResumeHistoryModal";
import { candidateApplicantProfileHref } from "@/app/admin_recruiter/candidates/candidate-links";
import { workTypeLabel, type CandidateProfileApplication } from "@/lib/admin/candidate-profile-view";
import {
  candidateProfileApiUrl,
  fetchStaffDetailJson,
  jobDetailsApiUrl,
} from "@/lib/admin/staff-detail-fetch-cache";
import {
  applicationReviewHref,
  formatProfileApplicationDate,
  workTypeBadgeClass,
} from "@/app/admin_recruiter/candidates/[workerId]/candidate-profile-ui";

type ApplicationRow = {
  id: string;
  status: string;
  status_id?: string | null;
  statusName?: string | null;
  workflow_phase?: string | null;
  created_at: string;
  submitted_at: string | null;
  updated_at?: string | null;
  job_requisition_id: string;
  worker_id: string | null;
  ai_match_status?: string | null;
  ai_match_score?: number | null;
  ai_match_category?: string | null;
  ai_match_action?: string | null;
  ai_match_readiness?: string | null;
  ai_match_display_category?: string | null;
  job_requisitions: Record<string, unknown> | Record<string, unknown>[] | null;
  applicant_profiles: Record<string, unknown> | Record<string, unknown>[] | null;
  worker?: Record<string, unknown> | Record<string, unknown>[] | null;
};

type StatusOption = {
  id: string;
  name: string;
  systemKey: string | null;
  sortOrder?: number;
  groupId?: string | null;
  groupName?: string | null;
  groupDescription?: string | null;
  groupSortOrder?: number | null;
};

type StatusHistoryItem = {
  id: string;
  fromStatus: { id: string | null; name: string | null };
  toStatus: { id: string | null; name: string };
  note: string | null;
  changedBy: { id: string | null; name: string | null };
  changedAt: string;
};

type JobOption = {
  id: string;
  public_title: string | null;
  location: string | null;
  facility: string | null;
  facility_name: string | null;
};

type WorkerProfilePayload = {
  worker: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email?: string | null;
    phone?: string | null;
    city: string | null;
    state: string | null;
    address?: string | null;
    job_role?: string | null;
    profile_photo_url?: string | null;
  };
  requirements: {
    resume_path: string | null;
    resume_url: string | null;
  } | null;
};

function one(value: Record<string, unknown> | Record<string, unknown>[] | null | undefined) {
  if (!value) return {} as Record<string, unknown>;
  return (Array.isArray(value) ? value[0] : value) ?? ({} as Record<string, unknown>);
}

function applicantName(row: ApplicationRow): string {
  return resolveApplicationApplicantName(row);
}

function applicantEmail(row: ApplicationRow): string {
  return resolveApplicationApplicantEmail(row);
}

function resolveWorkerId(row: ApplicationRow): string | null {
  if (row.worker_id?.trim()) return row.worker_id.trim();
  const fromProfile = String(one(row.applicant_profiles).worker_id ?? "").trim();
  return fromProfile || null;
}

function formatJobLocation(job: JobOption | null, fallback?: Record<string, unknown>): string {
  if (job) {
    return (
      job.location?.trim() ||
      job.facility_name?.trim() ||
      job.facility?.trim() ||
      "—"
    );
  }
  if (!fallback) return "—";
  return (
    String(fallback.location ?? "").trim() ||
    String(fallback.facility_name ?? "").trim() ||
    String(fallback.facility ?? "").trim() ||
    "—"
  );
}

function formatAppliedMeta(iso: string | null | undefined): string {
  if (!iso) return "Applied";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Applied";
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfThatDay = new Date(date);
  startOfThatDay.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((startOfToday.getTime() - startOfThatDay.getTime()) / 86400000);
  if (dayDiff === 0) return "Applied today";
  if (dayDiff === 1) return "Applied yesterday";
  return `Applied ${date.toLocaleDateString("en-US", { timeZone: "America/New_York",  month: "long", day: "numeric", year: "numeric" })}`;
}

function formatActivityDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { timeZone: "America/New_York",  month: "long", day: "numeric", year: "numeric" });
}

export default function JobCandidateReviewClient() {
  const branding = useTenantBranding();
  const brandStyle = brandingToCssVars(branding) as CSSProperties;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const jobMenuRef = useRef<HTMLDivElement>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);

  const jobId = searchParams.get("jobId")?.trim() ?? "";
  const applicationId = searchParams.get("applicationId")?.trim() ?? "";

  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [jobOptions, setJobOptions] = useState<JobOption[]>([]);
  const [jobMenuOpen, setJobMenuOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);
  const [profile, setProfile] = useState<WorkerProfilePayload | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [messageOpen, setMessageOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [editingInterviewId, setEditingInterviewId] = useState<string | null>(null);
  const [interviewSubmitting, setInterviewSubmitting] = useState(false);
  const [interviewError, setInterviewError] = useState<string | null>(null);
  const [upcomingInterview, setUpcomingInterview] = useState<AdminInterviewItem | null>(null);
  const [upcomingInterviewLoading, setUpcomingInterviewLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [resumePreviewError, setResumePreviewError] = useState<string | null>(null);
  const [resumePreviewKey, setResumePreviewKey] = useState(0);
  const [matchReloadToken, setMatchReloadToken] = useState(0);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [pendingResumeFile, setPendingResumeFile] = useState<File | null>(null);
  const resumeInputRef = useRef<HTMLInputElement | null>(null);
  const [resumeHistoryOpen, setResumeHistoryOpen] = useState(false);
  const [resumeHistoryLoading, setResumeHistoryLoading] = useState(false);
  const [resumeHistoryError, setResumeHistoryError] = useState<string | null>(null);
  const [resumeHistoryJobTitle, setResumeHistoryJobTitle] = useState("");
  const [resumeHistoryItems, setResumeHistoryItems] = useState<ResumeHistoryItem[]>([]);
  const [resumeHistoryBusyId, setResumeHistoryBusyId] = useState<string | null>(null);
  /** Admin uploads for this candidate across every job, which is what the quota counts. */
  const [adminResumeUploadCount, setAdminResumeUploadCount] = useState(0);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatPreferExpanded, setChatPreferExpanded] = useState(false);
  const [publicJobPath, setPublicJobPath] = useState<string | null>(null);
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  const [pendingStatus, setPendingStatus] = useState<StatusOption | null>(null);
  const [statusChangeNote, setStatusChangeNote] = useState("");
  const [statusHistory, setStatusHistory] = useState<StatusHistoryItem[]>([]);
  const [statusHistoryLoading, setStatusHistoryLoading] = useState(false);
  const [statusHistoryError, setStatusHistoryError] = useState<string | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<"resume" | "activity" | "application">("resume");
  const [workerApplications, setWorkerApplications] = useState<CandidateProfileApplication[]>([]);
  const [workerApplicationsLoading, setWorkerApplicationsLoading] = useState(false);
  const [removingFromJob, setRemovingFromJob] = useState(false);

  const selected = useMemo(
    () => rows.find((row) => row.id === applicationId) ?? rows[0] ?? null,
    [rows, applicationId]
  );

  const selectedIndex = useMemo(() => {
    if (!selected) return -1;
    return rows.findIndex((row) => row.id === selected.id);
  }, [rows, selected]);

  const selectedJob = useMemo(
    () => jobOptions.find((option) => option.id === jobId) ?? null,
    [jobOptions, jobId]
  );

  const adminResumeUploadLimitReached =
    adminResumeUploadCount >= MAX_RESUME_UPLOADS_PER_ROLE;

  /**
   * At the quota, re-uploading replaces the newest admin resume for this job
   * instead of adding another one.
   */
  const resumeIdToReplace = adminResumeUploadLimitReached
    ? [...resumeHistoryItems].reverse().find((resume) => resume.uploadedByType === "staff")?.id ??
      resumeHistoryItems[resumeHistoryItems.length - 1]?.id ??
      null
    : null;

  const jobTitle =
    selectedJob?.public_title?.trim() ||
    String(one(selected?.job_requisitions ?? null).public_title ?? "").trim() ||
    (jobId ? "Job" : "Select a job");
  const jobLocation = formatJobLocation(
    selectedJob,
    one(selected?.job_requisitions ?? null)
  );

  const workerId = selected ? resolveWorkerId(selected) : null;
  const profileName = [
    profile?.worker.first_name,
    profile?.worker.last_name,
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const displayName =
    profileName || (selected ? applicantName(selected) : "Candidate");
  const displayEmail =
    profile?.worker.email?.trim() || (selected ? applicantEmail(selected) : "");
  const displayPhone = profile?.worker.phone?.trim() || null;
  const displayLocation = [
    profile?.worker.address,
    profile?.worker.city,
    profile?.worker.state,
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(", ") || jobLocation;

  const resumePath = profile?.requirements?.resume_path?.trim() || null;
  const resumeUrl = profile?.requirements?.resume_url?.trim() || null;
  const hasResume = Boolean(resumePath || resumeUrl);
  const resumePreviewUrl = workerId
    ? `/api/admin/worker-resume-preview?workerId=${encodeURIComponent(workerId)}${
        selected?.id ? `&applicationId=${encodeURIComponent(selected.id)}` : ""
      }&v=${resumePreviewKey}`
    : null;
  const resumeDownloadUrl = resumeUrl
    ? `${resumeUrl}${resumeUrl.includes("?") ? "&" : "?"}v=${resumePreviewKey}`
    : resumePreviewUrl;

  const currentStatusLabel = selected
    ? selected.statusName?.trim() ||
      statusOptions.find((option) => option.id === selected.status_id)?.name ||
      applicationStatusLabel(selected.status)
    : "—";

  const currentStatusKey = selected
    ? normalizeApplicationStatus(selected.status)
    : "new";
  const jobSourceType = String(one(selected?.job_requisitions ?? null).source_type ?? "").trim();
  const visibleStatusOptions = useMemo(
    () => filterApplicationStatusesForSource(statusOptions, jobSourceType, selected?.status_id),
    [jobSourceType, selected?.status_id, statusOptions]
  );

  const secondaryColor = branding.secondaryHex || "#012352";

  const chatAppliedOnLabel = useMemo(() => {
    if (!selected) return null;
    const raw = selected.submitted_at || selected.created_at;
    if (!raw) return null;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return `Applied on ${date.toLocaleDateString("en-US", { timeZone: "America/New_York", 
      month: "long",
      day: "numeric",
    })}`;
  }, [selected]);

  useEffect(() => {
    if (workerId) {
      setChatOpen(true);
      setChatPreferExpanded(false);
    } else {
      setChatOpen(false);
    }
  }, [workerId]);

  const setApplicationId = useCallback(
    (nextId: string) => {
      if (!jobId || !nextId) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set("jobId", jobId);
      params.set("applicationId", nextId);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [jobId, pathname, router, searchParams]
  );

  const selectJob = useCallback(
    (nextJob: JobOption) => {
      setJobMenuOpen(false);
      const params = new URLSearchParams();
      params.set("jobId", nextJob.id);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, router]
  );

  useEffect(() => {
    if (!jobMenuOpen && !statusMenuOpen) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (jobMenuOpen && !jobMenuRef.current?.contains(target)) setJobMenuOpen(false);
      if (statusMenuOpen && !statusMenuRef.current?.contains(target)) setStatusMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [jobMenuOpen, statusMenuOpen]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/jobs", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Failed to load jobs");
        setJobOptions((payload.jobs ?? []) as JobOption[]);
      } catch {
        setJobOptions([]);
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!jobId) {
        setPublicJobPath(null);
        return;
      }
      try {
        const { ok, payload } = await fetchStaffDetailJson<{
          publicJobPath?: string;
          error?: string;
        }>(jobDetailsApiUrl(jobId));
        if (cancelled) return;
        if (!ok) {
          setPublicJobPath(null);
          return;
        }
        setPublicJobPath(
          typeof payload.publicJobPath === "string" ? payload.publicJobPath : null
        );
      } catch {
        if (!cancelled) setPublicJobPath(null);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!jobId) {
        setRows([]);
        setLoading(false);
        setError("");
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(
          `/api/admin/job-applications?jobId=${encodeURIComponent(jobId)}`,
          { cache: "no-store" }
        );
        const payload = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(payload.error || "Failed to load applications");
        const applications = ((payload.applications ?? []) as ApplicationRow[]).filter(
          (row) => row.job_requisition_id === jobId
        );
        setRows(applications);
        setError("");
        if (!applicationId && applications[0]) {
          setApplicationId(applications[0].id);
        } else if (
          applicationId &&
          applications.length > 0 &&
          !applications.some((row) => row.id === applicationId)
        ) {
          setApplicationId(applications[0].id);
        }
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load applications");
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps -- only reload list when job changes

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!workerId) {
        setProfile(null);
        setProfileLoading(false);
        return;
      }
      setProfileLoading(true);
      try {
        const applicationQuery = selected?.id
          ? `&applicationId=${encodeURIComponent(selected.id)}`
          : "";
        const response = await fetch(
          `/api/admin/worker-profile?workerId=${encodeURIComponent(workerId)}${applicationQuery}`,
          { cache: "no-store" }
        );
        const payload = (await response.json()) as WorkerProfilePayload & { error?: string };
        if (cancelled) return;
        if (!response.ok) throw new Error(payload.error || "Failed to load profile");
        setProfile(payload);
      } catch {
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [workerId, selected?.id]);

  useEffect(() => {
    if (!workerId) {
      setWorkerApplications([]);
      setWorkerApplicationsLoading(false);
      return;
    }
    let cancelled = false;
    setWorkerApplicationsLoading(true);
    void (async () => {
      try {
        const { ok, payload } = await fetchStaffDetailJson<{
          applications?: CandidateProfileApplication[];
          error?: string;
        }>(candidateProfileApiUrl(workerId));
        if (cancelled) return;
        if (!ok) throw new Error(payload.error || "Failed to load applications");
        setWorkerApplications(payload.applications ?? []);
      } catch {
        if (!cancelled) setWorkerApplications([]);
      } finally {
        if (!cancelled) setWorkerApplicationsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workerId]);

  useEffect(() => {
    setResumePreviewError(null);
    setZoom(100);
  }, [workerId, resumeUrl, resumePreviewKey]);

  const reloadWorkerProfile = useCallback(async (targetWorkerId: string) => {
    const applicationQuery = selected?.id
      ? `&applicationId=${encodeURIComponent(selected.id)}`
      : "";
    const response = await fetch(
      `/api/admin/worker-profile?workerId=${encodeURIComponent(targetWorkerId)}${applicationQuery}`,
      { cache: "no-store" }
    );
    const payload = (await response.json()) as WorkerProfilePayload & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Failed to refresh profile");
    setProfile(payload);
  }, [selected?.id]);

  function beginReuploadResume() {
    if (!selected?.id) return;
    if (!workerId) {
      toast.error("Candidate profile is not linked yet, so resume cannot be uploaded.");
      return;
    }
    if (adminResumeUploadLimitReached && !resumeIdToReplace) {
      toast.error(resumeUploadLimitMessage("admin"));
      return;
    }
    window.requestAnimationFrame(() => {
      resumeInputRef.current?.click();
    });
  }

  const loadResumeHistory = useCallback(async (applicationIdForHistory: string) => {
    setResumeHistoryLoading(true);
    setResumeHistoryError(null);
    try {
      const response = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationIdForHistory)}/resume-history`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as {
        error?: string;
        jobTitle?: string;
        resumes?: ResumeHistoryItem[];
        adminUploadCount?: number;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Could not load resume history.");
      }
      setResumeHistoryJobTitle(payload.jobTitle?.trim() || jobTitle);
      setResumeHistoryItems(payload.resumes ?? []);
      setAdminResumeUploadCount(payload.adminUploadCount ?? 0);
    } catch (err) {
      setResumeHistoryError(err instanceof Error ? err.message : "Could not load resume history.");
      setResumeHistoryItems([]);
      setAdminResumeUploadCount(0);
    } finally {
      setResumeHistoryLoading(false);
    }
  }, [jobTitle]);

  function openResumeHistory() {
    if (!selected?.id) return;
    setResumeHistoryOpen(true);
    void loadResumeHistory(selected.id);
  }

  async function viewResumeFromHistory(resumeId: string) {
    if (!selected?.id || !workerId) return;
    window.open(
      adminWorkerResumePreviewHref({
        workerId,
        resumeId,
        applicationId: selected.id,
      }),
      "_blank",
      "noopener,noreferrer"
    );
  }

  async function parseResumeFromHistory(resumeId: string) {
    if (!selected?.id) return;
    setResumeHistoryBusyId(resumeId);
    try {
      const response = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(selected.id)}/resumes/${encodeURIComponent(resumeId)}/parse`,
        { method: "POST" }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        resumes?: ResumeHistoryItem[];
      };
      if (!response.ok) {
        throw new Error(payload.error || "Could not parse resume.");
      }
      if (payload.resumes) setResumeHistoryItems(payload.resumes);
      else await loadResumeHistory(selected.id);
      toast.success("Resume parsed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not parse resume.");
    } finally {
      setResumeHistoryBusyId(null);
    }
  }

  async function deleteResumeFromHistory(resumeId: string, fileName: string) {
    if (!selected?.id) return;
    if (!window.confirm(`Delete ${fileName}? This cannot be undone.`)) return;

    const applicationIdForDelete = selected.id;
    const workerIdForDelete = workerId;
    setResumeHistoryBusyId(resumeId);
    try {
      const response = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationIdForDelete)}/resumes/${encodeURIComponent(resumeId)}`,
        { method: "DELETE" }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        resumes?: ResumeHistoryItem[];
        adminUploadCount?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Could not delete resume.");
      }

      setResumeHistoryItems(payload.resumes ?? []);
      setAdminResumeUploadCount(payload.adminUploadCount ?? 0);
      if (workerIdForDelete) {
        await reloadWorkerProfile(workerIdForDelete);
      }
      setResumePreviewKey((value) => value + 1);
      setResumePreviewError(null);
      toast.success("Resume deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete resume.");
    } finally {
      setResumeHistoryBusyId(null);
    }
  }

  function handleResumeFilePicked(file: File | undefined) {
    if (resumeInputRef.current) resumeInputRef.current.value = "";
    if (!file) return;

    const validationError = validateResumeUploadFile({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setPendingResumeFile(file);
  }

  async function confirmReplaceResume() {
    if (!pendingResumeFile || !selected?.id) return;
    const applicationIdForUpload = selected.id;
    const workerIdForUpload = workerId;
    setResumeUploading(true);
    try {
      const form = new FormData();
      form.set("resume", pendingResumeFile);
      if (resumeIdToReplace) form.set("resumeId", resumeIdToReplace);
      const response = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationIdForUpload)}/resume`,
        { method: "POST", body: form }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string" ? payload.error : "Failed to upload resume"
        );
      }

      const autoQuickMatch = payload.autoQuickMatch as
        | {
            status?: string;
            error?: string | null;
            score?: number | null;
            category?: string | null;
            action?: string | null;
            readiness?: string | null;
            displayCategory?: string | null;
            stage?: string | null;
          }
        | null
        | undefined;
      const matchOk = autoQuickMatch?.status === "ANALYZED";
      const matchFailed = Boolean(autoQuickMatch && autoQuickMatch.status !== "ANALYZED");

      setPendingResumeFile(null);
      toast.success("Resume updated successfully.");
      if (matchOk) {
        toast.success("Quick Match complete.");
      } else if (matchFailed) {
        toast.error(
          typeof autoQuickMatch?.error === "string" && autoQuickMatch.error.trim()
            ? autoQuickMatch.error
            : "Quick Match did not finish — use Re-run Quick Match to try again."
        );
      }
      if (workerIdForUpload) {
        void reloadWorkerProfile(workerIdForUpload).then(() => {
          setResumePreviewKey((value) => value + 1);
          setResumePreviewError(null);
        });
      } else {
        setResumePreviewKey((value) => value + 1);
        setResumePreviewError(null);
      }
      if (resumeHistoryOpen) {
        void loadResumeHistory(applicationIdForUpload);
      }

      setRows((current) =>
        current.map((row) =>
          row.id === applicationIdForUpload
            ? matchOk && autoQuickMatch
              ? {
                  ...row,
                  ai_match_status: autoQuickMatch.status ?? "ANALYZED",
                  ai_match_score: autoQuickMatch.score ?? null,
                  ai_match_category: autoQuickMatch.category ?? null,
                  ai_match_action: autoQuickMatch.action ?? null,
                  ai_match_readiness: autoQuickMatch.readiness ?? null,
                  ai_match_display_category: autoQuickMatch.displayCategory ?? null,
                }
              : {
                  ...row,
                  ai_match_status: matchFailed ? "FAILED" : "READY",
                  ai_match_score: null,
                  ai_match_category: null,
                  ai_match_action: null,
                  ai_match_readiness: null,
                  ai_match_display_category: null,
                }
            : row
        )
      );
      setMatchReloadToken((value) => value + 1);
    } catch (uploadError) {
      toast.error(
        uploadError instanceof Error ? uploadError.message : "Failed to upload resume"
      );
    } finally {
      setResumeUploading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!workerId) {
        setUpcomingInterview(null);
        setUpcomingInterviewLoading(false);
        return;
      }
      setUpcomingInterviewLoading(true);
      try {
        const response = await fetch(
          `/api/admin/applicant-appointments?tab=upcoming&workerId=${encodeURIComponent(workerId)}&applicationId=${encodeURIComponent(selected?.id ?? "")}`,
          { cache: "no-store" }
        );
        const payload = (await response.json()) as {
          error?: string;
          interviews?: AdminInterviewItem[];
        };
        if (cancelled) return;
        if (!response.ok) throw new Error(payload.error || "Failed to load interviews");
        const interviews = payload.interviews ?? [];
        setUpcomingInterview(interviews[0] ?? null);
      } catch {
        if (!cancelled) setUpcomingInterview(null);
      } finally {
        if (!cancelled) setUpcomingInterviewLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [workerId, selected?.id]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/application-statuses?activeOnly=1", {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Failed to load statuses");
        setStatusOptions(
          ((payload.statuses ?? []) as Array<Record<string, unknown>>).map((row) => ({
            id: String(row.id),
            name: String(row.name),
            systemKey: (row.systemKey as string | null) ?? null,
            sortOrder: Number(row.sortOrder ?? 0),
            ...readStatusGroupFields(row),
          }))
        );
      } catch {
        setStatusOptions([]);
      }
    })();
  }, []);

  const loadStatusHistory = useCallback(async (appId: string) => {
    setStatusHistoryLoading(true);
    setStatusHistoryError(null);
    try {
      const response = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(appId)}/status-history`,
        { cache: "no-store" }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to load status history");
      setStatusHistory((payload.history ?? []) as StatusHistoryItem[]);
    } catch (loadError) {
      setStatusHistory([]);
      setStatusHistoryError(
        loadError instanceof Error ? loadError.message : "Failed to load status history"
      );
    } finally {
      setStatusHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selected?.id) {
      setStatusHistory([]);
      return;
    }
    void loadStatusHistory(selected.id);
  }, [selected?.id, loadStatusHistory]);

  function beginStatusChange(option: StatusOption) {
    if (!selected) return;
    if (option.id === selected.status_id) {
      setStatusMenuOpen(false);
      return;
    }
    setStatusMenuOpen(false);
    setPendingStatus(option);
    setStatusChangeNote("");
  }

  function beginStatusChangeBySystemKey(systemKey: string) {
    const option = statusOptions.find((item) => item.systemKey === systemKey);
    if (!option) {
      toast.error("That status is not configured for this organization.");
      return;
    }
    beginStatusChange(option);
  }

  async function confirmStatusChange() {
    if (!selected || !pendingStatus) return;
    setStatusBusy(true);
    try {
      const response = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(selected.id)}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            statusId: pendingStatus.id,
            note: statusChangeNote.trim() || undefined,
          }),
        }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to update status");
      setRows((current) =>
        current.map((row) =>
          row.id === selected.id
            ? {
                ...row,
                status: String(payload.application?.status ?? pendingStatus.systemKey ?? row.status),
                status_id: String(payload.application?.statusId ?? pendingStatus.id),
                statusName: String(
                  payload.application?.statusName ?? pendingStatus.name
                ),
                workflow_phase: String(
                  payload.postHire?.phase ?? row.workflow_phase ?? "pre_hire"
                ),
              }
            : row
        )
      );
      setPendingStatus(null);
      setStatusChangeNote("");
      toast.success(
        payload.unchanged
          ? "Status unchanged"
          : payload.postHire?.activated
            ? `Status updated to ${payload.application?.statusName ?? pendingStatus.name}. Onboarding invitation sent.`
            : `Status updated to ${payload.application?.statusName ?? pendingStatus.name}`
      );
      await loadStatusHistory(selected.id);
    } catch (updateError) {
      toast.error(updateError instanceof Error ? updateError.message : "Failed to update status");
    } finally {
      setStatusBusy(false);
    }
  }

  async function saveNote() {
    if (!workerId) {
      toast.error("This applicant is not linked to a worker profile yet.");
      return;
    }
    const body = noteDraft.trim();
    if (!body) {
      toast.error("Please type a note before saving.");
      return;
    }
    setNoteSaving(true);
    try {
      const response = await fetch("/api/admin/worker-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId, body, applicationId: selected?.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to save note");
      setNoteDraft("");
      toast.success("Note saved");
      setMatchReloadToken((value) => value + 1);
    } catch (noteError) {
      toast.error(noteError instanceof Error ? noteError.message : "Failed to save note");
    } finally {
      setNoteSaving(false);
    }
  }

  async function handleRemoveFromJob() {
    if (!selected) return;
    if (!window.confirm(`Remove ${displayName} from ${jobTitle}? This does not delete the candidate or other job applications.`)) {
      return;
    }
    setRemovingFromJob(true);
    try {
      const response = await fetch(`/api/admin/job-applications/${encodeURIComponent(selected.id)}/remove`, {
        method: "DELETE",
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Failed to remove from job");
      toast.success("Candidate removed from this job");
      setRows((current) => current.filter((row) => row.id !== selected.id));
    } catch (removeError) {
      toast.error(removeError instanceof Error ? removeError.message : "Failed to remove from job");
    } finally {
      setRemovingFromJob(false);
    }
  }

  async function reloadUpcomingInterview() {
    if (!workerId) {
      setUpcomingInterview(null);
      return;
    }
    const response = await fetch(
      `/api/admin/applicant-appointments?tab=upcoming&workerId=${encodeURIComponent(workerId)}&applicationId=${encodeURIComponent(selected?.id ?? "")}`,
      { cache: "no-store" }
    );
    const payload = (await response.json()) as {
      error?: string;
      interviews?: AdminInterviewItem[];
    };
    if (!response.ok) throw new Error(payload.error || "Failed to load interviews");
    const interviews = payload.interviews ?? [];
    setUpcomingInterview(interviews[0] ?? null);
  }

  async function handleSchedule(payload: ScheduleInterviewPayload) {
    if (!selected) return;
    setInterviewSubmitting(true);
    setInterviewError(null);
    try {
      const isEdit = Boolean(editingInterviewId);
      const response = await fetch(
        isEdit
          ? `/api/admin/applicant-appointments/${encodeURIComponent(editingInterviewId as string)}`
          : "/api/admin/applicant-appointments",
        {
          method: isEdit ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            applicationId: selected.id,
            jobId: jobId || selected.job_requisition_id,
          }),
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        interview?: AdminInterviewItem;
        statusUpdated?: boolean;
        invitation?: {
          sentCount: number;
          failedCount: number;
          skippedCount: number;
          invitationStatus: "sent" | "partial" | "failed" | "pending";
        };
      };
      if (!response.ok) throw new Error(data.error || "Failed to schedule interview");
      await reloadUpcomingInterview();
      if (!isEdit && data.statusUpdated) {
        setRows((current) =>
          current.map((row) =>
            row.id === selected.id ? { ...row, status: "interviewing" } : row
          )
        );
      }
      setInterviewOpen(false);
      setEditingInterviewId(null);
      toast.success(
        isEdit
          ? invitationSuccessMessage(data.invitation).replace("scheduled", "updated")
          : invitationSuccessMessage(data.invitation)
      );
    } catch (scheduleError) {
      setInterviewError(
        scheduleError instanceof Error ? scheduleError.message : "Failed to schedule interview"
      );
    } finally {
      setInterviewSubmitting(false);
    }
  }

  async function handleCancelInterview() {
    if (!upcomingInterview) return;
    setInterviewSubmitting(true);
    try {
      const response = await fetch(
        `/api/admin/applicant-appointments/${encodeURIComponent(upcomingInterview.id)}`,
        { method: "DELETE", credentials: "include" }
      );
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Failed to cancel interview");
      await reloadUpcomingInterview();
      toast.success("Interview cancelled and cancellation notices sent.");
    } catch (cancelError) {
      toast.error(cancelError instanceof Error ? cancelError.message : "Failed to cancel interview");
    } finally {
      setInterviewSubmitting(false);
    }
  }

  function goRelative(delta: number) {
    if (selectedIndex < 0) return;
    const next = rows[selectedIndex + delta];
    if (next) setApplicationId(next.id);
  }

  return (
    <div
      className="box-border flex min-h-0 w-full min-w-0 max-w-full flex-col px-5 pb-8"
      style={brandStyle}
    >
      <div className="flex flex-wrap items-center gap-5 border-b border-[#E5E7EB] py-5">
        <h1 className={CANDIDATES_PAGE_TITLE_CLASS} style={CANDIDATES_PAGE_TITLE_STYLE}>
          Candidates
        </h1>
        <Link
          href={
            jobId
              ? `/admin_recruiter/applications?jobId=${encodeURIComponent(jobId)}`
              : "/admin_recruiter/applications"
          }
          className="admin-recruiter-action-chip inline-flex h-7 items-center rounded-lg px-2.5 text-xs font-semibold text-white"
          style={{ backgroundColor: branding.primaryHex }}
        >
          All Candidates
        </Link>
      </div>

      <div className="flex min-w-0 flex-col gap-1 border-b border-[#E5E7EB] py-5">
        <div className="relative min-w-0" ref={jobMenuRef}>
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setJobMenuOpen((open) => !open)}
              className="inline-flex min-h-7 min-w-0 max-w-full items-center gap-1.5 text-left transition hover:opacity-80"
              aria-expanded={jobMenuOpen}
            >
              <span
                className="text-lg font-semibold leading-7 break-words"
                style={{ color: branding.primaryHex }}
              >
                {jobTitle}
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition ${jobMenuOpen ? "rotate-180" : ""}`}
                style={{ color: branding.primaryHex }}
              />
            </button>
            <JobPublicViewLink href={publicJobPath} />
          </div>
          {jobMenuOpen ? (
            <div className="absolute left-0 z-40 mt-2 w-[min(100vw-2rem,360px)] overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-lg">
              <div className="max-h-72 overflow-y-auto py-1">
                {jobOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => selectJob(option)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[#F8FAFC]"
                  >
                    <span className="inline-flex h-4 w-4 items-center justify-center">
                      {option.id === jobId ? (
                        <Check className="h-4 w-4" style={{ color: branding.primaryHex }} />
                      ) : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-[#1E293B]">
                        {option.public_title || "Untitled job"}
                      </span>
                      <span className="block truncate text-xs text-[#64748B]">
                        {formatJobLocation(option)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <p className="inline-flex min-w-0 items-center gap-1.5 text-sm text-[#64748B]">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" />
          <span className="break-words">{jobLocation}</span>
        </p>
      </div>

      {/* Figma Frame 6926: Back + pager — 14px vertical, 20px left via page px-5 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] py-[14px] sm:gap-3">
        <Link
          href="/admin_recruiter/jobs"
          className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
          style={{ color: branding.secondaryHex || "#012352" }}
        >
          <span
            aria-hidden
            className="inline-block h-[14px] w-[14px] shrink-0"
            style={{
              backgroundColor: "currentColor",
              maskImage: "url(/eva_arrow-back-fill.svg)",
              WebkitMaskImage: "url(/eva_arrow-back-fill.svg)",
              maskSize: "contain",
              WebkitMaskSize: "contain",
            }}
          />
          Back to jobs
        </Link>
        <div className="inline-flex shrink-0 items-center gap-1 text-sm text-[#64748B]">
          <button
            type="button"
            onClick={() => goRelative(-1)}
            disabled={selectedIndex <= 0}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white disabled:opacity-40 sm:h-8 sm:w-8"
            aria-label="Previous candidate"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[4.5rem] text-center tabular-nums">
            {rows.length === 0 ? "0 of 0" : `${selectedIndex + 1} of ${rows.length}`}
          </span>
          <button
            type="button"
            onClick={() => goRelative(1)}
            disabled={selectedIndex < 0 || selectedIndex >= rows.length - 1}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white disabled:opacity-40 sm:h-8 sm:w-8"
            aria-label="Next candidate"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {!jobId ? (
        <p className="mt-4 rounded-xl border border-[#E5E7EB] bg-white px-4 py-12 text-center text-sm text-[#64748B]">
          Select a job to review candidates.
        </p>
      ) : (
        <div className="mt-4 grid min-h-0 grid-cols-1 gap-3 sm:gap-4 xl:min-h-[calc(100vh-260px)] xl:grid-cols-[240px_minmax(0,1fr)_280px]">
          {/* Left — rounded candidate cards */}
          <aside className="min-h-0 min-w-0 order-1 xl:order-none">
            <div className="-mx-1 flex max-h-[28vh] snap-x snap-mandatory gap-2 overflow-x-auto overflow-y-hidden px-1 pb-1 sm:max-h-[32vh] sm:flex-col sm:overflow-x-hidden sm:overflow-y-auto sm:snap-none sm:pb-0 sm:pr-0.5 xl:max-h-[calc(100vh-260px)]">
              {loading ? (
                <p className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-8 text-center text-sm text-[#64748B]">
                  Loading…
                </p>
              ) : rows.length === 0 ? (
                <p className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-8 text-center text-sm text-[#64748B]">
                  No candidates yet.
                </p>
              ) : (
                rows.map((row) => {
                  const active = selected?.id === row.id;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setApplicationId(row.id)}
                      className={`w-[min(78vw,280px)] shrink-0 snap-start rounded-xl border px-3.5 py-3 text-left transition sm:w-full sm:shrink ${active
                          ? "shadow-sm"
                          : "border-[#E5E7EB] bg-white hover:border-[#CBD5E1] hover:bg-[#FAFBFC]"
                        }`}
                      style={
                        active
                          ? {
                            borderColor: branding.primaryHex,
                            backgroundColor: `color-mix(in srgb, ${branding.primaryHex} 8%, white)`,
                          }
                          : undefined
                      }
                    >
                      <p
                        className="truncate text-sm font-semibold"
                        style={{ color: branding.secondaryHex || "#012352" }}
                      >
                        {applicantName(row)}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-[#64748B]">
                        {applicantEmail(row) || jobLocation}
                      </p>
                      <p className="mt-1.5 text-[11px] leading-4 text-[#94A3B8]">
                        {applicationStatusLabel(row.status)} •{" "}
                        {formatAppliedMeta(row.submitted_at || row.created_at)}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* Center — profile + resume (Figma Frame 6927: 20px inset + gap) */}
          <section className="order-2 flex min-w-0 flex-col self-start overflow-hidden rounded-xl border border-[#E5E7EB] bg-white xl:order-none xl:w-full">
            {!selected ? (
              <p className="px-5 py-12 text-center text-sm text-[#64748B]">
                Select a candidate from the list.
              </p>
            ) : (
              <>
                <div className="border-b border-[#E5E7EB] px-5 pt-5 pb-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <h2
                        className="truncate text-[18px] font-semibold leading-7 sm:break-words sm:whitespace-normal sm:text-[22px]"
                        style={{ color: secondaryColor }}
                        title={displayName}
                      >
                        {displayName}
                      </h2>
                      <p className="mt-1 text-sm font-medium text-[#334155]">{jobTitle}</p>
                      <p className="mt-1 flex min-w-0 items-start gap-1.5 text-sm text-[#64748B]">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#94A3B8]" />
                        <span className="min-w-0 break-words">{displayLocation}</span>
                      </p>
                    </div>
                    <div className="inline-flex w-full shrink-0 items-center justify-end gap-0.5 sm:w-auto">
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#16A34A] transition hover:bg-[#F0FDF4] sm:h-8 sm:w-8"
                        aria-label="Accept"
                        title="Accept"
                        onClick={() => beginStatusChangeBySystemKey("hired")}
                      >
                        <Check className="h-4 w-4" strokeWidth={2.25} />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#64748B] transition hover:bg-[#F8FAFC] sm:h-8 sm:w-8"
                        aria-label="Maybe"
                        title="Maybe"
                        onClick={() => beginStatusChangeBySystemKey("undecided")}
                      >
                        <HelpCircle className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#DC2626] transition hover:bg-[#FEF2F2] sm:h-8 sm:w-8"
                        aria-label="Reject"
                        title="Reject"
                        onClick={() => beginStatusChangeBySystemKey("rejected")}
                      >
                        <X className="h-4 w-4" strokeWidth={2.25} />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#64748B] transition hover:bg-[#F8FAFC] sm:h-8 sm:w-8"
                        aria-label="More"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <button
                      type="button"
                      disabled={!workerId}
                      onClick={() => setInterviewOpen(true)}
                      className="admin-recruiter-action-chip h-10 w-full rounded-lg px-3.5 text-sm font-semibold text-white disabled:opacity-50 sm:h-9 sm:w-auto"
                      style={{ backgroundColor: branding.primaryHex }}
                    >
                      <BrandedSvgIcon
                        src="/interview-jobs.svg"
                        className="h-4 w-4"
                        color="#FFFFFF"
                      />
                      <span>
                        {upcomingInterview ? "Schedule another interview" : "Setup Interview"}
                      </span>
                    </button>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                    <button
                      type="button"
                      disabled={!workerId || (!displayEmail && !displayPhone)}
                      onClick={() => setMessageOpen(true)}
                      className="admin-recruiter-action-chip h-10 w-full rounded-lg border bg-white px-3.5 text-sm font-medium disabled:opacity-50 sm:h-9 sm:w-auto"
                      style={{
                        borderColor: branding.secondaryHex || "#012352",
                        color: branding.secondaryHex || "#012352",
                      }}
                    >
                      <BrandedSvgIcon
                        src="/message.svg"
                        className="h-4 w-4"
                        color={branding.secondaryHex || "#012352"}
                      />
                      <span>Message</span>
                    </button>
                    <button
                      type="button"
                      disabled={!workerId}
                      onClick={() => setCallOpen(true)}
                      className="admin-recruiter-action-chip h-10 w-full rounded-lg border bg-white px-3.5 text-sm font-medium disabled:opacity-50 sm:h-9 sm:w-auto"
                      style={{
                        borderColor: branding.secondaryHex || "#012352",
                        color: branding.secondaryHex || "#012352",
                      }}
                    >
                      <Phone className="h-4 w-4 shrink-0" aria-hidden />
                      <span>Call</span>
                    </button>
                    {workerId ? (
                      <Link
                        href={candidateApplicantProfileHref(workerId, {
                          from: "applications",
                          jobId: jobId || selected.job_requisition_id,
                        })}
                        className="admin-recruiter-action-chip h-10 w-full rounded-lg border bg-white px-3.5 text-sm font-medium sm:h-9 sm:w-auto"
                        style={{
                          borderColor: branding.secondaryHex || "#012352",
                          color: branding.secondaryHex || "#012352",
                        }}
                      >
                        <span>View Profile</span>
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="admin-recruiter-action-chip h-10 w-full rounded-lg border bg-white px-3.5 text-sm font-medium opacity-50 sm:h-9 sm:w-auto"
                        style={{
                          borderColor: branding.secondaryHex || "#012352",
                          color: branding.secondaryHex || "#012352",
                        }}
                      >
                        View Profile
                      </button>
                    )}
                    <Link
                      href={applicationAiAnalysisHref(
                        selected.id,
                        jobId || selected.job_requisition_id
                      )}
                      className="admin-recruiter-action-chip h-10 w-full rounded-lg border bg-white px-3.5 text-sm font-medium sm:h-9 sm:w-auto"
                      style={{
                        borderColor: branding.secondaryHex || "#012352",
                        color: branding.secondaryHex || "#012352",
                      }}
                    >
                      <BrandedSvgIcon
                        src="/ai-icon.svg"
                        className="h-4 w-4"
                        color={branding.secondaryHex || "#012352"}
                      />
                      <span>AI Analysis Overview</span>
                    </Link>
                    </div>
                  </div>
                  {statusHistory[0] ? (
                    <p className="mt-3 text-xs text-[#64748B]">
                      Status updated by: {statusHistory[0].changedBy.name || "System"} ·{" "}
                      {formatActivityDate(statusHistory[0].changedAt)}
                    </p>
                  ) : null}
                  {selected.created_at ? (
                    <p className="mt-1 text-xs text-[#64748B]">
                      Application created {formatActivityDate(selected.created_at)}
                    </p>
                  ) : null}
                  {upcomingInterviewLoading ? (
                    <p className="mt-4 text-sm text-[#64748B]">Loading interview schedule…</p>
                  ) : upcomingInterview ? (
                    <div
                      className="mt-4 rounded-xl border px-3.5 py-3 sm:px-4"
                      style={{
                        borderColor: `color-mix(in srgb, ${branding.primaryHex} 35%, #E5E7EB)`,
                        backgroundColor: `color-mix(in srgb, ${branding.primaryHex} 6%, white)`,
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${branding.primaryHex} 14%, white)`,
                            color: branding.primaryHex,
                          }}
                        >
                          <CalendarDays className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold" style={{ color: secondaryColor }}>
                            Upcoming interview
                          </p>
                          <p className="mt-0.5 text-sm font-medium text-[#1F2937]">
                            {upcomingInterview.title}
                          </p>
                          <p className="mt-1 text-sm text-[#64748B]">
                            {formatInterviewDate(upcomingInterview.startsAt)} ·{" "}
                            {formatInterviewTimeRange(
                              upcomingInterview.startsAt,
                              upcomingInterview.endsAt
                            )}
                          </p>
                          {upcomingInterview.meetingLink ? (
                            <a
                              href={upcomingInterview.meetingLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-flex text-sm font-medium underline"
                              style={{ color: branding.primaryHex }}
                            >
                              Open meeting link
                            </a>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={interviewSubmitting}
                              onClick={() => {
                                setEditingInterviewId(upcomingInterview.id);
                                setInterviewOpen(true);
                              }}
                              className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs font-semibold text-[#334155] disabled:opacity-50"
                            >
                              Reschedule
                            </button>
                            <button
                              type="button"
                              disabled={interviewSubmitting}
                              onClick={() => void handleCancelInterview()}
                              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50"
                            >
                              Cancel interview
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div
                  className="flex gap-2 px-5 pt-3"
                  role="tablist"
                  aria-label="Applicant details"
                >
                  {(
                    [
                      ["resume", "Resume"],
                      ["activity", "Activity"],
                      ["application", "Application"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={workspaceTab === id}
                      onClick={() => setWorkspaceTab(id)}
                      className={`border-b-2 px-2 pb-2 text-sm font-semibold ${
                        workspaceTab === id
                          ? "border-[color:var(--brand-primary,#bc8b41)] text-[#0F172A]"
                          : "border-transparent text-[#64748B]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {workspaceTab === "activity" ? (
                  <CandidateActivityTimeline applicationId={selected.id} reloadToken={matchReloadToken} />
                ) : workspaceTab === "application" ? (
                  <div className="overflow-x-auto overscroll-x-contain">
                    {workerApplicationsLoading ? (
                      <p className="px-5 py-12 text-center text-sm text-[#64748B]">Loading applications…</p>
                    ) : workerApplications.length === 0 ? (
                      <p className="px-5 py-12 text-center text-sm text-[#64748B]">
                        This candidate has not applied to any jobs yet.
                      </p>
                    ) : (
                      <table className="min-w-[720px] w-full text-left">
                        <thead>
                          <tr className="border-b border-[#E5E7EB] text-sm font-medium text-[#64748B]">
                            <th className="px-5 py-3 font-medium">Job Title</th>
                            <th className="px-4 py-3 text-center font-medium">Work Type</th>
                            <th className="px-4 py-3 text-center font-medium">Applied Date</th>
                            <th className="px-5 py-3 text-right font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {workerApplications.map((row) => {
                            const applied = formatProfileApplicationDate(row.appliedAt);
                            return (
                              <tr key={row.id} className="border-b border-[#F1F5F9] last:border-b-0">
                                <td className="px-5 py-4 align-top">
                                  <Link
                                    href={applicationReviewHref(row.id, row.jobRequisitionId)}
                                    className="block text-sm font-semibold leading-5 text-[color:var(--brand-primary)] hover:underline"
                                  >
                                    {row.jobTitle}
                                  </Link>
                                  {row.companyName ? (
                                    <p className="mt-0.5 text-xs leading-4 text-[#64748B]">
                                      {row.companyName}
                                    </p>
                                  ) : null}
                                </td>
                                <td className="px-4 py-4 text-center align-top">
                                  {row.workType ? (
                                    <span
                                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${workTypeBadgeClass(row.workType)}`}
                                    >
                                      {workTypeLabel(row.workType)}
                                    </span>
                                  ) : (
                                    <span className="text-sm text-[#94A3B8]">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-4 text-center align-top">
                                  <p className="text-sm font-medium leading-5 text-[#0F172A]">
                                    {applied.relative}
                                  </p>
                                  {applied.absolute && applied.absolute !== applied.relative ? (
                                    <p className="mt-0.5 text-xs leading-4 text-[#64748B]">
                                      {applied.absolute}
                                    </p>
                                  ) : null}
                                </td>
                                <td className="px-5 py-4 text-right align-top">
                                  <Link
                                    href={applicationReviewHref(row.id, row.jobRequisitionId)}
                                    className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--brand-primary)] hover:underline"
                                  >
                                    View Details
                                    <ChevronRight className="h-4 w-4" />
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                ) : (
                  <>
                {/* Resume heading + toolbar live on candidate profile. */}
                {/*
                <div className="border-b border-[#E5E7EB] px-5 pt-5">
                  <h3
                    className="text-lg font-semibold leading-7 sm:text-[20px]"
                    style={{ color: secondaryColor }}
                  >
                    Resume
                  </h3>
                  <div className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        className="admin-recruiter-action-chip h-10 w-10 rounded-lg transition hover:bg-[#F8FAFC] sm:h-9 sm:w-9"
                        onClick={() => setZoom((value) => Math.max(50, value - 10))}
                        aria-label="Zoom out"
                      >
                        <ZoomOut className="h-6 w-6 text-[#374151]" strokeWidth={2} aria-hidden />
                      </button>
                      <span className="admin-recruiter-zoom-pct">{zoom}%</span>
                      <button
                        type="button"
                        className="admin-recruiter-action-chip h-10 w-10 rounded-lg transition hover:bg-[#F8FAFC] sm:h-9 sm:w-9"
                        onClick={() => setZoom((value) => Math.min(150, value + 10))}
                        aria-label="Zoom in"
                      >
                        <ZoomIn className="h-6 w-6 text-[#374151]" strokeWidth={2} aria-hidden />
                      </button>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                      {selected?.id ? (
                        <button
                          type="button"
                          onClick={openResumeHistory}
                          className="admin-recruiter-action-chip h-10 w-full shrink-0 rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm font-medium text-[#525252] transition hover:bg-[#F8FAFC] sm:h-9 sm:w-auto"
                        >
                          <History className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                          <span>Resume history</span>
                        </button>
                      ) : null}
                      {resumeDownloadUrl ? (
                        <a
                          href={resumeDownloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="admin-recruiter-action-chip h-10 w-full shrink-0 rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm font-medium text-[#525252] transition hover:bg-[#F8FAFC] sm:h-9 sm:w-auto"
                        >
                          <BrandedSvgIcon
                            src="/icons/admin-recruiter/downloadicon.svg"
                            className="h-4 w-4 shrink-0"
                            color="#525252"
                          />
                          <span>Download Resume</span>
                        </a>
                      ) : null}
                      <button
                        type="button"
                        disabled={removingFromJob}
                        onClick={() => void handleRemoveFromJob()}
                        className="admin-recruiter-action-chip h-10 w-full shrink-0 rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-red-700 transition hover:bg-red-50 sm:h-9 sm:w-auto"
                      >
                        {removingFromJob ? "Removing…" : "Remove from job"}
                      </button>
                    </div>
                  </div>
                </div>
                */}

                <div className="overflow-auto bg-[#F8FAFC] p-5">
                  {profileLoading ? (
                    <p className="py-16 text-center text-sm text-[#64748B]">Loading resume…</p>
                  ) : workerId && hasResume && resumePreviewUrl ? (
                    <div className="w-full overflow-auto">
                      <div
                        className="inline-block min-w-full rounded-xl border border-[#E5E7EB] bg-white shadow-sm"
                        style={{ zoom: zoom / 100 }}
                      >
                        <iframe
                          key={resumePreviewUrl}
                          title={`${displayName} resume`}
                          src={resumePreviewUrl}
                          className="block h-[min(55vh,520px)] w-full bg-white sm:h-[min(70vh,760px)]"
                          onError={() =>
                            setResumePreviewError(
                              "Preview is blocked on this device. Use Download Resume or open in a new tab."
                            )
                          }
                        />
                        {resumePreviewError ? (
                          <div className="border-t border-[#E5E7EB] bg-amber-50 px-3 py-3 text-sm text-amber-900 sm:px-4">
                            {resumePreviewError}{" "}
                            {resumeDownloadUrl ? (
                              <a
                                href={resumeDownloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold underline"
                              >
                                Open resume
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-[#E5E7EB] bg-white px-4 py-12 text-center text-sm text-[#64748B] sm:min-h-[320px]">
                      {workerId
                        ? "No resume uploaded for this candidate yet."
                        : "Candidate profile is not linked yet, so resume is unavailable."}
                    </div>
                  )}
                </div>
                  </>
                )}
                {/*
                Overview tab content — use AI Analysis Overview instead.
                <CandidateAnalysisWorkspace
                  applicationId={selected.id}
                  workerId={workerId}
                  candidateName={displayName}
                  profile={profile?.worker ?? null}
                  reloadToken={matchReloadToken}
                  onAnalyzed={() => setMatchReloadToken((value) => value + 1)}
                />
                */}
              </>
            )}
          </section>

          {/* Right — Figma notes panel (compact card, not full-height) */}
          <aside
            className="order-3 flex h-fit w-full min-w-0 flex-col gap-4 self-start rounded-[16px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 sm:p-4 xl:order-none"
            ref={statusMenuRef}
          >
            <div className="relative">
              <button
                type="button"
                disabled={!selected || statusBusy}
                onClick={() => setStatusMenuOpen((open) => !open)}
                className="inline-flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-[#CBD5E1] bg-white px-3 text-sm text-[#334155] disabled:opacity-50"
              >
                <span className="min-w-0 truncate text-left">
                  Status:{" "}
                  <span className="font-semibold">{currentStatusLabel}</span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-[#94A3B8] ${statusMenuOpen ? "rotate-180" : ""}`}
                />
              </button>
              {selected ? (
                <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
                  {selected.workflow_phase === "post_hire" || selected.workflow_phase === "completed"
                    ? "Post-Hire in progress"
                    : "Pre-Hire"}
                </p>
              ) : null}
              {statusMenuOpen ? (
                <div className="absolute left-0 right-0 z-20 mt-1 max-h-80 overflow-y-auto rounded-xl border border-[#E5E7EB] bg-white py-1 shadow-lg">
                  <GroupedStatusMenuList
                    options={visibleStatusOptions}
                    renderOption={(option) => (
                      <button
                        type="button"
                        onClick={() => beginStatusChange(option)}
                        className="flex min-h-10 w-full items-center justify-between px-3 py-2 text-left text-sm text-[#334155] hover:bg-[#F8FAFC]"
                      >
                        {option.name}
                        {selected?.status_id === option.id ||
                        (!selected?.status_id && option.systemKey === currentStatusKey) ? (
                          <Check className="h-4 w-4" style={{ color: branding.primaryHex }} />
                        ) : null}
                      </button>
                    )}
                  />
                </div>
              ) : null}
            </div>

            {selected && jobSourceType.toLowerCase() === "msp" ? (
              <MspSubmissionPanel
                applicationId={selected.id}
                onSubmitted={(statusName) => {
                  const submittedId = statusOptions.find(
                    (option) => option.name.trim().toLowerCase() === statusName.trim().toLowerCase()
                  )?.id;
                  setRows((current) =>
                    current.map((row) =>
                      row.id === selected.id
                        ? {
                            ...row,
                            statusName,
                            status_id: submittedId ?? row.status_id,
                          }
                        : row
                    )
                  );
                }}
              />
            ) : null}

            <div className="max-h-[240px] overflow-y-auto rounded-[12px]">
              <h3 className="text-sm font-semibold text-[#0F172A]">Status History</h3>
              {statusHistoryLoading ? (
                <p className="mt-2 text-xs text-[#94A3B8]">Loading history…</p>
              ) : statusHistoryError ? (
                <p className="mt-2 text-xs text-[#B91C1C]">{statusHistoryError}</p>
              ) : statusHistory.length > 0 ? (
                <div className="mt-2 space-y-3">
                  {statusHistory.map((entry) => (
                    <div key={entry.id} className="border-l-2 border-[#CBD5E1] pl-3">
                      <p className="text-sm font-medium text-[#0F172A]">{entry.toStatus.name}</p>
                      <p className="mt-0.5 text-xs text-[#94A3B8]">
                        {formatActivityDate(entry.changedAt)} · {entry.changedBy.name || "System"}
                      </p>
                      {entry.fromStatus.name ? (
                        <p className="mt-0.5 text-xs text-[#64748B]">
                          From {entry.fromStatus.name}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs text-[#64748B]">Application created</p>
                      )}
                      {entry.note?.trim() ? (
                        <p className="mt-1 text-xs leading-5 text-[#475569]">{entry.note}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-[#94A3B8]">No status changes yet.</p>
              )}
            </div>

            <div className="max-h-[200px] overflow-y-auto rounded-[12px]">
              <h3 className="text-sm font-semibold text-[#0F172A]">Activity feed</h3>
              {selected ? (
                <div className="mt-2 space-y-3">
                  {upcomingInterview ? (
                    <div>
                      <p className="text-xs font-medium text-[#94A3B8]">
                        {formatActivityDate(upcomingInterview.startsAt)}
                      </p>
                      <p className="mt-0.5 break-words text-xs leading-5 text-[#64748B]">
                        Interview scheduled — {upcomingInterview.title} on{" "}
                        {formatInterviewDate(upcomingInterview.startsAt)} at{" "}
                        {formatInterviewTimeRange(
                          upcomingInterview.startsAt,
                          upcomingInterview.endsAt
                        )}
                        .
                      </p>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-xs font-medium text-[#94A3B8]">
                      {formatActivityDate(selected.submitted_at || selected.created_at)}
                    </p>
                    <p className="mt-0.5 break-words text-xs leading-5 text-[#64748B]">
                      {applicantName(selected)} applied to {jobTitle}.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-[#94A3B8]">No activity yet.</p>
              )}
            </div>

            <div>
              <textarea
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                aria-label="Candidate note"
                className="h-[120px] w-full resize-none rounded-[12px] border border-[#E2E8F0] bg-white px-3 py-3 text-sm text-[#334155] outline-none placeholder:text-[#94A3B8]"
              />
              <button
                type="button"
                disabled={noteSaving || !selected || !noteDraft.trim()}
                onClick={() => void saveNote()}
                className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl bg-[#E2E8F0] px-4 text-sm font-semibold text-[#94A3B8] disabled:cursor-not-allowed disabled:opacity-80 sm:h-9 sm:w-auto"
                style={
                  noteDraft.trim() && selected && !noteSaving
                    ? {
                      backgroundColor: branding.secondaryHex || "#012352",
                      color: "#FFFFFF",
                    }
                    : undefined
                }
              >
                {noteSaving ? "Saving…" : "Save Note"}
              </button>
            </div>
          </aside>
        </div>
      )}

      {workerId ? (
        <>
          <CandidateChatPopup
            key={workerId}
            workerId={workerId}
            candidateName={displayName}
            appliedOnLabel={chatAppliedOnLabel}
            open={chatOpen}
            preferExpanded={chatPreferExpanded}
            onOpenChange={(next) => {
              setChatOpen(next);
              if (!next) setChatPreferExpanded(false);
            }}
          />
          <CandidateCommunicationDialog
            open={messageOpen}
            onClose={() => setMessageOpen(false)}
            workerId={workerId}
            candidateName={displayName}
            email={displayEmail || profile?.worker.email || null}
            phone={displayPhone}
          />
          <AddCallLogModal open={callOpen} workerId={workerId} onClose={() => setCallOpen(false)} />
          <ScheduleInterviewModal
            open={interviewOpen}
            applicants={[{ id: workerId, name: displayName, status: currentStatusKey }]}
            submitting={interviewSubmitting}
            error={interviewError}
            onClose={() => {
              setInterviewOpen(false);
              setInterviewError(null);
              setEditingInterviewId(null);
            }}
            onSubmit={handleSchedule}
            fixedWorkerId={workerId}
            fixedApplicantName={displayName}
            fixedJobTitle={jobTitle}
            fixedApplicationId={selected?.id}
            defaultTitle={
              upcomingInterview?.title ??
              (displayName ? `Interview with ${displayName}` : undefined)
            }
          />
        </>
      ) : null}

      {pendingStatus && selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-status-title"
            className="w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xl"
          >
            <h2 id="change-status-title" className="text-lg font-semibold text-[#0F172A]">
              Change Status
            </h2>
            <p className="mt-1 text-sm text-[#64748B]">
              {currentStatusLabel} → {pendingStatus.name}
            </p>
            <label className="mt-4 block space-y-1.5">
              <span className="text-sm font-medium text-[#0F172A]">Note (optional)</span>
              <textarea
                value={statusChangeNote}
                onChange={(event) => setStatusChangeNote(event.target.value)}
                rows={4}
                className="w-full resize-none rounded-xl border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#334155] outline-none"
                placeholder="Add context for this status change…"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={statusBusy}
                onClick={() => {
                  setPendingStatus(null);
                  setStatusChangeNote("");
                }}
                className="h-10 rounded-xl border border-[#CBD5E1] bg-white px-4 text-sm font-medium text-[#334155]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={statusBusy}
                onClick={() => void confirmStatusChange()}
                className="h-10 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: branding.secondaryHex || "#012352" }}
              >
                {statusBusy ? "Updating…" : "Update Status"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <input
        ref={resumeInputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(event) => handleResumeFilePicked(event.target.files?.[0])}
      />

      <ReplaceResumeConfirmModal
        open={Boolean(pendingResumeFile)}
        fileName={pendingResumeFile?.name ?? ""}
        busy={resumeUploading}
        hasExistingResume={hasResume}
        onCancel={() => {
          if (resumeUploading) return;
          setPendingResumeFile(null);
        }}
        onConfirm={() => void confirmReplaceResume()}
      />

      <ResumeHistoryModal
        open={resumeHistoryOpen}
        jobTitle={resumeHistoryJobTitle || jobTitle}
        resumes={resumeHistoryItems}
        loading={resumeHistoryLoading}
        error={resumeHistoryError}
        busyResumeId={resumeHistoryBusyId}
        reuploadBusy={resumeUploading}
        adminUploadCount={adminResumeUploadCount}
        replacesExistingResume={Boolean(resumeIdToReplace)}
        reuploadDisabled={!workerId || (adminResumeUploadLimitReached && !resumeIdToReplace)}
        reuploadDisabledReason={
          adminResumeUploadLimitReached && !resumeIdToReplace
            ? resumeUploadLimitMessage("admin")
            : null
        }
        onClose={() => {
          if (resumeUploading || resumeHistoryBusyId) return;
          setResumeHistoryOpen(false);
        }}
        onReupload={beginReuploadResume}
        onView={viewResumeFromHistory}
        onDelete={deleteResumeFromHistory}
        onParse={parseResumeFromHistory}
      />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Eye, Upload, X } from "lucide-react";
import BrandedFileTypeIcon from "@/app/admin_recruiter/components/BrandedFileTypeIcon";
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import { useApplicantPortal } from "./ApplicantPortalProvider";
import { WorkerFilePicker } from "./WorkerFilePicker";
import { WORKER_BTN_OUTLINE, WORKER_BTN_PRIMARY } from "./worker-portal-buttons";
import {
  WORKER_SCHEDULE_CARD_CLASS,
  WORKER_DOCUMENTS_PAGE_SECTION_TITLE_CLASS,
  WORKER_DOCUMENTS_PAGE_SECTION_TITLE_STYLE,
} from "./worker-schedule-typography";
import {
  MAX_RESUME_UPLOADS_PER_ROLE,
  resumeUploadLimitMessage,
} from "@/lib/resume/resume-upload-limit";

type WorkerAppliedJob = {
  applicationId: string;
  jobTitle: string;
  location: string | null;
  statusLabel: string;
};

const UPLOAD_MODAL_SELECT_CHEVRON = {
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="#94A3B8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  )}")`,
} as const;

const TABLE_LINE = "border border-[#E5E7EB]";
const TABLE_HEADER_CLASS = `${TABLE_LINE} bg-[#F8FAFC] px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[#64748B]`;
const TABLE_HEADER_RESUME_CLASS = `${TABLE_LINE} bg-[#F8FAFC] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#64748B]`;
const TABLE_CELL_CLASS = `${TABLE_LINE} px-3 py-3 align-middle`;
const TABLE_CELL_CENTER_CLASS = `${TABLE_CELL_CLASS} text-center`;
const VIEW_BTN =
  "inline-flex h-9 items-center justify-center rounded-md bg-[color:var(--brand-primary)] px-3 text-xs font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";
const REUPLOAD_BTN =
  "inline-flex h-9 items-center justify-center rounded-md border border-[color:var(--brand-primary)] px-3 text-xs font-semibold text-[color:var(--brand-primary)] transition hover:bg-[color-mix(in_srgb,var(--brand-primary)_8%,white)] disabled:cursor-not-allowed disabled:opacity-50";
const DELETE_BTN =
  "inline-flex h-9 items-center justify-center rounded-md border border-[#D1D5DB] px-3 text-xs font-semibold text-[#475569] transition hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50";
const VIEW_BTN_ICON =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[color:var(--brand-primary)] text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";
const REUPLOAD_BTN_ICON =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[color:var(--brand-primary)] text-[color:var(--brand-primary)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-primary)_8%,white)] disabled:cursor-not-allowed disabled:opacity-50";

type WorkerResumeItem = {
  id: string;
  originalFileName: string;
  fileType: string | null;
  fileSizeLabel: string;
  parsingStatus: "pending" | "processing" | "completed" | "failed";
  parsingStatusLabel: string;
  uploadedAt: string;
  uploadedAtLabel: string;
  isReuploaded?: boolean;
  jobApplicationId: string | null;
  jobTitle: string | null;
  uploadedByName: string;
  uploadedByPhotoUrl?: string | null;
  uploadedByRoleLabel?: "Admin" | "Worker" | "";
};

/** The quota is per candidate across every job, so job applied is not part of it. */
function workerUploadCount(resumes: WorkerResumeItem[]): number {
  return resumes.filter((resume) => resume.uploadedByRoleLabel !== "Admin").length;
}

function resumeIconType(
  fileName: string,
  fileType: string | null | undefined
): "pdf" | "jpeg" | "docx" {
  const lower = `${fileName} ${fileType ?? ""}`.toLowerCase();
  if (lower.includes("jpeg") || lower.includes("jpg") || lower.includes("png")) return "jpeg";
  if (
    lower.includes("wordprocessingml") ||
    lower.includes("msword") ||
    /\.docx?\b/.test(lower)
  ) {
    return "docx";
  }
  return "pdf";
}

function ReuploadedBadge() {
  return (
    <span className="mt-1 inline-flex items-center rounded-md bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-semibold text-[#1D4ED8]">
      Reuploaded
    </span>
  );
}

/** Read-only in the worker portal: parsing is a recruiter-side action. */
function ParseStatusBadge({ status }: { status: WorkerResumeItem["parsingStatus"] }) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-[color:var(--brand-secondary)] px-2.5 py-1 text-[11px] font-semibold text-white">
        <Check className="h-3 w-3" aria-hidden />
        Parsed
      </span>
    );
  }
  if (status === "processing") {
    return (
      <span className="inline-flex items-center rounded-md bg-[#EEF2FF] px-2.5 py-1 text-[11px] font-semibold text-[#4338CA]">
        Parsing…
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center rounded-md bg-[#FEF2F2] px-2.5 py-1 text-[11px] font-semibold text-[#B91C1C]">
        Parse failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md bg-[#F1F5F9] px-2.5 py-1 text-[11px] font-semibold text-[#64748B]">
      Not parsed
    </span>
  );
}

function ResumeFileCell({ resume, index }: { resume: WorkerResumeItem; index: number }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--brand-primary)_14%,white)] text-xs font-semibold text-[color:var(--brand-primary)]">
        {index}
      </span>
      <BrandedFileTypeIcon
        type={resumeIconType(resume.originalFileName, resume.fileType)}
        className="h-8 w-8 shrink-0"
      />
      <div className="min-w-0">
        <p
          className="break-words text-sm font-semibold leading-5 text-[color:var(--brand-primary)]"
          title={resume.originalFileName}
        >
          {resume.originalFileName}
        </p>
        <p className="mt-0.5 text-xs text-[#64748B]">{resume.fileSizeLabel}</p>
        {resume.isReuploaded ? <ReuploadedBadge /> : null}
      </div>
    </div>
  );
}

function UploadedByCell({ resume }: { resume: WorkerResumeItem }) {
  return (
    <div className="min-w-0" title={resume.uploadedByName}>
      <p className="truncate text-sm font-medium text-[#334155]">{resume.uploadedByName || "—"}</p>
      {resume.uploadedByRoleLabel ? (
        <p className="mt-0.5 text-[11px] font-medium leading-4 text-[#94A3B8]">
          {resume.uploadedByRoleLabel === "Admin" ? "Admin Recruiter" : "Worker"}
        </p>
      ) : null}
    </div>
  );
}

/** Split "20 Aug 2026, 5:06 pm" so time sits on a second centered line. */
function UploadedDateCell({
  label,
  isReuploaded,
}: {
  label: string;
  isReuploaded?: boolean;
}) {
  const commaAt = label.lastIndexOf(",");
  const datePart = commaAt >= 0 ? label.slice(0, commaAt).trim() : label;
  const timePart = commaAt >= 0 ? label.slice(commaAt + 1).trim() : "";

  return (
    <div className="text-center" title={label}>
      <p className="text-sm font-medium leading-5 text-[#334155]">{datePart || "—"}</p>
      {timePart ? (
        <p className="mt-0.5 text-sm font-medium leading-5 text-[#334155]">{timePart}</p>
      ) : null}
      {isReuploaded ? (
        <p className="mt-0.5 text-[11px] font-medium text-[#94A3B8]">Updated</p>
      ) : null}
    </div>
  );
}

function ResumeActions({
  busy,
  onView,
  onReupload,
  onDelete,
}: {
  busy: boolean;
  onView: () => void;
  onReupload: (file: File) => void;
  onDelete: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="inline-flex flex-nowrap items-center justify-center">
      {/* Mobile only: icons */}
      <div className="inline-flex flex-nowrap items-center justify-center gap-1.5 lg:hidden">
        <button
          type="button"
          disabled={busy}
          onClick={onView}
          className={VIEW_BTN_ICON}
          aria-label="View resume"
          title="View"
        >
          <Eye className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          disabled={busy}
          title="Replace this resume file"
          onClick={() => inputRef.current?.click()}
          className={REUPLOAD_BTN_ICON}
          aria-label="Reupload resume"
        >
          <Upload className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-red-500 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Delete resume"
          title="Delete"
        >
          <BrandedSvgIcon
            src="/icons/delete-icon.svg"
            className="h-5 w-5"
            color="#DC2626"
          />
        </button>
      </div>

      {/* Laptop / desktop only: labeled buttons */}
      <div className="hidden flex-nowrap items-center justify-center gap-2 lg:inline-flex">
        <button type="button" disabled={busy} onClick={onView} className={VIEW_BTN}>
          View
        </button>
        <button
          type="button"
          disabled={busy}
          title="Replace this resume file"
          onClick={() => inputRef.current?.click()}
          className={REUPLOAD_BTN}
        >
          Reupload
        </button>
        <button type="button" disabled={busy} onClick={onDelete} className={DELETE_BTN}>
          Delete
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          onReupload(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}

type ResumeRowModel = {
  resume: WorkerResumeItem;
  index: number;
  busy: boolean;
  onView: () => void;
  onReupload: (file: File) => void;
  onDelete: () => void;
};

function ResumeTableRow(props: ResumeRowModel) {
  const { resume, index } = props;
  const jobTitle = resume.jobTitle || "—";
  return (
    <tr>
      <td className={TABLE_CELL_CLASS}>
        <ResumeFileCell resume={resume} index={index} />
      </td>
      <td className={`${TABLE_CELL_CENTER_CLASS} whitespace-nowrap`}>
        <div className="flex justify-center">
          <ParseStatusBadge status={resume.parsingStatus} />
        </div>
      </td>
      <td className={TABLE_CELL_CENTER_CLASS}>
        <UploadedDateCell label={resume.uploadedAtLabel} isReuploaded={resume.isReuploaded} />
      </td>
      <td className={TABLE_CELL_CENTER_CLASS}>
        <p
          className="truncate text-sm font-semibold text-[color:var(--brand-secondary)]"
          title={jobTitle}
        >
          {jobTitle}
        </p>
      </td>
      <td className={TABLE_CELL_CENTER_CLASS}>
        <UploadedByCell resume={resume} />
      </td>
      <td className={`${TABLE_CELL_CENTER_CLASS} whitespace-nowrap px-2 sm:px-3`}>
        <div className="flex justify-center">
          <ResumeActions {...props} />
        </div>
      </td>
    </tr>
  );
}

/** Same pattern as BulkDeleteConfirmModal — Yes / No confirm for a single resume. */
function DeleteResumeConfirmModal({
  open,
  resumeName,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  resumeName: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 px-4 py-8"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-resume-title"
        className="w-full max-w-md rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--brand-primary)_12%,white)]">
            <BrandedSvgIcon
              src="/icons/delete-icon.svg"
              className="h-5 w-5"
              color="var(--brand-primary)"
            />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id="delete-resume-title" className="text-lg font-semibold text-[#101828]">
              Delete resume?
            </h3>
            <p className="mt-2 text-sm leading-5 text-[#475569]">
              Are you sure you want to delete{" "}
              <span className="break-words font-semibold text-[#101828]">{resumeName}</span>?
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className={WORKER_BTN_OUTLINE}
          >
            No
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={WORKER_BTN_PRIMARY}
          >
            {busy ? "Deleting…" : "Yes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadResumeModal({
  open,
  appliedJobs,
  resumes,
  uploading,
  error,
  onClose,
  onUpload,
}: {
  open: boolean;
  appliedJobs: WorkerAppliedJob[];
  resumes: WorkerResumeItem[];
  uploading: boolean;
  error: string | null;
  onClose: () => void;
  onUpload: (jobApplicationId: string, file: File) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ job?: string; file?: string }>({});

  useEffect(() => {
    if (!open) {
      setSelectedJobId("");
      setSelectedFile(null);
      setFieldErrors({});
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !uploading) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, uploading, onClose]);

  if (!open) return null;

  const uploadCount = workerUploadCount(resumes);
  const atLimit = uploadCount >= MAX_RESUME_UPLOADS_PER_ROLE;

  function handleSubmit() {
    const nextErrors: { job?: string; file?: string } = {};
    if (!selectedJobId) nextErrors.job = "Select a job.";
    if (!selectedFile) nextErrors.file = "Choose a resume file.";
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }
    if (!selectedFile) return;
    onUpload(selectedJobId, selectedFile);
  }

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 px-4 py-8"
      role="presentation"
      onClick={() => {
        if (!uploading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-resume-title"
        className="w-full max-w-lg rounded-xl border border-[#E5E7EB] bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#E5E7EB] px-6 py-5">
          <div className="min-w-0 pr-2">
            <h2 id="upload-resume-title" className="text-lg font-semibold text-[#0F172A]">
              Upload Resume
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#64748B]">
              Select the job this resume is for, then choose your file. You can upload up to{" "}
              {MAX_RESUME_UPLOADS_PER_ROLE} resumes in total.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#64748B] transition hover:bg-[#F1F5F9]"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {atLimit ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
              {resumeUploadLimitMessage("worker")}
            </div>
          ) : null}

          {appliedJobs.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              You have not applied to any jobs yet. Apply to a job first, then upload a resume for
              that application.
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="resume-job-select" className="mb-2 block text-sm font-medium text-[#374151]">
                  Job
                </label>
                <select
                  id="resume-job-select"
                  value={selectedJobId}
                  onChange={(event) => {
                    setSelectedJobId(event.target.value);
                    if (fieldErrors.job) setFieldErrors((current) => ({ ...current, job: undefined }));
                  }}
                  disabled={uploading || atLimit}
                  style={UPLOAD_MODAL_SELECT_CHEVRON}
                  className={`h-11 w-full cursor-pointer appearance-none rounded-lg border bg-white bg-[length:12px_12px] bg-[right_12px_center] bg-no-repeat pl-3 pr-10 text-sm text-[#334155] outline-none focus:border-[color:var(--brand-primary)] focus:ring-0 ${
                    fieldErrors.job ? "border-red-300" : "border-[#D1D5DB]"
                  } ${!selectedJobId ? "text-[#94A3B8]" : ""}`}
                >
                  <option value="">Select a job</option>
                  {appliedJobs.map((job) => (
                    <option key={job.applicationId} value={job.applicationId}>
                      {job.jobTitle}
                    </option>
                  ))}
                </select>
                {fieldErrors.job ? (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.job}</p>
                ) : (
                  <p className="mt-1 text-xs text-[#64748B]">
                    {uploadCount} of {MAX_RESUME_UPLOADS_PER_ROLE} resumes used.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#374151]">Resume file</label>
                <WorkerFilePicker
                  inputRef={fileInputRef}
                  file={selectedFile}
                  onChange={(file) => {
                    setSelectedFile(file);
                    if (fieldErrors.file) setFieldErrors((current) => ({ ...current, file: undefined }));
                  }}
                  disabled={uploading || atLimit}
                  error={fieldErrors.file}
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-[#E5E7EB] px-6 py-5">
          <button type="button" disabled={uploading} onClick={onClose} className={WORKER_BTN_OUTLINE}>
            Cancel
          </button>
          <button
            type="button"
            disabled={uploading || appliedJobs.length === 0 || atLimit}
            onClick={handleSubmit}
            className={WORKER_BTN_PRIMARY}
          >
            <Upload className="h-4 w-4" />
            {uploading ? "Uploading..." : "Upload Resume"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WorkerResumeSubmittedSection() {
  const { sessionReady, authHeaders } = useApplicantPortal();
  const [resumes, setResumes] = useState<WorkerResumeItem[]>([]);
  const [appliedJobs, setAppliedJobs] = useState<WorkerAppliedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyResumeId, setBusyResumeId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadModalError, setUploadModalError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkerResumeItem | null>(null);

  const loadResumes = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return;
    const res = await fetch("/api/applicant-portal/resumes", { headers, cache: "no-store" });
    const payload = (await res.json().catch(() => ({}))) as {
      resumes?: WorkerResumeItem[];
      appliedJobs?: WorkerAppliedJob[];
      error?: string;
    };
    if (!res.ok) throw new Error(payload.error || "Could not load resumes.");
    setResumes(payload.resumes ?? []);
    setAppliedJobs(payload.appliedJobs ?? []);
  }, [authHeaders]);

  useEffect(() => {
    if (!sessionReady) return;
    let alive = true;
    setLoading(true);
    void loadResumes()
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Could not load resumes.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [loadResumes, sessionReady]);

  async function openResume(resumeId: string) {
    setError(null);
    setBusyResumeId(resumeId);
    try {
      const headers = await authHeaders();
      if (!headers) throw new Error("You need to sign in again.");
      const res = await fetch(`/api/applicant-portal/resumes/${encodeURIComponent(resumeId)}`, {
        headers,
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      const url = payload.url?.trim() ?? "";
      if (!res.ok || !url) throw new Error(payload.error || "Could not open resume.");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open resume.");
    } finally {
      setBusyResumeId(null);
    }
  }

  async function uploadResume(jobApplicationId: string, file: File, resumeId?: string) {
    if (resumeId) setBusyResumeId(resumeId);
    else setUploading(true);

    try {
      const headers = await authHeaders();
      if (!headers) throw new Error("You need to sign in again.");
      const form = new FormData();
      form.append("file", file);
      if (!resumeId) form.append("jobApplicationId", jobApplicationId);
      const res = await fetch(
        resumeId
          ? `/api/applicant-portal/resumes/${encodeURIComponent(resumeId)}`
          : "/api/applicant-portal/resumes",
        {
          method: resumeId ? "PATCH" : "POST",
          headers,
          body: form,
        }
      );
      const payload = (await res.json().catch(() => ({}))) as {
        resumes?: WorkerResumeItem[];
        appliedJobs?: WorkerAppliedJob[];
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || "Could not upload resume.");
      setResumes(payload.resumes ?? []);
      setAppliedJobs(payload.appliedJobs ?? []);
      setUploadModalOpen(false);
      setUploadModalError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not upload resume.";
      if (resumeId) setError(message);
      else setUploadModalError(message);
    } finally {
      setUploading(false);
      setBusyResumeId(null);
    }
  }

  async function deleteResume(resumeId: string) {
    setError(null);
    setBusyResumeId(resumeId);
    try {
      const headers = await authHeaders();
      if (!headers) throw new Error("You need to sign in again.");
      const res = await fetch(`/api/applicant-portal/resumes/${encodeURIComponent(resumeId)}`, {
        method: "DELETE",
        headers,
      });
      const payload = (await res.json().catch(() => ({}))) as {
        resumes?: WorkerResumeItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || "Could not delete resume.");
      setResumes(payload.resumes ?? []);
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete resume.");
    } finally {
      setBusyResumeId(null);
    }
  }

  const sectionBusy = uploading || busyResumeId != null;
  const uploadsUsed = workerUploadCount(resumes);
  const atLimit = uploadsUsed >= MAX_RESUME_UPLOADS_PER_ROLE;

  function rowModelForResume(resume: WorkerResumeItem, index: number): ResumeRowModel {
    return {
      resume,
      index: index + 1,
      busy: uploading || busyResumeId === resume.id,
      onView: () => void openResume(resume.id),
      onReupload: (file) => void uploadResume(resume.jobApplicationId ?? "", file, resume.id),
      onDelete: () => setDeleteTarget(resume),
    };
  }

  return (
    <>
      <div className={`${WORKER_SCHEDULE_CARD_CLASS} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] px-4 py-3">
          <div>
            <h2
              className={WORKER_DOCUMENTS_PAGE_SECTION_TITLE_CLASS}
              style={WORKER_DOCUMENTS_PAGE_SECTION_TITLE_STYLE}
            >
              Resume Submitted
            </h2>
          </div>
          <button
            type="button"
            disabled={sectionBusy || atLimit}
            title={atLimit ? resumeUploadLimitMessage("worker") : undefined}
            onClick={() => {
              setUploadModalError(null);
              setUploadModalOpen(true);
            }}
            className={`${WORKER_BTN_PRIMARY} shrink-0`}
          >
            <Upload className="h-4 w-4" />
            Upload Resume
          </button>
        </div>

        {error ? (
          <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-[#64748B]">Loading resumes…</p>
        ) : resumes.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[#64748B]">
            No resume uploaded yet. Select a job and upload your first resume.
          </p>
        ) : (
          <div className="min-w-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
            <table className="w-full min-w-[1040px] table-fixed border-collapse">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[16%]" />
                <col className="w-[12%]" />
                <col className="w-[24%]" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" className={TABLE_HEADER_RESUME_CLASS}>
                    Resume
                  </th>
                  <th scope="col" className={TABLE_HEADER_CLASS}>
                    Parse status
                  </th>
                  <th scope="col" className={TABLE_HEADER_CLASS}>
                    Uploaded date
                  </th>
                  <th scope="col" className={TABLE_HEADER_CLASS}>
                    Job name
                  </th>
                  <th scope="col" className={TABLE_HEADER_CLASS}>
                    Uploaded by
                  </th>
                  <th scope="col" className={TABLE_HEADER_CLASS}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {resumes.map((resume, index) => (
                  <ResumeTableRow key={resume.id} {...rowModelForResume(resume, index)} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="border-t border-[#E5E7EB] px-5 py-3 text-center text-sm text-[#64748B]">
          Note: You can upload up to {MAX_RESUME_UPLOADS_PER_ROLE} resumes in total ({uploadsUsed} of{" "}
          {MAX_RESUME_UPLOADS_PER_ROLE} used). After that, reupload a resume to replace its file.
        </p>
      </div>

      <UploadResumeModal
        open={uploadModalOpen}
        appliedJobs={appliedJobs}
        resumes={resumes}
        uploading={uploading}
        error={uploadModalError}
        onClose={() => {
          if (!uploading) setUploadModalOpen(false);
        }}
        onUpload={(jobApplicationId, file) => void uploadResume(jobApplicationId, file)}
      />

      <DeleteResumeConfirmModal
        open={Boolean(deleteTarget)}
        resumeName={deleteTarget?.originalFileName || "this resume"}
        busy={busyResumeId === deleteTarget?.id}
        onCancel={() => {
          if (busyResumeId == null) setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (deleteTarget) void deleteResume(deleteTarget.id);
        }}
      />
    </>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { Check, Loader2, Plus, ScanText, Upload, X } from "lucide-react";
import toast from "react-hot-toast";
import BrandedFileTypeIcon from "@/app/admin_recruiter/components/BrandedFileTypeIcon";
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import BrandedUploadIcon from "@/app/components/BrandedUploadIcon";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import { ReplaceResumeConfirmModal } from "@/app/admin_recruiter/applications/ReplaceResumeConfirmModal";
import type {
  CandidateProfileApplication,
  CandidateProfileDocument,
  CandidateProfileSubmittedResume,
} from "@/lib/admin/candidate-profile-view";
import {
  MAX_RESUME_UPLOADS_PER_ROLE,
  resumeUploadLimitMessage,
} from "@/lib/resume/resume-upload-limit";
import { validateResumeUploadFile } from "@/lib/resume/validate-resume-upload";
import { uploadAdminJobResume } from "@/lib/resume/direct-resume-upload-client";
import { resumeIconType } from "./candidate-profile-ui";

const CARD_CLASS = "rounded-xl border border-[#E5E7EB] bg-white";
const SECTION_TITLE_CLASS =
  "text-lg font-semibold leading-7 text-[color:var(--brand-secondary)]";
const PRIMARY_BTN =
  "inline-flex h-11 min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[color:var(--brand-primary)] px-4 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-auto";
const TABLE_VIEW_BTN =
  "inline-flex h-8 cursor-pointer items-center justify-center rounded-md bg-[color:var(--brand-primary)] px-2.5 text-xs font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";
const TABLE_OUTLINE_BTN =
  "inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-[color:var(--brand-primary)] px-2.5 text-xs font-semibold text-[color:var(--brand-primary)] transition hover:bg-[color-mix(in_srgb,var(--brand-primary)_8%,white)] disabled:cursor-not-allowed disabled:opacity-50";
const TABLE_DELETE_BTN =
  "inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-[#D1D5DB] px-2.5 text-xs font-semibold text-[#475569] transition hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50";
const PARSE_BTN =
  "inline-flex h-8 cursor-pointer items-center justify-center gap-1 rounded-md border-2 border-[color:var(--brand-primary)] bg-white px-3 text-xs font-semibold text-[color:var(--brand-primary)] transition hover:bg-[color-mix(in_srgb,var(--brand-primary)_6%,white)] disabled:cursor-not-allowed disabled:opacity-50";
const TABLE_HEADER_CLASS =
  "bg-[#F8FAFC] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#64748B]";
const TABLE_CELL_CLASS = "px-3 py-3 align-middle";
const SELECT_CLASS =
  "h-11 w-full cursor-pointer appearance-none rounded-lg border border-[#D1D5DB] bg-white bg-[length:12px_12px] bg-[right_12px_center] bg-no-repeat pl-3 pr-10 text-sm text-[#334155] outline-none focus:border-[color:var(--brand-primary)]";
const SELECT_CHEVRON = {
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="#94A3B8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  )}")`,
} as const;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = value >= 10 || unitIndex === 0 ? Math.round(value) : Number(value.toFixed(1));
  return `${rounded} ${units[unitIndex]}`;
}

/** The quota is per candidate across every job, so job name is not part of it. */
function adminUploadCount(resumes: CandidateProfileSubmittedResume[]): number {
  return resumes.filter((resume) => resume.uploadedByRoleLabel === "Admin").length;
}

function UploadResumeModal({
  open,
  jobs,
  resumes,
  uploading,
  error,
  onClose,
  onUpload,
}: {
  open: boolean;
  jobs: CandidateProfileApplication[];
  resumes: CandidateProfileSubmittedResume[];
  uploading: boolean;
  error: string | null;
  onClose: () => void;
  onUpload: (jobApplicationId: string, file: File) => void;
}) {
  const branding = useTenantBranding();
  const primaryColor = branding.primaryHex || "#BC8B41";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ job?: string; file?: string }>({});

  useEffect(() => {
    if (!open) {
      setSelectedJobId("");
      setSelectedFile(null);
      setDragActive(false);
      setFieldErrors({});
      if (fileInputRef.current) fileInputRef.current.value = "";
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

  const uploadCount = adminUploadCount(resumes);
  const atLimit = uploadCount >= MAX_RESUME_UPLOADS_PER_ROLE;

  function validateAndSetFile(file: File | null) {
    if (!file) {
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const validationError = validateResumeUploadFile({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (validationError) {
      setSelectedFile(null);
      setFieldErrors((current) => ({ ...current, file: validationError }));
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setSelectedFile(file);
    setFieldErrors((current) => ({ ...current, file: undefined }));
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!uploading && !atLimit) setDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (uploading || atLimit) return;
    validateAndSetFile(event.dataTransfer.files?.[0] ?? null);
  }

  function handleSubmit() {
    const nextErrors: { job?: string; file?: string } = {};
    if (!selectedFile) nextErrors.file = "Choose a resume file.";
    else {
      const validationError = validateResumeUploadFile({
        name: selectedFile.name,
        type: selectedFile.type,
        size: selectedFile.size,
      });
      if (validationError) nextErrors.file = validationError;
    }
    if (!selectedJobId) nextErrors.job = "Select a job.";
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }
    if (!selectedFile) return;
    onUpload(selectedJobId, selectedFile);
  }

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-black/40 px-3 py-0 sm:items-center sm:px-4 sm:py-8"
      role="presentation"
      onClick={() => {
        if (!uploading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-upload-resume-title"
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-[#E5E7EB] bg-white shadow-xl sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#E5E7EB] px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0 pr-2">
            <h2 id="profile-upload-resume-title" className="text-lg font-semibold text-[#0F172A]">
              Upload Resume
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#64748B]">
              Choose a resume file, then select the job it belongs to. You can upload up to{" "}
              {MAX_RESUME_UPLOADS_PER_ROLE} resumes for this candidate in total.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#64748B] transition hover:bg-[#F1F5F9]"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {atLimit ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
              {resumeUploadLimitMessage("admin")}
            </div>
          ) : null}

          {jobs.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              This candidate has not applied to any jobs yet. Add them to a job first, then upload a
              resume.
            </div>
          ) : (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium text-[#374151]">Resume file</label>
                <div
                  className={`rounded-[10px] border-2 border-dashed bg-white p-4 transition ${
                    fieldErrors.file
                      ? "border-[#FCA5A5]"
                      : dragActive
                        ? "border-[color:var(--brand-primary)] bg-[color:color-mix(in_srgb,var(--brand-primary)_6%,white)]"
                        : "border-[color:var(--brand-primary)]"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {selectedFile ? (
                    <div className="flex items-center justify-between gap-3 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#E2E8F0] bg-white">
                          <BrandedSvgIcon
                            src="/icons/pdf-icon.svg"
                            className="h-5 w-5"
                            color={primaryColor}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[#334155]">
                            {selectedFile.name}
                          </p>
                          <p className="text-xs text-[#64748B]">{formatBytes(selectedFile.size)}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-md p-1 transition hover:bg-[color:var(--brand-primary)]/10"
                        aria-label="Remove uploaded resume"
                        onClick={() => validateAndSetFile(null)}
                        disabled={uploading || atLimit}
                      >
                        <BrandedSvgIcon
                          src="/icons/delete-icon.svg"
                          className="h-6 w-6"
                          color={primaryColor}
                        />
                      </button>
                    </div>
                  ) : (
                    <label
                      htmlFor="profile-resume-file"
                      className={`flex flex-col items-center justify-center py-4 text-center ${
                        uploading || atLimit ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                      }`}
                    >
                      <BrandedUploadIcon primaryHex={primaryColor} className="h-9 w-9" />
                      <p className="mt-4 text-center text-sm font-medium leading-5 text-[#334155] sm:text-base sm:leading-6">
                        Drag your file(s) to start uploading
                      </p>
                      <div className="my-4 flex w-full max-w-[320px] items-center gap-3">
                        <div className="h-px flex-1 bg-[#CBD5E1]" aria-hidden />
                        <span className="text-sm font-medium leading-5 text-[#64748B]">OR</span>
                        <div className="h-px flex-1 bg-[#CBD5E1]" aria-hidden />
                      </div>
                      <span
                        className="inline-flex h-8 w-fit items-center justify-center rounded-lg border bg-white px-3 text-sm font-medium leading-5 transition hover:bg-[#F8FAFC]"
                        style={{ borderColor: primaryColor, color: primaryColor }}
                      >
                        Browse files
                      </span>
                      <p className="mt-4 text-xs leading-4 text-[#6B7280]">
                        Max 10 MB files are allowed
                      </p>
                    </label>
                  )}
                  <input
                    ref={fileInputRef}
                    id="profile-resume-file"
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="sr-only"
                    disabled={uploading || atLimit}
                    onChange={(event) => {
                      validateAndSetFile(event.target.files?.[0] ?? null);
                    }}
                  />
                </div>
                {fieldErrors.file ? (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.file}</p>
                ) : null}
              </div>

              <div>
                <label htmlFor="profile-resume-job" className="mb-2 block text-sm font-medium text-[#374151]">
                  Job
                </label>
                <select
                  id="profile-resume-job"
                  value={selectedJobId}
                  onChange={(event) => {
                    setSelectedJobId(event.target.value);
                    if (fieldErrors.job) setFieldErrors((current) => ({ ...current, job: undefined }));
                  }}
                  disabled={uploading || atLimit}
                  style={SELECT_CHEVRON}
                  className={`${SELECT_CLASS} ${fieldErrors.job ? "border-red-300" : ""} ${
                    !selectedJobId ? "text-[#94A3B8]" : ""
                  }`}
                >
                  <option value="">Select a job</option>
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.jobTitle}
                    </option>
                  ))}
                </select>
                {fieldErrors.job ? (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.job}</p>
                ) : (
                  <p className="mt-1 text-xs text-[#64748B]">
                    {uploadCount} of {MAX_RESUME_UPLOADS_PER_ROLE} admin uploads used.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-[#E5E7EB] px-4 py-4 sm:flex-row sm:justify-end sm:px-6 sm:py-5">
          <button
            type="button"
            disabled={uploading}
            onClick={onClose}
            className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-lg border border-[#D1D5DB] px-4 text-sm font-medium text-[#334155] transition hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-auto"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={uploading || jobs.length === 0 || atLimit}
            onClick={handleSubmit}
            className={PRIMARY_BTN}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Uploading…" : "Upload Resume"}
          </button>
        </div>
      </div>
    </div>
  );
}

function uploadedByRoleDisplay(role: CandidateProfileSubmittedResume["uploadedByRoleLabel"]): string {
  if (role === "Admin") return "Admin Recruiter";
  if (role === "Worker") return "Worker";
  return "";
}

function ParsedBadge({ status }: { status: CandidateProfileSubmittedResume["parsingStatus"] }) {
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
      <span className="inline-flex items-center gap-1 rounded-md bg-[#EEF2FF] px-2.5 py-1 text-[11px] font-semibold text-[#4338CA]">
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

function ResumeFileCell({
  resume,
  index,
}: {
  resume: CandidateProfileSubmittedResume;
  index: number;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--brand-primary)_14%,white)] text-xs font-semibold text-[color:var(--brand-primary)]">
        {index}
      </span>
      <BrandedFileTypeIcon
        type={resumeIconType(resume.fileName, resume.fileType)}
        className="h-8 w-8 shrink-0"
      />
      <div className="min-w-0">
        <p className="break-words text-sm font-semibold leading-5 text-[color:var(--brand-primary)]" title={resume.fileName}>
          {resume.fileName}
        </p>
        <p className="mt-0.5 text-xs text-[#64748B]">{resume.fileSizeLabel}</p>
        {resume.isReuploaded ? <ReuploadedBadge /> : null}
      </div>
    </div>
  );
}

function ReuploadedBadge() {
  return (
    <span className="mt-1 inline-flex items-center rounded-md bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-semibold text-[#1D4ED8]">
      Reuploaded
    </span>
  );
}

function ParseStatusCell({
  resume,
  busy,
  onParse,
}: {
  resume: CandidateProfileSubmittedResume;
  busy: boolean;
  onParse: () => void;
}) {
  const parsed = resume.parsingStatus === "completed";
  const parsing = resume.parsingStatus === "processing";

  if (parsed || parsing) {
    return <ParsedBadge status={resume.parsingStatus} />;
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={onParse}
      className={PARSE_BTN}
      title="Parse resume"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ScanText className="h-3.5 w-3.5" aria-hidden />}
      Parse
    </button>
  );
}

function UploadedByCell({ resume }: { resume: CandidateProfileSubmittedResume }) {
  const roleLabel = uploadedByRoleDisplay(resume.uploadedByRoleLabel);
  return (
    <div className="min-w-0" title={resume.uploadedByName}>
      <p className="break-words text-sm font-medium text-[#334155]">{resume.uploadedByName || "—"}</p>
      {roleLabel ? (
        <p className="mt-0.5 text-[11px] font-medium leading-4 text-[#94A3B8]">{roleLabel}</p>
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
  onReupload: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-nowrap items-center justify-end gap-1.5">
      <button type="button" disabled={busy} onClick={onView} className={TABLE_VIEW_BTN}>
        View
      </button>
      <button
        type="button"
        disabled={busy}
        title="Replace this resume file"
        onClick={onReupload}
        className={TABLE_OUTLINE_BTN}
      >
        Reupload
      </button>
      <button type="button" disabled={busy} onClick={onDelete} className={TABLE_DELETE_BTN}>
        Delete
      </button>
    </div>
  );
}

type ResumeRowModel = {
  resume: CandidateProfileSubmittedResume;
  index: number;
  jobTitle: string;
  busy: boolean;
  onView: () => void;
  onReupload: () => void;
  onDelete: () => void;
  onParse: () => void;
};

function ResumeTableRow(props: ResumeRowModel) {
  const { resume, index, jobTitle, busy, onParse } = props;
  return (
    <tr className="border-b border-[#F1F5F9] last:border-b-0">
      <td className={TABLE_CELL_CLASS}>
        <ResumeFileCell resume={resume} index={index} />
      </td>
      <td className={`${TABLE_CELL_CLASS} whitespace-nowrap`}>
        <ParseStatusCell resume={resume} busy={busy} onParse={onParse} />
      </td>
      <td className={`${TABLE_CELL_CLASS} whitespace-nowrap`}>
        <p className="text-sm font-medium leading-5 text-[#334155]">{resume.uploadedAtLabel}</p>
        {resume.isReuploaded ? (
          <p className="mt-0.5 text-[11px] font-medium text-[#94A3B8]">Updated</p>
        ) : null}
      </td>
      <td className={TABLE_CELL_CLASS}>
        <p className="max-w-[220px] break-words text-sm font-semibold text-[color:var(--brand-secondary)]" title={jobTitle}>
          {jobTitle}
        </p>
      </td>
      <td className={TABLE_CELL_CLASS}>
        <UploadedByCell resume={resume} />
      </td>
      <td className={TABLE_CELL_CLASS}>
        <ResumeActions {...props} />
      </td>
    </tr>
  );
}

type CandidateProfileDocumentsTabProps = {
  workerId: string;
  applications: CandidateProfileApplication[];
  resumes: CandidateProfileSubmittedResume[];
  documents: CandidateProfileDocument[];
  onReload: () => Promise<void>;
};

export function CandidateProfileDocumentsTab({
  workerId,
  applications,
  resumes,
  documents,
  onReload,
}: CandidateProfileDocumentsTabProps) {
  const reuploadInputRef = useRef<HTMLInputElement>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadModalError, setUploadModalError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyResumeId, setBusyResumeId] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<{
    applicationId: string;
    file: File;
    /** Set when replacing an existing resume, which does not consume a new slot. */
    resumeId: string | null;
  } | null>(null);

  const otherDocuments = useMemo(
    () => documents.filter((doc) => doc.kind !== "resume"),
    [documents]
  );
  const fallbackApplicationId = applications[0]?.id ?? "";
  const adminUploadsUsed = adminUploadCount(resumes);
  const uploadLimitReached = adminUploadsUsed >= MAX_RESUME_UPLOADS_PER_ROLE;

  function applicationIdForResume(resume: CandidateProfileSubmittedResume): string {
    return resume.jobApplicationId?.trim() || fallbackApplicationId;
  }

  function jobTitleForResume(resume: CandidateProfileSubmittedResume): string {
    if (resume.jobTitle?.trim()) return resume.jobTitle.trim();
    const applicationId = resume.jobApplicationId?.trim();
    if (!applicationId) return "—";
    return applications.find((job) => job.id === applicationId)?.jobTitle?.trim() || "—";
  }

  async function uploadResume(applicationId: string, file: File, resumeId?: string | null) {
    setUploading(true);
    setUploadModalError(null);
    try {
      const payload = await uploadAdminJobResume({
        applicationId,
        file,
        resumeId,
      });
      setUploadModalOpen(false);
      setPendingUpload(null);
      toast.success(resumeId ? "Resume reuploaded successfully." : "Resume uploaded successfully.");
      const match = payload.autoQuickMatch;
      if (match?.status === "ANALYZED") {
        toast.success("Quick Match complete.");
      } else if (match?.status === "ANALYZING") {
        toast.success("Quick Match is running in the background.");
      } else if (payload.previousResumeKept) {
        toast.error(
          payload.parseError?.trim() ||
            "The new file was saved, but it could not be read. The previous resume is unchanged."
        );
      } else if (match && match.status !== "ANALYZED") {
        toast.error(
          match.error?.trim() ||
            "Quick Match did not finish — use Re-run Quick Match to try again."
        );
      }
      await onReload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to upload resume";
      setUploadModalError(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  }

  async function viewResume(resume: CandidateProfileSubmittedResume) {
    const applicationId = applicationIdForResume(resume);
    if (!applicationId) {
      toast.error("This resume is not linked to a job yet.");
      return;
    }
    setBusyResumeId(resume.id);
    try {
      const response = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationId)}/resumes/${encodeURIComponent(resume.id)}`,
        { cache: "no-store" }
      );
      const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      const url = payload.url?.trim() ?? "";
      if (!response.ok || !url) throw new Error(payload.error || "Could not open resume.");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open resume.");
    } finally {
      setBusyResumeId(null);
    }
  }

  async function deleteResume(resume: CandidateProfileSubmittedResume) {
    const applicationId = applicationIdForResume(resume);
    if (!applicationId) {
      toast.error("This resume is not linked to a job yet.");
      return;
    }
    if (!window.confirm(`Delete ${resume.fileName}? This cannot be undone.`)) return;
    setBusyResumeId(resume.id);
    try {
      const response = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationId)}/resumes/${encodeURIComponent(resume.id)}`,
        { method: "DELETE" }
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not delete resume.");
      toast.success("Resume deleted.");
      await onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete resume.");
    } finally {
      setBusyResumeId(null);
    }
  }

  async function parseResume(resume: CandidateProfileSubmittedResume) {
    const applicationId = applicationIdForResume(resume);
    if (!applicationId) {
      toast.error("This resume is not linked to a job yet.");
      return;
    }
    if (resume.parsingStatus === "completed") return;
    setBusyResumeId(resume.id);
    try {
      const response = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationId)}/resumes/${encodeURIComponent(resume.id)}/parse`,
        { method: "POST" }
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not parse resume.");
      toast.success("Resume parsed.");
      await onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not parse resume.");
    } finally {
      setBusyResumeId(null);
    }
  }

  function beginRowReupload(resume: CandidateProfileSubmittedResume) {
    const applicationId = applicationIdForResume(resume);
    if (!applicationId) {
      toast.error("This resume is not linked to a job yet.");
      return;
    }
    // Replacing a file never adds a resume, so it stays available at the limit.
    reuploadInputRef.current?.setAttribute("data-application-id", applicationId);
    reuploadInputRef.current?.setAttribute("data-resume-id", resume.id);
    window.requestAnimationFrame(() => reuploadInputRef.current?.click());
  }

  function handleReuploadFile(file: File | undefined) {
    const applicationId = reuploadInputRef.current?.getAttribute("data-application-id") || "";
    const resumeId = reuploadInputRef.current?.getAttribute("data-resume-id") || "";
    if (reuploadInputRef.current) reuploadInputRef.current.value = "";
    if (!file || !applicationId || !resumeId) return;
    const validationError = validateResumeUploadFile({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setPendingUpload({ applicationId, file, resumeId });
  }

  function rowModelForResume(resume: CandidateProfileSubmittedResume, index: number): ResumeRowModel {
    return {
      resume,
      index: index + 1,
      jobTitle: jobTitleForResume(resume),
      busy: uploading || busyResumeId === resume.id,
      onView: () => void viewResume(resume),
      onReupload: () => beginRowReupload(resume),
      onDelete: () => void deleteResume(resume),
      onParse: () => void parseResume(resume),
    };
  }

  return (
    <div className="mt-5 space-y-4">
      <section className={`${CARD_CLASS} overflow-hidden`}>
        <div className="flex flex-col items-stretch gap-3 border-b border-[#E5E7EB] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <h2 className={SECTION_TITLE_CLASS}>Resume Submitted</h2>
          <button
            type="button"
            disabled={uploading || uploadLimitReached}
            title={uploadLimitReached ? resumeUploadLimitMessage("admin") : undefined}
            onClick={() => {
              setUploadModalError(null);
              setUploadModalOpen(true);
            }}
            className={PRIMARY_BTN}
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Upload Resume
          </button>
        </div>

        {resumes.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[#64748B]">
            No resume uploaded yet. Select a job and upload the first resume.
          </p>
        ) : (
          <div className="min-w-0 overflow-x-auto overscroll-x-contain">
              <table className="w-full min-w-[860px] border-collapse">
                <thead>
                  <tr className="border-b border-[#E5E7EB]">
                    <th scope="col" className={TABLE_HEADER_CLASS}>
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
                    <th scope="col" className={`${TABLE_HEADER_CLASS} text-right`}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {resumes.map((resume, index) => {
                    const row = rowModelForResume(resume, index);
                    return <ResumeTableRow key={resume.id} {...row} />;
                  })}
                </tbody>
              </table>
          </div>
        )}

        <p className="border-t border-[#E5E7EB] px-4 py-3 text-center text-sm leading-6 text-[#64748B] sm:px-5">
          Note: You can upload up to {MAX_RESUME_UPLOADS_PER_ROLE} resumes for this candidate in
          total ({adminUploadsUsed} of {MAX_RESUME_UPLOADS_PER_ROLE} used). After that, reupload a
          resume to replace its file.
        </p>
      </section>

      <section className={`${CARD_CLASS} overflow-hidden`}>
        <div className="flex flex-col items-stretch gap-3 border-b border-[#E5E7EB] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <h2 className={SECTION_TITLE_CLASS}>Documents</h2>
          <Link href={`/admin_recruiter/new/attachments/${encodeURIComponent(workerId)}`} className={PRIMARY_BTN}>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Upload Docs
          </Link>
        </div>
        {otherDocuments.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-[#64748B]">
            No docs has been uploaded yet.
          </p>
        ) : (
          <ul className="divide-y divide-[#F1F5F9]">
            {otherDocuments.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-col items-start gap-3 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5"
              >
                <div className="flex min-w-0 w-full flex-1 items-center gap-3 sm:w-auto">
                  <BrandedFileTypeIcon type="pdf" className="h-8 w-8 shrink-0" />
                  <div className="min-w-0">
                    <p className="break-all text-sm font-medium text-[color:var(--brand-primary)]">
                      {doc.fileName}
                    </p>
                    <p className="break-words text-xs text-[#64748B]">
                      {doc.title}
                      {doc.uploadedAtLabel ? ` · ${doc.uploadedAtLabel}` : ""}
                    </p>
                  </div>
                </div>
                <div className="min-w-0 w-full text-left sm:w-auto sm:min-w-[140px] sm:text-right">
                  <p className="break-words text-sm font-medium text-[#334155]">
                    {doc.uploadedByName || "—"}
                  </p>
                  {uploadedByRoleDisplay(doc.uploadedByRoleLabel) ? (
                    <p className="mt-0.5 text-[11px] font-medium text-[#94A3B8]">
                      {uploadedByRoleDisplay(doc.uploadedByRoleLabel)}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <input
        ref={reuploadInputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(event) => handleReuploadFile(event.target.files?.[0])}
      />

      <UploadResumeModal
        open={uploadModalOpen}
        jobs={applications}
        resumes={resumes}
        uploading={uploading}
        error={uploadModalError}
        onClose={() => {
          if (!uploading) setUploadModalOpen(false);
        }}
        onUpload={(jobApplicationId, file) => {
          setUploadModalOpen(false);
          setPendingUpload({ applicationId: jobApplicationId, file, resumeId: null });
        }}
      />

      <ReplaceResumeConfirmModal
        open={Boolean(pendingUpload)}
        fileName={pendingUpload?.file.name ?? ""}
        busy={uploading}
        hasExistingResume={Boolean(pendingUpload?.resumeId)}
        onCancel={() => {
          if (uploading) return;
          const wasNewUpload = !pendingUpload?.resumeId;
          setPendingUpload(null);
          if (wasNewUpload) setUploadModalOpen(true);
        }}
        onConfirm={() => {
          if (!pendingUpload) return;
          void uploadResume(
            pendingUpload.applicationId,
            pendingUpload.file,
            pendingUpload.resumeId
          );
        }}
      />
    </div>
  );
}

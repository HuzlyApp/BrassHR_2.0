"use client";

import { useEffect } from "react";
import { Check, Loader2, ScanText, Upload, X } from "lucide-react";
import BrandedDeleteIcon from "@/app/admin_recruiter/components/BrandedDeleteIcon";
import BrandedFileTypeIcon from "@/app/admin_recruiter/components/BrandedFileTypeIcon";
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import { MAX_RESUME_UPLOADS_PER_ROLE, resumeUploadLimitMessage } from "@/lib/resume/resume-upload-limit";

export type ResumeHistoryItem = {
  id: string;
  fileName: string;
  fileIconType?: "pdf" | "jpeg" | "docx";
  uploadedAtLabel: string;
  uploadedByName: string;
  uploadedByPhotoUrl?: string | null;
  uploadedByType: "worker" | "staff" | "unknown";
  parsingStatus?: "pending" | "processing" | "completed" | "failed";
  isReuploaded?: boolean;
};

type ResumeHistoryModalProps = {
  open: boolean;
  jobTitle: string;
  resumes: ResumeHistoryItem[];
  loading?: boolean;
  error?: string | null;
  busyResumeId?: string | null;
  reuploadBusy?: boolean;
  /** Admin uploads for this candidate across every job, which is what the quota counts. */
  adminUploadCount?: number;
  /** At the quota, re-uploading replaces the newest resume instead of adding one. */
  replacesExistingResume?: boolean;
  reuploadDisabled?: boolean;
  reuploadDisabledReason?: string | null;
  onClose: () => void;
  onReupload: () => void;
  onView: (resumeId: string) => void;
  onDelete: (resumeId: string, fileName: string) => void;
  onParse: (resumeId: string) => void;
};

const BRAND_PRIMARY = "var(--brand-primary)";
const INDEX_COL_CLASS = "w-8 shrink-0";
const ICON_ACTION_BTN =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition hover:bg-[color-mix(in_srgb,var(--brand-primary)_8%,white)] disabled:opacity-50 sm:h-9 sm:w-9";
const ICON_COL_CLASS = "w-[1.8rem] shrink-0";
const ACTIONS_COL_CLASS =
  "flex min-w-0 shrink-0 items-center gap-1 sm:w-[7.25rem] sm:justify-center";
const UPLOADER_COL_CLASS =
  "min-w-0 max-w-[46%] text-right sm:max-w-none sm:w-[8.5rem] sm:shrink-0";

function uploaderRoleLabel(type: ResumeHistoryItem["uploadedByType"]): string {
  if (type === "staff") return "Admin";
  if (type === "worker") return "Worker";
  return "";
}

function UploaderCell({ resume }: { resume: ResumeHistoryItem }) {
  const roleLabel = uploaderRoleLabel(resume.uploadedByType);

  return (
    <div className={UPLOADER_COL_CLASS} title={resume.uploadedByName}>
      <p className="truncate text-sm font-medium leading-5 text-[#334155]">
        {resume.uploadedByName}
      </p>
      {roleLabel ? (
        <p className="mt-0.5 text-[11px] font-medium leading-4 text-[#94A3B8]">{roleLabel}</p>
      ) : null}
    </div>
  );
}

function ResumeHistoryRow({
  resume,
  index,
  busy,
  onView,
  onDelete,
  onParse,
}: {
  resume: ResumeHistoryItem;
  index: number;
  busy: boolean;
  onView: () => void;
  onDelete: () => void;
  onParse: () => void;
}) {
  const lowerName = resume.fileName.toLowerCase();
  const fileIconType =
    resume.fileIconType ??
    (/\.docx?$/i.test(lowerName)
      ? "docx"
      : /\.(jpe?g|png|webp)$/i.test(lowerName)
        ? "jpeg"
        : "pdf");
  const parsingStatus = resume.parsingStatus ?? "pending";
  const parsed = parsingStatus === "completed";
  const parsing = parsingStatus === "processing";

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-[#E5E7EB] bg-white p-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-3">
      <div className="flex min-w-0 items-center gap-3 sm:flex-1">
        <span
          className={`${INDEX_COL_CLASS} inline-flex h-8 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--brand-primary)_12%,white)] text-xs font-semibold text-[color:var(--brand-primary)]`}
        >
          {index}
        </span>

        <BrandedFileTypeIcon type={fileIconType} className={`${ICON_COL_CLASS} h-[1.8rem] w-[1.8rem]`} />

        <div className="min-w-0 flex-1">
          <button
            type="button"
            disabled={busy}
            onClick={onView}
            className="block max-w-full truncate text-left text-sm font-semibold text-[color:var(--brand-primary)] hover:underline disabled:opacity-50"
            title={`View ${resume.fileName}`}
          >
            {resume.fileName}
          </button>
          <p className="mt-1 text-xs text-[#64748B]">
            {resume.isReuploaded ? "Updated" : "Uploaded"} {resume.uploadedAtLabel}
          </p>
          {resume.isReuploaded ? (
            <span className="mt-1 inline-flex items-center rounded-md bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-semibold text-[#1D4ED8]">
              Reuploaded
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex min-w-0 items-center justify-between gap-2 sm:justify-end sm:gap-3">
        <div className={ACTIONS_COL_CLASS}>
          {parsed ? (
            <span className="inline-flex h-9 items-center gap-1 rounded-lg bg-[color:var(--brand-secondary)] px-2 text-[10px] font-semibold text-white">
              <Check className="h-3 w-3" aria-hidden />
              Parsed
            </span>
          ) : (
            <button
              type="button"
              disabled={busy || parsing}
              onClick={onParse}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border-2 border-[color:var(--brand-primary)] bg-white px-2 text-[11px] font-semibold text-[color:var(--brand-primary)] transition hover:bg-[color-mix(in_srgb,var(--brand-primary)_6%,white)] disabled:opacity-50"
              aria-label={`Parse ${resume.fileName}`}
              title="Parse resume"
            >
              {busy || parsing ? (
                <Loader2 className="h-4 w-4 animate-spin text-[color:var(--brand-primary)]" aria-hidden />
              ) : (
                <ScanText className="h-4 w-4 text-[color:var(--brand-primary)]" aria-hidden />
              )}
              <span>{parsing ? "Parsing…" : "Parse"}</span>
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onView}
            className={ICON_ACTION_BTN}
            aria-label={`View ${resume.fileName}`}
            title="View resume"
          >
            <BrandedSvgIcon src="/icons/admin-recruiter/eye.svg" className="h-4 w-4" color={BRAND_PRIMARY} />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className={ICON_ACTION_BTN}
            aria-label={`Delete ${resume.fileName}`}
            title="Delete resume"
          >
            <BrandedDeleteIcon className="h-4 w-4" />
          </button>
        </div>

        <UploaderCell resume={resume} />
      </div>
    </div>
  );
}

export function ResumeHistoryModal({
  open,
  jobTitle,
  resumes,
  loading = false,
  error = null,
  busyResumeId = null,
  reuploadBusy = false,
  adminUploadCount = 0,
  replacesExistingResume = false,
  reuploadDisabled = false,
  reuploadDisabledReason = null,
  onClose,
  onReupload,
  onView,
  onDelete,
  onParse,
}: ResumeHistoryModalProps) {
  const modalBusy = reuploadBusy || Boolean(busyResumeId);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !modalBusy) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, modalBusy, onClose]);

  if (!open) return null;

  const limitMessage =
    reuploadDisabledReason ||
    (adminUploadCount >= MAX_RESUME_UPLOADS_PER_ROLE && !replacesExistingResume
      ? resumeUploadLimitMessage("admin")
      : null);

  return (
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={() => {
        if (!modalBusy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-history-title"
        className="flex max-h-[min(92dvh,720px)] w-full min-w-0 max-w-2xl flex-col overflow-hidden rounded-t-xl border border-[#E5E7EB] bg-white shadow-xl sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#E5E7EB] px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h3 id="resume-history-title" className="text-lg font-semibold text-[#101828]">
              Resume history
            </h3>
            <p className="mt-1 truncate text-sm text-[#64748B]">{jobTitle}</p>
          </div>
          <button
            type="button"
            disabled={modalBusy}
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-black transition hover:bg-[#F8FAFC] disabled:opacity-50 sm:h-9 sm:w-9"
            aria-label="Close resume history"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#F8FAFC] px-3 py-4 sm:px-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#64748B]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading resume history…
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : resumes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#E5E7EB] bg-white px-4 py-10 text-center text-sm text-[#64748B]">
              No resumes uploaded for this job yet.
            </p>
          ) : (
            <div className="min-w-0">
              <div className="mb-3 hidden items-center gap-3 px-4 sm:flex">
                <span className={`${INDEX_COL_CLASS} inline-flex h-8`} aria-hidden />
                <span className={`${ICON_COL_CLASS} inline-flex h-[1.8rem]`} aria-hidden />
                <p className="min-w-0 flex-1 text-sm font-semibold text-[#334155]">Resumes</p>
                <span className={ACTIONS_COL_CLASS} aria-hidden />
                <p className={`${UPLOADER_COL_CLASS} text-sm font-semibold text-[#334155]`}>
                  Uploaded by
                </p>
              </div>
              <div className="mb-2 flex items-center justify-between px-1 sm:hidden">
                <p className="text-sm font-semibold text-[#334155]">Resumes</p>
                <p className="text-sm font-semibold text-[#334155]">Uploaded by</p>
              </div>
              <div className="space-y-3">
                {resumes.map((resume, index) => (
                  <ResumeHistoryRow
                    key={resume.id}
                    resume={resume}
                    index={index + 1}
                    busy={busyResumeId === resume.id}
                    onView={() => onView(resume.id)}
                    onDelete={() => onDelete(resume.id, resume.fileName)}
                    onParse={() => onParse(resume.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-[#E5E7EB] bg-white px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-4">
          {limitMessage ? (
            <p className="mb-3 text-sm text-[#B91C1C]">{limitMessage}</p>
          ) : (
            <p className="mb-3 text-sm text-[#64748B]">
              {adminUploadCount} of {MAX_RESUME_UPLOADS_PER_ROLE} admin uploads used for this
              candidate.
              {replacesExistingResume
                ? " Re-uploading replaces the newest resume instead of adding one."
                : ""}
            </p>
          )}
          <button
            type="button"
            disabled={reuploadBusy || reuploadDisabled}
            onClick={onReupload}
            className="admin-recruiter-action-chip inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-transparent bg-[color:var(--brand-primary)] px-4 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            {reuploadBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="h-4 w-4" aria-hidden />
            )}
            <span>{reuploadBusy ? "Uploading…" : "Re-upload Resume"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import { Loader2, X } from "lucide-react";
import BrandedUploadIcon from "@/app/components/BrandedUploadIcon";
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import ErrorModal from "@/app/components/ErrorModal";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import { brandingToCssVars } from "@/lib/tenant/tenant-branding";
import { validateResumeUploadFile } from "@/lib/resume/validate-resume-upload";
import { uploadAdminJobResume } from "@/lib/resume/direct-resume-upload-client";
import { PERSON_NAME_MAX_LENGTH, validatePersonName } from "@/lib/person-name";
import type { ResumeHistoryItem } from "./ResumeHistoryModal";
import { useMatchAnalysisProvider } from "@/app/admin_recruiter/applications/MatchAnalysisModelSelect";

/** Mirrors server `AutoQuickMatchResult` without importing server-only modules. */
export type UpdateResumeAutoQuickMatch = {
  status: string;
  error: string | null;
  model: string | null;
  score: number | null;
  category: string | null;
  action: string | null;
  readiness: string | null;
  displayCategory?: string | null;
  stage?: string | null;
  requirementCounts?: { confirmed: number; verify: number; notMet: number } | null;
};

export type UpdateResumeResult = {
  resumeUploaded: boolean;
  firstName: string;
  lastName: string;
  autoQuickMatch?: UpdateResumeAutoQuickMatch | null;
  parseStatus?: string | null;
  parseError?: string | null;
  previousResumeKept?: boolean;
  reused?: boolean;
};

type UpdateResumeModalProps = {
  open: boolean;
  applicationId: string;
  candidateName?: string;
  initialFirstName?: string;
  initialLastName?: string;
  onClose: () => void;
  onUpdated: (result: UpdateResumeResult) => void;
};

const FIELD_LABEL_CLASS = "mb-1.5 block text-sm font-normal text-[#6B7280]";
const FIELD_INPUT_CLASS =
  "w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2.5 text-sm text-[#334155] outline-none transition placeholder:text-[#94A3B8] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--brand-primary)_12%,transparent)]";

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

function ResumeCard({
  iconColor,
  title,
  subtitle,
  badge,
  onRemove,
  removeDisabled,
  removeLabel,
  removing,
}: {
  iconColor: string;
  title: string;
  subtitle: string;
  badge?: { label: string; className: string } | null;
  onRemove: () => void;
  removeDisabled: boolean;
  removeLabel: string;
  removing?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#E2E8F0] bg-white">
          <BrandedSvgIcon src="/icons/pdf-icon.svg" className="h-5 w-5" color={iconColor} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[#334155]">{title}</p>
          <div className="flex items-center gap-2">
            <p className="truncate text-xs text-[#64748B]">{subtitle}</p>
            {badge ? (
              <span
                className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${badge.className}`}
              >
                {badge.label}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <button
        type="button"
        className="rounded-md p-1 transition hover:bg-[color:var(--brand-primary)]/10 disabled:opacity-50"
        aria-label={removeLabel}
        onClick={onRemove}
        disabled={removeDisabled}
      >
        {removing ? (
          <Loader2 className="h-5 w-5 animate-spin text-[#64748B]" aria-hidden />
        ) : (
          <BrandedSvgIcon src="/icons/delete-icon.svg" className="h-6 w-6" color={iconColor} />
        )}
      </button>
    </div>
  );
}

export default function UpdateResumeModal({
  open,
  applicationId,
  candidateName,
  initialFirstName,
  initialLastName,
  onClose,
  onUpdated,
}: UpdateResumeModalProps) {
  const branding = useTenantBranding();
  const brandVars = brandingToCssVars(branding) as CSSProperties;
  const primaryColor = branding.primaryHex || "#BC8B41";
  const [analysisProvider] = useMatchAnalysisProvider();

  const [currentResume, setCurrentResume] = useState<ResumeHistoryItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [deletingResume, setDeletingResume] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = saving || deletingResume;

  const loadCurrentResume = useCallback(async () => {
    if (!applicationId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationId)}/resume-history`,
        { credentials: "include" }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        resumes?: ResumeHistoryItem[];
      };
      if (!response.ok) throw new Error(payload.error || "Could not load the current resume.");
      const resumes = payload.resumes ?? [];
      setCurrentResume(resumes.length > 0 ? resumes[resumes.length - 1] : null);
    } catch (error) {
      setCurrentResume(null);
      setLoadError(
        error instanceof Error ? error.message : "Could not load the current resume."
      );
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    if (!open) return;
    setResumeFile(null);
    setFileError(null);
    setDragActive(false);
    setFirstName(initialFirstName?.trim() ?? "");
    setLastName(initialLastName?.trim() ?? "");
    if (fileInputRef.current) fileInputRef.current.value = "";
    void loadCurrentResume();
    // Reload only when the modal opens for a different candidate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, applicationId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy && !errorOpen) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, busy, errorOpen, onClose]);

  function handleClose() {
    if (busy) return;
    onClose();
  }

  function selectFile(file: File | null) {
    if (!file) {
      setResumeFile(null);
      setFileError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const validationError = validateResumeUploadFile({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (validationError) {
      setResumeFile(null);
      setFileError(validationError);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.name.toLowerCase().endsWith(".doc")) {
      setResumeFile(null);
      setFileError(
        "Legacy .doc files are not supported. Please save the resume as .docx or PDF."
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setResumeFile(file);
    setFileError(null);
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    selectFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function handleDeleteCurrentResume() {
    if (!currentResume || deletingResume) return;
    setDeletingResume(true);
    try {
      const response = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationId)}/resumes/${encodeURIComponent(currentResume.id)}`,
        { method: "DELETE", credentials: "include" }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        resumes?: ResumeHistoryItem[];
      };
      if (!response.ok) throw new Error(payload.error || "Could not delete resume.");
      const resumes = payload.resumes ?? [];
      setCurrentResume(resumes.length > 0 ? resumes[resumes.length - 1] : null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not delete resume.");
      setErrorOpen(true);
    } finally {
      setDeletingResume(false);
    }
  }

  const nameChanged =
    firstName.trim() !== (initialFirstName?.trim() ?? "") ||
    lastName.trim() !== (initialLastName?.trim() ?? "");
  const canSubmit = Boolean(resumeFile) || nameChanged;

  async function handleSubmit() {
    if (busy || !canSubmit) return;
    if (nameChanged) {
      const firstCheck = validatePersonName(firstName, { label: "First name" });
      const lastCheck = lastName.trim() ? validatePersonName(lastName, { label: "Last name" }) : null;
      const nameError = !firstCheck.ok ? firstCheck.error : lastCheck && !lastCheck.ok ? lastCheck.error : null;
      if (nameError) {
        setErrorMessage(nameError);
        setErrorOpen(true);
        return;
      }
    } else if (!firstName.trim()) {
      setErrorMessage("First name is required.");
      setErrorOpen(true);
      return;
    }

    setSaving(true);
    try {
      let autoQuickMatch: UpdateResumeAutoQuickMatch | null = null;
      let parseStatus: string | null = null;
      let parseError: string | null = null;
      let previousResumeKept = false;
      let reused = false;
      if (resumeFile) {
        const payload = await uploadAdminJobResume({
          applicationId,
          file: resumeFile,
          resumeId: currentResume?.id,
          analysisProvider,
        });
        autoQuickMatch = (payload.autoQuickMatch as UpdateResumeAutoQuickMatch | null) ?? null;
        parseStatus = payload.parseStatus ?? null;
        parseError = payload.parseError ?? null;
        previousResumeKept = Boolean(payload.previousResumeKept);
        reused = Boolean(payload.reused);
      }

      if (nameChanged) {
        const response = await fetch(
          `/api/admin/job-applications/${encodeURIComponent(applicationId)}/candidate-name`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() }),
          }
        );
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "Failed to update the candidate name");
        }
      }

      onUpdated({
        resumeUploaded: Boolean(resumeFile),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        autoQuickMatch,
        parseStatus,
        parseError,
        previousResumeKept,
        reused,
      });
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update resume");
      setErrorOpen(true);
    } finally {
      setSaving(false);
    }
  }

  if (!open && !errorOpen) return null;

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={handleClose}
          style={brandVars}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-resume-modal-title"
            className="relative flex max-h-[92vh] w-full max-w-[560px] flex-col rounded-[20px] border border-[#E5E7EB] bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#E5E7EB] px-6 py-5">
              <h2
                id="update-resume-modal-title"
                className="text-xl font-semibold leading-7 text-[#101828]"
              >
                Update Resume
              </h2>
              <button
                type="button"
                onClick={handleClose}
                disabled={busy}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#101828] text-white transition hover:brightness-110 disabled:opacity-60"
                aria-label="Close"
              >
                <X className="h-3 w-3" strokeWidth={2.5} />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5">
              {candidateName ? (
                <p className="mb-4 text-sm text-[#64748B]">
                  Updating resume for{" "}
                  <span className="font-medium text-[#334155]">{candidateName}</span>
                </p>
              ) : null}

              {loading ? (
                <p className="flex items-center gap-2 text-sm text-[#64748B]">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading current resume…
                </p>
              ) : (
                <div
                  className={`rounded-[10px] border-2 border-dashed bg-white p-4 transition ${
                    fileError
                      ? "border-[#FCA5A5]"
                      : dragActive
                        ? "border-[color:var(--brand-primary)] bg-[color:color-mix(in_srgb,var(--brand-primary)_6%,white)]"
                        : "border-[color:var(--brand-primary)]"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {resumeFile ? (
                    <ResumeCard
                      iconColor={primaryColor}
                      title={resumeFile.name}
                      subtitle={formatBytes(resumeFile.size)}
                      badge={{
                        label: "NEW",
                        className: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
                      }}
                      onRemove={() => selectFile(null)}
                      removeDisabled={busy}
                      removeLabel="Remove selected resume"
                    />
                  ) : currentResume ? (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#64748B]">
                        Last uploaded resume
                      </p>
                      <ResumeCard
                        iconColor={primaryColor}
                        title={currentResume.fileName}
                        subtitle={currentResume.uploadedAtLabel}
                        onRemove={() => void handleDeleteCurrentResume()}
                        removeDisabled={busy}
                        removeLabel="Delete current resume"
                        removing={deletingResume}
                      />
                    </div>
                  ) : (
                    <label
                      htmlFor="update-resume-file"
                      className="flex cursor-pointer flex-col items-center justify-center py-4 text-center"
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
                    id="update-resume-file"
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="sr-only"
                    disabled={busy}
                    onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
                  />
                </div>
              )}

              {loadError ? <p className="mt-2 text-xs text-[#B91C1C]">{loadError}</p> : null}
              {fileError ? <p className="mt-2 text-xs text-[#B91C1C]">{fileError}</p> : null}

              <div className="mt-5 border-t border-[#E5E7EB] pt-5">
                <p className="mb-4 text-sm font-medium text-[#334155]">Candidate details</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={FIELD_LABEL_CLASS} htmlFor="update-resume-first-name">
                      First name
                    </label>
                    <input
                      id="update-resume-first-name"
                      className={`${FIELD_INPUT_CLASS} h-10`}
                      placeholder="First name"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      maxLength={PERSON_NAME_MAX_LENGTH}
                      disabled={busy}
                      autoComplete="given-name"
                    />
                  </div>
                  <div>
                    <label className={FIELD_LABEL_CLASS} htmlFor="update-resume-last-name">
                      Last name
                    </label>
                    <input
                      id="update-resume-last-name"
                      className={`${FIELD_INPUT_CLASS} h-10`}
                      placeholder="Last name"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      maxLength={PERSON_NAME_MAX_LENGTH}
                      disabled={busy}
                      autoComplete="family-name"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[#E5E7EB] px-6 py-4">
              <button
                type="button"
                onClick={handleClose}
                disabled={busy}
                className="inline-flex h-10 min-w-[100px] items-center justify-center rounded-lg border border-[#CBD5E1] bg-white px-5 text-sm font-medium text-[#334155] transition hover:bg-[#F8FAFC] disabled:opacity-60"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={busy || !canSubmit}
                title={canSubmit ? undefined : "Upload a new resume or edit the name first"}
                className="inline-flex h-10 min-w-[100px] items-center justify-center rounded-lg px-5 text-sm font-medium text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
              >
                {saving ? "Updating…" : "Update"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ErrorModal
        open={errorOpen}
        onClose={() => {
          setErrorOpen(false);
          setErrorMessage("");
        }}
        title="Update failed"
        message={errorMessage || "Failed to update resume. Please try again."}
      />
    </>
  );
}

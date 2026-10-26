"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FocusEvent } from "react";
import { ChevronRight } from "lucide-react";
import AutosaveStatus from "@/app/components/AutosaveStatus";
import {
  APPLICANT_ACTION_ROW,
  APPLICANT_CONTENT_CLASS,
  APPLICANT_HEADER_ROW,
  APPLICANT_SHELL_CLASS,
  APPLICANT_SKIP_COLUMN,
  APPLICANT_TITLE_CLASS,
} from "@/app/application/applicant-onboarding-responsive";
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import BrandedUploadIcon from "@/app/components/BrandedUploadIcon";
import OnboardingLayout from "@/app/components/OnboardingLayout";
import OnboardingStepper from "@/app/components/OnboardingStepper";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import { brandingToCssVars, hexToRgba } from "@/lib/tenant/tenant-branding";
import {
  professionDocumentKindLabel,
  type ProfessionDocumentKind,
} from "@/lib/professions/profession-documents";
import { useOnboardingConfigOptional } from "@/app/components/onboarding/OnboardingConfigProvider";
import { readStepKeyFromSearch } from "@/lib/onboarding/find-applicant-step";
import { resolveApplicantId, uploadRequiredOnboardingFile } from "@/lib/onboarding/upload-required-file-client";
import { useOnboardingStepNav } from "@/lib/onboarding/use-onboarding-step-nav";
import {
  useMarkStepInProgressIfPending,
  persistStepProgress,
} from "@/lib/onboarding/use-mark-step-in-progress-if-pending";
import { skipOnboardingStep } from "@/lib/onboarding/skip-onboarding-step";
import { resolveClientOnboardingTenantSlug } from "@/lib/tenant/client-onboarding-slug";
import { validateCredentialDates } from "@/lib/professions/catalog";
import { MAX_PROFESSION_DOCUMENT_FILES } from "@/lib/professions/profession-documents";
import { useSearchParams } from "next/navigation";

type UploadedFile = {
  name: string;
  size: string;
  url: string;
  uploading?: boolean;
};

type ChecklistFile = { id: string; name: string };

type ChecklistItem = {
  id: string;
  name: string;
  documentKind: ProfessionDocumentKind;
  isRequired: boolean;
  hasExpiration: boolean;
  collected: boolean;
  collectedOnIdentityStep: boolean;
  files: ChecklistFile[];
};

type Checklist = {
  professionId: string | null;
  professionName: string | null;
  items: ChecklistItem[];
  missingRequired: string[];
};

const EMPTY_CHECKLIST: Checklist = {
  professionId: null,
  professionName: null,
  items: [],
  missingRequired: [],
};

const MAX_FILE_SIZE_MB = 10;
const MAX_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ACCEPTED_FILE_TYPES =
  "image/png,image/jpeg,image/jpg,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export default function CollectExtraFilesPage() {
  const branding = useTenantBranding();
  const searchParams = useSearchParams();
  const stepKey = readStepKeyFromSearch(
    searchParams.toString() ? `?${searchParams.toString()}` : ""
  );
  const onboarding = useOnboardingConfigOptional();
  const stepNav = useOnboardingStepNav();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [checklist, setChecklist] = useState<Checklist>(EMPTY_CHECKLIST);
  const [checklistLoaded, setChecklistLoaded] = useState(false);
  const [dates, setDates] = useState<Record<string, { issuedDate: string; expiryDate: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [fileAutosave, setFileAutosave] = useState<"idle" | "saved">("idle");
  const [saving, setSaving] = useState(false);
  const [uploadingDocumentId, setUploadingDocumentId] = useState<string | null>(null);
  const completingRef = useRef(false);

  const tenantSlug = useMemo(
    () =>
      resolveClientOnboardingTenantSlug(
        searchParams.toString() ? `?${searchParams.toString()}` : ""
      ),
    [searchParams]
  );

  const currentStep = useMemo(() => {
    if (!onboarding?.config?.steps) return null;
    return (
      onboarding.config.steps.find(
        (s) => s.step_key === stepKey || s.metadata?.workflow_step_id === "collect-extra-files"
      ) ?? null
    );
  }, [onboarding?.config?.steps, stepKey]);

  const hasUploads = uploadedFiles.length > 0 || checklist.items.some((item) => item.collected);
  const anyUploading = uploadedFiles.some((f) => f.uploading) || Boolean(uploadingDocumentId);
  const missingRequired = checklist.missingRequired;

  useEffect(() => {
    if (hasUploads) {
      setFileAutosave("saved");
      const t = window.setTimeout(() => setFileAutosave("idle"), 1200);
      return () => window.clearTimeout(t);
    }
  }, [uploadedFiles, hasUploads]);

  const hydrateFromServer = useCallback(async () => {
    const applicantId = await resolveApplicantId();
    if (!applicantId) return;

    try {
      const res = await fetch(
        `/api/onboarding/extra-files?applicantId=${encodeURIComponent(applicantId)}${
          tenantSlug ? `&tenant=${encodeURIComponent(tenantSlug)}` : ""
        }`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        setError("Could not load the document list.");
        return;
      }

      const payload = (await res.json()) as {
        files?: Array<{
          original_file_name: string;
          file_size_bytes?: number;
          storage_path: string;
        }>;
        checklist?: Checklist;
      };

      if (payload.checklist) setChecklist(payload.checklist);
      setChecklistLoaded(true);
      if (payload.files && payload.files.length > 0) {
        setUploadedFiles(
          payload.files.map((f) => ({
            name: f.original_file_name,
            size: f.file_size_bytes
              ? `${(f.file_size_bytes / 1024 / 1024).toFixed(1)} MB`
              : "Uploaded",
            url: f.storage_path,
          }))
        );
      }
    } catch (loadError) {
      console.error("Failed to load extra files:", loadError);
    }
  }, [tenantSlug]);

  useEffect(() => {
    void hydrateFromServer();
  }, [hydrateFromServer]);

  useMarkStepInProgressIfPending({
    step: currentStep,
    disabled: onboarding?.loading,
    updateStepStatus: onboarding?.updateStepStatus,
    completingRef,
  });

  const skipStep = () => {
    if (missingRequired.length) {
      setError(`Upload the required documents before continuing: ${missingRequired.join(", ")}.`);
      return;
    }
    void skipOnboardingStep({
      step: currentStep,
      updateStepStatus: onboarding?.updateStepStatus,
      completingRef,
      onNavigate: () => stepNav.goNext("skipped"),
    });
  };

  const uploadChecklistFile = async (item: ChecklistItem, file: File) => {
    if (file.size > MAX_BYTES) {
      setError(`Max file size is ${MAX_FILE_SIZE_MB} MB.`);
      return;
    }
    if (item.files.length >= MAX_PROFESSION_DOCUMENT_FILES) {
      setError(`You can upload at most ${MAX_PROFESSION_DOCUMENT_FILES} files for ${item.name}.`);
      return;
    }
    const fields = dates[item.id];
    if (item.hasExpiration) {
      const dateError = validateCredentialDates({
        hasExpiration: true,
        issuedDate: fields?.issuedDate ?? null,
        expiryDate: fields?.expiryDate ?? null,
      });
      if (dateError) {
        setError(dateError);
        return;
      }
    }

    setError(null);
    setUploadingDocumentId(item.id);
    try {
      const applicantId = await resolveApplicantId();
      if (!applicantId) {
        throw new Error("Missing applicant session — please complete resume upload first.");
      }
      const fd = new FormData();
      fd.append("file", file);
      fd.append("applicantId", applicantId);
      fd.append("requiredDocumentId", item.id);
      if (tenantSlug) fd.append("tenantSlug", tenantSlug);
      if (item.hasExpiration && fields) {
        fd.append("issuedDate", fields.issuedDate);
        fd.append("expiryDate", fields.expiryDate);
      }
      const res = await fetch("/api/onboarding/documents/upload", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Upload failed");
      await hydrateFromServer();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setUploadingDocumentId(null);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (file.size > MAX_BYTES) {
      setError(`Max file size is ${MAX_FILE_SIZE_MB} MB.`);
      return;
    }

    setError(null);
    const tempId = `temp-${Date.now()}`;
    const tempFile: UploadedFile = {
      name: file.name,
      size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
      url: tempId,
      uploading: true,
    };
    setUploadedFiles((prev) => [...prev, tempFile]);

    try {
      const applicantId = await resolveApplicantId();
      if (!applicantId) {
        throw new Error("Missing applicant session — please complete resume upload first.");
      }

      const { publicUrl, path } = await uploadRequiredOnboardingFile(file, "other", applicantId);

      const fd = new FormData();
      fd.append("applicantId", applicantId);
      fd.append("fileName", file.name);
      fd.append("fileSizeBytes", String(file.size));
      fd.append("storagePath", path || publicUrl);
      if (tenantSlug) fd.append("tenantSlug", tenantSlug);

      const res = await fetch("/api/onboarding/extra-files", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to save file record");

      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.url === tempId
            ? {
                name: file.name,
                size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
                url: path || publicUrl,
                uploading: false,
              }
            : f
        )
      );
    } catch (e) {
      setUploadedFiles((prev) => prev.filter((f) => f.url !== tempId));
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const removeChecklistFile = async (uploadId: string) => {
    try {
      const applicantId = await resolveApplicantId();
      if (!applicantId) return;
      const res = await fetch("/api/onboarding/documents/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicantId, uploadId, tenantSlug }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to remove file");
      await hydrateFromServer();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Failed to remove file");
    }
  };

  const removeFile = async (fileUrl: string) => {
    try {
      const applicantId = await resolveApplicantId();
      if (!applicantId) return;

      await fetch("/api/onboarding/extra-files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicantId, storagePath: fileUrl, tenantSlug }),
      });

      setUploadedFiles((prev) => prev.filter((f) => f.url !== fileUrl));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove file");
    }
  };

  const goNext = async () => {
    if (!checklistLoaded) {
      setError("The document list is still loading.");
      return;
    }
    if (anyUploading) {
      setError("Please wait for uploads to finish.");
      return;
    }
    if (missingRequired.length) {
      setError(`Upload the required documents before continuing: ${missingRequired.join(", ")}.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (currentStep?.step_key) {
        await persistStepProgress(
          onboarding?.updateStepStatus,
          currentStep.step_key,
          "completed",
          completingRef,
          { uploaded_files_count: uploadedFiles.length }
        );
      }
      stepNav.goNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const professionLabel = checklist.professionName?.trim();
  const canSkip = missingRequired.length === 0 && checklist.items.every((item) => !item.isRequired);

  return (
    <OnboardingLayout
      cardClassName="min-[700px]:min-w-0 min-[700px]:max-w-[1060px] min-[700px]:w-full min-[700px]:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)] min-[1200px]:grid-cols-[minmax(0,2.2fr)_minmax(220px,1fr)] min-[700px]:h-auto min-[700px]:min-h-0"
      rightPanelContentClassName="p-4 min-[900px]:p-5"
      rightPanelImageClassName="opacity-90 object-top"
      rightPanelOverlayClassName="bg-white/70"
    >
      <div className={APPLICANT_SHELL_CLASS} style={brandingToCssVars(branding)}>
        <OnboardingStepper />

        <div className={APPLICANT_CONTENT_CLASS}>
          <div className={APPLICANT_HEADER_ROW}>
            <h2 className={APPLICANT_TITLE_CLASS}>Upload documents</h2>
            <div className={APPLICANT_SKIP_COLUMN}>
              <AutosaveStatus state={fileAutosave === "saved" ? "saved" : "idle"} />
              {canSkip ? (
                <button
                  type="button"
                  onClick={skipStep}
                  className="cursor-pointer text-[12px] font-medium leading-5 text-[color:var(--brand-primary)]"
                >
                  Skip for Now {"\u2192"}
                </button>
              ) : null}
            </div>
          </div>

          <p className="mt-4 text-sm text-slate-600">
            {professionLabel
              ? `These documents are required for ${professionLabel}. Items already on file are checked. Upload anything still open before you continue.`
              : "Upload the documents required for this profession. Items already on file are checked."}{" "}
            A recruiter can also upload these from the candidate record.
          </p>

          <div className="mt-6 space-y-4">
            {checklist.items.map((item, index) => (
              <ChecklistRow
                key={item.id}
                serial={index + 1}
                item={item}
                primaryHex={branding.primaryHex}
                uploading={uploadingDocumentId === item.id}
                issuedDate={dates[item.id]?.issuedDate ?? ""}
                expiryDate={dates[item.id]?.expiryDate ?? ""}
                onDatesChange={(next) =>
                  setDates((prev) => ({
                    ...prev,
                    [item.id]: {
                      issuedDate: next.issuedDate ?? prev[item.id]?.issuedDate ?? "",
                      expiryDate: next.expiryDate ?? prev[item.id]?.expiryDate ?? "",
                    },
                  }))
                }
                onUpload={(file) => void uploadChecklistFile(item, file)}
                onRemove={(uploadId) => void removeChecklistFile(uploadId)}
              />
            ))}

            <OtherFiles
              primaryHex={branding.primaryHex}
              files={uploadedFiles}
              onUpload={(file) => void handleFileUpload(file)}
              onRemove={(url) => void removeFile(url)}
            />
          </div>

          {error ? (
            <div
              className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              aria-live="polite"
            >
              {error}
            </div>
          ) : null}

          <div className={APPLICANT_ACTION_ROW}>
            <button
              type="button"
              onClick={() => stepNav.goPrev()}
              className="w-full cursor-pointer rounded-md border border-[color:var(--brand-primary)] px-3 py-2.5 text-[11px] font-medium leading-5 text-[color:var(--brand-primary)] transition hover:bg-[color:var(--brand-primary)]/10 max-[399px]:px-3 sm:w-auto sm:px-5 sm:py-2 sm:text-[12px]"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void goNext()}
              disabled={!checklistLoaded || anyUploading || saving || missingRequired.length > 0}
              className="group inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-[color:var(--brand-primary)] px-3 py-2.5 text-[11px] font-medium leading-5 text-white transition hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-50 max-[399px]:px-3 sm:w-auto sm:gap-2 sm:px-6 sm:py-2 sm:text-[12px]"
            >
              {saving ? "Saving…" : "Save & Continue"}
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </div>
    </OnboardingLayout>
  );
}

function brandDateFocus(primaryHex: string) {
  return {
    onFocus: (event: FocusEvent<HTMLInputElement>) => {
      event.currentTarget.style.borderColor = primaryHex;
      event.currentTarget.style.boxShadow = `0 0 0 3px ${hexToRgba(primaryHex, 0.22)}`;
    },
    onBlur: (event: FocusEvent<HTMLInputElement>) => {
      event.currentTarget.style.borderColor = "#CBD5E1";
      event.currentTarget.style.boxShadow = "none";
    },
  };
}

function BrandedFileDropzone({
  primaryHex,
  inputId,
  disabled,
  onFile,
}: {
  primaryHex: string;
  inputId: string;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  function openPicker() {
    if (disabled) return;
    inputRef.current?.click();
  }

  function take(file: File | undefined) {
    if (!file || disabled) return;
    onFile(file);
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={openPicker}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPicker();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        take(event.dataTransfer.files?.[0]);
      }}
      className={`mt-3 rounded-xl border-2 border-dashed p-4 text-center transition sm:p-6 ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      }`}
      style={{
        borderColor: primaryHex,
        backgroundColor: dragActive ? hexToRgba(primaryHex, 0.08) : undefined,
      }}
    >
      <div className="mx-auto mb-3 flex items-center justify-center">
        <BrandedUploadIcon className="h-12 w-12 sm:h-14 sm:w-14" primaryHex={primaryHex} />
      </div>
      <p className="mb-3 text-sm text-black">
        {disabled ? "Uploading…" : "Drag your file(s) to start uploading"}
      </p>
      <div className="mb-3 flex items-center gap-3 text-xs text-[#6D6D6D]">
        <span className="h-px flex-1 bg-[#E5E7EB]" />
        OR
        <span className="h-px flex-1 bg-[#E5E7EB]" />
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          openPicker();
        }}
        className="cursor-pointer rounded-md border px-6 py-2 text-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        style={{ borderColor: primaryHex, color: primaryHex }}
      >
        Browse files
      </button>
      <p className="mt-3 text-xs text-[#6B7280]">Max {MAX_FILE_SIZE_MB} MB files are allowed</p>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="hidden"
        accept={ACCEPTED_FILE_TYPES}
        disabled={disabled}
        onChange={(event) => {
          const selected = event.target.files?.[0];
          event.target.value = "";
          take(selected);
        }}
      />
    </div>
  );
}

function ChecklistRow({
  serial,
  item,
  primaryHex,
  uploading,
  issuedDate,
  expiryDate,
  onDatesChange,
  onUpload,
  onRemove,
}: {
  serial: number;
  item: ChecklistItem;
  primaryHex: string;
  uploading: boolean;
  issuedDate: string;
  expiryDate: string;
  onDatesChange: (next: { issuedDate?: string; expiryDate?: string }) => void;
  onUpload: (file: File) => void;
  onRemove: (uploadId: string) => void;
}) {
  const inputId = useId();
  const hasUpload = item.files.length > 0 || item.collected || item.collectedOnIdentityStep;
  const dateFocus = brandDateFocus(primaryHex);

  return (
    <div className="rounded-xl border border-slate-200 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span
            className="mt-0.5 w-6 shrink-0 text-[16px] font-semibold leading-6"
            style={{ color: primaryHex }}
          >
            {serial}.
          </span>
          <div className="min-w-0">
            <p className="text-[16px] font-semibold leading-6 text-slate-800">
              {item.name}
              {item.isRequired ? <span className="text-red-500"> *</span> : null}
              {item.collected ? (
                <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 align-middle text-[11px] font-semibold text-emerald-700">
                  ✓
                </span>
              ) : null}
            </p>
            <p className="text-[11px] leading-4 text-slate-500">
              {item.isRequired ? "Required" : "Optional"}
              {` · ${professionDocumentKindLabel(item.documentKind)}`}
              {item.collectedOnIdentityStep ? " · Already provided" : ""}
            </p>
          </div>
        </div>
      </div>

      {item.files.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {item.files.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
              style={{
                borderColor: hexToRgba(primaryHex, 0.35),
                backgroundColor: hexToRgba(primaryHex, 0.1),
              }}
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border"
                style={{
                  backgroundColor: hexToRgba(primaryHex, 0.18),
                  borderColor: hexToRgba(primaryHex, 0.28),
                }}
              >
                <BrandedSvgIcon src="/icons/pdf-icon.svg" className="h-5 w-5" color={primaryHex} />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: primaryHex }}>
                {file.name}
              </span>
              <button
                type="button"
                onClick={() => onRemove(file.id)}
                className="ml-auto shrink-0 cursor-pointer rounded-md p-1 transition hover:bg-[color:var(--brand-primary)]/10"
                aria-label={`Remove ${file.name}`}
              >
                <BrandedSvgIcon src="/icons/delete-icon.svg" className="h-7 w-7" color={primaryHex} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {item.hasExpiration ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block cursor-pointer space-y-1">
            <span className="text-[11px] font-medium text-slate-600">Issued date</span>
            <input
              type="date"
              value={issuedDate}
              onChange={(event) => onDatesChange({ issuedDate: event.target.value })}
              aria-label={`${item.name} issued date`}
              className="h-10 w-full cursor-pointer rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-slate-900 outline-none transition [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              {...dateFocus}
            />
          </label>
          <label className="block cursor-pointer space-y-1">
            <span className="text-[11px] font-medium text-slate-600">Expiry date</span>
            <input
              type="date"
              value={expiryDate}
              onChange={(event) => onDatesChange({ expiryDate: event.target.value })}
              aria-label={`${item.name} expiry date`}
              className="h-10 w-full cursor-pointer rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-slate-900 outline-none transition [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              {...dateFocus}
            />
          </label>
        </div>
      ) : null}

      {hasUpload ? null : (
        <BrandedFileDropzone
          primaryHex={primaryHex}
          inputId={inputId}
          disabled={uploading}
          onFile={onUpload}
        />
      )}
    </div>
  );
}

function OtherFiles({
  primaryHex,
  files,
  onUpload,
  onRemove,
}: {
  primaryHex: string;
  files: UploadedFile[];
  onUpload: (file: File) => void;
  onRemove: (url: string) => void;
}) {
  const inputId = useId();

  return (
    <div className="space-y-2">
      <p className="text-[16px] font-semibold leading-6 text-slate-800">
        Other documents
        <span className="ml-2 text-sm font-normal text-slate-500">(Optional)</span>
      </p>
      <p className="text-[12px] leading-5 text-slate-500">
        Certifications or files that are not on the list above.
      </p>
      {files.length > 0 ? (
        <div className="space-y-3">
          {files.map((file, index) => (
            <div
              key={`${file.url}-${index}`}
              className="flex items-center justify-between rounded-lg border border-[color:var(--brand-primary)]/40 bg-[color:var(--brand-primary)]/10 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium leading-5 text-slate-800">{file.name}</p>
                <p className="text-[11px] font-normal leading-4 text-slate-600">
                  {file.uploading ? "Uploading…" : file.size}
                </p>
              </div>
              <button
                type="button"
                disabled={file.uploading}
                onClick={() => onRemove(file.url)}
                className="cursor-pointer rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
                aria-label={`Remove ${file.name}`}
              >
                <BrandedSvgIcon src="/icons/delete-icon.svg" className="h-6 w-6" color={primaryHex} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <BrandedFileDropzone primaryHex={primaryHex} inputId={inputId} onFile={onUpload} />
    </div>
  );
}

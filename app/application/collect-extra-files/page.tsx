"use client";

import { APPLICATION_ROUTES } from "@/lib/onboarding/application-routes";
import { applicationPath } from "@/lib/tenant/with-tenant";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import AutosaveStatus from "@/app/components/AutosaveStatus";
import {
  APPLICANT_ACTION_ROW,
  APPLICANT_CONTENT_CLASS,
  APPLICANT_HEADER_ROW,
  APPLICANT_SHELL_CLASS,
  APPLICANT_SKIP_COLUMN,
  APPLICANT_TITLE_CLASS,
} from "@/app/application/applicant-onboarding-responsive";
import { ChevronRight } from "lucide-react";
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import BrandedUploadIcon from "@/app/components/BrandedUploadIcon";
import OnboardingLayout from "@/app/components/OnboardingLayout";
import OnboardingStepper from "@/app/components/OnboardingStepper";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import { brandingToCssVars } from "@/lib/tenant/tenant-branding";
import { useOnboardingConfigOptional } from "@/app/components/onboarding/OnboardingConfigProvider";
import { readStepKeyFromSearch } from "@/lib/onboarding/find-applicant-step";
import {
  resolveApplicantId,
  uploadRequiredOnboardingFile,
} from "@/lib/onboarding/upload-required-file-client";
import { useOnboardingStepNav } from "@/lib/onboarding/use-onboarding-step-nav";
import {
  useMarkStepInProgressIfPending,
  persistStepProgress,
} from "@/lib/onboarding/use-mark-step-in-progress-if-pending";
import { skipOnboardingStep } from "@/lib/onboarding/skip-onboarding-step";
import { resolveClientOnboardingTenantSlug } from "@/lib/tenant/client-onboarding-slug";
type UploadedFile = {
  name: string;
  size: string;
  url: string;
  uploading?: boolean;
};

const MAX_FILE_SIZE_MB = 10;
const MAX_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ACCEPTED_FILE_TYPES = "image/png,image/jpeg,image/jpg,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export default function CollectExtraFilesPage() {
  const branding = useTenantBranding();
  const router = useRouter();
  const searchParams = useSearchParams();
  const stepKey = readStepKeyFromSearch(
    searchParams.toString() ? `?${searchParams.toString()}` : ""
  );
  const onboarding = useOnboardingConfigOptional();
  const stepNav = useOnboardingStepNav();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fileAutosave, setFileAutosave] = useState<"idle" | "saved">("idle");
  const [saving, setSaving] = useState(false);
  const completingRef = useRef(false);
  const inputId = useId();

  const tenantSlug = useMemo(
    () =>
      resolveClientOnboardingTenantSlug(
        searchParams.toString() ? `?${searchParams.toString()}` : ""
      ),
    [searchParams]
  );

  const currentStep = useMemo(() => {
    if (!onboarding?.config?.steps) return null;
    return onboarding.config.steps.find(
      (s) => s.step_key === stepKey || s.metadata?.workflow_step_id === "collect-extra-files"
    ) ?? null;
  }, [onboarding?.config?.steps, stepKey]);

  const hasUploads = uploadedFiles.length > 0;
  const anyUploading = uploadedFiles.some((f) => f.uploading);

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
      if (!res.ok) return;

      const payload = (await res.json()) as {
        files?: Array<{
          original_file_name: string;
          file_size_bytes?: number;
          storage_path: string;
        }>;
      };

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
    } catch (error) {
      console.error("Failed to load extra files:", error);
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
    void skipOnboardingStep({
      step: currentStep,
      updateStepStatus: onboarding?.updateStepStatus,
      completingRef,
      onNavigate: () => stepNav.goNext("skipped"),
    });
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

      const { publicUrl, path } = await uploadRequiredOnboardingFile(
        file,
        "other",
        applicantId
      );

      const fd = new FormData();
      fd.append("applicantId", applicantId);
      fd.append("fileName", file.name);
      fd.append("fileSizeBytes", String(file.size));
      fd.append("storagePath", path || publicUrl);
      if (tenantSlug) {
        fd.append("tenantSlug", tenantSlug);
      }

      const res = await fetch("/api/onboarding/extra-files", {
        method: "POST",
        body: fd,
      });

      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Failed to save file record");
      }

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

  const removeFile = async (fileUrl: string) => {
    try {
      const applicantId = await resolveApplicantId();
      if (!applicantId) return;

      await fetch("/api/onboarding/extra-files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicantId,
          storagePath: fileUrl,
          tenantSlug,
        }),
      });

      setUploadedFiles((prev) => prev.filter((f) => f.url !== fileUrl));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove file");
    }
  };

  const goNext = async () => {
    if (anyUploading) {
      setError("Please wait for uploads to finish.");
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

  const pageTitle = "Upload Extra files";

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
            <h2 className={APPLICANT_TITLE_CLASS}>{pageTitle}</h2>
            <div className={APPLICANT_SKIP_COLUMN}>
              <AutosaveStatus state={fileAutosave === "saved" ? "saved" : "idle"} />
              <button
                type="button"
                onClick={skipStep}
                className="cursor-pointer text-[12px] font-medium leading-5 text-[color:var(--brand-primary)]"
              >
                Skip for Now {"\u2192"}
              </button>
            </div>
          </div>

          <p className="mt-4 text-sm text-slate-600">
            Upload any additional documents required for your application. This step is optional - you
            can skip and continue if you don't have any additional files to upload right now.
          </p>

          <div className="mt-6 space-y-4">
            {/* Upload Box */}
            <div className="space-y-2">
              <p className="text-[16px] font-semibold leading-6 text-slate-800">
                Additional Documents
                <span className="ml-2 text-sm font-normal text-slate-500">(Optional)</span>
              </p>

              {uploadedFiles.length > 0 ? (
                <div className="space-y-3">
                  {uploadedFiles.map((file, index) => (
                    <div
                      key={`${file.url}-${index}`}
                      className="flex items-center justify-between rounded-lg border border-[color:var(--brand-primary)]/40 bg-[color:var(--brand-primary)]/10 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium leading-5 text-slate-800">
                          {file.name}
                        </p>
                        <p className="text-[11px] font-normal leading-4 text-slate-600">
                          {file.uploading ? "Uploading…" : file.size}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={file.uploading}
                        onClick={() => void removeFile(file.url)}
                        className="cursor-pointer rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
                        aria-label={`Remove ${file.name}`}
                      >
                        <BrandedSvgIcon
                          src="/icons/delete-icon.svg"
                          className="h-6 w-6"
                          color={branding.primaryHex}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {uploadedFiles.length === 0 ? (
              <label
                htmlFor={inputId}
                className="block w-full min-h-[206px] cursor-pointer rounded-xl border border-dashed border-[color:var(--brand-primary)] px-6 py-6 text-center transition hover:bg-slate-50"
              >
                <input
                  id={inputId}
                  type="file"
                  className="hidden"
                  accept={ACCEPTED_FILE_TYPES}
                  onChange={(e) => {
                    const selected = e.target.files?.[0];
                    e.target.value = "";
                    if (selected) void handleFileUpload(selected);
                  }}
                />
                <div className="mx-auto flex h-full max-w-[360px] flex-col items-center justify-center gap-3">
                  <BrandedUploadIcon className="h-9 w-9" primaryHex={branding.primaryHex} />
                  <p className="text-[12px] font-normal leading-5 text-slate-800">
                    Drag your file(s) to start uploading
                  </p>
                  <p className="text-[10px] font-normal leading-4 text-slate-400">OR</p>
                  <span className="rounded-md border border-[color:var(--brand-primary)] px-4 py-1 text-[12px] font-medium leading-5 text-[color:var(--brand-primary)]">
                    Browse files
                  </span>
                  <p className="text-[10px] font-normal leading-4 text-slate-500">
                    Max {MAX_FILE_SIZE_MB} MB — PDF, DOC, DOCX, PNG, or JPG
                  </p>
                </div>
              </label>
              ) : (
                <div className="pt-2">
                  <label
                    htmlFor={inputId}
                    className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[color:var(--brand-primary)] px-4 py-2 text-[12px] font-medium leading-5 text-[color:var(--brand-primary)] transition hover:bg-[color:var(--brand-primary)]/10"
                  >
                    <input
                      id={inputId}
                      type="file"
                      className="hidden"
                      accept={ACCEPTED_FILE_TYPES}
                      onChange={(e) => {
                        const selected = e.target.files?.[0];
                        e.target.value = "";
                        if (selected) void handleFileUpload(selected);
                      }}
                    />
                    + Add another file
                  </label>
                </div>
              )}
            </div>
          </div>

          {error ? (
            <div
              className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              aria-live="polite"
            >
              {error}
            </div>
          ) : null}

          <p className="mt-3 text-[10px] font-normal leading-4 text-slate-500">
            Supports PDF, DOC, DOCX, PNG, and JPG files
          </p>

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
              disabled={anyUploading || saving}
              className="group inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-[color:var(--brand-primary)] px-3 py-2.5 text-[11px] font-medium leading-5 text-white transition hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-50 max-[399px]:px-3 sm:w-auto sm:gap-2 sm:px-6 sm:py-2 sm:text-[12px]"
            >
              {saving ? "Saving…" : hasUploads ? "Save & Continue" : "Continue"}
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </div>
    </OnboardingLayout>
  );
}

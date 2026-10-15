"use client";

import { APPLICATION_ROUTES } from "@/lib/onboarding/application-routes"
import { applicationPath } from "@/lib/tenant/with-tenant";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { TenantRequiredDocument } from "@/lib/onboarding/types";
import { validateCredentialDates } from "@/lib/professions/catalog";
import { MAX_PROFESSION_DOCUMENT_FILES } from "@/lib/professions/profession-documents";
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
import {
  findProfessionalLicenseStep,
  nextStepRouteAfter,
  requiredDocumentsForStep,
} from "@/lib/onboarding/professional-license-step";
import { readStepKeyFromSearch } from "@/lib/onboarding/find-applicant-step";
import {
  resolveApplicantId,
  uploadRequiredOnboardingFile,
} from "@/lib/onboarding/upload-required-file-client";
import { useOnboardingStepNav } from "@/lib/onboarding/use-onboarding-step-nav";
import { useMarkStepInProgressIfPending, persistStepProgress } from "@/lib/onboarding/use-mark-step-in-progress-if-pending";
import { skipOnboardingStep } from "@/lib/onboarding/skip-onboarding-step";
import { resolveClientOnboardingTenantSlug } from "@/lib/tenant/client-onboarding-slug";
import type { Step2FileType } from "@/lib/onboardingSummaryData";

type UploadType = Step2FileType;

type UploadSlot = {
  name: string;
  size: string;
  url?: string;
  uploading?: boolean;
};

const FOLDER_BY_TYPE: Record<UploadType, "license" | "tb" | "cpr"> = {
  license: "license",
  tb: "tb",
  cpr: "cpr",
};

const DOC_URL_KEY: Record<UploadType, "nursing_license_url" | "tb_test_url" | "cpr_certification_url"> = {
  license: "nursing_license_url",
  tb: "tb_test_url",
  cpr: "cpr_certification_url",
};

function emptySlots(): Record<UploadType, UploadSlot | null> {
  return { license: null, tb: null, cpr: null };
}

function readSlotsFromStorage(): Record<UploadType, UploadSlot | null> {
  if (typeof window === "undefined") return emptySlots();
  const stored = localStorage.getItem("step2_files");
  if (!stored) return emptySlots();
  try {
    const parsed = JSON.parse(stored) as Record<string, UploadSlot | null>;
    const out = emptySlots();
    for (const key of Object.keys(out) as UploadType[]) {
      const v = parsed[key];
      if (v?.name) out[key] = v;
    }
    return out;
  } catch {
    return emptySlots();
  }
}

const MAX_BYTES = 10 * 1024 * 1024;

export default function Step2License() {
  const branding = useTenantBranding();
  const router = useRouter();
  const searchParams = useSearchParams();
  const stepKey = readStepKeyFromSearch(
    searchParams.toString() ? `?${searchParams.toString()}` : ""
  );
  const onboarding = useOnboardingConfigOptional();
  const stepNav = useOnboardingStepNav();
  const [files, setFiles] = useState<Record<UploadType, UploadSlot | null>>(emptySlots);
  const [dynamicFiles, setDynamicFiles] = useState<Record<string, UploadSlot[]>>({});
  const [credentialFields, setCredentialFields] = useState<
    Record<string, { issuedDate: string; expiryDate: string; issuingOrganization: string; scope: string; validity: string }>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [fileAutosave, setFileAutosave] = useState<"idle" | "saved">("idle");
  const [saving, setSaving] = useState(false);
  const completingRef = useRef(false);

  const configLoaded = Boolean(onboarding?.config && !onboarding.loading);
  const tenantSlug = useMemo(
    () =>
      resolveClientOnboardingTenantSlug(
        searchParams.toString() ? `?${searchParams.toString()}` : ""
      ),
    [searchParams]
  );

  const licenseStep = useMemo(
    () => findProfessionalLicenseStep(onboarding?.config, stepKey),
    [onboarding?.config, stepKey]
  );

  const configuredDocs = useMemo(
    () => requiredDocumentsForStep(onboarding?.config, licenseStep?.id ?? ""),
    [onboarding?.config, licenseStep?.id]
  );

  /** Use tenant config when loaded; legacy hardcoded fields only if config is unavailable. */
  const useTenantRequirements = configLoaded && Boolean(licenseStep);
  const useLegacyFallback = !useTenantRequirements;

  const hasAnyUpload = useTenantRequirements
    ? configuredDocs.some((d) => (dynamicFiles[d.id] ?? []).some((slot) => Boolean(slot.name)))
    : Boolean(files.license || files.tb || files.cpr);

  const anyUploading = useTenantRequirements
    ? Object.values(dynamicFiles).some((slots) => slots.some((f) => f.uploading))
    : Object.values(files).some((f) => f?.uploading);

  function needsExpiryFields(doc: TenantRequiredDocument): boolean {
    return doc.has_expiration === true && (doc.source === "workflow" || doc.source === "profession");
  }

  function maxFilesForDoc(doc: TenantRequiredDocument): number {
    return doc.source === "profession" ? MAX_PROFESSION_DOCUMENT_FILES : 1;
  }

  useEffect(() => {
    setFiles(readSlotsFromStorage());
  }, []);

  useEffect(() => {
    localStorage.setItem("step2_files", JSON.stringify(files));
    if (hasAnyUpload) {
      setFileAutosave("saved");
      const t = window.setTimeout(() => setFileAutosave("idle"), 1200);
      return () => window.clearTimeout(t);
    }
  }, [files, hasAnyUpload]);

  const hydrateFromServer = useCallback(async () => {
    const applicantId = await resolveApplicantId();
    if (!applicantId) return;

    const res = await fetch(
      `/api/onboarding/worker-documents?applicantId=${encodeURIComponent(applicantId)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return;

    const payload = (await res.json()) as {
      documents?: {
        nursing_license_url?: string | null;
        tb_test_url?: string | null;
        cpr_certification_url?: string | null;
      } | null;
    };
    const docs = payload.documents;
    if (!docs) return;

    setFiles((prev) => {
      const next = { ...prev };
      const apply = (type: UploadType, url: string | null | undefined) => {
        if (!url?.trim() || next[type]) return;
        next[type] = {
          name: url.split("/").pop() || type,
          size: "",
          url: url.trim(),
        };
      };
      apply("license", docs.nursing_license_url);
      apply("tb", docs.tb_test_url);
      apply("cpr", docs.cpr_certification_url);
      return next;
    });
  }, []);

  const hydrateDynamicFromServer = useCallback(async () => {
    if (!configuredDocs.length) return;
    const applicantId = await resolveApplicantId();
    if (!applicantId) return;

    const res = await fetch(
      `/api/onboarding/submitted-documents?applicantId=${encodeURIComponent(applicantId)}${
        tenantSlug ? `&tenant=${encodeURIComponent(tenantSlug)}` : ""
      }`,
      { cache: "no-store" }
    );
    if (!res.ok) return;

    const payload = (await res.json()) as {
      documents?: Array<{
        id?: string | null;
        required_document_id: string;
        original_file_name: string | null;
        status: string | null;
        issued_date?: string | null;
        expiry_date?: string | null;
      }>;
    };

    const byReq = new Map<string, typeof payload.documents>();
    for (const row of payload.documents ?? []) {
      const key = String(row.required_document_id);
      const list = byReq.get(key) ?? [];
      list.push(row);
      byReq.set(key, list);
    }

    setDynamicFiles((prev) => {
      const next = { ...prev };
      for (const doc of configuredDocs) {
        if (next[doc.id]?.length) continue;
        const rows = byReq.get(doc.id) ?? [];
        const slots = rows
          .filter((row) => row?.original_file_name)
          .map((row) => ({
            name: row.original_file_name as string,
            size: "",
            url: "uploaded",
          }));
        if (slots.length) next[doc.id] = slots;

        const withDates = rows.find((row) => row.issued_date || row.expiry_date);
        if (withDates) {
          setCredentialFields((fields) => ({
            ...fields,
            [doc.id]: {
              issuedDate: withDates.issued_date ?? fields[doc.id]?.issuedDate ?? "",
              expiryDate: withDates.expiry_date ?? fields[doc.id]?.expiryDate ?? "",
              issuingOrganization: fields[doc.id]?.issuingOrganization ?? "",
              scope: fields[doc.id]?.scope ?? "",
              validity: fields[doc.id]?.validity ?? "",
            },
          }));
        }
      }
      return next;
    });
  }, [configuredDocs, tenantSlug]);

  useEffect(() => {
    if (useLegacyFallback) {
      void hydrateFromServer();
    }
  }, [hydrateFromServer, useLegacyFallback]);

  useEffect(() => {
    if (useTenantRequirements) {
      void hydrateDynamicFromServer();
    }
  }, [useTenantRequirements, hydrateDynamicFromServer]);

  useMarkStepInProgressIfPending({
    step: licenseStep,
    disabled: onboarding?.loading,
    updateStepStatus: onboarding?.updateStepStatus,
    completingRef,
  });

  const skipProfessionalLicense = () => {
    const next =
      nextStepRouteAfter(onboarding?.config, licenseStep, tenantSlug) ??
      applicationPath(APPLICATION_ROUTES.skillsIntro);
    void skipOnboardingStep({
      step: licenseStep,
      updateStepStatus: onboarding?.updateStepStatus,
      completingRef,
      onNavigate: () => router.push(next),
    });
  };

  const uploadForRequirement = async (incoming: FileList | File[], doc: TenantRequiredDocument) => {
    const maxBytes = (doc.max_file_size_mb || 10) * 1024 * 1024;
    const maxFiles = maxFilesForDoc(doc);
    const existing = dynamicFiles[doc.id] ?? [];
    const remaining = maxFiles - existing.length;
    if (remaining <= 0) {
      setError(`You can upload at most ${maxFiles} files for ${doc.title}.`);
      return;
    }

    const selected = Array.from(incoming).slice(0, remaining);
    if (!selected.length) return;

    for (const file of selected) {
      if (file.size > maxBytes) {
        setError(`Max file size is ${doc.max_file_size_mb || 10} MB.`);
        return;
      }
    }

    const fields = credentialFields[doc.id];
    if (needsExpiryFields(doc) || doc.source === "workflow") {
      const dateError = validateCredentialDates({
        hasExpiration: doc.has_expiration === true,
        issuedDate: fields?.issuedDate ?? null,
        expiryDate: fields?.expiryDate ?? null,
      });
      if (dateError) {
        setError(dateError);
        return;
      }
    }

    setError(null);
    const placeholders = selected.map((file) => ({
      name: file.name,
      size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
      uploading: true,
    }));
    setDynamicFiles((prev) => ({
      ...prev,
      [doc.id]: [...(prev[doc.id] ?? []), ...placeholders],
    }));

    try {
      const applicantId = await resolveApplicantId();
      if (!applicantId) {
        throw new Error("Missing applicant session — complete Step 1 (resume) first.");
      }

      for (const file of selected) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("applicantId", applicantId);
        fd.append("requiredDocumentId", doc.id);
        if (tenantSlug) {
          fd.append("tenantSlug", tenantSlug);
        }
        if ((doc.source === "workflow" || doc.source === "profession") && fields) {
          fd.append("issuedDate", fields.issuedDate);
          fd.append("expiryDate", fields.expiryDate);
          if (doc.source === "workflow") {
            fd.append("issuingOrganization", fields.issuingOrganization);
            fd.append("scope", fields.scope);
            fd.append("validity", fields.validity);
          }
        }

        const res = await fetch("/api/onboarding/documents/upload", { method: "POST", body: fd });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          throw new Error(json.error || "Upload failed");
        }
      }

      setDynamicFiles((prev) => ({
        ...prev,
        [doc.id]: (prev[doc.id] ?? []).map((slot) =>
          slot.uploading
            ? {
                ...slot,
                uploading: false,
                url: "uploaded",
              }
            : slot
        ),
      }));
    } catch (e) {
      setDynamicFiles((prev) => ({
        ...prev,
        [doc.id]: (prev[doc.id] ?? []).filter((slot) => !slot.uploading),
      }));
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const uploadForType = async (file: File, type: UploadType) => {
    if (file.size > MAX_BYTES) {
      setError("Max file size is 10 MB.");
      return;
    }

    setError(null);
    setFiles((prev) => ({
      ...prev,
      [type]: {
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        uploading: true,
      },
    }));

    try {
      const applicantId = await resolveApplicantId();
      if (!applicantId) {
        throw new Error("Missing applicant session — complete Step 1 (resume) first.");
      }

      const { publicUrl, path } = await uploadRequiredOnboardingFile(file, FOLDER_BY_TYPE[type], applicantId);

      const docBody: Record<string, string> = { applicantId };
      docBody[DOC_URL_KEY[type]] = path || publicUrl;

      const storedRef = path || publicUrl;

      const docRes = await fetch("/api/onboarding/worker-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(docBody),
      });
      const docJson = (await docRes.json().catch(() => ({}))) as { error?: string };
      if (!docRes.ok) {
        throw new Error(docJson.error || "Could not save document record");
      }

      setFiles((prev) => ({
        ...prev,
        [type]: {
          name: file.name,
          size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
          url: storedRef,
        },
      }));
    } catch (e) {
      setFiles((prev) => ({ ...prev, [type]: null }));
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const RequirementUploadBox = ({
    doc,
    files: slots,
    onUpload,
    onRemove,
  }: {
    doc: TenantRequiredDocument;
    files: UploadSlot[];
    onUpload: (files: FileList | File[]) => void;
    onRemove: (index: number) => void;
  }) => {
    const inputId = useId();
    const hint = doc.description?.trim() || undefined;
    const maxFiles = maxFilesForDoc(doc);
    const canAddMore = slots.length < maxFiles;
    const showCredentialMeta = doc.source === "workflow" || needsExpiryFields(doc);

    function patchCredential(
      patch: Partial<{
        issuedDate: string;
        expiryDate: string;
        issuingOrganization: string;
        scope: string;
        validity: string;
      }>
    ) {
      setCredentialFields((prev) => ({
        ...prev,
        [doc.id]: {
          issuedDate: patch.issuedDate ?? prev[doc.id]?.issuedDate ?? "",
          expiryDate: patch.expiryDate ?? prev[doc.id]?.expiryDate ?? "",
          issuingOrganization:
            patch.issuingOrganization ?? prev[doc.id]?.issuingOrganization ?? "",
          scope: patch.scope ?? prev[doc.id]?.scope ?? "",
          validity: patch.validity ?? prev[doc.id]?.validity ?? "",
        },
      }));
    }

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[16px] font-semibold leading-6 text-slate-800">
            {doc.title}
            {doc.is_required ? <span className="text-red-500"> *</span> : null}
          </p>
          {hint ? (
            <p className="text-[10px] font-normal leading-4 text-slate-500">{hint}</p>
          ) : null}
        </div>
        {showCredentialMeta ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {doc.source === "workflow" && doc.collect_issuing_organization ? (
              <input
                value={credentialFields[doc.id]?.issuingOrganization ?? ""}
                onChange={(event) => patchCredential({ issuingOrganization: event.target.value })}
                placeholder="Issuing organization"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              />
            ) : null}
            {doc.source === "workflow" && doc.collect_scope ? (
              <input
                value={credentialFields[doc.id]?.scope ?? ""}
                onChange={(event) => patchCredential({ scope: event.target.value })}
                placeholder="Scope"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              />
            ) : null}
            {doc.source === "workflow" && doc.collect_validity ? (
              <input
                value={credentialFields[doc.id]?.validity ?? ""}
                onChange={(event) => patchCredential({ validity: event.target.value })}
                placeholder="Validity, such as 3 Years"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              />
            ) : null}
            {needsExpiryFields(doc) ? (
              <>
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-slate-600">Issued date</span>
                  <input
                    type="date"
                    value={credentialFields[doc.id]?.issuedDate ?? ""}
                    onChange={(event) => patchCredential({ issuedDate: event.target.value })}
                    aria-label={`${doc.title} issued date`}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-slate-600">Expiry date</span>
                  <input
                    type="date"
                    value={credentialFields[doc.id]?.expiryDate ?? ""}
                    onChange={(event) => patchCredential({ expiryDate: event.target.value })}
                    aria-label={`${doc.title} expiry date`}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                    required
                  />
                </label>
              </>
            ) : null}
          </div>
        ) : null}
        {slots.length > 0 ? (
          <ul className="space-y-2">
            {slots.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center justify-between rounded-lg border border-[color:var(--brand-primary)]/40 bg-[color:var(--brand-primary)]/10 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium leading-5 text-slate-800">{file.name}</p>
                  <p className="text-[11px] font-normal leading-4 text-slate-600">
                    {file.uploading ? "Uploading…" : file.size || "Uploaded"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={file.uploading}
                  onClick={() => onRemove(index)}
                  className="cursor-pointer rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
                  aria-label={`Remove ${file.name}`}
                >
                  <BrandedSvgIcon
                    src="/icons/delete-icon.svg"
                    className="h-6 w-6"
                    color={branding.primaryHex}
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {canAddMore ? (
          <label
            htmlFor={inputId}
            className={`block w-full cursor-pointer rounded-xl border border-dashed border-[color:var(--brand-primary)] px-6 text-center transition hover:bg-slate-50 ${
              slots.length ? "min-h-[120px] py-4" : "min-h-[206px] py-6"
            }`}
          >
            <input
              id={inputId}
              type="file"
              className="hidden"
              multiple={maxFiles > 1}
              accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
              onChange={(e) => {
                const selected = e.target.files;
                e.target.value = "";
                if (selected?.length) onUpload(selected);
              }}
            />
            <div className="mx-auto flex h-full max-w-[360px] flex-col items-center justify-center gap-3">
              <BrandedUploadIcon className="h-9 w-9" primaryHex={branding.primaryHex} />
              <p className="text-[12px] font-normal leading-5 text-slate-800">
                {slots.length ? "Add more files" : "Drag your file(s) to start uploading"}
              </p>
              <p className="text-[10px] font-normal leading-4 text-slate-400">OR</p>
              <span className="rounded-md border border-[color:var(--brand-primary)] px-4 py-1 text-[12px] font-medium leading-5 text-[color:var(--brand-primary)]">
                Browse files
              </span>
              <p className="text-[10px] font-normal leading-4 text-slate-500">
                Up to {maxFiles} files · Max {doc.max_file_size_mb || 10} MB each — PNG, JPG, or PDF
              </p>
            </div>
          </label>
        ) : (
          <p className="text-[11px] text-slate-500">Maximum of {maxFiles} files uploaded.</p>
        )}
      </div>
    );
  };

  const UploadBox = ({ type, label, hint }: { type: UploadType; label: string; hint?: string }) => {
    const inputId = useId();
    const file = files[type];

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[16px] font-semibold leading-6 text-slate-800">{label}</p>
          {hint ? (
            <p className="text-[10px] font-normal leading-4 text-slate-500">{hint}</p>
          ) : null}
        </div>

        {file ? (
          <div className="flex items-center justify-between rounded-lg border border-[color:var(--brand-primary)]/40 bg-[color:var(--brand-primary)]/10 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium leading-5 text-slate-800">{file.name}</p>
              <p className="text-[11px] font-normal leading-4 text-slate-600">
                {file.uploading ? "Uploading…" : file.size || "Uploaded"}
              </p>
            </div>
            <button
              type="button"
              disabled={file.uploading}
              onClick={() => setFiles((prev) => ({ ...prev, [type]: null }))}
              className="cursor-pointer rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
              aria-label={`Remove ${label}`}
            >
              <BrandedSvgIcon
                src="/icons/delete-icon.svg"
                className="h-6 w-6"
                color={branding.primaryHex}
              />
            </button>
          </div>
        ) : (
          <label
            htmlFor={inputId}
            className="block w-full min-h-[206px] cursor-pointer rounded-xl border border-dashed border-[color:var(--brand-primary)] px-6 py-6 text-center transition hover:bg-slate-50"
          >
            <input
              id={inputId}
              type="file"
              className="hidden"
              accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                e.target.value = "";
                if (selected) void uploadForType(selected, type);
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
              <p className="text-[10px] font-normal leading-4 text-slate-500">Max 10 MB — PNG, JPG, or PDF</p>
            </div>
          </label>
        )}
      </div>
    );
  };

  const goNext = async () => {
    if (anyUploading) {
      setError("Please wait for uploads to finish.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const applicantId = await resolveApplicantId();
      if (applicantId && useLegacyFallback && hasAnyUpload) {
        const body: Record<string, string> = { applicantId };
        if (files.license?.url) body.nursing_license_url = files.license.url;
        if (files.tb?.url) body.tb_test_url = files.tb.url;
        if (files.cpr?.url) body.cpr_certification_url = files.cpr.url;

        const docRes = await fetch("/api/onboarding/worker-documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!docRes.ok) {
          const j = (await docRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error || "Could not save documents");
        }
      }

      if (licenseStep?.step_key) {
        await persistStepProgress(
          onboarding?.updateStepStatus,
          licenseStep.step_key,
          hasAnyUpload ? "completed" : "skipped",
          completingRef
        );
      }
      const nextRoute =
        nextStepRouteAfter(onboarding?.config, licenseStep, tenantSlug) ??
        applicationPath(APPLICATION_ROUTES.skillsIntro);
      router.push(nextRoute);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const pageTitle = licenseStep?.title?.trim() || "Add Requirements";

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
                onClick={skipProfessionalLicense}
                className="cursor-pointer text-[12px] font-medium leading-5 text-[color:var(--brand-primary)]"
              >
                Skip for Now {"\u2192"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-5 sm:mt-6 sm:gap-6">
            {useTenantRequirements ? (
              configuredDocs.length > 0 ? (
                configuredDocs.map((doc) => (
                  <RequirementUploadBox
                    key={doc.id}
                    doc={doc}
                    files={dynamicFiles[doc.id] ?? []}
                    onUpload={(selected) => void uploadForRequirement(selected, doc)}
                    onRemove={(index) =>
                      setDynamicFiles((prev) => ({
                        ...prev,
                        [doc.id]: (prev[doc.id] ?? []).filter((_, i) => i !== index),
                      }))
                    }
                  />
                ))
              ) : (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Your organization has not listed any documents for this step yet. You can continue, or
                  contact your recruiter if you expected uploads here.
                </p>
              )
            ) : (
              <>
                <UploadBox type="license" label="Nursing License" hint="front/back" />
                <UploadBox type="tb" label="TB Test" hint="last 12 months" />
                <UploadBox type="cpr" label="CPR Certifications" />
              </>
            )}
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
            Only support png, jpg or pdf files
          </p>
          <p className="mt-1 text-[10px] font-normal leading-4 text-slate-500">
            You can continue now and come back to upload any missing documents later.
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
              {saving ? "Saving…" : "Save & Continue"}
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </div>
    </OnboardingLayout>
  );
}

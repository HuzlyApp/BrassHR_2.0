"use client"

import { APPLICATION_ROUTES } from "@/lib/onboarding/application-routes"
import { applicationPath } from "@/lib/tenant/with-tenant"
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight } from "lucide-react"
import {
  APPLICANT_ACTION_ROW,
  APPLICANT_CONTENT_CLASS,
  APPLICANT_HEADER_ROW,
  APPLICANT_SHELL_CLASS,
  APPLICANT_SKIP_COLUMN,
  APPLICANT_TITLE_CLASS,
} from "@/app/application/applicant-onboarding-responsive"
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon"
import BrandedUploadIcon from "@/app/components/BrandedUploadIcon"
import OnboardingLayout from "@/app/components/OnboardingLayout"
import OnboardingStepper from "@/app/components/OnboardingStepper"
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext"
import { brandingToCssVars } from "@/lib/tenant/tenant-branding"
import { useOnboardingStepNav } from "@/lib/onboarding/use-onboarding-step-nav"
import {
  persistStepProgress,
  useMarkStepInProgressIfPending,
} from "@/lib/onboarding/use-mark-step-in-progress-if-pending"
import { skipOnboardingStep } from "@/lib/onboarding/skip-onboarding-step"
import { isIdentityVerificationStep } from "@/lib/onboarding/authorizations-documents-step"
import { requiredDocumentsForStep } from "@/lib/onboarding/professional-license-step"
import { routeForApplicantStep } from "@/lib/onboarding/resolve-applicant-step-route"
import {
  IDENTITY_DOCUMENT_FIELDS,
  IDENTITY_DOCUMENT_GROUPS,
  identityUploadDisplayName,
  type IdentityDocumentColumn,
  type IdentityDocumentGroup,
} from "@/lib/onboarding/identity-document-fields"
import {
  resolveApplicantId,
  uploadRequiredOnboardingFile,
} from "@/lib/onboarding/upload-required-file-client"
import type { TenantRequiredDocument } from "@/lib/onboarding/types"

type Slot = { name: string; uploading?: boolean } | null

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = "image/png,image/jpeg,image/jpg,application/pdf"

function emptyIdentitySlots(): Record<IdentityDocumentColumn, Slot> {
  return { ssn_url: null, ssn_back_url: null, drivers_license_url: null, drivers_license_back_url: null }
}

export default function IdentityVerificationPage() {
  const branding = useTenantBranding()
  const router = useRouter()
  const nav = useOnboardingStepNav()
  const completingRef = useRef(false)

  const step = nav.currentStep
  /** Otherwise a background check that still collects identity documents opened this screen. */
  const standalone = isIdentityVerificationStep(step)
  const authorizationsHref = step
    ? routeForApplicantStep(step, nav.slug)
    : applicationPath(APPLICATION_ROUTES.authorizationsDocuments, nav.slug)

  const configuredDocs = useMemo(
    () => (standalone && step ? requiredDocumentsForStep(nav.config, step.id) : []),
    [standalone, step, nav.config]
  )

  const [identity, setIdentity] = useState<Record<IdentityDocumentColumn, Slot>>(emptyIdentitySlots)
  const [extra, setExtra] = useState<Record<string, Slot>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useMarkStepInProgressIfPending({
    step: standalone ? step : null,
    disabled: nav.configLoading,
    updateStepStatus: nav.updateStepStatus,
    completingRef,
  })

  const hydrateIdentity = useCallback(async () => {
    const applicantId = await resolveApplicantId()
    if (!applicantId) return
    const tenantQuery = nav.slug ? `&tenant=${encodeURIComponent(nav.slug)}` : ""
    const res = await fetch(
      `/api/onboarding/worker-documents?applicantId=${encodeURIComponent(applicantId)}${tenantQuery}`,
      { cache: "no-store" }
    )
    if (!res.ok) return
    const json = (await res.json().catch(() => ({}))) as {
      documents?: Partial<Record<IdentityDocumentColumn, string | null>> | null
    }
    const docs = json.documents
    if (!docs) return
    setIdentity((prev) => {
      const next = { ...prev }
      for (const field of IDENTITY_DOCUMENT_FIELDS) {
        const stored = docs[field.column]?.trim()
        if (stored && !next[field.column]) next[field.column] = { name: identityUploadDisplayName(stored) }
      }
      return next
    })
  }, [nav.slug])

  const hydrateExtra = useCallback(async () => {
    if (!configuredDocs.length) return
    const applicantId = await resolveApplicantId()
    if (!applicantId) return
    const tenantQuery = nav.slug ? `&tenant=${encodeURIComponent(nav.slug)}` : ""
    const res = await fetch(
      `/api/onboarding/submitted-documents?applicantId=${encodeURIComponent(applicantId)}${tenantQuery}`,
      { cache: "no-store" }
    )
    if (!res.ok) return
    const json = (await res.json().catch(() => ({}))) as {
      documents?: Array<{ required_document_id: string; original_file_name: string | null }>
    }
    const byRequirement = new Map(
      (json.documents ?? []).map((row) => [String(row.required_document_id), row])
    )
    setExtra((prev) => {
      const next = { ...prev }
      for (const doc of configuredDocs) {
        const name = byRequirement.get(doc.id)?.original_file_name
        if (name && !next[doc.id]) next[doc.id] = { name }
      }
      return next
    })
  }, [configuredDocs, nav.slug])

  useEffect(() => {
    if (nav.configLoading) return
    void hydrateIdentity()
  }, [nav.configLoading, hydrateIdentity])

  useEffect(() => {
    if (nav.configLoading) return
    void hydrateExtra()
  }, [nav.configLoading, hydrateExtra])

  const saveIdentityColumn = async (column: IdentityDocumentColumn, value: string | null) => {
    const applicantId = await resolveApplicantId()
    if (!applicantId) throw new Error("Missing applicant session. Re-open your application link.")
    const res = await fetch("/api/onboarding/worker-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicantId,
        ...(nav.slug ? { tenant: nav.slug } : {}),
        [column]: value,
      }),
    })
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(json.error || "Could not save document")
  }

  const uploadIdentity = async (file: File, group: IdentityDocumentGroup, column: IdentityDocumentColumn) => {
    if (file.size > MAX_BYTES) {
      setError("Max file size is 10 MB.")
      return
    }
    setError(null)
    setIdentity((prev) => ({ ...prev, [column]: { name: file.name, uploading: true } }))
    try {
      const applicantId = await resolveApplicantId()
      if (!applicantId) throw new Error("Missing applicant session. Re-open your application link.")
      const uploaded = await uploadRequiredOnboardingFile(file, group.folder, applicantId)
      await saveIdentityColumn(column, uploaded.path || uploaded.publicUrl)
      setIdentity((prev) => ({ ...prev, [column]: { name: file.name } }))
    } catch (e) {
      setIdentity((prev) => ({ ...prev, [column]: null }))
      setError(e instanceof Error ? e.message : "Upload failed")
    }
  }

  const removeIdentity = async (column: IdentityDocumentColumn) => {
    const previous = identity[column]
    setIdentity((prev) => ({ ...prev, [column]: null }))
    try {
      await saveIdentityColumn(column, null)
    } catch (e) {
      setIdentity((prev) => ({ ...prev, [column]: previous }))
      setError(e instanceof Error ? e.message : "Could not remove document")
    }
  }

  const uploadExtra = async (file: File, doc: TenantRequiredDocument) => {
    const maxMb = doc.max_file_size_mb || 10
    if (file.size > maxMb * 1024 * 1024) {
      setError(`Max file size is ${maxMb} MB.`)
      return
    }
    setError(null)
    setExtra((prev) => ({ ...prev, [doc.id]: { name: file.name, uploading: true } }))
    try {
      const applicantId = await resolveApplicantId()
      if (!applicantId) throw new Error("Missing applicant session. Re-open your application link.")
      const fd = new FormData()
      fd.append("file", file)
      fd.append("applicantId", applicantId)
      fd.append("requiredDocumentId", doc.id)
      if (nav.slug) fd.append("tenantSlug", nav.slug)
      const res = await fetch("/api/onboarding/documents/upload", { method: "POST", body: fd })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(json.error || "Upload failed")
      setExtra((prev) => ({ ...prev, [doc.id]: { name: file.name } }))
    } catch (e) {
      setExtra((prev) => ({ ...prev, [doc.id]: null }))
      setError(e instanceof Error ? e.message : "Upload failed")
    }
  }

  const anyUploading =
    Object.values(identity).some((slot) => slot?.uploading) ||
    Object.values(extra).some((slot) => slot?.uploading)
  const anyUploaded =
    Object.values(identity).some((slot) => slot && !slot.uploading) ||
    Object.values(extra).some((slot) => slot && !slot.uploading)

  const handleContinue = async () => {
    if (anyUploading) {
      setError("Please wait for uploads to finish.")
      return
    }
    if (!standalone) {
      router.push(authorizationsHref)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await persistStepProgress(
        nav.updateStepStatus,
        step?.step_key,
        anyUploaded ? "completed" : "skipped",
        completingRef
      )
      nav.goNext()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  const handleSkip = () => {
    if (!standalone) {
      router.push(authorizationsHref)
      return
    }
    void skipOnboardingStep({
      step,
      updateStepStatus: nav.updateStepStatus,
      completingRef,
      onNavigate: () => nav.goNext(),
    })
  }

  const pageTitle = (standalone && step?.title?.trim()) || "SSN & Driver's License"
  const pageDescription = standalone ? step?.description?.trim() : null

  return (
    <OnboardingLayout
      cardClassName="min-[700px]:h-auto min-[700px]:min-h-[540px] min-[1200px]:min-h-[700px]"
      rightPanelImageClassName="opacity-60 object-top"
      rightPanelOverlayClassName="bg-white/65"
    >
      <div className={APPLICANT_SHELL_CLASS} style={brandingToCssVars(branding)}>
        <OnboardingStepper />

        <div className={APPLICANT_CONTENT_CLASS}>
          <div className={`${APPLICANT_HEADER_ROW} mb-2`}>
            <h2 className={APPLICANT_TITLE_CLASS}>{pageTitle}</h2>
            <div className={APPLICANT_SKIP_COLUMN}>
              <button
                type="button"
                onClick={handleSkip}
                className="shrink-0 cursor-pointer text-[12px] font-medium leading-5 text-[color:var(--brand-primary)]"
              >
                Skip for Now →
              </button>
            </div>
          </div>
          {pageDescription ? (
            <p className="mb-4 text-[12px] leading-5 text-slate-500 sm:mb-6 sm:text-[13px]">{pageDescription}</p>
          ) : (
            <div className="mb-4 sm:mb-6" />
          )}

          {error ? (
            <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-[12px] text-red-600" aria-live="polite">
              {error}
            </p>
          ) : null}

          <div className="space-y-6">
            {IDENTITY_DOCUMENT_GROUPS.map((group) => (
              <div key={group.id}>
                <p className="mb-2 text-[13px] font-semibold text-slate-800 sm:text-[14px]">{group.title}</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {group.fields.map((field) => (
                    <UploadField
                      key={field.column}
                      label={field.side}
                      required={field.required}
                      slot={identity[field.column]}
                      primaryHex={branding.primaryHex}
                      maxMb={10}
                      onUpload={(file) => void uploadIdentity(file, group, field.column)}
                      onRemove={() => void removeIdentity(field.column)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {configuredDocs.map((doc) => (
              <div key={doc.id}>
                <p className="mb-1 text-[13px] font-semibold text-slate-800 sm:text-[14px]">{doc.title}</p>
                {doc.description?.trim() ? (
                  <p className="mb-2 text-[11px] text-slate-500">{doc.description.trim()}</p>
                ) : null}
                <UploadField
                  label="File"
                  required={doc.is_required}
                  slot={extra[doc.id] ?? null}
                  primaryHex={branding.primaryHex}
                  maxMb={doc.max_file_size_mb || 10}
                  onUpload={(file) => void uploadExtra(file, doc)}
                  onRemove={() => setExtra((prev) => ({ ...prev, [doc.id]: null }))}
                />
              </div>
            ))}

            <p className="text-[11px] text-slate-400">Only PNG, JPG, or PDF files</p>
            <p className="text-[11px] text-slate-500">
              You can continue now and come back to upload any missing documents later.
            </p>
          </div>

          <div className={APPLICANT_ACTION_ROW}>
            <button
              type="button"
              onClick={() => (standalone ? nav.goPrev() : router.push(authorizationsHref))}
              disabled={saving}
              className="w-full cursor-pointer rounded-md border border-[color:var(--brand-primary)] bg-white px-3 py-2.5 text-[11px] font-medium leading-5 text-[color:var(--brand-primary)] transition hover:bg-[color:var(--brand-primary)]/5 disabled:opacity-50 max-[399px]:px-3 sm:w-auto sm:px-5 sm:py-2 sm:text-[12px]"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void handleContinue()}
              disabled={saving || anyUploading}
              className="group inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-[color:var(--brand-primary)] px-3 py-2.5 text-[11px] font-medium leading-5 text-white transition hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-50 max-[399px]:px-3 sm:w-auto sm:gap-2 sm:px-6 sm:py-2 sm:text-[12px]"
            >
              {saving ? "Saving…" : "Save & Continue"}
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </div>
    </OnboardingLayout>
  )
}

function UploadField({
  label,
  required,
  slot,
  primaryHex,
  maxMb,
  onUpload,
  onRemove,
}: {
  label: string
  required: boolean
  slot: Slot
  primaryHex: string
  maxMb: number
  onUpload: (file: File) => void
  onRemove: () => void
}) {
  const inputId = useId()
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-slate-500">
        {label}
        {required ? <span className="text-red-500"> *</span> : <span className="text-slate-400"> (optional)</span>}
      </p>
      {slot ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--brand-primary)]/40 bg-[color:var(--brand-primary)]/10 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-[color:var(--brand-primary)]" title={slot.name}>
              {slot.name}
            </p>
            <p className="text-[11px] text-slate-500">{slot.uploading ? "Uploading…" : "Uploaded"}</p>
          </div>
          <button
            type="button"
            disabled={slot.uploading}
            onClick={onRemove}
            className="shrink-0 cursor-pointer p-1 disabled:opacity-40"
            aria-label={`Remove ${label} file`}
          >
            <BrandedSvgIcon src="/icons/delete-icon.svg" className="h-6 w-6" color={primaryHex} />
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className="block cursor-pointer rounded-xl border border-dashed border-[color:var(--brand-primary)] bg-white px-4 py-5 text-center transition hover:bg-[color:var(--brand-primary)]/5"
        >
          <input
            id={inputId}
            type="file"
            className="hidden"
            accept={ACCEPT}
            onChange={(e) => {
              const selected = e.target.files?.[0]
              e.target.value = ""
              if (selected) onUpload(selected)
            }}
          />
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--brand-primary)]/10">
              <BrandedUploadIcon className="h-[22px] w-[22px]" primaryHex={primaryHex} />
            </div>
            <span className="rounded-md border border-[color:var(--brand-primary)] px-4 py-1 text-[12px] font-medium text-[color:var(--brand-primary)]">
              Browse files
            </span>
            <p className="text-[10px] text-slate-400">Max {maxMb} MB</p>
          </div>
        </label>
      )}
    </div>
  )
}

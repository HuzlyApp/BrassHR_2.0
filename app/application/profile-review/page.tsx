"use client"

import { APPLICATION_ROUTES } from "@/lib/onboarding/application-routes"
import { workerSignInHref } from "@/lib/auth/worker-sign-in"
import { applicationPath } from "@/lib/tenant/with-tenant"
import type { HTMLAttributes, ReactNode } from "react"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { AlertTriangle, ChevronDown, Pencil, Search, X, XCircle } from "lucide-react"
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon"
import BrandingRightPanelLogo, {
  BRANDING_RIGHT_PANEL_STACK_GAP_CLASS,
} from "@/app/components/BrandingRightPanelLogo"
import OnboardingStepper from "@/app/components/OnboardingStepper"
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext"
import {
  brandingShellGradient,
  brandingToCssVars,
  isRemoteOrBlobImageSrc,
  normalizeBrandingImageSrc,
  tenantApplicantPanelLogoUrl,
} from "@/lib/tenant/tenant-branding"
import { formatPhoneNumber, normalizePhoneInput } from "@/lib/phone"
import {
  isValidStep1Email,
  resolveStep1Address2,
  step1ZipInlineMessage,
  validateStep1Form,
} from "@/lib/onboardingStep1Validation"
import { PERSON_NAME_MAX_LENGTH } from "@/lib/person-name"
import ValidatedAddressField from "@/app/components/onboarding/ValidatedAddressField"
// import OnboardingCheckbox from "@/app/components/OnboardingCheckbox"
import { buildAddressQuery, shouldValidateAddressQuery } from "@/lib/mapbox/address-validation"
import { useAddressValidation } from "@/lib/mapbox/use-address-validation"
import type { AddressValidationResult } from "@/lib/mapbox/address-validation-types"
import AutosaveStatus from "@/app/components/AutosaveStatus"
import { resolveClientOnboardingTenantSlug } from "@/lib/tenant/client-onboarding-slug"
import { getClientOnboardingTenantIdFallback } from "@/lib/tenant/client-onboarding-tenant-fallback"
import { getScopedApplicantId } from "@/lib/tenant/scoped-storage"
import { useOnboardingStepNav } from "@/lib/onboarding/use-onboarding-step-nav"
import { useOnboardingConfigOptional } from "@/app/components/onboarding/OnboardingConfigProvider"
import AwaitingRecruiterReviewModal from "@/app/components/onboarding/AwaitingRecruiterReviewModal"
import { persistStepProgress } from "@/lib/onboarding/use-mark-step-in-progress-if-pending"
import {
  findResumeUploadStep,
  hasLocalResumeUpload,
  markResumeUploadStepComplete,
} from "@/lib/onboarding/mark-resume-upload-step-complete"
import {
  adjacentStepRoute,
  getEnabledTenantSteps,
} from "@/lib/onboarding/tenant-step-navigation"
import { skipNonNavigableApplicantSteps } from "@/lib/onboarding/skip-non-navigable-applicant-steps"
import { findNavigableStepIndex } from "@/lib/onboarding/applicant-step-navigability"
import { routeForApplicantStep } from "@/lib/onboarding/resolve-applicant-step-route"
import { useResumeParsePoll } from "@/lib/resume/use-resume-parse-poll"
import { RESUME_PARSE_FAILED_USER_MESSAGE } from "@/lib/resumeParseQuality"
import { computeCandidateOnboardingFrontier } from "@/lib/onboarding/candidate-onboarding-projection"

type ContactConflictKind = "email" | "phone"

function step1FormFromParsedRecord(
  parsed: Record<string, unknown>,
  urlJobTitle: string,
): {
  firstName: string
  lastName: string
  address1: string
  address2: string
  city: string
  state: string
  zipCode: string
  phone: string
  email: string
  jobRole: string
  sameAsAddress1: boolean
} {
  const address1 = String(parsed.address1 || parsed.address || parsed.Address || "").trim()
  const address2 = String(parsed.address2 || "").trim()
  const sameAsAddress1 =
    Boolean(parsed.sameAsAddress1) ||
    (Boolean(address1) &&
      Boolean(address2) &&
      address1.localeCompare(address2, undefined, { sensitivity: "accent" }) === 0)
  return {
    firstName: String(parsed.first_name || parsed.firstName || parsed.FirstName || "").trim(),
    lastName: String(parsed.last_name || parsed.lastName || parsed.LastName || "").trim(),
    address1,
    address2: sameAsAddress1 ? address1 : address2,
    city: String(parsed.city || parsed.City || "").trim(),
    state: String(parsed.state || parsed.State || "").trim(),
    zipCode: String(parsed.zipCode || parsed.zip || "")
      .replace(/\D/g, "")
      .slice(0, 5),
    phone: normalizePhoneInput(String(parsed.phone || parsed.Phone || "")),
    email: String(parsed.email || parsed.Email || "").trim(),
    jobRole: urlJobTitle || String(parsed.job_role || parsed.jobRole || parsed.JobRole || parsed.job_title || "").trim(),
    sameAsAddress1,
  }
}

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
  "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
  "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
  "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania",
  "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
  "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
]

const POPULAR_CITIES = [
  "Los Angeles", "San Diego", "San Francisco", "Sacramento", "Phoenix", "Las Vegas",
  "Dallas", "Houston", "Austin", "Chicago", "Miami", "Orlando", "Atlanta", "New York",
  "Brooklyn", "Queens", "Boston", "Seattle", "Portland", "Denver", "Nashville", "Charlotte",
]

type EditableInputProps = {
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
  required?: boolean
  className?: string
  hint?: string
  iconSlot?: ReactNode
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"]
  disabled?: boolean
  maxLength?: number
}

function EditableInput({
  label,
  value,
  placeholder,
  onChange,
  required,
  className,
  hint,
  iconSlot,
  inputMode,
  disabled,
  maxLength,
}: EditableInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      <div className="flex justify-between flex-wrap gap-1">
        <label className="block text-[13px] font-medium text-gray-600 mb-1.5">
          {label}
          {required ? <span className="text-red-500 ml-0.5">*</span> : null}
        </label>
        {hint ? <span className="text-[11px] text-gray-400 mt-0.5">{hint}</span> : null}
      </div>
      <div className="group relative">
        {iconSlot ? (
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">{iconSlot}</div>
        ) : null}
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={className}
          placeholder={placeholder}
          inputMode={inputMode}
          disabled={disabled}
          maxLength={maxLength}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.focus()}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 focus:outline-none"
          aria-label={`Edit ${label}`}
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

type SearchableSelectProps = {
  label: string
  value: string
  placeholder: string
  options: string[]
  onChange: (value: string) => void
  required?: boolean
}

function SearchableSelect({
  label,
  value,
  placeholder,
  options,
  onChange,
  required,
}: SearchableSelectProps) {
  const focusBorderClass =
    "focus:outline-none focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[color:var(--brand-primary)]/20"
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const wrapperRef = useRef<HTMLDivElement>(null)

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((opt) => opt.toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [open])

  useEffect(() => {
    if (!open) {
      setQuery("")
    }
  }, [open])

  return (
    <div ref={wrapperRef}>
      <label className="block text-[13px] font-medium text-gray-600 mb-1.5">
        {label}
        {required ? <span className="text-red-500 ml-0.5">*</span> : null}
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className={`w-full px-4 h-[56px] border border-gray-200 rounded-md text-left text-[#1e293b] text-sm bg-white font-medium flex items-center justify-between ${focusBorderClass}`}
        >
          <span className={value ? "text-[#1e293b]" : "text-gray-400"}>{value || placeholder}</span>
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open ? (
          <div className="absolute z-20 mt-2 w-full rounded-md border border-slate-200 bg-white shadow-lg">
            <div className="relative p-2 border-b border-slate-100">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${label}`}
                className={`w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-medium text-[#111827] placeholder:text-slate-400 [color-scheme:light] ${focusBorderClass}`}
              />
            </div>
            <div className="max-h-44 overflow-y-auto py-1">
              {filteredOptions.length ? (
                filteredOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onChange(opt)
                      setOpen(false)
                      setQuery("")
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-[color:var(--brand-primary)]/10"
                  >
                    {opt}
                  </button>
                ))
              ) : (
                <div className="px-3 py-3 text-sm text-slate-500">No result found</div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Step1ReviewContent() {
  const branding = useTenantBranding()
  const shellStyle = {
    ...brandingToCssVars(branding),
    background: brandingShellGradient(branding),
  }
  const panelSrc = normalizeBrandingImageSrc(branding.loginBackgroundSrc, "/images/handshake.jpg")
  const logoSrc = normalizeBrandingImageSrc(tenantApplicantPanelLogoUrl(branding), "/images/new-logo-nexus.svg", {
    allowBlob: true,
  })
  const panelUseNativeImg = isRemoteOrBlobImageSrc(panelSrc)
  const focusBorderClass =
    "focus:outline-none focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[color:var(--brand-primary)]/20"
  const router = useRouter()
  const nav = useOnboardingStepNav()
  const onboarding = useOnboardingConfigOptional()
  const searchParams = useSearchParams()
  const urlJobTitle = useMemo(() => {
    return (
      searchParams.get("jobTitle") ||
      searchParams.get("job_title") ||
      searchParams.get("jobRole") ||
      searchParams.get("role") ||
      ""
    ).trim()
  }, [searchParams])

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    zipCode: "",
    phone: "",
    email: "",
    jobRole: "",
    sameAsAddress1: false,
  })

  const [loading, setLoading] = useState(false)
  const [autosaveState, setAutosaveState] = useState<"idle" | "saving" | "saved">("idle")
  const [showReviewModal, setShowReviewModal] = useState(false)
  /** Avoid hammering save-worker when a hard email conflict is already known. */
  const autosaveEmailBlockedRef = useRef(false)
  /** Duplicate contact conflict: banner + field highlight (matches design mock). */
  const [fieldConflict, setFieldConflict] = useState<{
    kind: ContactConflictKind
    bannerVisible: boolean
  } | null>(null)
  const [genericError, setGenericError] = useState<string | null>(null)
  /** After first "Save & continue", show incomplete-field message until the form is valid. */
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [resumeId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return localStorage.getItem("resumeId")?.trim() || null
  })
  const parsePoll = useResumeParsePoll(resumeId)
  const isParsing =
    parsePoll.status === "processing" ||
    parsePoll.status === "pending" ||
    parsePoll.isPolling

  useEffect(() => {
    if (!hasLocalResumeUpload() || !onboarding?.updateStepStatus) return
    const resumeStep = findResumeUploadStep(onboarding.config)
    const resumeStepStatus = resumeStep
      ? onboarding.progress?.steps?.find((row) => row.onboarding_step_id === resumeStep.id)
          ?.status
      : undefined
    if (resumeStepStatus === "completed" || resumeStepStatus === "skipped") return
    void markResumeUploadStepComplete({
      updateStepStatus: onboarding.updateStepStatus,
      config: onboarding.config,
      currentStatus: resumeStepStatus,
    }).catch(() => {
      /* best-effort */
    })
  }, [
    onboarding?.config,
    onboarding?.progress?.steps,
    onboarding?.updateStepStatus,
  ])

  const addressParts = useMemo(
    () => ({
      address1: form.address1,
      address2: form.sameAsAddress1 ? "" : form.address2,
      city: form.city,
      state: form.state,
      zipCode: form.zipCode,
    }),
    [form.address1, form.address2, form.sameAsAddress1, form.city, form.state, form.zipCode],
  )

  const addressValidation = useAddressValidation(addressParts, {
    debounceMs: 450,
    validateOnMount: true,
  })

  // Load parsed resume data from localStorage or background Grok parse.
  useEffect(() => {
    const applyParsed = (parsed: Record<string, unknown>) => {
      const loaded = step1FormFromParsedRecord(parsed, urlJobTitle)
      setForm(loaded)
      const parsedAddressQuery = buildAddressQuery({
        address1: loaded.address1,
        address2: loaded.sameAsAddress1 ? "" : loaded.address2,
        city: loaded.city,
        state: loaded.state,
        zipCode: loaded.zipCode,
      })
      if (parsedAddressQuery.trim()) {
        addressValidation.captureOriginalParsedAddress(parsedAddressQuery)
      }
    }

    const saved = localStorage.getItem("parsedResume")
    if (saved) {
      try {
        applyParsed(JSON.parse(saved) as Record<string, unknown>)
      } catch (e) {
        console.error("Failed to parse resume data", e)
      }
      return
    }

    if (parsePoll.parsedResume) {
      applyParsed(parsePoll.parsedResume)
    }
  }, [urlJobTitle, parsePoll.parsedResume])

  useEffect(() => {
    if (!urlJobTitle) return
    setForm((prev) => ({
      ...prev,
      jobRole: prev.jobRole || urlJobTitle,
    }))
  }, [urlJobTitle])

  const zipFieldError = useMemo(
    () => step1ZipInlineMessage(form.zipCode, form.state),
    [form.zipCode, form.state],
  )

  const emailFieldError = useMemo(() => {
    if (!form.email.trim()) return null
    return isValidStep1Email(form.email) ? null : "Enter a valid email address."
  }, [form.email])

  const phoneFieldError = useMemo(() => {
    const digits = normalizePhoneInput(form.phone)
    if (!digits) return null
    return digits.length === 10 ? null : "Enter a valid 10-digit US phone number."
  }, [form.phone])

  const addressQuery = useMemo(() => buildAddressQuery(addressParts), [addressParts])
  const needsAddressVerification = shouldValidateAddressQuery(addressQuery)

  const step1Issue = useMemo(
    () =>
      validateStep1Form(form, {
        addressVerified: !needsAddressVerification || addressValidation.isAddressVerified,
      }),
    [form, needsAddressVerification, addressValidation.isAddressVerified],
  )

  const validationBannerText = useMemo(() => {
    if (!step1Issue) return null
    if (step1Issue.code === "INCOMPLETE") {
      return submitAttempted ? step1Issue.message : null
    }
    return submitAttempted ? step1Issue.message : null
  }, [step1Issue, submitAttempted])

  const handleChange = (key: string, value: string | boolean) => {
    setGenericError(null)
    if (key === "email" && fieldConflict?.kind === "email") {
      autosaveEmailBlockedRef.current = false
      setFieldConflict(null)
    }
    if (key === "phone" && fieldConflict?.kind === "phone") setFieldConflict(null)
    if (
      key === "address1" ||
      key === "address2" ||
      key === "sameAsAddress1" ||
      key === "city" ||
      key === "state" ||
      key === "zipCode"
    ) {
      addressValidation.resetUserConfirmation()
    }
    if (key === "zipCode" && typeof value === "string") {
      setForm((prev) => ({ ...prev, zipCode: value.replace(/\D/g, "").slice(0, 5) }))
      return
    }
    if (key === "sameAsAddress1" && typeof value === "boolean") {
      setForm((prev) => ({
        ...prev,
        sameAsAddress1: value,
        address2: value ? prev.address1 : "",
      }))
      return
    }
    if (key === "address1" && typeof value === "string") {
      setForm((prev) => ({
        ...prev,
        address1: value,
        ...(prev.sameAsAddress1 ? { address2: value } : {}),
      }))
      return
    }
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSelectAddressSuggestion = (
    suggestion: import("@/lib/mapbox/address-validation-types").AddressSuggestion,
  ) => {
    const { components } = addressValidation.confirmSuggestion(suggestion)
    setForm((prev) => ({
      ...prev,
      address1: components.address1 || prev.address1,
      address2: prev.sameAsAddress1
        ? components.address1 || prev.address1
        : components.address2 || prev.address2,
      city: components.city || prev.city,
      state: components.state || prev.state,
      zipCode: components.zipCode || prev.zipCode,
    }))
  }

  const addressValidationPayload = useCallback((): AddressValidationResult | null => {
    const v = addressValidation.validationResult
    return v?.isValid ? v : null
  }, [addressValidation.validationResult])

  const persistResumeDraft = useCallback(async (): Promise<boolean> => {
    if (autosaveEmailBlockedRef.current) return false
    const applicantId = getScopedApplicantId() || ""
    if (!applicantId) return false
    if (
      validateStep1Form(form, {
        addressVerified: !needsAddressVerification || addressValidation.isAddressVerified,
      })
    ) {
      return false
    }

    const verified = addressValidationPayload()
    const tenantSlug =
      typeof window !== "undefined"
        ? resolveClientOnboardingTenantSlug(window.location.search)
        : null
    // Never save against the platform default tenant — that causes false DUPLICATE_EMAIL 409s.
    if (!tenantSlug) return false

    const payload = {
      applicantId,
      firstName: form.firstName,
      lastName: form.lastName,
      address1: form.address1,
      address2: resolveStep1Address2(form),
      city: form.city,
      state: form.state,
      zipCode: form.zipCode,
      phone: form.phone,
      email: form.email,
      jobRole: form.jobRole,
      tenantSlug,
      ...(verified
        ? {
            addressOriginal: verified.originalAddress,
            addressNormalized: verified.normalizedAddress,
            addressLat: verified.coordinates?.lat,
            addressLng: verified.coordinates?.lng,
            addressValidationConfidence: verified.confidence,
          }
        : {}),
    }

    const saveRes = await fetch("/api/onboarding/save-worker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (saveRes.status === 409) {
      let code = ""
      try {
        const json = (await saveRes.json()) as { code?: string }
        code = String(json.code ?? "")
      } catch {
        /* ignore */
      }
      if (code === "DUPLICATE_EMAIL") {
        autosaveEmailBlockedRef.current = true
        setFieldConflict({ kind: "email", bannerVisible: true })
      }
      return false
    }
    if (!saveRes.ok) return false

    autosaveEmailBlockedRef.current = false
    const verifiedForStorage = addressValidationPayload()
    localStorage.setItem(
      "parsedResume",
      JSON.stringify({
        first_name: form.firstName,
        last_name: form.lastName,
        address1: form.address1,
        address2: resolveStep1Address2(form),
        city: form.city,
        state: form.state,
        zipCode: form.zipCode,
        phone: form.phone,
        email: form.email,
        job_role: form.jobRole,
        firstName: form.firstName,
        lastName: form.lastName,
        jobRole: form.jobRole,
        sameAsAddress1: form.sameAsAddress1,
        ...(verifiedForStorage
          ? {
              address_validation: {
                originalAddress: verifiedForStorage.originalAddress,
                normalizedAddress: verifiedForStorage.normalizedAddress,
                coordinates: verifiedForStorage.coordinates,
                confidence: verifiedForStorage.confidence,
                source: verifiedForStorage.source,
                isValid: verifiedForStorage.isValid,
              },
            }
          : {}),
      }),
    )
    return true
  }, [
    form,
    needsAddressVerification,
    addressValidation.isAddressVerified,
    addressValidationPayload,
  ])

  useEffect(() => {
    if (loading) return
    if (autosaveEmailBlockedRef.current) return
    const t = window.setTimeout(() => {
      void (async () => {
        const applicantId = getScopedApplicantId() || ""
        if (
          !applicantId ||
          autosaveEmailBlockedRef.current ||
          validateStep1Form(form, {
            addressVerified: !needsAddressVerification || addressValidation.isAddressVerified,
          })
        ) {
          return
        }
        setAutosaveState("saving")
        const ok = await persistResumeDraft()
        if (ok) {
          setAutosaveState("saved")
          window.setTimeout(() => setAutosaveState("idle"), 1400)
        } else {
          setAutosaveState("idle")
        }
      })()
    }, 700)
    return () => window.clearTimeout(t)
  }, [
    form,
    loading,
    persistResumeDraft,
    needsAddressVerification,
    addressValidation.isAddressVerified,
  ])

  function describeSaveError(err: unknown): string {
    if (err instanceof Error && err.message) return err.message
    if (err && typeof err === "object") {
      const e = err as { message?: string; details?: string; hint?: string; code?: string }
      const parts = [e.message, e.details, e.hint].filter((x): x is string => Boolean(x?.trim()))
      if (parts.length) return parts.join(" — ")
      if (e.code) return `Could not save (${e.code})`
    }
    return "Failed to save data"
  }

  const handleSaveAndContinue = async () => {
    autosaveEmailBlockedRef.current = false
    setFieldConflict(null)
    setGenericError(null)
    setSubmitAttempted(true)
    const step1Err = validateStep1Form(form, {
      addressVerified: !needsAddressVerification || addressValidation.isAddressVerified,
    })
    if (step1Err) {
      return
    }

    setLoading(true)

    try {
      const verified = addressValidationPayload()
      const applicantId = getScopedApplicantId() || ""
      if (!applicantId) throw new Error("Missing applicant ID")

      const tenantSlug =
        typeof window !== "undefined"
          ? resolveClientOnboardingTenantSlug(window.location.search)
          : null
      if (!tenantSlug) {
        throw new Error("Company not found. Check the link and try again.")
      }

      const payload = {
        applicantId,
        firstName: form.firstName,
        lastName: form.lastName,
        address1: form.address1,
        address2: resolveStep1Address2(form),
        city: form.city,
        state: form.state,
        zipCode: form.zipCode,
        phone: form.phone,
        email: form.email,
        jobRole: form.jobRole,
        tenantSlug,
        ...(verified
          ? {
              addressOriginal: verified.originalAddress,
              addressNormalized: verified.normalizedAddress,
              addressLat: verified.coordinates?.lat,
              addressLng: verified.coordinates?.lng,
              addressValidationConfidence: verified.confidence,
            }
          : {}),
      }

      const clientTenantId = getClientOnboardingTenantIdFallback()
      const workerRow = {
        ...(clientTenantId && !tenantSlug ? { tenant_id: clientTenantId } : {}),
        user_id: applicantId,
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        address1: form.address1.trim(),
        address2: resolveStep1Address2(form),
        city: form.city.trim(),
        state: form.state.trim(),
        zip: form.zipCode.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        job_role: form.jobRole.trim(),
        status: "new",
        ...(verified?.coordinates
          ? { lat: verified.coordinates.lat, lng: verified.coordinates.lng }
          : {}),
        updated_at: new Date().toISOString(),
      }

      const saveRes = await fetch("/api/onboarding/save-worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      let saveJson: { error?: string; hint?: string; code?: string } = {}
      try {
        saveJson = (await saveRes.json()) as { error?: string; hint?: string; code?: string }
      } catch {
        /* non-JSON error body */
      }

      if (saveRes.status === 409 && saveJson.code === "DUPLICATE_EMAIL") {
        autosaveEmailBlockedRef.current = true
        setFieldConflict({ kind: "email", bannerVisible: true })
        return
      }

      if (
        saveRes.status === 503 &&
        (saveJson.error === "MISSING_SERVICE_ROLE_KEY" ||
          saveJson.error === "MISSING_SUPABASE_URL")
      ) {
        if (!clientTenantId) {
          throw new Error(
            'Multi-tenant database requires tenant_id on worker rows. Add NEXT_PUBLIC_DEFAULT_TENANT_ID to .env.local (your platform tenant UUID), or set SUPABASE_SERVICE_ROLE_KEY so the server can resolve the default tenant from public.tenants.',
          )
        }
        const emailCheck = await fetch("/api/onboarding/check-email-free", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applicantId,
            email: form.email.trim(),
            ...(tenantSlug ? { tenantSlug } : {}),
          }),
        })
        let emailCheckJson: { error?: string; code?: string } = {}
        try {
          emailCheckJson = (await emailCheck.json()) as { error?: string; code?: string }
        } catch {
          /* ignore */
        }
        if (emailCheck.status === 409 && emailCheckJson.code === "DUPLICATE_EMAIL") {
          setFieldConflict({ kind: "email", bannerVisible: true })
          return
        }

        const { supabaseBrowser: browserClient } = await import("@/lib/supabase-browser")
        // Prefer tenant-scoped lookup; same user_id can exist on multiple tenants.
        let existingQuery = browserClient.from("worker").select("id").eq("user_id", applicantId)
        if (clientTenantId) {
          existingQuery = existingQuery.eq("tenant_id", clientTenantId)
        }
        const { data: existingRows, error: selErr } = await existingQuery
          .order("updated_at", { ascending: false })
          .limit(1)
        if (selErr) {
          throw new Error(
            `${describeSaveError(selErr)} To save from the server instead, add SUPABASE_SERVICE_ROLE_KEY to .env.local (Supabase → Project Settings → API → service_role secret).`
          )
        }
        const existing = existingRows?.[0]
        if (existing?.id) {
          const { user_id: _u, ...updatePayload } = workerRow as Record<string, unknown>
          const { error: upErr } = await browserClient
            .from("worker")
            .update(updatePayload)
            .eq("id", existing.id)
          if (upErr) {
            throw new Error(
              `${describeSaveError(upErr)} To save from the server instead, add SUPABASE_SERVICE_ROLE_KEY to .env.local (Supabase → Project Settings → API → service_role secret).`
            )
          }
        } else {
          const { error: insErr } = await browserClient.from("worker").insert(workerRow)
          if (insErr) {
            throw new Error(
              `${describeSaveError(insErr)} To save from the server instead, add SUPABASE_SERVICE_ROLE_KEY to .env.local (Supabase → Project Settings → API → service_role secret).`
            )
          }
        }
      } else if (!saveRes.ok) {
        throw new Error(
          saveJson.hint || saveJson.error || `Save failed (${saveRes.status})`
        )
      }

      const resumeStoragePath =
        typeof window !== "undefined"
          ? localStorage.getItem("resumeStoragePath")
          : null
      if (resumeStoragePath?.trim()) {
        try {
          const reqRes = await fetch("/api/onboarding/worker-requirements", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              applicantId,
              resume_path: resumeStoragePath.trim(),
              ...(tenantSlug ? { tenantSlug } : {}),
            }),
          })
          if (!reqRes.ok) {
            const j = (await reqRes.json().catch(() => ({}))) as { error?: string }
            console.warn(
              "[step-1-review] worker_requirements resume_path",
              j.error || reqRes.status
            )
          }
        } catch (e) {
          console.warn("[step-1-review] worker_requirements resume_path", e)
        }
      }

      // Save to localStorage for next steps (snake_case keys for steps that read parsedResume)
      localStorage.setItem(
        "parsedResume",
        JSON.stringify({
          first_name: form.firstName,
          last_name: form.lastName,
          address1: form.address1,
          address2: resolveStep1Address2(form),
          city: form.city,
          state: form.state,
          zipCode: form.zipCode,
          phone: form.phone,
          email: form.email,
          job_role: form.jobRole,
          firstName: form.firstName,
          lastName: form.lastName,
          jobRole: form.jobRole,
          ...(verified
            ? {
                address_validation: {
                  originalAddress: verified.originalAddress,
                  normalizedAddress: verified.normalizedAddress,
                  coordinates: verified.coordinates,
                  confidence: verified.confidence,
                  source: verified.source,
                  isValid: verified.isValid,
                },
              }
            : {}),
        }),
      )
      localStorage.setItem("step1ReviewCompleted", "true")

      const resumeStep =
        nav.enabledSteps?.find(
          (s) => s.step_type === "resume_upload" || s.step_key === "resume_upload"
        ) ?? null
      const resumeStepKey = resumeStep?.step_key ?? "resume_upload"

      try {
        await persistStepProgress(
          onboarding?.updateStepStatus,
          resumeStepKey,
          "completed",
          undefined,
          verified
            ? {
                address_validation: {
                  originalAddress: verified.originalAddress,
                  normalizedAddress: verified.normalizedAddress,
                  coordinates: verified.coordinates,
                  confidence: verified.confidence,
                  source: verified.source,
                  isValid: verified.isValid,
                },
              }
            : undefined
        )
      } catch {
        /* progress is best-effort; step 2 should still open */
      }

      const enabled = getEnabledTenantSteps(nav.config)
      const resumeIdx = resumeStep
        ? enabled.findIndex((s) => s.id === resumeStep.id || s.step_key === resumeStep.step_key)
        : -1
      const nextIdx =
        resumeIdx >= 0 ? findNavigableStepIndex(enabled, resumeIdx, 1) : null

      await skipNonNavigableApplicantSteps({
        enabledSteps: enabled,
        progress: onboarding?.progress ?? null,
        updateStepStatus: onboarding?.updateStepStatus,
        afterIndex: resumeIdx,
        beforeIndex: nextIdx ?? resumeIdx,
      })

      // Compute whether the candidate will be waiting on a recruiter step after
      // this step completes. We do this by simulating the updated progress
      // (marking the resume/profile step as "completed") and running the same
      // frontier projection that OnboardingConfigProvider uses. This avoids the
      // async React state-update timing issue where onboarding.waitingOnInternal
      // still reflects the pre-completion state at this point.
      const configForFrontier = nav.config
      const simulatedProgress = onboarding?.progress
        ? {
            ...onboarding.progress,
            steps: (
              onboarding.progress.steps?.some(
                (r) =>
                  (resumeStep && r.onboarding_step_id === resumeStep.id) ||
                  r.step_key === resumeStep?.step_key
              )
                ? onboarding.progress.steps.map((r) =>
                    (resumeStep && r.onboarding_step_id === resumeStep.id) ||
                    r.step_key === resumeStep?.step_key
                      ? { ...r, status: "completed" as const }
                      : r
                  )
                : [
                    ...(onboarding.progress.steps ?? []),
                    {
                      onboarding_step_id: resumeStep?.id ?? "",
                      step_key: resumeStep?.step_key ?? "resume_upload",
                      status: "completed" as const,
                      completed_at: new Date().toISOString(),
                      data: {},
                    },
                  ]
            ),
          }
        : null

      const willWaitOnInternal =
        configForFrontier?.candidateEngineOrder != null
          ? computeCandidateOnboardingFrontier({
              engineOrder: configForFrontier.candidateEngineOrder,
              candidateSteps: enabled,
              progress: simulatedProgress,
            }).waitingOnInternal
          : false

      if (willWaitOnInternal) {
        setShowReviewModal(true)
        return
      }

      const next =
        nextIdx !== null
          ? routeForApplicantStep(enabled[nextIdx]!, nav.slug)
          : adjacentStepRoute(nav.config, resumeStep, 1, nav.slug) ??
            applicationPath(APPLICATION_ROUTES.professionalLicense)
      router.push(next)

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save data"
      console.error(message, err)
      setGenericError(message)
    } finally {
      setLoading(false)
    }
  }

  const emailConflict = fieldConflict?.kind === "email"
  const phoneConflict = fieldConflict?.kind === "phone"
  const conflictBannerText =
    fieldConflict?.kind === "email"
      ? "This email is already used in this organization. Click to login using Email"
      : fieldConflict?.kind === "phone"
        ? "Phone was already used. Click to login using phone"
        : ""

  const renderConflictBanner = (extraClassName = "") =>
    fieldConflict?.bannerVisible ? (
      <div
        role="alert"
        className={`flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4 ${extraClassName}`}
      >
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
          <p className="text-sm font-medium leading-snug text-red-800">{conflictBannerText}</p>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 sm:justify-start">
          <button
            type="button"
            onClick={() =>
              router.push(
                workerSignInHref({ tenant: nav.slug || branding.slug }),
              )
            }
            className="rounded-md border border-red-600 bg-white px-4 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            Login
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() =>
              setFieldConflict((prev) => (prev ? { ...prev, bannerVisible: false } : null))
            }
            className="rounded p-1.5 text-red-500 hover:bg-red-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    ) : null

  return (
    <>
    <AwaitingRecruiterReviewModal
      open={showReviewModal}
      onClose={() => setShowReviewModal(false)}
    />
    <div
      className="relative flex min-h-screen items-stretch justify-center p-3 py-6 sm:items-center sm:p-4 sm:py-8"
      style={shellStyle}
    >
      <div
        className="bg-white rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col min-[700px]:flex-row relative mx-auto w-full max-w-[1060px] min-[700px]:min-h-[640px] min-h-0"
      >
        {/* LEFT - Form */}
        <div className="w-full min-[700px]:w-[65%] p-4 sm:p-6 min-[700px]:p-8 min-[1200px]:p-10 flex flex-col justify-between min-w-0">
          <div className="min-w-0">
            <OnboardingStepper />

            <div className="mt-4 sm:mt-6 mb-4 sm:mb-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl sm:text-[22px] font-bold text-[#1e293b]">Review resume details</h2>
              <AutosaveStatus
                state={autosaveState === "saving" ? "saving" : autosaveState === "saved" ? "saved" : "idle"}
              />
            </div>

            {(genericError || validationBannerText) && (
              <div
                role="alert"
                className="mb-5 p-4 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg"
              >
                {genericError || validationBannerText}
              </div>
            )}

            {isParsing ? (
              <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                Resume uploaded. We&apos;re extracting your profile details in the background — you
                can review or edit the fields below while parsing finishes.
              </div>
            ) : parsePoll.status === "failed" ? (
              <div
                role="alert"
                className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                {parsePoll.parseError || RESUME_PARSE_FAILED_USER_MESSAGE} You can still enter your
                details manually below.
              </div>
            ) : null}

            <div className="space-y-4 sm:space-y-5">
              {/* Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                <EditableInput
                  label="First Name"
                  required
                  value={form.firstName}
                  onChange={(value) => handleChange("firstName", value)}
                  className={`w-full px-4 h-[56px] border border-gray-200 rounded-md text-[#1e293b] text-sm bg-white font-medium pr-10 ${focusBorderClass}`}
                  placeholder="First Name"
                  maxLength={PERSON_NAME_MAX_LENGTH}
                />
                <EditableInput
                  label="Last Name"
                  required
                  value={form.lastName}
                  onChange={(value) => handleChange("lastName", value)}
                  className={`w-full px-4 h-[56px] border border-gray-200 rounded-md text-[#1e293b] text-sm bg-white pr-10 ${focusBorderClass}`}
                  placeholder="Last Name"
                  maxLength={PERSON_NAME_MAX_LENGTH}
                />
              </div>

              {/* Address 1 — Mapbox verified */}
              <ValidatedAddressField
                label="Address 1"
                required
                hint="Street Address, P.O Box"
                value={form.address1}
                query={addressQuery}
                uiState={addressValidation.uiState}
                validationResult={addressValidation.validationResult}
                isValidating={addressValidation.isValidating}
                onChange={(value) => handleChange("address1", value)}
                onSelectSuggestion={handleSelectAddressSuggestion}
                className={`w-full px-4 h-[56px] border border-gray-200 rounded-md text-[#1e293b] text-sm bg-white pr-10 ${focusBorderClass}`}
                placeholder="1234 Main St, Apt 4B"
              />

              {/* Address 2 (optional) */}
              <div>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-[13px] font-medium text-gray-600">
                    Address 2
                  </label>
                  {/* Same as address 1 — hidden for now
                  <OnboardingCheckbox
                    checked={form.sameAsAddress1}
                    onChange={(checked) => handleChange("sameAsAddress1", checked)}
                    className="items-center gap-2"
                  >
                    <span className="text-[13px] font-medium text-gray-600">Same as address 1</span>
                  </OnboardingCheckbox>
                  */}
                </div>
                <span className="mb-1.5 block text-[11px] text-gray-400">
                  Apt, Suite, Building, Floor, etc...
                </span>
                <div className="group relative">
                  <input
                    value={form.address2}
                    onChange={(e) => handleChange("address2", e.target.value)}
                    className={`w-full px-4 h-[56px] border border-gray-200 rounded-md focus:border-[color:var(--brand-primary)] focus:outline-none text-[#1e293b] text-sm bg-white pr-10`}
                    placeholder="Apt, Suite, Unit, etc."
                  />
                </div>
              </div>

              {/* State, City */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                <SearchableSelect
                  label="State"
                  required
                  value={form.state}
                  placeholder="Select State"
                  options={US_STATES}
                  onChange={(value) => handleChange("state", value)}
                />
                <SearchableSelect
                  label="City"
                  required
                  value={form.city}
                  placeholder="Select City"
                  options={POPULAR_CITIES}
                  onChange={(value) => handleChange("city", value)}
                />
              </div>

              {renderConflictBanner(emailConflict ? "hidden sm:flex" : "")}

              {/* Phone & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <label className="block text-[13px] font-medium text-gray-600">
                      Phone<span className="text-red-500 ml-0.5">*</span>
                    </label>
                    {phoneConflict ? (
                      <span className="text-[11px] font-medium text-red-600">Phone was already used</span>
                    ) : null}
                  </div>
                  <div className="group relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                      <span className="relative block h-4 w-6 overflow-hidden rounded-[2px] border border-slate-300 bg-white">
                        <span className="absolute inset-0 bg-[repeating-linear-gradient(to_bottom,#b91c1c_0,#b91c1c_1.5px,#ffffff_1.5px,#ffffff_3px)]" />
                        <span className="absolute left-0 top-0 h-2.5 w-2.5 bg-[#1d4ed8]" />
                      </span>
                    </span>
                    <input
                      id="phone-input"
                      value={formatPhoneNumber(form.phone)}
                      onChange={(e) => handleChange("phone", normalizePhoneInput(e.target.value))}
                      className={`w-full pl-14 pr-11 h-[52px] sm:h-[56px] border rounded-md text-[#1e293b] text-sm bg-white ${
                        phoneConflict || phoneFieldError
                          ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-200"
                          : `border-gray-200 ${focusBorderClass}`
                      }`}
                      placeholder="(201) 512-2366"
                      inputMode="numeric"
                    />
                    {!phoneConflict ? (
                      <button
                        type="button"
                        onClick={() => document.getElementById("phone-input")?.focus()}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                        aria-label="Edit Phone"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    ) : null}
                    {phoneConflict ? (
                      <XCircle
                        className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-red-500"
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  {phoneFieldError && !phoneConflict ? (
                    <p className="mt-1.5 text-xs text-red-600" role="alert">
                      {phoneFieldError}
                    </p>
                  ) : null}
                  {emailConflict ? renderConflictBanner("mt-3 sm:hidden") : null}
                </div>
                <div className="relative">
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <label className="block text-[13px] font-medium text-gray-600">
                      Email<span className="text-red-500 ml-0.5">*</span>
                    </label>
                    {emailConflict ? (
                      <span className="hidden text-[11px] font-medium text-red-600 sm:inline">
                        This email is already used in this organization.
                      </span>
                    ) : null}
                  </div>
                  <div className="group relative">
                    <input
                      id="email-input"
                      value={form.email}
                      onChange={(e) => handleChange("email", e.target.value)}
                      className={`w-full px-4 pr-11 h-[52px] sm:h-[56px] border rounded-md text-[#1e293b] text-sm bg-white ${
                        emailConflict || emailFieldError
                          ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none"
                          : `border-gray-200 ${focusBorderClass}`
                      }`}
                      placeholder="rickashton@gmail.com"
                    />
                    {!emailConflict ? (
                      <button
                        type="button"
                        onClick={() => document.getElementById("email-input")?.focus()}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                        aria-label="Edit Email"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    ) : null}
                    {emailConflict ? (
                      <XCircle
                        className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-red-500"
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  {emailFieldError && !emailConflict ? (
                    <p className="mt-1.5 text-xs text-red-600" role="alert">
                      {emailFieldError}
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Zip & Job Role */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <EditableInput
                    label="Zip Code"
                    required
                    value={form.zipCode}
                    onChange={(value) => handleChange("zipCode", value)}
                    className={`w-full px-4 h-[56px] border rounded-md text-[#1e293b] text-sm bg-white pr-10 ${
                      zipFieldError
                        ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none"
                        : `border-gray-200 ${focusBorderClass}`
                    }`}
                    placeholder="12345"
                    inputMode="numeric"
                  />
                  {zipFieldError ? (
                    <p className="mt-1.5 text-xs text-red-600" role="alert">
                      {zipFieldError}
                    </p>
                  ) : null}
                </div>
                <div>
                  <EditableInput
                    label="Job Title"
                    required
                    value={form.jobRole}
                    onChange={(value) => handleChange("jobRole", value)}
                    className={`w-full px-4 h-[56px] border border-gray-200 rounded-md text-[#1e293b] text-sm bg-white pr-10 ${focusBorderClass}`}
                    placeholder="Enter Job Title"
                    maxLength={100}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:mt-10 sm:flex sm:justify-end sm:gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="cursor-pointer w-full rounded-lg border px-3 py-2.5 text-sm font-medium transition hover:opacity-90 sm:w-auto sm:px-6"
              style={{ borderColor: branding.primaryHex, color: branding.primaryHex }}
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSaveAndContinue}
              disabled={loading}
              className="cursor-pointer w-full rounded-lg px-3 py-2.5 text-sm font-medium text-white transition hover:brightness-90 disabled:cursor-not-allowed disabled:bg-gray-400 sm:w-auto sm:px-6"
              style={{ backgroundColor: branding.primaryHex }}
            >
              {loading ? "Saving..." : "Save & continue"}
            </button>
          </div>
        </div>

        {/* RIGHT - Branding and Image */}
        <div className="relative hidden min-h-[320px] shrink-0 bg-gray-50 min-[700px]:block min-[700px]:min-h-0 min-[700px]:w-[35%]">
          <div className="absolute inset-0 z-0">
            {panelUseNativeImg ? (
              <img
                src={panelSrc}
                alt=""
                className="absolute inset-0 h-full w-full object-cover object-top opacity-60 grayscale"
              />
            ) : (
              <Image
                src={panelSrc}
                alt=""
                fill
                sizes="(max-width: 699px) 0px, 35vw"
                className="object-cover object-top opacity-60 grayscale"
                priority
              />
            )}
            <div className="absolute inset-0 bg-white/65" />
          </div>

          <div
            className={`absolute inset-0 z-10 flex flex-col items-center justify-center ${BRANDING_RIGHT_PANEL_STACK_GAP_CLASS} px-5 min-[900px]:px-10`}
          >
            <BrandingRightPanelLogo
              src={logoSrc}
              alt={branding.companyName}
              widthClassName="w-full max-w-[180px] min-[900px]:max-w-[204px]"
            />

            <div className="flex w-full max-w-[280px] items-center justify-center gap-4">
              <div className="h-px flex-1 bg-slate-300/80" />
              <BrandedSvgIcon
                src="/icons/circle-star-icon.svg"
                className="h-6 w-6 flex-none"
                color={branding.primaryHex}
              />
              <div className="h-px flex-1 bg-slate-300/80" />
            </div>
            <p className="max-w-[280px] text-center text-[14px] font-normal leading-5 text-[#1e293b] min-[900px]:text-[16px] min-[900px]:leading-6">
              {branding.tagline}
            </p>
          </div>
        </div>
      </div>

    </div>
    </>
  )
}

function ProfileReviewFallback() {
  const branding = useTenantBranding()
  return (
    <div
      className="min-h-screen"
      style={{ background: brandingShellGradient(branding) }}
    />
  )
}

export default function Step1Review() {
  return (
    <Suspense fallback={<ProfileReviewFallback />}>
      <Step1ReviewContent />
    </Suspense>
  )
}


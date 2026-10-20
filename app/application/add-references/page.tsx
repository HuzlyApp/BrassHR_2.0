"use client"

import { APPLICATION_ROUTES } from "@/lib/onboarding/application-routes"
import { applicationPath } from "@/lib/tenant/with-tenant"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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
import {
  isReferencesWorkflowStep,
  resolveLegacyAddReferencesTarget,
} from "@/lib/onboarding/legacy-add-references-redirect"
import { ensureApplicantWorker } from "@/lib/onboarding/ensure-applicant-worker"
import { isDraftPreviewApplicantId, isOnboardingDraftPreview } from "@/lib/onboarding/is-draft-preview"
import { resolveClientOnboardingTenantSlug } from "@/lib/tenant/client-onboarding-slug"
import { supabaseBrowser } from "@/lib/supabase-browser"
import { formatPhoneNumber, normalizePhoneInput } from "@/lib/phone"
import { PERSON_NAME_MAX_LENGTH } from "@/lib/person-name"
import {
  APPLICANT_ACTION_ROW,
  APPLICANT_BTN_BACK,
  APPLICANT_BTN_PRIMARY,
  APPLICANT_CONTENT_CLASS,
  APPLICANT_FORM_GRID,
  APPLICANT_HEADER_ROW,
  APPLICANT_SHELL_CLASS,
  APPLICANT_SKIP_COLUMN,
  APPLICANT_TITLE_CLASS,
} from "@/app/application/applicant-onboarding-responsive"
import AutosaveStatus from "@/app/components/AutosaveStatus"
import {
  emptyReferenceRow,
  getReferenceFieldError,
  getReferencesSaveError,
  isReferenceComplete,
  sanitizeYearsKnownInput,
  type ReferenceRow,
} from "@/lib/referencesValidation"

type RefRow = ReferenceRow

function loadRefsFromStorage(): RefRow[] {
  if (typeof window === "undefined") return [emptyReferenceRow()]
  try {
    const draft = localStorage.getItem("referenceDataDraft")
    if (draft) {
      const p = JSON.parse(draft) as RefRow[]
      if (Array.isArray(p) && p.length) {
        return p.map((r) => ({ ...emptyReferenceRow(), ...r }))
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const saved = localStorage.getItem("referenceData")
    if (saved) {
      const p = JSON.parse(saved) as RefRow[]
      if (Array.isArray(p) && p.length) {
        return p.map((r) => ({ ...emptyReferenceRow(), ...r }))
      }
    }
  } catch {
    /* ignore */
  }
  return [emptyReferenceRow()]
}

/** References already saved for the signed-in applicant, e.g. when they return on another device. */
async function loadSavedReferences(): Promise<RefRow[]> {
  try {
    const tenantSlug = resolveClientOnboardingTenantSlug(window.location.search)
    if (!tenantSlug) return []
    const { data } = await supabaseBrowser.auth.getSession()
    const token = data.session?.access_token
    // Without a session, the continuation-link cookie identifies the applicant.
    const res = await fetch(
      `/api/onboarding/worker-references?tenant=${encodeURIComponent(tenantSlug)}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : undefined, cache: "no-store" },
    )
    if (!res.ok) return []
    const json = (await res.json().catch(() => ({}))) as { references?: RefRow[] }
    return Array.isArray(json.references) ? json.references : []
  } catch {
    return []
  }
}

export default function ReferencesPage() {
  const branding = useTenantBranding()
  const router = useRouter()
  const searchParams = useSearchParams()
  const search = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const nav = useOnboardingStepNav()
  const completingRef = useRef(false)
  const [redirecting, setRedirecting] = useState(false)

  const referencesStep =
    (nav.currentStep && isReferencesWorkflowStep(nav.currentStep) ? nav.currentStep : null) ??
    nav.enabledSteps?.find((step) => isReferencesWorkflowStep(step)) ??
    null

  const minCount = useMemo(() => {
    const raw = referencesStep?.metadata?.min_count
    const n = typeof raw === "number" ? raw : Number(raw)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
  }, [referencesStep?.metadata?.min_count])

  useMarkStepInProgressIfPending({
    step: referencesStep,
    disabled: nav.configLoading || isOnboardingDraftPreview(search) || redirecting,
    updateStepStatus: nav.updateStepStatus,
    completingRef,
  })

  const [refs, setRefs] = useState<RefRow[]>(() => loadRefsFromStorage())
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [autosaveState, setAutosaveState] = useState<"idle" | "saving" | "saved">("idle")

  useEffect(() => {
    if (nav.configLoading) return

    const redirectTarget = resolveLegacyAddReferencesTarget(
      nav.config,
      nav.enabledSteps ?? [],
      search,
      nav.slug
    )

    if (redirectTarget) {
      setRedirecting(true)
      nav.replace(redirectTarget)
    }
  }, [nav.configLoading, nav.config, nav.enabledSteps, nav.slug, nav.replace, search])

  useEffect(() => {
    if (nav.configLoading || isOnboardingDraftPreview(search)) return
    void ensureApplicantWorker()
  }, [nav.configLoading, search])

  useEffect(() => {
    if (nav.configLoading || isOnboardingDraftPreview(search)) return
    let cancelled = false
    void (async () => {
      const saved = await loadSavedReferences()
      if (cancelled || !saved.length) return
      setRefs((current) => {
        const blank = current.every((row) =>
          Object.values(row).every((value) => !String(value ?? "").trim()),
        )
        return blank ? saved.slice(0, 5).map((row) => ({ ...emptyReferenceRow(), ...row })) : current
      })
    })()
    return () => {
      cancelled = true
    }
  }, [nav.configLoading, search])

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        setAutosaveState("saving")
        localStorage.setItem("referenceDataDraft", JSON.stringify(refs))
        setAutosaveState("saved")
        window.setTimeout(() => setAutosaveState("idle"), 1200)
      } catch {
        setAutosaveState("idle")
      }
    }, 650)
    return () => window.clearTimeout(t)
  }, [refs])

  function update(index: number, field: keyof RefRow, value: string) {
    const updated = [...refs]
    updated[index] = { ...updated[index], [field]: value }
    setRefs(updated)
  }

  function addReference() {
    if (refs.length >= 5) return
    setRefs([...refs, emptyReferenceRow()])
  }

  function removeReference(index: number) {
    if (refs.length <= 1) {
      setRefs([emptyReferenceRow()])
      return
    }
    setRefs(refs.filter((_, i) => i !== index))
  }

  async function skipReferences() {
    void skipOnboardingStep({
      step: referencesStep,
      updateStepStatus: nav.updateStepStatus,
      completingRef,
      onNavigate: () => nav.goNext("skipped"),
    })
  }

  async function saveReferences() {
    setError("")
    setSaving(true)
    const validationError = getReferencesSaveError(refs, { minCount })
    if (validationError) {
      setError(validationError)
      setSaving(false)
      return
    }
    const completeRefs = refs.filter(isReferenceComplete)
    const names = completeRefs
      .map((r) => `${r.first.trim()}-${r.last.trim()}`.toLowerCase())
      .filter((n) => n !== "-")
    if (new Set(names).size !== names.length) {
      setError("Duplicate reference names are not allowed.")
      setSaving(false)
      return
    }
    const applicantId = typeof window !== "undefined" ? localStorage.getItem("applicantId")?.trim() || "" : ""
    if (!applicantId) {
      setError("Missing applicant session. Return to Step 1 and save your profile.")
      setSaving(false)
      return
    }

    const isPreview =
      isOnboardingDraftPreview(search) || isDraftPreviewApplicantId(applicantId)

    if (!isPreview) {
      const ensured = await ensureApplicantWorker()
      if (!ensured.ok) {
        setError(ensured.error)
        setSaving(false)
        return
      }
    }

    const tenantSlug =
      typeof window !== "undefined"
        ? resolveClientOnboardingTenantSlug(window.location.search)
        : null

    const res = isPreview
      ? null
      : await fetch("/api/onboarding/worker-references", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applicantId,
            tenantSlug,
            minCount,
            references: completeRefs.map((r) => ({
              first: r.first,
              last: r.last,
              phone: r.phone,
              email: r.email,
              relationship: r.relationship,
              company: r.company,
              jobTitle: r.jobTitle,
              yearsKnown: r.yearsKnown,
              notes: r.notes,
            })),
          }),
        })
    let payload: { error?: string; hint?: string } = {}
    if (res) {
      try {
        payload = (await res.json()) as { error?: string; hint?: string }
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        setError(
          payload.hint
            ? `${payload.error || "Save failed"}. ${payload.hint}`
            : payload.error || `Save failed (${res.status})`,
        )
        setSaving(false)
        return
      }
    }
    localStorage.setItem("referenceData", JSON.stringify(completeRefs))
    localStorage.removeItem("referenceDataDraft")
    localStorage.setItem("referencesCount", String(completeRefs.length))
    localStorage.setItem("step5Completed", "true")

    if (referencesStep?.step_key && nav.updateStepStatus && !isPreview) {
      try {
        await persistStepProgress(
          nav.updateStepStatus,
          referencesStep.step_key,
          "completed",
          completingRef
        )
      } catch (persistErr) {
        console.error("[add-references] mark completed", persistErr)
        // References are already saved; continue — summary heal will sync the stepper.
      }
    }

    nav.goNext()
    setSaving(false)
  }

  if (redirecting) {
    return null
  }

  return (
    <OnboardingLayout
      cardClassName="min-[700px]:h-auto min-[700px]:min-h-[540px] min-[1200px]:min-h-[700px]"
      rightPanelImageClassName="opacity-60 object-top"
      rightPanelOverlayClassName="bg-white/65"
    >
      <div className={APPLICANT_SHELL_CLASS} style={brandingToCssVars(branding)}>
        <OnboardingStepper />

        <div className={APPLICANT_CONTENT_CLASS}>
          <div className={APPLICANT_HEADER_ROW}>
            <h2 className={APPLICANT_TITLE_CLASS}>Add Reference</h2>
            <div className={`${APPLICANT_SKIP_COLUMN} max-[399px]:flex-row max-[399px]:items-center max-[399px]:justify-end max-[399px]:gap-2`}>
              <AutosaveStatus
                state={
                  autosaveState === "saving" ? "saving" : autosaveState === "saved" ? "saved" : "idle"
                }
              />
              <button
                type="button"
                onClick={() => void skipReferences()}
                className="cursor-pointer text-[12px] font-medium leading-5 text-[color:var(--brand-primary)]"
              >
                Skip for Now →
              </button>
            </div>
          </div>
          <p className="mb-1 text-xs text-slate-500 sm:text-[13px]">Trusted feedback, verified integrity.</p>
          <p className="mb-5 text-[11px] text-slate-400 sm:mb-6 sm:text-[12px]">
            Add at least {minCount} complete professional reference{minCount === 1 ? "" : "s"} (up to 5).
          </p>

          <div className="space-y-8">
            {refs.map((r, index) => {
              const yearsKnownError = getReferenceFieldError(r, "yearsKnown")
              return (
                <div key={index}>

                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[15px] font-bold text-slate-800">Reference {index + 1}</p>
                  <div className="flex items-center gap-3">
                    {index < minCount ? (
                      <p className="text-[11px] font-medium text-rose-600">Required</p>
                    ) : (
                      <p className="text-[11px] text-slate-400">Optional</p>
                    )}
                    {refs.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeReference(index)}
                        className="text-[11px] font-medium text-slate-500 underline-offset-2 hover:underline"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className={`${APPLICANT_FORM_GRID} mb-3`}>
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-500">First Name</label>
                    <input
                      value={r.first}
                      onChange={(e) => update(index, "first", e.target.value)}
                      maxLength={PERSON_NAME_MAX_LENGTH}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 outline-none transition focus:border-[color:var(--brand-primary)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-500">Last Name</label>
                    <input
                      value={r.last}
                      onChange={(e) => update(index, "last", e.target.value)}
                      maxLength={PERSON_NAME_MAX_LENGTH}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 outline-none transition focus:border-[color:var(--brand-primary)]"
                    />
                  </div>
                </div>

                <div className={`${APPLICANT_FORM_GRID} mb-3`}>
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-500">Relationship</label>
                    <input
                      value={r.relationship ?? ""}
                      onChange={(e) => update(index, "relationship", e.target.value)}
                      placeholder="Former supervisor"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 outline-none transition focus:border-[color:var(--brand-primary)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-500">Company</label>
                    <input
                      value={r.company ?? ""}
                      onChange={(e) => update(index, "company", e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 outline-none transition focus:border-[color:var(--brand-primary)]"
                    />
                  </div>
                </div>

                <div className={`${APPLICANT_FORM_GRID} mb-3`}>
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-500">Job Title</label>
                    <input
                      value={r.jobTitle ?? ""}
                      onChange={(e) => update(index, "jobTitle", e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 outline-none transition focus:border-[color:var(--brand-primary)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-500">Years Known</label>
                    <input
                      value={r.yearsKnown ?? ""}
                      onChange={(e) => update(index, "yearsKnown", sanitizeYearsKnownInput(e.target.value))}
                      inputMode="decimal"
                      placeholder="e.g. 5 (0–80)"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 outline-none transition focus:border-[color:var(--brand-primary)]"
                    />
                    {yearsKnownError ? (
                      <p className="mt-1 text-[11px] text-rose-600">{yearsKnownError}</p>
                    ) : null}
                  </div>
                </div>

                <div className={`${APPLICANT_FORM_GRID} mb-3`}>
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-500">Phone</label>
                    <input
                      value={formatPhoneNumber(r.phone)}
                      onChange={(e) => update(index, "phone", normalizePhoneInput(e.target.value))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 outline-none transition focus:border-[color:var(--brand-primary)]"
                      placeholder="(201) 555-5555"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-500">Email</label>
                    <input
                      value={r.email}
                      onChange={(e) => update(index, "email", e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 outline-none transition focus:border-[color:var(--brand-primary)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] text-slate-500">Notes</label>
                  <textarea
                    value={r.notes ?? ""}
                    onChange={(e) => update(index, "notes", e.target.value)}
                    rows={2}
                    placeholder="Optional"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 outline-none transition focus:border-[color:var(--brand-primary)]"
                  />
                </div>
                </div>
              )
            })}
          </div>

          {refs.length < 5 && (
            <button
              type="button"
              onClick={addReference}
              className="mt-6 w-fit rounded-md border border-[color:var(--brand-primary)] px-4 py-1.5 text-[12px] font-medium text-[color:var(--brand-primary)] transition hover:bg-[color:var(--brand-primary)]/5"
            >
              + Add Reference
            </button>
          )}

          {error && <p className="mt-4 text-[12px] text-red-500">{error}</p>}

          <div className={APPLICANT_ACTION_ROW}>
            <button
              type="button"
              onClick={() => (nav.prevRoute ? nav.goPrev() : router.back())}
              className={APPLICANT_BTN_BACK}
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void saveReferences()}
              disabled={saving}
              className={`${APPLICANT_BTN_PRIMARY} disabled:cursor-not-allowed disabled:opacity-70`}
            >
              Save &amp; continue
            </button>
          </div>
        </div>
      </div>
    </OnboardingLayout>
  )
}

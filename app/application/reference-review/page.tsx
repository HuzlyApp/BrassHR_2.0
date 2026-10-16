
"use client"

import { APPLICATION_ROUTES } from "@/lib/onboarding/application-routes"
import { applicationPath } from "@/lib/tenant/with-tenant"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Pencil, ChevronRight } from "lucide-react"
import {
  APPLICANT_ACTION_ROW,
  APPLICANT_BTN_BACK,
  APPLICANT_BTN_PRIMARY,
  APPLICANT_CONTENT_CLASS,
  APPLICANT_HEADER_ROW,
  APPLICANT_SHELL_CLASS,
  APPLICANT_TITLE_CLASS,
} from "@/app/application/applicant-onboarding-responsive"
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
  countCompleteReferences,
  MIN_COMPLETE_REFERENCES,
  type ReferenceRow,
} from "@/lib/referencesValidation"

type Reference = ReferenceRow

const emptyReference: Reference = {
  first: "",
  last: "",
  phone: "",
  email: "",
}

export default function ReferenceReviewPage() {
  const branding = useTenantBranding()
  const router = useRouter()
  const nav = useOnboardingStepNav()
  const completingRef = useRef(false)
  const [references, setReferences] = useState<Reference[]>([])
  const [continueError, setContinueError] = useState<string | null>(null)

  const referencesStep =
    nav.currentStep ??
    nav.enabledSteps?.find((s) => s.step_type === "references" || s.step_key === "references") ??
    null

  useMarkStepInProgressIfPending({
    step: referencesStep,
    disabled: nav.configLoading,
    updateStepStatus: nav.updateStepStatus,
    completingRef,
  })

  useEffect(() => {
    const data = localStorage.getItem("referenceData")
    if (data) {
      try {
        const parsed = JSON.parse(data) as Reference[]
        setReferences(Array.isArray(parsed) ? parsed : [])
      } catch {
        setReferences([])
      }
    }
  }, [])

  const slots = useMemo(() => {
    const filled = references.slice(0, 3)
    while (filled.length < 3) {
      filled.push(emptyReference)
    }
    return filled
  }, [references])

  const completeCount = countCompleteReferences(references)
  const hasAnyReference = references.length > 0
  const hasMinimumReferences = completeCount >= MIN_COMPLETE_REFERENCES

  const handleEdit = () => {
    router.push(applicationPath(APPLICATION_ROUTES.addReferences))
  }

  const handleSkip = () => {
    void skipOnboardingStep({
      step: referencesStep,
      updateStepStatus: nav.updateStepStatus,
      completingRef,
      onNavigate: () => nav.goNext("skipped"),
    })
  }

  const handleContinue = async () => {
    setContinueError(null)
    if (!hasMinimumReferences) {
      setContinueError(
        `Add at least ${MIN_COMPLETE_REFERENCES} complete references before continuing to the summary.`,
      )
      return
    }
    localStorage.setItem("step5Completed", "true")

    const referencesStep =
      nav.currentStep ??
      nav.enabledSteps?.find((s) => s.step_type === "references" || s.step_key === "references")
    if (referencesStep?.step_key && nav.updateStepStatus) {
      await persistStepProgress(
        nav.updateStepStatus,
        referencesStep.step_key,
        "completed",
        completingRef
      )
    }

    nav.goNext()
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
          <div className={`${APPLICANT_HEADER_ROW} mb-4 max-[399px]:flex-col max-[399px]:items-stretch`}>
            <div className="min-w-0 flex-1">
              <h2 className={APPLICANT_TITLE_CLASS}>References</h2>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500 sm:text-[13px]">
                Review the references you added. You need at least {MIN_COMPLETE_REFERENCES} complete references before
                the summary. Use the edit button to update any contact details.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSkip}
              className="shrink-0 cursor-pointer self-end text-[12px] font-medium leading-5 text-[color:var(--brand-primary)] max-[399px]:mt-1"
            >
              Skip for Now →
            </button>
          </div>

          {!hasAnyReference ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center sm:p-10">
              <p className="text-[15px] font-semibold text-slate-800 mb-2">No references added yet</p>
              <p className="text-sm text-slate-500 mb-6">
                Add at least {MIN_COMPLETE_REFERENCES} references with full contact details so we can verify your
                background.
              </p>
              <button
                type="button"
                onClick={handleEdit}
                className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--brand-primary)] bg-white px-5 py-2 text-[12px] font-medium text-[color:var(--brand-primary)] transition hover:bg-[color:var(--brand-primary)]/5"
              >
                Add References
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {slots.map((reference, index) => {
                const isFilled = Boolean(reference.first || reference.last || reference.phone || reference.email)
                return (
                  <div key={index} className="rounded-2xl border border-[color:var(--brand-primary)] bg-white p-4 shadow-sm max-[399px]:p-3 sm:p-6">
                    <div className="flex items-start justify-between gap-3 sm:gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-[15px] font-semibold text-slate-900">Reference {index + 1}</p>
                          {index < MIN_COMPLETE_REFERENCES ? (
                            <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                              Required
                            </span>
                          ) : (
                            <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                              Optional
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-slate-500 mt-1">
                          {isFilled ? "Verified contact details" : "Not added yet"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleEdit}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-100 sm:gap-2 sm:px-3 sm:py-2 sm:text-[12px]"
                      >
                        <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        Edit
                      </button>
                    </div>

                    {isFilled ? (
                      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">First Name</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">{reference.first}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Last Name</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">{reference.last}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Phone</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">{reference.phone}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Email</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">{reference.email}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                        Reference {index + 1} has not been added. Tap edit to complete it.
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {continueError ? (
            <p className="mt-4 text-sm text-red-600" role="alert">
              {continueError}
            </p>
          ) : null}

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
              onClick={handleContinue}
              disabled={!hasMinimumReferences}
              className={`${APPLICANT_BTN_PRIMARY} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </OnboardingLayout>
  )
}
"use client"

import Image from "next/image"
import { useMemo } from "react"
import { useOnboardingConfigOptional } from "@/app/components/onboarding/OnboardingConfigProvider"
import { resolveApplicantEnabledSteps } from "@/lib/onboarding/tenant-step-navigation"
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext"
import { brandingToCssVars } from "@/lib/tenant/tenant-branding"
import { applicantPortalCopy } from "@/lib/onboarding/workflow-phase"
import {
  WAITING_ON_INTERNAL_MESSAGE,
  type EmploymentLifecyclePhase,
} from "@/lib/onboarding/workflow-phase-groups"
import ApplicantPhaseWelcome from "@/app/components/onboarding/ApplicantPhaseWelcome"

interface Props {
  /** Kept for existing call sites. The step rail is not shown. */
  currentStep?: number
  completedThrough?: number
  title?: string
  titleIconSrc?: string
  titleIconAlt?: string
}

export default function OnboardingStepper({
  title,
  titleIconSrc,
  titleIconAlt,
}: Props) {
  const branding = useTenantBranding()
  const onboarding = useOnboardingConfigOptional()

  const enabledSteps = useMemo(
    () => resolveApplicantEnabledSteps(onboarding?.config, onboarding?.loading ?? true),
    [onboarding?.config, onboarding?.loading]
  )

  const livePhase: EmploymentLifecyclePhase =
    onboarding?.workflowPhase === "post_hire" || onboarding?.workflowPhase === "completed"
      ? "post_hire"
      : "pre_hire"
  const phaseCopy = applicantPortalCopy(livePhase)
  const heading = title ?? phaseCopy.header

  if (!enabledSteps?.length) {
    return onboarding?.loading ? (
      <div className="h-16 w-full animate-pulse rounded-lg bg-slate-100" />
    ) : (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm text-slate-600">
        No onboarding steps are configured for this workflow.
      </div>
    )
  }

  return (
    <>
      <div className="min-w-0 w-full border-b border-slate-200 pb-4 sm:pb-6" style={brandingToCssVars(branding)}>
        <ApplicantPhaseWelcome
          phase={onboarding?.workflowPhase ?? "pre_hire"}
          applicationId={onboarding?.applicationId}
        />
        {onboarding?.waitingOnInternal &&
        onboarding.workflowPhase !== "post_hire" &&
        onboarding.workflowPhase !== "completed" ? (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {WAITING_ON_INTERNAL_MESSAGE}
          </div>
        ) : null}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {phaseCopy.progressLabel}
          </p>
          <h1 className="text-lg font-semibold text-slate-800 sm:text-xl">{heading}</h1>
        </div>
      </div>

      {title ? (
        <div className="mt-8 flex items-center gap-3">
          {titleIconSrc ? (
            <Image
              src={titleIconSrc}
              alt={titleIconAlt ?? ""}
              width={24}
              height={24}
              className="h-6 w-6"
            />
          ) : null}
          <div className="text-[24px] font-semibold leading-8 text-slate-800">{title}</div>
        </div>
      ) : null}
    </>
  )
}

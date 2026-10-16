
"use client"

import { APPLICATION_ROUTES } from "@/lib/onboarding/application-routes"
import { applicationPath } from "@/lib/tenant/with-tenant"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import OnboardingLayout from "@/app/components/OnboardingLayout"
import OnboardingStepper from "@/app/components/OnboardingStepper"
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext"
import { brandingToCssVars } from "@/lib/tenant/tenant-branding"
import { useOnboardingConfigOptional } from "@/app/components/onboarding/OnboardingConfigProvider"
import { routeForApplicantStep } from "@/lib/onboarding/resolve-applicant-step-route"
import {
    firstSkippedRequiredCandidateStep,
    resolvePostStepContinueRoute,
} from "@/lib/onboarding/tenant-step-navigation"
import { useOnboardingStepNav } from "@/lib/onboarding/use-onboarding-step-nav"
import { readStepLifecyclePhase } from "@/lib/onboarding/workflow-phase"
import {
  persistStepProgress,
  useMarkStepInProgressIfPending,
} from "@/lib/onboarding/use-mark-step-in-progress-if-pending"

function isResolvedStatus(status: string | null | undefined): boolean {
    const norm = String(status ?? "").trim().toLowerCase()
    return (
        norm === "completed" ||
        norm === "skipped" ||
        norm === "approved" ||
        norm === "signed" ||
        norm === "complete"
    )
}

export default function SkillAssessmentIntro() {
    const branding = useTenantBranding()
    const router = useRouter()
    const nav = useOnboardingStepNav()
    const onboarding = useOnboardingConfigOptional()

    const skillStep =
      nav.currentStep ??
      nav.enabledSteps?.find(
        (s) => s.step_type === "skill_assessment" || s.step_key === "skill_assessment"
      ) ??
      null

    const postHireSkillStep = skillStep && readStepLifecyclePhase(skillStep) === "post_hire"
    const stepsResolved =
        (nav.enabledSteps?.length ?? 0) > 0 &&
        (nav.enabledSteps ?? []).every((step) => {
            const row = onboarding?.progress?.steps?.find(
                (item) => item.onboarding_step_id === step.id || item.step_key === step.step_key
            )
            return isResolvedStatus(row?.status)
        })

    useEffect(() => {
        if (nav.configLoading || !skillStep || !postHireSkillStep) return
        const phase = "post_hire" as const
        const remaining = firstSkippedRequiredCandidateStep(
            nav.enabledSteps ?? [],
            phase,
            onboarding?.progress
        )
        const href =
            stepsResolved && remaining
                ? routeForApplicantStep(remaining, nav.slug)
                : stepsResolved
                  ? resolvePostStepContinueRoute(onboarding?.config, skillStep, nav.slug, {
                        progress: onboarding?.progress,
                        savedStepId: skillStep.id,
                        savedStatus: "completed",
                    })
                  : routeForApplicantStep(skillStep, nav.slug)
        if (!href.includes(APPLICATION_ROUTES.skillsIntro)) {
            router.replace(href)
        }
    }, [
        nav.configLoading,
        nav.enabledSteps,
        nav.slug,
        onboarding?.config,
        onboarding?.progress,
        postHireSkillStep,
        router,
        skillStep,
        stepsResolved,
    ])

    useMarkStepInProgressIfPending({
      step: skillStep,
      disabled: nav.configLoading || Boolean(postHireSkillStep),
      updateStepStatus: onboarding?.updateStepStatus,
    })

    const skipSkillAssessment = async () => {
      if (onboarding?.config?.skillAssessmentSettings?.allowSkip === false) return
      if (skillStep?.step_key) {
        try {
          await persistStepProgress(onboarding?.updateStepStatus, skillStep.step_key, "skipped")
        } catch {
          /* continue even if progress sync fails */
        }
      }
      router.push(
        resolvePostStepContinueRoute(onboarding?.config, skillStep, nav.slug, {
          progress: onboarding?.progress,
          savedStepId: skillStep?.id,
          savedStatus: "skipped",
        })
      )
    }

    const proficiencyLevels = [
        {
            level: 1,
            label: "No Experience",
            description: "Theory or observation only during the past 12 months."
        },
        {
            level: 2,
            label: "Limited Experience",
            description:
                "Performed less than 12 times within the past 12 months and may need a review."
        },
        {
            level: 3,
            label: "Experienced",
            description:
                "Performed at least once per month within the past 12 months and may need minimal assistance."
        },
        {
            level: 4,
            label: "Highly Skilled",
            description:
                "Performed on at least a weekly basis over the past 12 months; proficient."
        }
    ]

    return (
        <OnboardingLayout
            cardClassName="min-[700px]:h-auto min-[700px]:min-h-[540px] min-[1200px]:min-h-[700px]"
            rightPanelImageClassName="opacity-60 object-top"
            rightPanelOverlayClassName="bg-white/65"
        >
            <div className="flex h-full flex-col px-4 pb-8 pt-6 sm:px-10 sm:pb-10 sm:pt-8" style={brandingToCssVars(branding)}>
                <OnboardingStepper />

                <div className="flex flex-1 flex-col pt-6 sm:pt-8">
                    {/* Header */}
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <h2 className="min-w-0 text-lg font-semibold leading-7 text-slate-800 sm:text-[24px] sm:leading-8">
                            Skill Assessment Quiz
                        </h2>
                        {onboarding?.config?.skillAssessmentSettings?.allowSkip === false ? null : (
                        <button
                            type="button"
                            onClick={() => void skipSkillAssessment()}
                            className="shrink-0 cursor-pointer text-[12px] font-medium leading-5 text-[color:var(--brand-primary)]"
                        >
                            Skip for Now →
                        </button>
                        )}
                    </div>

                    {/* Description */}
                    <p className="mb-6 text-xs font-normal leading-5 text-slate-600 max-[399px]:text-xs sm:mb-8 sm:text-[13px]">
                        This checklist is meant to serve as a general guideline for our client
                        facilities as to the level of your skills within your nursing specialty.
                        Please use the scale below to describe your experience/expertise in each
                        area listed below.
                    </p>

                    {/* Proficiency Scale */}
                    <p className="mb-3 text-[13px] font-semibold text-slate-800 sm:mb-4">
                        Proficiency Scale:
                    </p>

                    <div className="flex flex-col divide-y divide-slate-200 border-t border-slate-200">
                        {proficiencyLevels.map(({ level, label, description }) => (
                            <div key={level} className="py-4">
                                {/* Mobile: stacked label + description */}
                                <div className="flex flex-col gap-1.5 text-[12px] min-[400px]:hidden">
                                    <div className="flex items-baseline gap-2">
                                        <span className="w-3 font-bold text-slate-800">{level}</span>
                                        <span className="text-slate-500">=</span>
                                        <span className="font-semibold text-[color:var(--brand-primary)]">
                                            {label}
                                        </span>
                                    </div>
                                    <p className="leading-5 text-slate-600">{description}</p>
                                </div>

                                {/* Desktop / tablet: original aligned row */}
                                <div className="hidden min-[400px]:flex min-[400px]:items-start min-[400px]:gap-3 min-[400px]:text-[13px]">
                                    <span className="w-3 shrink-0 pt-0.5 font-bold text-slate-800">
                                        {level}
                                    </span>
                                    <span className="shrink-0 pt-0.5 text-slate-500">=</span>
                                    <span className="w-40 shrink-0 pt-0.5 font-semibold text-[color:var(--brand-primary)]">
                                        {label}
                                    </span>
                                    <span className="leading-5 text-slate-600">{description}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Buttons */}
                    <div className="mt-auto grid grid-cols-2 gap-2 pt-6 max-[399px]:gap-2 sm:flex sm:items-center sm:justify-end sm:gap-3 sm:pt-8">
                        <button
                            type="button"
                            onClick={() => (nav.prevRoute ? nav.goPrev() : router.back())}
                            className="w-full cursor-pointer rounded-md border border-slate-300 px-3 py-2.5 text-[11px] font-medium leading-5 text-slate-600 transition hover:bg-slate-50 max-[399px]:px-3 max-[399px]:text-[11px] sm:w-auto sm:px-5 sm:py-2 sm:text-[12px]"
                        >
                            Back
                        </button>
                        <button
                            type="button"
                            onClick={() => router.push(applicationPath(APPLICATION_ROUTES.skillAssessment))}
                            className="w-full cursor-pointer rounded-md bg-[color:var(--brand-primary)] px-3 py-2.5 text-[11px] font-medium leading-5 text-white transition hover:brightness-90 max-[399px]:px-3 max-[399px]:text-[11px] sm:w-auto sm:px-6 sm:py-2 sm:text-[12px]"
                        >
                            Start Skill Assessment
                        </button>
                    </div>
                </div>
            </div>
        </OnboardingLayout>
    )
}

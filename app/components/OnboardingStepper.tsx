"use client"

import Image from "next/image"
import { AlertCircle, Check, Lock, Minus } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { useOnboardingConfigOptional } from "@/app/components/onboarding/OnboardingConfigProvider"
import { routeForApplicantStep } from "@/lib/onboarding/resolve-applicant-step-route"
import {
  deriveStepIndicatorState,
  furthestProgressStepIndex,
  isStepIndicatorAccessible,
  type StepIndicatorState,
} from "@/lib/onboarding/step-indicator-status"
import { buildProgressStatusMaps, findProgressRowForStep } from "@/lib/onboarding/compute-max-allowed-from-progress"
import {
  resolveApplicantEnabledSteps,
  stepIndexFromPathname,
} from "@/lib/onboarding/tenant-step-navigation"
import { useOnboardingTenant } from "@/lib/tenant/use-onboarding-tenant"
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext"
import { brandingToCssVars } from "@/lib/tenant/tenant-branding"
import { formatApplicantStepperLabel } from "@/lib/onboarding/format-applicant-stepper-label"
import { applicantPortalCopy, readStepLifecyclePhase } from "@/lib/onboarding/workflow-phase"
import {
  formatPhaseProgressShort,
  groupTenantStepsByPhase,
  lifecyclePhaseLabel,
  POST_HIRE_LOCKED_MESSAGE,
  WAITING_ON_INTERNAL_MESSAGE,
  type EmploymentLifecyclePhase,
} from "@/lib/onboarding/workflow-phase-groups"
import {
  candidatePostHireScreenKind,
  effectivePostHireProgressStatus,
} from "@/lib/onboarding/post-hire-step-screens"
import ApplicantPhaseWelcome from "@/app/components/onboarding/ApplicantPhaseWelcome"

interface Props {
  /** Optional override; otherwise derived from pathname + tenant steps. */
  currentStep?: number
  completedThrough?: number
  title?: string
  titleIconSrc?: string
  titleIconAlt?: string
}

function StepIcon({ state }: { state: StepIndicatorState }) {
  if (state === "completed") {
    return <Check size={14} strokeWidth={3} />
  }
  if (state === "skipped") {
    return <Minus size={14} strokeWidth={3} />
  }
  if (state === "required_missing") {
    return <AlertCircle size={14} strokeWidth={2.5} />
  }
  if (state === "current") {
    return <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--brand-primary)]" />
  }
  return <span className="h-2.5 w-2.5 rounded-full bg-[#e2e8f0]" />
}

function stepCircleClass(state: StepIndicatorState): string {
  const base =
    "relative z-10 flex h-[26px] w-[26px] items-center justify-center rounded-full text-sm font-semibold transition-colors"

  switch (state) {
    case "completed":
      return `${base} bg-[color:var(--brand-primary)] text-white`
    case "skipped":
      return `${base} border-2 border-dashed border-slate-400 bg-slate-100 text-slate-500`
    case "required_missing":
      return `${base} border-[3px] border-amber-500 bg-amber-50 text-amber-600`
    case "current":
      return `${base} bg-white border-[3px] border-[color:var(--brand-primary)]`
    case "incomplete":
      return `${base} bg-white border-[3px] border-amber-300 text-amber-600`
    default:
      return `${base} bg-white border-[3px] border-[#f1f5f9] text-[#e2e8f0]`
  }
}

function ConnectorSegment({ filled }: { filled: boolean }) {
  return (
    <div
      className="pointer-events-none absolute top-[calc(0.25rem+12px)] z-0 h-[2px] w-[calc(100%+26px)]"
      style={{ left: "calc(50% - 13px)" }}
      aria-hidden
    >
      <div className="absolute inset-0 bg-[#f1f5f9]" />
      <div
        className="absolute inset-y-0 left-0 bg-[color:var(--brand-primary)] transition-all duration-300"
        style={{ width: filled ? "100%" : "0%" }}
      />
    </div>
  )
}

function stepLabelClass(state: StepIndicatorState): string {
  if (state === "completed" || state === "current") {
    return "text-[color:var(--brand-primary)] font-medium"
  }
  if (state === "skipped") {
    return "text-slate-500 font-medium"
  }
  if (state === "required_missing" || state === "incomplete") {
    return "text-amber-700 font-medium"
  }
  return "text-gray-400"
}

export default function OnboardingStepper({
  currentStep: currentStepOverride,
  title,
  titleIconSrc,
  titleIconAlt,
}: Props) {
  const branding = useTenantBranding()
  const stepperScrollRef = useRef<HTMLDivElement>(null)
  const { slug, push } = useOnboardingTenant()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const onboarding = useOnboardingConfigOptional()

  const enabledSteps = useMemo(
    () => resolveApplicantEnabledSteps(onboarding?.config, onboarding?.loading ?? true),
    [onboarding?.config, onboarding?.loading]
  )

  const stepRoutes = useMemo(
    () => (enabledSteps ?? []).map((s) => routeForApplicantStep(s, slug)),
    [enabledSteps, slug]
  )

  const currentStep = useMemo(() => {
    if (currentStepOverride != null) return currentStepOverride
    if (!enabledSteps?.length) return 1
    return stepIndexFromPathname(pathname || "", enabledSteps, search)
  }, [currentStepOverride, pathname, enabledSteps, search])

  const maxAllowedStep = onboarding?.maxAllowedStepIndex ?? currentStep

  const statusByStepId = useMemo(
    () => buildProgressStatusMaps(enabledSteps ?? [], onboarding?.progress ?? null),
    [enabledSteps, onboarding?.progress]
  )

  const stepStates = useMemo(() => {
    if (!enabledSteps?.length) return [] as StepIndicatorState[]
    return enabledSteps.map((configStep, index) => {
      const rawStatus = statusByStepId.get(configStep.id) ?? "pending"
      const kind = candidatePostHireScreenKind(configStep)
      const savedRow = findProgressRowForStep(onboarding?.progress?.steps, configStep)
      const dbStatus = kind
        ? effectivePostHireProgressStatus(kind, rawStatus, savedRow?.data)
        : rawStatus
      return deriveStepIndicatorState({
        dbStatus,
        stepNumber: index + 1,
        currentStepNumber: currentStep,
        isRequired: configStep.is_required !== false,
      })
    })
  }, [enabledSteps, statusByStepId, onboarding?.progress?.steps, currentStep])

  const livePhase: EmploymentLifecyclePhase =
    onboarding?.workflowPhase === "post_hire" || onboarding?.workflowPhase === "completed"
      ? "post_hire"
      : "pre_hire"
  const [previewPhase, setPreviewPhase] = useState<EmploymentLifecyclePhase>("pre_hire")

  useEffect(() => {
    const root = stepperScrollRef.current
    if (!root) return
    const current = root.querySelector<HTMLElement>("[data-step-state='current']")
    current?.scrollIntoView({ inline: "center", block: "nearest" })
  }, [currentStep, enabledSteps])

  if (!enabledSteps?.length) {
    return onboarding?.loading ? (
      <div className="h-16 w-full animate-pulse rounded-lg bg-slate-100" />
    ) : (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm text-slate-600">
        No onboarding steps are configured for this workflow.
      </div>
    )
  }

  const furthestStep = furthestProgressStepIndex(stepStates, currentStep)
  const grouped = groupTenantStepsByPhase(enabledSteps)
  const hasBothPhases = grouped.preHire.length > 0 && grouped.postHire.length > 0
  const isDraftPreview = onboarding?.isDraftPreview === true
  const selectedPhase = isDraftPreview && hasBothPhases ? previewPhase : livePhase
  const displaySteps =
    isDraftPreview && hasBothPhases
      ? selectedPhase === "post_hire"
        ? grouped.postHire
        : grouped.preHire
      : enabledSteps
  const phaseCopy = applicantPortalCopy(selectedPhase)
  const heading = title ?? phaseCopy.header
  const completedCount = displaySteps.filter((step) => {
    const rawStatus = statusByStepId.get(step.id) ?? "pending"
    const kind = candidatePostHireScreenKind(step)
    const savedRow = findProgressRowForStep(onboarding?.progress?.steps, step)
    const status = kind
      ? effectivePostHireProgressStatus(kind, rawStatus, savedRow?.data)
      : rawStatus
    return status === "completed" || status === "skipped"
  }).length
  const progressLabel = formatPhaseProgressShort(
    completedCount,
    displaySteps.length,
    selectedPhase
  )

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
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {phaseCopy.progressLabel}
            </p>
            <h1 className="text-lg font-semibold text-slate-800 sm:text-xl">{heading}</h1>
          </div>
          <p className="text-sm font-medium text-slate-600" data-testid="onboarding-phase-progress">
            {progressLabel}
          </p>
        </div>
        {hasBothPhases ? (
          <div
            className="mb-3 grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-0.5"
            role="tablist"
            aria-label="Workflow phase"
          >
            {(["pre_hire", "post_hire"] as const).map((value) => {
              const count = value === "post_hire" ? grouped.postHire.length : grouped.preHire.length
              const selected = selectedPhase === value
              const locked = value === "post_hire" && !isDraftPreview && livePhase !== "post_hire"
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  disabled={locked}
                  title={locked ? POST_HIRE_LOCKED_MESSAGE : undefined}
                  onClick={() => {
                    if (locked) return
                    if (isDraftPreview) setPreviewPhase(value)
                  }}
                  className={`inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold ${
                    selected ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  } ${locked ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  {value === "post_hire" ? <Lock className="h-3 w-3" aria-hidden /> : null}
                  {lifecyclePhaseLabel(value)}
                  <span className="font-medium text-slate-400">({count})</span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="mb-3 text-xs font-medium text-slate-500">
            {lifecyclePhaseLabel(selectedPhase)} workflow
          </p>
        )}
        {isDraftPreview && selectedPhase === "post_hire" ? (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {POST_HIRE_LOCKED_MESSAGE}
          </p>
        ) : null}
        <div className="relative mx-auto mt-2 min-w-0 w-full">
          <div
            ref={stepperScrollRef}
            className="min-w-0 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin] sm:[&::-webkit-scrollbar]:block [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent max-sm:scrollbar-hide"
            role="region"
            aria-label={phaseCopy.progressLabel}
            tabIndex={0}
          >
            <div className="flex w-max min-w-full">
            {displaySteps.map((configStep, index) => {
              const globalIndex = enabledSteps.findIndex((s) => s.id === configStep.id)
              const stepNumber = globalIndex + 1
              const state = stepStates[globalIndex] ?? "not_started"
              const isClickable = isStepIndicatorAccessible(state, stepNumber, maxAllowedStep)
              const connectorFilled = furthestStep > stepNumber
              const step = formatApplicantStepperLabel(configStep.title)

              return (
                <div
                  key={`${configStep.id}-${step}`}
                  data-step-state={state}
                  data-step-key={configStep.step_key}
                  className="relative flex flex-[1_0_6.5rem] flex-col items-center max-[399px]:flex-[1_0_5.5rem]"
                >
                  {index < displaySteps.length - 1 ? (
                    <ConnectorSegment filled={connectorFilled} />
                  ) : null}

                  <button
                    type="button"
                    onClick={() => {
                      if (!isClickable) return
                      push(stepRoutes[globalIndex])
                    }}
                    disabled={!isClickable}
                    className={`group relative z-10 flex w-full flex-col items-center rounded-lg px-1.5 py-1 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]/40 max-[399px]:px-1 ${
                      isClickable ? "cursor-pointer" : "cursor-not-allowed"
                    }`}
                    aria-label={`${isClickable ? "Go to" : "Locked"} ${configStep.title}${
                      state === "skipped" ? " (skipped)" : state === "required_missing" ? " (required)" : ""
                    }`}
                    title={`${isClickable ? "Go to" : "Locked"} ${configStep.title}`}
                  >
                    <div className={stepCircleClass(state)}>
                      <StepIcon state={state} />
                    </div>

                    <span
                      className={`mt-2.5 whitespace-pre-line text-[11px] leading-tight max-[399px]:mt-2 max-[399px]:text-[10px] sm:mt-3 sm:text-[12px] ${stepLabelClass(state)} ${
                        isClickable ? "group-hover:text-[color:var(--brand-primary)] group-hover:underline" : ""
                      }`}
                    >
                      {step}
                    </span>
                    <span className="mt-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600">
                      {lifecyclePhaseLabel(readStepLifecyclePhase(configStep))}
                    </span>
                  </button>
                </div>
              )
            })}
            </div>
          </div>
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

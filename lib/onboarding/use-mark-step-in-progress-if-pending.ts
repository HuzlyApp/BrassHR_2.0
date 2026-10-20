"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { useOnboardingConfigOptional } from "@/app/components/onboarding/OnboardingConfigProvider";
import type { OnboardingStepStatus, TenantOnboardingStep } from "@/lib/onboarding/types";

type UpdateStepStatusFn = (
  stepKey: string,
  status: OnboardingStepStatus,
  data?: Record<string, unknown>,
  stepId?: string
) => Promise<void>;

type UseMarkStepInProgressIfPendingOptions = {
  step: Pick<TenantOnboardingStep, "id" | "step_key"> | null | undefined;
  /** When true, skip marking (preview mode, redirecting, etc.). */
  disabled?: boolean;
  updateStepStatus?: UpdateStepStatusFn;
  /** When set, in_progress is suppressed while a completion/skip is in flight. */
  completingRef?: MutableRefObject<boolean>;
};

/**
 * Marks a workflow step `in_progress` once when the applicant lands on its screen.
 * Never downgrades completed/skipped steps and skips if already in_progress.
 */
export function useMarkStepInProgressIfPending({
  step,
  disabled = false,
  updateStepStatus,
  completingRef,
}: UseMarkStepInProgressIfPendingOptions): void {
  const onboarding = useOnboardingConfigOptional();
  const mark = updateStepStatus ?? onboarding?.updateStepStatus;
  const loading = onboarding?.loading ?? false;
  const progressSteps = onboarding?.progress?.steps;
  const attemptedStepIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (disabled || loading || completingRef?.current) return;
    if (!step?.step_key || !step.id || !mark) return;
    // The server ignores the mark for steps still locked, so re-trying on every progress update would loop.
    if (attemptedStepIdRef.current === step.id) return;

    const currentStatus = progressSteps?.find(
      (row) => row.onboarding_step_id === step.id
    )?.status;

    if (
      currentStatus === "completed" ||
      currentStatus === "skipped" ||
      currentStatus === "in_progress"
    ) {
      return;
    }

    attemptedStepIdRef.current = step.id;
    void mark(step.step_key, "in_progress", undefined, step.id).catch(() => {
      // Mount-time mark must not surface as an unhandledRejection.
    });
  }, [disabled, loading, step?.step_key, step?.id, progressSteps, mark, completingRef]);
}

/** Wraps updateStepStatus so mount effects cannot race with completion. */
export async function persistStepProgress(
  updateStepStatus: UpdateStepStatusFn | undefined,
  stepKey: string | undefined,
  status: OnboardingStepStatus,
  completingRef?: MutableRefObject<boolean>,
  data?: Record<string, unknown>,
  stepId?: string
): Promise<boolean> {
  if (!stepKey || !updateStepStatus) return false;
  if (completingRef) completingRef.current = true;
  try {
    await updateStepStatus(stepKey, status, data, stepId);
    return true;
  } finally {
    if (completingRef) completingRef.current = false;
  }
}

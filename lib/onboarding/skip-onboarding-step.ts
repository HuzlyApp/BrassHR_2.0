"use client";

import type { MutableRefObject } from "react";
import type { OnboardingStepStatus, TenantOnboardingStep } from "@/lib/onboarding/types";
import { persistStepProgress } from "@/lib/onboarding/use-mark-step-in-progress-if-pending";

type UpdateStepStatusFn = (
  stepKey: string,
  status: OnboardingStepStatus,
  data?: Record<string, unknown>,
  stepId?: string
) => Promise<void>;

/**
 * Persist `skipped` for a workflow step, then navigate forward.
 * Does not mark the step completed or run field validation.
 */
export async function skipOnboardingStep(options: {
  step: Pick<TenantOnboardingStep, "id" | "step_key"> | null | undefined;
  updateStepStatus?: UpdateStepStatusFn;
  completingRef?: MutableRefObject<boolean>;
  onNavigate: () => void;
}): Promise<void> {
  const { step, updateStepStatus, completingRef, onNavigate } = options;
  if (step?.step_key && updateStepStatus) {
    try {
      await persistStepProgress(
        updateStepStatus,
        step.step_key,
        "skipped",
        completingRef,
        undefined,
        step.id
      );
    } catch {
      /* continue navigation even if progress sync fails */
    }
  }
  onNavigate();
}

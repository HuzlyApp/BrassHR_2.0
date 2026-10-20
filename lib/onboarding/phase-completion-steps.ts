import type { TenantOnboardingStep } from "@/lib/onboarding/types";
import { readWorkflowLibraryStepId } from "@/lib/onboarding/workflow-settings";

/** Offer & Agreement library step. Opens the existing Pre-Hire completion screen. */
export const PRE_HIRE_COMPLETION_STEP_ID = "pre-hire-completion-milestone";

/** Welcome & Complete library step. Opens the existing Post-Hire completion screen. */
export const POST_HIRE_COMPLETION_STEP_ID = "post-hire-completion-milestone";

const COMPLETION_STEP_IDS = new Set([PRE_HIRE_COMPLETION_STEP_ID, POST_HIRE_COMPLETION_STEP_ID]);

export function phaseCompletionLibraryPhase(
  step: Pick<TenantOnboardingStep, "metadata"> | null | undefined
): "pre_hire" | "post_hire" | null {
  const id = readWorkflowLibraryStepId(step as TenantOnboardingStep);
  if (id === PRE_HIRE_COMPLETION_STEP_ID) return "pre_hire";
  if (id === POST_HIRE_COMPLETION_STEP_ID) return "post_hire";
  return null;
}

/** The celebration screen itself is not one of the steps the candidate has to finish first. */
export function isPhaseCompletionMilestoneStep(
  step: Pick<TenantOnboardingStep, "metadata"> | null | undefined
): boolean {
  return COMPLETION_STEP_IDS.has(readWorkflowLibraryStepId(step as TenantOnboardingStep));
}

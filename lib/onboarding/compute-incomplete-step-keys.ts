import { isTenantStepBlocking } from "@/lib/onboarding/reference-verification";
import type { TenantOnboardingStep, StepProgressRow } from "@/lib/onboarding/types";

/** Step keys that were not completed or skipped at submission time. */
export function computeIncompleteStepKeys(
  enabledSteps: TenantOnboardingStep[],
  stepProgress: StepProgressRow[]
): string[] {
  const statusByStepId = new Map(
    stepProgress.map((row) => [row.onboarding_step_id, row.status])
  );

  const incomplete: string[] = [];
  for (const step of enabledSteps) {
    if (!step.is_enabled || step.step_type === "review_submit") continue;
    if (!isTenantStepBlocking(step)) continue;
    const status = statusByStepId.get(step.id) ?? "pending";
    if (status !== "completed" && status !== "skipped") {
      incomplete.push(step.step_key);
    }
  }
  return incomplete;
}

export function stepTitlesForKeys(
  enabledSteps: TenantOnboardingStep[],
  stepKeys: string[]
): string[] {
  const byKey = new Map(enabledSteps.map((s) => [s.step_key, s.title]));
  return stepKeys.map((key) => byKey.get(key)?.trim() || key);
}

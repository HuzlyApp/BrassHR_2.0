import {
  hireLifecycleForPhase,
  hireStageFitsLifecycle,
  hireStageForStepKey,
  hireStageLifecycle,
} from "@/lib/onboarding/hire-stage-catalog";

export const ALIEN_STAGE_WARNING = "This task does not belong in this stage.";

const FLEXIBLE_STEP_IDS = new Set(["custom-step"]);

/**
 * Whether a library step may sit on the given Pre-Hire / Post-Hire phase.
 * Unknown and custom steps are allowed; catalog steps that only map to the
 * other board are alien.
 */
export function workflowStepBelongsToPhase(
  stepId: string | null | undefined,
  phase: unknown
): boolean {
  const id = String(stepId ?? "").trim();
  if (!id || FLEXIBLE_STEP_IDS.has(id)) return true;

  const lifecycle = hireLifecycleForPhase(phase);
  if (!lifecycle) return true;

  if (hireStageForStepKey(id, lifecycle)) return true;

  const naturalStage = hireStageForStepKey(id);
  if (!naturalStage) return true;

  const naturalLifecycle = hireStageLifecycle(naturalStage);
  if (!naturalLifecycle) return true;

  return naturalLifecycle === lifecycle;
}

/** True when the step or its stamped stageName conflicts with the step's phase. */
export function isAlienWorkflowStep(input: {
  stepId: string | null | undefined;
  phase: unknown;
  stageName?: unknown;
}): boolean {
  if (!workflowStepBelongsToPhase(input.stepId, input.phase)) return true;

  const lifecycle = hireLifecycleForPhase(input.phase);
  if (!lifecycle) return false;

  const stageName =
    typeof input.stageName === "string" ? input.stageName.trim() : "";
  if (stageName && !hireStageFitsLifecycle(stageName, lifecycle)) return true;

  return false;
}

export function alienStageWarningForStep(input: {
  stepId: string | null | undefined;
  phase: unknown;
  stageName?: unknown;
}): string | null {
  return isAlienWorkflowStep(input) ? ALIEN_STAGE_WARNING : null;
}

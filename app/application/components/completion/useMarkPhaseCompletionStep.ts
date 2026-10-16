"use client";

import { useEffect, useRef } from "react";
import { useOnboardingConfigOptional } from "@/app/components/onboarding/OnboardingConfigProvider";
import { phaseCompletionLibraryPhase } from "@/lib/onboarding/phase-completion-steps";
import { evaluateWorkflowCompletion } from "@/lib/onboarding/workflow-completion-check";

/** Marks the phase celebration step complete once every other step in that phase is done. */
export function useMarkPhaseCompletionStep(phase: "pre_hire" | "post_hire") {
  const onboarding = useOnboardingConfigOptional();
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !onboarding?.updateStepStatus) return;
    const steps = onboarding.allWorkflowSteps ?? onboarding.config?.steps ?? [];
    const milestone = steps.find((step) => phaseCompletionLibraryPhase(step) === phase);
    if (!milestone) return;

    const alreadyDone = (onboarding.progress?.steps ?? []).some(
      (row) =>
        (row.onboarding_step_id === milestone.id || row.step_key === milestone.step_key) &&
        row.status === "completed"
    );
    if (alreadyDone) {
      started.current = true;
      return;
    }

    const result = evaluateWorkflowCompletion({
      allSteps: steps,
      progress: onboarding.progress ?? null,
    });
    const phaseDone = phase === "pre_hire" ? result.preHire.isComplete : result.postHire.isComplete;
    if (!phaseDone) return;

    started.current = true;
    void onboarding
      .updateStepStatus(milestone.step_key, "completed", { phase_completion: true }, milestone.id)
      .catch(() => {
        started.current = false;
      });
  }, [onboarding, phase]);
}

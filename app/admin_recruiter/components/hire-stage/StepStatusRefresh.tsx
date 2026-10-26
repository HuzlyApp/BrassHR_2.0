"use client";

import { useState } from "react";
import type { CandidateWorkflowStepView } from "@/lib/onboarding/candidate-workflow-phase-view";
import { HireFigmaIcon, PRE_HIRE_UI_ICONS } from "./hire-figma-assets";

/** Keeps the spin visible even when the refresh returns instantly. */
const MIN_REFRESH_SPIN_MS = 600;

/** `size` should match the completed check icon shown in the same spot. */
export function PendingStepIcon({ step, size = 22 }: { step: CandidateWorkflowStepView; size?: number }) {
  return (
    <HireFigmaIcon
      src={step.displayStatus === "under_review" ? PRE_HIRE_UI_ICONS.pendingClock : PRE_HIRE_UI_ICONS.inProgressClock}
      width={size}
      height={size}
    />
  );
}

/** One refresh at a time; `refreshingId` is the step whose icon is spinning. */
export function useStepStatusRefresh(onRefresh?: () => void | Promise<void>) {
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  async function refreshStep(stepId: string) {
    if (!onRefresh || refreshingId) return;
    setRefreshingId(stepId);
    try {
      await Promise.all([
        onRefresh(),
        new Promise((resolve) => setTimeout(resolve, MIN_REFRESH_SPIN_MS)),
      ]);
    } finally {
      setRefreshingId(null);
    }
  }

  return { refreshingId, refreshStep };
}

/** Pending-step icon that reloads the journey when clicked (falls back to the plain icon). */
export function StepRefreshButton({
  step,
  refreshingId,
  onRefreshStep,
  size,
}: {
  step: CandidateWorkflowStepView;
  refreshingId: string | null;
  onRefreshStep?: (stepId: string) => void;
  size?: number;
}) {
  if (!onRefreshStep) return <PendingStepIcon step={step} size={size} />;
  return (
    <button
      type="button"
      onClick={() => onRefreshStep(step.id)}
      disabled={refreshingId != null}
      title="Refresh status"
      aria-label={`Refresh ${step.title} status`}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full transition hover:bg-slate-100 disabled:cursor-wait"
    >
      <span className={`inline-flex ${refreshingId === step.id ? "animate-spin" : ""}`}>
        <PendingStepIcon step={step} size={size} />
      </span>
    </button>
  );
}

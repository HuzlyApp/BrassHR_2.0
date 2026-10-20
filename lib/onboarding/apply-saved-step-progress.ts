import type {
  OnboardingStepStatus,
  WorkerOnboardingProgressPayload,
} from "@/lib/onboarding/types";

const STATUS_RANK: Record<OnboardingStepStatus, number> = {
  pending: 0,
  in_progress: 1,
  failed: 2,
  skipped: 3,
  completed: 4,
};

/**
 * Keeps the step the candidate just saved when a progress payload was read
 * before that write (or an older in-progress response arrives later).
 * A later draft must not clear a completion that is already on the payload.
 */
export function applySavedStepToProgress(
  progress: WorkerOnboardingProgressPayload,
  saved: {
    stepId: string;
    stepKey?: string | null;
    status: OnboardingStepStatus;
    data?: Record<string, unknown>;
    completedAt?: string | null;
  }
): WorkerOnboardingProgressPayload {
  const stepId = saved.stepId.trim();
  if (!stepId) return progress;

  const rows = progress.steps.map((row) => ({ ...row, data: { ...(row.data ?? {}) } }));
  const index = rows.findIndex((row) => row.onboarding_step_id === stepId);
  const previous = index >= 0 ? rows[index] : null;
  const previousRank = STATUS_RANK[previous?.status ?? "pending"] ?? 0;
  const savedRank = STATUS_RANK[saved.status] ?? 0;
  const status = savedRank >= previousRank ? saved.status : (previous?.status ?? saved.status);
  const data = {
    ...(previous?.data ?? {}),
    ...(saved.data ?? {}),
  };
  const completedAt =
    status === "completed" || status === "skipped"
      ? previous?.completed_at || saved.completedAt || new Date().toISOString()
      : null;
  const next = {
    onboarding_step_id: stepId,
    step_key: previous?.step_key ?? saved.stepKey ?? null,
    status,
    completed_at: completedAt,
    data,
  };
  if (index >= 0) rows[index] = next;
  else rows.push(next);
  return { ...progress, steps: rows };
}

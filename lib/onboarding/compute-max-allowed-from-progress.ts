import { isUploadResumeStep } from "@/lib/onboarding/enforce-upload-resume-first";
import { applicantStepHasNavigableScreen } from "@/lib/onboarding/applicant-step-navigability";
import { readStepTemplatePhase } from "@/lib/onboarding/workflow-phase";
import { isTenantStepBlocking } from "@/lib/onboarding/reference-verification";
import { isUuid } from "@/lib/validation/uuid";
import type {
  OnboardingStepStatus,
  StepProgressRow,
  TenantOnboardingStep,
  WorkerOnboardingProgressPayload,
} from "@/lib/onboarding/types";

type StepPhase = "pre_hire" | "transition" | "post_hire";

const PROGRESS_STATUS_RANK: Record<OnboardingStepStatus, number> = {
  pending: 0,
  in_progress: 1,
  failed: 2,
  skipped: 3,
  completed: 4,
};

function readStepPhase(step: TenantOnboardingStep): StepPhase {
  return readStepTemplatePhase(step);
}

function isPostHireUnlocked(progress: WorkerOnboardingProgressPayload | null): boolean {
  return progress?.workflowPhase === "post_hire" || progress?.workflowPhase === "completed";
}

function preferStatus(
  current: string | undefined,
  next: string
): string {
  const currentRank = PROGRESS_STATUS_RANK[(current as OnboardingStepStatus) ?? "pending"] ?? 0;
  const nextRank = PROGRESS_STATUS_RANK[next as OnboardingStepStatus] ?? 0;
  return nextRank >= currentRank ? next : (current ?? "pending");
}

/** Progress row for a configured step. Placeholder ids may match a published row by step_key. */
export function findProgressRowForStep(
  steps: StepProgressRow[] | null | undefined,
  step: { id: string; step_key?: string | null }
): StepProgressRow | null {
  const rows = steps ?? [];
  const byId = rows.find((row) => row.onboarding_step_id === step.id);
  if (byId) return byId;
  if (isUuid(step.id)) return null;
  const key = step.step_key?.trim();
  if (!key) return null;
  return rows.find((row) => row.step_key === key) ?? null;
}

/**
 * Map each enabled config step id → DB progress status.
 * Matches by step id first, then step_key (including progress.step_key) so job-workflow
 * preview ids still resolve to published tenant progress rows.
 */
export function buildProgressStatusMaps(
  enabledSteps: TenantOnboardingStep[],
  progress: WorkerOnboardingProgressPayload | null
): Map<string, string> {
  const byStepId = new Map<string, string>();
  const byStepKey = new Map<string, string>();

  for (const row of progress?.steps ?? []) {
    const status = String(row.status ?? "pending");
    byStepId.set(row.onboarding_step_id, preferStatus(byStepId.get(row.onboarding_step_id), status));

    const matched = enabledSteps.find((s) => s.id === row.onboarding_step_id);
    const key = matched?.step_key || row.step_key?.trim() || "";
    if (key) {
      byStepKey.set(key, preferStatus(byStepKey.get(key), status));
      const baseKey = key.replace(/_\d+$/, "");
      if (baseKey !== key) {
        byStepKey.set(baseKey, preferStatus(byStepKey.get(baseKey), status));
      }
    }
  }

  return new Map(
    enabledSteps.map((step) => {
      // Published steps own their progress row by id (republish keeps ids stable). Keys are
      // shared by unrelated steps across flows, so only placeholder ids may resolve through them.
      if (isUuid(step.id)) {
        return [step.id, byStepId.get(step.id) ?? "pending"] as const;
      }
      const baseKey = step.step_key.replace(/_\d+$/, "");
      const status =
        byStepId.get(step.id) ??
        byStepKey.get(step.step_key) ??
        (baseKey !== step.step_key ? byStepKey.get(baseKey) : undefined) ??
        "pending";
      return [step.id, status] as const;
    })
  );
}

/**
 * Highest 1-based step index the applicant may access based on saved DB progress only.
 * Matches progress by step id first, then step_key for resilience across config republishes.
 */
export function computeMaxAllowedStepIndexFromProgress(
  enabledSteps: TenantOnboardingStep[],
  progress: WorkerOnboardingProgressPayload | null
): number {
  if (!enabledSteps.length) return 1;

  const statusByStepId = buildProgressStatusMaps(enabledSteps, progress);
  const postHireUnlocked = isPostHireUnlocked(progress);

  let max = 1;

  if (progress?.steps?.length) {
    for (let i = 0; i < enabledSteps.length; i++) {
      const phase = readStepPhase(enabledSteps[i]!);
      if (phase === "post_hire" && !postHireUnlocked) {
        max = Math.max(max, i);
        break;
      }
      const st = statusByStepId.get(enabledSteps[i]!.id);
      if (st === "completed" || st === "skipped") {
        if (st === "skipped" && isUploadResumeStep(enabledSteps[i]!)) {
          max = Math.max(max, i + 1);
          break;
        }
        max = Math.max(max, i + 2);
      } else if (st === "in_progress") {
        max = Math.max(max, i + 1);
        break;
      } else if (!isTenantStepBlocking(enabledSteps[i]!)) {
        max = Math.max(max, i + 2);
      } else if (!applicantStepHasNavigableScreen(enabledSteps[i]!, enabledSteps)) {
        max = Math.max(max, i + 2);
      } else {
        max = Math.max(max, i + 1);
        break;
      }
    }

    // Allow any step already started (e.g. authorizations in_progress while an optional prior step was skipped in UI).
    for (let i = 0; i < enabledSteps.length; i++) {
      const st = statusByStepId.get(enabledSteps[i]!.id);
      if (st === "in_progress" || st === "completed" || st === "skipped") {
        max = Math.max(max, i + 1);
      }
    }
  }

  return Math.min(max, enabledSteps.length);
}

export function resolveNextIncompleteStepIndex(
  enabledSteps: TenantOnboardingStep[],
  progress: WorkerOnboardingProgressPayload | null
): number {
  if (!enabledSteps.length) return 1;

  const statusByStepId = buildProgressStatusMaps(enabledSteps, progress);

  for (let i = 0; i < enabledSteps.length; i++) {
    const st = statusByStepId.get(enabledSteps[i]!.id) ?? "pending";
    if (st !== "completed" && st !== "skipped") {
      if (!applicantStepHasNavigableScreen(enabledSteps[i]!, enabledSteps)) {
        continue;
      }
      return i + 1;
    }
  }

  return enabledSteps.length;
}

/** DB status for a configured step (by id, falling back to step_key). */
export function progressStatusForStep(
  enabledSteps: TenantOnboardingStep[],
  progress: WorkerOnboardingProgressPayload | null,
  step: TenantOnboardingStep
): string {
  return buildProgressStatusMaps(enabledSteps, progress).get(step.id) ?? "pending";
}

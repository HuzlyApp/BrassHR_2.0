import { applicantStepHasNavigableScreen } from "@/lib/onboarding/applicant-step-navigability";
import { isUploadResumeStep } from "@/lib/onboarding/enforce-upload-resume-first";
import {
  buildProgressStatusMaps,
  computeMaxAllowedStepIndexFromProgress,
} from "@/lib/onboarding/compute-max-allowed-from-progress";
import { isTenantStepBlocking } from "@/lib/onboarding/reference-verification";
import { isWorkerVisibleStep } from "@/lib/onboarding/workflow-settings";
import { isUuid } from "@/lib/validation/uuid";
import type {
  CandidateEngineOrderEntry,
  TenantOnboardingConfig,
  TenantOnboardingStep,
  WorkerOnboardingProgressPayload,
} from "@/lib/onboarding/types";

const INTERNAL_SETTINGS_KEYS = new Set([
  "notifyHrOnFail",
  "notify",
  "triggerAfter",
  "conditionalLogic",
]);

export type CandidateOnboardingFrontier = {
  maxAllowedStepIndex: number;
  waitingOnInternal: boolean;
};

export function enabledEngineSteps(steps: TenantOnboardingStep[]): TenantOnboardingStep[] {
  return steps
    .filter((step) => step.is_enabled)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function toCandidateEngineOrder(steps: TenantOnboardingStep[]): CandidateEngineOrderEntry[] {
  return enabledEngineSteps(steps).map((step) => ({
    id: step.id,
    step_key: step.step_key,
    sort_order: step.sort_order,
    required: isTenantStepBlocking(step),
    candidateVisible: isWorkerVisibleStep(step),
  }));
}

function sanitizeCandidateStep(step: TenantOnboardingStep): TenantOnboardingStep {
  const raw = step.metadata?.workflow_settings;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return step;
  }
  const nextSettings: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (INTERNAL_SETTINGS_KEYS.has(key)) continue;
    nextSettings[key] = value;
  }
  return {
    ...step,
    metadata: {
      ...step.metadata,
      workflow_settings: nextSettings,
    },
  };
}

/** Candidate-facing config: visible steps only, plus opaque engine order for gating. */
export function projectCandidateOnboardingConfig(
  config: TenantOnboardingConfig
): TenantOnboardingConfig {
  const engine = enabledEngineSteps(config.steps);
  const visible = engine.filter((step) => isWorkerVisibleStep(step)).map(sanitizeCandidateStep);
  const visibleIds = new Set(visible.map((step) => step.id));
  const engineOrder =
    config.candidateEngineOrder?.length &&
    config.candidateEngineOrder.length >= visible.length
      ? config.candidateEngineOrder
      : toCandidateEngineOrder(engine);

  return {
    ...config,
    steps: visible,
    requiredDocuments: config.requiredDocuments.filter((doc) =>
      visibleIds.has(doc.onboarding_step_id)
    ),
    skillAssessments: config.skillAssessments.filter((assessment) =>
      visibleIds.has(assessment.onboarding_step_id)
    ),
    candidateEngineOrder: engineOrder,
  };
}

function engineStatus(
  entry: CandidateEngineOrderEntry,
  statusByCandidateId: Map<string, string>,
  progress: WorkerOnboardingProgressPayload | null
): string {
  const fromVisible = statusByCandidateId.get(entry.id);
  if (fromVisible) return fromVisible;
  const rows = progress?.steps ?? [];
  const byId = rows.find((step) => step.onboarding_step_id === entry.id);
  if (byId || isUuid(entry.id)) return String(byId?.status ?? "pending");
  // Job workflows re-key steps, so a key can belong to an unrelated published step;
  // only placeholder ids fall back to matching by key.
  const byKey = entry.step_key ? rows.find((step) => step.step_key === entry.step_key) : undefined;
  return String(byKey?.status ?? "pending");
}

/**
 * Walk the full engine order so required internal steps can lock later candidate steps
 * without those internal steps appearing in the applicant UI.
 */
export function computeCandidateOnboardingFrontier(params: {
  engineOrder: CandidateEngineOrderEntry[] | null | undefined;
  candidateSteps: TenantOnboardingStep[];
  progress: WorkerOnboardingProgressPayload | null;
}): CandidateOnboardingFrontier {
  const { engineOrder, candidateSteps, progress } = params;
  if (!candidateSteps.length) {
    return { maxAllowedStepIndex: 1, waitingOnInternal: false };
  }

  if (!engineOrder?.length) {
    return {
      maxAllowedStepIndex: computeMaxAllowedStepIndexFromProgress(candidateSteps, progress),
      waitingOnInternal: false,
    };
  }

  const statusByCandidateId = buildProgressStatusMaps(candidateSteps, progress);
  const candidateIndexById = new Map(candidateSteps.map((step, index) => [step.id, index]));
  // Pre-hire recruiter gates still pause the candidate. Once post-hire has started,
  // recruiter-owned steps must not raise the review modal or block later candidate steps.
  const skipInternalWait =
    progress?.workflowPhase === "post_hire" || progress?.workflowPhase === "completed";

  let maxCandidate = 0;
  let waitingOnInternal = false;

  for (const entry of engineOrder) {
    const status = engineStatus(entry, statusByCandidateId, progress);
    const done = status === "completed" || status === "skipped";

    if (!entry.candidateVisible) {
      if (skipInternalWait || done || !entry.required) continue;
      waitingOnInternal = true;
      break;
    }

    const candidateIndex = candidateIndexById.get(entry.id);
    if (candidateIndex == null) continue;
    const step = candidateSteps[candidateIndex]!;

    if (done) {
      if (status === "skipped" && isUploadResumeStep(step)) {
        maxCandidate = Math.max(maxCandidate, candidateIndex + 1);
        break;
      }
      maxCandidate = Math.max(maxCandidate, candidateIndex + 1);
      continue;
    }

    if (status === "in_progress") {
      maxCandidate = Math.max(maxCandidate, candidateIndex + 1);
      break;
    }

    if (!entry.required || !applicantStepHasNavigableScreen(step, candidateSteps)) {
      maxCandidate = Math.max(maxCandidate, candidateIndex + 1);
      continue;
    }

    maxCandidate = Math.max(maxCandidate, candidateIndex + 1);
    break;
  }

  if (waitingOnInternal && maxCandidate < 1) {
    return { maxAllowedStepIndex: 0, waitingOnInternal: true };
  }

  return {
    maxAllowedStepIndex: Math.max(1, Math.min(maxCandidate || 1, candidateSteps.length)),
    waitingOnInternal,
  };
}

export function candidateProgressCounts(
  candidateSteps: TenantOnboardingStep[],
  progress: WorkerOnboardingProgressPayload | null
): { completed: number; total: number } {
  const statusById = buildProgressStatusMaps(candidateSteps, progress);
  const completed = candidateSteps.filter((step) => {
    const status = statusById.get(step.id);
    return status === "completed" || status === "skipped";
  }).length;
  return { completed, total: candidateSteps.length };
}

import { isPhaseCompletionMilestoneStep } from "@/lib/onboarding/phase-completion-steps";
import { routeForApplicantStep } from "@/lib/onboarding/resolve-applicant-step-route";
import { readStepLifecyclePhase } from "@/lib/onboarding/workflow-phase";
import { buildProgressStatusMaps } from "@/lib/onboarding/compute-max-allowed-from-progress";
import { isTenantStepBlocking } from "@/lib/onboarding/reference-verification";
import type {
  TenantOnboardingStep,
  WorkerOnboardingProgressPayload,
} from "@/lib/onboarding/types";

export type StepCompletionItem = {
  id: string;
  stepKey: string;
  title: string;
  stepType: string;
  phase: "pre_hire" | "post_hire";
  status: string;
  /** True only for truly completed statuses (not skipped). Used for % display. */
  isComplete: boolean;
  /** Candidate skipped this step — counts toward phase progress, not completion %. */
  isSkipped: boolean;
  isRequired: boolean;
};

export type PhaseCompletionSummary = {
  total: number;
  completedCount: number;
  percent: number;
  isComplete: boolean;
  steps: StepCompletionItem[];
};

export type WorkflowCompletionResult = {
  preHire: PhaseCompletionSummary;
  postHire: PhaseCompletionSummary;
  allComplete: boolean;
  hasPostHireSteps: boolean;
  firstPostHireStep: TenantOnboardingStep | null;
  firstPostHireRoute: string | null;
  nextIncompletePostHireRoute: string | null;
  /**
   * True only when every required Pre-Hire step in the dynamic workflow is finished,
   * including recruiter steps the candidate does not see.
   */
  postHireReady?: boolean;
};

function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? "").trim().toLowerCase();
}

function isSkippedStatus(status: string | null | undefined): boolean {
  return normalizeStatus(status) === "skipped";
}

/** Truly finished by the candidate (excludes skipped). */
function isCompletedStatus(status: string | null | undefined): boolean {
  const norm = normalizeStatus(status);
  return (
    norm === "completed" ||
    norm === "approved" ||
    norm === "signed" ||
    norm === "complete"
  );
}

/**
 * Dynamically evaluates whether all pre-hire steps and post-hire steps are completed.
 */
export function evaluateWorkflowCompletion(params: {
  allSteps: TenantOnboardingStep[];
  progress: WorkerOnboardingProgressPayload | null;
  tenantSlug?: string | null;
}): WorkflowCompletionResult {
  const { allSteps, progress, tenantSlug } = params;

  // Filter only enabled steps
  const enabled = (allSteps ?? []).filter(
    (step) => step.is_enabled && !isPhaseCompletionMilestoneStep(step)
  );

  const preHireSteps: TenantOnboardingStep[] = [];
  const postHireSteps: TenantOnboardingStep[] = [];

  for (const step of enabled) {
    const phase = readStepLifecyclePhase(step);
    if (phase === "post_hire") {
      postHireSteps.push(step);
    } else {
      preHireSteps.push(step);
    }
  }

  const statusByStepId = buildProgressStatusMaps(enabled, progress);

  const mapStepItem = (
    step: TenantOnboardingStep,
    phase: "pre_hire" | "post_hire"
  ): StepCompletionItem => {
    const status = statusByStepId.get(step.id) ?? "pending";
    return {
      id: step.id,
      stepKey: step.step_key,
      title: step.title,
      stepType: step.step_type,
      phase,
      status,
      isComplete: isCompletedStatus(status),
      isSkipped: isSkippedStatus(status),
      isRequired: isTenantStepBlocking(step),
    };
  };

  const isStepResolved = (item: StepCompletionItem) => item.isComplete || item.isSkipped;

  const preHireItems = preHireSteps.map((s) => mapStepItem(s, "pre_hire"));
  const postHireItems = postHireSteps.map((s) => mapStepItem(s, "post_hire"));

  // Display % only counts truly completed steps — skipped are not "completed".
  const preHireCompletedCount = preHireItems.filter((item) => item.isComplete).length;
  const postHireCompletedCount = postHireItems.filter((item) => item.isComplete).length;

  // Pre-hire phase is done when every required step is completed or skipped.
  const isPreHireComplete =
    preHireSteps.length > 0
      ? preHireItems.every((item) => !item.isRequired || isStepResolved(item))
      : Boolean(progress?.submittedAt);

  const hasPostHireSteps = postHireSteps.length > 0;

  // Post-hire is complete if there are post-hire steps and all required ones are resolved
  const isPostHireComplete = hasPostHireSteps
    ? postHireItems.every((item) => !item.isRequired || isStepResolved(item))
    : false;

  const allComplete = hasPostHireSteps
    ? isPreHireComplete && isPostHireComplete
    : isPreHireComplete;

  const firstPostHire = postHireSteps[0] ?? null;
  const firstPostHireRoute = firstPostHire
    ? routeForApplicantStep(firstPostHire, tenantSlug)
    : null;

  const firstIncompletePostHire =
    postHireItems.find((item) => !isStepResolved(item)) ?? null;
  const nextIncompletePostHireStep = firstIncompletePostHire
    ? postHireSteps.find((s) => s.id === firstIncompletePostHire.id) ?? null
    : null;
  const nextIncompletePostHireRoute = nextIncompletePostHireStep
    ? routeForApplicantStep(nextIncompletePostHireStep, tenantSlug)
    : firstPostHireRoute;

  const preTotal = preHireSteps.length;
  const postTotal = postHireSteps.length;

  return {
    preHire: {
      total: preTotal,
      completedCount: preHireCompletedCount,
      percent: preTotal > 0 ? Math.round((preHireCompletedCount / preTotal) * 100) : 100,
      isComplete: isPreHireComplete,
      steps: preHireItems,
    },
    postHire: {
      total: postTotal,
      completedCount: postHireCompletedCount,
      percent: postTotal > 0 ? Math.round((postHireCompletedCount / postTotal) * 100) : 0,
      isComplete: isPostHireComplete,
      steps: postHireItems,
    },
    allComplete,
    hasPostHireSteps,
    firstPostHireStep: firstPostHire,
    firstPostHireRoute,
    nextIncompletePostHireRoute,
  };
}

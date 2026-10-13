import type { TenantOnboardingConfig, TenantOnboardingStep } from "@/lib/onboarding/types";
import type { PublishedWorkflow, PublishedWorkflowStep } from "@/lib/onboarding/applicant-workflow-types";

/** Template/builder phase. `transition` is the Pre-Hire approval gate, not a third lifecycle. */
export type WorkflowTemplatePhase = "pre_hire" | "transition" | "post_hire";

/** Applicant-facing staffing lifecycle, scoped to a job application. */
export type ApplicantLifecyclePhase = "pre_hire" | "post_hire" | "completed";

export const TERMINAL_APPLICATION_STATUSES = new Set([
  "rejected",
  "withdrawn",
  "archived",
]);

export const PLACEMENT_ACCEPTED_STATUS_KEYS = new Set(["hired"]);

export function isTerminalApplicationStatus(status: string | null | undefined): boolean {
  return TERMINAL_APPLICATION_STATUSES.has(String(status ?? "").trim().toLowerCase());
}

export function isPlacementAcceptedStatus(status: string | null | undefined): boolean {
  return PLACEMENT_ACCEPTED_STATUS_KEYS.has(String(status ?? "").trim().toLowerCase());
}

export function parseApplicantLifecyclePhase(
  value: unknown
): ApplicantLifecyclePhase {
  const phase = String(value ?? "").trim().toLowerCase();
  if (phase === "post_hire" || phase === "completed") return phase;
  return "pre_hire";
}

export function parseWorkflowTemplatePhase(value: unknown): WorkflowTemplatePhase {
  const phase = String(value ?? "").trim().toLowerCase();
  if (phase === "transition" || phase === "post_hire") return phase;
  return "pre_hire";
}

/** Map builder/template phase onto the two-phase applicant lifecycle. */
export function lifecyclePhaseFromTemplatePhase(
  phase: WorkflowTemplatePhase
): Exclude<ApplicantLifecyclePhase, "completed"> {
  return phase === "post_hire" ? "post_hire" : "pre_hire";
}

export function readStepTemplatePhase(step: TenantOnboardingStep): WorkflowTemplatePhase {
  const key = String(step.step_key ?? "").trim().toLowerCase();
  const title = String(step.title ?? "").trim().toLowerCase();
  const snapshotId = String(step.metadata?.workflow_step_id ?? "").trim().toLowerCase();
  if (
    key === "offer-acceptance" ||
    key === "pay-rate-accepted" ||
    snapshotId === "offer-acceptance" ||
    snapshotId === "pay-rate-accepted" ||
    title.includes("pay rate accepted") ||
    title.includes("offer accept")
  ) {
    return "pre_hire";
  }

  const settings =
    step.metadata?.workflow_settings &&
    typeof step.metadata.workflow_settings === "object" &&
    !Array.isArray(step.metadata.workflow_settings)
      ? (step.metadata.workflow_settings as Record<string, unknown>)
      : null;
  return parseWorkflowTemplatePhase(
    settings?.phase ??
    step.metadata?.phase ??
    (step as { phase?: unknown }).phase ??
    (step as { settings?: { phase?: unknown } }).settings?.phase
  );
}

export function readStepLifecyclePhase(
  step: TenantOnboardingStep
): Exclude<ApplicantLifecyclePhase, "completed"> {
  return lifecyclePhaseFromTemplatePhase(readStepTemplatePhase(step));
}

export function readPublishedStepTemplatePhase(
  step: PublishedWorkflowStep
): WorkflowTemplatePhase {
  const key = String(step.type ?? step.id ?? "").trim().toLowerCase();
  const title = String(step.title ?? "").trim().toLowerCase();
  const stepId = String(step.settings?.stepId ?? "").trim().toLowerCase();
  if (
    key === "offer-acceptance" ||
    key === "pay-rate-accepted" ||
    stepId === "offer-acceptance" ||
    stepId === "pay-rate-accepted" ||
    title.includes("pay rate accepted") ||
    title.includes("offer accept")
  ) {
    return "pre_hire";
  }
  return parseWorkflowTemplatePhase(
    step.settings?.phase ?? (step as { phase?: unknown }).phase
  );
}

export function readPublishedStepLifecyclePhase(
  step: PublishedWorkflowStep
): Exclude<ApplicantLifecyclePhase, "completed"> {
  return lifecyclePhaseFromTemplatePhase(readPublishedStepTemplatePhase(step));
}

export function applicantMayActOnStep(params: {
  activePhase: ApplicantLifecyclePhase;
  stepPhase: Exclude<ApplicantLifecyclePhase, "completed">;
  isHired?: boolean;
  postHireSuspended?: boolean;
}): boolean {
  if (params.activePhase === "completed") {
    return false;
  }
  if (params.stepPhase === "post_hire") {
    if (params.postHireSuspended) return false;
    if (params.isHired !== true) return false;
    return params.activePhase === "post_hire" || params.isHired === true;
  }
  if (params.stepPhase === "pre_hire") {
    return true;
  }
  return params.activePhase === params.stepPhase;
}

export function filterStepsForApplicantPhase(
  steps: TenantOnboardingStep[],
  activePhase: ApplicantLifecyclePhase
): TenantOnboardingStep[] {
  const target: Exclude<ApplicantLifecyclePhase, "completed"> =
    activePhase === "completed" ? "post_hire" : activePhase;
  return steps.filter((step) => readStepLifecyclePhase(step) === target);
}

export function filterPublishedStepsForApplicantPhase(
  steps: PublishedWorkflowStep[],
  activePhase: ApplicantLifecyclePhase
): PublishedWorkflowStep[] {
  const target: Exclude<ApplicantLifecyclePhase, "completed"> =
    activePhase === "completed" ? "post_hire" : activePhase;
  return steps.filter((step) => readPublishedStepLifecyclePhase(step) === target);
}

export function applyApplicantPhaseToConfig(
  config: TenantOnboardingConfig,
  activePhase: ApplicantLifecyclePhase
): TenantOnboardingConfig {
  const visibleStepIds = new Set(
    filterStepsForApplicantPhase(config.steps, activePhase).map((step) => step.id)
  );
  return {
    ...config,
    steps: config.steps.filter((step) => visibleStepIds.has(step.id)),
    requiredDocuments: config.requiredDocuments.filter((doc) =>
      visibleStepIds.has(doc.onboarding_step_id)
    ),
    skillAssessments: config.skillAssessments.filter((assessment) =>
      visibleStepIds.has(assessment.onboarding_step_id)
    ),
  };
}

export function applyApplicantPhaseToWorkflow(
  workflow: PublishedWorkflow,
  activePhase: ApplicantLifecyclePhase
): PublishedWorkflow {
  return {
    ...workflow,
    steps: filterPublishedStepsForApplicantPhase(workflow.steps, activePhase),
  };
}

export function phaseProgress(params: {
  steps: TenantOnboardingStep[];
  completedStepIds: Set<string>;
}): { complete: number; total: number; percent: number } {
  const total = params.steps.length;
  if (!total) return { complete: 0, total: 0, percent: 0 };
  const complete = params.steps.filter((step) => params.completedStepIds.has(step.id)).length;
  return {
    complete,
    total,
    percent: Math.round((complete / total) * 100),
  };
}

export function applicantPortalCopy(phase: ApplicantLifecyclePhase): {
  header: string;
  progressLabel: string;
} {
  if (phase === "post_hire" || phase === "completed") {
    return {
      header: "Your Onboarding",
      progressLabel: "Onboarding Progress",
    };
  }
  return {
    header: "Your Application",
    progressLabel: "Application Progress",
  };
}

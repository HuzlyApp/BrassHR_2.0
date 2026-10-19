import { isCompleteDisplayStatus } from "@/lib/onboarding/assigned-workflow-steps";
import type { WorkflowStepDisplayStatus } from "@/lib/onboarding/assigned-workflow-steps";
import type { OnboardingStepStatus } from "@/lib/onboarding/types";
import { isPlacementAcceptedStatus, parseApplicantLifecyclePhase, type ApplicantLifecyclePhase } from "@/lib/onboarding/workflow-phase";

/** Required Pre-Hire progress threshold for revealing Post-Hire after Selected. */
export const PRE_HIRE_ALMOST_COMPLETE_RATIO = 0.8;

export function isAuthoritativelyHired(status: string | null | undefined): boolean {
  return isPlacementAcceptedStatus(status);
}

/**
 * Post-Hire is visible after Approve as Worker conversion succeeds.
 * Hired/Approved application status alone is not enough for this path.
 */
export function canRevealPostHire(params: {
  workerStatus?: string | null;
  convertedAt?: string | null;
  convertedWorkerId?: string | null;
  conversionStatus?: string | null;
}): boolean {
  const status = String(params.workerStatus ?? "").trim().toLowerCase();
  if (status === "converted") return true;
  const conversionCompleted = String(params.conversionStatus ?? "").trim().toLowerCase() === "completed";
  return conversionCompleted && Boolean(params.convertedAt || params.convertedWorkerId);
}

export type PreHireProgressStep = {
  snapshotStepId?: string | null;
  stepKey?: string | null;
  stepType?: string | null;
  title?: string | null;
  required?: boolean;
  displayStatus?: WorkflowStepDisplayStatus | OnboardingStepStatus | null;
  status?: OnboardingStepStatus | string | null;
};

function esignStepIds(step: {
  snapshotStepId?: string | null;
  stepKey?: string | null;
  stepType?: string | null;
}): string[] {
  return [step.snapshotStepId, step.stepKey, step.stepType]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Compliance Authorization e-sign. The candidate signing this does not hire them.
 * A step titled Authorization e-sign stays in this family even if an older key was employee-agreement.
 */
export function isAuthorizationEsignStep(step: {
  snapshotStepId?: string | null;
  stepKey?: string | null;
  stepType?: string | null;
  title?: string | null;
}): boolean {
  const ids = esignStepIds(step);
  if (
    ids.some(
      (id) =>
        id === "authorization-esign" ||
        id === "authorization_esign" ||
        id.includes("authorization-esign")
    )
  ) {
    return true;
  }
  const title = String(step.title ?? "").trim().toLowerCase();
  return title.includes("authorization e-sign") || title.includes("authorization esign");
}

/** Offer-stage Agreement e-sign. Recruiter Mark as complete on this step hires the candidate. */
export function isAgreementEsignStep(step: {
  snapshotStepId?: string | null;
  stepKey?: string | null;
  stepType?: string | null;
  title?: string | null;
}): boolean {
  if (isAuthorizationEsignStep(step)) return false;

  const ids = esignStepIds(step);
  const key = String(step.stepKey ?? "").trim().toLowerCase();
  const snapshotId = String(step.snapshotStepId ?? "").trim().toLowerCase();
  const title = String(step.title ?? "").trim().toLowerCase();

  if (
    ids.some(
      (id) =>
        id === "employee-agreement" ||
        id === "agreement-esign" ||
        id === "agreement_signature" ||
        id === "agreement-signature"
    ) ||
    snapshotId.includes("agreement") ||
    key === "authorizations_2" ||
    key.includes("agreement")
  ) {
    return true;
  }

  return (
    title.includes("agreement esign") ||
    title.includes("agreement e-sign") ||
    title.includes("agreement signed") ||
    title.includes("employee agreement") ||
    title.includes("employment agreement") ||
    title.includes("contract esign") ||
    title.includes("contract e-sign") ||
    title.includes("agreement signature") ||
    title.includes("agreement / signature") ||
    (title.includes("agreement") &&
      (title.includes("sign") || title.includes("w2") || title.includes("nexus") || title.includes("employment")))
  );
}

/**
 * Agreement e-sign counts only after the recruiter marks it complete.
 * A candidate signature stays Submitted and does not hire them.
 */
export function hasCompletedAgreementEsignStep(steps: PreHireProgressStep[]): boolean {
  return steps.some((step) => {
    if (!isAgreementEsignStep(step)) return false;
    const status = String(step.displayStatus ?? step.status ?? "pending").trim().toLowerCase();
    return status === "completed" || status === "approved";
  });
}

/**
 * Required Pre-Hire steps are "almost complete" when:
 * - there are no required steps, or
 * - all required steps are complete, or
 * - at most one required step remains (for lists of 2+), or
 * - completed required / total required >= 80%.
 */
export function areRequiredPreHireStepsAlmostComplete(steps: PreHireProgressStep[]): boolean {
  const required = steps.filter((step) => step.required !== false);
  if (!required.length) return true;

  const completed = required.filter((step) =>
    isCompleteDisplayStatus((step.displayStatus ?? step.status ?? "pending") as WorkflowStepDisplayStatus)
  ).length;

  if (completed >= required.length) return true;
  const remaining = required.length - completed;
  if (remaining <= 1 && required.length >= 2) return true;
  return completed / required.length >= PRE_HIRE_ALMOST_COMPLETE_RATIO;
}

/**
 * Staff hire-journey Post-Hire tab:
 * - after conversion (Approve as Worker), or
 * - after the recruiter marks Agreement e-sign complete, or
 * - after application is Selected (hired) and required Pre-Hire steps are nearly complete.
 */
export function canRevealPostHireForStaffJourney(params: {
  convertedVisible: boolean;
  applicationHired: boolean;
  preHireSteps: PreHireProgressStep[];
}): boolean {
  if (params.convertedVisible) return true;
  if (hasCompletedAgreementEsignStep(params.preHireSteps)) return true;
  return (
    params.applicationHired && areRequiredPreHireStepsAlmostComplete(params.preHireSteps)
  );
}

export function shouldRejectPostHirePhaseRequest(
  phase: string | null | undefined,
  postHireVisible: boolean
): boolean {
  return String(phase ?? "").trim().toLowerCase() === "post_hire" && !postHireVisible;
}

export function isPostHireLockedForApplicant(params: {
  isHired: boolean;
  postHireSuspended?: boolean;
}): boolean {
  return !params.isHired || Boolean(params.postHireSuspended);
}

export function shouldSuspendPostHireAfterStatusChange(params: {
  previousStatus?: string | null;
  nextStatus: string;
  unchanged?: boolean;
}): boolean {
  if (params.unchanged) return false;
  return isPlacementAcceptedStatus(params.previousStatus) && !isPlacementAcceptedStatus(params.nextStatus);
}

export function hireGateFromApplications(
  rows: Array<{
    status?: string | null;
    workflow_phase?: string | null;
    post_hire_suspended_at?: string | null;
  }>
): {
  isHired: boolean;
  postHireSuspended: boolean;
  activePhase: ApplicantLifecyclePhase;
} {
  const hired = rows.find((row) => isPlacementAcceptedStatus(row.status));
  if (!hired) {
    return {
      isHired: false,
      postHireSuspended: false,
      activePhase: parseApplicantLifecyclePhase(rows[0]?.workflow_phase),
    };
  }
  const postHireSuspended = Boolean(hired.post_hire_suspended_at);
  return {
    isHired: !postHireSuspended,
    postHireSuspended,
    activePhase: parseApplicantLifecyclePhase(hired.workflow_phase),
  };
}

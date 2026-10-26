import {
  findParameterizedJobApplicationProgress,
  isParameterizedJobApplicationStepType,
} from "@/lib/onboarding/job-application-parameters";
import type { JobApplicationStepView } from "@/lib/onboarding/job-application-step";
import {
  candidateReviewDisplayStatus,
  mapProgressToDisplayStatus,
  resolveAssignedStepStatus,
  type MappedAssignedStep,
  type ProgressRowInput,
} from "@/lib/onboarding/assigned-workflow-steps";
import type { OnboardingStepStatus } from "@/lib/onboarding/types";

export function jobApplicationScreeningEvidenceStatus(
  view: Pick<JobApplicationStepView, "screening"> | null | undefined
): { status: OnboardingStepStatus; displayStatus: ReturnType<typeof mapProgressToDisplayStatus> } | null {
  if (!view?.screening?.length) return null;
  const answered = view.screening.filter((item) => item.answered);
  if (!answered.length) return null;
  const required = view.screening.filter((item) => item.isRequired);
  const allRequiredAnswered = required.length === 0 || required.every((item) => item.answered);
  if (allRequiredAnswered) {
    return { status: "completed", displayStatus: "completed" };
  }
  return { status: "in_progress", displayStatus: "in_progress" };
}

function mergeStepWithResolvedStatus(
  step: MappedAssignedStep,
  resolved: { status: OnboardingStepStatus; completedAt: string | null }
): MappedAssignedStep {
  const displayStatus = candidateReviewDisplayStatus({
    ...step,
    status: resolved.status,
    displayStatus: mapProgressToDisplayStatus(resolved.status),
  });
  return {
    ...step,
    status: resolved.status,
    displayStatus,
    completedAt: resolved.completedAt ?? step.completedAt,
    unmatched: false,
    detail: undefined,
  };
}

/**
 * Align Parameterized Job Application rows with job screening progress / answers when tenant
 * step matching fails (common for job-scoped onboarding configs).
 */
export function applyParameterizedJobApplicationStepEvidence(params: {
  steps: MappedAssignedStep[];
  progressByStepId: Map<string, ProgressRowInput>;
  applicationId?: string | null;
  jobApplication?: Pick<JobApplicationStepView, "screening"> | null;
}): MappedAssignedStep[] {
  const linked = findParameterizedJobApplicationProgress(
    params.progressByStepId,
    params.applicationId
  );
  const screeningStatus = jobApplicationScreeningEvidenceStatus(params.jobApplication);

  return params.steps.map((step) => {
    if (!isParameterizedJobApplicationStepType(step.stepType)) return step;

    if (linked) {
      const recordInput = {
        id: step.id,
        snapshot_step_id: step.snapshotStepId,
        title: step.title,
        step_type: step.stepType,
        is_required: step.required,
        position: 0,
        status: step.status,
        completed_at: step.completedAt,
        settings: step.settings ?? {},
      };
      const resolved = resolveAssignedStepStatus(recordInput, linked.progress);
      let merged = mergeStepWithResolvedStatus(step, resolved);
      if (!merged.tenantStepId && linked.tenantStepId) {
        merged = { ...merged, tenantStepId: linked.tenantStepId };
      }
      return merged;
    }

    if (screeningStatus) {
      return mergeStepWithResolvedStatus(step, {
        status: screeningStatus.status,
        completedAt: step.completedAt,
      });
    }

    return step;
  });
}

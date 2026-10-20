import { APPLICATION_ROUTES } from "@/lib/onboarding/application-routes";
import { routeForApplicantStep } from "@/lib/onboarding/resolve-applicant-step-route";
import type { TenantOnboardingStep } from "@/lib/onboarding/types";

/** Builder library steps that have no dedicated applicant screen (placeholders). */
const WORKFLOW_STEPS_WITHOUT_APPLICANT_SCREEN = new Set<string>([
  // parameterized-job-application now has a dedicated screen: /application/job-screening
]);

/** Paths that only serve resume upload + profile review (not follow-on profile steps). */
const RESUME_FLOW_PATHS = new Set<string>([
  APPLICATION_ROUTES.addResume,
  APPLICATION_ROUTES.addResumeV2,
  APPLICATION_ROUTES.resumeUploadSuccess,
  APPLICATION_ROUTES.parseResume,
  APPLICATION_ROUTES.profileReview,
]);

function workflowStepId(step: Pick<TenantOnboardingStep, "metadata">): string | null {
  const id = step.metadata?.workflow_step_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function routePathForStep(step: TenantOnboardingStep, tenantSlug?: string | null): string {
  return routeForApplicantStep(step, tenantSlug).split("?")[0] ?? "";
}

/**
 * True when the applicant flow has a real screen for this step (not a duplicate resume placeholder).
 */
export function applicantStepHasNavigableScreen(
  step: TenantOnboardingStep,
  enabledSteps: TenantOnboardingStep[]
): boolean {
  const libraryId = workflowStepId(step);
  if (libraryId && WORKFLOW_STEPS_WITHOUT_APPLICANT_SCREEN.has(libraryId)) {
    return false;
  }

  const path = routePathForStep(step);

  if (step.step_type === "profile_information" && RESUME_FLOW_PATHS.has(path)) {
    return false;
  }

  const idx = enabledSteps.findIndex((s) => s.id === step.id || s.step_key === step.step_key);
  if (idx > 0) {
    for (let i = 0; i < idx; i++) {
      const prior = enabledSteps[i]!;
      if (routePathForStep(prior) === path && RESUME_FLOW_PATHS.has(path)) {
        return false;
      }
    }
  }

  return true;
}

/** Next/previous enabled step index that has a navigable applicant screen. */
export function findNavigableStepIndex(
  enabledSteps: TenantOnboardingStep[],
  startIndex: number,
  direction: 1 | -1
): number | null {
  let i = startIndex + direction;
  while (i >= 0 && i < enabledSteps.length) {
    if (applicantStepHasNavigableScreen(enabledSteps[i]!, enabledSteps)) {
      return i;
    }
    i += direction;
  }
  return null;
}

/** Non-navigable steps strictly between two indices (for auto-skip). */
export function nonNavigableStepsBetween(
  enabledSteps: TenantOnboardingStep[],
  fromIndex: number,
  toIndex: number
): TenantOnboardingStep[] {
  if (fromIndex === toIndex) return [];
  const lo = Math.min(fromIndex, toIndex);
  const hi = Math.max(fromIndex, toIndex);
  const result: TenantOnboardingStep[] = [];
  for (let i = lo + 1; i < hi; i++) {
    const step = enabledSteps[i];
    if (step && !applicantStepHasNavigableScreen(step, enabledSteps)) {
      result.push(step);
    }
  }
  return result;
}

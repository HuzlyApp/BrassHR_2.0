import { APPLICATION_ROUTES } from "@/lib/onboarding/application-routes";
import { stepUsesFirmaSigning } from "@/lib/onboarding/firma-step-settings";
import {
  POST_HIRE_COMPLETION_STEP_ID,
  PRE_HIRE_COMPLETION_STEP_ID,
} from "@/lib/onboarding/phase-completion-steps";
import { isCandidateCheckboxStep } from "@/lib/onboarding/candidate-checkbox-steps";
import { candidatePostHireScreenKind } from "@/lib/onboarding/post-hire-step-screens";
import type { OnboardingStepType, TenantOnboardingStep } from "@/lib/onboarding/types";
import { withTenant } from "@/lib/tenant/with-tenant";

/** Builder library step id → primary applicant route. */
export const WORKFLOW_STEP_APPLICANT_ROUTE: Record<string, string> = {
  "resume-basic-profile": APPLICATION_ROUTES.addResume,
  "parameterized-job-application": APPLICATION_ROUTES.jobScreening,
  "collect-extra-files": APPLICATION_ROUTES.collectExtraFiles,
  "references-collection": APPLICATION_ROUTES.addReferences,
  "reference-verification": APPLICATION_ROUTES.addReferences,
  "skill-qualification-assessment": APPLICATION_ROUTES.skillsIntro,
  "training-modules-quiz": APPLICATION_ROUTES.skillsIntro,
  "document-upload": APPLICATION_ROUTES.professionalLicense,
  "credential-license-verification": APPLICATION_ROUTES.professionalLicense,
  "certification-upload": APPLICATION_ROUTES.professionalLicense,
  "welcome-packet-esign": APPLICATION_ROUTES.agreementSignature,
  "tax-forms": APPLICATION_ROUTES.authorizationsDocuments,
  "employee-agreement": APPLICATION_ROUTES.agreementSignature,
  "policy-acknowledgment": APPLICATION_ROUTES.agreementSignature,
  "equipment-badge-acknowledgment": APPLICATION_ROUTES.agreementSignature,
  "ssn-identity-verification": APPLICATION_ROUTES.identityVerification,
  "background-check": APPLICATION_ROUTES.authorizationsDocuments,
  [PRE_HIRE_COMPLETION_STEP_ID]: APPLICATION_ROUTES.preHireCompletion,
  [POST_HIRE_COMPLETION_STEP_ID]: APPLICATION_ROUTES.postHireCompletion,
};

/**
 * Post-Hire and custom library steps that have their own screen. Without this,
 * whichever one gets a bare key routes to standard flows and might be mishandled.
 */
const CUSTOM_SCREEN_LIBRARY_STEPS = new Set([
  "direct-deposit-setup",
  "benefits-enrollment",
  "401k-enrollment",
  "pay-rate-hire-date",
  "payroll-profile-creation",
  "i9-right-to-work-verification",
  "i9-section-1",
]);

const CANONICAL_STEP_KEY_ROUTES: Record<string, string> = {
  resume_upload: APPLICATION_ROUTES.addResume,
  professional_license: APPLICATION_ROUTES.professionalLicense,
  skill_assessment: APPLICATION_ROUTES.skillsIntro,
  authorization_background_check: APPLICATION_ROUTES.authorizationsDocuments,
  authorizations: APPLICATION_ROUTES.authorizationsDocuments,
  references: APPLICATION_ROUTES.addReferences,
  review_submit: APPLICATION_ROUTES.applicationSummary,
};

const STEP_TYPE_ROUTES: Record<OnboardingStepType, string> = {
  resume_upload: APPLICATION_ROUTES.addResume,
  profile_information: APPLICATION_ROUTES.addResume,
  professional_license: APPLICATION_ROUTES.professionalLicense,
  skill_assessment: APPLICATION_ROUTES.skillsIntro,
  document_upload: APPLICATION_ROUTES.professionalLicense,
  authorizations: APPLICATION_ROUTES.authorizationsDocuments,
  references: APPLICATION_ROUTES.addReferences,
  review_submit: APPLICATION_ROUTES.applicationSummary,
  custom_question: APPLICATION_ROUTES.customStep(""),
};

function workflowStepId(step: Pick<TenantOnboardingStep, "metadata">): string | null {
  const id = step.metadata?.workflow_step_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function isDuplicateStepKey(stepKey: string, stepType: OnboardingStepType): boolean {
  if (stepKey === stepType) return false;
  if (CANONICAL_STEP_KEY_ROUTES[stepKey]) return false;
  return /_\d+$/.test(stepKey) || stepKey.includes("_");
}

function baseRouteForStep(step: TenantOnboardingStep): string {
  if (step.step_type === "review_submit" || step.step_key === "review_submit") {
    return APPLICATION_ROUTES.applicationSummary;
  }

  const libraryId = workflowStepId(step);
  if (libraryId === PRE_HIRE_COMPLETION_STEP_ID) return APPLICATION_ROUTES.preHireCompletion;
  if (libraryId === POST_HIRE_COMPLETION_STEP_ID) return APPLICATION_ROUTES.postHireCompletion;

  if (candidatePostHireScreenKind(step) || isCandidateCheckboxStep(step)) {
    return APPLICATION_ROUTES.customStep(step.step_key);
  }

  // Prefer dedicated library routes (e.g. background-check → Authorizations & Documents)
  // even when a Firma template is attached — Click and Sign lives on that screen.
  if (libraryId && WORKFLOW_STEP_APPLICANT_ROUTE[libraryId]) {
    return WORKFLOW_STEP_APPLICANT_ROUTE[libraryId];
  }
  if (libraryId && CUSTOM_SCREEN_LIBRARY_STEPS.has(libraryId)) {
    return APPLICATION_ROUTES.customStep(step.step_key);
  }

  if (CANONICAL_STEP_KEY_ROUTES[step.step_key]) {
    return CANONICAL_STEP_KEY_ROUTES[step.step_key];
  }

  // Standalone Firma page only when the step has no library/canonical applicant route.
  if (stepUsesFirmaSigning(step) && step.step_type !== "authorizations") {
    return APPLICATION_ROUTES.eSignature;
  }

  if (!isDuplicateStepKey(step.step_key, step.step_type) && STEP_TYPE_ROUTES[step.step_type]) {
    const typeRoute = STEP_TYPE_ROUTES[step.step_type];
    if (step.step_type !== "custom_question") return typeRoute;
  }

  return APPLICATION_ROUTES.customStep(step.step_key);
}

export function dedicatedRouteForWorkflowStep(step: TenantOnboardingStep): string | null {
  if (candidatePostHireScreenKind(step)) return null;
  const libraryId = workflowStepId(step);
  if (libraryId && WORKFLOW_STEP_APPLICANT_ROUTE[libraryId]) {
    return WORKFLOW_STEP_APPLICANT_ROUTE[libraryId];
  }
  if (stepUsesFirmaSigning(step) && step.step_type !== "authorizations") {
    return APPLICATION_ROUTES.eSignature;
  }
  const base = baseRouteForStep(step);
  if (base.includes("/application/custom-step/")) return null;
  return base;
}

/** Applicant route for a configured workflow step, including stepKey for disambiguation. */
export function routeForApplicantStep(
  step: Pick<TenantOnboardingStep, "step_key" | "step_type" | "metadata">,
  tenantSlug?: string | null
): string {
  const base = baseRouteForStep(step as TenantOnboardingStep);
  const sep = base.includes("?") ? "&" : "?";
  const withKey = `${base}${sep}stepKey=${encodeURIComponent(step.step_key)}`;
  return withTenant(withKey, tenantSlug);
}

/** Legacy helper — prefer routeForApplicantStep with full step object. */
export function routeForOnboardingStep(stepKey: string, stepType: OnboardingStepType): string {
  return baseRouteForStep({
    step_key: stepKey,
    step_type: stepType,
    metadata: {},
  } as TenantOnboardingStep);
}

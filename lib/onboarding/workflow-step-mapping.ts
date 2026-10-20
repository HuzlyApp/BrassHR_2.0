import type { OnboardingStepType } from "@/lib/onboarding/types";

/** Maps workflow library step ids → persisted onboarding step types. */
export const WORKFLOW_STEP_TO_ONBOARDING_TYPE: Record<string, OnboardingStepType> = {
  "resume-basic-profile": "resume_upload",
  "parameterized-job-application": "profile_information",
  "collect-extra-files": "document_upload",
  "references-collection": "references",
  "collect-references": "references",
  "reference-verification": "references",
  "skill-qualification-assessment": "skill_assessment",
  "custom-application-form": "custom_question",
  "custom-form": "custom_question",
  "custom-step": "custom_question",
  "document-upload": "document_upload",
  "welcome-packet-esign": "authorizations",
  "i9-right-to-work-verification": "document_upload",
  "tax-forms": "document_upload",
  "employee-agreement": "authorizations",
  "policy-acknowledgment": "authorizations",
  "equipment-badge-acknowledgment": "document_upload",
  "background-check": "custom_question",
  "drug-test-screening": "custom_question",
  "oig-exclusion-check": "custom_question",
  "credential-license-verification": "professional_license",
  "recruiter-screening": "custom_question",
  "interview-qualification": "custom_question",
  "client-review": "custom_question",
  "candidate-selection": "custom_question",
  "release-to-client": "custom_question",
  "submit-to-msp": "custom_question",
  "ssn-identity-verification": "document_upload",
  "direct-deposit-setup": "profile_information",
  "benefits-enrollment": "profile_information",
  "401k-enrollment": "profile_information",
  "pay-rate-hire-date": "profile_information",
  "payroll-profile-creation": "profile_information",
  "safety-training": "custom_question",
  "training-modules-quiz": "skill_assessment",
  "orientation-video": "custom_question",
  "compliance-training": "custom_question",
  "certification-upload": "professional_license",
};

/** Preferred library step id for each onboarding step type (builder rehydration). */
export const ONBOARDING_TYPE_TO_WORKFLOW_STEP: Record<OnboardingStepType, string> = {
  resume_upload: "resume-basic-profile",
  document_upload: "document-upload",
  skill_assessment: "skill-qualification-assessment",
  profile_information: "parameterized-job-application",
  custom_question: "custom-step",
  review_submit: "custom-step",
  professional_license: "credential-license-verification",
  references: "references-collection",
  authorizations: "welcome-packet-esign",
};

export function workflowStepIdToOnboardingType(stepId: string): OnboardingStepType {
  return WORKFLOW_STEP_TO_ONBOARDING_TYPE[stepId] ?? "custom_question";
}

export function onboardingTypeToWorkflowStepId(stepType: OnboardingStepType): string {
  return ONBOARDING_TYPE_TO_WORKFLOW_STEP[stepType] ?? "custom-step";
}

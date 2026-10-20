import { getFirmaRecruiterTemplateId, workflowStepIdFromMetadata } from "@/lib/onboarding/firma-step-settings";
import { postHireScreenKindForStep } from "@/lib/onboarding/post-hire-step-screens";
import type { TenantOnboardingStep } from "@/lib/onboarding/types";

/**
 * Library steps the candidate completes by reviewing and signing a document. Pre-Hire copies use
 * the Agreement Signature screen; Post-Hire copies keep their custom-step acknowledgment screen.
 */
export const AGREEMENT_SIGNATURE_LIBRARY_STEP_IDS = [
  "employee-agreement",
  "welcome-packet-esign",
  "policy-acknowledgment",
  "equipment-badge-acknowledgment",
] as const;

export function isAgreementSignatureLibraryStepId(stepId: string | null | undefined): boolean {
  return (AGREEMENT_SIGNATURE_LIBRARY_STEP_IDS as readonly string[]).includes((stepId ?? "").trim());
}

export function isAgreementSignatureStep(
  step: Pick<TenantOnboardingStep, "metadata"> | null | undefined
): boolean {
  if (!step || postHireScreenKindForStep(step)) return false;
  return isAgreementSignatureLibraryStepId(workflowStepIdFromMetadata(step.metadata));
}

/** An enabled step that signs its template on its own screen, so other steps must not borrow it. */
export function signsOnOwnScreen(
  step: Pick<TenantOnboardingStep, "metadata" | "is_enabled">
): boolean {
  if (step.is_enabled === false) return false;
  return Boolean(
    getFirmaRecruiterTemplateId(step) && (isAgreementSignatureStep(step) || postHireScreenKindForStep(step))
  );
}

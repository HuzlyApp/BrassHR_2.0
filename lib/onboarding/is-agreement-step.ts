import { isAgreementEsignStep } from "@/lib/onboarding/lock-post-hire";
import {
  postHireScreenKindForStep,
  postHireScreenKindForStepId,
} from "@/lib/onboarding/post-hire-step-screens";
import { workflowStepIdFromMetadata } from "@/lib/onboarding/firma-step-settings";
import type { TenantOnboardingStep } from "@/lib/onboarding/types";

export type AgreementStepInput = {
  id?: string | null;
  step_key?: string | null;
  stepKey?: string | null;
  step_type?: string | null;
  stepType?: string | null;
  title?: string | null;
  phase?: string | null;
  metadata?: Record<string, unknown> | null;
  data?: Record<string, unknown> | null;
};

const AGREEMENT_KEYWORD_REGEX =
  /(agreement|esign|e-sign|signature|signed|w-?4|i-?9|tax-?form|withholding|right-to-work|direct-deposit|attestation|acknowledgment|acknowledgement)/i;

/**
 * Dynamically identifies whether an onboarding step is an agreement,
 * e-signature, tax form, I-9, or legal attestation step.
 *
 * Client-safe helper function (no server-only dependencies).
 */
export function isAgreementOrSignatureStep(
  step: AgreementStepInput | TenantOnboardingStep | null | undefined
): boolean {
  if (!step) return false;

  const metadata = (step as { metadata?: Record<string, unknown> | null }).metadata;
  const data = (step as { data?: Record<string, unknown> | null }).data;
  const workflowStepId = workflowStepIdFromMetadata(metadata) || "";
  const stepKey = String(step.step_key ?? (step as AgreementStepInput).stepKey ?? "").trim().toLowerCase();
  const stepType = String(step.step_type ?? (step as AgreementStepInput).stepType ?? "").trim().toLowerCase();
  const title = String(step.title ?? "").trim().toLowerCase();

  // 1. Pre-Hire Agreement eSign / Employee Agreement
  if (
    isAgreementEsignStep({
      snapshotStepId: workflowStepId,
      stepKey,
      stepType,
      title,
    })
  ) {
    return true;
  }

  // 2. Post-Hire Legal Forms (W-4, I-9, Direct Deposit, Acknowledgments)
  const postHireKind =
    postHireScreenKindForStepId(workflowStepId) ||
    postHireScreenKindForStep(step as Pick<TenantOnboardingStep, "metadata">);
  if (
    postHireKind === "tax_withholding" ||
    postHireKind === "i9_attestation" ||
    postHireKind === "direct_deposit" ||
    postHireKind === "acknowledgment"
  ) {
    return true;
  }

  // 3. Electronic Signature Integration (Firma, Zoho, etc.)
  if (
    metadata?.firma_template_id ||
    metadata?.zoho_template_id ||
    (typeof metadata?.provider === "string" && /firma|zoho|esign/i.test(metadata.provider)) ||
    (metadata?.workflow_settings &&
      typeof (metadata.workflow_settings as Record<string, unknown>).provider === "string" &&
      /firma|zoho|esign/i.test(String((metadata.workflow_settings as Record<string, unknown>).provider))) ||
    data?.signing_provider ||
    data?.signature ||
    data?.firma_status
  ) {
    return true;
  }

  // 4. Dynamic keyword heuristics on title, key, or workflowStepId
  const candidateStrings = [title, stepKey, stepType, workflowStepId].filter(Boolean);
  return candidateStrings.some((str) => AGREEMENT_KEYWORD_REGEX.test(str));
}

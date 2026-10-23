import type { StepSettings } from "@/app/components/workflow-builder/types";
import type { OnboardingStepStatus, TenantOnboardingStep } from "@/lib/onboarding/types";

/** Workflow library steps that can attach a Firma template for embedded signing. */
export const FIRMA_ATTACHABLE_WORKFLOW_STEP_IDS = [
  "background-check",
  "welcome-packet-esign",
  "employee-agreement",
  "authorization-esign",
  "policy-acknowledgment",
  "equipment-badge-acknowledgment",
  "tax-forms",
  "i9-right-to-work-verification",
] as const;

export type FirmaAttachableWorkflowStepId = (typeof FIRMA_ATTACHABLE_WORKFLOW_STEP_IDS)[number];

export function isFirmaAttachableWorkflowStepId(stepId: string | null | undefined): boolean {
  const id = (stepId ?? "").trim();
  return (FIRMA_ATTACHABLE_WORKFLOW_STEP_IDS as readonly string[]).includes(id);
}

export function readFirmaTemplateSettings(
  settings: Partial<StepSettings> | null | undefined
): { recruiterTemplateId: string | null; recruiterTemplateName: string | null } {
  const recruiterTemplateId = settings?.firmaRecruiterTemplateId?.trim() || null;
  const recruiterTemplateName = settings?.firmaRecruiterTemplateName?.trim() || null;
  return { recruiterTemplateId, recruiterTemplateName };
}

export function getFirmaRecruiterTemplateId(
  step: Pick<TenantOnboardingStep, "metadata">
): string | null {
  const settings = step.metadata?.workflow_settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return null;
  return readFirmaTemplateSettings(settings as Partial<StepSettings>).recruiterTemplateId;
}

export function stepUsesFirmaSigning(step: Pick<TenantOnboardingStep, "metadata">): boolean {
  return Boolean(getFirmaRecruiterTemplateId(step));
}

export function workflowStepIdFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  const id = metadata?.workflow_step_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export const FIRMA_SIGNING_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "signed",
  "completed",
  "expired",
  "cancelled",
  "voided",
] as const;

export type FirmaSigningStatus = (typeof FIRMA_SIGNING_STATUSES)[number];

function normalizeFirmaSigningStatusFromFlags(
  flags: Record<string, unknown>
): FirmaSigningStatus | null {
  if (
    !("sent" in flags ||
      "finished" in flags ||
      "cancelled" in flags ||
      "declined" in flags ||
      "expired" in flags)
  ) {
    return null;
  }

  if (flags.finished === true) return "completed";
  if (flags.declined === true) return "cancelled";
  if (flags.cancelled === true) return "cancelled";
  if (flags.expired === true) return "expired";
  if (flags.sent === true) return "sent";
  return "draft";
}

export function normalizeFirmaSigningStatus(value: unknown): FirmaSigningStatus {
  let status = "";
  if (typeof value === "string") {
    status = value.trim().toLowerCase();
  } else if (typeof value === "number" && Number.isFinite(value)) {
    status = String(value).trim().toLowerCase();
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const fromFlags = normalizeFirmaSigningStatusFromFlags(record);
    if (fromFlags) return fromFlags;

    const nested =
      "status" in record
        ? record.status
        : "name" in record
          ? record.name
          : null;
    if (nested != null && nested !== value) {
      return normalizeFirmaSigningStatus(nested);
    }
  }

  if (status === "complete") return "completed";
  if (status === "not_sent" || status === "not-sent") return "draft";
  if (status === "in_progress" || status === "in-progress") return "sent";
  if (status === "finished") return "completed";
  if (status === "recipient_signed" || status === "recipient-signed") return "signed";
  if ((FIRMA_SIGNING_STATUSES as readonly string[]).includes(status)) {
    return status as FirmaSigningStatus;
  }
  return "draft";
}

type FirmaSigningStatusRecipient = {
  status?: unknown;
  finished_date?: string | null;
};

/** Prefer applicant recipient completion over request-level in-progress states. */
export function resolveFirmaSigningStatusFromSources(input: {
  requestStatus?: unknown;
  recipient?: FirmaSigningStatusRecipient | null;
  fallback?: unknown;
}): FirmaSigningStatus {
  if (input.recipient?.finished_date?.trim()) {
    return "signed";
  }

  const recipientStatus =
    input.recipient?.status != null
      ? normalizeFirmaSigningStatus(input.recipient.status)
      : null;
  const requestStatus =
    input.requestStatus != null ? normalizeFirmaSigningStatus(input.requestStatus) : null;

  if (recipientStatus && isFirmaSigningComplete(recipientStatus)) return recipientStatus;
  if (requestStatus && isFirmaSigningComplete(requestStatus)) return requestStatus;
  if (recipientStatus && recipientStatus !== "draft") return recipientStatus;
  if (requestStatus && requestStatus !== "draft") return requestStatus;

  return normalizeFirmaSigningStatus(input.fallback ?? "draft");
}

export function mapFirmaStatusToOnboardingStatus(firmaStatus: unknown): OnboardingStepStatus {
  const status = normalizeFirmaSigningStatus(firmaStatus);
  if (status === "completed" || status === "signed") return "completed";
  if (status === "sent" || status === "viewed") return "in_progress";
  if (status === "expired" || status === "cancelled") return "failed";
  return "pending";
}

export function isFirmaSigningComplete(firmaStatus: unknown): boolean {
  const status = normalizeFirmaSigningStatus(firmaStatus);
  return status === "completed" || status === "signed";
}

export function findOnboardingStepForFirmaSession(
  steps: TenantOnboardingStep[],
  input: { stepKey?: string | null; stepId?: string | null }
): TenantOnboardingStep | null {
  const stepId = input.stepId?.trim();
  if (stepId) {
    const byId = steps.find((step) => step.id === stepId);
    if (byId) return byId;
  }

  const stepKey = input.stepKey?.trim();
  if (stepKey) {
    const byKey = steps.find((step) => step.step_key === stepKey);
    if (byKey) return byKey;
  }

  const firmaSteps = steps.filter(stepUsesFirmaSigning);
  if (firmaSteps.length === 1) return firmaSteps[0];

  if (stepKey) {
    const baseKey = stepKey.replace(/_\d+$/, "");
    const byBase = firmaSteps.find(
      (step) => step.step_key === stepKey || step.step_key.startsWith(`${baseKey}_`) || step.step_key === baseKey
    );
    if (byBase) return byBase;
  }

  return null;
}

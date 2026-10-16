import type { StepSettings } from "@/app/components/workflow-builder/types";
import { isCandidateCheckboxStep } from "@/lib/onboarding/candidate-checkbox-steps";
import { evaluateConditionalLogic } from "@/lib/onboarding/evaluate-conditional-logic";
import { normalizeWorkflowNodeSettings } from "@/lib/onboarding/normalize-workflow-settings";
import type { TenantOnboardingStep } from "@/lib/onboarding/types";

export type ParsedWorkflowSettings = StepSettings & {
  /** Admin-only settings are not applied on the worker path. */
  adminOnly: boolean;
};

export function getWorkflowSettings(step: TenantOnboardingStep): ParsedWorkflowSettings {
  const raw = step.metadata?.workflow_settings;
  const base = normalizeWorkflowNodeSettings(
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Partial<StepSettings>) : null,
    { required: step.is_required }
  );

  const conditional = evaluateConditionalLogic(base.conditionalLogic);

  return {
    ...base,
    required: step.is_required ?? base.required,
    adminOnly: conditional.hideFromApplicant,
  };
}

const APPLICANT_COMPLETION_OWNERS = new Set([
  "applicant",
  "contractor",
  "worker",
  "applicant_or_hr",
]);

const SCREENING_LIBRARY_STEP_IDS = new Set([
  "background-check",
  "drug-test-screening",
  "oig-exclusion-check",
]);

/** Library steps that are organizational work, even if completionOwner defaulted to applicant. */
const INTERNAL_LIBRARY_STEP_IDS = new Set([
  "manager-facility-approval",
  "hr-final-approval",
  "recruiter-screening",
  "interview-qualification",
  "client-review",
  "candidate-selection",
  "release-to-client",
  "submit-to-msp",
  "completion-milestone",
  "reference-verification",
  "oig-exclusion-check",
  "drug-test-screening",
  "welcome-email",
  "status-update-notification",
  "manager-welcome-call",
  "final-onboarding-call",
  "pay-rate-hire-date",
  "schedule-assignment",
  "badge-equipment-issuance",
  "facility-access-setup",
  "buddy-mentor-assignment",
  "benefits-confirmation",
  "adverse-action-process",
  "conditional-branch-decision",
  // Renamed canvas tasks (for example "Recruiter Offer Call") stay recruiter work.
  "manual-task-hr-action",
  // parameterized-job-application is now applicant-facing: removed from internal steps
]);

export function readWorkflowLibraryStepId(step: TenantOnboardingStep): string {
  const id = step.metadata?.workflow_step_id;
  return typeof id === "string" ? id.trim() : "";
}

/** True when HR/recruiter/system owns completion — not the applicant. */
export function isApplicantCompletionOwner(owner: string | null | undefined): boolean {
  const value = String(owner ?? "").trim().toLowerCase();
  if (!value) return true;
  return APPLICANT_COMPLETION_OWNERS.has(value);
}

/** Integration-backed steps use the configured provider when partner mode is on. */
export function isIntegrationPartnerStep(step: TenantOnboardingStep): boolean {
  const settings = getWorkflowSettings(step);
  return settings.useBraasPartner === true;
}

export function integrationProviderLabel(step: TenantOnboardingStep): string | null {
  const settings = getWorkflowSettings(step);
  if (!settings.useBraasPartner) return null;
  const label = settings.provider?.trim();
  return label || null;
}

/**
 * Checker/partner turnaround copy is only for actual screening library steps.
 * Default builder settings otherwise paint Checker onto every custom step.
 */
export function showsApplicantPartnerScreeningNotice(step: TenantOnboardingStep): boolean {
  return (
    SCREENING_LIBRARY_STEP_IDS.has(readWorkflowLibraryStepId(step)) && isIntegrationPartnerStep(step)
  );
}

/**
 * Internal library step by builder id alone (e.g. an assigned step record's `step_type`).
 * Completion Milestone is excluded: it is also the applicant's review/submit step.
 */
export function isInternalLibraryStepId(libraryId: string | null | undefined): boolean {
  const value = String(libraryId ?? "").trim().toLowerCase();
  return value !== "completion-milestone" && INTERNAL_LIBRARY_STEP_IDS.has(value);
}

export const COMPLETION_OWNER_OPTIONS = [
  { value: "applicant", label: "Candidate" },
  { value: "recruiter_or_hr", label: "Recruiter" },
] as const;

export type CompletionOwnerValue = (typeof COMPLETION_OWNER_OPTIONS)[number]["value"];

/** Older values (worker, contractor, hr_admin, manager, system, …) fold into Candidate or Recruiter. */
export function resolveCompletionOwner(
  owner: string | null | undefined,
  libraryId: string | null | undefined
): CompletionOwnerValue {
  if (isCandidateCheckboxStep({ metadata: { workflow_step_id: libraryId ?? "" } })) return "applicant";
  if (isInternalLibraryStepId(libraryId)) return "recruiter_or_hr";
  return isApplicantCompletionOwner(owner) ? "applicant" : "recruiter_or_hr";
}

export function isInternalLibraryOnboardingStep(step: TenantOnboardingStep): boolean {
  const libraryId = readWorkflowLibraryStepId(step);
  if (libraryId === "completion-milestone") {
    return step.step_type !== "review_submit";
  }
  return INTERNAL_LIBRARY_STEP_IDS.has(libraryId);
}

/**
 * Conversion / internal gates (Pre-Hire Approval, HR review, manager approval)
 * are not applicant tasks. Completing them in the portal does not hire the candidate.
 */
export function isApplicantWaitingGateStep(step: TenantOnboardingStep): boolean {
  if (isCandidateCheckboxStep(step)) return false;
  const settings = getWorkflowSettings(step);
  if (settings.phase === "transition") return true;
  if (isInternalLibraryOnboardingStep(step)) return true;
  return !isApplicantCompletionOwner(settings.completionOwner);
}

/** Worker-facing steps must be performed by the applicant when clientPerforms is true (default). */
export function isWorkerPerformableStep(step: TenantOnboardingStep): boolean {
  const settings = getWorkflowSettings(step);
  if (settings.clientPerforms === false) {
    return false;
  }
  if (isApplicantWaitingGateStep(step)) {
    return false;
  }
  return true;
}

/**
 * Basic visibility: hide steps explicitly marked as admin-only via conditionalLogic prefix.
 * Full expression evaluation is not supported yet.
 */
export function isWorkerVisibleStep(step: TenantOnboardingStep): boolean {
  const settings = getWorkflowSettings(step);
  if (settings.adminOnly) return false;
  return isWorkerPerformableStep(step);
}

/** Whether conditional logic requests pausing the flow when this step fails. */
export function shouldPauseFlowOnStepFailure(step: TenantOnboardingStep): boolean {
  const settings = getWorkflowSettings(step);
  return evaluateConditionalLogic(settings.conditionalLogic).pauseFlowOnFail;
}

export function workflowSettingsAdminHints(step: TenantOnboardingStep): string[] {
  const settings = getWorkflowSettings(step);
  const hints: string[] = [];
  if (settings.useBraasPartner) hints.push("Uses Braas partner integration (admin-managed).");
  if (settings.notifyHrOnFail) hints.push("HR is notified on failure.");
  if (settings.provider?.trim()) hints.push(`Provider: ${settings.provider.trim()}`);
  if (settings.timeline?.trim()) hints.push(`Timeline: ${settings.timeline.trim()}`);
  if (settings.triggerAfter?.trim()) hints.push(`Runs after: ${settings.triggerAfter.trim()}`);
  const logic = settings.conditionalLogic?.trim();
  if (logic && !logic.toLowerCase().startsWith("admin only")) {
    hints.push(`Note: ${logic}`);
  }
  return hints;
}

export function listUnsupportedBuilderSettings(): string[] {
  return [
    "Arbitrary conditional expressions (only admin-only / hide-from-applicant / pause-on-fail phrases).",
    "Checker partner requires CHECKER_PARTNER_API_URL; third-party requires WORKFLOW_PARTNER_WEBHOOK_URL.",
  ];
}

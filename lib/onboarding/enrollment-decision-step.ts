import type { OnboardingStepStatus, TenantOnboardingStep } from "@/lib/onboarding/types";

/** Post-Hire library steps the candidate answers with Agree / Not ready. */
const ENROLLMENT_DECISION_STEP_IDS = new Set(["benefits-enrollment", "401k-enrollment"]);

const DEFAULT_QUESTIONS: Record<string, string> = {
  "benefits-enrollment": "Do you agree to enroll in the benefits offered with this position?",
  "401k-enrollment": "Do you agree to enroll in the 401(k) / retirement plan offered with this position?",
};

export type EnrollmentDecision = "agreed" | "not_ready";

export type EnrollmentDecisionRecord = {
  decision: EnrollmentDecision;
  question: string | null;
  answeredAt: string | null;
};

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isEnrollmentDecisionStepType(workflowStepId: string | null | undefined): boolean {
  return Boolean(workflowStepId && ENROLLMENT_DECISION_STEP_IDS.has(workflowStepId.trim()));
}

export function isEnrollmentDecisionStep(step: Pick<TenantOnboardingStep, "metadata"> | null | undefined): boolean {
  return isEnrollmentDecisionStepType(asText(step?.metadata?.workflow_step_id));
}

export function enrollmentQuestionForStep(
  step: Pick<TenantOnboardingStep, "metadata" | "title">
): string {
  const metadata = step.metadata ?? {};
  const raw = metadata.workflow_settings;
  const settings =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const configured = asText(settings.applicantQuestion) ?? asText(metadata.applicant_question);
  if (configured) return configured;
  const libraryId = asText(metadata.workflow_step_id);
  return (
    (libraryId ? DEFAULT_QUESTIONS[libraryId] : undefined) ??
    `Do you agree to complete "${step.title}"?`
  );
}

/**
 * Not ready keeps a required step open (the candidate can't move past it) and
 * skips an optional one so the candidate can continue and revisit it later.
 */
export function statusForEnrollmentDecision(
  decision: EnrollmentDecision,
  required: boolean
): OnboardingStepStatus {
  if (decision === "agreed") return "completed";
  return required ? "in_progress" : "skipped";
}

export function enrollmentDecisionData(
  decision: EnrollmentDecision,
  question: string,
  answeredAt: string,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  const isAgreed = decision === "agreed";
  return {
    enrollment_decision: decision,
    enrollment_question: question,
    enrollment_answered_at: answeredAt,
    checkbox_confirmed: isAgreed,
    checkbox_label: question,
    response: isAgreed ? question : "Not ready",
    confirmed_at: isAgreed ? answeredAt : null,
    ...(extra ?? {}),
  };
}

export function readEnrollmentDecision(data: unknown): EnrollmentDecisionRecord | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  const decision = row.enrollment_decision;
  if (decision !== "agreed" && decision !== "not_ready") return null;
  return {
    decision,
    question: asText(row.enrollment_question),
    answeredAt: asText(row.enrollment_answered_at),
  };
}

export function enrollmentDecisionLabel(decision: EnrollmentDecision): string {
  return decision === "agreed" ? "Agreed" : "Not ready";
}

/**
 * Direct Deposit and HCM / Payroll Setup are confirmation checkboxes.
 * The candidate checks one message; that message is what recruiters see later.
 */

type CheckboxStepLike = {
  step_key?: string | null;
  title?: string | null;
  metadata?: Record<string, unknown> | null;
};

const DIRECT_DEPOSIT_LIBRARY_ID = "direct-deposit-setup";
const PAYROLL_SETUP_LIBRARY_ID = "payroll-profile-creation";

function libraryId(step: CheckboxStepLike): string {
  const id = step.metadata?.workflow_step_id;
  return typeof id === "string" ? id.trim().toLowerCase() : "";
}

function titleBlob(step: CheckboxStepLike): string {
  return `${step.step_key ?? ""} ${step.title ?? ""}`.toLowerCase();
}

export function isDirectDepositCheckboxStep(step: CheckboxStepLike | null | undefined): boolean {
  if (!step) return false;
  const id = libraryId(step);
  const blob = titleBlob(step);
  return (
    id === DIRECT_DEPOSIT_LIBRARY_ID ||
    id.includes("direct-deposit") ||
    blob.includes("direct deposit") ||
    blob.includes("direct-deposit")
  );
}

/** HCM & Payroll Setup, including the Payroll Profile Creation library step. */
export function isPayrollSetupCheckboxStep(step: CheckboxStepLike | null | undefined): boolean {
  if (!step) return false;
  const id = libraryId(step);
  const blob = titleBlob(step);
  return (
    id === PAYROLL_SETUP_LIBRARY_ID ||
    id.includes("payroll-profile") ||
    blob.includes("hcm") ||
    blob.includes("payroll setup") ||
    blob.includes("payroll profile") ||
    blob.includes("payroll-profile")
  );
}

export function isCandidateCheckboxStep(step: CheckboxStepLike | null | undefined): boolean {
  return isDirectDepositCheckboxStep(step) || isPayrollSetupCheckboxStep(step);
}

function workflowSettings(step: CheckboxStepLike): Record<string, unknown> {
  const raw = step.metadata?.workflow_settings;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/** Message next to the checkbox. Uses the step title unless settings override it. */
export function candidateCheckboxMessage(step: CheckboxStepLike): string {
  const configured = workflowSettings(step).acknowledgmentText;
  if (typeof configured === "string" && configured.trim()) return configured.trim();
  const title = step.title?.trim();
  return title ? `I confirm that I have completed ${title}.` : "I confirm that I have completed this step.";
}

export type StoredCheckboxQuestion = {
  label: string;
  fieldType: "checkbox";
  answer: string;
  submittedAt: string | null;
  reviewResult: null;
};

/** One checkbox row for the post-hire step modal, from the saved candidate response. */
export function storedCheckboxQuestions(
  data: unknown,
  submittedAt: string | null
): StoredCheckboxQuestion[] | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  const message =
    (typeof row.checkbox_label === "string" && row.checkbox_label.trim()) ||
    (typeof row.response === "string" && row.response.trim()) ||
    "";
  const confirmed =
    row.checkbox_confirmed === true ||
    row.authorized === true ||
    row.direct_deposit_confirmed === true ||
    row.payroll_setup_confirmed === true;
  if (!confirmed && !(typeof row.checkbox_label === "string" && row.checkbox_label.trim())) return null;
  return [
    {
      label: message || "Confirmation",
      fieldType: "checkbox",
      answer: confirmed ? "Confirmed" : "Not confirmed",
      submittedAt,
      reviewResult: null,
    },
  ];
}

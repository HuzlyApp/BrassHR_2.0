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

export const I9_SECTION_1_CHECKBOX_LABEL =
  "I confirm that I have completed Section 1 of Form I-9 and that the information provided is true and accurate to the best of my knowledge.";

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

/** I-9 Section 1 is a confirmation checkbox, not a Firma signature. */
export function isI9CheckboxStep(
  step:
    | (CheckboxStepLike & {
        stepKey?: string | null;
        stepType?: string | null;
        snapshotStepId?: string | null;
      })
    | null
    | undefined
): boolean {
  if (!step) return false;
  const id = libraryId(step);
  const blob = `${step.stepKey ?? ""} ${step.step_key ?? ""} ${step.stepType ?? ""} ${step.snapshotStepId ?? ""} ${id} ${step.title ?? ""}`
    .trim()
    .toLowerCase();
  return (
    id === "i9-section-1" ||
    id === "i9-right-to-work-verification" ||
    blob.includes("i9-section-1") ||
    blob.includes("i9-right-to-work") ||
    blob.includes("i-9 section 1") ||
    blob.includes("i9 section 1")
  );
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
    row.payroll_setup_confirmed === true ||
    row.i9_section_1_confirmed === true ||
    row.form_i9_section_1_completed === true;
  if (!confirmed && !(typeof row.checkbox_label === "string" && row.checkbox_label.trim())) return null;
  return [
    {
      label: message || (row.i9_section_1_confirmed === true ? I9_SECTION_1_CHECKBOX_LABEL : "Confirmation"),
      fieldType: "checkbox",
      answer: confirmed ? "Confirmed" : "Not confirmed",
      submittedAt,
      reviewResult: null,
    },
  ];
}

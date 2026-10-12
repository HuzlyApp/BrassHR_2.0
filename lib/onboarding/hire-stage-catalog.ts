/**
 * Hire-journey stage for each library step key.
 * Source: supabase/migrations/20260915163426_map_prehire_posthire_ui_step_library.sql
 * (`stage_name` written into onboarding_step_library.default_settings).
 * Keyword guesses are not this map.
 */
export const HIRE_STAGE_BY_STEP_KEY: Record<string, string> = {
  "collect-extra-files": "Intake",
  "collect-references": "Intake",
  "custom-form": "Intake",
  "resume-basic-profile": "Intake",
  "parameterized-job-application": "Intake",
  "references-collection": "Intake",
  "custom-application-form": "Intake",

  "recruiter-screening": "Screening",
  "skill-qualification-assessment": "Screening",
  "reference-verification": "Screening",

  "interview-qualification": "Interview",
  "internal-select": "Interview",
  "client-review": "Interview",
  "candidate-selection": "Interview",

  "release-to-client": "Submission",
  "submit-to-msp": "Submission",

  "background-check": "Compliance",
  "drug-test-screening": "Compliance",
  "oig-exclusion-check": "Compliance",
  "credential-license-verification": "Compliance",
  "ssn-identity-verification": "Compliance",
  "adverse-action-process": "Compliance",

  "pay-rate-hire-date": "Offer & Agreement",
  "offer-acceptance": "Offer & Agreement",
  "pay-rate-accepted": "Offer & Agreement",
  "employee-agreement": "Offer & Agreement",
  "i9-right-to-work-verification": "Offer & Agreement",

  "manager-facility-approval": "Approvals",
  "hr-final-approval": "Approvals",

  "tax-forms": "Paperwork",
  "i9-section-2": "Paperwork",
  "document-upload": "Paperwork",

  "direct-deposit-setup": "Payroll & Pay",
  "benefits-enrollment": "Payroll & Pay",
  "401k-enrollment": "Payroll & Pay",
  "payroll-profile-creation": "Payroll & Pay",

  "welcome-packet-esign": "Policies",
  "policy-acknowledgment": "Policies",

  "equipment-badge-acknowledgment": "Access & Equipment",
  "badge-equipment-issuance": "Access & Equipment",
  "schedule-assignment": "Access & Equipment",
  "facility-access-setup": "Access & Equipment",
  "benefits-confirmation": "Access & Equipment",

  "safety-training": "Training",
  "training-modules-quiz": "Training",
  "orientation-video": "Training",
  "compliance-training": "Training",
  "certification-upload": "Training",

  "welcome-email": "Kickoff",
  "manager-welcome-call": "Kickoff",

  "final-onboarding-call": "Day One Ready",
  "buddy-mentor-assignment": "Day One Ready",
  "completion-milestone": "Day One Ready",
};

export type HireLifecycle = "pre_hire" | "post_hire";

/** Pre-Hire board stages (Steps Library order). */
export const PRE_HIRE_FIGMA_STAGES = [
  "Intake",
  "Screening",
  "Interview",
  "Submission",
  "Compliance",
  "Offer & Agreement",
  "Approvals",
] as const;

/** Align with Figma Post-hire board (Payroll · Access · Training · Welcome). */
export const POST_HIRE_FIGMA_STAGES = [
  "Payroll & Tax",
  "Access & Systems",
  "Training & Policy",
  "Welcome & Complete",
] as const;

/** Post-hire library stages; the Post-Hire board folds these into POST_HIRE_FIGMA_STAGES. */
export const POST_HIRE_LIBRARY_STAGES = [
  "Kickoff",
  "Paperwork",
  "Payroll & Pay",
  "Policies",
  "Access & Equipment",
  "Training",
  "Day One Ready",
] as const;

const PRE_HIRE_STAGE_KEYS = new Set(PRE_HIRE_FIGMA_STAGES.map((stage) => stage.toLowerCase()));
const POST_HIRE_STAGE_KEYS = new Set(
  [...POST_HIRE_FIGMA_STAGES, ...POST_HIRE_LIBRARY_STAGES].map((stage) => stage.toLowerCase())
);

/**
 * Library steps that workflows also place in the other phase (e.g. W2 puts I-9 and
 * Pay Rate & Hire Date after Pre-Hire Approval). These win over HIRE_STAGE_BY_STEP_KEY
 * so a step never lands on the other phase's board.
 */
const HIRE_STAGE_BY_STEP_KEY_FOR_LIFECYCLE: Record<HireLifecycle, Record<string, string>> = {
  pre_hire: {
    "document-upload": "Intake",
    "completion-milestone": "Approvals",
  },
  post_hire: {
    "pay-rate-hire-date": "Payroll & Pay",
    "i9-right-to-work-verification": "Paperwork",
    "i9-section-1": "Paperwork",
    "custom-form": "Paperwork",
    "custom-application-form": "Paperwork",
    "collect-extra-files": "Paperwork",
  },
};

/** Pre-Hire for `transition` (the Pre-Hire Approval gate) and any non-post-hire phase. */
export function hireLifecycleForPhase(phase: unknown): HireLifecycle | null {
  const value = String(phase ?? "").trim().toLowerCase();
  if (!value) return null;
  return value === "post_hire" ? "post_hire" : "pre_hire";
}

/** Which board a known stage name belongs to; null for custom stage names. */
export function hireStageLifecycle(stageName: string | null | undefined): HireLifecycle | null {
  const key = String(stageName ?? "").trim().toLowerCase();
  if (!key) return null;
  if (PRE_HIRE_STAGE_KEYS.has(key)) return "pre_hire";
  if (POST_HIRE_STAGE_KEYS.has(key)) return "post_hire";
  return null;
}

export function hireStageFitsLifecycle(
  stageName: string | null | undefined,
  lifecycle: HireLifecycle
): boolean {
  const owner = hireStageLifecycle(stageName);
  return owner === null || owner === lifecycle;
}

function normalizeStepKey(stepKey: string | null | undefined): string[] {
  const key = String(stepKey ?? "").trim();
  if (!key) return [];
  const bare = key.replace(/^step-/, "");
  return bare === key ? [key] : [key, bare];
}

/**
 * Library stage for a step key. With a lifecycle, only returns a stage on that phase's board,
 * so a Pre-Hire library step placed in Post-Hire never resolves to a Pre-Hire stage.
 */
export function hireStageForStepKey(
  stepKey: string | null | undefined,
  lifecycle?: HireLifecycle | null
): string | null {
  for (const key of normalizeStepKey(stepKey)) {
    const stage =
      (lifecycle ? HIRE_STAGE_BY_STEP_KEY_FOR_LIFECYCLE[lifecycle][key] : undefined) ??
      HIRE_STAGE_BY_STEP_KEY[key];
    if (!stage) continue;
    if (lifecycle && !hireStageFitsLifecycle(stage, lifecycle)) return null;
    return stage;
  }
  return null;
}

/**
 * Persist the library stage on a workflow snapshot when the builder did not set one.
 * An explicit stage from the other phase is replaced so it cannot leak onto the wrong board.
 */
export function stampHireStageOnStepSettings(
  stepKey: string,
  settings: Record<string, unknown>
): Record<string, unknown> {
  const lifecycle = hireLifecycleForPhase(settings.phase);
  const existing = typeof settings.stageName === "string" ? settings.stageName.trim() : "";
  if (existing && (!lifecycle || hireStageFitsLifecycle(existing, lifecycle))) return settings;

  const stageName = hireStageForStepKey(stepKey, lifecycle);
  if (stageName) return { ...settings, stageName };
  if (!existing) return settings;
  const rest = { ...settings };
  delete rest.stageName;
  return rest;
}

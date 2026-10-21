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
  "follow-up-interview": "Interview",
  "internal-select": "Interview",
  "client-review": "Interview",
  "candidate-selection": "Interview",

  "submit-to-msp": "Submission",
  "submit-to-client": "Submission",
  "manager-facility-approval": "Submission",
  "release-to-client": "Submission",

  "authorization-esign": "Compliance",
  "background-check": "Compliance",
  "drug-test-screening": "Compliance",
  "oig-exclusion-check": "Compliance",
  "credential-license-verification": "Compliance",
  "ssn-identity-verification": "Compliance",
  "adverse-action-process": "Compliance",
  "record-selection": "Compliance",

  "pay-rate-hire-date": "Offer & Agreement",
  "pay-and-start-date": "Offer & Agreement",
  "offer-prep": "Offer & Agreement",
  "manager-approval": "Offer & Agreement",
  "employee-agreement": "Offer & Agreement",
  "agreement-esign": "Offer & Agreement",
  "i9-right-to-work-verification": "Offer & Agreement",
  "i9-section-1": "Offer & Agreement",
  "offer-acceptance": "Offer & Agreement",
  "offer-accepted": "Offer & Agreement",
  "pay-rate-accepted": "Offer & Agreement",

  "hr-final-approval": "Approvals",
  "pre-hire-completion-milestone": "Approvals",

  "manager-welcome-call": "Kickoff",
  "welcome-packet-esign": "Kickoff",

  "payroll-profile-creation": "Payroll & Pay",
  "tax-forms": "Payroll & Pay",
  w9: "Payroll & Pay",
  "direct-deposit-setup": "Payroll & Pay",
  "i9-section-2": "Payroll & Pay",
  "benefits-enrollment": "Payroll & Pay",
  "401k-enrollment": "Payroll & Pay",

  "system-access": "Access & Equipment",
  "badge-equipment-issuance": "Access & Equipment",
  "equipment-badge-acknowledgment": "Access & Equipment",
  "schedule-assignment": "Access & Equipment",
  "facility-access-setup": "Access & Equipment",
  "benefits-confirmation": "Access & Equipment",

  "orientation-video": "Training",
  "policy-acknowledgment": "Training",
  "safety-training": "Training",
  "training-modules-quiz": "Training",
  "compliance-training": "Training",
  "certification-upload": "Training",
  "health-screening-waiver": "Training",

  "buddy-mentor-assignment": "Day One Ready",
  "post-hire-completion-milestone": "Day One Ready",

  "document-upload": "Paperwork",
  "welcome-email": "Kickoff",
  "final-onboarding-call": "Day One Ready",
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

/**
 * Preferred step order within each Pre-Hire stage group (Steps Library / Figma).
 * Steps that belong to a group follow this sequence inside that group.
 */
export const PRE_HIRE_STAGE_STEP_ORDER: Record<
  (typeof PRE_HIRE_FIGMA_STAGES)[number],
  readonly string[]
> = {
  Intake: [
    "resume-basic-profile",
    "parameterized-job-application",
    "collect-extra-files",
    "collect-references",
    "references-collection",
    "custom-form",
    "custom-application-form",
    "document-upload",
  ],
  Screening: [
    "recruiter-screening",
    "skill-qualification-assessment",
    "reference-verification",
  ],
  Interview: [
    "interview-qualification",
    "follow-up-interview",
    "internal-select",
    "client-review",
    "candidate-selection",
  ],
  Submission: [
    "submit-to-msp",
    "submit-to-client",
    "manager-facility-approval",
    "release-to-client",
  ],
  Compliance: [
    "authorization-esign",
    "background-check",
    "drug-test-screening",
    "oig-exclusion-check",
    "credential-license-verification",
    "ssn-identity-verification",
    "adverse-action-process",
    "record-selection",
  ],
  "Offer & Agreement": [
    "pay-rate-hire-date",
    "pay-and-start-date",
    "offer-prep",
    "manager-approval",
    "employee-agreement",
    "agreement-esign",
    "i9-right-to-work-verification",
    "i9-section-1",
    "offer-acceptance",
    "offer-accepted",
    "pay-rate-accepted",
  ],
  Approvals: ["hr-final-approval", "pre-hire-completion-milestone", "completion-milestone"],
};

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
  "Welcome",
  "Payroll and tax",
  "Access and systems",
  "Training and policy",
  "Completion",
] as const;

const PRE_HIRE_STAGE_KEYS = new Set([
  ...PRE_HIRE_FIGMA_STAGES.map((stage) => stage.toLowerCase()),
  "offer and agreement",
]);
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

/** Canvas chip: "Pre-Hire - Offer & Agreement". Phase only when the stage is unknown. */
export function canvasStepPhaseStageLabel(input: {
  phase: unknown;
  stepKey: string | null | undefined;
  stageName?: string | null;
}): string {
  const lifecycle = hireLifecycleForPhase(input.phase);
  const phaseLabel = lifecycle === "post_hire" ? "Post-Hire" : "Pre-Hire";
  const explicit = String(input.stageName ?? "").trim();
  const stage =
    explicit && (!lifecycle || hireStageFitsLifecycle(explicit, lifecycle))
      ? explicit
      : hireStageForStepKey(input.stepKey, lifecycle);
  if (!stage) return phaseLabel;
  return `${phaseLabel} - ${stage}`;
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

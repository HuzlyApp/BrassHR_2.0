import type { StepCategory, StepDefinition } from "./types";

export type LibraryHirePhase = "pre_hire" | "post_hire";

export const CUSTOM_STEP_ID = "custom-step";
export const CUSTOM_STEPS_CATEGORY_ID = "custom-steps";
export const CUSTOM_FLEXIBLE_CATEGORY_ID = "custom-flexible";

/** Figma onboarding builder — category / step accent colors. */
export const LIBRARY_THEME_COLORS = {
  slate: "#64748B",
  intake: "#2563EB",
  screening: "#06B6D4",
  interview: "#8B5CF6",
  submission: "#F97316",
  compliance: "#F59E0B",
  offerAgreement: "#50C878",
  approvals: "#6366F1",
  accessSystems: "#0D9488",
  trainingPolicy: "#7C3AED",
  welcomeComplete: "#E11D48",
} as const;

const CATEGORY_THEME: Record<
  string,
  { color: string; defaultPhase: LibraryHirePhase | "both"; label?: string }
> = {
  "custom-steps": { color: LIBRARY_THEME_COLORS.slate, defaultPhase: "both", label: "Custom Steps" },
  "application-profile": {
    color: LIBRARY_THEME_COLORS.intake,
    defaultPhase: "pre_hire",
    label: "Intake",
  },
  screening: {
    color: LIBRARY_THEME_COLORS.screening,
    defaultPhase: "pre_hire",
    label: "Screening",
  },
  interview: {
    color: LIBRARY_THEME_COLORS.interview,
    defaultPhase: "pre_hire",
    label: "Interview",
  },
  submission: {
    color: LIBRARY_THEME_COLORS.submission,
    defaultPhase: "pre_hire",
    label: "Submission",
  },
  "document-esign": {
    color: LIBRARY_THEME_COLORS.intake,
    defaultPhase: "post_hire",
    label: "Documents",
  },
  "offer-agreement": {
    color: LIBRARY_THEME_COLORS.offerAgreement,
    defaultPhase: "pre_hire",
    label: "Offer & Agreement",
  },
  "screening-compliance": {
    color: LIBRARY_THEME_COLORS.compliance,
    defaultPhase: "pre_hire",
    label: "Compliance",
  },
  "payroll-financial": {
    color: LIBRARY_THEME_COLORS.intake,
    defaultPhase: "post_hire",
    label: "Payroll & Tax",
  },
  "training-development": {
    color: LIBRARY_THEME_COLORS.trainingPolicy,
    defaultPhase: "post_hire",
    label: "Training & Policy",
  },
  "approval-decision": {
    color: LIBRARY_THEME_COLORS.approvals,
    defaultPhase: "pre_hire",
    label: "Approvals",
  },
  "communication-notification": {
    color: LIBRARY_THEME_COLORS.welcomeComplete,
    defaultPhase: "post_hire",
    label: "Welcome & Complete",
  },
  "team-operational": {
    color: LIBRARY_THEME_COLORS.accessSystems,
    defaultPhase: "post_hire",
    label: "Access & Systems",
  },
  "custom-flexible": {
    color: LIBRARY_THEME_COLORS.slate,
    defaultPhase: "both",
    label: "Custom Steps",
  },
};

/** Legacy DB buckets that combine multiple Figma groups — keep per-step accents. */
const MIXED_CATEGORY_STEP_COLORS: Record<string, Record<string, string>> = {
  "approval-decision": {
    "recruiter-screening": LIBRARY_THEME_COLORS.screening,
    "interview-qualification": LIBRARY_THEME_COLORS.interview,
    "client-review": LIBRARY_THEME_COLORS.interview,
    "candidate-selection": LIBRARY_THEME_COLORS.interview,
    "release-to-client": LIBRARY_THEME_COLORS.submission,
    "submit-to-msp": LIBRARY_THEME_COLORS.submission,
    "adverse-action-process": LIBRARY_THEME_COLORS.compliance,
    "offer-acceptance": LIBRARY_THEME_COLORS.approvals,
    "employee-agreement": LIBRARY_THEME_COLORS.offerAgreement,
  },
  "screening-compliance": {
    "background-check": LIBRARY_THEME_COLORS.compliance,
    "drug-test-screening": LIBRARY_THEME_COLORS.compliance,
    "oig-exclusion-check": LIBRARY_THEME_COLORS.compliance,
    "credential-license-verification": LIBRARY_THEME_COLORS.compliance,
    "ssn-identity-verification": LIBRARY_THEME_COLORS.compliance,
    "adverse-action-process": LIBRARY_THEME_COLORS.compliance,
    "recruiter-screening": LIBRARY_THEME_COLORS.screening,
    "skill-qualification-assessment": LIBRARY_THEME_COLORS.screening,
    "reference-verification": LIBRARY_THEME_COLORS.screening,
  },
};

const MIXED_CATEGORY_IDS = new Set(Object.keys(MIXED_CATEGORY_STEP_COLORS));

const PRE_HIRE_STEP_IDS = new Set([
  "custom-step",
  "collect-extra-files",
  "collect-references",
  "resume-basic-profile",
  "parameterized-job-application",
  "references-collection",
  "skill-qualification-assessment",
  "custom-application-form",
  "custom-form",
  "recruiter-screening",
  "interview-qualification",
  "internal-select",
  "client-review",
  "candidate-selection",
  "release-to-client",
  "submit-to-msp",
  "background-check",
  "drug-test-screening",
  "oig-exclusion-check",
  "reference-verification",
  "credential-license-verification",
  "ssn-identity-verification",
  "offer-acceptance",
  "pay-rate-hire-date",
  "i9-right-to-work-verification",
  "pre-hire-completion-milestone",
  "manager-facility-approval",
  "hr-final-approval",
  "conditional-branch-decision",
  "adverse-action-process",
  "employee-agreement",
  "conditional-logic",
  "parallel-step-group",
  "manual-task-hr-action",
  "external-integration",
]);

const POST_HIRE_STEP_IDS = new Set([
  "document-upload",
  "welcome-packet-esign",
  "tax-forms",
  "policy-acknowledgment",
  "equipment-badge-acknowledgment",
  "direct-deposit-setup",
  "benefits-enrollment",
  "401k-enrollment",
  "payroll-profile-creation",
  "i9-section-2",
  "safety-training",
  "training-modules-quiz",
  "orientation-video",
  "compliance-training",
  "certification-upload",
  "welcome-email",
  "status-update-notification",
  "manager-welcome-call",
  "final-onboarding-call",
  "reminder-follow-up-notification",
  "badge-equipment-issuance",
  "buddy-mentor-assignment",
  "schedule-assignment",
  "facility-access-setup",
  "benefits-confirmation",
  "completion-milestone",
  "post-hire-completion-milestone",
]);

function resolveCategoryConfig(categoryId: string, categoryLabel: string) {
  const known = CATEGORY_THEME[categoryId];
  if (known) return known;

  const label = categoryLabel.toLowerCase();
  if (/custom/.test(label)) {
    return { color: LIBRARY_THEME_COLORS.slate, defaultPhase: "both" as const };
  }
  if (/screen/.test(label)) {
    return { color: LIBRARY_THEME_COLORS.screening, defaultPhase: "pre_hire" as const };
  }
  if (/interview/.test(label)) {
    return { color: LIBRARY_THEME_COLORS.interview, defaultPhase: "pre_hire" as const };
  }
  if (/payroll|financial|tax/.test(label)) {
    return { color: LIBRARY_THEME_COLORS.intake, defaultPhase: "post_hire" as const };
  }
  if (/train|policy|development/.test(label)) {
    return { color: LIBRARY_THEME_COLORS.trainingPolicy, defaultPhase: "post_hire" as const };
  }
  if (/access|operational|team|equipment|badge/.test(label)) {
    return { color: LIBRARY_THEME_COLORS.accessSystems, defaultPhase: "post_hire" as const };
  }
  if (/welcome|communication|notification/.test(label)) {
    return { color: LIBRARY_THEME_COLORS.welcomeComplete, defaultPhase: "post_hire" as const };
  }
  if (/compliance/.test(label)) {
    return { color: LIBRARY_THEME_COLORS.compliance, defaultPhase: "pre_hire" as const };
  }
  if (/approv|decision|offer/.test(label)) {
    return { color: LIBRARY_THEME_COLORS.approvals, defaultPhase: "pre_hire" as const };
  }
  if (/intake|application|profile/.test(label)) {
    return { color: LIBRARY_THEME_COLORS.intake, defaultPhase: "pre_hire" as const };
  }
  if (/document|esign/.test(label)) {
    return { color: LIBRARY_THEME_COLORS.intake, defaultPhase: "post_hire" as const };
  }

  return { color: LIBRARY_THEME_COLORS.slate, defaultPhase: "pre_hire" as const };
}

export function resolveStepLibraryPhase(
  step: Pick<StepDefinition, "id" | "defaultPhase">,
  categoryId: string,
  categoryLabel: string
): LibraryHirePhase {
  if (step.defaultPhase === "post_hire") return "post_hire";
  if (step.defaultPhase === "pre_hire" || step.defaultPhase === "transition") return "pre_hire";

  if (POST_HIRE_STEP_IDS.has(step.id)) return "post_hire";
  if (PRE_HIRE_STEP_IDS.has(step.id)) return "pre_hire";

  const category = resolveCategoryConfig(categoryId, categoryLabel);
  if (category.defaultPhase === "both") return "pre_hire";
  return category.defaultPhase;
}

export function resolveStepThemeColor(
  step: Pick<StepDefinition, "id">,
  categoryId: string,
  categoryLabel: string
): string {
  if (step.id === CUSTOM_STEP_ID) {
    return LIBRARY_THEME_COLORS.slate;
  }

  const categoryColor = resolveCategoryConfig(categoryId, categoryLabel).color;

  if (MIXED_CATEGORY_IDS.has(categoryId)) {
    return MIXED_CATEGORY_STEP_COLORS[categoryId]?.[step.id] ?? categoryColor;
  }

  // Icon bg follows the visible library section (Intake, Approvals, etc.).
  return categoryColor;
}

export function resolveCategoryThemeColor(categoryId: string, categoryLabel: string): string {
  return resolveCategoryConfig(categoryId, categoryLabel).color;
}

export function resolveCategoryDisplayLabel(categoryId: string, categoryLabel: string): string {
  return resolveCategoryConfig(categoryId, categoryLabel).label ?? categoryLabel;
}

export function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized.slice(0, 6);
  const int = Number.parseInt(value, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function filterStepLibraryByPhase(
  categories: StepCategory[],
  phase: LibraryHirePhase
): StepCategory[] {
  const phased = categories
    .map((category) => {
      const categoryConfig = resolveCategoryConfig(category.id, category.label);
      return {
        ...category,
        steps: category.steps.filter((step) => {
          if (categoryConfig.defaultPhase === "both") return true;
          return resolveStepLibraryPhase(step, category.id, category.label) === phase;
        }),
      };
    })
    .filter((category) => category.steps.length > 0);

  const withFigmaGroups =
    phase === "pre_hire"
      ? ensurePreHireFigmaGroups(phased, phase)
      : ensurePostHireFigmaGroups(phased, phase);

  return sortLibraryCategoriesForDisplay(mergeCustomStepCategories(withFigmaGroups), phase);
}

export type FigmaLibraryStepDef = {
  id: string;
  label: string;
  description?: string;
  iconKey?: string;
  defaultPhase?: StepDefinition["defaultPhase"];
};

export type FigmaLibraryGroupDef = {
  id: string;
  label: string;
  steps: FigmaLibraryStepDef[];
};

/** Figma Pre-hire library groups — move existing steps here, or add when missing. */
export const FIGMA_PRE_HIRE_GROUPS: FigmaLibraryGroupDef[] = [
  {
    id: "application-profile",
    label: "Intake",
    steps: [
      {
        id: "collect-extra-files",
        label: "Collect Extra Files",
        description: "Request additional files from the candidate during intake.",
        iconKey: "collect-extra-files",
        defaultPhase: "pre_hire",
      },
      {
        id: "collect-references",
        label: "Collect References",
        description: "Ask the candidate to provide professional references.",
        iconKey: "collect-references",
        defaultPhase: "pre_hire",
      },
      {
        id: "custom-form",
        label: "Custom Form",
        description: "Add a custom intake form for this workflow.",
        iconKey: "custom-form",
        defaultPhase: "pre_hire",
      },
    ],
  },
  {
    id: "screening",
    label: "Screening",
    steps: [
      {
        id: "recruiter-screening",
        label: "Recruiter Screening",
        description: "Recruiter screens the candidate before interview or client review.",
        iconKey: "recruiter-screening",
        defaultPhase: "pre_hire",
      },
      {
        id: "skill-qualification-assessment",
        label: "Skill / Qualification Assessment",
        description: "Assess applicant skills and qualifications.",
        iconKey: "skill-qualification-assessment",
        defaultPhase: "pre_hire",
      },
      {
        id: "reference-verification",
        label: "Reference Verification",
        description: "Track reference verification.",
        iconKey: "reference-verification",
        defaultPhase: "pre_hire",
      },
    ],
  },
  {
    id: "interview",
    label: "Interview",
    steps: [
      {
        id: "interview-qualification",
        label: "Interview/Qualification",
        description: "Track interview or qualification steps for the candidate.",
        iconKey: "interview-qualification",
        defaultPhase: "pre_hire",
      },
      {
        id: "internal-select",
        label: "Internal Select",
        description: "Internally select the candidate to move forward.",
        iconKey: "internal-select",
        defaultPhase: "pre_hire",
      },
    ],
  },
  {
    id: "submission",
    label: "Submission",
    steps: [
      {
        id: "release-to-client",
        label: "Release to Client",
        description:
          "Mark recruitment complete and hand the candidate off to the client for final hiring.",
        iconKey: "release-to-client",
        defaultPhase: "transition",
      },
      {
        id: "submit-to-msp",
        label: "Submit to MSP",
        description:
          "Prepare the candidate profile and required packet, then submit the candidate to the MSP.",
        iconKey: "submit-to-msp",
        defaultPhase: "pre_hire",
      },
    ],
  },
  {
    id: "screening-compliance",
    label: "Compliance",
    steps: [
      {
        id: "background-check",
        label: "Background Check",
        description: "Track background check completion.",
        iconKey: "background-check",
        defaultPhase: "pre_hire",
      },
      {
        id: "drug-test-screening",
        label: "Drug Test / Screening",
        description: "Track drug test or screening requirements.",
        iconKey: "drug-test-screening",
        defaultPhase: "pre_hire",
      },
      {
        id: "oig-exclusion-check",
        label: "OIG / Exclusion Check",
        description: "Track OIG or exclusion screening.",
        iconKey: "oig-exclusion-check",
        defaultPhase: "pre_hire",
      },
      {
        id: "credential-license-verification",
        label: "Credential / License Verification",
        description: "Verify professional credentials and licenses.",
        iconKey: "credential-license-verification",
        defaultPhase: "pre_hire",
      },
      {
        id: "ssn-identity-verification",
        label: "SSN / Identity Verification",
        description: "Collect identity verification documentation.",
        iconKey: "ssn-identity-verification",
        defaultPhase: "pre_hire",
      },
      {
        id: "adverse-action-process",
        label: "Adverse Action Process",
        description: "Track adverse action steps when required.",
        iconKey: "adverse-action-process",
        defaultPhase: "pre_hire",
      },
    ],
  },
  {
    id: "offer-agreement",
    label: "Offer & Agreement",
    steps: [
      {
        id: "pay-rate-hire-date",
        label: "Pay and Start Date",
        description: "Confirm pay rate and agreed start date.",
        iconKey: "pay-and-start-date",
        defaultPhase: "pre_hire",
      },
      {
        id: "employee-agreement",
        label: "Authorization e-sign",
        description: "Collect authorization e-sign signatures.",
        iconKey: "agreement-esign",
        defaultPhase: "pre_hire",
      },
      {
        id: "offer-acceptance",
        label: "Pay Rate Accepted",
        description: "Track pay rate acceptance from the candidate.",
        iconKey: "offer-accepted",
        defaultPhase: "pre_hire",
      },
      {
        id: "i9-right-to-work-verification",
        label: "I-9 section 1",
        description: "Complete I-9 Section 1 for the candidate.",
        iconKey: "i9-section-1",
        defaultPhase: "pre_hire",
      },
      {
        id: "pre-hire-completion-milestone",
        label: "Pre Hire Completion / Milestone",
        description: "Shows the Pre-Hire completion screen after the candidate finishes the other Pre-Hire steps.",
        iconKey: "completion-milestone",
        defaultPhase: "pre_hire",
      },
    ],
  },
  {
    id: "approval-decision",
    label: "Approvals",
    steps: [
      {
        id: "manager-facility-approval",
        label: "Manager / Facility Approval",
        description: "Request manager or facility approval.",
        iconKey: "manager-facility-approval",
        defaultPhase: "pre_hire",
      },
      {
        id: "hr-final-approval",
        label: "HR Final Approval",
        description: "Request final HR approval before hire.",
        iconKey: "hr-final-approval",
        defaultPhase: "pre_hire",
      },
    ],
  },
];

/** Figma Post-hire library groups — single Payroll & Tax section (no duplicates). */
export const FIGMA_POST_HIRE_GROUPS: FigmaLibraryGroupDef[] = [
  {
    id: "payroll-financial",
    label: "Payroll & Tax",
    steps: [
      {
        id: "tax-forms",
        label: "Tax Forms (W-4 / State)",
        description: "Collect payroll tax forms.",
        iconKey: "tax-forms",
        defaultPhase: "post_hire",
      },
      {
        id: "direct-deposit-setup",
        label: "Direct Deposit Setup",
        description: "Collect direct deposit information.",
        iconKey: "direct-deposit-setup",
        defaultPhase: "post_hire",
      },
      {
        id: "benefits-enrollment",
        label: "Benefits Enrollment / Selection",
        description: "Collect benefits enrollment choices.",
        iconKey: "benefits-enrollment",
        defaultPhase: "post_hire",
      },
      {
        id: "401k-enrollment",
        label: "401K / Retirement Enrollment",
        description: "Collect retirement enrollment choices.",
        iconKey: "401k-enrollment",
        defaultPhase: "post_hire",
      },
      {
        id: "payroll-profile-creation",
        label: "Payroll Profile Creation",
        description: "Create the payroll profile checklist.",
        iconKey: "payroll-profile-creation",
        defaultPhase: "post_hire",
      },
      {
        id: "i9-section-2",
        label: "I-9 (2)",
        description: "Complete I-9 Section 2 / E-Verify for the new hire.",
        iconKey: "i9-section-2",
        defaultPhase: "post_hire",
      },
    ],
  },
  {
    id: "training-development",
    label: "Training & Policy",
    steps: [
      {
        id: "document-upload",
        label: "Document Upload",
        description: "Request tenant-specific documents.",
        iconKey: "document-upload",
        defaultPhase: "post_hire",
      },
      {
        id: "welcome-packet-esign",
        label: "Welcome Packet & eSign",
        description: "Collect signed onboarding packet acknowledgments.",
        iconKey: "welcome-packet-esign",
        defaultPhase: "post_hire",
      },
      {
        id: "policy-acknowledgment",
        label: "Policy Acknowledgment",
        description: "Collect policy acknowledgments.",
        iconKey: "policy-acknowledgment",
        defaultPhase: "post_hire",
      },
      {
        id: "safety-training",
        label: "Safety Training",
        description: "Assign safety training tasks.",
        iconKey: "safety-training",
        defaultPhase: "post_hire",
      },
      {
        id: "training-modules-quiz",
        label: "Training Modules + Quiz",
        description: "Assign training modules and quiz questions.",
        iconKey: "training-modules-quiz",
        defaultPhase: "post_hire",
      },
      {
        id: "orientation-video",
        label: "Orientation / Onboarding Video",
        description: "Assign orientation content.",
        iconKey: "orientation-video",
        defaultPhase: "post_hire",
      },
      {
        id: "compliance-training",
        label: "Compliance Training",
        description: "Assign compliance training content.",
        iconKey: "compliance-training",
        defaultPhase: "post_hire",
      },
      {
        id: "certification-upload",
        label: "Certification Upload / Renewal",
        description: "Request certification upload or renewal details.",
        iconKey: "certification-upload",
        defaultPhase: "post_hire",
      },
    ],
  },
  {
    id: "team-operational",
    label: "Access & Systems",
    steps: [
      {
        id: "equipment-badge-acknowledgment",
        label: "Equipment / Badge Acknowledgment",
        description: "Track equipment or badge acknowledgment.",
        iconKey: "equipment-badge-acknowledgment",
        defaultPhase: "post_hire",
      },
      {
        id: "badge-equipment-issuance",
        label: "Badge / Equipment Issuance",
        description: "Track badge or equipment issuance.",
        iconKey: "badge-equipment-issuance",
        defaultPhase: "post_hire",
      },
      {
        id: "schedule-assignment",
        label: "Schedule Assignment",
        description: "Assign work schedule for the new hire.",
        iconKey: "schedule-assignment",
        defaultPhase: "post_hire",
      },
      {
        id: "facility-access-setup",
        label: "Facility Access Setup",
        description: "Set up facility access for the new hire.",
        iconKey: "facility-access-setup",
        defaultPhase: "post_hire",
      },
      {
        id: "benefits-confirmation",
        label: "Benefits Confirmation",
        description: "Confirm benefits enrollment details.",
        iconKey: "benefits-confirmation",
        defaultPhase: "post_hire",
      },
    ],
  },
  {
    id: "communication-notification",
    label: "Welcome & Complete",
    steps: [
      {
        id: "welcome-email",
        label: "Send Message",
        description: "Send a welcome or onboarding message to the new hire.",
        iconKey: "welcome-email",
        defaultPhase: "post_hire",
      },
      {
        id: "manager-welcome-call",
        label: "Welcome Call",
        description: "Schedule or track a welcome call.",
        iconKey: "manager-welcome-call",
        defaultPhase: "post_hire",
      },
      {
        id: "final-onboarding-call",
        label: "Final Onboarding Call",
        description: "Schedule or track the final onboarding call.",
        iconKey: "final-onboarding-call",
        defaultPhase: "post_hire",
      },
      {
        id: "buddy-mentor-assignment",
        label: "Buddy / Mentor Assignment",
        description: "Assign a buddy or mentor to the new hire.",
        iconKey: "buddy-mentor-assignment",
        defaultPhase: "post_hire",
      },
      {
        id: "completion-milestone",
        label: "Onboarding Complete",
        description: "Mark onboarding complete.",
        iconKey: "completion-milestone",
        defaultPhase: "post_hire",
      },
      {
        id: "post-hire-completion-milestone",
        label: "Post hire Completion / Milestone",
        description: "Shows the Post-Hire completion screen after the candidate finishes the other Post-Hire steps.",
        iconKey: "completion-milestone",
        defaultPhase: "post_hire",
      },
    ],
  },
];

/** @deprecated Use FIGMA_PRE_HIRE_GROUPS Intake steps. */
export const FIGMA_INTAKE_STEPS = FIGMA_PRE_HIRE_GROUPS[0]!.steps;

const FIGMA_PRE_HIRE_STEP_IDS = new Set(
  FIGMA_PRE_HIRE_GROUPS.flatMap((group) => group.steps.map((step) => step.id))
);

const FIGMA_POST_HIRE_STEP_IDS = new Set(
  FIGMA_POST_HIRE_GROUPS.flatMap((group) => group.steps.map((step) => step.id))
);

/** Map Figma stage display names (and close variants) → library theme colors. */
const STAGE_NAME_THEME_COLORS: Record<string, string> = {
  intake: LIBRARY_THEME_COLORS.intake,
  screening: LIBRARY_THEME_COLORS.screening,
  interview: LIBRARY_THEME_COLORS.interview,
  submission: LIBRARY_THEME_COLORS.submission,
  compliance: LIBRARY_THEME_COLORS.compliance,
  "offer & agreement": LIBRARY_THEME_COLORS.offerAgreement,
  "offer and agreement": LIBRARY_THEME_COLORS.offerAgreement,
  approvals: LIBRARY_THEME_COLORS.approvals,
  "payroll & tax": LIBRARY_THEME_COLORS.intake,
  "payroll and tax": LIBRARY_THEME_COLORS.intake,
  "access & systems": LIBRARY_THEME_COLORS.accessSystems,
  "access and systems": LIBRARY_THEME_COLORS.accessSystems,
  "training & policy": LIBRARY_THEME_COLORS.trainingPolicy,
  "training and policy": LIBRARY_THEME_COLORS.trainingPolicy,
  "welcome & complete": LIBRARY_THEME_COLORS.welcomeComplete,
  "welcome and complete": LIBRARY_THEME_COLORS.welcomeComplete,
};

/** Canvas step ids that are not always listed under a Figma group id. */
const CANVAS_STEP_THEME_ALIASES: Record<string, string> = {
  "resume-basic-profile": LIBRARY_THEME_COLORS.intake,
  "parameterized-job-application": LIBRARY_THEME_COLORS.intake,
  "references-collection": LIBRARY_THEME_COLORS.intake,
  "collect-references": LIBRARY_THEME_COLORS.intake,
  "collect-extra-files": LIBRARY_THEME_COLORS.intake,
  "custom-form": LIBRARY_THEME_COLORS.intake,
  "custom-application-form": LIBRARY_THEME_COLORS.intake,
  "document-upload": LIBRARY_THEME_COLORS.intake,
  "release-to-client": LIBRARY_THEME_COLORS.submission,
  "client-review": LIBRARY_THEME_COLORS.submission,
  "candidate-selection": LIBRARY_THEME_COLORS.interview,
  "internal-select": LIBRARY_THEME_COLORS.interview,
  "interview-qualification": LIBRARY_THEME_COLORS.interview,
  "pay-and-start-date": LIBRARY_THEME_COLORS.offerAgreement,
  "i9-section-1": LIBRARY_THEME_COLORS.offerAgreement,
  "manager-facility-approval": LIBRARY_THEME_COLORS.approvals,
  "hr-final-approval": LIBRARY_THEME_COLORS.approvals,
  "completion-milestone": LIBRARY_THEME_COLORS.approvals,
};

function buildFigmaStepThemeMap(): Record<string, string> {
  const map: Record<string, string> = { ...CANVAS_STEP_THEME_ALIASES };
  for (const group of [...FIGMA_PRE_HIRE_GROUPS, ...FIGMA_POST_HIRE_GROUPS]) {
    const color = resolveCategoryConfig(group.id, group.label).color;
    for (const step of group.steps) {
      map[step.id] = color;
    }
  }
  for (const byStep of Object.values(MIXED_CATEGORY_STEP_COLORS)) {
    for (const [stepId, color] of Object.entries(byStep)) {
      if (!map[stepId]) map[stepId] = color;
    }
  }
  return map;
}

const FIGMA_STEP_THEME_BY_ID = buildFigmaStepThemeMap();

/**
 * Canvas node accent: same stage color as Steps Library (icon bg + border).
 * Prefers settings.stageName when present, then library step id map.
 */
export function resolveCanvasStepThemeColor(
  stepId: string,
  stageName?: string | null
): string {
  const stage = String(stageName ?? "").trim().toLowerCase();
  if (stage && STAGE_NAME_THEME_COLORS[stage]) {
    return STAGE_NAME_THEME_COLORS[stage];
  }

  const id = String(stepId ?? "").trim();
  if (!id) return LIBRARY_THEME_COLORS.slate;
  if (id === CUSTOM_STEP_ID) return LIBRARY_THEME_COLORS.slate;
  return FIGMA_STEP_THEME_BY_ID[id] ?? LIBRARY_THEME_COLORS.slate;
}

const PRE_HIRE_CATEGORY_ORDER = [
  CUSTOM_STEPS_CATEGORY_ID,
  "application-profile",
  "screening",
  "interview",
  "submission",
  "screening-compliance",
  "offer-agreement",
  "approval-decision",
];

const POST_HIRE_CATEGORY_ORDER = [
  CUSTOM_STEPS_CATEGORY_ID,
  "payroll-financial",
  "team-operational",
  "training-development",
  "communication-notification",
];

function resolveFigmaStep(
  def: FigmaLibraryStepDef,
  allSteps: StepDefinition[]
): StepDefinition {
  const existing = allSteps.find((step) => step.id === def.id);
  if (existing) {
    return {
      ...existing,
      label: def.label,
      description: def.description ?? existing.description,
      defaultPhase: def.defaultPhase ?? "pre_hire",
      iconKey: def.iconKey ?? existing.iconKey,
    };
  }
  return {
    id: def.id,
    label: def.label,
    description: def.description,
    defaultPhase: def.defaultPhase ?? "pre_hire",
    iconKey: def.iconKey,
    icon: null,
  };
}

/**
 * Ensure Figma Pre-hire groups (Intake, Screening, Interview) exist with the
 * correct steps. Moves steps from other groups when found; adds when missing.
 */
export function ensurePreHireFigmaGroups(
  categories: StepCategory[],
  phase: LibraryHirePhase
): StepCategory[] {
  if (phase !== "pre_hire") return categories;

  const allSteps = categories.flatMap((category) => category.steps);
  const figmaCategoryIds = new Set(FIGMA_PRE_HIRE_GROUPS.map((group) => group.id));

  const withoutFigmaSteps = categories
    .map((category) => ({
      ...category,
      steps: category.steps.filter((step) => !FIGMA_PRE_HIRE_STEP_IDS.has(step.id)),
    }))
    .filter(
      (category) =>
        category.steps.length > 0 ||
        figmaCategoryIds.has(category.id) ||
        category.id === CUSTOM_STEPS_CATEGORY_ID
    );

  const byId = new Map(withoutFigmaSteps.map((category) => [category.id, category]));

  for (const group of FIGMA_PRE_HIRE_GROUPS) {
    const resolvedSteps = group.steps.map((def) => resolveFigmaStep(def, allSteps));
    const existing = byId.get(group.id);
    if (existing) {
      byId.set(group.id, {
        ...existing,
        label: group.label,
        steps: resolvedSteps,
      });
    } else {
      byId.set(group.id, {
        id: group.id,
        label: group.label,
        steps: resolvedSteps,
      });
    }
  }

  return Array.from(byId.values());
}

/**
 * Ensure Figma Post-hire groups — one Payroll & Tax section (no duplicate Payroll headers).
 */
export function ensurePostHireFigmaGroups(
  categories: StepCategory[],
  phase: LibraryHirePhase
): StepCategory[] {
  if (phase !== "post_hire") return categories;

  const allSteps = categories.flatMap((category) => category.steps);
  const figmaCategoryIds = new Set(FIGMA_POST_HIRE_GROUPS.map((group) => group.id));

  const withoutFigmaSteps = categories
    .map((category) => ({
      ...category,
      steps: category.steps.filter((step) => !FIGMA_POST_HIRE_STEP_IDS.has(step.id)),
    }))
    // Drop the legacy document-esign "Payroll & Taxes" duplicate bucket once emptied.
    .filter(
      (category) =>
        category.id !== "document-esign" &&
        (category.steps.length > 0 ||
          figmaCategoryIds.has(category.id) ||
          category.id === CUSTOM_STEPS_CATEGORY_ID ||
          category.id === "communication-notification")
    );

  const byId = new Map(withoutFigmaSteps.map((category) => [category.id, category]));

  for (const group of FIGMA_POST_HIRE_GROUPS) {
    const resolvedSteps = group.steps.map((def) => resolveFigmaStep(def, allSteps));
    const existing = byId.get(group.id);
    if (existing) {
      // Welcome & Complete is Figma-exact (no leftover notification steps).
      // Access / Training keep non-figma leftovers after the Figma order.
      const leftover =
        group.id === "communication-notification"
          ? []
          : existing.steps.filter((step) => !FIGMA_POST_HIRE_STEP_IDS.has(step.id));
      byId.set(group.id, {
        ...existing,
        label: group.label,
        steps: [...resolvedSteps, ...leftover],
      });
    } else {
      byId.set(group.id, {
        id: group.id,
        label: group.label,
        steps: resolvedSteps,
      });
    }
  }

  return Array.from(byId.values());
}

/** @deprecated Use ensurePreHireFigmaGroups. */
export function ensurePreHireIntakeSteps(
  categories: StepCategory[],
  phase: LibraryHirePhase
): StepCategory[] {
  return ensurePreHireFigmaGroups(categories, phase);
}

/**
 * Fold "Custom & Flexible Steps" into the primary Custom Steps group
 * so the library shows a single Custom Steps accordion first.
 */
export function mergeCustomStepCategories(categories: StepCategory[]): StepCategory[] {
  const flexible = categories.find((category) => category.id === CUSTOM_FLEXIBLE_CATEGORY_ID);
  const withoutFlexible = categories.filter(
    (category) => category.id !== CUSTOM_FLEXIBLE_CATEGORY_ID
  );

  // Figma-owned steps (e.g. Custom Form in Intake) stay out of Custom Steps.
  const flexibleSteps =
    flexible?.steps.filter((step) => !FIGMA_PRE_HIRE_STEP_IDS.has(step.id)) ?? [];

  if (!flexibleSteps.length) return withoutFlexible;

  const primaryIndex = withoutFlexible.findIndex(
    (category) => category.id === CUSTOM_STEPS_CATEGORY_ID
  );

  if (primaryIndex >= 0) {
    const primary = withoutFlexible[primaryIndex]!;
    const seen = new Set(primary.steps.map((step) => step.id));
    const mergedSteps = [
      ...primary.steps,
      ...flexibleSteps.filter((step) => !seen.has(step.id)),
    ];
    return withoutFlexible.map((category, index) =>
      index === primaryIndex ? { ...category, steps: mergedSteps } : category
    );
  }

  return [
    {
      id: CUSTOM_STEPS_CATEGORY_ID,
      label: "Custom Steps",
      steps: flexibleSteps,
    },
    ...withoutFlexible,
  ];
}

/** Custom Steps first; Pre-hire / Post-hire use Figma section order. */
export function sortLibraryCategoriesForDisplay(
  categories: StepCategory[],
  phase?: LibraryHirePhase
): StepCategory[] {
  const order =
    phase === "post_hire" ? POST_HIRE_CATEGORY_ORDER : PRE_HIRE_CATEGORY_ORDER;

  const rank = new Map(order.map((id, index) => [id, index]));
  return [...categories].sort((a, b) => {
    const aRank = rank.get(a.id) ?? 1000;
    const bRank = rank.get(b.id) ?? 1000;
    if (aRank !== bRank) return aRank - bRank;
    const aLabel = resolveCategoryDisplayLabel(a.id, a.label);
    const bLabel = resolveCategoryDisplayLabel(b.id, b.label);
    return aLabel.localeCompare(bLabel);
  });
}

export function isCustomStep(step: Pick<StepDefinition, "id">): boolean {
  return step.id === CUSTOM_STEP_ID;
}

export function isCustomStepsCategory(categoryId: string): boolean {
  return categoryId === CUSTOM_STEPS_CATEGORY_ID || categoryId === CUSTOM_FLEXIBLE_CATEGORY_ID;
}

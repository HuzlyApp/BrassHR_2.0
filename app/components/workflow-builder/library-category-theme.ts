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
    label: "Offer and agreement",
  },
  "screening-compliance": {
    color: LIBRARY_THEME_COLORS.compliance,
    defaultPhase: "pre_hire",
    label: "Compliance",
  },
  "payroll-financial": {
    color: LIBRARY_THEME_COLORS.intake,
    defaultPhase: "post_hire",
    label: "Payroll and tax",
  },
  "training-development": {
    color: LIBRARY_THEME_COLORS.trainingPolicy,
    defaultPhase: "post_hire",
    label: "Training and policy",
  },
  "approval-decision": {
    color: LIBRARY_THEME_COLORS.approvals,
    defaultPhase: "pre_hire",
    label: "Approvals",
  },
  "communication-notification": {
    color: LIBRARY_THEME_COLORS.welcomeComplete,
    defaultPhase: "post_hire",
    label: "Welcome",
  },
  completion: {
    color: LIBRARY_THEME_COLORS.welcomeComplete,
    defaultPhase: "post_hire",
    label: "Completion",
  },
  "team-operational": {
    color: LIBRARY_THEME_COLORS.accessSystems,
    defaultPhase: "post_hire",
    label: "Access and systems",
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

export function resolveCategoryDisplayLabel(_categoryId: string, categoryLabel: string): string {
  const stored = categoryLabel.trim();
  return stored || categoryLabel;
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

  return mergeCustomStepCategories(phased);
}

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
  welcome: LIBRARY_THEME_COLORS.welcomeComplete,
  completion: LIBRARY_THEME_COLORS.welcomeComplete,
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

/**
 * Fold "Custom & Flexible Steps" into the primary Custom Steps group
 * so the library shows a single Custom Steps accordion first.
 */
export function mergeCustomStepCategories(categories: StepCategory[]): StepCategory[] {
  const flexible = categories.find((category) => category.id === CUSTOM_FLEXIBLE_CATEGORY_ID);
  const withoutFlexible = categories.filter(
    (category) => category.id !== CUSTOM_FLEXIBLE_CATEGORY_ID
  );

  const flexibleSteps = flexible?.steps ?? [];

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

/** Custom Steps first only when that group is already in the loaded library. */
export function sortLibraryCategoriesForDisplay(
  categories: StepCategory[],
  _phase?: LibraryHirePhase
): StepCategory[] {
  return categories;
}

export function isCustomStep(step: Pick<StepDefinition, "id">): boolean {
  return step.id === CUSTOM_STEP_ID;
}

export function isCustomStepsCategory(categoryId: string): boolean {
  return categoryId === CUSTOM_STEPS_CATEGORY_ID || categoryId === CUSTOM_FLEXIBLE_CATEGORY_ID;
}

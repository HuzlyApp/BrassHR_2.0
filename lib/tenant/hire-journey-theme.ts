import { isValidBrandingHex } from "@/lib/tenant/branding-validation";

/** Stored overrides. Null keeps the hiring journey on branding and does not change branding. */
export type HireJourneyThemeOverrides = {
  progressBackgroundColor: string | null;
  stepperIconColor: string | null;
  stepIconColor: string | null;
  stepIconBorderColor: string | null;
  completionIconColor: string | null;
  completedStepBackground: string | null;
  stepBorderColor: string | null;
  modalButtonColor: string | null;
};

export type HireJourneyBrandDefaults = {
  primaryHex: string;
  secondaryHex: string;
};

export type ResolvedHireJourneyTheme = {
  progressBackgroundColor: string;
  stepperIconColor: string;
  stepIconColor: string;
  stepIconBorderColor: string;
  completionIconColor: string;
  completedStepBackground: string;
  stepBorderColor: string;
  modalButtonColor: string;
};

export const EMPTY_HIRE_JOURNEY_THEME: HireJourneyThemeOverrides = {
  progressBackgroundColor: null,
  stepperIconColor: null,
  stepIconColor: null,
  stepIconBorderColor: null,
  completionIconColor: null,
  completedStepBackground: null,
  stepBorderColor: null,
  modalButtonColor: null,
};

const COMPLETED_STEP_BACKGROUND = "#FFFFFF";
const STEP_BORDER = "#E8ECF0";
const COMPLETION_ICON = "#12AA00";

function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !isValidBrandingHex(trimmed)) return null;
  return trimmed.toUpperCase();
}

export function parseHireJourneyTheme(raw: unknown): HireJourneyThemeOverrides {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    progressBackgroundColor:
      normalizeHex(record.progressBackgroundColor) ?? normalizeHex(record.iconColor),
    stepperIconColor: normalizeHex(record.stepperIconColor),
    stepIconColor: normalizeHex(record.stepIconColor),
    stepIconBorderColor: normalizeHex(record.stepIconBorderColor),
    completionIconColor: normalizeHex(record.completionIconColor),
    completedStepBackground: normalizeHex(record.completedStepBackground),
    stepBorderColor: normalizeHex(record.stepBorderColor),
    modalButtonColor: normalizeHex(record.modalButtonColor),
  };
}

export function resolveHireJourneyTheme(
  overrides: HireJourneyThemeOverrides,
  branding: HireJourneyBrandDefaults
): ResolvedHireJourneyTheme {
  const primary = normalizeHex(branding.primaryHex) ?? "#BC8B41";
  const secondary = normalizeHex(branding.secondaryHex) ?? primary;
  return {
    progressBackgroundColor: overrides.progressBackgroundColor ?? primary,
    stepperIconColor: overrides.stepperIconColor ?? primary,
    stepIconColor: overrides.stepIconColor ?? secondary,
    stepIconBorderColor: overrides.stepIconBorderColor ?? secondary,
    completionIconColor: overrides.completionIconColor ?? COMPLETION_ICON,
    completedStepBackground: overrides.completedStepBackground ?? COMPLETED_STEP_BACKGROUND,
    stepBorderColor: overrides.stepBorderColor ?? STEP_BORDER,
    modalButtonColor: overrides.modalButtonColor ?? primary,
  };
}

export function hireJourneyThemeCssVars(
  theme: ResolvedHireJourneyTheme
): Record<string, string> {
  return {
    "--hj-progress-bg": theme.progressBackgroundColor,
    "--hj-stepper": theme.stepperIconColor,
    "--hj-icon": theme.stepIconColor,
    "--hj-icon-border": theme.stepIconBorderColor,
    "--hj-complete": theme.completionIconColor,
    "--hj-completed-bg": theme.completedStepBackground,
    "--hj-step-border": theme.stepBorderColor,
    "--hj-modal-button": theme.modalButtonColor,
  };
}

/**
 * Stage summary colors on the hire journey.
 * Submitted and Current Step follow branding primary.
 * Completed follows the completion icon. In Progress follows the progress background.
 */
export function hireStageSummaryPartColor(part: string): string {
  if (/\bCurrent Step\b/i.test(part)) return "var(--brand-primary)";
  if (/\bIn Progress\b/i.test(part)) return "var(--hj-progress-bg, var(--brand-primary))";
  if (/\bSubmitted\b/i.test(part)) return "var(--brand-primary)";
  if (/\bCompleted\b/i.test(part)) return "var(--hj-complete, #12AA00)";
  if (part.trim() === "•") return "#D0D5DD";
  return "var(--hj-progress-bg, var(--brand-primary))";
}

/** Drop a value that still matches the default so later branding edits keep flowing through. */
export function hireJourneyOverrideForSave(
  value: string,
  fallback: string
): string | null {
  const next = normalizeHex(value);
  const base = normalizeHex(fallback);
  if (!next || next === base) return null;
  return next;
}

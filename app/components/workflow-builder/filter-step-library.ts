import { stepFitsEnclosingStage } from "@/lib/onboarding/validate-workflow-step-stages";
import { CUSTOM_STEP_ID } from "./library-category-theme";
import type { StepCategory, StepDefinition } from "./types";

export function flattenStepLibrary(categories: StepCategory[]): StepDefinition[] {
  return categories.flatMap((category) => category.steps);
}

/** Historical / UI aliases that map to the same catalog task. */
const LIBRARY_STEP_ID_ALIASES: Record<string, readonly string[]> = {
  "pay-rate-hire-date": ["pay-and-start-date"],
  "pay-and-start-date": ["pay-rate-hire-date"],
  "employee-agreement": ["agreement-esign"],
  "agreement-esign": ["employee-agreement"],
  "i9-right-to-work-verification": ["i9-section-1"],
  "i9-section-1": ["i9-right-to-work-verification"],
  "manager-approval": ["manager-facility-approval"],
  "manager-facility-approval": ["manager-approval"],
  "offer-acceptance": ["offer-accepted"],
  "offer-accepted": ["offer-acceptance"],
  "completion-milestone": ["pre-hire-completion-milestone", "post-hire-completion-milestone"],
  "pre-hire-completion-milestone": ["completion-milestone"],
  "post-hire-completion-milestone": ["completion-milestone"],
  "submit-to-msp": ["submit-to-client", "release-to-client"],
  "submit-to-client": ["submit-to-msp"],
};

function normalizeLibraryLabel(label: string | null | undefined): string {
  return String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/[/_]+/g, " ")
    .replace(/\s+/g, " ");
}

function expandUsedStepIds(usedStepIds: Iterable<string>): Set<string> {
  const used = new Set<string>();
  for (const raw of usedStepIds) {
    const id = String(raw ?? "").trim();
    if (!id) continue;
    used.add(id);
    for (const alias of LIBRARY_STEP_ID_ALIASES[id] ?? []) {
      used.add(alias);
    }
  }
  return used;
}

/**
 * Collect catalog usage from canvas nodes. Prefer stepId, but also keep labels so
 * legacy drafts that used a different key still hide the matching library row.
 */
export function collectUsedLibrarySteps(
  nodes: ReadonlyArray<{
    type?: string | null;
    data?: { kind?: unknown; stepId?: unknown; label?: unknown } | null;
  }>
): { stepIds: Set<string>; labels: Set<string> } {
  const stepIds = new Set<string>();
  const labels = new Set<string>();

  for (const node of nodes) {
    if (node.type === "dropZone") continue;
    const data = node.data;
    if (!data || data.kind === "dropZone") continue;

    if (typeof data.stepId === "string" && data.stepId.trim()) {
      stepIds.add(data.stepId.trim());
    }
    if (typeof data.label === "string" && data.label.trim()) {
      labels.add(normalizeLibraryLabel(data.label));
    }
  }

  return { stepIds: expandUsedStepIds(stepIds), labels };
}

export type ExcludeUsedLibraryStepsOptions = {
  usedLabels?: Iterable<string>;
  /** Keep a stage heading after every catalog step from that stage is on the canvas. */
  keepEmptyCategories?: boolean;
  /**
   * Keep a stage after every catalog step in it is already on the canvas.
   * The stage is returned with an empty `steps` list and the used steps on `takenSteps`.
   */
  retainEmptyCategories?: boolean;
};

function isLibraryStepAvailable(
  step: StepDefinition,
  used: Set<string>,
  usedLabels: Set<string>
): boolean {
  if (step.id === CUSTOM_STEP_ID) return true;
  if (used.has(step.id)) return false;
  if (usedLabels.has(normalizeLibraryLabel(step.label))) return false;
  return true;
}

/**
 * Hide catalog steps that are already on the canvas. Custom Step stays available
 * so tenants can add multiple labeled checkpoints.
 */
export function excludeUsedLibrarySteps(
  categories: StepCategory[],
  usedStepIds: Iterable<string>,
  options?: ExcludeUsedLibraryStepsOptions
): StepCategory[] {
  const used = expandUsedStepIds(usedStepIds);
  const usedLabels = new Set(
    Array.from(options?.usedLabels ?? [], (label) => normalizeLibraryLabel(label)).filter(
      Boolean
    )
  );
  if (used.size === 0 && usedLabels.size === 0) return categories;

  return categories.flatMap((category) => {
    const steps = category.steps.filter((step) =>
      isLibraryStepAvailable(step, used, usedLabels)
    );
    if (steps.length > 0) {
      return [{ ...category, steps, takenSteps: undefined }];
    }
    if (
      (!options?.retainEmptyCategories && !options?.keepEmptyCategories) ||
      category.steps.length === 0
    ) {
      return [];
    }
    return [{ ...category, steps: [], takenSteps: category.steps }];
  });
}

/** Keep steps that belong to the stage on both sides of an insertion gap. */
export function excludeStepsOutsideStageSlot(
  categories: StepCategory[],
  slotStage: string | null
): StepCategory[] {
  if (!slotStage) return categories;

  return categories
    .map((category) => ({
      ...category,
      steps: category.steps.filter((step) =>
        stepFitsEnclosingStage({
          stepId: step.id,
          phase: step.defaultPhase,
          previousStage: slotStage,
          nextStage: slotStage,
        })
      ),
    }))
    .filter((category) => category.steps.length > 0);
}

function matchesQuery(text: string | undefined, query: string): boolean {
  return Boolean(text && text.toLowerCase().includes(query));
}

export function stepMatchesSearch(
  step: StepDefinition,
  query: string,
  categoryLabel?: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  if (matchesQuery(step.label, q)) return true;
  if (matchesQuery(step.description, q)) return true;
  if (matchesQuery(step.id, q)) return true;
  if (matchesQuery(step.id.replace(/[-_]/g, " "), q)) return true;
  if (matchesQuery(categoryLabel, q)) return true;
  if (step.keywords?.some((keyword) => matchesQuery(keyword, q))) return true;
  return false;
}

function exhaustedStageMatchesSearch(category: StepCategory, query: string): boolean {
  const taken = category.takenSteps ?? [];
  if (taken.length === 0) return false;
  if (matchesQuery(category.label, query)) return true;
  return taken.some((step) => stepMatchesSearch(step, query, category.label));
}

export function filterStepLibrary(
  categories: StepCategory[],
  query: string
): StepCategory[] {
  const q = query.trim().toLowerCase();
  if (!q) return categories;

  return categories
    .map((category) => ({
      ...category,
      steps: category.steps.filter((step) =>
        stepMatchesSearch(step, q, category.label)
      ),
    }))
    .filter(
      (category) =>
        category.steps.length > 0 ||
        exhaustedStageMatchesSearch(category, q) ||
        matchesQuery(category.label, q)
    );
}

/** Steps still available to add, plus one match for a stage whose steps are all already used. */
export function countLibraryMatches(categories: StepCategory[]): number {
  return categories.reduce((count, category) => {
    if (category.steps.length > 0) return count + category.steps.length;
    if ((category.takenSteps?.length ?? 0) > 0) return count + 1;
    return count;
  }, 0);
}

export function findCustomStepDefinition(
  categories: StepCategory[]
): StepDefinition | null {
  for (const category of categories) {
    const match = category.steps.find((step) => step.id === "custom-step");
    if (match) return match;
  }
  return flattenStepLibrary(categories).find((step) =>
    step.label.toLowerCase().includes("custom step")
  ) ?? null;
}

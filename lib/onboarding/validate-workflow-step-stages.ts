import {
  hireLifecycleForPhase,
  hireStageFitsLifecycle,
  hireStageForStepKey,
  hireStageLifecycle,
} from "@/lib/onboarding/hire-stage-catalog";

export const ALIEN_STAGE_WARNING = "This task does not belong in this stage.";

const FLEXIBLE_STEP_IDS = new Set(["custom-step"]);

/**
 * Whether a library step may sit on the given Pre-Hire / Post-Hire phase.
 * Unknown and custom steps are allowed; catalog steps that only map to the
 * other board are alien.
 */
export function workflowStepBelongsToPhase(
  stepId: string | null | undefined,
  phase: unknown
): boolean {
  const id = String(stepId ?? "").trim();
  if (!id || FLEXIBLE_STEP_IDS.has(id)) return true;

  const lifecycle = hireLifecycleForPhase(phase);
  if (!lifecycle) return true;

  if (hireStageForStepKey(id, lifecycle)) return true;

  const naturalStage = hireStageForStepKey(id);
  if (!naturalStage) return true;

  const naturalLifecycle = hireStageLifecycle(naturalStage);
  if (!naturalLifecycle) return true;

  return naturalLifecycle === lifecycle;
}

/** True when the step or its stamped stageName conflicts with the step's phase or neighbors. */
export function isAlienWorkflowStep(input: {
  stepId: string | null | undefined;
  phase: unknown;
  stageName?: unknown;
  previousStage?: string | null;
  nextStage?: string | null;
}): boolean {
  if (!workflowStepBelongsToPhase(input.stepId, input.phase)) return true;

  if (
    !stepFitsEnclosingStage({
      stepId: input.stepId,
      phase: input.phase,
      previousStage: input.previousStage,
      nextStage: input.nextStage,
    })
  ) {
    return true;
  }

  const lifecycle = hireLifecycleForPhase(input.phase);
  if (!lifecycle) return false;

  const stageName =
    typeof input.stageName === "string" ? input.stageName.trim() : "";
  if (stageName && !hireStageFitsLifecycle(stageName, lifecycle)) return true;

  return false;
}

export function alienStageWarningForStep(input: {
  stepId: string | null | undefined;
  phase: unknown;
  stageName?: unknown;
  previousStage?: string | null;
  nextStage?: string | null;
}): string | null {
  return isAlienWorkflowStep(input) ? ALIEN_STAGE_WARNING : null;
}

/** Library stage for a step on the given phase. Custom steps have no stage. */
export function catalogStageForWorkflowStep(
  stepId: string | null | undefined,
  phase: unknown
): string | null {
  const id = String(stepId ?? "").trim();
  if (!id || FLEXIBLE_STEP_IDS.has(id)) return null;
  return hireStageForStepKey(id, hireLifecycleForPhase(phase));
}

/**
 * The stage that owns a gap when the steps on both sides belong to it.
 * A boundary between two different stages is not the middle of either one.
 */
export function enclosingCatalogStage(
  previousStage: string | null | undefined,
  nextStage: string | null | undefined
): string | null {
  const previous = String(previousStage ?? "").trim();
  const next = String(nextStage ?? "").trim();
  if (!previous || !next) return null;
  if (previous.toLowerCase() !== next.toLowerCase()) return null;
  return previous;
}

/** False when this step would sit in the middle of a different catalog stage. */
export function stepFitsEnclosingStage(input: {
  stepId: string | null | undefined;
  phase: unknown;
  previousStage?: string | null;
  nextStage?: string | null;
}): boolean {
  const enclosing = enclosingCatalogStage(input.previousStage, input.nextStage);
  if (!enclosing) return true;
  const stage = catalogStageForWorkflowStep(input.stepId, input.phase);
  if (!stage) return true;
  return stage.toLowerCase() === enclosing.toLowerCase();
}

export type OrderedWorkflowStageStep = {
  id: string;
  stepId: string;
  phase: unknown;
  y?: number;
};

function nearestCatalogStage(
  startIds: string[],
  direction: "in" | "out",
  stepsById: Map<string, OrderedWorkflowStageStep>,
  edges: Array<{ source: string; target: string }>,
  stepIds: Set<string>
): string | null {
  let frontier = startIds;
  const seen = new Set<string>();

  while (frontier.length) {
    const stages: string[] = [];
    const further: string[] = [];
    for (const id of frontier) {
      if (seen.has(id)) continue;
      seen.add(id);
      const step = stepsById.get(id);
      const stage = step ? catalogStageForWorkflowStep(step.stepId, step.phase) : null;
      if (stage) {
        stages.push(stage);
        continue;
      }
      further.push(...adjacentStepIds(id, direction, edges, stepIds, seen));
    }
    const unique = new Set(stages.map((stage) => stage.toLowerCase()));
    if (unique.size === 1) return stages[0] ?? null;
    if (unique.size > 1) return null;
    frontier = further;
  }

  return null;
}

function adjacentStepIds(
  id: string,
  direction: "in" | "out",
  edges: Array<{ source: string; target: string }>,
  stepIds: Set<string>,
  seen: Set<string>
): string[] {
  const found: string[] = [];
  const queue = edges.flatMap((edge) => {
    if (direction === "out" && edge.source === id) return [edge.target];
    if (direction === "in" && edge.target === id) return [edge.source];
    return [];
  });
  const localSeen = new Set<string>([id]);

  while (queue.length) {
    const next = queue.shift();
    if (!next || localSeen.has(next) || seen.has(next)) continue;
    localSeen.add(next);
    if (stepIds.has(next)) {
      found.push(next);
      continue;
    }
    for (const edge of edges) {
      const hop =
        direction === "out"
          ? edge.source === next
            ? edge.target
            : null
          : edge.target === next
            ? edge.source
            : null;
      if (hop) queue.push(hop);
    }
  }

  return found;
}

function stageAt(
  steps: OrderedWorkflowStageStep[],
  index: number,
  direction: -1 | 1
): string | null {
  for (let cursor = index + direction; cursor >= 0 && cursor < steps.length; cursor += direction) {
    const stage = catalogStageForWorkflowStep(steps[cursor]!.stepId, steps[cursor]!.phase);
    if (stage) return stage;
  }
  return null;
}

/**
 * Steps whose catalog stage differs from the stage on both sides of them.
 * Recruiter screening between two Intake steps is one of these.
 */
export function foreignStagePlacements(
  steps: OrderedWorkflowStageStep[],
  edges: Array<{ source: string; target: string }>
): Array<{ id: string }> {
  const stepsById = new Map(steps.map((step) => [step.id, step]));
  const stepIds = new Set(stepsById.keys());
  const placements: Array<{ id: string }> = [];

  for (const step of steps) {
    const linkedIn = adjacentStepIds(step.id, "in", edges, stepIds, new Set());
    const linkedOut = adjacentStepIds(step.id, "out", edges, stepIds, new Set());
    const previousStage = linkedIn.length
      ? nearestCatalogStage(linkedIn, "in", stepsById, edges, stepIds)
      : null;
    const nextStage = linkedOut.length
      ? nearestCatalogStage(linkedOut, "out", stepsById, edges, stepIds)
      : null;

    let previous = previousStage;
    let next = nextStage;
    if (!previous && !next) {
      const ordered = [...steps].sort(
        (a, b) => (a.y ?? 0) - (b.y ?? 0) || a.id.localeCompare(b.id)
      );
      const index = ordered.findIndex((item) => item.id === step.id);
      previous = stageAt(ordered, index, -1);
      next = stageAt(ordered, index, 1);
    }

    if (
      !stepFitsEnclosingStage({
        stepId: step.stepId,
        phase: step.phase,
        previousStage: previous,
        nextStage: next,
      })
    ) {
      placements.push({ id: step.id });
    }
  }

  return placements;
}

/** Catalog stage of the step at `startId`, or the next staged step in `direction`. */
export function catalogStageBeside(
  steps: OrderedWorkflowStageStep[],
  edges: Array<{ source: string; target: string }>,
  startId: string | null,
  direction: "in" | "out"
): string | null {
  if (!startId) return null;
  const stepsById = new Map(steps.map((step) => [step.id, step]));
  const stepIds = new Set(stepsById.keys());
  if (stepsById.has(startId)) {
    return nearestCatalogStage([startId], direction, stepsById, edges, stepIds);
  }
  return nearestCatalogStage(
    adjacentStepIds(startId, direction, edges, stepIds, new Set()),
    direction,
    stepsById,
    edges,
    stepIds
  );
}

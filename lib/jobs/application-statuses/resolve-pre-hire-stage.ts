/**
 * Resolve which Pre-Hire status-catalog stage AI Analysis (and similar surfaces)
 * should use for Primary / Alternate / Closing actions.
 *
 * Source of truth is the candidate's Pre-Hire hire-journey stage when available.
 * Lane membership of the current status_id is only a fallback when the journey
 * stage is unknown — never AI Analysis step ids (Quick Match … Submission).
 */

import {
  isPreHireStatusStageName,
  PRE_HIRE_STATUS_STAGE_NAMES,
  type PreHireStatusStageName,
} from "./stage-assignments";
import {
  normalizeStageStatusLane,
  selectWorkflowScopedLaneRows,
  type WorkflowScopedLaneRow,
} from "./stage-status-lanes";

export type PreHireStageLaneHint = WorkflowScopedLaneRow & {
  stageName: string;
  statusId: string;
};

/** Prefer happy_path ownership; then alternate; then any lane on a Pre-Hire stage. */
export function resolvePreHireStageNameFromStatusLanes(input: {
  statusId: string | null | undefined;
  lanes: readonly PreHireStageLaneHint[];
  workflowId?: string | null;
}): PreHireStatusStageName | null {
  const statusId = input.statusId?.trim();
  if (!statusId) return null;

  const preHireLanes = input.lanes.filter((row) => isPreHireStatusStageName(row.stageName));
  const { rows } = selectWorkflowScopedLaneRows(preHireLanes, input.workflowId ?? null);
  const forStatus = rows.filter((row) => row.statusId === statusId);
  if (forStatus.length === 0) return null;

  const pickLatest = (lane: "happy_path" | "alternate" | null): PreHireStatusStageName | null => {
    const matches = PRE_HIRE_STATUS_STAGE_NAMES.filter((stage) =>
      forStatus.some((row) => {
        if (row.stageName !== stage) return false;
        if (!lane) return true;
        return normalizeStageStatusLane(row.lane) === lane;
      })
    );
    return matches.length > 0 ? matches[matches.length - 1]! : null;
  };

  return pickLatest("happy_path") ?? pickLatest("alternate") ?? pickLatest(null);
}

/**
 * Hire-journey current stage wins when it is a Pre-Hire status catalog stage.
 * Otherwise fall back to where the current status sits in the Pre-Hire catalog.
 */
export function resolvePreHireStatusStageForActions(input: {
  hireJourneyStageName?: string | null;
  statusId?: string | null;
  lanes?: readonly PreHireStageLaneHint[];
  workflowId?: string | null;
}): PreHireStatusStageName {
  const journey = input.hireJourneyStageName?.trim() ?? "";
  if (isPreHireStatusStageName(journey)) return journey;

  const fromLanes = resolvePreHireStageNameFromStatusLanes({
    statusId: input.statusId,
    lanes: input.lanes ?? [],
    workflowId: input.workflowId,
  });
  return fromLanes ?? "Intake";
}

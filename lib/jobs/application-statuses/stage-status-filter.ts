import { isSharedClosedGroupKey, isSharedFollowUpStatusName } from "./groups";

type StageScopedStatus = {
  id: string;
  name?: string | null;
  groupId?: string | null;
  groupSystemKey?: string | null;
};

/**
 * Statuses a recruiter can pick on one stage: groups assigned to that stage,
 * plus the shared Closed group. The candidate's current status stays visible
 * even when it belongs to another stage.
 */
export function filterStatusesForAssignedGroups<T extends StageScopedStatus>(
  statuses: T[],
  assignedGroupIds: readonly string[],
  currentStatusId?: string | null
): T[] {
  const allowed = new Set(assignedGroupIds);
  return statuses.filter((status) => {
    if (currentStatusId && status.id === currentStatusId) return true;
    if (isSharedClosedGroupKey(status.groupSystemKey)) return true;
    if (isSharedFollowUpStatusName(status.name)) return true;
    return Boolean(status.groupId && allowed.has(status.groupId));
  });
}

/** True when this status's catalog group is attached to the stage being edited. */
export function statusGroupIsOnStage(input: {
  groupId?: string | null;
  groupSystemKey?: string | null;
  statusName?: string | null;
  assignedGroupIds: readonly string[];
}): boolean {
  if (isSharedClosedGroupKey(input.groupSystemKey)) return true;
  if (isSharedFollowUpStatusName(input.statusName)) return true;
  return Boolean(input.groupId && input.assignedGroupIds.includes(input.groupId));
}

type SequencedStageStatus = StageScopedStatus & {
  name: string;
  sortOrder?: number | null;
  groupSortOrder?: number | null;
};

/**
 * Statuses from the groups attached to one stage, in catalog order.
 * Closed stays off this list. `next` is the status after the current one,
 * or the first status when the candidate is not already in this sequence.
 */
export function sequenceStatusesForStage<T extends SequencedStageStatus>(
  statuses: T[],
  assignedGroupIds: readonly string[],
  currentStatusId?: string | null
): { ordered: T[]; next: T | null; actions: T[] } {
  const allowed = new Set(assignedGroupIds);
  const ordered = statuses
    .filter((status) => {
      if (isSharedClosedGroupKey(status.groupSystemKey)) return false;
      return Boolean(status.groupId && allowed.has(status.groupId));
    })
    .sort((a, b) => {
      const groupDelta = (a.groupSortOrder ?? 0) - (b.groupSortOrder ?? 0);
      if (groupDelta !== 0) return groupDelta;
      const sortDelta = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (sortDelta !== 0) return sortDelta;
      return a.name.localeCompare(b.name);
    });

  const currentIndex = currentStatusId
    ? ordered.findIndex((status) => status.id === currentStatusId)
    : -1;
  const next =
    currentIndex >= 0 ? (ordered[currentIndex + 1] ?? null) : (ordered[0] ?? null);
  const rest = ordered.filter(
    (status) => status.id !== currentStatusId && status.id !== next?.id
  );
  return { ordered, next, actions: next ? [next, ...rest] : rest };
}

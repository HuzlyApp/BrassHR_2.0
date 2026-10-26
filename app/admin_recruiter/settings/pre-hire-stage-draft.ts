import { PRE_HIRE_FIGMA_STAGES } from "@/lib/onboarding/hire-stage-groups";
import type { ReasonCodeLane } from "@/lib/jobs/application-statuses/stage-reason-codes";
import {
  resolveConfiguredStageStatusLanes,
  selectWorkflowScopedLaneRows,
  type SavedStageStatusLane,
  type StageStatusLane,
} from "@/lib/jobs/application-statuses/stage-status-lanes";

export const PRE_HIRE_STAGE_SUMMARIES: Record<(typeof PRE_HIRE_FIGMA_STAGES)[number], string> = {
  Intake: "Profile, application, and documents",
  Screening: "Recruiter screen, skills, and references",
  Interview: "Interviews and candidate selection",
  Submission: "MSP and client submission",
  Compliance: "Background, credentials, and identity checks",
  "Offer & Agreement": "Pay, offer, and signed agreements",
  Approvals: "Final approval before hire",
};

export type ConfigStatus = {
  id: string;
  name: string;
  noteId: string | null;
  note: string | null;
  isNew?: boolean;
};

export type StageConfigDraft = {
  lanes: Record<StageStatusLane, ConfigStatus[]>;
  reasonCodes: Record<ReasonCodeLane, string[]>;
};

type LaneRow = SavedStageStatusLane & {
  stageName: string;
  workflowId?: string | null;
  noteId?: string | null;
  note?: string | null;
};

type ReasonRow = {
  stageName: string;
  code: string;
  sortOrder: number;
  workflowId?: string | null;
  lane: ReasonCodeLane;
};

type NoteRow = {
  id: string;
  stageName: string;
  body: string;
  workflowId?: string | null;
};

const EMPTY_LANES = (): Record<StageStatusLane, ConfigStatus[]> => ({
  happy_path: [],
  alternate: [],
  closed: [],
});

/** Saved Pre-Hire rows for one stage. Stages with no saved list stay empty. */
export function buildPreHireStageDraft(input: {
  stageName: string;
  workflowId: string | null;
  statuses: ReadonlyArray<{ id: string; name: string; isActive: boolean }>;
  lanes: readonly LaneRow[];
  reasonCodes: readonly ReasonRow[];
  notes: readonly NoteRow[];
}): { draft: StageConfigDraft; inheritsDefault: boolean } {
  const workflowId = input.workflowId;
  const stageLanes = input.lanes.filter((row) => row.stageName === input.stageName);
  const picked = selectWorkflowScopedLaneRows(stageLanes, workflowId);
  const active = input.statuses.filter((status) => status.isActive);
  const resolved =
    picked.source === "none"
      ? EMPTY_LANES()
      : resolveConfiguredStageStatusLanes(active, picked.rows);
  const noteBodyById = new Map(
    input.notes
      .filter((row) => row.stageName === input.stageName && (row.workflowId ?? null) === workflowId)
      .map((row) => [row.id, row.body])
  );
  const savedByStatus = new Map(
    picked.rows.map((row) => [
      row.statusId,
      {
        noteId: row.noteId ?? null,
        note: row.note ?? (row.noteId ? (noteBodyById.get(row.noteId) ?? null) : null),
      },
    ])
  );
  const decorate = (statuses: Array<{ id: string; name: string }>): ConfigStatus[] =>
    statuses.map((status) => {
      const saved = savedByStatus.get(status.id);
      return {
        id: status.id,
        name: status.name,
        noteId: saved?.noteId ?? null,
        note: saved?.note ?? null,
      };
    });

  const codesFor = (lane: ReasonCodeLane) => {
    const rows = input.reasonCodes.filter(
      (row) => row.stageName === input.stageName && row.lane === lane
    );
    return selectWorkflowScopedLaneRows(rows, workflowId)
      .rows.slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
      .map((row) => row.code);
  };

  return {
    inheritsDefault: Boolean(workflowId) && picked.source !== "workflow",
    draft: {
      lanes: {
        happy_path: decorate(resolved.happy_path),
        alternate: decorate(resolved.alternate),
        closed: decorate(resolved.closed),
      },
      reasonCodes: {
        alternate: codesFor("alternate"),
        closed: codesFor("closed"),
      },
    },
  };
}

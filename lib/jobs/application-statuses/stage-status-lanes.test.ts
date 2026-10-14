import { describe, expect, it } from "vitest";
import {
  applyStageButtonVisibility,
  composeStatusChangeNote,
  normalizeStageButtonLabel,
  resolveStageButtonLabel,
  resolveConfiguredStageStatusLanes,
  resolveGroupStatusLanes,
  resolveStageStatusLanes,
  selectWorkflowScopedLaneRows,
  sequenceOrderedStatuses,
} from "./stage-status-lanes";

const statuses = [
  { id: "applied", name: "New / Applied", sortOrder: 0, groupId: "g-start", groupSortOrder: 0, groupSystemKey: "start" },
  { id: "attempted", name: "Attempted Contact", sortOrder: 1, groupId: "g-start", groupSortOrder: 0, groupSystemKey: "start" },
  { id: "followup", name: "Follow-up Needed", sortOrder: 2, groupId: "g-start", groupSortOrder: 0, groupSystemKey: "start" },
  { id: "screen", name: "Screening Complete", sortOrder: 0, groupId: "g-interview", groupSortOrder: 1, groupSystemKey: "interview" },
  { id: "fit", name: "Not a Fit", sortOrder: 0, groupId: "g-closed", groupSortOrder: 5, groupSystemKey: "closed" },
  { id: "pool", name: "Talent Pool", sortOrder: 1, groupId: "g-closed", groupSortOrder: 5, groupSystemKey: "closed" },
  { id: "msp-no", name: "Rejected by MSP", sortOrder: 2, groupId: "g-closed", groupSortOrder: 5, groupSystemKey: "closed" },
];

describe("resolveStageStatusLanes", () => {
  it("splits a stage into happy path, alternate, and closed buttons", () => {
    const lanes = resolveStageStatusLanes(statuses, ["g-start", "g-interview"]);
    expect(lanes.happy_path.map((status) => status.name)).toEqual([
      "New / Applied",
      "Attempted Contact",
      "Screening Complete",
    ]);
    expect(lanes.alternate.map((status) => status.name)).toEqual(["Follow-up Needed"]);
    expect(lanes.closed.map((status) => status.name)).toEqual([
      "Not a Fit",
      "Talent Pool",
      "Rejected by MSP",
    ]);
  });

  it("keeps Follow up in Exception on every stage", () => {
    const lanes = resolveStageStatusLanes(
      [
        ...statuses,
        {
          id: "follow",
          name: "Follow up",
          sortOrder: 3,
          groupId: "g-start",
          groupSortOrder: 0,
          groupSystemKey: "start",
        },
      ],
      ["g-interview"]
    );
    expect(lanes.alternate.map((status) => status.name)).toEqual(["Follow up"]);
    expect(lanes.closed.map((status) => status.name)).toEqual([
      "Not a Fit",
      "Talent Pool",
      "Rejected by MSP",
    ]);
  });

  it("keeps a saved order and still reads the earlier lane names", () => {
    const lanes = resolveStageStatusLanes(statuses, ["g-start", "g-interview"], [
      { statusId: "screen", lane: "happy_path", sortOrder: 0 },
      { statusId: "applied", lane: "happy_path", sortOrder: 1 },
      { statusId: "fit", lane: "exception", sortOrder: 0 },
      { statusId: "followup", lane: "follow_up", sortOrder: 0 },
    ]);
    expect(lanes.happy_path.map((status) => status.id)).toEqual(["screen", "applied", "attempted"]);
    expect(lanes.closed.map((status) => status.id)).toEqual(["fit", "pool", "msp-no"]);
    expect(lanes.alternate.map((status) => status.id)).toEqual(["followup"]);
  });
});

describe("sequenceOrderedStatuses", () => {
  it("puts the next happy-path status first", () => {
    const ordered = statuses.filter((status) => status.id === "applied" || status.id === "screen");
    const sequence = sequenceOrderedStatuses(ordered, "applied");
    expect(sequence.next?.id).toBe("screen");
    expect(sequence.actions.map((status) => status.id)).toEqual(["screen"]);
  });

  it("advances one happy-path status at a time", () => {
    const ordered = [
      statuses.find((status) => status.id === "attempted")!,
      { id: "approved", name: "Approved Applicant", sortOrder: 2, groupId: "g-start" },
    ];
    expect(sequenceOrderedStatuses(ordered, null).next?.name).toBe("Attempted Contact");
    expect(sequenceOrderedStatuses(ordered, "attempted").next?.name).toBe("Approved Applicant");
    expect(sequenceOrderedStatuses(ordered, "approved").next).toBeNull();
  });
});

describe("resolveConfiguredStageStatusLanes", () => {
  it("keeps an empty alternate or closing category empty", () => {
    const lanes = resolveConfiguredStageStatusLanes(statuses, [
      { statusId: "applied", lane: "happy_path", sortOrder: 0 },
      { statusId: "screen", lane: "happy_path", sortOrder: 1 },
    ]);
    expect(lanes.happy_path.map((status) => status.name)).toEqual([
      "New / Applied",
      "Screening Complete",
    ]);
    expect(lanes.alternate).toEqual([]);
    expect(lanes.closed).toEqual([]);
  });
});

describe("selectWorkflowScopedLaneRows", () => {
  it("uses the workflow list when that workflow has rows", () => {
    const picked = selectWorkflowScopedLaneRows(
      [
        { statusId: "applied", lane: "happy_path" as const, sortOrder: 0, workflowId: null },
        { statusId: "screen", lane: "happy_path" as const, sortOrder: 0, workflowId: "flow-1" },
      ],
      "flow-1"
    );
    expect(picked.source).toBe("workflow");
    expect(picked.rows.map((row) => row.statusId)).toEqual(["screen"]);
  });

  it("falls back to the tenant default when the workflow has no list", () => {
    const picked = selectWorkflowScopedLaneRows(
      [{ statusId: "applied", lane: "happy_path" as const, sortOrder: 0, workflowId: null }],
      "flow-2"
    );
    expect(picked.source).toBe("default");
    expect(picked.rows.map((row) => row.statusId)).toEqual(["applied"]);
  });
});

describe("composeStatusChangeNote", () => {
  it("stores a closing reason with the note", () => {
    expect(
      composeStatusChangeNote({
        lane: "closed",
        reasonCode: "Not a Fit",
        note: "Schedule conflict",
      })
    ).toBe("Reason: Not a Fit\n\nSchedule conflict");
  });

  it("stores the follow-up detail as the note", () => {
    expect(
      composeStatusChangeNote({
        lane: "alternate",
        note: "Call back Thursday",
      })
    ).toBe("Call back Thursday");
  });
});

describe("resolveGroupStatusLanes", () => {
  it("keeps a group's saved category and does not pull in other groups", () => {
    const lanes = resolveGroupStatusLanes(
      statuses
        .filter((status) => status.groupId === "g-start")
        .map((status) =>
          status.id === "attempted" ? { ...status, buttonLane: "alternate" } : status
        )
    );
    expect(lanes.happy_path.map((status) => status.name)).toEqual(["New / Applied"]);
    expect(lanes.alternate.map((status) => status.name)).toEqual([
      "Attempted Contact",
      "Follow-up Needed",
    ]);
    expect(lanes.closed).toEqual([]);
  });
});

describe("stage button labels", () => {
  it("uses the built-in names until a tenant saves a rename", () => {
    expect(resolveStageButtonLabel("alternate", null)).toBe("Follow Up needed");
    expect(resolveStageButtonLabel("closed", "  ")).toBe("Close Application");
    expect(resolveStageButtonLabel("alternate", "Needs a call")).toBe("Needs a call");
    expect(resolveStageButtonLabel("closed", "  Withdraw  ")).toBe("Withdraw");
  });

  it("stores a blank or default name as unset", () => {
    expect(normalizeStageButtonLabel("alternate", "Follow Up needed")).toEqual({
      ok: true,
      label: null,
    });
    expect(normalizeStageButtonLabel("closed", "   ")).toEqual({ ok: true, label: null });
    expect(normalizeStageButtonLabel("closed", "End process")).toEqual({
      ok: true,
      label: "End process",
    });
  });

  it("rejects a label that will not fit on the button", () => {
    const result = normalizeStageButtonLabel("alternate", "A".repeat(61));
    expect(result.ok).toBe(false);
  });
});

describe("applyStageButtonVisibility", () => {
  it("drops alternate and closing when those buttons were removed", () => {
    const lanes = applyStageButtonVisibility(
      {
        happy_path: [statuses[0]],
        alternate: [statuses[2]],
        closed: [statuses[4]],
      },
      { showAlternate: false, showClosed: false }
    );
    expect(lanes.happy_path.map((status) => status.id)).toEqual(["applied"]);
    expect(lanes.alternate).toEqual([]);
    expect(lanes.closed).toEqual([]);
  });
});

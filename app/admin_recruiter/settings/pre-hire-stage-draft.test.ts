import { describe, expect, it } from "vitest";
import { buildPreHireStageDraft } from "./pre-hire-stage-draft";

const statuses = [
  { id: "new", name: "New/ Applied", isActive: true },
  { id: "resume", name: "Resume Verified", isActive: true },
  { id: "closed", name: "Application Closed", isActive: true },
  { id: "follow", name: "Follow-up Needed", isActive: true },
];

describe("buildPreHireStageDraft", () => {
  it("keeps a stage with no saved rows empty", () => {
    const view = buildPreHireStageDraft({
      stageName: "Approvals",
      workflowId: null,
      statuses,
      lanes: [],
      reasonCodes: [],
      notes: [],
    });
    expect(view.draft.lanes.happy_path).toEqual([]);
    expect(view.draft.lanes.alternate).toEqual([]);
    expect(view.draft.lanes.closed).toEqual([]);
    expect(view.draft.reasonCodes).toEqual({ alternate: [], closed: [] });
  });

  it("keeps statuses and reason codes on the lane they were saved", () => {
    const view = buildPreHireStageDraft({
      stageName: "Screening",
      workflowId: null,
      statuses,
      lanes: [
        { stageName: "Screening", statusId: "follow", lane: "alternate", sortOrder: 0, workflowId: null, noteId: null, note: null },
        { stageName: "Screening", statusId: "new", lane: "happy_path", sortOrder: 1, workflowId: null, noteId: null, note: null },
        { stageName: "Screening", statusId: "resume", lane: "happy_path", sortOrder: 0, workflowId: null, noteId: null, note: null },
        { stageName: "Screening", statusId: "closed", lane: "closed", sortOrder: 0, workflowId: null, noteId: null, note: null },
        { stageName: "Intake", statusId: "new", lane: "happy_path", sortOrder: 0, workflowId: null, noteId: null, note: null },
      ],
      reasonCodes: [
        { stageName: "Screening", code: "Unreachable", sortOrder: 0, workflowId: null, lane: "alternate" },
        { stageName: "Screening", code: "Not a Fit", sortOrder: 0, workflowId: null, lane: "closed" },
        { stageName: "Intake", code: "Not a Fit", sortOrder: 0, workflowId: null, lane: "closed" },
      ],
      notes: [],
    });
    expect(view.draft.lanes.happy_path.map((status) => status.name)).toEqual([
      "Resume Verified",
      "New/ Applied",
    ]);
    expect(view.draft.lanes.alternate.map((status) => status.name)).toEqual(["Follow-up Needed"]);
    expect(view.draft.lanes.closed.map((status) => status.name)).toEqual(["Application Closed"]);
    expect(view.draft.reasonCodes.alternate).toEqual(["Unreachable"]);
    expect(view.draft.reasonCodes.closed).toEqual(["Not a Fit"]);
  });
});

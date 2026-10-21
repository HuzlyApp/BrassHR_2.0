import { describe, expect, it } from "vitest";
import { catalogSavePlan, codesForScopedAppend, reasonCodesForLane } from "./stage-reason-codes";

describe("catalogSavePlan", () => {
  it("reuses a note that already exists for this stage", () => {
    expect(catalogSavePlan(["Call back Thursday"], "  call back thursday ")).toEqual({
      action: "reuse",
      value: "Call back Thursday",
    });
  });

  it("creates a note when this stage does not already have it", () => {
    expect(catalogSavePlan(["Call back Thursday"], "Left voicemail")).toEqual({
      action: "create",
      value: "Left voicemail",
    });
  });
});

describe("reasonCodesForLane", () => {
  const rows = [
    { code: "Not a Fit", workflowId: null, lane: "closed" },
    { code: "Call back later", workflowId: null, lane: "alternate" },
    { code: "Phone blocked", workflowId: "workflow-a", lane: "alternate" },
  ];

  it("keeps closing codes off the alternate action", () => {
    expect(reasonCodesForLane(rows, null, "closed")).toEqual(["Not a Fit"]);
    expect(reasonCodesForLane(rows, null, "alternate")).toEqual(["Call back later"]);
  });

  it("treats a missing lane as the closing list", () => {
    expect(reasonCodesForLane([{ code: "Not a Fit", workflowId: null }], null, "alternate")).toEqual([]);
    expect(reasonCodesForLane([{ code: "Not a Fit", workflowId: null }], null, "closed")).toEqual([
      "Not a Fit",
    ]);
  });

  it("uses a workflow override for that action only", () => {
    expect(reasonCodesForLane(rows, "workflow-a", "alternate")).toEqual(["Phone blocked"]);
    expect(reasonCodesForLane(rows, "workflow-a", "closed")).toEqual(["Not a Fit"]);
  });
});

describe("codesForScopedAppend", () => {
  it("copies the tenant default onto a workflow before adding a new code", () => {
    expect(
      codesForScopedAppend(
        [
          { code: "Not a Fit", workflowId: null },
          { code: "Unreachable", workflowId: "other-workflow" },
        ],
        "workflow-a",
        "Left voicemail"
      )
    ).toEqual(["Not a Fit", "Left voicemail"]);
  });

  it("keeps a workflow's own codes when appending", () => {
    expect(
      codesForScopedAppend(
        [
          { code: "Not a Fit", workflowId: null },
          { code: "Callback", workflowId: "workflow-a" },
        ],
        "workflow-a",
        "Left voicemail"
      )
    ).toEqual(["Callback", "Left voicemail"]);
  });
});

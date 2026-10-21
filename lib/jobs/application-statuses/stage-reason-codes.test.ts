import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALTERNATE_REASON_CODES,
  DEFAULT_CLOSING_REASON_CODES,
  catalogSavePlan,
  codesForScopedAppend,
  isReasonCodeLane,
  preferredReasonCodeLane,
  reasonCodesForLane,
} from "./stage-reason-codes";

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

describe("preferredReasonCodeLane", () => {
  it("keeps sheet codes on one pre-hire lane", () => {
    expect(preferredReasonCodeLane("Unreachable")).toBe("alternate");
    expect(preferredReasonCodeLane("Call Back Later")).toBe("alternate");
    expect(preferredReasonCodeLane("Not a Fit")).toBe("closed");
    expect(preferredReasonCodeLane("Offer Declined")).toBe("closed");
    expect(preferredReasonCodeLane("Custom recruiter note")).toBeNull();
    expect(DEFAULT_ALTERNATE_REASON_CODES.Screening).toEqual(["Unreachable"]);
    expect(DEFAULT_CLOSING_REASON_CODES.Screening).toEqual([
      "C2C Only",
      "Candidate Withdrew",
      "Not a Fit",
      "Requires Sponsorship",
    ]);
    expect(Object.keys(DEFAULT_CLOSING_REASON_CODES).some((stage) => stage.startsWith("Step"))).toBe(
      false
    );
  });
});

describe("isReasonCodeLane", () => {
  it("accepts alternate and closing only", () => {
    expect(isReasonCodeLane("alternate")).toBe(true);
    expect(isReasonCodeLane("closed")).toBe(true);
    expect(isReasonCodeLane("happy_path")).toBe(false);
    expect(isReasonCodeLane(null)).toBe(false);
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

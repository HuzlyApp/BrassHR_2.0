import { describe, expect, it } from "vitest";
import { catalogSavePlan, codesForScopedAppend, reasonCodesExcludingStatusNames } from "./stage-reason-codes";

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

describe("reasonCodesExcludingStatusNames", () => {
  it("keeps a closing status out of the reason list", () => {
    expect(
      reasonCodesExcludingStatusNames(
        ["Application Closed", "C2C Only", "Not a Fit", "Call Back Later"],
        ["Application Closed"]
      )
    ).toEqual(["C2C Only", "Not a Fit", "Call Back Later"]);
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

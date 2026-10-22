import { describe, expect, it } from "vitest";
import { canvasStepPhaseStageLabel } from "./hire-stage-catalog";

describe("canvasStepPhaseStageLabel", () => {
  it("shows the catalog stage for a pre-hire step", () => {
    expect(
      canvasStepPhaseStageLabel({
        phase: "pre_hire",
        stepKey: "manager-approval",
      })
    ).toBe("Pre-Hire - Offer & Agreement");
  });

  it("prefers the stage saved on the step", () => {
    expect(
      canvasStepPhaseStageLabel({
        phase: "pre_hire",
        stepKey: "manager-approval",
        stageName: "Compliance",
      })
    ).toBe("Pre-Hire - Compliance");
  });

  it("uses the post-hire stage for a post-hire step", () => {
    expect(
      canvasStepPhaseStageLabel({
        phase: "post_hire",
        stepKey: "tax-forms",
      })
    ).toBe("Post-Hire - Payroll & Pay");
  });

  it("ignores a pre-hire stage name on a post-hire step and uses the post-hire catalog", () => {
    expect(
      canvasStepPhaseStageLabel({
        phase: "post_hire",
        stepKey: "tax-forms",
        stageName: "Intake",
      })
    ).toBe("Post-Hire - Payroll & Pay");
  });

  it("shows only the phase when the step has no stage", () => {
    expect(
      canvasStepPhaseStageLabel({
        phase: "pre_hire",
        stepKey: "not-a-library-step",
      })
    ).toBe("Pre-Hire");
  });
});

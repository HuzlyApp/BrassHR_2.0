import { describe, expect, it } from "vitest";
import {
  applyQuickMatchScreeningProgress,
  isNamedRecruiterScreeningStep,
} from "@/lib/onboarding/recruiter-screening-progress";
import type { WorkflowStepDisplayStatus } from "@/lib/onboarding/assigned-workflow-steps";

function step(stepType: string, displayStatus: WorkflowStepDisplayStatus) {
  return { stepType, displayStatus };
}

describe("applyQuickMatchScreeningProgress", () => {
  it("shows Recruiter Screening as in progress once Quick Match has run", () => {
    const [screening, other] = applyQuickMatchScreeningProgress(
      [step("recruiter-screening", "not_started"), step("skill-qualification-assessment", "not_started")],
      true
    );
    expect(screening.displayStatus).toBe("in_progress");
    expect(other.displayStatus).toBe("not_started");
  });

  it("leaves the step alone before Quick Match runs", () => {
    const [screening] = applyQuickMatchScreeningProgress([step("recruiter-screening", "not_started")], false);
    expect(screening.displayStatus).toBe("not_started");
  });

  it("shows the AI Analysis embed only on the Recruiter Screening step", () => {
    expect(isNamedRecruiterScreeningStep({ stepType: "recruiter-screening", title: "Recruiter Screening" })).toBe(
      true
    );
    expect(isNamedRecruiterScreeningStep({ stepType: "recruiter-screening", title: "Contact History" })).toBe(
      false
    );
    expect(isNamedRecruiterScreeningStep({ stepType: "manual-task-hr-action", title: "Recruiter Screening" })).toBe(
      false
    );
  });

  it("never downgrades a completed or rejected screening", () => {
    const steps = applyQuickMatchScreeningProgress(
      [step("recruiter-screening", "completed"), step("recruiter-screening", "blocked")],
      true
    );
    expect(steps.map((item) => item.displayStatus)).toEqual(["completed", "blocked"]);
  });
});

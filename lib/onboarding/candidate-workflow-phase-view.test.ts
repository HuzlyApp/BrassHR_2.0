import { describe, expect, it } from "vitest";
import {
  countsForPhase,
  resolveEmploymentJourneyStage,
} from "@/lib/onboarding/workflow-phase-groups";
import { applicantMayActOnStep } from "@/lib/onboarding/workflow-phase";
import type { CandidateWorkflowTag } from "@/lib/onboarding/candidate-workflow-phase-view";

function tag(partial: Partial<CandidateWorkflowTag> & Pick<CandidateWorkflowTag, "id" | "workflowName">): CandidateWorkflowTag {
  return {
    workflowType: null,
    phase: "pre_hire",
    version: "1",
    assignedAt: "2026-08-01T00:00:00Z",
    assignmentState: "active",
    active: true,
    ...partial,
  };
}

describe("candidate workflow phase view rules", () => {
  it("keeps Pre-Hire and Post-Hire progress independent", () => {
    expect(countsForPhase(8, 3, "pre_hire").label).toBe("3 / 8 Pre-Hire completed");
    expect(countsForPhase(12, 0, "post_hire").label).toBe("0 / 12 Post-Hire completed");
  });

  it("allows Post-Hire writes once the application phase is Post-Hire", () => {
    expect(
      applicantMayActOnStep({
        activePhase: "post_hire",
        stepPhase: "post_hire",
        isHired: false,
      })
    ).toBe(true);
    expect(
      applicantMayActOnStep({
        activePhase: "pre_hire",
        stepPhase: "post_hire",
        isHired: false,
      })
    ).toBe(false);
  });

  it("derives workflow tags from stored assignments, not job title", () => {
    const tags = [
      tag({ id: "a", workflowName: "CNA Pre-Hire", phase: "pre_hire", active: true }),
      tag({
        id: "b",
        workflowName: "W2 Post-Hire",
        phase: "post_hire",
        assignmentState: "replaced",
        active: false,
      }),
    ];
    expect(tags.map((item) => item.workflowName)).toEqual(["CNA Pre-Hire", "W2 Post-Hire"]);
    expect(tags.filter((item) => item.active)).toHaveLength(1);
  });

  it("groups journey for hired candidates with no Post-Hire workflow as Hired", () => {
    expect(
      resolveEmploymentJourneyStage({
        isHired: true,
        workflowPhase: "post_hire",
        hasPreHireWorkflow: true,
        hasPostHireWorkflow: false,
        postHireUnlocked: true,
        onboarded: false,
      })
    ).toBe("hired");
  });

  it("does not treat Approved without conversion as a Post-Hire journey", () => {
    expect(
      resolveEmploymentJourneyStage({
        isHired: false,
        workflowPhase: "pre_hire",
        hasPreHireWorkflow: true,
        hasPostHireWorkflow: true,
        postHireUnlocked: false,
        onboarded: false,
      })
    ).toBe("pre_hire");
  });
});

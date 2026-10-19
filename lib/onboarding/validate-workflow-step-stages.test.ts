import { describe, expect, it } from "vitest";
import {
  ALIEN_STAGE_WARNING,
  alienStageWarningForStep,
  catalogStageBeside,
  enclosingCatalogStage,
  foreignStagePlacements,
  isAlienWorkflowStep,
  stepFitsEnclosingStage,
  workflowStepBelongsToPhase,
} from "@/lib/onboarding/validate-workflow-step-stages";

describe("workflowStepBelongsToPhase", () => {
  it("allows Pre-Hire catalog steps on Pre-Hire", () => {
    expect(workflowStepBelongsToPhase("submit-to-client", "pre_hire")).toBe(true);
    expect(workflowStepBelongsToPhase("resume-basic-profile", "transition")).toBe(true);
  });

  it("keeps record selection on Pre-Hire", () => {
    expect(workflowStepBelongsToPhase("record-selection", "pre_hire")).toBe(true);
    expect(workflowStepBelongsToPhase("record-selection", "post_hire")).toBe(false);
  });

  it("flags Post-Hire-only steps on Pre-Hire as alien", () => {
    expect(workflowStepBelongsToPhase("orientation-video", "pre_hire")).toBe(false);
  });

  it("flags Pre-Hire-only steps on Post-Hire as alien", () => {
    expect(workflowStepBelongsToPhase("submit-to-client", "post_hire")).toBe(false);
    expect(workflowStepBelongsToPhase("recruiter-screening", "post_hire")).toBe(false);
  });

  it("allows dual-board remapped steps on either phase", () => {
    expect(workflowStepBelongsToPhase("custom-form", "pre_hire")).toBe(true);
    expect(workflowStepBelongsToPhase("custom-form", "post_hire")).toBe(true);
    expect(workflowStepBelongsToPhase("pay-rate-hire-date", "pre_hire")).toBe(true);
    expect(workflowStepBelongsToPhase("pay-rate-hire-date", "post_hire")).toBe(true);
  });

  it("allows custom and unknown steps anywhere", () => {
    expect(workflowStepBelongsToPhase("custom-step", "pre_hire")).toBe(true);
    expect(workflowStepBelongsToPhase("custom-step", "post_hire")).toBe(true);
    expect(workflowStepBelongsToPhase("tenant-unique-step", "post_hire")).toBe(true);
  });
});

describe("isAlienWorkflowStep / alienStageWarningForStep", () => {
  it("returns the warning copy for alien placements", () => {
    expect(
      alienStageWarningForStep({
        stepId: "orientation-video",
        phase: "pre_hire",
      })
    ).toBe(ALIEN_STAGE_WARNING);
  });

  it("flags an explicit stageName from the other board", () => {
    expect(
      isAlienWorkflowStep({
        stepId: "custom-step",
        phase: "pre_hire",
        stageName: "Day One Ready",
      })
    ).toBe(true);
  });

  it("returns null when the step belongs", () => {
    expect(
      alienStageWarningForStep({
        stepId: "submit-to-client",
        phase: "pre_hire",
        stageName: "Submission",
      })
    ).toBeNull();
  });

  it("flags a screening task inserted between two Intake tasks", () => {
    expect(
      stepFitsEnclosingStage({
        stepId: "recruiter-screening",
        phase: "pre_hire",
        previousStage: "Intake",
        nextStage: "Intake",
      })
    ).toBe(false);
    expect(
      alienStageWarningForStep({
        stepId: "recruiter-screening",
        phase: "pre_hire",
        previousStage: "Intake",
        nextStage: "Intake",
      })
    ).toBe(ALIEN_STAGE_WARNING);
  });

  it("allows an Intake task in the middle of Intake and a task at a stage boundary", () => {
    expect(enclosingCatalogStage("Intake", "Intake")).toBe("Intake");
    expect(enclosingCatalogStage("Intake", "Screening")).toBeNull();
    expect(
      stepFitsEnclosingStage({
        stepId: "parameterized-job-application",
        phase: "pre_hire",
        previousStage: "Intake",
        nextStage: "Intake",
      })
    ).toBe(true);
    expect(
      stepFitsEnclosingStage({
        stepId: "recruiter-screening",
        phase: "pre_hire",
        previousStage: "Intake",
        nextStage: "Screening",
      })
    ).toBe(true);
  });
});

describe("foreignStagePlacements", () => {
  const steps = [
    { id: "resume", stepId: "resume-basic-profile", phase: "pre_hire", y: 0 },
    { id: "application", stepId: "parameterized-job-application", phase: "pre_hire", y: 130 },
    { id: "screening", stepId: "recruiter-screening", phase: "pre_hire", y: 260 },
    { id: "documents", stepId: "collect-extra-files", phase: "pre_hire", y: 390 },
  ];
  const edges = [
    { source: "resume", target: "application" },
    { source: "application", target: "screening" },
    { source: "screening", target: "documents" },
  ];

  it("marks only the task that sits in the middle of another stage", () => {
    expect(foreignStagePlacements(steps, edges).map((row) => row.id)).toEqual(["screening"]);
    expect(catalogStageBeside(steps, edges, "application", "in")).toBe("Intake");
    expect(catalogStageBeside(steps, edges, "documents", "out")).toBe("Intake");
  });
});

import { describe, expect, it } from "vitest";
import type { CandidateWorkflowStepView } from "@/lib/onboarding/candidate-workflow-phase-view";
import { groupStepsIntoHireStages } from "@/lib/onboarding/hire-stage-groups";
import {
  HIRE_STAGE_BY_STEP_KEY,
  stampHireStageOnStepSettings,
} from "@/lib/onboarding/hire-stage-catalog";
import { canRevealPostHire, isPostHireLockedForApplicant } from "@/lib/onboarding/lock-post-hire";
import { resolveCandidateHireGate } from "@/lib/onboarding/resolve-candidate-hire-gate";
import {
  commitOnboardingStepProgress,
  isTerminalStepDowngrade,
  mergeOnboardingStepData,
  type StepProgressSnapshot,
} from "@/lib/onboarding/step-progress-write";
import { applicantMayActOnStep, isTerminalApplicationStatus } from "@/lib/onboarding/workflow-phase";

const PRE_HIRE_STAGE_ORDER = [
  "Intake",
  "Screening",
  "Interview",
  "Submission",
  "Compliance",
  "Offer & Agreement",
  "Approvals",
] as const;

const POST_HIRE_STAGE_ORDER = [
  "Kickoff",
  "Paperwork",
  "Payroll & Pay",
  "Policies",
  "Access & Equipment",
  "Training",
  "Day One Ready",
] as const;

const POST_HIRE_BOARD_ORDER = [
  "Payroll & Tax",
  "Access & Systems",
  "Training & Policy",
  "Welcome & Complete",
] as const;

const POST_HIRE_BOARD_STAGE: Record<(typeof POST_HIRE_STAGE_ORDER)[number], string> = {
  Kickoff: "Welcome & Complete",
  Paperwork: "Payroll & Tax",
  "Payroll & Pay": "Payroll & Tax",
  Policies: "Training & Policy",
  "Access & Equipment": "Access & Systems",
  Training: "Training & Policy",
  "Day One Ready": "Welcome & Complete",
};

function postHireBoardStage(stage: string): string {
  return POST_HIRE_BOARD_STAGE[stage as (typeof POST_HIRE_STAGE_ORDER)[number]] ?? stage;
}

function step(
  partial: Partial<CandidateWorkflowStepView> & Pick<CandidateWorkflowStepView, "id" | "title" | "stepType">
): CandidateWorkflowStepView {
  return {
    snapshotStepId: partial.snapshotStepId ?? partial.id,
    tenantStepId: null,
    stepKey: partial.stepKey ?? partial.stepType,
    onboardingType: partial.onboardingType ?? "custom_question",
    phase: partial.phase ?? "pre_hire",
    required: true,
    status: "pending",
    displayStatus: partial.displayStatus ?? "not_started",
    inspectable: true,
    unmatched: false,
    assignedAt: null,
    completedAt: null,
    ...partial,
  };
}

describe("hire stage catalog", () => {
  it("places every library step on its mapped Pre-Hire or Post-Hire stage", () => {
    const preHire = Object.entries(HIRE_STAGE_BY_STEP_KEY)
      .filter(([, stage]) => (PRE_HIRE_STAGE_ORDER as readonly string[]).includes(stage))
      .map(([stepType], index) =>
        step({
          id: `pre-${index}`,
          title: stepType,
          stepType,
          phase: "pre_hire",
          displayStatus: "not_started",
        })
      );
    const postHire = Object.entries(HIRE_STAGE_BY_STEP_KEY)
      .filter(([, stage]) => (POST_HIRE_STAGE_ORDER as readonly string[]).includes(stage))
      .map(([stepType, stage], index) =>
        step({
          id: `post-${index}`,
          title: stepType,
          stepType,
          phase: "post_hire",
          displayStatus: postHireBoardStage(stage) === "Payroll & Tax" ? "completed" : "not_started",
        })
      );

    const preGroups = groupStepsIntoHireStages(preHire, "pre_hire");
    const postGroups = groupStepsIntoHireStages(postHire, "post_hire");

    expect(preGroups.map((group) => group.name)).toEqual([...PRE_HIRE_STAGE_ORDER]);
    expect(postGroups.map((group) => group.name)).toEqual([...POST_HIRE_BOARD_ORDER]);
    expect(preGroups[0]?.status).toBe("current");
    expect(preGroups.at(-1)?.status).toBe("locked");
    expect(postGroups[0]?.status).toBe("completed");
    expect(postGroups[1]?.status).toBe("current");

    for (const [stepType, stage] of Object.entries(HIRE_STAGE_BY_STEP_KEY)) {
      const lifecycle = (PRE_HIRE_STAGE_ORDER as readonly string[]).includes(stage)
        ? "pre_hire"
        : "post_hire";
      const groups = lifecycle === "pre_hire" ? preGroups : postGroups;
      const group = groups.find((item) => item.steps.some((row) => row.stepType === stepType));
      expect(group?.name, stepType).toBe(lifecycle === "pre_hire" ? stage : postHireBoardStage(stage));
    }
  });

  it("folds stamped post-hire library stages onto the Post-Hire board and keeps them off Pre-Hire", () => {
    const stamped = (stepType: string, phase: "pre_hire" | "post_hire") =>
      step({
        id: `${phase}-${stepType}`,
        title: stepType,
        stepType,
        phase,
        settings: stampHireStageOnStepSettings(stepType, { phase }),
      });

    expect(
      groupStepsIntoHireStages(
        [stamped("direct-deposit-setup", "post_hire"), stamped("welcome-email", "post_hire")],
        "post_hire"
      ).map((group) => group.name)
    ).toEqual(["Payroll & Tax", "Welcome & Complete"]);
    expect(
      groupStepsIntoHireStages([stamped("document-upload", "pre_hire")], "pre_hire").map(
        (group) => group.name
      )
    ).toEqual(["Intake"]);
  });

  it("stamps stageName onto new workflow snapshots without replacing an explicit stage", () => {
    expect(stampHireStageOnStepSettings("drug-test-screening", { phase: "pre_hire" })).toEqual({
      phase: "pre_hire",
      stageName: "Compliance",
    });
    expect(
      stampHireStageOnStepSettings("drug-test-screening", {
        phase: "pre_hire",
        stageName: "Screening",
      }).stageName
    ).toBe("Screening");
  });

  it("stamps the phase's own stage when a library step is placed in the other phase", () => {
    expect(stampHireStageOnStepSettings("pay-rate-hire-date", { phase: "post_hire" }).stageName).toBe(
      "Payroll & Pay"
    );
    expect(
      stampHireStageOnStepSettings("i9-right-to-work-verification", {
        phase: "post_hire",
        stageName: "Offer & Agreement",
      }).stageName
    ).toBe("Paperwork");
    expect(stampHireStageOnStepSettings("custom-form", { phase: "post_hire" }).stageName).toBe("Paperwork");
    expect(stampHireStageOnStepSettings("pay-rate-hire-date", { phase: "pre_hire" }).stageName).toBe(
      "Offer & Agreement"
    );
    expect(stampHireStageOnStepSettings("completion-milestone", { phase: "transition" }).stageName).toBe(
      "Approvals"
    );
    expect(stampHireStageOnStepSettings("completion-milestone", { phase: "post_hire" }).stageName).toBe(
      "Day One Ready"
    );
    expect(
      stampHireStageOnStepSettings("offer-acceptance", { phase: "post_hire", stageName: "Offer & Agreement" })
    ).toEqual({ phase: "post_hire" });
  });
});

describe("pre-hire to post-hire handoff", () => {
  it("keeps Post-Hire locked for applicants until the hired status is active", () => {
    expect(isPostHireLockedForApplicant({ isHired: false })).toBe(true);
    expect(
      applicantMayActOnStep({
        activePhase: "pre_hire",
        stepPhase: "post_hire",
        isHired: false,
      })
    ).toBe(false);
    expect(
      applicantMayActOnStep({
        activePhase: "post_hire",
        stepPhase: "post_hire",
        isHired: true,
      })
    ).toBe(true);
    expect(
      applicantMayActOnStep({
        activePhase: "post_hire",
        stepPhase: "post_hire",
        isHired: true,
        postHireSuspended: true,
      })
    ).toBe(false);
  });

  it("hides staff Post-Hire until Approve as Worker, even when the application is Selected by Client", () => {
    expect(canRevealPostHire({ workerStatus: "approved" })).toBe(false);
    expect(canRevealPostHire({ workerStatus: "for_approval" })).toBe(false);
    expect(canRevealPostHire({ workerStatus: "converted", convertedWorkerId: "worker-1" })).toBe(true);
  });

  it("does not let a newer pre-hire application overwrite a hired application's phase", () => {
    const gate = resolveCandidateHireGate([
      {
        status: "reviewing",
        workflow_phase: "pre_hire",
        post_hire_suspended_at: "2026-10-01T00:00:00Z",
      },
      {
        status: "hired",
        workflow_phase: "post_hire",
        post_hire_activated_at: "2026-09-01T00:00:00Z",
        post_hire_suspended_at: null,
        hired_at: "2026-09-01T00:00:00Z",
      },
    ]);
    expect(gate.isHired).toBe(true);
    expect(gate.workflowPhase).toBe("post_hire");
    expect(gate.postHireSuspended).toBe(false);
    expect(gate.postHireUnlocked).toBe(true);
    expect(gate.postHireActivationFailed).toBe(false);
  });

  it("treats rejected, withdrawn, and archived as terminal and not a hire", () => {
    for (const status of ["rejected", "withdrawn", "archived"]) {
      expect(isTerminalApplicationStatus(status)).toBe(true);
      expect(
        resolveCandidateHireGate([{ status, workflow_phase: "pre_hire" }]).isHired
      ).toBe(false);
    }
  });
});

describe("step progress recovery and concurrent writes", () => {
  it("merges a retry onto saved answers instead of replacing them", () => {
    expect(
      mergeOnboardingStepData(
        { answer: "yes", partner_dispatch: { ok: true } },
        { answer: "no" }
      )
    ).toEqual({ answer: "no", partner_dispatch: { ok: true } });
  });

  it("refuses to reopen a completed step as in progress", () => {
    expect(isTerminalStepDowngrade("completed", "in_progress")).toBe(true);
    expect(isTerminalStepDowngrade("completed", "failed")).toBe(false);
    expect(isTerminalStepDowngrade("pending", "completed")).toBe(false);
  });

  it("keeps every field from 40 overlapping saves", async () => {
    let row: StepProgressSnapshot = {
      status: "pending",
      data: { seed: "kept" },
      updatedAt: "t0",
    };
    let clock = 0;
    await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        commitOnboardingStepProgress({
          status: "in_progress",
          data: { [`field_${index}`]: index },
          completedAt: null,
          maxAttempts: 80,
          now: () => {
            clock += 1;
            return `t${clock}`;
          },
          read: async () => ({ status: row.status, data: { ...row.data }, updatedAt: row.updatedAt }),
          write: async (input) => {
            await new Promise((resolve) => setTimeout(resolve, index % 5));
            if (row.updatedAt !== input.expectedUpdatedAt) return "conflict";
            row = {
              status: input.status,
              data: input.data,
              updatedAt: input.updatedAt,
            };
            return "ok";
          },
        })
      )
    );

    expect(row.status).toBe("in_progress");
    expect(row.data.seed).toBe("kept");
    for (let index = 0; index < 40; index += 1) {
      expect(row.data[`field_${index}`]).toBe(index);
    }
  });

  it("leaves the saved row unchanged when a later write fails", async () => {
    const row: StepProgressSnapshot = {
      status: "in_progress",
      data: { answer: "saved" },
      updatedAt: "t1",
    };
    await expect(
      commitOnboardingStepProgress({
        status: "completed",
        data: { answer: "lost" },
        completedAt: "2026-10-02T00:00:00Z",
        read: async () => row,
        write: async () => {
          throw new Error("database unavailable");
        },
      })
    ).rejects.toThrow("database unavailable");
    expect(row.data.answer).toBe("saved");
    expect(row.status).toBe("in_progress");
  });
});

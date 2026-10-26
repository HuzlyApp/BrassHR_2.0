import { describe, expect, it } from "vitest";
import {
  hireGateFromApplications,
  isPostHireLockedForApplicant,
  shouldSuspendPostHireAfterStatusChange,
  canRevealPostHire,
  canRevealPostHireForStaffJourney,
  areRequiredPreHireStepsAlmostComplete,
  areAllRequiredPreHireStepsComplete,
  shouldRejectPostHirePhaseRequest,
} from "@/lib/onboarding/lock-post-hire";

describe("lock-post-hire", () => {
  it("locks Post-Hire until an authoritative hired status", () => {
    expect(isPostHireLockedForApplicant({ isHired: false })).toBe(true);
    expect(isPostHireLockedForApplicant({ isHired: true })).toBe(false);
    expect(isPostHireLockedForApplicant({ isHired: true, postHireSuspended: true })).toBe(true);
  });

  it("does not unlock from completing Pre-Hire or UI-only badges", () => {
    const gate = hireGateFromApplications([
      { status: "interviewing", workflow_phase: "pre_hire", post_hire_suspended_at: null },
    ]);
    expect(gate.isHired).toBe(false);
    expect(gate.activePhase).toBe("pre_hire");
  });

  it("unlocks from hired and suspends when hire is reverted", () => {
    expect(
      hireGateFromApplications([
        { status: "hired", workflow_phase: "post_hire", post_hire_suspended_at: null },
      ]).isHired
    ).toBe(true);
    expect(
      hireGateFromApplications([
        { status: "hired", workflow_phase: "post_hire", post_hire_suspended_at: "2026-08-27T00:00:00Z" },
      ]).isHired
    ).toBe(false);
    expect(
      shouldSuspendPostHireAfterStatusChange({
        previousStatus: "hired",
        nextStatus: "interviewing",
      })
    ).toBe(true);
  });

  it("hides Post-Hire until Approve as Worker conversion succeeds", () => {
    expect(canRevealPostHire({ workerStatus: "approved" })).toBe(false);
    expect(canRevealPostHire({ workerStatus: "for_approval" })).toBe(false);
    expect(canRevealPostHire({ workerStatus: "new", convertedAt: null })).toBe(false);
    expect(canRevealPostHire({ workerStatus: "converted" })).toBe(true);
    expect(canRevealPostHire({ workerStatus: "converted", convertedAt: "2026-08-27T00:00:00Z" })).toBe(
      true
    );
    expect(
      canRevealPostHire({
        workerStatus: "approved",
        conversionStatus: "completed",
        convertedWorkerId: "worker-1",
      })
    ).toBe(true);
    expect(
      canRevealPostHire({
        workerStatus: "approved",
        conversionStatus: "in_progress",
      })
    ).toBe(false);
  });

  it("treats required Pre-Hire progress as almost complete near the end", () => {
    expect(areRequiredPreHireStepsAlmostComplete([])).toBe(true);
    expect(
      areRequiredPreHireStepsAlmostComplete([
        { required: true, displayStatus: "completed" },
        { required: true, displayStatus: "completed" },
        { required: true, displayStatus: "not_started" },
        { required: false, displayStatus: "not_started" },
      ])
    ).toBe(true);
    expect(
      areRequiredPreHireStepsAlmostComplete([
        { required: true, displayStatus: "completed" },
        { required: true, displayStatus: "not_started" },
        { required: true, displayStatus: "not_started" },
        { required: true, displayStatus: "not_started" },
        { required: true, displayStatus: "not_started" },
      ])
    ).toBe(false);
  });

  it("keeps staff Post-Hire locked until every required Pre-Hire step is finished", () => {
    const nearlyDone = [
      { required: true, displayStatus: "completed" as const },
      { required: true, displayStatus: "completed" as const },
      { required: true, displayStatus: "completed" as const },
      { required: true, displayStatus: "not_started" as const },
    ];
    expect(
      canRevealPostHireForStaffJourney({
        convertedVisible: false,
        applicationHired: true,
        preHireSteps: nearlyDone,
      })
    ).toBe(false);
    expect(
      canRevealPostHireForStaffJourney({
        convertedVisible: true,
        applicationHired: true,
        preHireSteps: nearlyDone,
      })
    ).toBe(false);
    expect(
      canRevealPostHireForStaffJourney({
        convertedVisible: true,
        applicationHired: false,
        preHireSteps: [],
      })
    ).toBe(true);
    expect(areAllRequiredPreHireStepsComplete(nearlyDone)).toBe(false);
    expect(
      areAllRequiredPreHireStepsComplete([
        { required: true, displayStatus: "completed" },
        { required: false, displayStatus: "not_started" },
        { stepType: "reference-verification", required: true, displayStatus: "not_started" },
        { stepType: "pre-hire-completion-milestone", required: true, displayStatus: "not_started" },
      ])
    ).toBe(true);
  });

  it("does not unlock Post-Hire from Agreement e-sign while another required step is open", () => {
    const agreementSubmitted = [
      {
        snapshotStepId: "employee-agreement",
        title: "Agreement e-sign",
        required: true,
        displayStatus: "submitted" as const,
      },
    ];
    expect(
      canRevealPostHireForStaffJourney({
        convertedVisible: false,
        applicationHired: false,
        preHireSteps: agreementSubmitted,
      })
    ).toBe(false);

    const agreementDoneHrOpen = [
      {
        snapshotStepId: "employee-agreement",
        title: "Agreement e-sign",
        required: true,
        displayStatus: "completed" as const,
      },
      {
        stepType: "hr-final-approval",
        title: "HR final approval",
        required: true,
        displayStatus: "not_started" as const,
      },
    ];
    expect(
      canRevealPostHireForStaffJourney({
        convertedVisible: false,
        applicationHired: true,
        preHireSteps: agreementDoneHrOpen,
      })
    ).toBe(false);

    expect(
      canRevealPostHireForStaffJourney({
        convertedVisible: false,
        applicationHired: false,
        preHireSteps: [
          {
            stepType: "hr-final-approval",
            title: "HR final approval",
            required: true,
            displayStatus: "completed" as const,
          },
          ...agreementDoneHrOpen.slice(0, 1),
        ],
      })
    ).toBe(true);
  });

  it("rejects direct Post-Hire endpoint access before conversion", () => {
    expect(shouldRejectPostHirePhaseRequest("post_hire", false)).toBe(true);
    expect(shouldRejectPostHirePhaseRequest("post_hire", true)).toBe(false);
    expect(shouldRejectPostHirePhaseRequest("pre_hire", false)).toBe(false);
  });
});

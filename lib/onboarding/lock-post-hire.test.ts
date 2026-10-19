import { describe, expect, it } from "vitest";
import {
  hireGateFromApplications,
  isPostHireLockedForApplicant,
  shouldSuspendPostHireAfterStatusChange,
  canRevealPostHire,
  canRevealPostHireForStaffJourney,
  areRequiredPreHireStepsAlmostComplete,
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

  it("reveals staff Post-Hire after Selected + nearly complete Pre-Hire", () => {
    const nearlyDone = [
      { required: true, displayStatus: "completed" as const },
      { required: true, displayStatus: "completed" as const },
      { required: true, displayStatus: "completed" as const },
      { required: true, displayStatus: "not_started" as const },
    ];
    expect(
      canRevealPostHireForStaffJourney({
        convertedVisible: false,
        applicationHired: false,
        preHireSteps: nearlyDone,
      })
    ).toBe(false);
    expect(
      canRevealPostHireForStaffJourney({
        convertedVisible: false,
        applicationHired: true,
        preHireSteps: nearlyDone,
      })
    ).toBe(true);
    expect(
      canRevealPostHireForStaffJourney({
        convertedVisible: true,
        applicationHired: false,
        preHireSteps: [],
      })
    ).toBe(true);
  });

  it("reveals staff Post-Hire only after the recruiter completes Agreement e-sign", () => {
    const authorizationSigned = [
      {
        snapshotStepId: "authorization-esign",
        title: "Authorization e-sign",
        required: true,
        displayStatus: "completed" as const,
      },
    ];
    expect(
      canRevealPostHireForStaffJourney({
        convertedVisible: false,
        applicationHired: false,
        preHireSteps: authorizationSigned,
      })
    ).toBe(false);

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

    const agreementCompleted = [
      {
        snapshotStepId: "employee-agreement",
        title: "Agreement e-sign",
        required: true,
        displayStatus: "completed" as const,
      },
    ];
    expect(
      canRevealPostHireForStaffJourney({
        convertedVisible: false,
        applicationHired: false,
        preHireSteps: agreementCompleted,
      })
    ).toBe(true);
  });

  it("rejects direct Post-Hire endpoint access before conversion", () => {
    expect(shouldRejectPostHirePhaseRequest("post_hire", false)).toBe(true);
    expect(shouldRejectPostHirePhaseRequest("post_hire", true)).toBe(false);
    expect(shouldRejectPostHirePhaseRequest("pre_hire", false)).toBe(false);
  });
});

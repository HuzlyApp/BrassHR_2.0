import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit/activity-log", () => ({ writeActivityLog: vi.fn() }));
vi.mock("@/lib/email/send-templated-email", () => ({ sendTemplatedEmail: vi.fn() }));

import { candidateStepEmailBlock } from "@/lib/onboarding/candidate-step-email";
import type { TenantOnboardingStep } from "@/lib/onboarding/types";

function step(id: string, title = id): TenantOnboardingStep {
  return { id, title, step_key: id, step_type: "custom_question" } as unknown as TenantOnboardingStep;
}

const steps = [step("resume", "Resume"), step("bg", "Background Check"), step("ssn", "SSN")];

describe("candidateStepEmailBlock", () => {
  it("allows an open step the candidate hasn't completed", () => {
    expect(
      candidateStepEmailBlock({
        candidateSteps: steps,
        targetStepId: "bg",
        statusById: new Map([["resume", "completed"]]),
        frontier: { maxAllowedStepIndex: 2, waitingOnInternal: false },
      })
    ).toBeNull();
  });

  it("refuses a completed step", () => {
    expect(
      candidateStepEmailBlock({
        candidateSteps: steps,
        targetStepId: "bg",
        statusById: new Map([["bg", "completed"]]),
        frontier: { maxAllowedStepIndex: 3, waitingOnInternal: false },
      })?.code
    ).toBe("STEP_ALREADY_COMPLETED");
  });

  it("names the earlier candidate step that keeps this one locked", () => {
    expect(
      candidateStepEmailBlock({
        candidateSteps: steps,
        targetStepId: "ssn",
        statusById: new Map([["resume", "completed"]]),
        frontier: { maxAllowedStepIndex: 2, waitingOnInternal: false },
      })?.error
    ).toContain('"Background Check"');
  });

  it("explains a lock caused by a pending internal step", () => {
    const block = candidateStepEmailBlock({
      candidateSteps: steps,
      targetStepId: "bg",
      statusById: new Map([["resume", "completed"]]),
      frontier: { maxAllowedStepIndex: 1, waitingOnInternal: true },
    });
    expect(block?.code).toBe("STEP_LOCKED");
    expect(block?.error).toContain("internal step");
  });

  it("refuses a step the candidate's application doesn't include", () => {
    expect(
      candidateStepEmailBlock({
        candidateSteps: steps,
        targetStepId: "missing",
        statusById: new Map(),
        frontier: { maxAllowedStepIndex: 3, waitingOnInternal: false },
      })?.code
    ).toBe("STEP_NOT_IN_APPLICATION");
  });
});

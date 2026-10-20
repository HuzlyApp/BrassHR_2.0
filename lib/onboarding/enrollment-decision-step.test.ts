import { describe, expect, it } from "vitest";
import { applicantStepHasNavigableScreen } from "@/lib/onboarding/applicant-step-navigability";
import {
  enrollmentDecisionData,
  enrollmentQuestionForStep,
  isEnrollmentDecisionStep,
  readEnrollmentDecision,
  statusForEnrollmentDecision,
} from "@/lib/onboarding/enrollment-decision-step";
import { routeForApplicantStep } from "@/lib/onboarding/resolve-applicant-step-route";
import type { TenantOnboardingStep } from "@/lib/onboarding/types";

function step(stepKey: string, workflowStepId: string, extra: Record<string, unknown> = {}): TenantOnboardingStep {
  return {
    id: `id-${stepKey}`,
    step_key: stepKey,
    step_type: "profile_information",
    title: workflowStepId,
    is_enabled: true,
    is_required: false,
    sort_order: 1,
    metadata: { workflow_step_id: workflowStepId, ...extra },
  } as unknown as TenantOnboardingStep;
}

describe("enrollment decision step", () => {
  it("applies to Benefits and 401(k) only", () => {
    expect(isEnrollmentDecisionStep(step("profile_information_4", "benefits-enrollment"))).toBe(true);
    expect(isEnrollmentDecisionStep(step("profile_information_5", "401k-enrollment"))).toBe(true);
    expect(isEnrollmentDecisionStep(step("profile_information", "direct-deposit-setup"))).toBe(false);
  });

  it("maps answers to progress status", () => {
    expect(statusForEnrollmentDecision("agreed", true)).toBe("completed");
    expect(statusForEnrollmentDecision("agreed", false)).toBe("completed");
    expect(statusForEnrollmentDecision("not_ready", false)).toBe("skipped");
    expect(statusForEnrollmentDecision("not_ready", true)).toBe("in_progress");
  });

  it("round-trips the stored answer and ignores system placeholders", () => {
    const data = enrollmentDecisionData("not_ready", "Enroll?", "2026-10-02T10:00:00.000Z");
    expect(readEnrollmentDecision(data)).toEqual({
      decision: "not_ready",
      question: "Enroll?",
      answeredAt: "2026-10-02T10:00:00.000Z",
    });
    expect(readEnrollmentDecision({ system_completed: true, reason: "non_navigable_placeholder" })).toBeNull();
  });

  it("prefers a configured question over the default", () => {
    expect(
      enrollmentQuestionForStep(
        step("profile_information_4", "benefits-enrollment", {
          workflow_settings: { applicantQuestion: "Join the medical plan?" },
        })
      )
    ).toBe("Join the medical plan?");
    expect(enrollmentQuestionForStep(step("profile_information_4", "benefits-enrollment"))).toMatch(/benefits/);
  });

  it("gives Post-Hire profile steps their own screen even with the bare profile_information key", () => {
    const directDeposit = step("profile_information", "direct-deposit-setup");
    expect(routeForApplicantStep(directDeposit)).toContain("/application/custom-step/profile_information");
    expect(applicantStepHasNavigableScreen(directDeposit, [directDeposit])).toBe(true);
  });
});

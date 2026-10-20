import { describe, expect, it } from "vitest";
import { isAgreementSignatureStep, signsOnOwnScreen } from "@/lib/onboarding/agreement-signature-step";

function stepWith(libraryId: string, settings: Record<string, unknown> = {}, isEnabled = true) {
  return {
    is_enabled: isEnabled,
    metadata: { workflow_step_id: libraryId, workflow_settings: settings },
  };
}

describe("agreement-signature-step", () => {
  it("treats Agreement eSign and Pre-Hire acknowledgment copies as agreement signing steps", () => {
    expect(isAgreementSignatureStep(stepWith("employee-agreement"))).toBe(true);
    expect(isAgreementSignatureStep(stepWith("policy-acknowledgment", { phase: "pre_hire" }))).toBe(true);
  });

  it("leaves Post-Hire acknowledgments and other steps on their own screens", () => {
    expect(isAgreementSignatureStep(stepWith("policy-acknowledgment", { phase: "post_hire" }))).toBe(false);
    expect(isAgreementSignatureStep(stepWith("background-check"))).toBe(false);
    expect(isAgreementSignatureStep(null)).toBe(false);
  });

  it("only reports enabled steps with a template as signing on their own screen", () => {
    expect(signsOnOwnScreen(stepWith("employee-agreement", { firmaRecruiterTemplateId: "t1" }))).toBe(true);
    expect(signsOnOwnScreen(stepWith("employee-agreement"))).toBe(false);
    expect(signsOnOwnScreen(stepWith("employee-agreement", { firmaRecruiterTemplateId: "t1" }, false))).toBe(false);
    expect(signsOnOwnScreen(stepWith("background-check", { firmaRecruiterTemplateId: "t1" }))).toBe(false);
  });
});

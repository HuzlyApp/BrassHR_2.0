import { describe, expect, it } from "vitest";
import {
  candidateCheckboxMessage,
  I9_SECTION_1_CHECKBOX_LABEL,
  isCandidateCheckboxStep,
  isDirectDepositCheckboxStep,
  isI9CheckboxStep,
  isPayrollSetupCheckboxStep,
  storedCheckboxQuestions,
} from "@/lib/onboarding/candidate-checkbox-steps";

describe("candidate checkbox steps", () => {
  it("matches Direct Deposit and HCM & Payroll Setup by library id or title", () => {
    expect(isDirectDepositCheckboxStep({ metadata: { workflow_step_id: "direct-deposit-setup" } })).toBe(true);
    expect(isDirectDepositCheckboxStep({ title: "Direct Deposit" })).toBe(true);
    expect(isPayrollSetupCheckboxStep({ metadata: { workflow_step_id: "payroll-profile-creation" } })).toBe(true);
    expect(isPayrollSetupCheckboxStep({ title: "HCM & Payroll Setup" })).toBe(true);
    expect(isCandidateCheckboxStep({ title: "Benefits Enrollment" })).toBe(false);
    expect(isI9CheckboxStep({ stepType: "i9-right-to-work-verification", title: "I-9 Section 1" })).toBe(true);
    expect(isI9CheckboxStep({ title: "Collect documents" })).toBe(false);
  });

  it("builds the checkbox message from the step title or a saved override", () => {
    expect(candidateCheckboxMessage({ title: "HCM & Payroll Setup" })).toBe(
      "I confirm that I have completed HCM & Payroll Setup."
    );
    expect(
      candidateCheckboxMessage({
        title: "Direct Deposit",
        metadata: { workflow_settings: { acknowledgmentText: "  I authorize this deposit.  " } },
      })
    ).toBe("I authorize this deposit.");
  });

  it("reads the saved checkbox message for the step modal", () => {
    expect(
      storedCheckboxQuestions(
        {
          checkbox_confirmed: true,
          checkbox_label: "I confirm that I have completed HCM & Payroll Setup.",
        },
        "2026-10-16T12:00:00.000Z"
      )
    ).toEqual([
      {
        label: "I confirm that I have completed HCM & Payroll Setup.",
        fieldType: "checkbox",
        answer: "Confirmed",
        submittedAt: "2026-10-16T12:00:00.000Z",
        reviewResult: null,
      },
    ]);
    expect(storedCheckboxQuestions({ response: "typed answer" }, null)).toBeNull();
    expect(
      storedCheckboxQuestions(
        {
          checkbox_confirmed: true,
          checkbox_label: I9_SECTION_1_CHECKBOX_LABEL,
          i9_section_1_confirmed: true,
        },
        "2026-10-20T12:49:00.000Z"
      )?.[0]
    ).toMatchObject({
      label: I9_SECTION_1_CHECKBOX_LABEL,
      answer: "Confirmed",
      fieldType: "checkbox",
    });
  });
});

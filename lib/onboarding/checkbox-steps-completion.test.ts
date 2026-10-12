import { describe, expect, it } from "vitest";
import { enrollmentDecisionData } from "@/lib/onboarding/enrollment-decision-step";
import { buildPostHireSubmissionData } from "@/lib/onboarding/post-hire-step-screens";

describe("Dynamic checkbox responses storage for Post-Hire and Pre-Hire steps", () => {
  it("generates correct dynamic keys for Benefits Enrollment / Selection", () => {
    const question = "Do you agree to enroll in the benefits offered with this position?";
    const now = "2026-10-12T10:00:00.000Z";
    const data = enrollmentDecisionData("agreed", question, now, {
      checkbox_confirmed: true,
      checkbox_label: "I confirm that I have completed Benefits Enrollment / Selection.",
      benefits_enrollment_confirmed: true,
      benefits_enrollment_decision: "agreed",
      response: "I confirm that I have completed Benefits Enrollment / Selection.",
      post_hire_submission: {
        kind: "acknowledgment",
        fields: [
          { label: "Benefits Enrollment / Selection", value: "Confirmed" },
          { label: "Confirmation", value: "I confirm that I have completed Benefits Enrollment / Selection." },
        ],
        submitted_at: now,
      },
    });

    expect(data.checkbox_confirmed).toBe(true);
    expect(data.benefits_enrollment_confirmed).toBe(true);
    expect(data.benefits_enrollment_decision).toBe("agreed");
    expect(data.enrollment_decision).toBe("agreed");
    expect(data.response).toBe("I confirm that I have completed Benefits Enrollment / Selection.");
    expect(data.confirmed_at).toBe(now);
  });

  it("generates correct dynamic keys for 401K / Retirement Enrollment", () => {
    const question = "Do you agree to enroll in the 401(k) / retirement plan offered with this position?";
    const now = "2026-10-12T10:00:00.000Z";
    const data = enrollmentDecisionData("agreed", question, now, {
      checkbox_confirmed: true,
      checkbox_label: "I confirm that I have completed 401K / Retirement Enrollment.",
      retirement_enrollment_confirmed: true,
      k401_enrollment_confirmed: true,
      retirement_enrollment_decision: "agreed",
      response: "I confirm that I have completed 401K / Retirement Enrollment.",
      post_hire_submission: {
        kind: "acknowledgment",
        fields: [
          { label: "401K / Retirement Enrollment", value: "Confirmed" },
          { label: "Confirmation", value: "I confirm that I have completed 401K / Retirement Enrollment." },
        ],
        submitted_at: now,
      },
    });

    expect(data.checkbox_confirmed).toBe(true);
    expect(data.retirement_enrollment_confirmed).toBe(true);
    expect(data.k401_enrollment_confirmed).toBe(true);
    expect(data.retirement_enrollment_decision).toBe("agreed");
    expect(data.response).toBe("I confirm that I have completed 401K / Retirement Enrollment.");
    expect(data.confirmed_at).toBe(now);
  });

  it("generates correct dynamic keys for Direct Deposit Setup", () => {
    const authorizationText = "I confirm that I have completed Direct Deposit Setup.";
    const now = "2026-10-12T10:00:00.000Z";
    const postHireSub = buildPostHireSubmissionData(
      "direct_deposit",
      [
        { label: "Deposit authorization", value: "Authorized" },
        { label: "Confirmation", value: authorizationText },
      ],
      now
    );

    const fullData = {
      ...postHireSub,
      checkbox_confirmed: true,
      checkbox_label: authorizationText,
      authorized: true,
      direct_deposit_confirmed: true,
      response: authorizationText,
      confirmed_at: now,
    };

    expect(fullData.checkbox_confirmed).toBe(true);
    expect(fullData.authorized).toBe(true);
    expect(fullData.direct_deposit_confirmed).toBe(true);
    expect(fullData.response).toBe(authorizationText);
    expect(fullData.confirmed_at).toBe(now);
    expect(fullData.post_hire_submission.kind).toBe("direct_deposit");
  });

  it("generates correct dynamic keys for I 9 Section 1 (Pre-Hire)", () => {
    const confirmationText =
      "I confirm that I have completed Section 1 of Form I-9 and that the information provided is true and accurate to the best of my knowledge.";
    const now = "2026-10-12T10:00:00.000Z";

    const i9Data = {
      checkbox_confirmed: true,
      checkbox_label: confirmationText,
      i9_section_1_confirmed: true,
      form_i9_section_1_completed: true,
      response: confirmationText,
      confirmed_at: now,
    };

    expect(i9Data.checkbox_confirmed).toBe(true);
    expect(i9Data.i9_section_1_confirmed).toBe(true);
    expect(i9Data.form_i9_section_1_completed).toBe(true);
    expect(i9Data.response).toBe(confirmationText);
    expect(i9Data.confirmed_at).toBe(now);
  });
});

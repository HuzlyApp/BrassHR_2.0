import { describe, expect, it } from "vitest";
import {
  formatOfferCompensation,
  isOfferAcceptanceStep,
  isOfferAcceptanceStepType,
  offerDetailsFromJob,
  readOfferDecision,
} from "@/lib/onboarding/offer-acceptance";
import {
  candidateWaitingMessage,
  inspectionKindForStep,
} from "@/lib/onboarding/candidate-workflow-step-inspection";

describe("offer acceptance", () => {
  it("recognises the offer library step", () => {
    expect(isOfferAcceptanceStepType("offer-acceptance")).toBe(true);
    expect(isOfferAcceptanceStepType("offer_accepted")).toBe(true);
    expect(isOfferAcceptanceStepType("pay-rate-accepted")).toBe(true);
    expect(isOfferAcceptanceStepType("employee-agreement")).toBe(false);

    expect(isOfferAcceptanceStep({ stepKey: "custom_question_16", title: "Pay Rate Accepted" })).toBe(true);
    expect(isOfferAcceptanceStep({ stepKey: "custom_question_16", metadata: { workflow_step_id: "offer-acceptance" } })).toBe(true);
    expect(isOfferAcceptanceStep({ snapshotStepId: "w2-figma-20", stepType: "offer-acceptance", title: "Pay Rate Accepted" })).toBe(true);
    expect(isOfferAcceptanceStep({ stepKey: "authorizations_2", title: "Agreement eSign" })).toBe(false);
  });

  it("formats a pay range with its unit", () => {
    expect(
      formatOfferCompensation({ pay_rate: "56.00", pay_rate_min: "56.00", pay_rate_max: "58.00", rate_unit: "Hour" })
    ).toBe("$56.00 – $58.00 / hour");
    expect(formatOfferCompensation({ pay_rate: 90000, pay_rate_period: "Annually" })).toBe("$90,000.00 / year");
    expect(formatOfferCompensation({ pay_rate: null })).toBeNull();
  });

  it("builds the candidate-facing offer from the requisition", () => {
    expect(
      offerDetailsFromJob({
        title: "Senior SAP PM Consultant",
        job_number: "JOB-2026-000103",
        msp_client_name: "RANDSTAD",
        facility_name: "Troy Hills, New Jersey",
        employment_type: "W2",
        shift_type: "Full-time",
        pay_rate_min: "56.00",
        pay_rate_max: "58.00",
        rate_unit: "Hour",
        target_start_date: "2026-09-29",
      })
    ).toEqual({
      position: "Senior SAP PM Consultant",
      jobNumber: "JOB-2026-000103",
      client: "RANDSTAD",
      location: "Troy Hills, New Jersey",
      employmentType: "W2",
      schedule: "Full-time",
      compensation: "$56.00 – $58.00 / hour",
      startDate: "2026-09-29",
    });
  });

  it("reads the candidate's decision from step progress", () => {
    expect(
      readOfferDecision({ offer_decision: "declined", offer_decided_at: "2026-10-02T10:00:00Z", failure_reason: "Relocating" }, "failed")
    ).toEqual({ decision: "declined", decidedAt: "2026-10-02T10:00:00Z", reason: "Relocating" });
    expect(readOfferDecision({}, "completed")?.decision).toBe("accepted");
    expect(readOfferDecision({}, "pending")).toBeNull();
  });

  it("opens offer and e-sign steps with their own inspection views", () => {
    expect(inspectionKindForStep({ stepType: "offer-acceptance", onboardingType: "custom_question" })).toBe("offer");
    expect(
      inspectionKindForStep({ stepType: "i9-right-to-work-verification", onboardingType: "document_upload", usesESign: true })
    ).toBe("agreement");
    expect(
      inspectionKindForStep({ stepType: "i9-right-to-work-verification", onboardingType: "document_upload" })
    ).toBe("upload");
  });

  it("tells staff where the candidate completes a candidate-owned step", () => {
    expect(candidateWaitingMessage("offer", "pending")).toContain("Offer Acceptance screen");
    expect(candidateWaitingMessage("agreement", "in_progress")).toMatch(/opened this step.*Authorizations & Documents/);
    expect(candidateWaitingMessage("upload", "pending", "Tax Forms")).toContain("on the Tax Forms screen");
  });
});

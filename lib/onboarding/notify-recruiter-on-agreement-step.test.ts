import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  isAgreementOrSignatureStep,
  notifyRecruiterOnAgreementStepCompletion,
} from "./notify-recruiter-on-agreement-step";

describe("isAgreementOrSignatureStep", () => {
  it("detects Pre-Hire Agreement eSign steps", () => {
    expect(
      isAgreementOrSignatureStep({
        step_key: "employee-agreement",
        title: "Agreement eSign",
      })
    ).toBe(true);

    expect(
      isAgreementOrSignatureStep({
        metadata: { workflow_step_id: "agreement-esign" },
        title: "Nexus EOR Agreement eSign",
      })
    ).toBe(true);

    expect(
      isAgreementOrSignatureStep({
        step_key: "authorizations_2",
        title: "Authorizations & Agreement",
      })
    ).toBe(true);
  });

  it("detects Post-Hire I-9, Tax Forms, and Direct Deposit steps", () => {
    expect(
      isAgreementOrSignatureStep({
        metadata: { workflow_step_id: "i9-right-to-work-verification" },
        title: "I-9 / Right to Work Verification",
      })
    ).toBe(true);

    expect(
      isAgreementOrSignatureStep({
        metadata: { workflow_step_id: "tax-forms" },
        title: "Tax Forms (W-4 / State)",
      })
    ).toBe(true);

    expect(
      isAgreementOrSignatureStep({
        metadata: { workflow_step_id: "direct-deposit-setup" },
        title: "Direct Deposit Setup",
      })
    ).toBe(true);

    expect(
      isAgreementOrSignatureStep({
        metadata: { workflow_step_id: "welcome-packet-esign" },
        title: "Welcome Packet & Policy Acknowledgment",
      })
    ).toBe(true);
  });

  it("detects Firma or electronic signature integration steps", () => {
    expect(
      isAgreementOrSignatureStep({
        title: "Custom Company Policy",
        metadata: { firma_template_id: "ft_12345" },
      })
    ).toBe(true);

    expect(
      isAgreementOrSignatureStep({
        title: "Custom Form",
        data: { signing_provider: "firma" },
      })
    ).toBe(true);
  });

  it("detects dynamically named steps matching agreement / signature keywords", () => {
    expect(
      isAgreementOrSignatureStep({
        title: "Mutual NDA & Electronic Signature",
      })
    ).toBe(true);

    expect(
      isAgreementOrSignatureStep({
        title: "Federal Form W-4 Withholding Certificate",
      })
    ).toBe(true);

    expect(
      isAgreementOrSignatureStep({
        title: "Employment Eligibility Attestation (Form I-9)",
      })
    ).toBe(true);
  });

  it("returns false for non-agreement, non-signature steps", () => {
    expect(
      isAgreementOrSignatureStep({
        step_key: "upload-resume",
        title: "Upload Resume",
      })
    ).toBe(false);

    expect(
      isAgreementOrSignatureStep({
        step_key: "skill-assessment",
        title: "Clinical Skill Assessment Quiz",
      })
    ).toBe(false);

    expect(
      isAgreementOrSignatureStep({
        step_key: "references",
        title: "Professional References",
      })
    ).toBe(false);

    expect(
      isAgreementOrSignatureStep({
        step_key: "recruiter-screening",
        title: "Recruiter Screening",
      })
    ).toBe(false);

    expect(
      isAgreementOrSignatureStep({
        step_key: "safety-training",
        title: "Safety Training Video",
      })
    ).toBe(false);
  });
});

describe("notifyRecruiterOnAgreementStepCompletion", () => {
  const fakeSupabase = {
    from: vi.fn((table: string) => {
      if (table === "worker") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "w-1",
              first_name: "Jane",
              last_name: "Doe",
              email: "jane@example.com",
              job_role: "Registered Nurse",
              assigned_recruiter_user_id: "rec-1",
            },
          }),
        };
      }
      if (table === "job_applications") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "app-1",
              assigned_recruiter_user_id: "rec-1",
              job_requisitions: [{ public_title: "ICU RN", assigned_recruiter_user_id: "rec-1" }],
            },
          }),
        };
      }
      if (table === "tenants") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { name: "Nexus Health" },
          }),
        };
      }
      if (table === "users") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: "rec-1", email: "recruiter@nexushealth.com", role: "recruiter" },
          }),
        };
      }
      if (table === "user_roles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [] }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      };
    }),
  } as unknown as Parameters<typeof notifyRecruiterOnAgreementStepCompletion>[0];

  it("skips non-agreement steps without notifications", async () => {
    const result = await notifyRecruiterOnAgreementStepCompletion(fakeSupabase, {
      tenantId: "t-1",
      workerId: "w-1",
      applicationId: "app-1",
      step: {
        step_key: "upload-resume",
        title: "Upload Resume",
      },
    });

    expect(result.notified).toBe(false);
    expect(result.reason).toBe("NOT_AN_AGREEMENT_STEP");
  });
});

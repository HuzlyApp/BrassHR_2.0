import { describe, expect, it } from "vitest";
import {
  dedicatedRouteForWorkflowStep,
  routeForApplicantStep,
  WORKFLOW_STEP_APPLICANT_ROUTE,
} from "@/lib/onboarding/resolve-applicant-step-route";
import { resolveApplicantStepFromPath } from "@/lib/onboarding/find-applicant-step";
import type { TenantOnboardingStep } from "@/lib/onboarding/types";

function step(partial: Partial<TenantOnboardingStep> & Pick<TenantOnboardingStep, "step_key" | "step_type">): TenantOnboardingStep {
  return {
    id: partial.id ?? `id-${partial.step_key}`,
    title: partial.title ?? partial.step_key,
    description: null,
    sort_order: partial.sort_order ?? 10,
    is_required: true,
    is_enabled: true,
    metadata: partial.metadata ?? {},
    ...partial,
  };
}

describe("resolve-applicant-step-route", () => {
  it("sends phase completion milestones to the existing completion screens", () => {
    expect(WORKFLOW_STEP_APPLICANT_ROUTE["pre-hire-completion-milestone"]).toBe(
      "/application/pre-hire-completion"
    );
    expect(WORKFLOW_STEP_APPLICANT_ROUTE["post-hire-completion-milestone"]).toBe(
      "/application/post-hire-completion"
    );
    expect(
      routeForApplicantStep(
        step({
          step_key: "custom_question_20",
          step_type: "custom_question",
          metadata: {
            workflow_step_id: "post-hire-completion-milestone",
            workflow_settings: { phase: "post_hire", completionOwner: "applicant" },
          },
        })
      )
    ).toContain("/application/post-hire-completion");
  });

  it("maps collect-extra-files to professional license / document upload screen", () => {
    expect(WORKFLOW_STEP_APPLICANT_ROUTE["collect-extra-files"]).toBe(
      "/application/professional-license"
    );
    const route = routeForApplicantStep(
      step({
        step_key: "document_upload",
        step_type: "document_upload",
        metadata: { workflow_step_id: "collect-extra-files" },
      }),
      "testcompany"
    );
    expect(route).toContain("/application/professional-license");
    expect(route).toContain("stepKey=document_upload");
  });

  it("keeps Firma-enabled background check on Authorizations & Documents (Click and Sign)", () => {
    const route = routeForApplicantStep(
      step({
        step_key: "custom_question",
        step_type: "custom_question",
        metadata: {
          workflow_step_id: "background-check",
          workflow_settings: {
            firmaRecruiterTemplateId: "tmpl-1",
            firmaRecruiterTemplateName: "example",
          },
        },
      }),
      "nicee"
    );
    expect(route).toContain("/application/authorizations-documents");
    expect(route).toContain("stepKey=custom_question");
    expect(route).not.toContain("/application/firma-sign");
    expect(route).toContain("tenant=nicee");
  });

  it("maps builder library steps to dedicated applicant routes", () => {
    expect(WORKFLOW_STEP_APPLICANT_ROUTE["welcome-packet-esign"]).toBe(
      "/application/agreement-signature"
    );
    const route = routeForApplicantStep(
      step({
        step_key: "authorizations",
        step_type: "authorizations",
        metadata: { workflow_step_id: "welcome-packet-esign" },
      }),
      "acme"
    );
    expect(route).toContain("/application/agreement-signature");
    expect(route).toContain("stepKey=authorizations");
    expect(route).toContain("tenant=acme");
  });

  it("routes Agreement eSign to its own signing screen, not Authorizations & Documents", () => {
    const agreement = step({
      step_key: "authorizations_2",
      step_type: "authorizations",
      title: "Agreement eSign",
      metadata: {
        workflow_step_id: "employee-agreement",
        workflow_settings: { phase: "pre_hire", firmaRecruiterTemplateId: "tmpl-w2" },
      },
    });
    const route = routeForApplicantStep(agreement, "nexus");
    expect(route).toContain("/application/agreement-signature");
    expect(route).toContain("stepKey=authorizations_2");
    expect(route).not.toContain("authorizations-documents");
    expect(dedicatedRouteForWorkflowStep(agreement)).toBe("/application/agreement-signature");
  });

  it("resolves the agreement step on the agreement screen alongside a background check", () => {
    const background = step({
      step_key: "custom_question",
      step_type: "custom_question",
      sort_order: 10,
      metadata: { workflow_step_id: "background-check" },
    });
    const agreement = step({
      step_key: "authorizations_2",
      step_type: "authorizations",
      sort_order: 20,
      metadata: { workflow_step_id: "employee-agreement" },
    });
    expect(
      resolveApplicantStepFromPath("/application/agreement-signature", "?tenant=nexus", [background, agreement])
        ?.step_key
    ).toBe("authorizations_2");
  });

  it("routes Post-Hire candidate steps to their own screen, even with a Firma template", () => {
    for (const [stepKey, stepType, libraryId] of [
      ["authorizations_3", "authorizations", "policy-acknowledgment"],
      ["document_upload_7", "document_upload", "tax-forms"],
      ["document_upload_8", "document_upload", "i9-right-to-work-verification"],
      ["profile_information", "profile_information", "direct-deposit-setup"],
      ["custom_question_4", "custom_question", "safety-training"],
    ] as const) {
      const s = step({
        step_key: stepKey,
        step_type: stepType,
        metadata: {
          workflow_step_id: libraryId,
          workflow_settings: { phase: "post_hire", firmaRecruiterTemplateId: "tmpl-1" },
        },
      });
      expect(routeForApplicantStep(s)).toContain(`/application/custom-step/${stepKey}`);
      expect(dedicatedRouteForWorkflowStep(s)).toBeNull();
    }
  });

  it("routes Direct Deposit and HCM & Payroll Setup to the checkbox screen", () => {
    for (const [libraryId, title] of [
      ["direct-deposit-setup", "Direct Deposit"],
      ["payroll-profile-creation", "HCM & Payroll Setup"],
    ] as const) {
      const s = step({
        step_key: "profile_information",
        step_type: "profile_information",
        title,
        metadata: {
          workflow_step_id: libraryId,
          workflow_settings: { phase: "pre_hire", completionOwner: "recruiter_or_hr" },
        },
      });
      expect(routeForApplicantStep(s)).toContain("/application/custom-step/profile_information");
      expect(dedicatedRouteForWorkflowStep(s)).toBeNull();
    }
  });

  it("sends Pre-Hire acknowledgment copies to the agreement signing screen", () => {
    const route = routeForApplicantStep(
      step({
        step_key: "authorizations_2",
        step_type: "authorizations",
        metadata: { workflow_step_id: "policy-acknowledgment", workflow_settings: { phase: "pre_hire" } },
      })
    );
    expect(route).toContain("/application/agreement-signature");
  });

  it("resolves current step from stepKey query param", () => {
    const steps = [
      step({ step_key: "resume_upload", step_type: "resume_upload", sort_order: 10 }),
      step({
        step_key: "references",
        step_type: "references",
        sort_order: 20,
        metadata: { workflow_step_id: "references-collection" },
      }),
      step({ step_key: "review_submit", step_type: "review_submit", sort_order: 30 }),
    ];
    const current = resolveApplicantStepFromPath(
      "/application/add-references",
      "?stepKey=references&tenant=demo",
      steps
    );
    expect(current?.step_key).toBe("references");
  });

  it("resolves authorization_background_check from identity verification upload screen", () => {
    const steps = [
      step({
        step_key: "authorization_background_check",
        step_type: "custom_question",
        metadata: { workflow_step_id: "background-check" },
      }),
    ];
    const current = resolveApplicantStepFromPath(
      "/application/identity-verification",
      "?stepKey=authorization_background_check&tenant=zipstaff",
      steps
    );
    expect(current?.step_key).toBe("authorization_background_check");
  });

  it("resolves authorization_background_check from identity verification without stepKey", () => {
    const steps = [
      step({
        step_key: "authorization_background_check",
        step_type: "custom_question",
        metadata: { workflow_step_id: "background-check" },
      }),
    ];
    const current = resolveApplicantStepFromPath(
      "/application/identity-verification",
      "?tenant=zipstaff",
      steps
    );
    expect(current?.step_key).toBe("authorization_background_check");
  });

  it("sends post-hire training modules to the checkbox screen, not the skill quiz", () => {
    const route = routeForApplicantStep(
      step({
        step_key: "skill_assessment_2",
        step_type: "skill_assessment",
        title: "Training Modules + Quiz",
        metadata: {
          workflow_step_id: "training-modules-quiz",
          workflow_settings: { phase: "post_hire", completionOwner: "applicant" },
        },
      }),
      "testcompany"
    );
    expect(route).toContain("/application/custom-step/skill_assessment_2");
    expect(route).not.toContain("/application/skills-intro");
    expect(
      dedicatedRouteForWorkflowStep(
        step({
          step_key: "skill_assessment_2",
          step_type: "skill_assessment",
          title: "Training Modules + Quiz",
          metadata: {
            workflow_step_id: "training-modules-quiz",
            workflow_settings: { phase: "post_hire", completionOwner: "applicant" },
          },
        })
      )
    ).toBeNull();
  });
});

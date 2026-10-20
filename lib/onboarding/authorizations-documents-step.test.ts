import { describe, expect, it } from "vitest";
import {
  isAuthorizationsSaveBlocked,
  isBackgroundCheckAuthorizationStep,
  shouldShowFirmaAgreementPanel,
  stepRequiresApplicantAgreement,
  stepRequiresIdentityDocuments,
  workflowHasIdentityVerificationStep,
} from "@/lib/onboarding/authorizations-documents-step";
import { resolveApplicantStepFromPath } from "@/lib/onboarding/find-applicant-step";
import { DEFAULT_STEP_SETTINGS } from "@/app/components/workflow-builder/types";
import { isOnboardingStepSkippable } from "@/lib/onboarding/is-step-skippable";
import { adjacentStepRoute } from "@/lib/onboarding/tenant-step-navigation";
import type { TenantOnboardingConfig, TenantOnboardingStep } from "@/lib/onboarding/types";

function step(
  partial: Partial<TenantOnboardingStep> & Pick<TenantOnboardingStep, "step_key" | "step_type">
): TenantOnboardingStep {
  return {
    id: partial.id ?? `id-${partial.step_key}`,
    title: partial.title ?? partial.step_key,
    description: null,
    sort_order: partial.sort_order ?? 10,
    is_required: partial.is_required ?? true,
    is_enabled: true,
    metadata: partial.metadata ?? {},
    ...partial,
  };
}

function zipstaffAuthorizationsConfig(): TenantOnboardingConfig {
  return {
    id: "cfg-1",
    tenantId: "tenant-1",
    steps: [
      step({ step_key: "resume_upload", step_type: "resume_upload", sort_order: 10 }),
      step({ step_key: "professional_license", step_type: "professional_license", sort_order: 20 }),
      step({ step_key: "skill_assessment", step_type: "skill_assessment", sort_order: 30 }),
      step({
        step_key: "authorization_background_check",
        step_type: "custom_question",
        sort_order: 40,
        metadata: { workflow_step_id: "background-check" },
      }),
      step({
        step_key: "agreement_signature",
        step_type: "authorizations",
        sort_order: 50,
        metadata: {
          workflow_step_id: "employee-agreement",
          workflow_settings: {
            ...DEFAULT_STEP_SETTINGS,
            firmaRecruiterTemplateId: "tenant-a-template",
            firmaRecruiterTemplateName: "Employee Agreement",
          },
        },
      }),
      step({ step_key: "review_submit", step_type: "review_submit", sort_order: 60 }),
    ],
    requiredDocuments: [],
    skillAssessments: [],
  };
}

describe("authorizations-documents-step", () => {
  it("identifies the background check authorization step", () => {
    const background = step({
      step_key: "authorization_background_check",
      step_type: "custom_question",
      metadata: { workflow_step_id: "background-check" },
    });
    expect(isBackgroundCheckAuthorizationStep(background)).toBe(true);
    expect(shouldShowFirmaAgreementPanel(background)).toBe(false);
  });

  it("inherits Firma template settings from a retired agreement_signature step", async () => {
    const { resolveAuthorizationStepWithFirma } = await import(
      "@/lib/onboarding/authorizations-documents-step"
    );
    const background = step({
      step_key: "authorization_background_check",
      step_type: "custom_question",
      metadata: { workflow_step_id: "background-check" },
    });
    const agreement = step({
      step_key: "agreement_signature",
      step_type: "authorizations",
      is_enabled: false,
      metadata: {
        workflow_step_id: "employee-agreement",
        workflow_settings: {
          ...DEFAULT_STEP_SETTINGS,
          firmaRecruiterTemplateId: "tenant-a-template",
          firmaRecruiterTemplateName: "Employee Agreement",
        },
      },
    });
    const resolved = resolveAuthorizationStepWithFirma(background, [background, agreement]);
    expect(shouldShowFirmaAgreementPanel(resolved)).toBe(true);
    expect(resolved?.metadata?.firma_inherited_from_step_key).toBe("agreement_signature");
  });

  it("does not borrow the template of an enabled agreement step that signs on its own screen", async () => {
    const { resolveAuthorizationStepWithFirma } = await import(
      "@/lib/onboarding/authorizations-documents-step"
    );
    const background = step({
      step_key: "custom_question",
      step_type: "custom_question",
      metadata: { workflow_step_id: "background-check" },
    });
    const agreement = step({
      step_key: "authorizations_2",
      step_type: "authorizations",
      metadata: {
        workflow_step_id: "employee-agreement",
        workflow_settings: { ...DEFAULT_STEP_SETTINGS, firmaRecruiterTemplateId: "tmpl-w2" },
      },
    });
    const resolved = resolveAuthorizationStepWithFirma(background, [background, agreement]);
    expect(shouldShowFirmaAgreementPanel(resolved)).toBe(false);
  });

  it("only shows Firma UI when the active step has a recruiter template", () => {
    const agreement = zipstaffAuthorizationsConfig().steps.find(
      (s) => s.step_key === "agreement_signature"
    )!;
    expect(shouldShowFirmaAgreementPanel(agreement)).toBe(true);
    expect(shouldShowFirmaAgreementPanel(null)).toBe(false);
  });

  it("does not block save on the background check step when Firma is not configured there", () => {
    const background = zipstaffAuthorizationsConfig().steps.find(
      (s) => s.step_key === "authorization_background_check"
    )!;
    expect(
      isAuthorizationsSaveBlocked({
        step: background,
        agreed: true,
        agreementSigned: false,
        identityDocsComplete: true,
      })
    ).toBe(false);
  });

  it("blocks save on the agreement step until Firma signing is complete", () => {
    const agreement = zipstaffAuthorizationsConfig().steps.find(
      (s) => s.step_key === "agreement_signature"
    )!;
    expect(
      isAuthorizationsSaveBlocked({
        step: agreement,
        agreed: true,
        agreementSigned: false,
        identityDocsComplete: true,
      })
    ).toBe(true);
    expect(
      isAuthorizationsSaveBlocked({
        step: agreement,
        agreed: true,
        agreementSigned: true,
        identityDocsComplete: true,
      })
    ).toBe(false);
  });

  it("does not require identity documents on the agreement signature step", () => {
    const agreement = zipstaffAuthorizationsConfig().steps.find(
      (s) => s.step_key === "agreement_signature"
    )!;
    expect(stepRequiresIdentityDocuments(agreement)).toBe(false);
  });

  it("requires identity documents on the background check step when required", () => {
    const background = zipstaffAuthorizationsConfig().steps.find(
      (s) => s.step_key === "authorization_background_check"
    )!;
    expect(stepRequiresIdentityDocuments(background)).toBe(true);
    expect(
      isAuthorizationsSaveBlocked({
        step: background,
        agreed: true,
        agreementSigned: false,
        identityDocsComplete: false,
      })
    ).toBe(true);
  });

  it("leaves identity documents to the SSN / Identity step when the workflow has one", () => {
    const background = step({
      step_key: "custom_question",
      step_type: "custom_question",
      metadata: { workflow_step_id: "background-check" },
    });
    const identity = step({
      step_key: "document_upload",
      step_type: "document_upload",
      metadata: { workflow_step_id: "ssn-identity-verification" },
    });
    const allSteps = [background, identity];
    expect(workflowHasIdentityVerificationStep(allSteps)).toBe(true);
    expect(stepRequiresIdentityDocuments(background, allSteps)).toBe(false);
    expect(
      isAuthorizationsSaveBlocked({
        step: background,
        agreed: true,
        agreementSigned: true,
        identityDocsComplete: false,
        allSteps,
      })
    ).toBe(false);
    expect(stepRequiresIdentityDocuments(background, [background])).toBe(true);
  });

  it("resolves the identity screen to the SSN step, not the background check that links to it", () => {
    const background = step({
      step_key: "custom_question",
      step_type: "custom_question",
      sort_order: 10,
      metadata: { workflow_step_id: "background-check" },
    });
    const identity = step({
      step_key: "document_upload",
      step_type: "document_upload",
      sort_order: 20,
      metadata: { workflow_step_id: "ssn-identity-verification" },
    });
    expect(
      resolveApplicantStepFromPath("/application/identity-verification", "", [background, identity])
        ?.step_key
    ).toBe("document_upload");
    expect(
      resolveApplicantStepFromPath("/application/identity-verification", "", [background])?.step_key
    ).toBe("custom_question");
  });

  it("does not require agreement checkbox or documents when the step is optional", () => {
    const optionalBackground = step({
      step_key: "authorization_background_check",
      step_type: "custom_question",
      is_required: false,
      metadata: { workflow_step_id: "background-check" },
    });
    expect(stepRequiresApplicantAgreement(optionalBackground)).toBe(false);
    expect(stepRequiresIdentityDocuments(optionalBackground)).toBe(false);
    expect(
      isAuthorizationsSaveBlocked({
        step: optionalBackground,
        agreed: false,
        agreementSigned: false,
        identityDocsComplete: false,
      })
    ).toBe(false);
  });

  it("advances from background check to Add Reference on the default workflow", () => {
    const config: TenantOnboardingConfig = {
      id: "cfg-default",
      tenantId: "tenant-1",
      steps: [
        step({ step_key: "resume_upload", step_type: "resume_upload", sort_order: 10 }),
        step({ step_key: "professional_license", step_type: "professional_license", sort_order: 20 }),
        step({ step_key: "skill_assessment", step_type: "skill_assessment", sort_order: 30 }),
        step({
          step_key: "authorization_background_check",
          step_type: "custom_question",
          sort_order: 40,
          metadata: { workflow_step_id: "background-check" },
        }),
        step({
          step_key: "references",
          step_type: "references",
          sort_order: 50,
          metadata: { min_count: 1, workflow_step_id: "references-collection" },
        }),
        step({ step_key: "review_submit", step_type: "review_submit", sort_order: 60 }),
      ],
      requiredDocuments: [],
      skillAssessments: [],
    };
    const background = config.steps.find((s) => s.step_key === "authorization_background_check")!;
    const next = adjacentStepRoute(config, background, 1, "zipstaff");
    expect(next).toContain("add-references");
    expect(next).toContain("stepKey=references");
    expect(next).toContain("tenant=zipstaff");
  });

  it("still supports custom workflows that keep a standalone agreement signature step", () => {
    const config = zipstaffAuthorizationsConfig();
    const background = config.steps.find((s) => s.step_key === "authorization_background_check")!;
    const next = adjacentStepRoute(config, background, 1, "zipstaff");
    expect(next).toContain("agreement-signature");
    expect(next).toContain("stepKey=agreement_signature");
  });
});

describe("isOnboardingStepSkippable", () => {
  it("allows skipping authorization steps during the applicant flow", () => {
    const background = step({
      step_key: "authorization_background_check",
      step_type: "custom_question",
      metadata: { workflow_step_id: "background-check" },
    });
    expect(isOnboardingStepSkippable(background)).toBe(true);
  });

  it("blocks skipping resume upload and final review", () => {
    expect(
      isOnboardingStepSkippable(
        step({ step_key: "resume_upload", step_type: "resume_upload" })
      )
    ).toBe(false);
    expect(
      isOnboardingStepSkippable(
        step({ step_key: "review_submit", step_type: "review_submit" })
      )
    ).toBe(false);
  });

  it("respects explicit allow_skip=false", () => {
    expect(
      isOnboardingStepSkippable(
        step({
          step_key: "authorization_background_check",
          step_type: "custom_question",
          metadata: { allow_skip: false, workflow_step_id: "background-check" },
        })
      )
    ).toBe(false);
  });

  it("does not let one tenant's Firma config affect another tenant's step shape", () => {
    const tenantA = step({
      step_key: "agreement_signature",
      step_type: "authorizations",
      metadata: {
        workflow_step_id: "employee-agreement",
        workflow_settings: {
          ...DEFAULT_STEP_SETTINGS,
          firmaRecruiterTemplateId: "tenant-a-template",
        },
      },
    });
    const tenantB = step({
      step_key: "agreement_signature",
      step_type: "authorizations",
      metadata: { workflow_step_id: "employee-agreement" },
    });
    expect(shouldShowFirmaAgreementPanel(tenantA)).toBe(true);
    expect(shouldShowFirmaAgreementPanel(tenantB)).toBe(false);
  });
});

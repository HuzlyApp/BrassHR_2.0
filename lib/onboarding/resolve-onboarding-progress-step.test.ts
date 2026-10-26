import { describe, expect, it } from "vitest";
import { resolveOnboardingProgressStep } from "@/lib/onboarding/resolve-onboarding-progress-step";
import type { TenantOnboardingConfig, TenantOnboardingStep } from "@/lib/onboarding/types";

function step(partial: Partial<TenantOnboardingStep> & Pick<TenantOnboardingStep, "id" | "step_key">): TenantOnboardingStep {
  return {
    title: partial.title ?? partial.step_key,
    description: null,
    step_type: partial.step_type ?? "custom_question",
    sort_order: partial.sort_order ?? 10,
    is_required: partial.is_required ?? true,
    is_enabled: partial.is_enabled ?? true,
    metadata: partial.metadata ?? {},
    ...partial,
  };
}

describe("resolveOnboardingProgressStep", () => {
  const config: TenantOnboardingConfig = {
    configId: "cfg",
    tenantId: "tenant",
    version: 1,
    steps: [
      step({
        id: "auth-1",
        step_key: "custom_question",
        step_type: "custom_question",
        metadata: { workflow_step_id: "background-check" },
      }),
      step({
        id: "resume-1",
        step_key: "resume_upload",
        step_type: "resume_upload",
      }),
    ],
    requiredDocuments: [],
    skillAssessments: [],
  };

  it("resolves by exact step key", () => {
    expect(resolveOnboardingProgressStep(config, { stepKey: "custom_question" })?.id).toBe("auth-1");
  });

  it("resolves authorization aliases to background-check step", () => {
    expect(
      resolveOnboardingProgressStep(config, { stepKey: "authorization_background_check" })?.id
    ).toBe("auth-1");
  });

  it("resolves by step id", () => {
    expect(resolveOnboardingProgressStep(config, { stepId: "auth-1" })?.step_key).toBe(
      "custom_question"
    );
  });

  it("resolves resume_upload by type fallback", () => {
    const withoutKey: TenantOnboardingConfig = {
      ...config,
      steps: [
        step({
          id: "resume-2",
          step_key: "resume_upload_2",
          step_type: "resume_upload",
        }),
      ],
    };
    expect(resolveOnboardingProgressStep(withoutKey, { stepKey: "resume_upload" })?.id).toBe(
      "resume-2"
    );
  });

  it("does not collapse numbered custom_question keys onto another training step", () => {
    const multi: TenantOnboardingConfig = {
      ...config,
      steps: [
        step({
          id: "safety-1",
          step_key: "custom_question_10",
          metadata: { workflow_step_id: "safety-training" },
        }),
        step({
          id: "compliance-1",
          step_key: "custom_question_11",
          metadata: { workflow_step_id: "compliance-training" },
        }),
        step({
          id: "orientation-1",
          step_key: "custom_question_12",
          metadata: { workflow_step_id: "orientation-video" },
        }),
      ],
    };

    expect(resolveOnboardingProgressStep(multi, { stepKey: "custom_question_11" })?.id).toBe(
      "compliance-1"
    );
    expect(
      resolveOnboardingProgressStep(multi, { stepId: "orientation-1", stepKey: "custom_question_12" })
        ?.id
    ).toBe("orientation-1");
  });
});

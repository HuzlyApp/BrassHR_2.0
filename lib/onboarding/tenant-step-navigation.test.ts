import { describe, expect, it } from "vitest";
import {
  resolveApplicantEnabledSteps,
  resolvePostStepContinueRoute,
} from "@/lib/onboarding/tenant-step-navigation";
import type { TenantOnboardingConfig, TenantOnboardingStep } from "@/lib/onboarding/types";
import { publishedWorkflow } from "@/lib/onboarding/applicant-workflow-fixtures";
import { publishedWorkflowToTenantConfig } from "@/lib/onboarding/applicant-workflow";

const publishedConfig = publishedWorkflowToTenantConfig(publishedWorkflow);

describe("resolveApplicantEnabledSteps", () => {
  it("uses published tenant steps instead of legacy fallback when config is loaded", () => {
    const steps = resolveApplicantEnabledSteps(publishedConfig, false);

    expect(steps?.map((s) => s.title)).toEqual([
      "Skill / Qualification Assessment",
      "Document Upload",
      "Background Check",
    ]);
    expect(steps?.map((s) => s.title)).not.toContain("Add References");
    expect(steps?.map((s) => s.title)).not.toContain("Add Resume");
  });

  it("returns empty array for published config with no visible steps instead of legacy fallback", () => {
    const emptyConfig: TenantOnboardingConfig = {
      ...publishedConfig,
      steps: [],
    };

    const steps = resolveApplicantEnabledSteps(emptyConfig, false);

    expect(steps).toEqual([]);
  });

  it("returns null while loading", () => {
    expect(resolveApplicantEnabledSteps(publishedConfig, true)).toBeNull();
  });

  it("falls back to legacy steps only when config is unavailable", () => {
    const steps = resolveApplicantEnabledSteps(null, false);

    expect(steps?.map((s) => s.title)).toEqual([
      "Upload Resume",
      "Professional License",
      "Skill Assessment",
      "Authorization / Background Check",
      "Add Reference",
      "Final Review / Completion",
    ]);
  });
});

describe("resolvePostStepContinueRoute", () => {
  it("routes to the next enabled step when one exists", () => {
    const steps = resolveApplicantEnabledSteps(publishedConfig, false)!;
    const route = resolvePostStepContinueRoute(publishedConfig, steps[0], "subdomaintest");
    expect(route).toContain("/application/");
    expect(route).toContain("stepKey=");
    expect(route).toContain("tenant=subdomaintest");
  });

  it("routes to applicant status when the current step is last", () => {
    const twoStepConfig: TenantOnboardingConfig = {
      ...publishedConfig,
      steps: publishedConfig.steps.slice(0, 2),
    };
    const steps = resolveApplicantEnabledSteps(twoStepConfig, false)!;
    const lastStep = steps[steps.length - 1]!;
    const route = resolvePostStepContinueRoute(twoStepConfig, lastStep, "subdomaintest");
    expect(route).toBe("/application/application-status?completion=pre_hire&tenant=subdomaintest");
  });

  it("sends the candidate back to a skipped required step after the last step", () => {
    const steps = [
      phaseStep("safety", "Safety Training", "post_hire", true),
      phaseStep("orientation", "Orientation", "post_hire", true),
      phaseStep("cert", "Certification", "post_hire", false),
    ];
    const config = { ...publishedConfig, steps };
    const route = resolvePostStepContinueRoute(config, steps[2]!, "testcompany", {
      progress: {
        progressId: "p1",
        status: "in_progress",
        steps: [
          { onboarding_step_id: "safety", status: "skipped", completed_at: null, data: {} },
          { onboarding_step_id: "orientation", status: "completed", completed_at: null, data: {} },
        ],
      },
      savedStepId: "cert",
      savedStatus: "skipped",
    });
    expect(route).toContain("stepKey=safety");
    expect(route).not.toContain("application-status");
  });

  it("opens the final screen when only optional steps were skipped", () => {
    const steps = [
      phaseStep("safety", "Safety Training", "post_hire", true),
      phaseStep("cert", "Certification", "post_hire", false),
    ];
    const config = { ...publishedConfig, steps };
    const route = resolvePostStepContinueRoute(config, steps[1]!, "testcompany", {
      progress: {
        progressId: "p1",
        status: "in_progress",
        steps: [
          { onboarding_step_id: "safety", status: "completed", completed_at: null, data: {} },
        ],
      },
      savedStepId: "cert",
      savedStatus: "skipped",
    });
    expect(route).toBe("/application/application-status?completion=post_hire&tenant=testcompany");
  });
});

function phaseStep(
  id: string,
  title: string,
  phase: "pre_hire" | "post_hire",
  required: boolean
): TenantOnboardingStep {
  return {
    id,
    step_key: id,
    title,
    description: null,
    step_type: "custom_question",
    sort_order: 1,
    is_required: required,
    is_enabled: true,
    metadata: {
      workflow_step_id: id,
      workflow_settings: { phase, completionOwner: "applicant" },
    },
  };
}

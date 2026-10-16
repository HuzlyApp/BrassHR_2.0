import { describe, expect, it } from "vitest";
import { evaluateWorkflowCompletion } from "@/lib/onboarding/workflow-completion-check";
import type { TenantOnboardingStep, WorkerOnboardingProgressPayload } from "@/lib/onboarding/types";

function mockStep(id: string, key: string, title: string, phase: "pre_hire" | "post_hire", required = true): TenantOnboardingStep {
  return {
    id,
    step_key: key,
    title,
    description: null,
    step_type: "custom_question",
    sort_order: 1,
    is_required: required,
    is_enabled: true,
    metadata: {
      workflow_settings: {
        phase,
      },
    },
  };
}

describe("evaluateWorkflowCompletion", () => {
  it("treats the Pre-Hire completion screen as done once the other Pre-Hire steps are done", () => {
    const steps = [
      mockStep("s1", "resume_upload", "Resume", "pre_hire"),
      {
        ...mockStep("s2", "pre_hire_done", "Pre Hire Completion / Milestone", "pre_hire"),
        metadata: {
          workflow_step_id: "pre-hire-completion-milestone",
          workflow_settings: { phase: "pre_hire", completionOwner: "applicant" },
        },
      },
    ];
    const progress: WorkerOnboardingProgressPayload = {
      progressId: "p1",
      status: "in_progress",
      steps: [
        { onboarding_step_id: "s1", status: "completed", completed_at: new Date().toISOString(), data: {} },
      ],
    };
    const result = evaluateWorkflowCompletion({ allSteps: steps, progress, tenantSlug: "acme" });
    expect(result.preHire.isComplete).toBe(true);
    expect(result.preHire.total).toBe(1);
  });

  it("detects pre-hire incomplete when steps are pending", () => {
    const steps = [
      mockStep("s1", "resume_upload", "Resume", "pre_hire"),
      mockStep("s2", "id_verify", "ID", "pre_hire"),
      mockStep("s3", "i9_form", "I-9", "post_hire"),
    ];

    const progress: WorkerOnboardingProgressPayload = {
      progressId: "p1",
      status: "in_progress",
      steps: [
        { onboarding_step_id: "s1", status: "completed", completed_at: new Date().toISOString(), data: {} },
        { onboarding_step_id: "s2", status: "pending", completed_at: null, data: {} },
      ],
    };

    const result = evaluateWorkflowCompletion({
      allSteps: steps,
      progress,
      tenantSlug: "acme",
    });

    expect(result.preHire.isComplete).toBe(false);
    expect(result.preHire.completedCount).toBe(1);
    expect(result.preHire.total).toBe(2);
    expect(result.postHire.isComplete).toBe(false);
    expect(result.allComplete).toBe(false);
    expect(result.hasPostHireSteps).toBe(true);
    expect(result.firstPostHireRoute).toContain("i9_form");
  });

  it("detects pre-hire complete and post-hire ready to start", () => {
    const steps = [
      mockStep("s1", "resume_upload", "Resume", "pre_hire"),
      mockStep("s2", "id_verify", "ID", "pre_hire"),
      mockStep("s3", "i9_form", "I-9", "post_hire"),
      mockStep("s4", "direct_deposit", "Direct Deposit", "post_hire"),
    ];

    const progress: WorkerOnboardingProgressPayload = {
      progressId: "p1",
      status: "in_progress",
      steps: [
        { onboarding_step_id: "s1", status: "completed", completed_at: new Date().toISOString(), data: {} },
        { onboarding_step_id: "s2", status: "completed", completed_at: new Date().toISOString(), data: {} },
      ],
    };

    const result = evaluateWorkflowCompletion({
      allSteps: steps,
      progress,
      tenantSlug: "acme",
    });

    expect(result.preHire.isComplete).toBe(true);
    expect(result.preHire.completedCount).toBe(2);
    expect(result.preHire.percent).toBe(100);
    expect(result.postHire.isComplete).toBe(false);
    expect(result.allComplete).toBe(false);
    expect(result.hasPostHireSteps).toBe(true);
    expect(result.firstPostHireRoute).toContain("i9_form");
  });

  it("detects all steps complete when both pre-hire and post-hire steps are completed", () => {
    const steps = [
      mockStep("s1", "resume_upload", "Resume", "pre_hire"),
      mockStep("s2", "id_verify", "ID", "pre_hire"),
      mockStep("s3", "i9_form", "I-9", "post_hire"),
      mockStep("s4", "direct_deposit", "Direct Deposit", "post_hire"),
    ];

    const progress: WorkerOnboardingProgressPayload = {
      progressId: "p1",
      status: "completed",
      steps: [
        { onboarding_step_id: "s1", status: "completed", completed_at: new Date().toISOString(), data: {} },
        { onboarding_step_id: "s2", status: "completed", completed_at: new Date().toISOString(), data: {} },
        { onboarding_step_id: "s3", status: "completed", completed_at: new Date().toISOString(), data: {} },
        { onboarding_step_id: "s4", status: "completed", completed_at: new Date().toISOString(), data: {} },
      ],
    };

    const result = evaluateWorkflowCompletion({
      allSteps: steps,
      progress,
      tenantSlug: "acme",
    });

    expect(result.preHire.isComplete).toBe(true);
    expect(result.postHire.isComplete).toBe(true);
    expect(result.allComplete).toBe(true);
    expect(result.hasPostHireSteps).toBe(true);
  });

  it("excludes skipped steps from completed count and percent while keeping phase complete", () => {
    const steps = [
      mockStep("s1", "resume_upload", "Resume", "pre_hire"),
      mockStep("s2", "credential", "Credential / License Verification", "pre_hire", false),
      mockStep("s3", "ssn", "SSN / Identity Verification", "pre_hire", false),
      mockStep("s4", "i9_form", "I-9", "post_hire"),
    ];

    const progress: WorkerOnboardingProgressPayload = {
      progressId: "p1",
      status: "in_progress",
      steps: [
        { onboarding_step_id: "s1", status: "completed", completed_at: new Date().toISOString(), data: {} },
        { onboarding_step_id: "s2", status: "skipped", completed_at: null, data: {} },
        { onboarding_step_id: "s3", status: "skipped", completed_at: null, data: {} },
      ],
    };

    const result = evaluateWorkflowCompletion({
      allSteps: steps,
      progress,
      tenantSlug: "acme",
    });

    expect(result.preHire.isComplete).toBe(true);
    expect(result.preHire.completedCount).toBe(1);
    expect(result.preHire.total).toBe(3);
    expect(result.preHire.percent).toBe(33);
    expect(result.preHire.steps.filter((s) => s.isSkipped)).toHaveLength(2);
    expect(result.preHire.steps.find((s) => s.id === "s2")?.isComplete).toBe(false);
  });

  it("handles workflow with only pre-hire steps", () => {
    const steps = [
      mockStep("s1", "resume_upload", "Resume", "pre_hire"),
      mockStep("s2", "id_verify", "ID", "pre_hire"),
    ];

    const progress: WorkerOnboardingProgressPayload = {
      progressId: "p1",
      status: "completed",
      steps: [
        { onboarding_step_id: "s1", status: "completed", completed_at: new Date().toISOString(), data: {} },
        { onboarding_step_id: "s2", status: "completed", completed_at: new Date().toISOString(), data: {} },
      ],
    };

    const result = evaluateWorkflowCompletion({
      allSteps: steps,
      progress,
      tenantSlug: "acme",
    });

    expect(result.preHire.isComplete).toBe(true);
    expect(result.hasPostHireSteps).toBe(false);
    expect(result.allComplete).toBe(true);
  });
});

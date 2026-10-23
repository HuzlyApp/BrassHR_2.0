import { describe, expect, it } from "vitest";
import {
  applicantMayActOnStep,
  applicantPortalCopy,
  applyApplicantPhaseToConfig,
  applyApplicantPhaseToWorkflow,
  filterPublishedStepsForApplicantPhase,
  filterStepsForApplicantPhase,
  isPlacementAcceptedStatus,
  isTerminalApplicationStatus,
  lifecyclePhaseFromTemplatePhase,
  parseApplicantLifecyclePhase,
  phaseProgress,
  readStepLifecyclePhase,
} from "@/lib/onboarding/workflow-phase";
import type { TenantOnboardingConfig, TenantOnboardingStep } from "@/lib/onboarding/types";
import type { PublishedWorkflow } from "@/lib/onboarding/applicant-workflow-types";

function step(
  id: string,
  title: string,
  phase: "pre_hire" | "transition" | "post_hire"
): TenantOnboardingStep {
  return {
    id,
    step_key: id,
    title,
    description: null,
    step_type: "custom_question",
    sort_order: 10,
    is_required: true,
    is_enabled: true,
    metadata: { workflow_settings: { phase } },
  };
}

describe("workflow phase helpers", () => {
  it("maps transition (approval gate) onto Pre-Hire, not a third applicant phase", () => {
    expect(lifecyclePhaseFromTemplatePhase("transition")).toBe("pre_hire");
    expect(readStepLifecyclePhase(step("approval", "Pre-Hire Approval", "transition"))).toBe(
      "pre_hire"
    );
  });

  it("filters applicant steps to the active phase only", () => {
    const steps = [
      step("resume", "Resume", "pre_hire"),
      step("approval", "Pre-Hire Approval", "transition"),
      step("w9", "W-9 Tax Form", "post_hire"),
    ];

    expect(filterStepsForApplicantPhase(steps, "pre_hire").map((s) => s.id)).toEqual([
      "resume",
      "approval",
    ]);
    expect(filterStepsForApplicantPhase(steps, "post_hire").map((s) => s.id)).toEqual(["w9"]);
  });

  it("does not expose Post-Hire steps before acceptance", () => {
    const config: TenantOnboardingConfig = {
      configId: "cfg",
      tenantId: "t1",
      version: 1,
      steps: [step("resume", "Resume", "pre_hire"), step("w9", "W-9", "post_hire")],
      requiredDocuments: [
        {
          id: "d1",
          onboarding_step_id: "w9",
          title: "W-9",
          description: null,
          is_required: true,
          sort_order: 1,
          accepted_file_types: ["pdf"],
          max_file_size_mb: 10,
        },
      ],
      skillAssessments: [],
    };

    const gated = applyApplicantPhaseToConfig(config, "pre_hire");
    expect(gated.steps.map((s) => s.id)).toEqual(["resume"]);
    expect(gated.requiredDocuments).toEqual([]);
  });

  it("denies completing a Post-Hire step while the application is still Pre-Hire", () => {
    expect(
      applicantMayActOnStep({ activePhase: "pre_hire", stepPhase: "post_hire" })
    ).toBe(false);
    expect(
      applicantMayActOnStep({ activePhase: "post_hire", stepPhase: "post_hire", isHired: true })
    ).toBe(true);
    expect(
      applicantMayActOnStep({ activePhase: "post_hire", stepPhase: "post_hire", isHired: false })
    ).toBe(true);
    expect(
      applicantMayActOnStep({ activePhase: "post_hire", stepPhase: "pre_hire" })
    ).toBe(true);
    expect(
      applicantMayActOnStep({ activePhase: "completed", stepPhase: "pre_hire" })
    ).toBe(false);
  });

  it("calculates progress against the active phase only", () => {
    const preHire = [step("a", "A", "pre_hire"), step("b", "B", "pre_hire")];
    expect(phaseProgress({ steps: preHire, completedStepIds: new Set(["a"]) })).toEqual({
      complete: 1,
      total: 2,
      percent: 50,
    });
  });

  it("keeps phase on the application, not the worker", () => {
    const jobA = parseApplicantLifecyclePhase("post_hire");
    const jobB = parseApplicantLifecyclePhase("pre_hire");
    expect(jobA).toBe("post_hire");
    expect(jobB).toBe("pre_hire");
  });

  it("does not treat rejected applications as placement-accepted", () => {
    expect(isTerminalApplicationStatus("rejected")).toBe(true);
    expect(isPlacementAcceptedStatus("rejected")).toBe(false);
    expect(isPlacementAcceptedStatus("hired")).toBe(true);
  });

  it("changes applicant copy after acceptance", () => {
    expect(applicantPortalCopy("pre_hire").header).toBe("Your Application");
    expect(applicantPortalCopy("post_hire").header).toBe("Your Onboarding");
  });

  it("filters published workflow steps for the applicant API", () => {
    const workflow: PublishedWorkflow = {
      workflowId: "wf",
      tenant: "acme",
      version: 1,
      status: "published",
      steps: [
        {
          id: "pre",
          type: "document_upload",
          title: "Resume",
          description: "",
          required: true,
          day: 1,
          order: 1,
          settings: { phase: "pre_hire" },
        },
        {
          id: "post",
          type: "document_upload",
          title: "W-9",
          description: "",
          required: true,
          day: 2,
          order: 2,
          settings: { phase: "post_hire" },
        },
      ],
    };

    expect(filterPublishedStepsForApplicantPhase(workflow.steps, "pre_hire").map((s) => s.id)).toEqual([
      "pre",
    ]);
    expect(applyApplicantPhaseToWorkflow(workflow, "post_hire").steps.map((s) => s.id)).toEqual([
      "post",
    ]);
  });

  it("enforces pre_hire phase for I-9 section 1 and offer acceptance, while keeping section 2 post_hire", () => {
    expect(
      readStepLifecyclePhase(
        step("i9-s1", "I-9 section 1", "post_hire")
      )
    ).toBe("pre_hire");

    expect(
      readStepLifecyclePhase(
        step("custom_question_12", "I-9 section 1", "post_hire")
      )
    ).toBe("pre_hire");

    expect(
      readStepLifecyclePhase(
        step("doc-rtw", "I-9 / Right to Work Verification", "post_hire")
      )
    ).toBe("post_hire");

    expect(
      readStepLifecyclePhase(
        step("welcome-packet-esign", "Welcome Packet & eSign", "post_hire")
      )
    ).toBe("post_hire");

    expect(
      readStepLifecyclePhase(
        step("offer-acc", "Pay Rate Accepted", "post_hire")
      )
    ).toBe("pre_hire");

    expect(
      readStepLifecyclePhase(
        step("i9-s2", "I-9 Section 2 / E-Verify", "post_hire")
      )
    ).toBe("post_hire");

    expect(
      applicantMayActOnStep({
        activePhase: "pre_hire",
        stepPhase: readStepLifecyclePhase(step("q12", "I-9 section 1", "post_hire")),
      })
    ).toBe(true);
  });
});

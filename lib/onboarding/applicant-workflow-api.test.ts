import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { publishedWorkflow } from "@/lib/onboarding/applicant-workflow-fixtures";
import {
  completeApplicantStep,
  getApplicantStepStatus,
  getApplicantWorkflow,
  publishWorkflowToAll,
  resetApplicantWorkflowTestStore,
  seedApplicantWorkflowSession,
  seedWorkflow,
} from "@/lib/onboarding/applicant-workflow-persistence";
import { GET as getOnboardingWorkflow } from "@/app/api/applications/[applicationId]/onboarding-workflow/route";

beforeEach(() => {
  resetApplicantWorkflowTestStore();
});

describe("GET /api/applications/:applicationId/onboarding-workflow", () => {
  it("returns the published workflow assigned to the applicant", async () => {
    await seedWorkflow({
      ...publishedWorkflow,
      status: "published",
    });

    await seedWorkflow({
      ...publishedWorkflow,
      version: 4,
      status: "draft",
      steps: [
        {
          id: "step_reference_verification",
          type: "reference_verification",
          title: "Reference Verification",
          description: "",
          required: true,
          day: 1,
          order: 1,
          settings: {},
        },
      ],
    });

    const req = new NextRequest(
      "http://localhost/api/applications/app_123/onboarding-workflow?tenant=subdomaintest"
    );
    const response = await getOnboardingWorkflow(req, {
      params: Promise.resolve({ applicationId: "app_123" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.status).toBe("published");
    expect(body.version).toBe(3);
    expect(body.steps.map((step: { type: string }) => step.type)).toEqual([
      "skill_qualification_assessment",
      "document_upload",
      "background_check",
    ]);
    expect(body.steps.map((step: { type: string }) => step.type)).not.toContain(
      "reference_verification"
    );
  });

  it("returns only Pre-Hire steps before placement acceptance", async () => {
    await seedWorkflow({
      ...publishedWorkflow,
      steps: [
        ...publishedWorkflow.steps,
        {
          id: "step_w9",
          type: "document_upload",
          title: "W-9 Tax Form",
          description: "",
          required: true,
          day: 4,
          order: 4,
          settings: { phase: "post_hire" },
        },
      ],
    });

    const req = new NextRequest(
      "http://localhost/api/applications/app_123/onboarding-workflow?tenant=subdomaintest"
    );
    const response = await getOnboardingWorkflow(req, {
      params: Promise.resolve({ applicationId: "app_123" }),
    });
    const body = await response.json();
    expect(body.workflowPhase).toBe("pre_hire");
    expect(body.steps.map((step: { title: string }) => step.title)).not.toContain("W-9 Tax Form");
  });
});

describe("applicant workflow versioning", () => {
  it("does not expose draft workflow steps to applicant sessions", async () => {
    await seedWorkflow(publishedWorkflow);

    await seedWorkflow({
      ...publishedWorkflow,
      version: 4,
      status: "draft",
      steps: [
        {
          id: "step_references",
          type: "reference_verification",
          title: "Reference Verification",
          description: "",
          required: true,
          day: 1,
          order: 1,
          settings: {},
        },
      ],
    });

    const workflow = await getApplicantWorkflow({
      tenant: "subdomaintest",
      applicationId: "app_123",
    });

    expect(workflow.version).toBe(3);
    expect(workflow.steps.map((step) => step.type)).not.toContain("reference_verification");
  });

  it("links new applicant sessions to the latest published workflow after Publish Workflow", async () => {
    await seedWorkflow({
      ...publishedWorkflow,
      version: 3,
      status: "published",
    });

    const newPublishedWorkflow = {
      ...publishedWorkflow,
      version: 4,
      status: "published" as const,
      steps: [
        ...publishedWorkflow.steps,
        {
          id: "step_reference_verification",
          type: "reference_verification",
          title: "Reference Verification",
          description: "",
          required: true,
          day: 4,
          order: 4,
          settings: {},
        },
      ],
    };

    await publishWorkflowToAll(newPublishedWorkflow);

    const workflow = await getApplicantWorkflow({
      tenant: "subdomaintest",
      applicationId: "app_new",
    });

    expect(workflow.version).toBe(4);
    expect(workflow.steps.map((step) => step.type)).toContain("reference_verification");
  });

  it("keeps existing applicants on their assigned workflow version by default", async () => {
    await seedWorkflow({
      ...publishedWorkflow,
      version: 3,
      status: "published",
    });

    await seedApplicantWorkflowSession({
      applicationId: "app_existing",
      workflowId: "worker_onboarding",
      workflowVersion: 3,
    });

    await seedWorkflow({
      ...publishedWorkflow,
      version: 4,
      status: "published",
      steps: [
        ...publishedWorkflow.steps,
        {
          id: "step_reference_verification",
          type: "reference_verification",
          title: "Reference Verification",
          description: "",
          required: true,
          day: 4,
          order: 4,
          settings: {},
        },
      ],
    });

    const workflow = await getApplicantWorkflow({
      tenant: "subdomaintest",
      applicationId: "app_existing",
    });

    expect(workflow.version).toBe(3);
    expect(workflow.steps.map((step) => step.type)).not.toContain("reference_verification");
  });
});

describe("applicant step persistence", () => {
  it("stores completion state per applicant, workflow, and step", async () => {
    await completeApplicantStep({
      applicationId: "app_123",
      workflowId: "worker_onboarding",
      workflowVersion: 3,
      stepId: "step_document_upload",
      status: "completed",
    });

    const status = await getApplicantStepStatus({
      applicationId: "app_123",
      workflowId: "worker_onboarding",
      workflowVersion: 3,
      stepId: "step_document_upload",
    });

    expect(status).toMatchObject({
      applicationId: "app_123",
      workflowId: "worker_onboarding",
      workflowVersion: 3,
      stepId: "step_document_upload",
      status: "completed",
    });

    expect(status.completedAt).toBeTruthy();
  });

  it("does not share step status between applicants", async () => {
    await completeApplicantStep({
      applicationId: "app_123",
      workflowId: "worker_onboarding",
      workflowVersion: 3,
      stepId: "step_document_upload",
      status: "completed",
    });

    const otherApplicantStatus = await getApplicantStepStatus({
      applicationId: "app_456",
      workflowId: "worker_onboarding",
      workflowVersion: 3,
      stepId: "step_document_upload",
    });

    expect(otherApplicantStatus.status).not.toBe("completed");
  });
});

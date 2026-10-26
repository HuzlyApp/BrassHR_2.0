import { describe, expect, it } from "vitest";
import {
  attachWorkflowDocuments,
  configFromJobWorkflowDraft,
  matchPublishedStepForJobDraft,
  unmatchedJobWorkflowDrafts,
} from "@/lib/onboarding/load-config-for-job-workflow";
import type { TenantOnboardingConfig } from "@/lib/onboarding/types";
import type { SerializableWorkflowState } from "@/lib/onboarding/workflow-builder-serialization";

const published: TenantOnboardingConfig = {
  configId: "cfg-1",
  tenantId: "tenant-1",
  version: 1,
  steps: [
    {
      id: "uuid-resume",
      step_key: "resume_upload",
      title: "Add Resume",
      description: null,
      step_type: "resume_upload",
      sort_order: 10,
      is_required: true,
      is_enabled: true,
      metadata: { workflow_node_id: "node-resume", workflow_step_id: "upload-resume" },
    },
    {
      id: "uuid-skill",
      step_key: "skill_assessment",
      title: "Skills",
      description: null,
      step_type: "skill_assessment",
      sort_order: 20,
      is_required: true,
      is_enabled: true,
      metadata: { workflow_node_id: "node-skill", workflow_step_id: "skill-assessment" },
    },
    {
      id: "uuid-license",
      step_key: "professional_license",
      title: "License",
      description: null,
      step_type: "professional_license",
      sort_order: 30,
      is_required: true,
      is_enabled: true,
      metadata: { workflow_node_id: "node-license", workflow_step_id: "professional-license" },
    },
  ],
  requiredDocuments: [
    {
      id: "doc-1",
      onboarding_step_id: "uuid-license",
      title: "License scan",
      description: null,
      is_required: true,
      sort_order: 1,
      accepted_file_types: ["pdf"],
      max_file_size_mb: 10,
    },
  ],
  skillAssessments: [
    {
      id: "sa-1",
      onboarding_step_id: "uuid-skill",
      title: "Clinical quiz",
      description: null,
      is_enabled: true,
      questions: [],
    },
  ],
};

function draftWithNodes(
  nodes: Array<{ id: string; stepId: string; label: string }>
): SerializableWorkflowState {
  return {
    nodes: nodes.map((node, index) => ({
      id: node.id,
      stepId: node.stepId,
      label: node.label,
      description: "",
      day: 0,
      required: true,
      position: { x: 0, y: index * 80 },
      settings: {},
    })),
    edges: nodes.slice(0, -1).map((node, index) => ({
      id: `e-${index}`,
      source: node.id,
      target: nodes[index + 1]!.id,
    })),
  };
}

describe("matchPublishedStepForJobDraft", () => {
  it("matches by workflow node id first", () => {
    const matched = matchPublishedStepForJobDraft(
      published.steps,
      {
        step_key: "skill_assessment",
        title: "Skills",
        description: null,
        step_type: "skill_assessment",
        sort_order: 20,
        is_required: true,
        is_enabled: true,
        metadata: { workflow_node_id: "node-skill" },
      },
      new Set()
    );
    expect(matched?.id).toBe("uuid-skill");
  });

  it("falls back to step type when keys differ", () => {
    const matched = matchPublishedStepForJobDraft(
      published.steps,
      {
        step_key: "skill_assessment_2",
        title: "Skills",
        description: null,
        step_type: "skill_assessment",
        sort_order: 20,
        is_required: true,
        is_enabled: true,
        metadata: {},
      },
      new Set()
    );
    expect(matched?.id).toBe("uuid-skill");
  });

  it("does not reuse a different library step of the same type", () => {
    const matched = matchPublishedStepForJobDraft(
      [
        {
          id: "uuid-background",
          step_key: "authorization_background_check",
          title: "Authorization / Background Check",
          description: null,
          step_type: "custom_question",
          sort_order: 40,
          is_required: true,
          is_enabled: true,
          metadata: { workflow_step_id: "background-check" },
        },
      ],
      {
        step_key: "custom_question",
        title: "Collect references",
        description: "",
        step_type: "custom_question",
        sort_order: 40,
        is_required: true,
        is_enabled: true,
        metadata: { workflow_step_id: "collect-references", workflow_node_id: "rnr-healthcare-04" },
        required_documents: [],
      },
      new Set()
    );
    expect(matched).toBeNull();
  });
});

describe("configFromJobWorkflowDraft", () => {
  it("builds applicant steps from the job workflow canvas, not the full tenant list", () => {
    const cnaFlow = draftWithNodes([
      { id: "node-resume", stepId: "resume-basic-profile", label: "Resume" },
      { id: "node-skill", stepId: "skill-qualification-assessment", label: "CNA Skills" },
    ]);

    const config = configFromJobWorkflowDraft(published, cnaFlow);
    expect(config.steps.map((s) => s.step_type)).toEqual([
      "resume_upload",
      "skill_assessment",
    ]);
    expect(config.steps[1]?.title).toBe("CNA Skills");
    expect(config.steps[0]?.id).toBe("uuid-resume");
    expect(config.steps[1]?.id).toBe("uuid-skill");
    expect(config.skillAssessments).toHaveLength(1);
    expect(config.requiredDocuments).toHaveLength(0);
  });

  it("keeps license docs when the job workflow includes license", () => {
    const rnFlow = draftWithNodes([
      { id: "node-resume", stepId: "resume-basic-profile", label: "Resume" },
      {
        id: "node-license",
        stepId: "credential-license-verification",
        label: "RN License",
      },
    ]);

    const config = configFromJobWorkflowDraft(published, rnFlow);
    expect(config.steps.map((s) => s.step_type)).toEqual([
      "resume_upload",
      "professional_license",
    ]);
    expect(config.steps[1]?.title).toBe("RN License");
    expect(config.requiredDocuments).toHaveLength(1);
    expect(config.skillAssessments).toHaveLength(0);
  });

  it("uses a catalog anchor id for a job step that is not in the published flow", () => {
    const withAnchor: TenantOnboardingConfig = {
      ...published,
      steps: [
        ...published.steps,
        {
          id: "uuid-job-application",
          step_key: "profile_information",
          title: "Job application",
          description: null,
          step_type: "profile_information",
          sort_order: 300000,
          is_required: true,
          is_enabled: false,
          metadata: {
            workflow_node_id: "rnr-healthcare-02",
            workflow_step_id: "parameterized-job-application",
            catalog_anchor: true,
          },
        },
      ],
    };
    const flow = draftWithNodes([
      { id: "node-resume", stepId: "resume-basic-profile", label: "Resume" },
      { id: "rnr-healthcare-02", stepId: "parameterized-job-application", label: "Job application" },
    ]);

    const config = configFromJobWorkflowDraft(withAnchor, flow);
    const jobApplication = config.steps.find((step) => step.step_key === "profile_information");
    expect(jobApplication?.id).toBe("uuid-job-application");
    expect(jobApplication?.id.startsWith("preview-")).toBe(false);
    expect(unmatchedJobWorkflowDrafts(published.steps, [
      {
        step_key: "profile_information",
        title: "Job application",
        description: "",
        step_type: "profile_information",
        sort_order: 20,
        is_required: true,
        is_enabled: true,
        metadata: { workflow_step_id: "parameterized-job-application" },
        required_documents: [],
      },
    ])).toHaveLength(1);
  });
});

describe("attachWorkflowDocuments", () => {
  it("shows the nursing document list on the license step and hides an inactive forklift row", () => {
    const config = attachWorkflowDocuments(published, [
      {
        id: "doc-nursing",
        code: "NURSING_LICENSE",
        name: "Nursing license",
        is_required: true,
        has_expiration: true,
        collect_issuing_organization: true,
        collect_scope: true,
        collect_validity: true,
        sort_order: 10,
        is_active: true,
      },
      {
        id: "doc-ssn",
        code: "SSN_CARD",
        name: "SSN card",
        is_required: true,
        has_expiration: false,
        collect_issuing_organization: false,
        collect_scope: false,
        collect_validity: false,
        sort_order: 50,
        is_active: true,
      },
      {
        id: "doc-forklift",
        code: "FORKLIFT",
        name: "Forklift Operator Certification",
        is_required: true,
        has_expiration: true,
        collect_issuing_organization: true,
        collect_scope: false,
        collect_validity: false,
        sort_order: 70,
        is_active: false,
      },
    ]);

    expect(config.requiredDocuments.map((doc) => doc.title)).toEqual([
      "Nursing license",
      "SSN card",
    ]);
    expect(config.requiredDocuments[0]?.source).toBe("workflow");
    expect(config.requiredDocuments[1]?.has_expiration).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKFLOW_STEP_LABELS,
  createDefaultWorkflowState,
  resolveBuilderStepDrafts,
  tenantHasPublishedCustomWorkflow,
} from "@/lib/onboarding/default-workflow";
import { createDefaultOnboardingStepDrafts } from "@/lib/onboarding/default-onboarding-steps";
import {
  hydrateCanvasFromFlowDraft,
  selectBuilderCanvas,
} from "@/lib/onboarding/select-builder-canvas";
import type { TenantOnboardingConfig } from "@/lib/onboarding/types";
import { publishedWorkflowToTenantConfig } from "@/lib/onboarding/applicant-workflow";
import { publishedWorkflow } from "@/lib/onboarding/applicant-workflow-fixtures";

const publishedConfig = publishedWorkflowToTenantConfig(publishedWorkflow);

describe("createDefaultOnboardingStepDrafts", () => {
  it("defines the six default automation workflow steps", () => {
    const drafts = createDefaultOnboardingStepDrafts();
    expect(drafts.map((step) => step.title)).toEqual([...DEFAULT_WORKFLOW_STEP_LABELS]);
    expect(drafts.every((step) => step.is_enabled)).toBe(true);
  });
});

describe("createDefaultWorkflowState", () => {
  it("serializes six connected default workflow nodes", () => {
    const state = createDefaultWorkflowState();
    expect(state.nodes).toHaveLength(6);
    expect(state.nodes.map((node) => node.label)).toEqual([...DEFAULT_WORKFLOW_STEP_LABELS]);
    expect(state.edges).toHaveLength(5);
  });
});

describe("resolveBuilderStepDrafts", () => {
  it("returns platform defaults when tenant config is missing", () => {
    const resolved = resolveBuilderStepDrafts(null);
    expect(resolved.fromDefaults).toBe(true);
    expect(resolved.drafts.map((step) => step.title)).toEqual([...DEFAULT_WORKFLOW_STEP_LABELS]);
  });

  it("returns all tenant steps for admin builder, including disabled rows", () => {
    const config: TenantOnboardingConfig = {
      ...publishedConfig,
      steps: publishedConfig.steps.map((step, index) => ({
        ...step,
        is_enabled: index !== 1,
      })),
    };

    const resolved = resolveBuilderStepDrafts(config);
    expect(resolved.drafts).toHaveLength(publishedConfig.steps.length);
  });

  it("filters disabled steps for worker-facing hydration", () => {
    const config: TenantOnboardingConfig = {
      ...publishedConfig,
      steps: publishedConfig.steps.map((step, index) => ({
        ...step,
        is_enabled: index === 0,
      })),
    };

    const resolved = resolveBuilderStepDrafts(config, { workerFacing: true });
    expect(resolved.drafts).toHaveLength(1);
  });
});

describe("tenantHasPublishedCustomWorkflow", () => {
  it("detects a saved builder draft as custom", () => {
    expect(
      tenantHasPublishedCustomWorkflow(publishedConfig, createDefaultWorkflowState())
    ).toBe(true);
  });

  it("detects enabled published tenant steps as custom", () => {
    expect(tenantHasPublishedCustomWorkflow(publishedConfig, { nodes: [], edges: [] })).toBe(
      true
    );
  });

  it("returns false when no custom workflow exists", () => {
    expect(tenantHasPublishedCustomWorkflow(null, { nodes: [], edges: [] })).toBe(false);
  });
});

describe("selectBuilderCanvas fallback", () => {
  it("falls back to the six default steps when published config is empty", () => {
    const emptyConfig: TenantOnboardingConfig = {
      ...publishedConfig,
      steps: [],
    };

    const result = selectBuilderCanvas(
      { config: emptyConfig, publishStatus: "published", builderDraft: { nodes: [], edges: [] } },
      []
    );

    expect(result.source).toBe("default");
    expect(result.nodes.map((node) => node.data.label)).toEqual([...DEFAULT_WORKFLOW_STEP_LABELS]);
  });

  it("shows all admin steps for a tenant with disabled rows", () => {
    const config: TenantOnboardingConfig = {
      configId: "cfg-example",
      tenantId: "tenant-example",
      version: 1,
      steps: [
        {
          id: "1",
          step_key: "resume_upload",
          title: "Add Resume",
          description: null,
          step_type: "resume_upload",
          sort_order: 10,
          is_required: true,
          is_enabled: true,
          metadata: {},
        },
        {
          id: "2",
          step_key: "professional_license",
          title: "Professional License",
          description: null,
          step_type: "professional_license",
          sort_order: 20,
          is_required: true,
          is_enabled: false,
          metadata: {},
        },
      ],
      requiredDocuments: [],
      skillAssessments: [],
    };

    const result = selectBuilderCanvas(
      { config, publishStatus: "published", builderDraft: { nodes: [], edges: [] } },
      []
    );

    expect(result.source).toBe("published");
    expect(result.nodes.map((node) => node.data.label)).toEqual(["Add Resume", "Professional License"]);
  });
});

describe("hydrateCanvasFromFlowDraft", () => {
  it("keeps an empty flow draft as a blank sheet", () => {
    const result = hydrateCanvasFromFlowDraft(
      { nodes: [], edges: [] },
      { config: publishedConfig, publishStatus: "published", builderDraft: { nodes: [], edges: [] } },
      []
    );

    expect(result.source).toBe("blank");
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it("keeps authored flow steps without inserting Upload Resume", () => {
    const result = hydrateCanvasFromFlowDraft(
      {
        nodes: [
          {
            id: "step-contact",
            stepId: "contact-history",
            label: "Contact History",
            description: "",
            position: { x: 120, y: 40 },
            day: 1,
            required: true,
            settings: {
              required: true,
              clientPerforms: true,
              useBraasPartner: false,
              notifyHrOnFail: false,
              datePriority: "Day 1",
              provider: "",
              triggerAfter: "",
              notify: "",
              timeline: "",
              conditionalLogic: "",
              phase: "pre_hire",
            },
          },
        ],
        edges: [],
      },
      { config: publishedConfig, publishStatus: "published", builderDraft: { nodes: [], edges: [] } },
      []
    );

    expect(result.source).toBe("flow");
    expect(result.nodes.map((node) => node.data.label)).toEqual(["Contact History"]);
  });

  it("uses a published custom flow draft when present", () => {
    const customDraft = createDefaultWorkflowState();
    customDraft.nodes[1] = {
      ...customDraft.nodes[1],
      label: "Custom License Step",
    };

    const result = hydrateCanvasFromFlowDraft(
      customDraft,
      { config: publishedConfig, publishStatus: "published", builderDraft: { nodes: [], edges: [] } },
      []
    );

    expect(result.source).toBe("flow");
    expect(result.nodes[1]?.data.label).toBe("Custom License Step");
  });
});

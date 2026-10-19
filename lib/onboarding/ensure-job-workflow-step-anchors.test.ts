import { describe, expect, it, vi } from "vitest";
import type { OnboardingStepDraft } from "@/lib/onboarding/default-onboarding-steps";
import { ensureJobWorkflowStepAnchors } from "@/lib/onboarding/ensure-job-workflow-step-anchors";
import { configFromJobWorkflowDraft } from "@/lib/onboarding/load-config-for-job-workflow";
import type { TenantOnboardingConfig } from "@/lib/onboarding/types";
import type { SerializableWorkflowState } from "@/lib/onboarding/workflow-builder-serialization";

vi.mock("@/lib/cache", () => ({
  invalidateTenantCache: vi.fn(async () => undefined),
}));

const published: TenantOnboardingConfig = {
  configId: "cfg-1",
  tenantId: "tenant-1",
  version: 1,
  steps: [
    {
      id: "uuid-resume",
      step_key: "resume_upload",
      title: "Upload Resume",
      description: null,
      step_type: "resume_upload",
      sort_order: 10,
      is_required: true,
      is_enabled: true,
      metadata: { workflow_step_id: "resume-basic-profile" },
    },
  ],
  requiredDocuments: [],
  skillAssessments: [],
};

const jobApplicationDraft: OnboardingStepDraft = {
  step_key: "profile_information",
  title: "Job application",
  description: "Answer screening questions",
  step_type: "profile_information",
  sort_order: 20,
  is_required: true,
  is_enabled: true,
  metadata: {
    workflow_node_id: "rnr-healthcare-02",
    workflow_step_id: "parameterized-job-application",
  },
  required_documents: [],
};

function supabaseMock(options?: { conflict?: boolean }) {
  const inserted: Array<Record<string, unknown>> = [];
  const existing = {
    id: "uuid-existing-profile",
    step_key: "profile_information",
    title: "Job application",
    description: null,
    step_type: "profile_information",
    sort_order: 300000,
    is_required: true,
    is_enabled: false,
    metadata: { catalog_anchor: true },
  };

  const supabase = {
    from(table: string) {
      if (table !== "tenant_onboarding_steps") throw new Error(table);
      return {
        insert(payload: Record<string, unknown>) {
          inserted.push(payload);
          return {
            select() {
              return {
                single: async () => {
                  if (options?.conflict) {
                    return {
                      data: null,
                      error: {
                        code: "23505",
                        message: "duplicate key value violates unique constraint",
                        details: "Key (onboarding_config_id, step_key)=(cfg-1, profile_information) already exists.",
                      },
                    };
                  }
                  return {
                    data: {
                      id: "uuid-new-profile",
                      ...payload,
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({ data: existing, error: null }),
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  return { supabase, inserted };
}

describe("ensureJobWorkflowStepAnchors", () => {
  it("stores a disabled catalog row and the job flow uses that id", async () => {
    const { supabase, inserted } = supabaseMock();
    const anchored = await ensureJobWorkflowStepAnchors(supabase as never, published, [
      jobApplicationDraft,
    ]);

    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.is_enabled).toBe(false);
    expect(inserted[0]?.step_key).toBe("profile_information");
    expect((inserted[0]?.metadata as { catalog_anchor?: boolean }).catalog_anchor).toBe(true);
    expect(anchored.steps.find((step) => step.step_key === "profile_information")?.id).toBe(
      "uuid-new-profile"
    );

    const flow: SerializableWorkflowState = {
      nodes: [
        {
          id: "node-resume",
          stepId: "resume-basic-profile",
          label: "Resume",
          description: "",
          day: 0,
          required: true,
          position: { x: 0, y: 0 },
          settings: {},
        },
        {
          id: "rnr-healthcare-02",
          stepId: "parameterized-job-application",
          label: "Job application",
          description: "",
          day: 0,
          required: true,
          position: { x: 0, y: 80 },
          settings: {},
        },
      ],
      edges: [{ id: "e-1", source: "node-resume", target: "rnr-healthcare-02" }],
    };
    const config = configFromJobWorkflowDraft(anchored, flow);
    expect(config.steps.map((step) => step.id)).toEqual(["uuid-resume", "uuid-new-profile"]);
  });

  it("reuses the existing row when the step key is already stored", async () => {
    const { supabase, inserted } = supabaseMock({ conflict: true });
    const anchored = await ensureJobWorkflowStepAnchors(supabase as never, published, [
      jobApplicationDraft,
    ]);

    expect(inserted).toHaveLength(1);
    expect(anchored.steps.find((step) => step.step_key === "profile_information")?.id).toBe(
      "uuid-existing-profile"
    );
  });

  it("does not treat a preview id as a saved step", async () => {
    const { supabase, inserted } = supabaseMock();
    const previewPublished: TenantOnboardingConfig = {
      ...published,
      steps: [
        ...published.steps,
        {
          id: "preview-profile_information",
          step_key: "profile_information",
          title: "Job application",
          description: null,
          step_type: "profile_information",
          sort_order: 20,
          is_required: true,
          is_enabled: true,
          metadata: {},
        },
      ],
    };

    const anchored = await ensureJobWorkflowStepAnchors(supabase as never, previewPublished, [
      jobApplicationDraft,
    ]);

    expect(inserted).toHaveLength(1);
    expect(anchored.steps.some((step) => step.id === "preview-profile_information")).toBe(false);
    expect(anchored.steps.some((step) => step.id === "uuid-new-profile")).toBe(true);
  });
});

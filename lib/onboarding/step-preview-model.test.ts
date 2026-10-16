import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import {
  DEFAULT_STEP_SETTINGS,
  type WorkflowNodeData,
  type WorkflowState,
} from "@/app/components/workflow-builder/types";
import {
  buildStepPreviewModel,
  coercePreviewState,
  mapProfessionDocumentsToPreview,
  previewAudienceLabel,
  resolveStepPreviewKind,
  stepPreviewUsesProfessionDocuments,
} from "@/lib/onboarding/step-preview-model";
import type { TenantOnboardingStep } from "@/lib/onboarding/types";

function stepNode(
  id: string,
  stepId: string,
  overrides?: Partial<WorkflowNodeData>
): Node<WorkflowNodeData> {
  return {
    id,
    type: "step",
    position: { x: 0, y: 0 },
    data: {
      stepId,
      label: overrides?.label ?? stepId,
      description: overrides?.description ?? "Configured description",
      icon: null,
      day: 1,
      required: overrides?.required ?? true,
      settings: {
        ...DEFAULT_STEP_SETTINGS,
        ...overrides?.settings,
      },
      ...overrides,
    },
  };
}

function stateFor(nodes: Node<WorkflowNodeData>[]): WorkflowState {
  const edges = nodes.slice(0, -1).map((node, index) => ({
    id: `e-${node.id}-${nodes[index + 1]!.id}`,
    source: node.id,
    target: nodes[index + 1]!.id,
  }));
  return { nodes, edges };
}

function tenantStep(
  partial: Partial<TenantOnboardingStep> & Pick<TenantOnboardingStep, "step_key" | "step_type">
): TenantOnboardingStep {
  return {
    id: partial.id ?? `id-${partial.step_key}`,
    title: partial.title ?? partial.step_key,
    description: partial.description ?? null,
    sort_order: partial.sort_order ?? 10,
    is_required: partial.is_required ?? true,
    is_enabled: partial.is_enabled ?? true,
    metadata: partial.metadata ?? {},
    ...partial,
  };
}

describe("resolveStepPreviewKind", () => {
  it("maps library ids to the matching onboarding experience", () => {
    expect(
      resolveStepPreviewKind(
        tenantStep({ step_key: "resume_upload", step_type: "resume_upload" }),
        "resume-basic-profile"
      )
    ).toBe("resume_upload");
    expect(
      resolveStepPreviewKind(
        tenantStep({ step_key: "profile_information", step_type: "profile_information" }),
        "parameterized-job-application"
      )
    ).toBe("job_application");
    expect(
      resolveStepPreviewKind(
        tenantStep({ step_key: "custom_question", step_type: "custom_question" }),
        "offer-acceptance"
      )
    ).toBe("offer_acceptance");
    expect(
      resolveStepPreviewKind(
        tenantStep({ step_key: "custom_question", step_type: "custom_question" }),
        "manager-facility-approval"
      )
    ).toBe("approval");
    expect(
      resolveStepPreviewKind(
        tenantStep({
          step_key: "authorizations",
          step_type: "authorizations",
          title: "Independent Contractor Agreement",
        }),
        "employee-agreement"
      )
    ).toBe("agreement");
    expect(
      resolveStepPreviewKind(
        tenantStep({ step_key: "custom_question", step_type: "custom_question" }),
        "oig-exclusion-check"
      )
    ).toBe("screening");
  });
});

describe("previewAudienceLabel", () => {
  it("labels the preview from the completion owner", () => {
    expect(previewAudienceLabel("applicant", "resume-basic-profile", "resume_upload")).toBe(
      "Candidate Preview"
    );
    expect(previewAudienceLabel("Manager", "manager-facility-approval", "approval")).toBe(
      "Manager Preview"
    );
    expect(previewAudienceLabel("facility", "manager-facility-approval", "approval")).toBe(
      "Facility Preview"
    );
    expect(previewAudienceLabel("hr_admin", "hr-final-approval", "approval")).toBe("Admin Preview");
  });
});

describe("buildStepPreviewModel", () => {
  it("builds a live resume preview from the current canvas node", () => {
    const resume = stepNode("n1", "resume-basic-profile", {
      label: "Resume & Basic Profile",
      description: "Upload a resume and confirm contact details.",
      settings: { ...DEFAULT_STEP_SETTINGS, completionOwner: "applicant", isConditional: true },
    });
    const model = buildStepPreviewModel(stateFor([resume]), resume);
    expect(model?.kind).toBe("resume_upload");
    expect(model?.step.title).toBe("Resume & Basic Profile");
    expect(model?.step.description).toBe("Upload a resume and confirm contact details.");
    expect(model?.audienceLabel).toBe("Candidate Preview");
    expect(model?.isConditional).toBe(true);
    expect(model?.availableStates).toContain("filled");
  });

  it("updates title, required, and owner without saving", () => {
    const node = stepNode("n2", "offer-acceptance", {
      label: "Offer packet",
      required: false,
      settings: { ...DEFAULT_STEP_SETTINGS, completionOwner: "contractor", required: false },
    });
    const model = buildStepPreviewModel(stateFor([node]), node);
    expect(model?.kind).toBe("offer_acceptance");
    expect(model?.step.title).toBe("Offer packet");
    expect(model?.step.is_required).toBe(false);
    expect(model?.audienceLabel).toBe("Candidate Preview");
  });

  it("previews manager approval from the completion owner's perspective", () => {
    const node = stepNode("n3", "manager-facility-approval", {
      label: "Manager / Facility Approval",
      settings: { ...DEFAULT_STEP_SETTINGS, completionOwner: "facility" },
    });
    const model = buildStepPreviewModel(stateFor([node]), node);
    expect(model?.kind).toBe("approval");
    expect(model?.audienceLabel).toBe("Facility Preview");
    expect(model?.availableStates).toEqual([
      "default",
      "pending_approval",
      "approved",
      "rejected",
      "error",
    ]);
  });

  it("still returns context when a step has no dedicated applicant screen", () => {
    const node = stepNode("n4", "parallel-step-group", {
      label: "Parallel group",
      settings: { ...DEFAULT_STEP_SETTINGS, completionOwner: "hr_admin" },
    });
    const model = buildStepPreviewModel(stateFor([node]), node);
    expect(model?.kind === "waiting_gate" || model?.kind === "unsupported").toBe(true);
    expect(model?.step.title).toBe("Parallel group");
    expect(model?.settings.completionOwner).toBe("hr_admin");
  });

  it("splits Pre-Hire and Post-Hire steps into independent preview counts", () => {
    const pre = stepNode("n-pre", "resume-basic-profile", {
      label: "Resume",
      settings: { ...DEFAULT_STEP_SETTINGS, phase: "pre_hire", completionOwner: "applicant" },
    });
    const post = stepNode("n-post", "tax-forms", {
      label: "W-9",
      settings: { ...DEFAULT_STEP_SETTINGS, phase: "post_hire", completionOwner: "applicant" },
    });
    const model = buildStepPreviewModel(stateFor([pre, post]), pre);
    expect(model?.preHireSteps).toHaveLength(1);
    expect(model?.postHireSteps).toHaveLength(1);
    expect(model?.preHireProgressLabel).toBe("0 / 1 Pre-Hire");
    expect(model?.postHireProgressLabel).toBe("0 / 1 Post-Hire");
    expect(model?.preHireProgressLabel).not.toMatch(/\/ 2 /);
    expect(model?.postHireProgressLabel).not.toMatch(/\/ 2 /);
  });
});

describe("coercePreviewState", () => {
  it("falls back to the first available state", () => {
    expect(coercePreviewState("filled", ["default", "pending_approval"])).toBe("default");
    expect(coercePreviewState("approved", ["default", "approved"])).toBe("approved");
  });
});

describe("stepPreviewUsesProfessionDocuments", () => {
  it("matches credential and certification library steps", () => {
    expect(stepPreviewUsesProfessionDocuments("credential-license-verification", "professional_license")).toBe(
      true
    );
    expect(stepPreviewUsesProfessionDocuments("certification-upload", "professional_license")).toBe(true);
    expect(stepPreviewUsesProfessionDocuments("collect-extra-files", "document_upload")).toBe(true);
    expect(stepPreviewUsesProfessionDocuments("document-upload", "document_upload")).toBe(false);
  });
});

describe("mapProfessionDocumentsToPreview", () => {
  it("maps Settings profession docs like applicant attach", () => {
    expect(
      mapProfessionDocumentsToPreview([
        {
          id: "doc-cpr",
          name: "CPR",
          documentKind: "certificate",
          isRequired: false,
          hasExpiration: true,
          sortOrder: 20,
        },
        {
          id: "doc-license",
          name: "Nursing License",
          documentKind: "license",
          isRequired: true,
          hasExpiration: true,
          sortOrder: 10,
        },
      ])
    ).toEqual([
      { title: "Nursing License", description: "License", is_required: true },
      { title: "CPR", description: "Certificate", is_required: false },
    ]);
  });
});

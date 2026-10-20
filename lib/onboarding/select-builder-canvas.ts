import type { Edge, Node } from "@xyflow/react";
import type { StepCategory } from "@/app/components/workflow-builder";
import type { WorkflowNodeData } from "@/app/components/workflow-builder";
import { hydrateWorkflowFromStorage } from "@/lib/onboarding/drafts-to-workflow";
import type { TenantOnboardingConfig } from "@/lib/onboarding/types";
import {
  isSerializableWorkflowState,
  type SerializableWorkflowState,
} from "@/lib/onboarding/workflow-builder-serialization";
import {
  ensureNonEmptyBuilderCanvas,
  resolveBuilderStepDrafts,
} from "@/lib/onboarding/default-workflow";
import { buildWorkflowStepLookup } from "@/app/components/onboarding/workflow-step-library";
import { draftsToWorkflowNodes } from "@/lib/onboarding/drafts-to-workflow";

export type BuilderCanvasPayload = {
  config?: TenantOnboardingConfig | null;
  publishStatus?: "draft" | "published";
  builderDraft?: unknown;
};

export function builderDraftHasCanvas(
  builderDraft: unknown
): builderDraft is SerializableWorkflowState {
  return isSerializableWorkflowState(builderDraft) && builderDraft.nodes.length > 0;
}

/** Applicant-facing published steps → canvas (baseline workers currently see). */
export function hydratePublishedCanvas(
  payload: BuilderCanvasPayload,
  stepLibrary: StepCategory[],
  options?: { workerFacing?: boolean }
): { nodes: Node<WorkflowNodeData>[]; edges: Edge[]; fromDefaults: boolean } {
  const { drafts, fromDefaults } = resolveBuilderStepDrafts(payload.config, {
    workerFacing: options?.workerFacing ?? false,
  });
  const stepLookup = buildWorkflowStepLookup(stepLibrary);
  const canvas = hydrateWorkflowFromStorage(null, drafts, stepLookup, {
    includeDisabled: !options?.workerFacing,
  });
  return { ...canvas, fromDefaults };
}

/** Saved builder draft merged with published config metadata. */
export function hydrateDraftCanvas(
  payload: BuilderCanvasPayload,
  stepLibrary: StepCategory[],
  options?: { workerFacing?: boolean }
): { nodes: Node<WorkflowNodeData>[]; edges: Edge[]; fromDefaults: boolean } {
  const { drafts, fromDefaults } = resolveBuilderStepDrafts(payload.config, {
    workerFacing: options?.workerFacing ?? false,
  });
  const stepLookup = buildWorkflowStepLookup(stepLibrary);
  const draftForHydrate = builderDraftHasCanvas(payload.builderDraft)
    ? payload.builderDraft
    : null;
  const canvas = hydrateWorkflowFromStorage(draftForHydrate, drafts, stepLookup, {
    includeDisabled: !options?.workerFacing,
  });
  return { ...canvas, fromDefaults };
}

/**
 * Prefer the saved builder draft whenever a canvas exists so deletions persist
 * across refresh even when publish_status is still "published".
 * Fall back to published tenant steps only when no draft canvas is stored.
 * When no custom workflow exists, fall back to the platform default six steps.
 */
export function selectBuilderCanvas(
  payload: BuilderCanvasPayload,
  stepLibrary: StepCategory[],
  options?: { workerFacing?: boolean }
): {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  source: "draft" | "published" | "default";
} {
  const stepLookup = buildWorkflowStepLookup(stepLibrary);

  if (builderDraftHasCanvas(payload.builderDraft)) {
    const { drafts } = resolveBuilderStepDrafts(payload.config, {
      workerFacing: options?.workerFacing ?? false,
    });
    const canvas = hydrateWorkflowFromStorage(payload.builderDraft, drafts, stepLookup, {
      includeDisabled: !options?.workerFacing,
    });
    const ensured = ensureNonEmptyBuilderCanvas(canvas, stepLibrary);
    return {
      nodes: ensured.nodes,
      edges: ensured.edges,
      source: ensured.usedDefault ? "default" : "draft",
    };
  }

  const published = hydratePublishedCanvas(payload, stepLibrary, options);
  const ensured = ensureNonEmptyBuilderCanvas(
    { nodes: published.nodes, edges: published.edges },
    stepLibrary
  );
  return {
    nodes: ensured.nodes,
    edges: ensured.edges,
    source: ensured.usedDefault || published.fromDefaults ? "default" : "published",
  };
}

export function hydrateCanvasFromBuilderDraft(
  builderDraft: SerializableWorkflowState,
  stepLibrary: StepCategory[],
  options?: { allowEmpty?: boolean; enforceResumeFirst?: boolean }
): { nodes: Node<WorkflowNodeData>[]; edges: Edge[] } {
  if (options?.allowEmpty && builderDraft.nodes.length === 0) {
    return { nodes: [], edges: [] };
  }
  const stepLookup = buildWorkflowStepLookup(stepLibrary);
  const canvas = hydrateWorkflowFromStorage(builderDraft, [], stepLookup, {
    enforceResumeFirst: options?.enforceResumeFirst !== false,
  });
  if (options?.allowEmpty) return canvas;
  return ensureNonEmptyBuilderCanvas(canvas, stepLibrary);
}

export function hydrateCanvasFromFlowDraft(
  flowDraft: unknown,
  payload: BuilderCanvasPayload,
  stepLibrary: StepCategory[]
): {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  source: "flow" | "blank" | "tenant" | "default";
} {
  if (isSerializableWorkflowState(flowDraft) && flowDraft.nodes.length === 0) {
    return { nodes: [], edges: [], source: "blank" };
  }

  if (builderDraftHasCanvas(flowDraft)) {
    const stepLookup = buildWorkflowStepLookup(stepLibrary);
    const canvas = hydrateWorkflowFromStorage(flowDraft, [], stepLookup, {
      enforceResumeFirst: false,
    });
    return {
      nodes: canvas.nodes,
      edges: canvas.edges,
      source: "flow",
    };
  }

  const tenantCanvas = selectBuilderCanvas(payload, stepLibrary);
  return {
    nodes: tenantCanvas.nodes,
    edges: tenantCanvas.edges,
    source: tenantCanvas.source === "default" ? "default" : "tenant",
  };
}

export function hydrateCanvasFromDraftsOnly(
  resolved: ReturnType<typeof resolveBuilderStepDrafts>,
  stepLibrary: StepCategory[]
): { nodes: Node<WorkflowNodeData>[]; edges: Edge[] } {
  const stepLookup = buildWorkflowStepLookup(stepLibrary);
  const canvas = draftsToWorkflowNodes(resolved.drafts, stepLookup, { includeDisabled: true });
  return ensureNonEmptyBuilderCanvas(canvas, stepLibrary);
}

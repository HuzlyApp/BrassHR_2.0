import type { Edge, Node } from "@xyflow/react";
import { createWorkflowEdge } from "@/app/components/workflow-builder/constants";
import type { StepDefinition } from "@/app/components/workflow-builder/types";
import type { WorkflowNodeData } from "@/app/components/workflow-builder/types";
import {
  dayFromDatePriority,
  normalizeWorkflowNodeSettings,
  schedulingDayFromStepMetadata,
} from "@/lib/onboarding/normalize-workflow-settings";
import type { OnboardingStepDraft } from "@/lib/onboarding/default-onboarding-steps";
import {
  isSerializableWorkflowState,
  type SerializableWorkflowState,
} from "@/lib/onboarding/workflow-builder-serialization";
import { onboardingTypeToWorkflowStepId } from "@/lib/onboarding/workflow-step-mapping";
import {
  enforceUploadResumeFirstInDrafts,
  isUploadResumeStep,
  isUploadResumeWorkflowStepId,
} from "@/lib/onboarding/enforce-upload-resume-first";
import { enforceUploadResumeFirstInWorkflowState } from "@/lib/onboarding/normalize-builder-workflow";

const NODE_VERTICAL_SPACING = 130;
const CANVAS_X = 120;

function resolveStepDefinition(
  stepId: string,
  stepById: Map<string, StepDefinition>
): StepDefinition | null {
  return stepById.get(stepId) ?? stepById.get(onboardingTypeToWorkflowStepId("custom_question")) ?? null;
}

export function draftsToWorkflowNodes(
  drafts: OnboardingStepDraft[],
  stepById: Map<string, StepDefinition>,
  options?: { includeDisabled?: boolean }
): { nodes: Node<WorkflowNodeData>[]; edges: Edge[] } {
  const { steps: normalizedDrafts } = enforceUploadResumeFirstInDrafts(drafts);
  const visibleDrafts = (options?.includeDisabled === false
    ? normalizedDrafts.filter((s) => s.is_enabled)
    : normalizedDrafts
  ).sort((a, b) => a.sort_order - b.sort_order);

  const nodes: Node<WorkflowNodeData>[] = visibleDrafts.map((step, index) => {
    const workflowStepId =
      typeof step.metadata?.workflow_step_id === "string"
        ? step.metadata.workflow_step_id
        : onboardingTypeToWorkflowStepId(step.step_type);
    const def =
      resolveStepDefinition(workflowStepId, stepById) ??
      ({
        id: workflowStepId,
        label: step.title,
        icon: null,
      } as StepDefinition);

    const settings = normalizeWorkflowNodeSettings(
      step.metadata?.workflow_settings as WorkflowNodeData["settings"] | undefined,
      { required: step.is_required, day: schedulingDayFromStepMetadata(step.metadata ?? {}) }
    );
    const day = schedulingDayFromStepMetadata(step.metadata ?? {}) || index + 1;

    return {
      id: `step-${step.step_key}`,
      type: "step",
      position: { x: CANVAS_X, y: 40 + index * NODE_VERTICAL_SPACING },
      data: {
        stepId: def.id,
        label: step.title,
        description: step.description,
        icon: def.icon,
        day,
        required: step.is_required,
        settings,
        lockedFirstStep: isUploadResumeStep(step),
      },
    };
  });

  const edges: Edge[] = nodes
    .slice(0, -1)
    .map((node, i) => createWorkflowEdge(node.id, nodes[i + 1].id));

  return { nodes, edges };
}

export function hydrateWorkflowFromStorage(
  builderDraft: unknown,
  drafts: OnboardingStepDraft[],
  stepById: Map<string, StepDefinition>,
  options?: { includeDisabled?: boolean; enforceResumeFirst?: boolean }
): { nodes: Node<WorkflowNodeData>[]; edges: Edge[] } {
  if (isSerializableWorkflowState(builderDraft) && builderDraft.nodes.length > 0) {
    const enforced =
      options?.enforceResumeFirst === false
        ? builderDraft
        : enforceUploadResumeFirstInWorkflowState(builderDraft, drafts);
    const nodes: Node<WorkflowNodeData>[] = enforced.nodes.map((n) => {
      const def = resolveStepDefinition(n.stepId, stepById);
      const settings = normalizeWorkflowNodeSettings(n.settings, {
        required: n.required,
        day: n.day,
      });
      const day = n.day ?? dayFromDatePriority(settings.datePriority);
      return {
        id: n.id,
        type: "step",
        position: n.position,
        data: {
          stepId: n.stepId,
          label: n.label,
          description: n.description ?? null,
          icon: def?.icon ?? null,
          day,
          required: settings.required,
          settings,
          lockedFirstStep: isUploadResumeWorkflowStepId(n.stepId),
        },
      };
    });

    const edges: Edge[] = enforced.edges.map((e) => ({
      ...createWorkflowEdge(e.source, e.target),
      id: e.id,
    }));

    return { nodes, edges };
  }

  return draftsToWorkflowNodes(drafts, stepById, options);
}

export type BuilderMeta = {
  flowName: string;
  publishStatus: "draft" | "published";
  builderDraft: SerializableWorkflowState | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

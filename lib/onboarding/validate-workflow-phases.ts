import type { SerializableWorkflowState } from "@/lib/onboarding/workflow-builder-serialization";
import { hasExplicitWorkflowPhase } from "@/lib/onboarding/workflow-phase-groups";
import {
  lifecyclePhaseFromTemplatePhase,
  parseWorkflowTemplatePhase,
  type ApplicantLifecyclePhase,
  type WorkflowTemplatePhase,
} from "@/lib/onboarding/workflow-phase";
import {
  ALIEN_STAGE_WARNING,
  isAlienWorkflowStep,
} from "@/lib/onboarding/validate-workflow-step-stages";

export type WorkflowPhaseValidationError = {
  code:
    | "MISSING_PRE_HIRE"
    | "MISSING_PHASE"
    | "PHASE_ORDER"
    | "EMPTY_WORKFLOW"
    | "ALIEN_STAGE";
  message: string;
  nodeId?: string;
};

type OrderedNode = {
  id: string;
  label: string;
  y: number;
  templatePhase: WorkflowTemplatePhase;
  lifecyclePhase: Exclude<ApplicantLifecyclePhase, "completed">;
};

function orderedStepNodes(draft: SerializableWorkflowState): OrderedNode[] {
  return draft.nodes.map((node, index) => {
    const templatePhase = parseWorkflowTemplatePhase(node.settings?.phase);
    return {
      id: node.id,
      label: String(node.label ?? `Step ${index + 1}`),
      y: Number(node.position?.y ?? index * 100),
      templatePhase,
      lifecyclePhase: lifecyclePhaseFromTemplatePhase(templatePhase),
    };
  }).sort((a, b) => a.y - b.y || a.label.localeCompare(b.label));
}

export function validateWorkflowPhaseLayout(
  draft: SerializableWorkflowState
): WorkflowPhaseValidationError[] {
  const nodes = orderedStepNodes(draft);
  if (!nodes.length) {
    return [
      {
        code: "EMPTY_WORKFLOW",
        message: "Cannot publish an empty workflow. Add at least one step.",
      },
    ];
  }

  const errors: WorkflowPhaseValidationError[] = [];
  const missingPhase = draft.nodes.filter((node) => !hasExplicitWorkflowPhase(node.settings?.phase));
  if (missingPhase.length) {
    errors.push({
      code: "MISSING_PHASE",
      message:
        "Every workflow step must have an explicit Pre-Hire or Post-Hire phase before publishing.",
    });
  }
  const preHireCount = nodes.filter((node) => node.lifecyclePhase === "pre_hire").length;
  if (preHireCount < 1) {
    errors.push({
      code: "MISSING_PRE_HIRE",
      message: "A staffing workflow must include at least one Pre-Hire step.",
    });
  }

  let seenPostHire = false;
  for (const node of nodes) {
    if (node.lifecyclePhase === "post_hire") {
      seenPostHire = true;
      continue;
    }
    if (seenPostHire && node.lifecyclePhase === "pre_hire") {
      errors.push({
        code: "PHASE_ORDER",
        message:
          "Pre-Hire steps must come before Post-Hire steps. Move Post-Hire onboarding below the placement gate.",
      });
      break;
    }
  }

  for (const node of draft.nodes) {
    const stageName =
      typeof (node.settings as { stageName?: unknown } | undefined)?.stageName === "string"
        ? (node.settings as { stageName?: string }).stageName
        : undefined;
    if (
      isAlienWorkflowStep({
        stepId: node.stepId,
        phase: node.settings?.phase,
        stageName,
      })
    ) {
      errors.push({
        code: "ALIEN_STAGE",
        message: `${node.label}: ${ALIEN_STAGE_WARNING}`,
        nodeId: node.id,
      });
    }
  }

  return errors;
}

export function assertWorkflowPhasesPublishable(draft: SerializableWorkflowState): void {
  const errors = validateWorkflowPhaseLayout(draft);
  if (errors.length) {
    throw new Error(errors[0]!.message);
  }
}

import type { Edge, Node } from "@xyflow/react";

import { createWorkflowEdge, NODE_VERTICAL_SPACING } from "./constants";
import { normalizeWorkflowNodeSettings } from "@/lib/onboarding/normalize-workflow-settings";
import { resolveCompletionOwner } from "@/lib/onboarding/workflow-settings";
import type {
  StepDefinition,
  WorkflowCanvasNodeData,
  WorkflowInsertionPoint,
  WorkflowNodeData,
} from "./types";
import { isDropZoneNode, isStepNode } from "./types";
import {
  buildDropZoneNode,
  createDropZoneId,
  dropZonePositionBelow,
  onlyStepNodes,
} from "./workflow-canvas-utils";

const EMPTY_CANVAS_POSITION = { x: 120, y: 40 };

export function createWorkflowNodeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `node-${crypto.randomUUID()}`;
  }
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function insertionPointKey(point: WorkflowInsertionPoint): string {
  return `${point.previousNodeId ?? "start"}->${point.nextNodeId ?? "end"}`;
}

export function buildStepNode(
  id: string,
  def: StepDefinition,
  position: { x: number; y: number },
  day: number
): Node<WorkflowNodeData> {
  const settings = normalizeWorkflowNodeSettings(
    {
      ...(def.defaultPhase ? { phase: def.defaultPhase } : {}),
      completionOwner: resolveCompletionOwner(undefined, def.id),
    },
    { required: true, day }
  );

  return {
    id,
    type: "step",
    position,
    data: {
      stepId: def.id,
      label: def.label,
      description: def.description ?? null,
      icon: def.icon,
      day,
      required: true,
      settings,
    },
  };
}

export type InsertWorkflowStepInput = {
  nodes: Node<WorkflowCanvasNodeData>[];
  edges: Edge[];
  stepDefinition: StepDefinition;
  insertionPoint: WorkflowInsertionPoint;
  createNodeId?: () => string;
  createDropId?: () => string;
};

export type InsertWorkflowStepResult = {
  nodes: Node<WorkflowCanvasNodeData>[];
  edges: Edge[];
  newNodeId: string;
};

function dayAfterSource(
  nodes: Node<WorkflowCanvasNodeData>[],
  sourceId: string | null
): number {
  if (sourceId) {
    const source = nodes.find((n) => n.id === sourceId);
    if (source && isStepNode(source)) return source.data.day + 1;
  }
  const steps = onlyStepNodes(nodes) as Node<WorkflowNodeData>[];
  if (!steps.length) return 1;
  return Math.max(...steps.map((n) => n.data.day)) + 1;
}

/**
 * Insert a library step at an explicit location.
 * Never infers the new step from the selected or neighboring canvas node.
 */
export function insertWorkflowStep({
  nodes,
  edges,
  stepDefinition,
  insertionPoint,
  createNodeId = createWorkflowNodeId,
  createDropId = createDropZoneId,
}: InsertWorkflowStepInput): InsertWorkflowStepResult {
  const previous = insertionPoint.previousNodeId
    ? nodes.find((n) => n.id === insertionPoint.previousNodeId) ?? null
    : null;
  const next = insertionPoint.nextNodeId
    ? nodes.find((n) => n.id === insertionPoint.nextNodeId) ?? null
    : null;

  const previousStep = previous && isStepNode(previous) ? previous : null;
  const nextStep = next && isStepNode(next) ? next : null;
  const nextDropZone = next && isDropZoneNode(next) ? next : null;

  const newNodeId = createNodeId();
  const day = dayAfterSource(nodes, previousStep?.id ?? null);

  let nextNodes = [...nodes];
  let nextEdges = [...edges];
  let position = EMPTY_CANVAS_POSITION;

  if (nextDropZone) {
    position = { ...nextDropZone.position };
    nextNodes = nextNodes.filter((n) => n.id !== nextDropZone.id);
    nextEdges = nextEdges.filter(
      (e) => e.source !== nextDropZone.id && e.target !== nextDropZone.id
    );
  } else if (nextStep) {
    const insertY = nextStep.position.y;
    nextNodes = nextNodes.map((n) => {
      if (n.position.y >= insertY) {
        return {
          ...n,
          position: { ...n.position, y: n.position.y + NODE_VERTICAL_SPACING },
        };
      }
      return n;
    });
    position = {
      x: previousStep?.position.x ?? nextStep.position.x,
      y: insertY,
    };
    if (previousStep) {
      nextEdges = nextEdges.filter(
        (e) => !(e.source === previousStep.id && e.target === nextStep.id)
      );
    }
  } else if (previousStep) {
    position = {
      x: previousStep.position.x,
      y: previousStep.position.y + NODE_VERTICAL_SPACING,
    };
    const danglingDropIds = nextEdges
      .filter((e) => e.source === previousStep.id)
      .map((e) => nextNodes.find((n) => n.id === e.target))
      .filter((n): n is Node<WorkflowCanvasNodeData> => Boolean(n && isDropZoneNode(n)))
      .map((n) => n.id);
    if (danglingDropIds.length) {
      nextNodes = nextNodes.filter((n) => !danglingDropIds.includes(n.id));
      nextEdges = nextEdges.filter(
        (e) => !danglingDropIds.includes(e.source) && !danglingDropIds.includes(e.target)
      );
    }
  }

  const stepNode = buildStepNode(newNodeId, stepDefinition, position, day);
  const extraNodes: Node<WorkflowCanvasNodeData>[] = [stepNode];
  const extraEdges: Edge[] = [];

  if (previousStep) {
    extraEdges.push(createWorkflowEdge(previousStep.id, newNodeId));
  }

  if (nextStep) {
    extraEdges.push(createWorkflowEdge(newNodeId, nextStep.id));
  } else {
    const dropId = createDropId();
    extraNodes.push(buildDropZoneNode(dropId, dropZonePositionBelow(stepNode)));
    extraEdges.push(createWorkflowEdge(newNodeId, dropId));
  }

  return {
    nodes: [...nextNodes, ...extraNodes],
    edges: [...nextEdges, ...extraEdges],
    newNodeId,
  };
}

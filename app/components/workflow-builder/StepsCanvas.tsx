"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  PanOnScrollMode,
  ReactFlow,
  addEdge,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type OnConnect,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";
import "./workflow-builder-canvas.css";

import AddStepPicker from "./AddStepPicker";
import type { ConnectorMenuAction } from "./ConnectorActionMenu";
import WorkflowConnectorEdge from "./edges/WorkflowConnectorEdge";
import DropZoneNode from "./nodes/DropZoneNode";
import StepNode from "./nodes/StepNode";
import {
  WORKFLOW_CONNECTOR_COLOR,
  WORKFLOW_CONNECTOR_STROKE_WIDTH,
  WORKFLOW_EDGE_TYPE,
  createWorkflowEdge,
  GOLD,
  TEXT_MUTED,
} from "./constants";
import type {
  StepCategory,
  StepDefinition,
  WorkflowInsertionPoint,
} from "./types";
import { CUSTOM_STEP_ID } from "./library-category-theme";
import {
  collectUsedLibrarySteps,
  excludeStepsOutsideStageSlot,
  excludeUsedLibrarySteps,
} from "./filter-step-library";
import {
  ALIEN_STAGE_WARNING,
  alienStageWarningForStep,
  catalogStageBeside,
  enclosingCatalogStage,
  foreignStagePlacements,
  stepFitsEnclosingStage,
  type OrderedWorkflowStageStep,
} from "@/lib/onboarding/validate-workflow-step-stages";
import {
  isDropZoneNode,
  isStepNode,
  type WorkflowCanvasNodeData,
} from "./types";
import {
  insertionPointKey,
  insertWorkflowStep,
} from "./insert-workflow-step";
import {
  buildDropZoneNode,
  countDropZoneChildren,
  createDropZoneId,
  findInsertionPointAtPosition,
  onlyStepNodes,
  parallelDropPositions,
} from "./workflow-canvas-utils";
import {
  isUploadResumeWorkflowStepId,
} from "@/lib/onboarding/enforce-upload-resume-first";
import {
  isWorkflowStepDrag,
  readWorkflowStepDragPayload,
} from "./workflow-step-drag";

type StepsCanvasProps = {
  nodes: Node<WorkflowCanvasNodeData>[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node<WorkflowCanvasNodeData>[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  onNodesChange: (changes: NodeChange<Node<WorkflowCanvasNodeData>>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  categories: StepCategory[];
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onBeforeChange?: () => void;
  readOnly?: boolean;
  canPasteWorkflow?: boolean;
  pastingWorkflow?: boolean;
  onPasteWorkflow?: () => void;
  /** Tablet/mobile layout (narrow viewport). */
  compactMode?: boolean;
  /** Touch screen (phone, iPad, etc.) — enables finger panning. */
  touchPan?: boolean;
};

const COMPACT_FIT_VIEW = {
  padding: 0.75,
  minZoom: 0.08,
  maxZoom: 0.9,
} as const;

function MobileCanvasFitView({
  enabled,
  stepCount,
}: {
  enabled: boolean;
  stepCount: number;
}) {
  const { fitView } = useReactFlow();
  const lastFitKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || stepCount === 0) return;

    const fitKey = `${enabled}:${stepCount}`;
    if (lastFitKeyRef.current === fitKey) return;
    lastFitKeyRef.current = fitKey;

    const frame = requestAnimationFrame(() => {
      void fitView({ ...COMPACT_FIT_VIEW, duration: 0 });
    });

    return () => cancelAnimationFrame(frame);
  }, [enabled, stepCount, fitView]);

  return null;
}

const TOUCH_PAN_THRESHOLD = 6;

function isInteractiveTouchTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(
    "button, a, input, textarea, select, [contenteditable='true'], .nodrag, .nopan, .react-flow__controls"
  );
}

function MobileTouchPan({
  containerRef,
  enabled,
  onTapSelect,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  onTapSelect?: (nodeId: string | null) => void;
}) {
  const { getViewport, setViewport, screenToFlowPosition, getNodes } = useReactFlow();

  useEffect(() => {
    const root = containerRef.current;
    if (!enabled || !root) return;

    let activeTouch: { x: number; y: number; id: number } | null = null;
    let moved = false;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        activeTouch = null;
        return;
      }
      if (isInteractiveTouchTarget(event.target)) return;

      const touch = event.touches[0];
      activeTouch = { x: touch.clientX, y: touch.clientY, id: touch.identifier };
      moved = false;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!activeTouch || event.touches.length !== 1) return;

      const touch = Array.from(event.touches).find((t) => t.identifier === activeTouch?.id);
      if (!touch) return;

      const dx = touch.clientX - activeTouch.x;
      const dy = touch.clientY - activeTouch.y;

      if (!moved && Math.hypot(dx, dy) < TOUCH_PAN_THRESHOLD) return;

      moved = true;
      event.preventDefault();
      event.stopPropagation();

      const viewport = getViewport();
      setViewport({
        x: viewport.x + dx,
        y: viewport.y + dy,
        zoom: viewport.zoom,
      });

      activeTouch = { x: touch.clientX, y: touch.clientY, id: touch.identifier };
    };

    const finishTouch = (event: TouchEvent) => {
      if (!activeTouch) return;

      if (!moved && onTapSelect) {
        const touch = Array.from(event.changedTouches).find(
          (t) => t.identifier === activeTouch?.id
        );
        if (touch && !isInteractiveTouchTarget(event.target)) {
          const flowPoint = screenToFlowPosition({
            x: touch.clientX,
            y: touch.clientY,
          });
          const hit = getNodes().find((node) => {
            if (node.type !== "step") return false;
            const width = node.measured?.width ?? node.width ?? 232;
            const height = node.measured?.height ?? node.height ?? 70;
            return (
              flowPoint.x >= node.position.x &&
              flowPoint.x <= node.position.x + width &&
              flowPoint.y >= node.position.y &&
              flowPoint.y <= node.position.y + height
            );
          });
          onTapSelect(hit?.id ?? null);
        }
      }

      activeTouch = null;
      moved = false;
    };

    root.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    root.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    root.addEventListener("touchend", finishTouch, { capture: true, passive: true });
    root.addEventListener("touchcancel", finishTouch, { capture: true, passive: true });

    return () => {
      root.removeEventListener("touchstart", onTouchStart, { capture: true });
      root.removeEventListener("touchmove", onTouchMove, { capture: true });
      root.removeEventListener("touchend", finishTouch, { capture: true });
      root.removeEventListener("touchcancel", finishTouch, { capture: true });
    };
  }, [containerRef, enabled, getViewport, setViewport, screenToFlowPosition, getNodes, onTapSelect]);

  return null;
}

const nodeTypes = { step: StepNode, dropZone: DropZoneNode };
const edgeTypes = { [WORKFLOW_EDGE_TYPE]: WorkflowConnectorEdge };

const EMPTY_INSERTION: WorkflowInsertionPoint = {
  previousNodeId: null,
  nextNodeId: null,
};

export default function StepsCanvas({
  nodes,
  edges,
  setNodes,
  setEdges,
  onNodesChange,
  onEdgesChange,
  categories,
  selectedNodeId,
  onSelectNode,
  onBeforeChange,
  readOnly = false,
  canPasteWorkflow = false,
  pastingWorkflow = false,
  onPasteWorkflow,
  compactMode = false,
  touchPan = false,
}: StepsCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const useTouchCanvas = compactMode || touchPan;
  const { screenToFlowPosition } = useReactFlow<
    Node<WorkflowCanvasNodeData>,
    Edge
  >();
  const dragHistoryRecorded = useRef(false);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const insertInFlight = useRef(false);
  const pendingInsertionRef = useRef<WorkflowInsertionPoint | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSlotStage, setPickerSlotStage] = useState<string | null>(null);
  const [rejectedStageWarning, setRejectedStageWarning] = useState<string | null>(null);
  const [libraryDragActive, setLibraryDragActive] = useState(false);
  const [hoveredInsertion, setHoveredInsertion] = useState<WorkflowInsertionPoint | null>(null);
  const hoveredInsertionRef = useRef<WorkflowInsertionPoint | null>(null);

  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [nodes, edges]);

  const stepById = useMemo(() => {
    const map = new Map<string, StepDefinition>();
    categories.forEach((c) => c.steps.forEach((s) => map.set(s.id, s)));
    return map;
  }, [categories]);

  const pickerCategories = useMemo(
    () => excludeStepsOutsideStageSlot(categories, pickerSlotStage),
    [categories, pickerSlotStage]
  );

  const closePicker = useCallback(() => {
    pendingInsertionRef.current = null;
    setPickerOpen(false);
  }, []);

  const stageSteps = useCallback((source: Node<WorkflowCanvasNodeData>[]): OrderedWorkflowStageStep[] => {
    return source.filter(isStepNode).map((node) => ({
      id: node.id,
      stepId: node.data.stepId,
      phase: node.data.settings.phase,
      y: node.position.y,
    }));
  }, []);

  const slotStageFor = useCallback(
    (
      sourceNodes: Node<WorkflowCanvasNodeData>[],
      sourceEdges: Edge[],
      insertion: WorkflowInsertionPoint
    ) => {
      const steps = stageSteps(sourceNodes);
      const plainEdges = sourceEdges.map((edge) => ({
        source: edge.source,
        target: edge.target,
      }));
      return enclosingCatalogStage(
        catalogStageBeside(steps, plainEdges, insertion.previousNodeId, "in"),
        catalogStageBeside(steps, plainEdges, insertion.nextNodeId, "out")
      );
    },
    [stageSteps]
  );

  const openPickerAt = useCallback(
    (insertion: WorkflowInsertionPoint) => {
      if (readOnly) return;
      pendingInsertionRef.current = insertion;
      setPickerSlotStage(slotStageFor(nodesRef.current, edgesRef.current, insertion));
      setPickerOpen(true);
    },
    [readOnly, slotStageFor]
  );

  const commitInsert = useCallback(
    (def: StepDefinition, insertion: WorkflowInsertionPoint) => {
      if (readOnly || insertInFlight.current) return;
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      const slotStage = slotStageFor(currentNodes, currentEdges, insertion);
      if (
        !stepFitsEnclosingStage({
          stepId: def.id,
          phase: def.defaultPhase,
          previousStage: slotStage,
          nextStage: slotStage,
        })
      ) {
        setRejectedStageWarning(ALIEN_STAGE_WARNING);
        closePicker();
        return;
      }

      // Catalog steps may only appear once; Custom Step can be reused.
      if (def.id !== CUSTOM_STEP_ID) {
        const used = collectUsedLibrarySteps(currentNodes);
        const stillAvailable = excludeUsedLibrarySteps(
          [{ id: "_", label: "_", steps: [def] }],
          used.stepIds,
          { usedLabels: used.labels }
        );
        if (stillAvailable.length === 0) return;
      }

      insertInFlight.current = true;
      onBeforeChange?.();
      const result = insertWorkflowStep({
        nodes: currentNodes,
        edges: currentEdges,
        stepDefinition: def,
        insertionPoint: insertion,
      });
      nodesRef.current = result.nodes;
      edgesRef.current = result.edges;
      setNodes(result.nodes);
      setEdges(result.edges);
      onSelectNode(result.newNodeId);
      setRejectedStageWarning(null);
      closePicker();
      queueMicrotask(() => {
        insertInFlight.current = false;
      });
    },
    [closePicker, onBeforeChange, onSelectNode, readOnly, setEdges, setNodes, slotStageFor]
  );

  const handlePickerSelect = useCallback(
    (def: StepDefinition) => {
      const insertion = pendingInsertionRef.current;
      if (!insertion) return;
      commitInsert(def, insertion);
    },
    [commitInsert]
  );

  useEffect(() => {
    const onDragEnd = () => {
      setLibraryDragActive(false);
      hoveredInsertionRef.current = null;
      setHoveredInsertion(null);
    };
    window.addEventListener("dragend", onDragEnd);
    return () => window.removeEventListener("dragend", onDragEnd);
  }, []);

  const handleDeleteNode = useCallback(
    (id: string) => {
      if (readOnly) return;
      const target = nodes.find((n) => n.id === id);
      if (!target || isDropZoneNode(target)) return;
      if (
        isStepNode(target) &&
        (target.data.lockedFirstStep === true || isUploadResumeWorkflowStepId(target.data.stepId))
      ) {
        return;
      }

      onBeforeChange?.();

      const dropChildren = edges
        .filter((e) => e.source === id)
        .map((e) => nodes.find((n) => n.id === e.target))
        .filter((n) => n && isDropZoneNode(n))
        .map((n) => n!.id);

      setNodes((prev) =>
        prev.filter((n) => n.id !== id && !dropChildren.includes(n.id))
      );

      setEdges((edgePrev) => {
        const incoming = edgePrev.filter((e) => e.target === id);
        const outgoing = edgePrev.filter((e) => e.source === id);
        const cleaned = edgePrev.filter(
          (e) =>
            e.source !== id &&
            e.target !== id &&
            !dropChildren.includes(e.source) &&
            !dropChildren.includes(e.target)
        );

        const bridges: Edge[] = [];
        for (const inn of incoming) {
          for (const out of outgoing) {
            const outTarget = nodes.find((n) => n.id === out.target);
            if (outTarget && isDropZoneNode(outTarget)) continue;
            const exists = cleaned.some(
              (e) => e.source === inn.source && e.target === out.target
            );
            if (!exists && inn.source !== out.target) {
              bridges.push(createWorkflowEdge(inn.source, out.target));
            }
          }
        }
        return [...cleaned, ...bridges];
      });

      if (selectedNodeId === id) onSelectNode(null);
    },
    [nodes, edges, setNodes, setEdges, selectedNodeId, onSelectNode, onBeforeChange, readOnly]
  );

  const handleAddStepAtEdge = useCallback(
    (_edgeId: string, sourceId: string, targetId: string) => {
      openPickerAt({
        previousNodeId: sourceId,
        nextNodeId: targetId,
      });
    },
    [openPickerAt]
  );

  const handleAddParallelFlow = useCallback(
    (edgeId: string) => {
      const edge = edges.find((e) => e.id === edgeId);
      if (!edge) return;

      const target = nodes.find((n) => n.id === edge.target);
      if (!target || !isDropZoneNode(target)) return;

      if (countDropZoneChildren(edge.source, nodes, edges) > 1) return;

      onBeforeChange?.();

      const [leftPos, rightPos] = parallelDropPositions(target.position);
      const leftId = createDropZoneId();
      const rightId = createDropZoneId();

      setNodes((prev) => [
        ...prev.filter((n) => n.id !== target.id),
        buildDropZoneNode(leftId, leftPos),
        buildDropZoneNode(rightId, rightPos),
      ]);

      setEdges((prev) => [
        ...prev.filter((e) => e.id !== edgeId),
        createWorkflowEdge(edge.source, leftId),
        createWorkflowEdge(edge.source, rightId),
      ]);
    },
    [nodes, edges, setNodes, setEdges, onBeforeChange]
  );

  const handleRemoveConnector = useCallback(
    (edgeId: string) => {
      const edge = edges.find((e) => e.id === edgeId);
      if (!edge) return;

      const target = nodes.find((n) => n.id === edge.target);

      onBeforeChange?.();

      setEdges((prev) => prev.filter((e) => e.id !== edgeId));

      if (target && isDropZoneNode(target)) {
        setNodes((prev) => prev.filter((n) => n.id !== target.id));
      }
    },
    [edges, nodes, setEdges, setNodes, onBeforeChange]
  );

  const handleAddTitle = useCallback(
    (edgeId: string) => {
      const current = edges.find((e) => e.id === edgeId);
      const existing =
        typeof current?.data === "object" && current.data
          ? (current.data as { title?: string }).title
          : "";
      const title = window.prompt("Connector title", existing ?? "");
      if (title === null) return;

      onBeforeChange?.();

      setEdges((prev) =>
        prev.map((e) =>
          e.id === edgeId
            ? {
                ...e,
                data: {
                  ...(typeof e.data === "object" ? e.data : {}),
                  title: title.trim() || undefined,
                },
              }
            : e
        )
      );
    },
    [edges, setEdges, onBeforeChange]
  );

  const handleConnectorAction = useCallback(
    (
      edgeId: string,
      action: ConnectorMenuAction,
      sourceId: string,
      targetId: string
    ) => {
      switch (action) {
        case "addParallelFlow":
          handleAddParallelFlow(edgeId);
          break;
        case "addStep":
          handleAddStepAtEdge(edgeId, sourceId, targetId);
          break;
        case "removeConnector":
          handleRemoveConnector(edgeId);
          break;
        case "addTitle":
          handleAddTitle(edgeId);
          break;
        default:
          break;
      }
    },
    [
      handleAddParallelFlow,
      handleAddStepAtEdge,
      handleRemoveConnector,
      handleAddTitle,
    ]
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const target = nodes.find((n) => n.id === connection.target);
      if (target && isDropZoneNode(target)) return;
      onBeforeChange?.();
      setEdges((eds) =>
        addEdge(createWorkflowEdge(connection.source!, connection.target!), eds)
      );
    },
    [setEdges, nodes, onBeforeChange]
  );

  const onDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!isWorkflowStepDrag(e.dataTransfer)) return;
      e.dataTransfer.dropEffect = "copy";
      setLibraryDragActive(true);
      const flowPosition = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const hit = findInsertionPointAtPosition(
        nodesRef.current,
        edgesRef.current,
        flowPosition
      );
      hoveredInsertionRef.current = hit;
      setHoveredInsertion(hit);
    },
    [screenToFlowPosition]
  );

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const next = e.relatedTarget;
    if (next instanceof Node && e.currentTarget.contains(next)) return;
    setLibraryDragActive(false);
    hoveredInsertionRef.current = null;
    setHoveredInsertion(null);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setLibraryDragActive(false);
      const payload = readWorkflowStepDragPayload(e.dataTransfer);
      const insertion =
        hoveredInsertionRef.current ??
        findInsertionPointAtPosition(
          nodesRef.current,
          edgesRef.current,
          screenToFlowPosition({ x: e.clientX, y: e.clientY })
        );
      hoveredInsertionRef.current = null;
      setHoveredInsertion(null);
      if (!payload) return;

      const def = stepById.get(payload.stepDefinitionId);
      if (!def || !insertion) return;
      commitInsert(def, insertion);
    },
    [commitInsert, screenToFlowPosition, stepById]
  );

  const handleNodeDragStart = useCallback(() => {
    if (dragHistoryRecorded.current) return;
    onBeforeChange?.();
    dragHistoryRecorded.current = true;
  }, [onBeforeChange]);

  const handleNodeDragStop = useCallback(() => {
    dragHistoryRecorded.current = false;
  }, []);

  const handleNodeClick: NodeMouseHandler<Node<WorkflowCanvasNodeData>> =
    useCallback(
      (_e, node) => {
        if (isDropZoneNode(node)) {
          const incoming = edgesRef.current.find((e) => e.target === node.id);
          openPickerAt({
            previousNodeId: incoming?.source ?? null,
            nextNodeId: node.id,
          });
          return;
        }
        onSelectNode(node.id);
      },
      [onSelectNode, openPickerAt]
    );

  const handlePaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  const enhancedNodes = useMemo(
    () => {
      const stepNodes = nodes.filter(isStepNode).slice().sort((a, b) => a.position.y - b.position.y);
      const firstPreHireId = stepNodes.find((n) => n.data.settings.phase !== "post_hire")?.id ?? null;
      const firstPostHireId = stepNodes.find((n) => n.data.settings.phase === "post_hire")?.id ?? null;
      const foreignStepIds = new Set(
        foreignStagePlacements(
          stepNodes.map((node) => ({
            id: node.id,
            stepId: node.data.stepId,
            phase: node.data.settings.phase,
            y: node.position.y,
          })),
          edges.map((edge) => ({ source: edge.source, target: edge.target }))
        ).map((placement) => placement.id)
      );

      return nodes.map((n): Node<WorkflowCanvasNodeData> => {
        if (isDropZoneNode(n)) {
          const incoming = edges.find((e) => e.target === n.id);
          const insertionKey = `${incoming?.source ?? "start"}->${n.id}`;
          const hoveredKey = hoveredInsertion
            ? insertionPointKey(hoveredInsertion)
            : null;
          return {
            ...n,
            selected: false,
            draggable: false,
            data: {
              ...n.data,
              libraryDragActive,
              highlighted: libraryDragActive && hoveredKey === insertionKey,
            },
          };
        }
        if (!isStepNode(n)) return n;

        const phaseBanner =
          n.id === firstPostHireId
            ? "placement_gate"
            : n.id === firstPreHireId
              ? "pre_hire"
              : null;
        const stageName =
          typeof (n.data.settings as { stageName?: unknown }).stageName === "string"
            ? (n.data.settings as { stageName?: string }).stageName
            : undefined;
        return {
          ...n,
          selected: n.id === selectedNodeId,
          data: {
            ...n.data,
            phaseBanner,
            alienStageWarning:
              alienStageWarningForStep({
                stepId: n.data.stepId,
                phase: n.data.settings.phase,
                stageName,
              }) ?? (foreignStepIds.has(n.id) ? ALIEN_STAGE_WARNING : null),
            onDelete:
              readOnly ||
              n.data.lockedFirstStep === true ||
              isUploadResumeWorkflowStepId(n.data.stepId)
                ? undefined
                : handleDeleteNode,
          },
        };
      });
    },
    [nodes, edges, selectedNodeId, handleDeleteNode, readOnly, libraryDragActive, hoveredInsertion]
  );

  const enhancedEdges = useMemo(
    () => {
      const hoveredKey = hoveredInsertion
        ? insertionPointKey(hoveredInsertion)
        : null;
      return edges.map((e) => {
        const targetNode = nodes.find((n) => n.id === e.target);
        const targetIsDropZone = targetNode ? isDropZoneNode(targetNode) : false;
        const showParallelFlow =
          targetIsDropZone &&
          countDropZoneChildren(e.source, nodes, edges) === 1;
        const edgeInsertionKey = `${e.source}->${e.target}`;

        return {
          ...e,
          type: WORKFLOW_EDGE_TYPE,
          style: {
            stroke: WORKFLOW_CONNECTOR_COLOR,
            strokeWidth: WORKFLOW_CONNECTOR_STROKE_WIDTH,
          },
          data: {
            ...(typeof e.data === "object" ? e.data : {}),
            targetIsDropZone,
            showParallelFlow: readOnly ? false : showParallelFlow,
            libraryDragActive,
            dropHighlighted: libraryDragActive && hoveredKey === edgeInsertionKey,
            onAddStep: readOnly ? undefined : handleAddStepAtEdge,
            onConnectorAction: readOnly ? undefined : handleConnectorAction,
          },
        };
      });
    },
    [
      edges,
      nodes,
      handleAddStepAtEdge,
      handleConnectorAction,
      readOnly,
      libraryDragActive,
      hoveredInsertion,
    ]
  );

  const handleTouchTapSelect = useCallback(
    (nodeId: string | null) => {
      onSelectNode(nodeId);
    },
    [onSelectNode]
  );

  const stepNodes = onlyStepNodes(nodes);
  const hasStepNodes = stepNodes.length > 0;
  const fitViewOptions = compactMode ? COMPACT_FIT_VIEW : { padding: 0.3 };

  return (
    <div
      ref={canvasRef}
      className={`workflow-builder-flow relative h-full flex-1 overflow-hidden${useTouchCanvas ? " workflow-builder-flow--touch-pan" : ""}`}
      style={{ backgroundColor: "transparent" }}
      onDrop={readOnly ? undefined : onDrop}
      onDragOver={readOnly ? undefined : onDragOver}
      onDragLeave={readOnly ? undefined : onDragLeave}
    >
      <ReactFlow
        nodes={enhancedNodes}
        edges={enhancedEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={readOnly ? undefined : onConnect}
        onNodeClick={handleNodeClick}
        onNodeDragStart={readOnly ? undefined : handleNodeDragStart}
        onNodeDragStop={readOnly ? undefined : handleNodeDragStop}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        edgesFocusable={!readOnly}
        edgesReconnectable={false}
        nodesDraggable={!readOnly && !useTouchCanvas}
        deleteKeyCode={null}
        onPaneContextMenu={(e) => e.preventDefault()}
        fitView={!compactMode}
        fitViewOptions={fitViewOptions}
        minZoom={useTouchCanvas ? 0.08 : 0.5}
        maxZoom={2}
        panOnDrag={!useTouchCanvas}
        panOnScroll={useTouchCanvas}
        panOnScrollMode={PanOnScrollMode.Free}
        selectNodesOnDrag={false}
        zoomOnPinch
        preventScrolling
        defaultEdgeOptions={{
          type: WORKFLOW_EDGE_TYPE,
          style: {
            stroke: WORKFLOW_CONNECTOR_COLOR,
            strokeWidth: WORKFLOW_CONNECTOR_STROKE_WIDTH,
          },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.5}
          color="#d0d5dd"
        />
        <Controls showInteractive={false} />
        {useTouchCanvas ? (
          <MobileTouchPan
            containerRef={canvasRef}
            enabled={useTouchCanvas}
            onTapSelect={handleTouchTapSelect}
          />
        ) : null}
        {compactMode ? (
          <MobileCanvasFitView enabled={compactMode} stepCount={stepNodes.length} />
        ) : null}
      </ReactFlow>

      {!hasStepNodes ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed bg-white/80 px-8 py-10 text-center"
            style={{
              borderColor: GOLD,
              boxShadow: libraryDragActive ? "0 0 0 6px rgba(188, 139, 65, 0.16)" : undefined,
              backgroundColor: libraryDragActive ? "#faf6ef" : undefined,
            }}
          >
            <span
              className="text-sm font-semibold leading-5"
              style={{ color: "#101828" }}
            >
              {libraryDragActive ? "Drop here" : "Blank workflow"}
            </span>
            <span className="max-w-[240px] text-xs" style={{ color: TEXT_MUTED }}>
              Drag steps from the library to build this flow from scratch.
            </span>
            {!readOnly ? (
              <button
                type="button"
                onClick={() => openPickerAt(EMPTY_INSERTION)}
                className="pointer-events-auto mt-1 flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-semibold text-white transition hover:brightness-[0.97]"
                style={{ background: "var(--brand-primary)" }}
              >
                + Add first step
              </button>
            ) : null}
            {!readOnly && canPasteWorkflow ? (
              <button
                type="button"
                onClick={onPasteWorkflow}
                disabled={pastingWorkflow}
                className="pointer-events-auto flex h-11 items-center gap-2 rounded-lg border bg-white px-5 text-sm font-semibold transition hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-60"
                style={{ borderColor: GOLD, color: "var(--brand-primary)" }}
              >
                {pastingWorkflow ? "Pasting…" : "Paste workflow"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {rejectedStageWarning ? (
        <div
          className="absolute left-1/2 top-3 z-20 flex w-[min(420px,calc(100%-24px))] -translate-x-1/2 items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950 shadow-sm"
          role="alert"
        >
          <span className="flex-1">{rejectedStageWarning}</span>
          <button
            type="button"
            className="shrink-0 text-[11px] font-semibold underline"
            onClick={() => setRejectedStageWarning(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <AddStepPicker
        open={pickerOpen}
        categories={pickerCategories}
        slotStage={pickerSlotStage}
        onSelect={handlePickerSelect}
        onClose={closePicker}
      />
    </div>
  );
}

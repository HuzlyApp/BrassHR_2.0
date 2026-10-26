"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from "@xyflow/react";
import {
  ArrowLeft,
  FolderOpen,
  LayoutTemplate,
  Library,
  Menu,
  MoreVertical,
  Pencil,
  Play,
  Loader2,
  Save,
  Search,
  Settings,
  Redo2,
  Undo2,
  SlidersHorizontal,
} from "lucide-react";

import SuccessModal from "../SuccessModal";
import StepsCanvas from "./StepsCanvas";
import StepsLibrary from "./StepsLibrary";
import StepsSettingsPanel from "./StepsSettingsPanel";
import {
  BRAND_CTA_GRADIENT,
  CARD_BORDER,
  PAGE_BG,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "./constants";
import { applyWorkflowNodeDataPatch } from "@/lib/onboarding/apply-workflow-node-patch";
import { cloneWorkflowState } from "@/lib/onboarding/clone-workflow-state";
import {
  collectUsedLibrarySteps,
  excludeUsedLibrarySteps,
} from "./filter-step-library";
import {
  type StepCategory,
  type WorkflowCanvasNodeData,
  type WorkflowNodeData,
  type WorkflowState,
} from "./types";
import { withLeafDropZones } from "./workflow-canvas-utils";

const FOOTER_BTN =
  "flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border bg-white px-3 text-sm font-medium transition hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-50 max-[999px]:h-5 max-[999px]:gap-1 max-[999px]:rounded-md max-[999px]:px-1.5 max-[999px]:text-[10px] max-[999px]:leading-none";
const FOOTER_BTN_PRIMARY =
  "flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold text-white transition hover:brightness-[0.97] disabled:cursor-not-allowed disabled:opacity-70 max-[999px]:h-5 max-[999px]:gap-1 max-[999px]:rounded-md max-[999px]:px-2 max-[999px]:text-[10px] max-[999px]:leading-none";
const FOOTER_ICON = "h-3.5 w-3.5 max-[999px]:h-2 max-[999px]:w-2";
const CANVAS_PANEL_BTN =
  "pointer-events-auto inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-semibold shadow-sm max-[999px]:h-[22px] max-[999px]:gap-1 max-[999px]:rounded-md max-[999px]:px-2 max-[999px]:text-[11px] max-[999px]:leading-none";
const CANVAS_PANEL_ICON = "h-4 w-4 max-[999px]:h-[9px] max-[999px]:w-[9px]";

export type WorkflowBuilderProps = {
  title: string;
  subtitle?: string;
  productName?: string;
  brandName?: string;
  brandTagline?: string;
  stepLibrary: StepCategory[];
  initialNodes?: Node<WorkflowNodeData>[];
  initialEdges?: Edge[];
  lastUpdated?: { author: string; minutesAgo: number };
  onBack?: () => void;
  onTitleChange?: (title: string) => void;
  editableTitle?: boolean;
  titleCentered?: boolean;
  onChange?: (state: WorkflowState) => void;
  onSaveAsTemplate?: (state: WorkflowState) => void;
  onPreview?: (state: WorkflowState) => void;
  onPublish?: (state: WorkflowState) => void;
  publishLabel?: string;
  /** Renders inside admin settings (no full-viewport shell / duplicate chrome). */
  embedded?: boolean;
  publishStatusLabel?: string;
  toolbarData?: {
    templates: Array<{ id: string; name: string; status?: string }>;
    myFlows: Array<{ id: string; name: string; status?: string }>;
    library: Array<{ id: string; label: string; count: number }>;
    settings: Array<{ label: string; value: string }>;
  };
  resetKey?: string;
  /** Hides top builder header + toolbar strip (used under recruiter dashboard tabs). */
  hideTopChrome?: boolean;
  /** Fills parent flex container instead of fixed embedded height. */
  fillParent?: boolean;
  savingTemplate?: boolean;
  savingPublish?: boolean;
  /** Hides title + save row above the canvas (used when header is in dashboard sub-nav). */
  hideCanvasHeader?: boolean;
  /** View-only mode — no edits on canvas, library, or settings. */
  readOnly?: boolean;
  canPasteWorkflow?: boolean;
  pastingWorkflow?: boolean;
  onPasteWorkflow?: () => void;
  onResetCanvas?: () => void;
  onDeleteWorkflow?: () => void;
  deletingWorkflow?: boolean;
  registerUndoControls?: (
    controls: { canUndo: boolean; undo: () => void; canRedo: boolean; redo: () => void } | null
  ) => void;
};

const MAX_HISTORY = 50;

export default function WorkflowBuilder(props: WorkflowBuilderProps) {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderInner {...props} />
    </ReactFlowProvider>
  );
}

function WorkflowBuilderInner({
  title,
  subtitle,
  productName = "Onboarding Builder",
  brandName = "Brass HR",
  brandTagline,
  stepLibrary,
  initialNodes = [],
  initialEdges = [],
  lastUpdated,
  onBack,
  onTitleChange,
  editableTitle = false,
  titleCentered = false,
  onChange,
  onSaveAsTemplate,
  onPreview,
  onPublish,
  publishLabel = "Publish Workflow",
  embedded = false,
  publishStatusLabel,
  toolbarData,
  resetKey,
  hideTopChrome = false,
  fillParent = false,
  savingTemplate = false,
  savingPublish = false,
  hideCanvasHeader = false,
  readOnly = false,
  canPasteWorkflow = false,
  pastingWorkflow = false,
  onPasteWorkflow,
  onResetCanvas,
  onDeleteWorkflow,
  deletingWorkflow = false,
  registerUndoControls,
}: WorkflowBuilderProps) {
  const hydratedInitial = useMemo(
    () => withLeafDropZones(initialNodes, initialEdges),
    [initialNodes, initialEdges]
  );

  const [nodes, setNodes, onNodesChange] =
    useNodesState<Node<WorkflowCanvasNodeData>>(hydratedInitial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<WorkflowState[]>([]);
  const [redoStack, setRedoStack] = useState<WorkflowState[]>([]);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  const [searchTerm, setSearchTerm] = useState("");
  const [successOpen, setSuccessOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [activeToolbar, setActiveToolbar] = useState<
    "templates" | "flows" | "library" | "settings" | null
  >(null);
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [desktopLibraryOpen, setDesktopLibraryOpen] = useState(true);
  const [desktopSettingsOpen, setDesktopSettingsOpen] = useState(true);
  const [isCompactBuilder, setIsCompactBuilder] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const didMount = useRef(false);
  const onChangeRef = useRef(onChange);
  const skipChangeAfterReset = useRef(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 999px)");
    const syncPanelsForViewport = () => {
      const compact = media.matches;
      setIsCompactBuilder(compact);
      if (!compact) {
        setMobileLibraryOpen(false);
        setMobileSettingsOpen(false);
      }
    };
    syncPanelsForViewport();
    media.addEventListener("change", syncPanelsForViewport);
    return () => media.removeEventListener("change", syncPanelsForViewport);
  }, []);

  useEffect(() => {
    const touchMedia = window.matchMedia("(hover: none) and (pointer: coarse)");
    const syncTouchDevice = () => {
      const isIosTablet =
        /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      setIsTouchDevice(touchMedia.matches || isIosTablet);
    };
    syncTouchDevice();
    touchMedia.addEventListener("change", syncTouchDevice);
    return () => touchMedia.removeEventListener("change", syncTouchDevice);
  }, []);

  useEffect(() => {
    if (!isCompactBuilder || !selectedNodeId) return;
    setMobileSettingsOpen(true);
    setMobileLibraryOpen(false);
  }, [isCompactBuilder, selectedNodeId]);

  const libraryPanelOpen = isCompactBuilder ? mobileLibraryOpen : desktopLibraryOpen;
  const settingsPanelOpen = isCompactBuilder ? mobileSettingsOpen : desktopSettingsOpen;

  const closeLibraryPanel = useCallback(() => {
    if (isCompactBuilder) setMobileLibraryOpen(false);
    else setDesktopLibraryOpen(false);
  }, [isCompactBuilder]);

  const openLibraryPanel = useCallback(() => {
    if (isCompactBuilder) {
      setMobileLibraryOpen(true);
      setMobileSettingsOpen(false);
    } else {
      setDesktopLibraryOpen(true);
    }
  }, [isCompactBuilder]);

  const closeSettingsPanel = useCallback(() => {
    if (isCompactBuilder) setMobileSettingsOpen(false);
    else setDesktopSettingsOpen(false);
  }, [isCompactBuilder]);

  const openSettingsPanel = useCallback(() => {
    if (isCompactBuilder) {
      setMobileSettingsOpen(true);
      setMobileLibraryOpen(false);
    } else {
      setDesktopSettingsOpen(true);
    }
  }, [isCompactBuilder]);

  useEffect(() => {
    if (!editingTitle) setTitleDraft(title);
  }, [editingTitle, title]);

  const initialCanvasRef = useRef({ nodes: initialNodes, edges: initialEdges });
  initialCanvasRef.current = { nodes: initialNodes, edges: initialEdges };
  const lastResetKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!resetKey) return;
    if (lastResetKeyRef.current === resetKey) return;
    lastResetKeyRef.current = resetKey;

    const hydrated = withLeafDropZones(
      initialCanvasRef.current.nodes,
      initialCanvasRef.current.edges
    );
    setNodes(hydrated.nodes);
    setEdges(hydrated.edges);
    setSelectedNodeId(null);
    setUndoStack([]);
    setRedoStack([]);
    skipChangeAfterReset.current = true;
  }, [resetKey, setEdges, setNodes]);

  const selectedNode = useMemo((): Node<WorkflowNodeData> | null => {
    const n = nodes.find((node) => node.id === selectedNodeId);
    if (n?.type === "step") return n as Node<WorkflowNodeData>;
    return null;
  }, [nodes, selectedNodeId]);

  const usedLibrarySteps = useMemo(() => collectUsedLibrarySteps(nodes), [nodes]);

  const availableLibrary = useMemo(() => {
    return excludeUsedLibrarySteps(stepLibrary, usedLibrarySteps.stepIds, {
      usedLabels: usedLibrarySteps.labels,
    });
  }, [stepLibrary, usedLibrarySteps]);

  const currentState: WorkflowState = useMemo(
    () => ({ nodes, edges }),
    [nodes, edges]
  );

  const snapshotCurrent = useCallback(
    (): WorkflowState =>
      cloneWorkflowState({ nodes: nodesRef.current, edges: edgesRef.current }),
    []
  );

  const applySnapshot = useCallback(
    (snap: WorkflowState) => {
      setNodes(snap.nodes);
      setEdges(snap.edges);
      setSelectedNodeId((id) => {
        if (!id) return id;
        const stillExists = snap.nodes.some((n) => n.id === id && n.type === "step");
        return stillExists ? id : null;
      });
    },
    [setEdges, setNodes]
  );

  const recordChange = useCallback(() => {
    const snap = snapshotCurrent();
    setUndoStack((prev) => [...prev.slice(-(MAX_HISTORY - 1)), snap]);
    setRedoStack([]);
  }, [snapshotCurrent]);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    if (skipChangeAfterReset.current) {
      skipChangeAfterReset.current = false;
      return;
    }
    onChangeRef.current?.(currentState);
  }, [currentState]);

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const previous = prev[prev.length - 1];
      const current = snapshotCurrent();
      setRedoStack((redo) => [...redo, current]);
      applySnapshot(previous);
      return prev.slice(0, -1);
    });
  }, [applySnapshot, snapshotCurrent]);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[prev.length - 1];
      const current = snapshotCurrent();
      setUndoStack((undo) => [...undo, current]);
      applySnapshot(next);
      return prev.slice(0, -1);
    });
  }, [applySnapshot, snapshotCurrent]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleRedo, handleUndo]);

  const registerUndoControlsRef = useRef(registerUndoControls);
  registerUndoControlsRef.current = registerUndoControls;

  useEffect(() => {
    registerUndoControlsRef.current?.({
      canUndo: undoStack.length > 0,
      undo: handleUndo,
      canRedo: redoStack.length > 0,
      redo: handleRedo,
    });
  }, [handleRedo, handleUndo, redoStack.length, undoStack.length]);

  useEffect(() => {
    return () => registerUndoControlsRef.current?.(null);
  }, []);

  const handleUpdateNode = useCallback(
    (id: string, patch: Partial<WorkflowNodeData>, options?: { skipHistory?: boolean }) => {
      if (!options?.skipHistory) recordChange();
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== id || n.type !== "step") return n;
          const step = n as Node<WorkflowNodeData>;
          return { ...step, data: applyWorkflowNodeDataPatch(step.data, patch) };
        })
      );
    },
    [recordChange, setNodes]
  );

  return (
    <div
      className={`flex w-full flex-col overflow-hidden ${
        fillParent
          ? "h-full min-h-0"
          : embedded
            ? "h-[min(780px,calc(100vh-220px))] min-h-[560px] rounded-2xl border"
            : "h-screen"
      }`}
      style={{ backgroundColor: PAGE_BG, ...(embedded ? { borderColor: CARD_BORDER } : {}) }}
    >
      {!embedded && !hideTopChrome ? (
      <header
        className="flex h-[60px] shrink-0 items-center justify-between border-b bg-white px-5"
        style={{ borderColor: CARD_BORDER }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ background: BRAND_CTA_GRADIENT }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M5 5L12 12L19 5M5 19L12 12L19 19"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span
                className="text-sm font-semibold leading-5"
                style={{ color: TEXT_PRIMARY }}
              >
                {brandName}
              </span>
              {brandTagline ? (
                <span
                  className="text-[10px] leading-3"
                  style={{ color: TEXT_MUTED }}
                >
                  {brandTagline}
                </span>
              ) : null}
            </div>
            <p
              className="text-sm font-semibold leading-5"
              style={{ color: TEXT_PRIMARY }}
            >
              {productName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
              color="#98a2b3"
            />
            <input
              type="text"
              role="searchbox"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search Steps"
              aria-label="Search the steps library"
              className="h-9 w-[240px] rounded-lg border bg-[#f9fafb] pl-9 pr-3 text-xs outline-none transition focus:border-[#BC8B41] focus:bg-white focus:ring-2 focus:ring-[#BC8B41]/20"
              style={{ borderColor: CARD_BORDER, color: TEXT_PRIMARY }}
            />
          </div>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg border bg-white transition hover:bg-[#fafafa]"
            style={{ borderColor: CARD_BORDER }}
            aria-label="Menu"
          >
            <Menu size={16} color={TEXT_SECONDARY} />
          </button>
        </div>
      </header>
      ) : null}

      {!hideTopChrome ? (
      <div
        className="flex h-[44px] shrink-0 items-center justify-between border-b bg-white px-5"
        style={{ borderColor: CARD_BORDER }}
      >
        {onBack && !embedded ? (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-md px-1 py-1 text-sm font-medium transition hover:opacity-80"
            style={{ color: TEXT_SECONDARY }}
          >
            <ArrowLeft size={14} />
            Back
          </button>
        ) : embedded ? (
          <span className="text-xs font-medium" style={{ color: TEXT_SECONDARY }}>
            {publishStatusLabel ?? "Draft"}
          </span>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-1">
          <ToolbarButton
            icon={<LayoutTemplate size={14} />}
            label="Templates"
            active={activeToolbar === "templates"}
            onClick={() => setActiveToolbar((v) => (v === "templates" ? null : "templates"))}
          />
          <ToolbarButton
            icon={<FolderOpen size={14} />}
            label="Workflows"
            active={activeToolbar === "flows"}
            onClick={() => setActiveToolbar((v) => (v === "flows" ? null : "flows"))}
          />
          <ToolbarButton
            icon={<Library size={14} />}
            label="Library"
            active={activeToolbar === "library"}
            onClick={() => setActiveToolbar((v) => (v === "library" ? null : "library"))}
          />
          <ToolbarButton
            icon={<Settings size={14} />}
            label="Settings"
            active={activeToolbar === "settings"}
            onClick={() => setActiveToolbar((v) => (v === "settings" ? null : "settings"))}
          />
        </div>
      </div>
      ) : null}

      {!hideTopChrome && activeToolbar ? (
        <ToolbarPanel
          active={activeToolbar}
          data={toolbarData}
          publishStatusLabel={publishStatusLabel}
        />
      ) : null}

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {isCompactBuilder && (libraryPanelOpen || settingsPanelOpen) ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40"
            aria-label="Close panels"
            onClick={() => {
              setMobileLibraryOpen(false);
              setMobileSettingsOpen(false);
            }}
          />
        ) : null}

        <StepsLibrary
          categories={stepLibrary}
          usedStepIds={usedLibrarySteps.stepIds}
          usedLabels={usedLibrarySteps.labels}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          readOnly={readOnly}
          compactMode={isCompactBuilder}
          panelOpen={libraryPanelOpen}
          onPanelClose={closeLibraryPanel}
        />

        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2 pt-1.5 min-[1000px]:px-4 min-[1000px]:pb-4 min-[1000px]:pt-2">
          {!libraryPanelOpen ? (
            <div className="pointer-events-none absolute left-3 top-3 z-20 flex gap-2">
              <button
                type="button"
                onClick={openLibraryPanel}
                className={CANVAS_PANEL_BTN}
                style={{ borderColor: CARD_BORDER, color: TEXT_PRIMARY }}
              >
                <Library className={CANVAS_PANEL_ICON} />
                Steps
              </button>
            </div>
          ) : null}
          {!settingsPanelOpen ? (
            <div className="pointer-events-none absolute right-3 top-3 z-20 flex gap-2">
              <button
                type="button"
                onClick={openSettingsPanel}
                className={CANVAS_PANEL_BTN}
                style={{ borderColor: CARD_BORDER, color: TEXT_PRIMARY }}
              >
                <SlidersHorizontal className={CANVAS_PANEL_ICON} />
                Settings
              </button>
            </div>
          ) : null}
          {!hideCanvasHeader ? (
          <div
            className={`relative flex shrink-0 items-center ${titleCentered ? "justify-center" : "justify-between"}`}
            style={{
              paddingTop: 14,
              paddingBottom: 14,
              paddingLeft: 8,
              paddingRight: 8,
              minHeight: 72,
            }}
          >
            <div
              className={`${titleCentered ? "absolute left-1/2 flex -translate-x-1/2 flex-col items-center text-center" : "pl-2"}`}
            >
              {editableTitle && editingTitle ? (
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={() => {
                    const next = titleDraft.trim() || title;
                    setEditingTitle(false);
                    if (next !== title) onTitleChange?.(next);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      setTitleDraft(title);
                      setEditingTitle(false);
                    }
                  }}
                  autoFocus
                  className="min-w-[220px] rounded-md border px-2 py-1 text-center text-lg font-semibold leading-7 outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--brand-primary)_25%,transparent)]"
                  style={{ borderColor: CARD_BORDER, color: TEXT_PRIMARY }}
                  aria-label="Workflow name"
                />
              ) : (
                <div className="flex items-center gap-2">
                  <h1
                    className="text-lg font-semibold leading-7"
                    style={{ color: TEXT_PRIMARY }}
                  >
                    {title}
                  </h1>
                  {editableTitle ? (
                    <button
                      type="button"
                      onClick={() => setEditingTitle(true)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#98A2B3] transition hover:bg-[#F9FAFB] hover:text-[color:var(--brand-primary)]"
                      aria-label="Edit workflow name"
                    >
                      <Pencil size={14} />
                    </button>
                  ) : null}
                </div>
              )}
              {subtitle && !titleCentered ? (
                <p
                  className="mt-0.5 text-xs leading-4"
                  style={{ color: TEXT_SECONDARY }}
                >
                  {subtitle}
                </p>
              ) : null}
            </div>

            <div className={`flex items-center gap-2 ${titleCentered ? "absolute right-8" : ""}`}>
              <SaveTemplateButton
                compact
                saving={savingTemplate}
                disabled={savingPublish}
                onClick={() => onSaveAsTemplate?.(currentState)}
              />
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-lg border bg-white transition hover:bg-[#fafafa]"
                style={{ borderColor: CARD_BORDER }}
                aria-label="More options"
              >
                <MoreVertical size={14} color="#98a2b3" />
              </button>
            </div>
          </div>
          ) : null}

          <div
            className="relative flex flex-1 flex-col overflow-hidden rounded-2xl"
            style={{
              border: "1.5px dashed #cbd5e1",
              backgroundColor: "#fafafa",
            }}
          >
            <StepsCanvas
              nodes={nodes}
              edges={edges}
              setNodes={setNodes}
              setEdges={setEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              categories={availableLibrary}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              onBeforeChange={recordChange}
              readOnly={readOnly}
              canPasteWorkflow={canPasteWorkflow}
              pastingWorkflow={pastingWorkflow}
              onPasteWorkflow={onPasteWorkflow}
              compactMode={isCompactBuilder}
              touchPan={isTouchDevice}
            />

            {savingTemplate ? (
              <div
                className="absolute inset-0 z-20 flex items-center justify-center bg-white/70"
                role="status"
                aria-live="polite"
                aria-label="Saving template"
              >
                <div
                  className="flex items-center gap-3 rounded-xl border bg-white px-5 py-3 shadow-md"
                  style={{ borderColor: CARD_BORDER }}
                >
                  <Loader2
                    size={20}
                    className="animate-spin"
                    style={{ color: "var(--brand-primary)" }}
                  />
                  <span className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>
                    Saving template…
                  </span>
                </div>
              </div>
            ) : null}

            {lastUpdated ? (
              <p
                className="absolute bottom-4 right-4 z-10 text-xs"
                style={{ color: TEXT_MUTED }}
              >
                Draft <span style={{ color: "#d0d5dd" }}>•</span> Last updated{" "}
                {lastUpdated.minutesAgo}m ago by {lastUpdated.author}
              </p>
            ) : null}
          </div>

          <div
            className="flex shrink-0 items-center gap-1 overflow-x-auto overscroll-x-contain border-t bg-white px-3 py-2 max-[999px]:flex-nowrap min-[1000px]:flex-wrap min-[1000px]:justify-between min-[1000px]:gap-x-3 min-[1000px]:gap-y-2 min-[1000px]:overflow-visible min-[1000px]:px-4 min-[1000px]:py-3"
            style={{ borderColor: "#d0d5dd" }}
          >
            <div className="flex shrink-0 items-center gap-1 min-[1000px]:flex-wrap min-[1000px]:gap-2">
              {!readOnly ? (
              <>
              <button
                type="button"
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                className={FOOTER_BTN}
                style={{ borderColor: "#d0d5dd", color: TEXT_PRIMARY }}
                aria-label="Undo"
              >
                <Undo2 className={FOOTER_ICON} />
                Undo
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                className={FOOTER_BTN}
                style={{ borderColor: "#d0d5dd", color: TEXT_PRIMARY }}
                aria-label="Redo"
              >
                <Redo2 className={FOOTER_ICON} />
                Redo
              </button>
              </>
              ) : null}
              {!hideCanvasHeader && !readOnly ? (
                <SaveTemplateButton
                  saving={savingTemplate}
                  disabled={savingPublish}
                  onClick={() => onSaveAsTemplate?.(currentState)}
                />
              ) : null}
              {!readOnly && canPasteWorkflow ? (
                <button
                  type="button"
                  onClick={onPasteWorkflow}
                  disabled={pastingWorkflow}
                  className={`${FOOTER_BTN} font-semibold hover:bg-[#faf6ef] max-[999px]:font-semibold`}
                  style={{ borderColor: "var(--brand-primary)", color: "var(--brand-primary)" }}
                >
                  <span className="max-[999px]:hidden">{pastingWorkflow ? "Pasting…" : "Paste workflow"}</span>
                  <span className="hidden max-[999px]:inline">{pastingWorkflow ? "…" : "Paste"}</span>
                </button>
              ) : null}
              {!readOnly && onResetCanvas ? (
                <button
                  type="button"
                  onClick={onResetCanvas}
                  className={FOOTER_BTN}
                  style={{ borderColor: "#d0d5dd", color: TEXT_PRIMARY }}
                  aria-label="Blank sheet"
                  title="Clear the canvas and build this workflow from scratch"
                >
                  Blank sheet
                </button>
              ) : null}
              {!readOnly && onDeleteWorkflow ? (
                <button
                  type="button"
                  onClick={onDeleteWorkflow}
                  disabled={deletingWorkflow || savingPublish || savingTemplate}
                  className={FOOTER_BTN}
                  style={{ borderColor: "#FDA29B", color: "#B42318" }}
                  aria-label="Delete workflow"
                  title="Delete this workflow"
                >
                  {deletingWorkflow ? "Deleting…" : "Delete"}
                </button>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-1 max-[999px]:ml-auto min-[1000px]:gap-2">
              {!readOnly ? (
              <button
                type="button"
                onClick={() => onPreview?.(currentState)}
                className={FOOTER_BTN}
                style={{ borderColor: "#d0d5dd", color: TEXT_PRIMARY }}
              >
                <Play className={FOOTER_ICON} />
                Preview
              </button>
              ) : null}
              {!readOnly ? (
              <button
                type="button"
                onClick={() => onPublish?.(currentState)}
                disabled={savingPublish || savingTemplate}
                className={FOOTER_BTN_PRIMARY}
                style={{ background: BRAND_CTA_GRADIENT }}
              >
                {savingPublish ? <Loader2 className={`${FOOTER_ICON} animate-spin`} /> : null}
                <span className="max-[999px]:hidden">{savingPublish ? "Publishing…" : publishLabel}</span>
                <span className="hidden max-[999px]:inline">{savingPublish ? "…" : "Publish"}</span>
              </button>
              ) : null}
            </div>
          </div>
        </main>

        <StepsSettingsPanel
          node={selectedNode}
          workflowState={currentState}
          onUpdate={handleUpdateNode}
          readOnly={readOnly}
          compactMode={isCompactBuilder}
          panelOpen={settingsPanelOpen}
          onPanelClose={closeSettingsPanel}
          onSaveStep={() => {
            onChange?.(currentState);
            setSuccessOpen(true);
          }}
        />
      </div>

      <SuccessModal
        open={successOpen}
        onClose={() => setSuccessOpen(false)}
        title="Success!"
        message="New workflow has been created"
      />
    </div>
  );
}

function SaveTemplateButton({
  onClick,
  saving = false,
  disabled = false,
  compact = false,
}: {
  onClick: () => void;
  saving?: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving || disabled}
      className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border bg-white text-sm font-medium transition hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-70 ${
        compact ? "h-9 px-3.5 max-[999px]:h-[22px] max-[999px]:rounded-md max-[999px]:px-1.5 max-[999px]:text-[10px] max-[999px]:leading-none" : "h-10 px-3 max-[999px]:h-5 max-[999px]:rounded-md max-[999px]:px-1.5 max-[999px]:text-[10px] max-[999px]:leading-none"
      }`}
      style={{ borderColor: compact ? CARD_BORDER : "#d0d5dd", color: TEXT_PRIMARY }}
      aria-busy={saving}
    >
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin max-[999px]:h-2 max-[999px]:w-2" style={{ color: "var(--brand-primary)" }} />
      ) : (
        <Save className="h-3.5 w-3.5 max-[999px]:h-2 max-[999px]:w-2" />
      )}
      <span className="max-[999px]:hidden">{saving ? "Saving…" : "Save as template"}</span>
    </button>
  );
}

function ToolbarButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition hover:bg-[#f9fafb]"
      style={{ color: active ? TEXT_PRIMARY : TEXT_SECONDARY, backgroundColor: active ? "#f9fafb" : undefined }}
    >
      {icon}
      {label}
    </button>
  );
}

function ToolbarPanel({
  active,
  data,
  publishStatusLabel,
}: {
  active: "templates" | "flows" | "library" | "settings";
  data: WorkflowBuilderProps["toolbarData"];
  publishStatusLabel?: string;
}) {
  const empty = (
    <p className="text-xs" style={{ color: TEXT_SECONDARY }}>
      No records found for the active tenant.
    </p>
  );

  return (
    <div className="border-b bg-white px-5 py-3" style={{ borderColor: CARD_BORDER }}>
      {active === "templates" ? (
        <PanelList
          title="Templates"
          items={data?.templates.map((t) => ({
            id: t.id,
            primary: t.name,
            secondary: t.status ?? "Saved template",
          }))}
          empty={empty}
        />
      ) : null}
      {active === "flows" ? (
        <PanelList
          title="Workflows"
          items={data?.myFlows.map((f) => ({
            id: f.id,
            primary: f.name,
            secondary: f.status ?? publishStatusLabel ?? "Draft",
          }))}
          empty={empty}
        />
      ) : null}
      {active === "library" ? (
        <PanelList
          title="Library"
          items={data?.library.map((l) => ({
            id: l.id,
            primary: l.label,
            secondary: `${l.count} available step${l.count === 1 ? "" : "s"}`,
          }))}
          empty={empty}
        />
      ) : null}
      {active === "settings" ? (
        <PanelList
          title="Settings"
          items={data?.settings.map((s) => ({
            id: s.label,
            primary: s.label,
            secondary: s.value,
          }))}
          empty={empty}
        />
      ) : null}
    </div>
  );
}

function PanelList({
  title,
  items,
  empty,
}: {
  title: string;
  items?: Array<{ id: string; primary: string; secondary: string }>;
  empty: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: TEXT_MUTED }}>
        {title}
      </p>
      {items?.length ? (
        <div className="grid gap-2 md:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border px-3 py-2" style={{ borderColor: CARD_BORDER }}>
              <p className="truncate text-xs font-semibold" style={{ color: TEXT_PRIMARY }}>
                {item.primary}
              </p>
              <p className="truncate text-[11px]" style={{ color: TEXT_SECONDARY }}>
                {item.secondary}
              </p>
            </div>
          ))}
        </div>
      ) : (
        empty
      )}
    </div>
  );
}

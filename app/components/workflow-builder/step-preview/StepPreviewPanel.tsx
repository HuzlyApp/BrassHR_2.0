"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, Maximize2, Monitor, Smartphone, X } from "lucide-react";
import type { Node } from "@xyflow/react";
import type { WorkflowNodeData, WorkflowState } from "../types";
import {
  CARD_BORDER,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "../constants";
import {
  buildStepPreviewModel,
  coercePreviewState,
  mapProfessionDocumentsToPreview,
  STEP_PREVIEW_STATE_LABELS,
  stepPreviewUsesProfessionDocuments,
  type StepPreviewState,
} from "@/lib/onboarding/step-preview-model";
import type { ProfessionUploadDocument } from "@/lib/professions/profession-documents";
import { StepPreviewBody } from "./StepPreviewBodies";
import { PreviewInert, PreviewOnboardingCard } from "./preview-ui";

type Viewport = "mobile" | "desktop";

type ProfessionCatalogRow = {
  id: string;
  name: string;
  documents: ProfessionUploadDocument[];
};

type StepPreviewPanelProps = {
  node: Node<WorkflowNodeData>;
  workflowState: WorkflowState;
};

export default function StepPreviewPanel({ node, workflowState }: StepPreviewPanelProps) {
  const model = useMemo(
    () => buildStepPreviewModel(workflowState, node),
    [workflowState, node]
  );
  const [previewState, setPreviewState] = useState<StepPreviewState>("default");
  const [expanded, setExpanded] = useState(false);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [professions, setProfessions] = useState<ProfessionCatalogRow[]>([]);
  const [previewProfessionId, setPreviewProfessionId] = useState("");
  const [professionCatalogError, setProfessionCatalogError] = useState<string | null>(null);
  const [professionCatalogLoading, setProfessionCatalogLoading] = useState(false);

  const showProfessionViewAs = Boolean(
    model && stepPreviewUsesProfessionDocuments(model.libraryId, model.step.step_type)
  );

  const loadProfessionCatalog = useCallback(async () => {
    if (!showProfessionViewAs) return;
    setProfessionCatalogLoading(true);
    setProfessionCatalogError(null);
    try {
      const response = await fetch("/api/admin/profession-documents");
      const payload = (await response.json()) as {
        professions?: ProfessionCatalogRow[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Could not load professions");
      const rows = payload.professions ?? [];
      setProfessions(rows);
      setPreviewProfessionId((current) =>
        current && rows.some((row) => row.id === current) ? current : rows[0]?.id ?? ""
      );
    } catch (err) {
      setProfessionCatalogError(
        err instanceof Error ? err.message : "Could not load professions"
      );
      setProfessions([]);
    } finally {
      setProfessionCatalogLoading(false);
    }
  }, [showProfessionViewAs]);

  useEffect(() => {
    setPreviewState((current) => coercePreviewState(current, model?.availableStates ?? ["default"]));
  }, [model?.kind]);

  useEffect(() => {
    void loadProfessionCatalog();
  }, [loadProfessionCatalog]);

  const previewModel = useMemo(() => {
    if (!model) return null;
    if (!showProfessionViewAs || !previewProfessionId) return model;
    const profession = professions.find((row) => row.id === previewProfessionId);
    if (!profession) return model;
    return {
      ...model,
      requiredDocuments: mapProfessionDocumentsToPreview(profession.documents ?? []),
    };
  }, [model, showProfessionViewAs, previewProfessionId, professions]);

  if (!previewModel) {
    return (
      <div className="flex flex-1 items-center justify-center px-5 text-center">
        <p className="text-sm" style={{ color: TEXT_SECONDARY }}>
          Preview not available for this step yet.
        </p>
      </div>
    );
  }

  const resolvedState = coercePreviewState(previewState, previewModel.availableStates);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="workflow-step-preview">
      <div className="flex shrink-0 flex-col gap-2 border-b px-4 py-3" style={{ borderColor: CARD_BORDER }}>
        <div className="flex items-center justify-between gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ backgroundColor: "#012352", color: "#fff" }}
          >
            {previewModel.audienceLabel}
          </span>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold"
            style={{ color: TEXT_PRIMARY }}
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Expand Preview
          </button>
        </div>
        {previewModel.isConditional ? (
          <p className="text-[11px] font-medium text-amber-700">Conditional step</p>
        ) : null}
        {showProfessionViewAs ? (
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium" style={{ color: TEXT_SECONDARY }}>
              View as profession
            </span>
            <div className="relative">
              <select
                value={previewProfessionId}
                onChange={(event) => setPreviewProfessionId(event.target.value)}
                disabled={professionCatalogLoading || professions.length === 0}
                className="h-9 w-full appearance-none rounded-lg border bg-white px-3 pr-8 text-xs outline-none disabled:bg-slate-50"
                style={{ borderColor: CARD_BORDER, color: TEXT_PRIMARY }}
                data-testid="workflow-step-preview-profession"
              >
                {professions.length === 0 ? (
                  <option value="">
                    {professionCatalogLoading ? "Loading professions…" : "No professions configured"}
                  </option>
                ) : (
                  professions.map((profession) => (
                    <option key={profession.id} value={profession.id}>
                      {profession.name}
                    </option>
                  ))
                )}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </div>
            {professionCatalogError ? (
              <p className="mt-1 text-[11px] text-rose-600">{professionCatalogError}</p>
            ) : previewProfessionId &&
              (professions.find((row) => row.id === previewProfessionId)?.documents.length ?? 0) ===
                0 ? (
              <p className="mt-1 text-[11px]" style={{ color: TEXT_SECONDARY }}>
                No documents configured for this profession in Settings.
              </p>
            ) : null}
          </label>
        ) : null}
        {previewModel.availableStates.length > 1 ? (
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium" style={{ color: TEXT_SECONDARY }}>
              Preview state
            </span>
            <div className="relative">
              <select
                value={resolvedState}
                onChange={(event) => setPreviewState(event.target.value as StepPreviewState)}
                className="h-9 w-full appearance-none rounded-lg border bg-white px-3 pr-8 text-xs outline-none"
                style={{ borderColor: CARD_BORDER, color: TEXT_PRIMARY }}
              >
                {previewModel.availableStates.map((state) => (
                  <option key={state} value={state}>
                    {STEP_PREVIEW_STATE_LABELS[state]}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </div>
          </label>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-[#dbe3ef]">
        <div className="pointer-events-none px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wide text-slate-500">
          This is what the person completing this step will see.
        </div>
        <PreviewInert>
          <PreviewOnboardingCard model={previewModel} previewState={resolvedState} viewport="panel">
            <StepPreviewBody model={previewModel} previewState={resolvedState} />
          </PreviewOnboardingCard>
        </PreviewInert>
      </div>

      <Dialog.Root open={expanded} onOpenChange={setExpanded}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/50" />
          <Dialog.Content className="fixed inset-3 z-[81] flex min-h-0 flex-col overflow-hidden rounded-2xl bg-[#ECF1F9] shadow-2xl outline-none sm:inset-6">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b bg-white px-4 py-3" style={{ borderColor: CARD_BORDER }}>
              <div>
                <Dialog.Title className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>
                  {previewModel.audienceLabel}
                </Dialog.Title>
                <Dialog.Description className="text-[11px] font-medium text-amber-800">
                  Preview Mode — no changes will be submitted
                </Dialog.Description>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex overflow-hidden rounded-lg border bg-white" style={{ borderColor: CARD_BORDER }}>
                  <button
                    type="button"
                    onClick={() => setViewport("desktop")}
                    className={`inline-flex h-8 items-center gap-1 px-2.5 text-[11px] font-semibold ${
                      viewport === "desktop" ? "bg-[#012352] text-white" : ""
                    }`}
                    style={viewport === "desktop" ? undefined : { color: TEXT_SECONDARY }}
                    aria-pressed={viewport === "desktop"}
                  >
                    <Monitor className="h-3.5 w-3.5" />
                    Desktop
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewport("mobile")}
                    className={`inline-flex h-8 items-center gap-1 px-2.5 text-[11px] font-semibold ${
                      viewport === "mobile" ? "bg-[#012352] text-white" : ""
                    }`}
                    style={viewport === "mobile" ? undefined : { color: TEXT_SECONDARY }}
                    aria-pressed={viewport === "mobile"}
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                    Mobile
                  </button>
                </div>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white"
                    style={{ borderColor: CARD_BORDER }}
                    aria-label="Close expanded preview"
                  >
                    <X size={16} color={TEXT_SECONDARY} />
                  </button>
                </Dialog.Close>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-[#dbe3ef]">
              <div className={viewport === "mobile" ? "mx-auto h-full max-w-[390px]" : "h-full"}>
                <PreviewInert>
                  <PreviewOnboardingCard
                    model={previewModel}
                    previewState={resolvedState}
                    viewport={viewport}
                  >
                    <StepPreviewBody model={previewModel} previewState={resolvedState} />
                  </PreviewOnboardingCard>
                </PreviewInert>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

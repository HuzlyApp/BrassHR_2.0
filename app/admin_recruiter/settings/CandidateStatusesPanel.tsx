"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StageConfigModal, stageSummary, StatusCountPills } from "./StageConfigModal";
import { buildPreHireStageDraft, type StageConfigDraft } from "./pre-hire-stage-draft";
import toast from "react-hot-toast";
import {
  normalizeStageStatusLane,
  STAGE_STATUS_LANES,
  type SavedStageStatusLane,
  type StageStatusLane,
} from "@/lib/jobs/application-statuses/stage-status-lanes";
import {
  DEFAULT_ALTERNATE_REASON_CODES,
  DEFAULT_CLOSING_REASON_CODES,
  parseReasonCodeList,
  preferredReasonCodeLane,
  reasonCodeLaneOf,
  type ReasonCodeLane,
} from "@/lib/jobs/application-statuses/stage-reason-codes";
import { PRE_HIRE_FIGMA_STAGES } from "@/lib/onboarding/hire-stage-groups";

type StatusItem = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  isDefault: boolean;
  systemKey: string | null;
  groupId: string | null;
  groupName: string | null;
  groupDescription: string | null;
  groupSortOrder: number | null;
  groupSystemKey: string | null;
  buttonLane: string | null;
};

type LanePlacement = { statusId: string; noteId: string | null; note: string | null };

type SavedLane = SavedStageStatusLane & {
  stageName: string;
  workflowId: string | null;
  noteId: string | null;
  note: string | null;
};

type ReasonCodeRow = {
  stageName: string;
  code: string;
  sortOrder: number;
  workflowId: string | null;
  note: string | null;
  lane: ReasonCodeLane;
};

function mapReasonCodePayload(row: Record<string, unknown>): ReasonCodeRow | null {
  const stageName = typeof row.stageName === "string" ? row.stageName : "";
  const code = typeof row.code === "string" ? row.code.trim() : "";
  if (!stageName || !code) return null;
  const note = typeof row.note === "string" ? row.note.trim() : "";
  return {
    stageName,
    code,
    sortOrder: Number(row.sortOrder ?? 0),
    workflowId: typeof row.workflowId === "string" && row.workflowId ? row.workflowId : null,
    note: note || null,
    lane: reasonCodeLaneOf(typeof row.lane === "string" ? row.lane : null),
  };
}

type SharedButtonLabels = {
  alternate: string | null;
  closed: string | null;
};

function readSharedButtonLabels(value: unknown): SharedButtonLabels {
  if (!value || typeof value !== "object") return { alternate: null, closed: null };
  const record = value as { alternateLabel?: unknown; closedLabel?: unknown };
  return {
    alternate:
      typeof record.alternateLabel === "string" && record.alternateLabel.trim()
        ? record.alternateLabel.trim()
        : null,
    closed:
      typeof record.closedLabel === "string" && record.closedLabel.trim()
        ? record.closedLabel.trim()
        : null,
  };
}

type StageNote = {
  id: string;
  stageName: string;
  body: string;
  workflowId: string | null;
};

type WorkflowOption = {
  id: string;
  name: string;
  status: string;
};

function mapStatus(row: Record<string, unknown>): StatusItem {
  return {
    id: String(row.id),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    color: (row.color as string | null) ?? null,
    sortOrder: Number(row.sortOrder ?? 0),
    isActive: Boolean(row.isActive),
    isDefault: Boolean(row.isDefault),
    systemKey: (row.systemKey as string | null) ?? null,
    groupId: typeof row.groupId === "string" ? row.groupId : null,
    groupName: typeof row.groupName === "string" ? row.groupName : null,
    groupDescription: typeof row.groupDescription === "string" ? row.groupDescription : null,
    groupSortOrder: Number.isFinite(Number(row.groupSortOrder)) ? Number(row.groupSortOrder) : null,
    groupSystemKey: typeof row.groupSystemKey === "string" ? row.groupSystemKey : null,
    buttonLane: typeof row.buttonLane === "string" ? row.buttonLane : null,
  };
}

function mapSavedLane(row: Record<string, unknown>): SavedLane | null {
  const lane = normalizeStageStatusLane(typeof row.lane === "string" ? row.lane : "");
  if (!lane) return null;
  const stageName = typeof row.stageName === "string" ? row.stageName : "";
  const statusId = typeof row.statusId === "string" ? row.statusId : "";
  if (!stageName || !statusId) return null;
  return {
    stageName,
    statusId,
    lane,
    sortOrder: Number(row.sortOrder ?? 0),
    workflowId: typeof row.workflowId === "string" && row.workflowId ? row.workflowId : null,
    noteId: typeof row.noteId === "string" && row.noteId ? row.noteId : null,
    note: typeof row.note === "string" && row.note.trim() ? row.note.trim() : null,
  };
}

function mapStageNotes(rows: unknown): StageNote[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const stageName = typeof record.stageName === "string" ? record.stageName : "";
    const body = typeof record.body === "string" ? record.body.trim() : "";
    if (!id || !stageName || !body) return [];
    return [
      {
        id,
        stageName,
        body,
        workflowId: typeof record.workflowId === "string" && record.workflowId ? record.workflowId : null,
      },
    ];
  });
}



export default function CandidateStatusesPanel() {
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  const [savedLanes, setSavedLanes] = useState<SavedLane[]>([]);
  const [reasonCodes, setReasonCodes] = useState<ReasonCodeRow[]>([]);
  const [sharedButtonLabels, setSharedButtonLabels] = useState<SharedButtonLabels>({
    alternate: null,
    closed: null,
  });
  const [buttonLabelDraft, setButtonLabelDraft] = useState({
    alternate: "",
    closed: "",
  });
  const [stageNotes, setStageNotes] = useState<StageNote[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([]);
  const [workflowScopeId, setWorkflowScopeId] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );
  const [configStage, setConfigStage] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [statusRes, assignRes] = await Promise.all([
        fetch("/api/admin/application-statuses", { cache: "no-store" }),
        fetch("/api/admin/application-status-stage-assignments", { cache: "no-store" }),
      ]);
      const statusPayload = await statusRes.json().catch(() => ({}));
      const assignPayload = await assignRes.json().catch(() => ({}));
      if (!statusRes.ok) throw new Error(statusPayload.error || "Failed to load statuses");
      if (!assignRes.ok) throw new Error(assignPayload.error || "Failed to load stage assignments");

      setStatuses(((statusPayload.statuses ?? []) as Array<Record<string, unknown>>).map(mapStatus));
      setSavedLanes(
        ((assignPayload.lanes ?? []) as Array<Record<string, unknown>>)
          .map(mapSavedLane)
          .filter((row): row is SavedLane => row != null)
      );
      setReasonCodes(
        ((assignPayload.reasonCodes ?? []) as Array<Record<string, unknown>>).flatMap((row) => {
          const mapped = mapReasonCodePayload(row);
          return mapped ? [mapped] : [];
        })
      );
      const loadedLabels = readSharedButtonLabels(assignPayload.buttonLabels);
      setSharedButtonLabels(loadedLabels);
      setButtonLabelDraft({
        alternate: loadedLabels.alternate ?? "",
        closed: loadedLabels.closed ?? "",
      });
      setStageNotes(mapStageNotes(assignPayload.notes));
      setWorkflows(
        ((assignPayload.workflows ?? []) as Array<Record<string, unknown>>).flatMap((row) => {
          const id = typeof row.id === "string" ? row.id : "";
          const name = typeof row.name === "string" ? row.name : "";
          if (!id || !name) return [];
          return [{ id, name, status: typeof row.status === "string" ? row.status : "" }];
        })
      );
      setCanManage(Boolean(statusPayload.canManage || assignPayload.canManage));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load statuses";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const workflowId = workflowScopeId || null;
  const selectedWorkflow = workflows.find((workflow) => workflow.id === workflowScopeId) ?? null;
  const stageViews = useMemo(
    () =>
      PRE_HIRE_FIGMA_STAGES.map((stage) => {
        const view = buildPreHireStageDraft({
          stageName: stage,
          workflowId,
          statuses,
          lanes: savedLanes,
          reasonCodes,
          notes: stageNotes,
        });
        return {
          stage,
          summary: stageSummary(stage),
          inheritsDefault: view.inheritsDefault,
          draft: view.draft,
          counts: {
            happy_path: view.draft.lanes.happy_path.length,
            alternate: view.draft.lanes.alternate.length,
            closed: view.draft.lanes.closed.length,
          },
        };
      }),
    [reasonCodes, savedLanes, stageNotes, statuses, workflowId]
  );
  const reasonSuggestions = useMemo(() => {
    const pool = (lane: ReasonCodeLane) => {
      const defaults = Object.values(
        lane === "alternate" ? DEFAULT_ALTERNATE_REASON_CODES : DEFAULT_CLOSING_REASON_CODES
      ).flat();
      const stored = reasonCodes.filter((row) => row.lane === lane).map((row) => row.code);
      return parseReasonCodeList([...defaults, ...stored]).filter((code) => {
        const preferred = preferredReasonCodeLane(code);
        return preferred == null || preferred === lane;
      });
    };
    return { alternate: pool("alternate"), closed: pool("closed") };
  }, [reasonCodes]);
  const configView = stageViews.find((view) => view.stage === configStage) ?? null;

  function flash(type: "success" | "error", text: string) {
    setSaveMessage({ type, text });
    if (type === "success") toast.success(text);
    else toast.error(text);
  }


  async function saveStageLanes(
    stageName: string,
    lanes: Record<StageStatusLane, LanePlacement[]>,
    workflowId: string | null,
    options?: { quiet?: boolean; nested?: boolean }
  ): Promise<boolean> {
    if (!options?.nested) setSaving(true);
    try {
      const response = await fetch("/api/admin/application-status-stage-assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setLanes",
          stageName,
          workflowId,
          lanes,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to save status order");
      setSavedLanes(
        ((payload.lanes ?? []) as Array<Record<string, unknown>>)
          .map(mapSavedLane)
          .filter((row): row is SavedLane => row != null)
      );
      if (!options?.quiet) flash("success", `Status list saved for ${stageName}`);
      return true;
    } catch (error) {
      if (!options?.quiet) {
        flash("error", error instanceof Error ? error.message : "Failed to save status order");
      }
      return false;
    } finally {
      if (!options?.nested) setSaving(false);
    }
  }

  async function saveSharedButtonLabels() {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/application-status-stage-assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setButtonLabels",
          alternateLabel: buttonLabelDraft.alternate,
          closedLabel: buttonLabelDraft.closed,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to save button names");
      const saved = readSharedButtonLabels(payload.buttonLabels);
      setSharedButtonLabels(saved);
      setButtonLabelDraft({
        alternate: saved.alternate ?? "",
        closed: saved.closed ?? "",
      });
      flash("success", "Button names saved for every stage");
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Failed to save button names");
    } finally {
      setSaving(false);
    }
  }


  async function saveReasonCodes(
    stageName: string,
    codes: string[],
    workflowId: string | null,
    lane: ReasonCodeLane,
    options?: { quiet?: boolean; nested?: boolean }
  ): Promise<boolean> {
    if (!options?.nested) setSaving(true);
    try {
      const response = await fetch("/api/admin/application-status-stage-assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setReasonCodes",
          stageName,
          workflowId,
          lane,
          codes,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to save reason codes");
      setReasonCodes(
        ((payload.reasonCodes ?? []) as Array<Record<string, unknown>>).flatMap((row) => {
          const mapped = mapReasonCodePayload(row);
          return mapped ? [mapped] : [];
        })
      );
      if (!options?.quiet) {
        flash(
          "success",
          `${lane === "alternate" ? "Alternate" : "Closing"} reason codes saved for ${stageName}`
        );
      }
      return true;
    } catch (error) {
      if (!options?.quiet) {
        flash("error", error instanceof Error ? error.message : "Failed to save reason codes");
      }
      return false;
    } finally {
      if (!options?.nested) setSaving(false);
    }
  }

  async function persistStageConfiguration(draft: StageConfigDraft) {
    if (!configStage) return;
    setSaving(true);
    setModalError(null);
    try {
      const idByTemp = new Map<string, string>();
      for (const lane of STAGE_STATUS_LANES) {
        for (const status of draft.lanes[lane]) {
          if (!status.isNew || idByTemp.has(status.id)) continue;
          const name = status.name.trim().replace(/\s+/g, " ");
          const existing = statuses.find(
            (row) => row.isActive && row.name.toLowerCase() === name.toLowerCase()
          );
          if (existing) {
            idByTemp.set(status.id, existing.id);
            continue;
          }
          const response = await fetch("/api/admin/application-statuses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            const message = payload.error || "Failed to create status";
            setModalError(message);
            flash("error", message);
            return;
          }
          const created = mapStatus((payload.status ?? {}) as Record<string, unknown>);
          setStatuses((rows) => [...rows.filter((row) => row.id !== created.id), created]);
          idByTemp.set(status.id, created.id);
        }
      }

      const toPlacement = (status: StageConfigDraft["lanes"]["happy_path"][number]) => ({
        statusId: status.isNew ? (idByTemp.get(status.id) ?? "") : status.id,
        noteId: status.noteId,
        note: status.note,
      });
      const lanes = {
        happy_path: draft.lanes.happy_path.map(toPlacement),
        alternate: draft.lanes.alternate.map(toPlacement),
        closed: draft.lanes.closed.map(toPlacement),
      };
      if (STAGE_STATUS_LANES.some((lane) => lanes[lane].some((row) => !row.statusId))) {
        const message = "A new status could not be created.";
        setModalError(message);
        flash("error", message);
        return;
      }

      const lanesOk = await saveStageLanes(configStage, lanes, workflowId, {
        quiet: true,
        nested: true,
      });
      if (!lanesOk) {
        const message = `Could not save statuses for ${configStage}.`;
        setModalError(message);
        flash("error", message);
        return;
      }

      const baseline = buildPreHireStageDraft({
        stageName: configStage,
        workflowId,
        statuses,
        lanes: savedLanes,
        reasonCodes,
        notes: stageNotes,
      }).draft;
      for (const lane of ["alternate", "closed"] as const) {
        if (baseline.reasonCodes[lane].join("\n") === draft.reasonCodes[lane].join("\n")) continue;
        const saved = await saveReasonCodes(configStage, draft.reasonCodes[lane], workflowId, lane, {
          quiet: true,
          nested: true,
        });
        if (!saved) {
          const message = `Statuses were saved, but ${lane === "alternate" ? "alternate" : "closing"} reason codes could not be saved.`;
          setModalError(message);
          flash("error", message);
          return;
        }
      }

      flash("success", `${configStage} updated`);
      setConfigStage(null);
    } finally {
      setSaving(false);
    }
  }



  return (
    <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm sm:p-6">
      {saveMessage ? (
        <div
          role="status"
          className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
            saveMessage.type === "success"
              ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]"
              : "border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]"
          }`}
        >
          {saveMessage.text}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-[#64748B]">Loading status catalog…</p>
      ) : loadError ? (
        <div className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-3 text-sm text-[#991B1B]">
          <p>Could not load status catalog: {loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 rounded-md border border-[#FECACA] bg-white px-3 py-1.5 text-xs font-medium text-[#991B1B]"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold tracking-tight text-[#012352]">
                  Pre-Hire workflow status catalog
                </h3>
                <p className="mt-1 max-w-xl text-xs leading-5 text-[#64748B]">
                  Stages in workflow order. Open a stage to edit its statuses. Button names are separate and apply to every stage.
                </p>
              </div>
              <label className="block shrink-0 text-xs font-medium text-[#334155] sm:w-56" htmlFor="status-workflow-scope">
                Workflow
                <select
                  id="status-workflow-scope"
                  value={workflowScopeId}
                  disabled={Boolean(configStage)}
                  onChange={(event) => setWorkflowScopeId(event.target.value)}
                  className="mt-1 h-8 w-full rounded-md border border-[#CBD5E1] bg-white px-2.5 text-sm font-normal disabled:bg-[#F1F5F9]"
                >
                  <option value="">All workflows</option>
                  {workflows.map((workflow) => (
                    <option key={workflow.id} value={workflow.id}>
                      {workflow.name}
                      {workflow.status && workflow.status !== "published" ? ` (${workflow.status})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <ol className="mt-3 divide-y divide-[#EEF2F6] overflow-hidden rounded-xl border border-[#E2E8F0]">
              {stageViews.map((view, index) => (
                <li key={view.stage} className="flex items-center gap-3 bg-white px-3 py-2.5">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] text-[11px] font-semibold tabular-nums text-[#012352]">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#0F172A]">{view.stage}</p>
                        <p className="truncate text-xs text-[#64748B]">{view.summary}</p>
                      </div>
                      <StatusCountPills counts={view.counts} />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setModalError(null);
                      setConfigStage(view.stage);
                    }}
                    aria-label={`Configure ${view.stage}`}
                    className="inline-flex h-8 shrink-0 items-center rounded-md border border-[#CBD5E1] bg-white px-2.5 text-xs font-semibold text-[#012352] transition hover:bg-[#F8FAFC]"
                  >
                    Configure
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
            <h3 className="text-sm font-semibold text-[#012352]">Application button labels</h3>
            <p className="mt-1 text-xs leading-5 text-[#64748B]">
              Shared names for the follow-up and close buttons on every stage. These are not statuses.
              Leave a name blank to use the status configured for that action.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-[#334155]" htmlFor="shared-alternate-button-label">
                Follow-up button
                <input
                  id="shared-alternate-button-label"
                  value={buttonLabelDraft.alternate}
                  disabled={!canManage || saving}
                  maxLength={60}
                  placeholder="Status name from the catalog"
                  onChange={(event) =>
                    setButtonLabelDraft((current) => ({ ...current, alternate: event.target.value }))
                  }
                  className="mt-1 h-8 w-full rounded-md border border-[#CBD5E1] bg-white px-2.5 text-sm font-normal disabled:bg-[#F1F5F9]"
                />
              </label>
              <label className="block text-xs font-medium text-[#334155]" htmlFor="shared-closed-button-label">
                Close button
                <input
                  id="shared-closed-button-label"
                  value={buttonLabelDraft.closed}
                  disabled={!canManage || saving}
                  maxLength={60}
                  placeholder="Status name from the catalog"
                  onChange={(event) =>
                    setButtonLabelDraft((current) => ({ ...current, closed: event.target.value }))
                  }
                  className="mt-1 h-8 w-full rounded-md border border-[#CBD5E1] bg-white px-2.5 text-sm font-normal disabled:bg-[#F1F5F9]"
                />
              </label>
            </div>
            {canManage ? (
              <button
                type="button"
                disabled={
                  saving ||
                  (buttonLabelDraft.alternate.trim() === (sharedButtonLabels.alternate ?? "") &&
                    buttonLabelDraft.closed.trim() === (sharedButtonLabels.closed ?? ""))
                }
                onClick={() => void saveSharedButtonLabels()}
                className="mt-3 inline-flex h-8 items-center rounded-md bg-[#012352] px-3 text-sm font-medium text-white disabled:opacity-50"
              >
                Save button names
              </button>
            ) : (
              <p className="mt-3 text-xs text-[#64748B]">Only administrators can rename these buttons.</p>
            )}
          </div>
        </div>
      )}
      {configView ? (
        <StageConfigModal
          key={`${configView.stage}:${workflowId ?? "default"}`}
          stage={configView.stage}
          summary={configView.summary}
          initial={configView.draft}
          catalog={statuses
            .filter((status) => status.isActive)
            .map((status) => ({ id: status.id, name: status.name }))}
          reasonSuggestions={reasonSuggestions}
          canManage={canManage}
          saving={saving}
          saveError={modalError}
          inheritsDefault={configView.inheritsDefault}
          workflowName={workflowId ? (selectedWorkflow?.name ?? "This workflow") : "All workflows"}
          onClose={() => {
            setModalError(null);
            setConfigStage(null);
          }}
          onSave={(draft) => void persistStageConfiguration(draft)}
        />
      ) : null}
    </section>
  );
}

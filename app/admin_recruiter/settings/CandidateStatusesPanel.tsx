"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronDown, Plus, Pencil, Layers3, X } from "lucide-react";
import toast from "react-hot-toast";
import {
  APPLICATION_STATUS_GROUP_KEYS,
  formatGroupStatusSummary,
  groupStatuses,
  isSharedClosedGroupKey,
} from "@/lib/jobs/application-statuses/groups";
import {
  normalizeStageStatusLane,
  resolveConfiguredStageStatusLanes,
  resolveStageStatusLanes,
  selectWorkflowScopedLaneRows,
  applyStageButtonVisibility,
  type SavedStageStatusLane,
  type StageStatusLane,
} from "@/lib/jobs/application-statuses/stage-status-lanes";
import { reasonCodeLaneOf, type ReasonCodeLane } from "@/lib/jobs/application-statuses/stage-reason-codes";
import { StageStatusLaneEditor, type LanePlacement, type LaneStatus } from "./StageStatusLaneEditor";
import { HIRE_STAGE_BY_STEP_KEY } from "@/lib/onboarding/hire-stage-catalog";
import { PRE_HIRE_FIGMA_STAGES } from "@/lib/onboarding/hire-stage-groups";

type StatusGroup = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  systemKey: string | null;
};

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

type GroupStageAssignment = {
  id: string;
  stageName: string;
  groupId: string;
  sortOrder: number;
};

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

type StageButtonPref = {
  stageName: string;
  workflowId: string | null;
  showAlternate: boolean;
  showClosed: boolean;
};

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

const PIPELINE_GROUP_KEYS = new Set<string>(APPLICATION_STATUS_GROUP_KEYS);
const fieldClass = "h-9 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm";

function statusesForGroup(statuses: StatusItem[], groupId: string): StatusItem[] {
  return statuses
    .filter((status) => status.groupId === groupId)
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
    });
}

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

function mapGroup(row: Record<string, unknown>): StatusGroup {
  return {
    id: String(row.id),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    sortOrder: Number(row.sortOrder ?? 0),
    systemKey: (row.systemKey as string | null) ?? null,
  };
}

function mapAssignment(row: Record<string, unknown>): GroupStageAssignment {
  return {
    id: String(row.id),
    stageName: String(row.stageName),
    groupId: String(row.groupId),
    sortOrder: Number(row.sortOrder ?? 0),
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

function mapButtonPrefs(rows: unknown): StageButtonPref[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const stageName = typeof record.stageName === "string" ? record.stageName : "";
    if (!stageName) return [];
    return [
      {
        stageName,
        workflowId: typeof record.workflowId === "string" && record.workflowId ? record.workflowId : null,
        showAlternate: record.showAlternate !== false,
        showClosed: record.showClosed !== false,
      },
    ];
  });
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

function decorateLane(
  statuses: Array<{ id: string; name: string }>,
  savedByStatus: Map<string, { noteId: string | null; note: string | null }>
): LaneStatus[] {
  return statuses.map((status) => {
    const saved = savedByStatus.get(status.id);
    return {
      id: status.id,
      name: status.name,
      noteId: saved?.noteId ?? null,
      note: saved?.note ?? null,
    };
  });
}

function preHireStepsByStage(): Array<{ stage: string; steps: string[] }> {
  const buckets = new Map<string, string[]>();
  for (const stage of PRE_HIRE_FIGMA_STAGES) {
    buckets.set(stage, []);
  }
  for (const [stepKey, stageName] of Object.entries(HIRE_STAGE_BY_STEP_KEY)) {
    if (!buckets.has(stageName)) continue;
    buckets.get(stageName)!.push(stepKey);
  }
  return PRE_HIRE_FIGMA_STAGES.map((stage) => ({
    stage,
    steps: (buckets.get(stage) ?? []).sort(),
  }));
}

function GroupStatusManager({
  groupId,
  groupName,
  statuses,
  groups,
  saving,
  onAdd,
  onSave,
  onDelete,
  onMove,
}: {
  groupId: string;
  groupName: string;
  statuses: StatusItem[];
  groups: StatusGroup[];
  saving: boolean;
  onAdd: (groupId: string, name: string, description: string) => Promise<boolean>;
  onSave: (statusId: string, name: string, description: string) => Promise<boolean>;
  onDelete: (status: StatusItem) => Promise<void>;
  onMove: (statusId: string, groupId: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {statuses.length === 0 ? (
          <li className="text-xs text-[#94A3B8]">No statuses in this group yet.</li>
        ) : (
          statuses.map((status) => (
            <li
              key={status.id}
              className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2"
            >
              {editingId === status.id ? (
                <div className="flex flex-col gap-2">
                  <input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    className={fieldClass}
                    placeholder="Status name"
                    aria-label={`Name for ${status.name}`}
                  />
                  <input
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                    className={fieldClass}
                    placeholder="Description (optional)"
                    aria-label={`Description for ${status.name}`}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        void onSave(status.id, editName, editDescription).then((saved) => {
                          if (saved) setEditingId(null);
                        });
                      }}
                      className="rounded-lg bg-[#012352] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setEditingId(null)}
                      className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs font-medium text-[#334155]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0F172A]">
                      {status.name}
                      {!status.isActive ? (
                        <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-[#94A3B8]">
                          Inactive
                        </span>
                      ) : null}
                    </p>
                    {status.description ? (
                      <p className="mt-0.5 text-xs text-[#64748B]">{status.description}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <label className="sr-only" htmlFor={`move-${groupId}-${status.id}`}>
                      Move {status.name} to another group
                    </label>
                    <select
                      id={`move-${groupId}-${status.id}`}
                      value={status.groupId ?? ""}
                      disabled={saving}
                      onChange={(event) => void onMove(status.id, event.target.value)}
                      className="h-8 rounded-md border border-[#CBD5E1] bg-white px-2 text-xs text-[#334155]"
                    >
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setEditingId(status.id);
                        setEditName(status.name);
                        setEditDescription(status.description ?? "");
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-[#CBD5E1] bg-white px-2 py-1 text-xs text-[#334155]"
                    >
                      <Pencil className="h-3 w-3" aria-hidden />
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={saving || status.isDefault}
                      onClick={() => {
                        const confirmed = window.confirm(`Delete "${status.name}" from ${groupName}?`);
                        if (!confirmed) return;
                        void onDelete(status);
                      }}
                      className="rounded-md border border-[#FECACA] bg-white px-2 py-1 text-xs text-[#991B1B] disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))
        )}
      </ul>

      <div className="space-y-2 rounded-lg border border-dashed border-[#CBD5E1] bg-white p-3">
        <p className="text-sm font-semibold text-[#0F172A]">Add status to {groupName}</p>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={fieldClass}
          placeholder="Name"
          aria-label={`New status name for ${groupName}`}
        />
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className={fieldClass}
          placeholder="Description (optional)"
          aria-label={`New status description for ${groupName}`}
        />
        <button
          type="button"
          disabled={saving || !name.trim()}
          onClick={() => {
            void onAdd(groupId, name, description).then((saved) => {
              if (!saved) return;
              setName("");
              setDescription("");
            });
          }}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#012352] px-3 text-sm font-medium text-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add status
        </button>
      </div>
    </div>
  );
}

function ReasonCodeEditor({
  codes,
  presets,
  canManage,
  saving,
  onSave,
  detail,
  listId,
}: {
  codes: string[];
  presets: string[];
  canManage: boolean;
  saving: boolean;
  onSave: (codes: string[]) => void;
  detail: string;
  listId: string;
}) {
  const [items, setItems] = useState(codes);
  const [query, setQuery] = useState("");
  const savedKey = codes.join("\n");

  useEffect(() => {
    setItems(savedKey ? savedKey.split("\n").filter(Boolean) : []);
  }, [savedKey]);

  const typed = query.trim().replace(/\s+/g, " ");
  const suggestions = presets.filter((preset) => {
    if (items.some((item) => item.toLowerCase() === preset.toLowerCase())) return false;
    if (!typed) return true;
    return preset.toLowerCase().includes(typed.toLowerCase());
  });
  const alreadyListed = items.some((item) => item.toLowerCase() === typed.toLowerCase());
  const presetMatch = presets.find((preset) => preset.toLowerCase() === typed.toLowerCase());

  function addNote(value: string) {
    const next = value.trim().replace(/\s+/g, " ");
    if (!next) return;
    const existing =
      presets.find((preset) => preset.toLowerCase() === next.toLowerCase()) ??
      items.find((item) => item.toLowerCase() === next.toLowerCase());
    const note = existing ?? next;
    if (items.some((item) => item.toLowerCase() === note.toLowerCase())) {
      setQuery("");
      return;
    }
    const nextItems = [...items, note];
    setItems(nextItems);
    setQuery("");
    onSave(nextItems);
  }

  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#012352]">
        Reason codes
      </p>
      <p className="mt-0.5 text-[11px] leading-4 text-[#64748B]">{detail}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-[#94A3B8]">No reason codes on this stage.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li key={item} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs text-[#0F172A]">
              {item}
              {canManage ? (
                <button
                  type="button"
                  aria-label={`Remove ${item}`}
                  disabled={saving}
                  onClick={() => {
                    const nextItems = items.filter((note) => note !== item);
                    setItems(nextItems);
                    onSave(nextItems);
                  }}
                  className="text-[#64748B]"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        <div className="mt-2 space-y-2">
          <input
            value={query}
            disabled={saving}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addNote(typed);
              }
            }}
            list={`reason-presets-${listId}`}
            placeholder="Type a reason code"
            aria-label="Add a reason code"
            className="h-9 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm"
          />
          {typed && suggestions.length > 0 ? (
            <ul className="max-h-32 overflow-auto rounded-lg border border-[#E2E8F0] bg-white">
              {suggestions.slice(0, 8).map((preset) => (
                <li key={preset}>
                  <button
                    type="button"
                    onClick={() => addNote(preset)}
                    className="block w-full px-3 py-1.5 text-left text-sm text-[#0F172A] hover:bg-[#F8FAFC]"
                  >
                    {preset}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            disabled={saving || !typed || alreadyListed}
            onClick={() => addNote(typed)}
            className="inline-flex h-8 items-center rounded-md border border-[#CBD5E1] bg-white px-3 text-xs font-medium text-[#334155] disabled:opacity-50"
          >
            {presetMatch ? "Reuse reason code" : "Add reason code"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function StageAssignmentCard({
  stage,
  detail,
  stageGroups,
  open,
  available,
  canManage,
  saving,
  assignValue,
  closedSummary,
  onToggle,
  onKeyDown,
  onAssignValue,
  onAssign,
  onRemove,
  statusSummary,
  laneEditor,
  categoriesOnly,
  categorySummary,
}: {
  stage: string;
  detail: string;
  stageGroups: StatusGroup[];
  open: boolean;
  available: StatusGroup[];
  canManage: boolean;
  saving: boolean;
  assignValue: string;
  closedSummary: string;
  onToggle: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onAssignValue: (value: string) => void;
  onAssign: () => void;
  onRemove: (groupId: string) => void;
  statusSummary: (groupId: string, limit?: number) => string;
  laneEditor?: ReactNode;
  categoriesOnly?: boolean;
  categorySummary?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={onKeyDown}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#012352]"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[#012352]">{stage}</span>
          <span className="mt-0.5 block text-xs text-[#64748B]">
            {categoriesOnly
              ? categorySummary || "Primary, alternate, and closing"
              : stageGroups.length > 0
                ? stageGroups.map((group) => group.name).join(", ")
                : "No groups assigned yet"}
            {categoriesOnly ? "" : " · + Closed shared"}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-[#64748B]">
          {categoriesOnly ? null : stageGroups.length}
          <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} aria-hidden />
        </span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-[#E2E8F0] bg-white px-4 py-3">
          {laneEditor}

          {categoriesOnly ? null : (
            <>
          <p className="text-[11px] leading-5 text-[#94A3B8]">{detail}</p>

          {stageGroups.length === 0 ? (
            <p className="text-sm text-[#94A3B8]">
              No status groups on this stage yet. Closed still applies here.
            </p>
          ) : (
            <ul className="space-y-2">
              {stageGroups.map((group) => (
                <li
                  key={`${stage}-${group.id}`}
                  className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#0F172A]">{group.name}</p>
                      <p className="mt-0.5 text-xs text-[#64748B]">{statusSummary(group.id)}</p>
                    </div>
                    {canManage ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => onRemove(group.id)}
                        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-[#CBD5E1] bg-white px-2 text-xs text-[#334155] disabled:opacity-50"
                      >
                        <X className="h-3 w-3" aria-hidden />
                        Remove group
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-lg border border-dashed border-[#FCD34D] bg-[#FFFBEB] px-2.5 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#92400E]">
              Also on this stage — Closed (shared)
            </p>
            <p className="mt-1 text-xs text-[#A16207]">{closedSummary}</p>
          </div>

          {canManage ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="sr-only" htmlFor={`assign-group-${stage}`}>
                Assign status group to {stage}
              </label>
              <select
                id={`assign-group-${stage}`}
                value={assignValue}
                disabled={saving || available.length === 0}
                onChange={(event) => onAssignValue(event.target.value)}
                className="h-10 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm sm:flex-1"
              >
                <option value="">
                  {available.length === 0
                    ? "All assignable groups already on this stage"
                    : "Select a status group…"}
                </option>
                {available.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                    {group.description ? ` — ${statusSummary(group.id, 3)}` : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={saving || !assignValue}
                onClick={onAssign}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#012352] px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Assign group
              </button>
            </div>
          ) : (
            <p className="text-xs text-[#64748B]">
              Only administrators can assign status groups to stages.
            </p>
          )}
            </>
          )}
          {categoriesOnly ? (
            <p className="text-[11px] leading-5 text-[#94A3B8]">{detail}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CatalogSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-[#012352]">
          <Layers3 className="h-4 w-4 shrink-0" aria-hidden />
          {title}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#64748B] transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open ? <div className="space-y-2 border-t border-[#E2E8F0] px-4 py-3">{children}</div> : null}
    </div>
  );
}

export default function CandidateStatusesPanel() {
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  const [groups, setGroups] = useState<StatusGroup[]>([]);
  const [assignments, setAssignments] = useState<GroupStageAssignment[]>([]);
  const [savedLanes, setSavedLanes] = useState<SavedLane[]>([]);
  const [reasonCodes, setReasonCodes] = useState<ReasonCodeRow[]>([]);
  const [buttonPrefs, setButtonPrefs] = useState<StageButtonPref[]>([]);
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
  const [openStage, setOpenStage] = useState<string | null>(null);
  const [assignPicker, setAssignPicker] = useState<Record<string, string>>({});
  const [managingGroupIds, setManagingGroupIds] = useState<Set<string>>(() => new Set());
  const [openCatalogs, setOpenCatalogs] = useState<Set<string>>(() => new Set());
  const [openGroupIds, setOpenGroupIds] = useState<Set<string>>(() => new Set());
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [draftGroupName, setDraftGroupName] = useState("");
  const [draftGroupNotes, setDraftGroupNotes] = useState("");
  const [draftGroupStatuses, setDraftGroupStatuses] = useState<Array<{ name: string; note: string }>>([
    { name: "", note: "" },
  ]);

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

      const nextGroups = ((statusPayload.groups ?? []) as Array<Record<string, unknown>>)
        .map(mapGroup)
        .filter((group) => !group.systemKey || PIPELINE_GROUP_KEYS.has(group.systemKey));
      setGroups(nextGroups);
      setStatuses(((statusPayload.statuses ?? []) as Array<Record<string, unknown>>).map(mapStatus));
      setAssignments(
        ((assignPayload.assignments ?? []) as Array<Record<string, unknown>>).map(mapAssignment)
      );
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
      setButtonPrefs(mapButtonPrefs(assignPayload.buttonPrefs));
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

  const workflowStages = useMemo(() => preHireStepsByStage(), []);
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);

  const assignableGroups = useMemo(
    () => groups.filter((group) => !isSharedClosedGroupKey(group.systemKey)),
    [groups]
  );

  const closedGroup = useMemo(
    () => groups.find((group) => isSharedClosedGroupKey(group.systemKey)) ?? null,
    [groups]
  );

  const closedStatuses = useMemo(
    () =>
      statuses.filter(
        (status) =>
          status.isActive &&
          (isSharedClosedGroupKey(status.groupSystemKey) ||
            status.groupId === closedGroup?.id)
      ),
    [statuses, closedGroup]
  );

  const groupsByStage = useMemo(() => {
    const map = new Map<string, StatusGroup[]>();
    for (const stage of PRE_HIRE_FIGMA_STAGES) map.set(stage, []);
    for (const row of [...assignments].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const group = groupById.get(row.groupId);
      if (!group || isSharedClosedGroupKey(group.systemKey)) continue;
      map.get(row.stageName)?.push(group);
    }
    return map;
  }, [assignments, groupById]);

  const statusesInGroup = useCallback(
    (groupId: string) =>
      statuses
        .filter((status) => status.groupId === groupId && status.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [statuses]
  );

  const sections = useMemo(() => {
    const pipelineGroups = groups.filter(
      (group) => !group.systemKey || PIPELINE_GROUP_KEYS.has(group.systemKey)
    );
    const grouped = groupStatuses(statuses);
    const catalogSections = grouped.filter(
      (section) =>
        section.name === "Ungrouped" ||
        pipelineGroups.some((group) => group.id === section.id) ||
        PIPELINE_GROUP_KEYS.has(section.name.toLowerCase())
    );
    const present = new Set(catalogSections.map((section) => section.id).filter(Boolean));
    const emptyGroups = pipelineGroups
      .filter((group) => !present.has(group.id))
      .map((group) => ({
        key: group.id,
        id: group.id,
        name: group.name,
        description: group.description,
        sortOrder: group.sortOrder,
        systemKey: group.systemKey,
        shared: isSharedClosedGroupKey(group.systemKey),
        statuses: [] as StatusItem[],
      }));
    return [...catalogSections, ...emptyGroups].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
    );
  }, [groups, statuses]);

  function flash(type: "success" | "error", text: string) {
    setSaveMessage({ type, text });
    if (type === "success") toast.success(text);
    else toast.error(text);
  }

  async function assignGroup(stageName: string, groupId: string) {
    if (!groupId) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/application-status-stage-assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign", stageName, groupId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to assign group");
      setAssignments(((payload.assignments ?? []) as Array<Record<string, unknown>>).map(mapAssignment));
      setAssignPicker((current) => ({ ...current, [stageName]: "" }));
      flash("success", `Group assigned to ${stageName}`);
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Failed to assign group");
    } finally {
      setSaving(false);
    }
  }

  async function saveStageLanes(
    stageName: string,
    lanes: Record<StageStatusLane, LanePlacement[]>,
    workflowId: string | null,
    options?: { quiet?: boolean }
  ): Promise<boolean> {
    setSaving(true);
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
      setButtonPrefs(mapButtonPrefs(payload.buttonPrefs));
      if (!options?.quiet) flash("success", `Status list saved for ${stageName}`);
      return true;
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Failed to save status order");
      return false;
    } finally {
      setSaving(false);
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

  async function addLaneStatus(
    stageName: string,
    workflowId: string | null,
    lane: StageStatusLane,
    input: { name: string; statusId: string },
    current: Record<StageStatusLane, LanePlacement[]>
  ) {
    const name = input.name.trim().replace(/\s+/g, " ");
    let statusId = input.statusId;
    if (name) {
      const existing = statuses.find(
        (status) => status.isActive && status.name.toLowerCase() === name.toLowerCase()
      );
      if (existing) {
        const alreadyPlaced = (Object.values(current) as LanePlacement[][]).some((rows) =>
          rows.some((row) => row.statusId === existing.id)
        );
        if (alreadyPlaced) {
          flash("error", `${existing.name} is already on this stage.`);
          return;
        }
        statusId = existing.id;
      } else {
        const response = await fetch("/api/admin/application-statuses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          flash("error", payload.error || "Failed to create status");
          return;
        }
        const created = mapStatus((payload.status ?? {}) as Record<string, unknown>);
        setStatuses((rows) => [...rows.filter((row) => row.id !== created.id), created]);
        statusId = created.id;
      }
    }
    if (!statusId) {
      flash("error", "Enter a status name or choose an existing status.");
      return;
    }
    const saved = await saveStageLanes(
      stageName,
      {
        ...current,
        [lane]: [
          ...current[lane].filter((row) => row.statusId !== statusId),
          { statusId, noteId: null, note: null },
        ],
      },
      workflowId,
      { quiet: true }
    );
    if (!saved) return;
    flash("success", `${name || "Status"} added to ${stageName}.`);
  }

  async function saveReasonCodes(
    stageName: string,
    lane: ReasonCodeLane,
    codes: string[],
    workflowId: string | null
  ) {
    setSaving(true);
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
      flash(
        "success",
        `${lane === "closed" ? "Closing" : "Alternate"} reason codes saved for ${stageName}`
      );
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Failed to save reason codes");
    } finally {
      setSaving(false);
    }
  }

  async function removeGroup(stageName: string, groupId: string) {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/application-status-stage-assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unassign", stageName, groupId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to remove group");
      setAssignments(((payload.assignments ?? []) as Array<Record<string, unknown>>).map(mapAssignment));
      flash("success", `Group removed from ${stageName}`);
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Failed to remove group");
    } finally {
      setSaving(false);
    }
  }

  function upsertStatus(row: Record<string, unknown>) {
    const next = mapStatus(row);
    setStatuses((current) => {
      const index = current.findIndex((status) => status.id === next.id);
      if (index < 0) return [...current, next];
      const copy = [...current];
      copy[index] = next;
      return copy;
    });
  }

  async function addStatus(groupId: string, name: string, description: string): Promise<boolean> {
    if (!name.trim()) {
      flash("error", "Status name is required");
      return false;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/application-statuses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          groupId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to create status");
      if (payload.status && typeof payload.status === "object") {
        upsertStatus(payload.status as Record<string, unknown>);
      }
      flash("success", "Status created");
      return true;
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Failed to create status");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveStatus(statusId: string, name: string, description: string): Promise<boolean> {
    if (!name.trim()) {
      flash("error", "Status name is required");
      return false;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/application-statuses/${encodeURIComponent(statusId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to update status");
      if (payload.status && typeof payload.status === "object") {
        upsertStatus(payload.status as Record<string, unknown>);
      }
      flash("success", "Status updated");
      return true;
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Failed to update status");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function deleteStatus(status: StatusItem) {
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/application-statuses/${encodeURIComponent(status.id)}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Failed to delete status");
      setStatuses((current) => current.filter((row) => row.id !== status.id));
      flash("success", "Status deleted");
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Failed to delete status");
    } finally {
      setSaving(false);
    }
  }

  async function moveToGroup(statusId: string, groupId: string) {
    if (!groupId) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/application-statuses/${encodeURIComponent(statusId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to move status");
      if (payload.status && typeof payload.status === "object") {
        upsertStatus(payload.status as Record<string, unknown>);
      }
      flash("success", "Status moved to its group");
    } catch (error) {
      flash("error", error instanceof Error ? error.message : "Failed to move status");
    } finally {
      setSaving(false);
    }
  }

  function toggleCatalog(id: string) {
    setOpenCatalogs((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroupCard(id: string) {
    setOpenGroupIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createGroup() {
    const name = draftGroupName.trim();
    if (!name) {
      flash("error", "Group name is required");
      return;
    }
    const notes = draftGroupStatuses
      .map((row) => ({ name: row.name.trim(), note: row.note.trim() }))
      .filter((row) => row.name);
    let groupCreated = false;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/application-status-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: draftGroupNotes.trim() || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to create status group");
      const group = mapGroup(payload.group as Record<string, unknown>);
      setGroups((current) => [...current, group].sort((a, b) => a.sortOrder - b.sortOrder));
      groupCreated = true;
      for (const note of notes) {
        const statusResponse = await fetch("/api/admin/application-statuses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: note.name,
            description: note.note || null,
            groupId: group.id,
          }),
        });
        const statusPayload = await statusResponse.json();
        if (!statusResponse.ok) {
          throw new Error(statusPayload.error || `Failed to add ${note.name}`);
        }
        if (statusPayload.status && typeof statusPayload.status === "object") {
          upsertStatus(statusPayload.status as Record<string, unknown>);
        }
      }
      setOpenGroupIds((current) => new Set(current).add(group.id));
      setDraftGroupName("");
      setDraftGroupNotes("");
      setDraftGroupStatuses([{ name: "", note: "" }]);
      setAddGroupOpen(false);
      flash("success", notes.length > 0 ? "Status group created with its statuses" : "Status group created");
    } catch (error) {
      flash(
        "error",
        groupCreated
          ? error instanceof Error
            ? `${error.message} The group was still created.`
            : "The group was created, but a status could not be added."
          : error instanceof Error
            ? error.message
            : "Failed to create status group"
      );
      if (!groupCreated) return;
      setDraftGroupName("");
      setDraftGroupNotes("");
      setDraftGroupStatuses([{ name: "", note: "" }]);
      setAddGroupOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function toggleStage(stage: string) {
    setOpenStage((current) => (current === stage ? null : stage));
  }

  function onStageKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, stage: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleStage(stage);
    }
  }

  function stageCard(stage: string, detail: string, options?: { categories?: boolean; workflowId?: string | null }) {
    const categories = options?.categories === true;
    const workflowId = options?.workflowId ?? null;
    const stageGroups = groupsByStage.get(stage) ?? [];
    const assignedIds = new Set(stageGroups.map((group) => group.id));
    const stageLaneRows = savedLanes.filter((row) => row.stageName === stage);
    const pickedLanes = selectWorkflowScopedLaneRows(stageLaneRows, workflowId);
    const activeStatuses = statuses.filter((status) => status.isActive);
    const rawLanes =
      pickedLanes.source === "none"
        ? resolveStageStatusLanes(
            activeStatuses,
            stageGroups.map((group) => group.id),
            []
          )
        : resolveConfiguredStageStatusLanes(activeStatuses, pickedLanes.rows);
    const pickedButtons = selectWorkflowScopedLaneRows(
      buttonPrefs.filter((row) => row.stageName === stage),
      workflowId
    );
    const buttonPref = pickedButtons.source === "none" ? null : pickedButtons.rows[0];
    const lanes = applyStageButtonVisibility(rawLanes, buttonPref);
    const scopedNotes = stageNotes.filter(
      (row) => row.stageName === stage && (row.workflowId ?? null) === (workflowId ?? null)
    );
    const noteBodyById = new Map(scopedNotes.map((row) => [row.id, row.body]));
    const savedByStatus = new Map(
      pickedLanes.rows.map((row) => [
        row.statusId,
        {
          noteId: row.noteId,
          note: row.note ?? (row.noteId ? (noteBodyById.get(row.noteId) ?? null) : null),
        },
      ])
    );
    const editorLanes = {
      happy_path: decorateLane(lanes.happy_path, savedByStatus),
      alternate: decorateLane(lanes.alternate, savedByStatus),
      closed: decorateLane(lanes.closed, savedByStatus),
    };
    const placements: Record<StageStatusLane, LanePlacement[]> = {
      happy_path: editorLanes.happy_path.map((status) => ({
        statusId: status.id,
        noteId: status.noteId,
        note: status.note,
      })),
      alternate: editorLanes.alternate.map((status) => ({
        statusId: status.id,
        noteId: status.noteId,
        note: status.note,
      })),
      closed: editorLanes.closed.map((status) => ({
        statusId: status.id,
        noteId: status.noteId,
        note: status.note,
      })),
    };
    const stageReasonRows = reasonCodes.filter((row) => row.stageName === stage);
    const categorySummary = `Primary ${lanes.happy_path.length} · Alternate ${lanes.alternate.length} · Closing ${lanes.closed.length}`;
    return (
      <StageAssignmentCard
        key={`${workflowId ?? "default"}-${stage}`}
        stage={stage}
        detail={detail}
        stageGroups={stageGroups}
        open={openStage === stage}
        available={assignableGroups.filter((group) => !assignedIds.has(group.id))}
        canManage={canManage}
        saving={saving}
        assignValue={assignPicker[stage] ?? ""}
        closedSummary={formatGroupStatusSummary(
          closedStatuses.map((status) => status.name),
          8
        )}
        onToggle={() => toggleStage(stage)}
        onKeyDown={(event) => onStageKeyDown(event, stage)}
        onAssignValue={(value) =>
          setAssignPicker((current) => ({
            ...current,
            [stage]: value,
          }))
        }
        onAssign={() => void assignGroup(stage, assignPicker[stage] ?? "")}
        onRemove={(groupId) => void removeGroup(stage, groupId)}
        statusSummary={(groupId, limit) =>
          formatGroupStatusSummary(
            statusesInGroup(groupId).map((status) => status.name),
            limit
          )
        }
        categoriesOnly={categories}
        categorySummary={categorySummary}
        laneEditor={
          categories ? (
            <div className="space-y-3">
              {workflowId && pickedLanes.source !== "workflow" ? (
                <p className="text-xs text-[#64748B]">
                  This workflow is using the tenant default. Saving writes a list for this workflow only.
                </p>
              ) : null}
              <StageStatusLaneEditor
                lanes={editorLanes}
                catalog={activeStatuses.map((status) => ({ id: status.id, name: status.name }))}
                canManage={canManage}
                saving={saving}
                onChange={(next) => void saveStageLanes(stage, next, workflowId)}
                onAddStatus={(lane, input) =>
                  void addLaneStatus(stage, workflowId, lane, input, placements)
                }
                laneFooter={(lane) => {
                  if (lane === "happy_path") return null;
                  const laneRows = stageReasonRows.filter((row) => row.lane === lane);
                  const picked = selectWorkflowScopedLaneRows(laneRows, workflowId);
                  const codes = picked.rows.map((row) => row.code);
                  return (
                    <ReasonCodeEditor
                      key={`${workflowId ?? "default"}-${stage}-${lane}`}
                      listId={`${workflowId ?? "default"}-${stage}-${lane}`}
                      codes={codes}
                      presets={codes}
                      canManage={canManage}
                      saving={saving}
                      detail={
                        lane === "closed"
                          ? "Reason codes for the closing action only. They do not appear on alternate."
                          : "Reason codes for the alternate action only. They do not appear when closing."
                      }
                      onSave={(next) => void saveReasonCodes(stage, lane, next, workflowId)}
                    />
                  );
                }}
              />
            </div>
          ) : undefined
        }
      />
    );
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
        <div className="space-y-3">
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-4">
            <h3 className="text-sm font-semibold text-[#012352]">Application buttons</h3>
            <p className="mt-1 text-xs leading-5 text-[#64748B]">
              Leave a name blank to use the alternate or closing status from the catalog. A saved name replaces that status name on every stage.
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
                  className="mt-1 h-10 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm font-normal disabled:bg-[#F1F5F9]"
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
                  className="mt-1 h-10 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm font-normal disabled:bg-[#F1F5F9]"
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
                className="mt-3 inline-flex h-9 items-center rounded-lg bg-[#012352] px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                Save button names
              </button>
            ) : (
              <p className="mt-3 text-xs text-[#64748B]">Only administrators can rename these buttons.</p>
            )}
          </div>
          <CatalogSection
            title="Pre-Hire workflow status catalog"
            open={openCatalogs.has("prehire")}
            onToggle={() => toggleCatalog("prehire")}
          >
            <label className="block text-xs font-medium text-[#334155]" htmlFor="status-workflow-scope">
              Status list scope
            </label>
            <select
              id="status-workflow-scope"
              value={workflowScopeId}
              onChange={(event) => setWorkflowScopeId(event.target.value)}
              className="h-10 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm"
            >
              <option value="">All workflows (tenant default)</option>
              {workflows.map((workflow) => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.name}
                  {workflow.status && workflow.status !== "published" ? ` (${workflow.status})` : ""}
                </option>
              ))}
            </select>
            <p className="text-xs leading-5 text-[#64748B]">
              Each pre-hire workflow can keep its own primary, alternate, and closing statuses. AI Analysis uses this same catalog for the candidate&apos;s current Pre-Hire stage. A stage can omit alternate or closing.
            </p>
            {workflowStages.map(({ stage, steps }) =>
              stageCard(
                stage,
                `Workflow steps: ${steps.length > 0 ? steps.join(", ") : "None mapped"}`,
                { categories: true, workflowId: workflowScopeId || null }
              )
            )}
          </CatalogSection>
        </div>
      )}
    </section>
  );
}

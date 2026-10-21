"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { catalogSavePlan, reasonCodesExcludingStatusNames } from "@/lib/jobs/application-statuses/stage-reason-codes";
import {
  composeStatusChangeNote,
  normalizeStageStatusLane,
  resolveConfiguredStageStatusLanes,
  resolveStageStatusLanes,
  selectWorkflowScopedLaneRows,
  applyStageButtonVisibility,
  resolveStageButtonLabel,
  sequenceOrderedStatuses,
  type SavedStageStatusLane,
  type StageStatusLane,
} from "@/lib/jobs/application-statuses/stage-status-lanes";
import {
  mapApplicationStatusOptions,
  resolveApplicationStatusFromPayload,
  type StatusOption,
} from "./CandidateApplicationStatusControl";

type StageStatusSequenceButtonsProps = {
  applicationId: string;
  stageName: string;
  /**
   * When true, shows “Application status” with the current status name above the
   * action buttons (hire-journey stage panels).
   */
  showCurrentStatus?: boolean;
  onStatusChanged?: (next: { statusName: string; statusId: string }) => void;
  /** Return true when the caller handled a closed status itself. */
  onException?: (status: StatusOption, note: string) => Promise<boolean>;
};

type LaneRow = SavedStageStatusLane & { workflowId: string | null };
type ReasonRow = { code: string; workflowId: string | null };
type NoteRow = { body: string; workflowId: string | null };
type ButtonPref = {
  workflowId: string | null;
  showAlternate: boolean;
  showClosed: boolean;
};

function readSharedButtonLabels(value: unknown): { alternate: string | null; closed: string | null } {
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

export function StageStatusSequenceButtons({
  applicationId,
  stageName,
  showCurrentStatus = false,
  onStatusChanged,
  onException,
}: StageStatusSequenceButtonsProps) {
  const [options, setOptions] = useState<StatusOption[]>([]);
  const [assignedGroupIds, setAssignedGroupIds] = useState<string[] | null>(null);
  const [savedLanes, setSavedLanes] = useState<LaneRow[]>([]);
  const [reasonRows, setReasonRows] = useState<ReasonRow[]>([]);
  const [noteRows, setNoteRows] = useState<NoteRow[]>([]);
  const [workflowName, setWorkflowName] = useState<string | null>(null);
  const [buttonPrefs, setButtonPrefs] = useState<ButtonPref[]>([]);
  const [sharedButtonLabels, setSharedButtonLabels] = useState<{
    alternate: string | null;
    closed: string | null;
  }>({ alternate: null, closed: null });
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [statusId, setStatusId] = useState<string | null>(null);
  const [statusName, setStatusName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    lane: StageStatusLane;
    options: StatusOption[];
  } | null>(null);

  const stageFilter = stageName.trim();

  const load = useCallback(async () => {
    const scopedApplicationId = applicationId.trim();
    if (!scopedApplicationId || !stageFilter) return;
    setLoading(true);
    try {
      const [statusRes, assignRes, appRes] = await Promise.all([
        fetch("/api/admin/application-statuses?activeOnly=1", { cache: "no-store" }),
        fetch("/api/admin/application-status-stage-assignments", { cache: "no-store" }),
        fetch(`/api/admin/job-applications/${encodeURIComponent(scopedApplicationId)}`, {
          cache: "no-store",
        }),
      ]);
      const statusPayload = await statusRes.json();
      const assignPayload = await assignRes.json();
      const appPayload = await appRes.json();
      if (!statusRes.ok) throw new Error(statusPayload.error || "Failed to load statuses");
      if (!assignRes.ok) throw new Error(assignPayload.error || "Failed to load stage statuses");
      if (!appRes.ok) throw new Error(appPayload.error || "Failed to load application");

      const nextOptions = mapApplicationStatusOptions(statusPayload);
      const application =
        appPayload.application && typeof appPayload.application === "object"
          ? (appPayload.application as { status?: unknown; status_id?: unknown; workflow_id?: unknown })
          : {};
      const resolved = resolveApplicationStatusFromPayload(application, nextOptions);
      const rows = Array.isArray(assignPayload.assignments) ? assignPayload.assignments : [];
      const laneRows = Array.isArray(assignPayload.lanes) ? assignPayload.lanes : [];
      const codes = Array.isArray(assignPayload.reasonCodes) ? assignPayload.reasonCodes : [];
      const prefs = Array.isArray(assignPayload.buttonPrefs) ? assignPayload.buttonPrefs : [];
      setSharedButtonLabels(readSharedButtonLabels(assignPayload.buttonLabels));
      const notes = Array.isArray(assignPayload.notes) ? assignPayload.notes : [];
      const flows = Array.isArray(assignPayload.workflows) ? assignPayload.workflows : [];
      const nextWorkflowId = typeof application.workflow_id === "string" ? application.workflow_id : null;
      setOptions(nextOptions);
      setStatusId(resolved.statusId);
      setStatusName(resolved.statusName);
      setWorkflowId(nextWorkflowId);
      const matchedFlow = flows.find(
        (row: { id?: unknown; name?: unknown }) => row.id === nextWorkflowId && typeof row.name === "string"
      );
      setWorkflowName(matchedFlow && typeof matchedFlow.name === "string" ? matchedFlow.name : null);
      setSavedLanes(
        laneRows.flatMap((row: { stageName?: unknown; statusId?: unknown; lane?: unknown; sortOrder?: unknown; workflowId?: unknown }) => {
          if (row.stageName !== stageFilter || typeof row.statusId !== "string") return [];
          const lane = typeof row.lane === "string" ? normalizeStageStatusLane(row.lane) : null;
          if (!lane) return [];
          return [
            {
              statusId: row.statusId,
              lane,
              sortOrder: Number(row.sortOrder ?? 0),
              workflowId: typeof row.workflowId === "string" && row.workflowId ? row.workflowId : null,
            },
          ];
        })
      );
      setReasonRows(
        codes.flatMap((row: { stageName?: unknown; code?: unknown; workflowId?: unknown }) => {
          if (row.stageName !== stageFilter || typeof row.code !== "string" || !row.code.trim()) {
            return [];
          }
          return [
            {
              code: row.code.trim(),
              workflowId: typeof row.workflowId === "string" && row.workflowId ? row.workflowId : null,
            },
          ];
        })
      );
      setNoteRows(
        notes.flatMap((row: { stageName?: unknown; body?: unknown; workflowId?: unknown }) => {
          if (row.stageName !== stageFilter || typeof row.body !== "string" || !row.body.trim()) return [];
          return [
            {
              body: row.body.trim(),
              workflowId: typeof row.workflowId === "string" && row.workflowId ? row.workflowId : null,
            },
          ];
        })
      );
      setButtonPrefs(
        prefs.flatMap(
          (row: {
            stageName?: unknown;
            workflowId?: unknown;
            showAlternate?: unknown;
            showClosed?: unknown;
          }) => {
            if (row.stageName !== stageFilter) return [];
            return [
              {
                workflowId: typeof row.workflowId === "string" && row.workflowId ? row.workflowId : null,
                showAlternate: row.showAlternate !== false,
                showClosed: row.showClosed !== false,
              },
            ];
          }
        )
      );
      setAssignedGroupIds(
        rows
          .filter(
            (row: { stageName?: unknown; groupId?: unknown }) =>
              row.stageName === stageFilter && typeof row.groupId === "string" && row.groupId
          )
          .map((row: { groupId: string }) => row.groupId)
      );
    } catch (error) {
      console.error(error);
      setOptions([]);
      setAssignedGroupIds([]);
      setStatusId(null);
      setStatusName(null);
    } finally {
      setLoading(false);
    }
  }, [applicationId, stageFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const buttonPref = useMemo(() => {
    const picked = selectWorkflowScopedLaneRows(buttonPrefs, workflowId);
    return picked.source === "none" ? null : picked.rows[0];
  }, [buttonPrefs, workflowId]);
  const alternateLabel = resolveStageButtonLabel("alternate", sharedButtonLabels.alternate);
  const closedLabel = resolveStageButtonLabel("closed", sharedButtonLabels.closed);
  const lanes = useMemo(() => {
    const picked = selectWorkflowScopedLaneRows(savedLanes, workflowId);
    const resolved =
      picked.source === "none"
        ? resolveStageStatusLanes(options, assignedGroupIds ?? [], [])
        : resolveConfiguredStageStatusLanes(options, picked.rows);
    return applyStageButtonVisibility(resolved, buttonPref);
  }, [assignedGroupIds, buttonPref, options, savedLanes, workflowId]);
  const reasonCodes = useMemo(
    () =>
      reasonCodesExcludingStatusNames(
        selectWorkflowScopedLaneRows(reasonRows, workflowId).rows.map((row) => row.code),
        options.map((status) => status.name)
      ),
    [options, reasonRows, workflowId]
  );
  const stageNotes = useMemo(
    () =>
      noteRows
        .filter((row) => (row.workflowId ?? null) === (workflowId ?? null))
        .map((row) => row.body),
    [noteRows, workflowId]
  );
  const workflowLabel = workflowId ? (workflowName ?? "This workflow") : "Tenant default";
  const nextHappyPath = useMemo(
    () => sequenceOrderedStatuses(lanes.happy_path, statusId).next,
    [lanes.happy_path, statusId]
  );
  const alternates = lanes.alternate.filter((status) => status.id !== statusId);
  const closed = lanes.closed.filter((status) => status.id !== statusId);

  async function progressTo(option: StatusOption, lane: StageStatusLane, note: string | null) {
    if (!applicationId.trim() || option.id === statusId) {
      setBusyId(null);
      return;
    }
    setBusyId(option.id);
    try {
      if (lane === "closed" && onException) {
        const handled = await onException(option, note ?? "");
        if (handled) {
          setStatusId(option.id);
          setStatusName(option.name);
          onStatusChanged?.({ statusName: option.name, statusId: option.id });
          return;
        }
      }
      const response = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationId)}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            statusId: option.id,
            stageName: stageFilter,
            note,
          }),
        }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to update status");
      const nextName = String(payload.application?.statusName ?? option.name);
      const nextId = String(payload.application?.statusId ?? option.id);
      setStatusId(nextId);
      setStatusName(nextName);
      toast.success(payload.unchanged ? "Status unchanged" : `Status updated to ${nextName}`);
      onStatusChanged?.({ statusName: nextName, statusId: nextId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update status");
    } finally {
      setBusyId(null);
    }
  }

  async function saveAlternate(option: StatusOption, reasonCode: string, note: string) {
    setBusyId(option.id);
    try {
      const known = reasonCodes.some((code) => code.toLowerCase() === reasonCode.toLowerCase());
      if (!known) {
        const response = await fetch("/api/admin/application-status-stage-assignments", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "addReasonCode",
            stageName: stageFilter,
            workflowId,
            code: reasonCode,
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Failed to save the reason code");
        const saved = Array.isArray(payload.reasonCodes) ? payload.reasonCodes : [];
        setReasonRows(
          saved.flatMap((row: { stageName?: unknown; code?: unknown; workflowId?: unknown }) => {
            if (row.stageName !== stageFilter || typeof row.code !== "string" || !row.code.trim()) return [];
            return [
              {
                code: row.code.trim(),
                workflowId: typeof row.workflowId === "string" && row.workflowId ? row.workflowId : null,
              },
            ];
          })
        );
      }
      const noteResponse = await fetch("/api/admin/application-status-stage-assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "findOrCreateNote",
          stageName: stageFilter,
          workflowId,
          note,
        }),
      });
      const notePayload = await noteResponse.json();
      if (!noteResponse.ok) throw new Error(notePayload.error || "Failed to save the note");
      const savedNotes = Array.isArray(notePayload.notes) ? notePayload.notes : [];
      setNoteRows(
        savedNotes.flatMap((row: { stageName?: unknown; body?: unknown; workflowId?: unknown }) => {
          if (row.stageName !== stageFilter || typeof row.body !== "string" || !row.body.trim()) return [];
          return [
            {
              body: row.body.trim(),
              workflowId: typeof row.workflowId === "string" && row.workflowId ? row.workflowId : null,
            },
          ];
        })
      );
      const stored = composeStatusChangeNote({
        lane: "alternate",
        reasonCode,
        note: typeof notePayload.note?.body === "string" ? notePayload.note.body : note,
      });
      setPending(null);
      await progressTo(option, "alternate", stored);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save the alternate status");
      setBusyId(null);
    }
  }

  if (!stageFilter) return null;

  const statusHeader = showCurrentStatus ? (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <p className="text-xs font-medium text-[#64748B]">Application status</p>
      {loading ? (
        <span className="text-sm text-[#98A2B3]">Loading…</span>
      ) : statusName ? (
        <span className="text-sm font-semibold text-[#101828]">{statusName}</span>
      ) : (
        <span className="text-sm text-[#98A2B3]">No status set</span>
      )}
    </div>
  ) : null;

  if (loading || assignedGroupIds == null) {
    return (
      <>
        {statusHeader}
        {!showCurrentStatus ? <p className="text-sm text-[#98A2B3]">Loading statuses…</p> : null}
      </>
    );
  }
  if (!nextHappyPath && alternates.length === 0 && closed.length === 0) {
    return (
      <>
        {statusHeader}
        <p className="text-sm text-[#98A2B3]">
          No statuses on this stage yet. Add a primary, alternate, or closing status in Settings.
        </p>
      </>
    );
  }

  return (
    <>
      {statusHeader}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Stage status actions">
        {lanes.happy_path.length > 0 ? (
          <button
            type="button"
            disabled={!nextHappyPath || Boolean(busyId)}
            onClick={() => {
              if (nextHappyPath) setPending({ lane: "happy_path", options: [nextHappyPath] });
            }}
            className="inline-flex h-9 items-center rounded-full bg-[#0F2744] px-4 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-default disabled:opacity-60"
          >
            {busyId && nextHappyPath && busyId === nextHappyPath.id
              ? "Updating…"
              : (nextHappyPath?.name ?? "Proceed to next stage")}
          </button>
        ) : null}
        {alternates[0] ? (
          <button
            type="button"
            disabled={Boolean(busyId)}
            onClick={() => setPending({ lane: "alternate", options: alternates })}
            className="inline-flex min-h-9 items-center rounded-full border border-[#D0D5DD] bg-white px-4 py-1.5 text-center text-sm font-semibold text-[#344054] transition hover:bg-[#F8FAFC] disabled:opacity-60"
          >
            {busyId === alternates[0].id ? "Updating…" : alternateLabel}
          </button>
        ) : null}
        {closed[0] ? (
          <button
            type="button"
            disabled={Boolean(busyId)}
            onClick={() => setPending({ lane: "closed", options: closed })}
            className="inline-flex min-h-9 items-center rounded-full border border-[#FECACA] bg-white px-4 py-1.5 text-center text-sm font-semibold text-[#B42318] transition hover:bg-[#FEF2F2] disabled:opacity-60"
          >
            {busyId === closed[0].id ? "Updating…" : closedLabel}
          </button>
        ) : null}
      </div>
      {pending ? (
        <StatusChangeDialog
          lane={pending.lane}
          stageName={stageFilter}
          workflowLabel={workflowLabel}
          alternateLabel={alternateLabel}
          closedLabel={closedLabel}
          options={pending.options ?? []}
          reasonCodes={reasonCodes ?? []}
          notes={stageNotes}
          busy={Boolean(busyId)}
          onCancel={() => {
            if (!busyId) setPending(null);
          }}
          onConfirm={(input) => {
            const lane = pending.lane;
            const statuses = pending.options ?? [];
            const option = statuses.find((status) => status.id === input.statusId) ?? statuses[0];
            if (!option) return;
            if (lane === "alternate") {
              void saveAlternate(option, input.reasonCode, input.note);
              return;
            }
            const note = composeStatusChangeNote({
              lane,
              reasonCode: input.reasonCode,
              note: input.note,
            });
            setPending(null);
            void progressTo(option, lane, note);
          }}
        />
      ) : null}
    </>
  );
}

function StatusChangeDialog({
  lane,
  stageName,
  workflowLabel,
  alternateLabel,
  closedLabel,
  options,
  reasonCodes,
  notes,
  busy,
  onCancel,
  onConfirm,
}: {
  lane: StageStatusLane;
  stageName: string;
  workflowLabel: string;
  alternateLabel: string;
  closedLabel: string;
  options: StatusOption[];
  reasonCodes: string[];
  notes: string[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (input: { statusId: string; reasonCode: string; note: string }) => void;
}) {
  const statuses = options ?? [];
  const codes = reasonCodes ?? [];
  const closeReasonCodes = reasonCodesExcludingStatusNames(
    codes,
    statuses.map((status) => status.name)
  );
  const [selectedReason, setSelectedReason] = useState("");
  const [note, setNote] = useState("");
  const [selectedStatusId, setSelectedStatusId] = useState(statuses[0]?.id ?? "");
  const isAlternate = lane === "alternate";
  const picksFromList = lane === "closed";
  const title = lane === "closed" ? closedLabel : isAlternate ? alternateLabel : "Update status";
  const reasonPlan = catalogSavePlan(codes, selectedReason);
  const notePlan = catalogSavePlan(notes, note);
  const noteSuggestions = notes.filter((item) => {
    if (!note.trim()) return false;
    return item.toLowerCase().includes(note.trim().toLowerCase());
  });
  const statusId = selectedStatusId || statuses[0]?.id || "";
  const alternateReady = reasonPlan.action !== "empty" && notePlan.action !== "empty" && Boolean(statusId);
  const closeReady = Boolean(statusId) && Boolean(selectedReason.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-change-title"
        className="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 id="status-change-title" className="text-base font-semibold text-[#101828]">
          {title}
        </h2>
        {isAlternate ? (
          <p className="mt-1 text-sm text-[#475467]">
            {workflowLabel} · {stageName}
          </p>
        ) : null}
        {isAlternate ? (
          <div className="mt-4 space-y-4">
            {statuses.length > 1 ? (
              <label className="block text-sm font-medium text-[#344054]">
                {alternateLabel}
                <select
                  value={statusId}
                  onChange={(event) => setSelectedStatusId(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-sm"
                >
                  {statuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-sm text-[#475467]">{statuses[0]?.name}</p>
            )}
            <label className="block text-sm font-medium text-[#344054]">
              Reason code
              <select
                value={selectedReason}
                onChange={(event) => setSelectedReason(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-sm"
              >
                <option value="">Select a reason code</option>
                {codes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            {reasonPlan.action === "reuse" ? (
              <p className="text-xs text-[#166534]">“{reasonPlan.value}” will be reused for this stage.</p>
            ) : null}
            <label className="block text-sm font-medium text-[#344054]">
              Notes
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={4}
                className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-sm"
                placeholder="Search notes for this stage"
              />
            </label>
            {note.trim() && noteSuggestions.length > 0 ? (
              <ul className="max-h-28 overflow-auto rounded-lg border border-[#E2E8F0]">
                {noteSuggestions.slice(0, 8).map((item) => (
                  <li key={item}>
                    <button
                      type="button"
                      onClick={() => setNote(item)}
                      className="block w-full px-3 py-1.5 text-left text-sm text-[#0F172A] hover:bg-[#F8FAFC]"
                    >
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {notePlan.action === "reuse" ? (
              <p className="text-xs text-[#166534]">“{notePlan.value}” already exists for this stage and will be reused.</p>
            ) : null}
            {notePlan.action === "create" ? (
              <p className="text-xs text-[#92400E]">
                A new note will be created for this stage. It will not be added to other stages or workflows.
              </p>
            ) : null}
          </div>
        ) : picksFromList ? (
          <div className="mt-4 space-y-4">
            {statuses.length > 1 ? (
              <label className="block text-sm font-medium text-[#344054]">
                Status
                <select
                  value={statusId}
                  onChange={(event) => setSelectedStatusId(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-sm"
                >
                  {statuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-sm text-[#475467]">{statuses[0]?.name}</p>
            )}
            <label className="block text-sm font-medium text-[#344054]">
              Reason code
              <select
                value={selectedReason}
                onChange={(event) => setSelectedReason(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-sm"
              >
                <option value="">Select a reason code</option>
                {closeReasonCodes.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <p className="mt-1 text-sm text-[#475467]">{statuses[0]?.name}</p>
        )}
        {isAlternate ? null : (
          <label className="mt-4 block text-sm font-medium text-[#344054]">
            {picksFromList ? "Notes (optional)" : "Detail"}
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={4}
              className="mt-1 w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-sm"
              placeholder={picksFromList ? "Add notes" : "Add a detail"}
            />
          </label>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="inline-flex h-9 items-center rounded-full border border-[#D0D5DD] px-4 text-sm font-semibold text-[#344054]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={
              busy ||
              (isAlternate ? !alternateReady : picksFromList ? !closeReady : !statusId)
            }
            onClick={() =>
              onConfirm({
                statusId,
                reasonCode: isAlternate
                  ? reasonPlan.action === "empty"
                    ? ""
                    : reasonPlan.value
                  : picksFromList
                    ? selectedReason.trim()
                    : "",
                note: isAlternate ? (notePlan.action === "empty" ? "" : notePlan.value) : note.trim(),
              })
            }
            className="inline-flex h-9 items-center rounded-full bg-[#0F2744] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save status"}
          </button>
        </div>
      </div>
    </div>
  );
}

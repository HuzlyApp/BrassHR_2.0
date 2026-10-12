"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import {
  STAGE_STATUS_LANES,
  type StageStatusLane,
} from "@/lib/jobs/application-statuses/stage-status-lanes";

export type LaneStatus = {
  id: string;
  name: string;
  noteId: string | null;
  note: string | null;
};

export type LanePlacement = { statusId: string; noteId: string | null; note: string | null };

const LANE_COPY: Record<StageStatusLane, { title: string; detail: string }> = {
  happy_path: {
    title: "Primary status",
    detail: "Recommended default for this stage. The button shows the next status in this list.",
  },
  alternate: {
    title: "Alternate status",
    detail: "Optional. This stage can keep primary statuses without an alternate button.",
  },
  closed: {
    title: "Closing status",
    detail: "Optional. This stage can keep primary statuses without a closing button.",
  },
};

export function StageStatusLaneEditor({
  lanes,
  catalog,
  canManage,
  saving,
  onChange,
  onAddStatus,
  laneFooter,
}: {
  lanes: Record<StageStatusLane, LaneStatus[]>;
  catalog: Array<{ id: string; name: string }>;
  canManage: boolean;
  saving: boolean;
  onChange: (next: Record<StageStatusLane, LanePlacement[]>) => void;
  onAddStatus: (lane: StageStatusLane, input: { name: string; statusId: string }) => void;
  laneFooter?: (lane: StageStatusLane) => ReactNode;
}) {
  const [drafts, setDrafts] = useState<Record<StageStatusLane, { name: string; statusId: string }>>({
    happy_path: { name: "", statusId: "" },
    alternate: { name: "", statusId: "" },
    closed: { name: "", statusId: "" },
  });
  const placements = {
    happy_path: lanes.happy_path.map((status) => ({ statusId: status.id, noteId: status.noteId, note: status.note })),
    alternate: lanes.alternate.map((status) => ({ statusId: status.id, noteId: status.noteId, note: status.note })),
    closed: lanes.closed.map((status) => ({ statusId: status.id, noteId: status.noteId, note: status.note })),
  };
  const placed = new Set([
    ...placements.happy_path.map((row) => row.statusId),
    ...placements.alternate.map((row) => row.statusId),
    ...placements.closed.map((row) => row.statusId),
  ]);
  const available = catalog.filter((status) => !placed.has(status.id));

  function commit(next: Record<StageStatusLane, LanePlacement[]>) {
    onChange(next);
  }

  function move(lane: StageStatusLane, index: number, delta: number) {
    const nextIndex = index + delta;
    const copy = [...placements[lane]];
    if (nextIndex < 0 || nextIndex >= copy.length) return;
    const [row] = copy.splice(index, 1);
    copy.splice(nextIndex, 0, row);
    commit({ ...placements, [lane]: copy });
  }

  function changeLane(statusId: string, from: StageStatusLane, to: StageStatusLane) {
    if (from === to) return;
    const row = placements[from].find((item) => item.statusId === statusId);
    if (!row) return;
    commit({
      ...placements,
      [from]: placements[from].filter((item) => item.statusId !== statusId),
      [to]: [...placements[to], row],
    });
  }

  function remove(lane: StageStatusLane, statusId: string) {
    commit({
      ...placements,
      [lane]: placements[lane].filter((item) => item.statusId !== statusId),
    });
  }

  return (
    <div className="space-y-3">
      {STAGE_STATUS_LANES.map((lane) => {
        const draft = drafts[lane];
        const canAdd = Boolean(draft.name.trim() || draft.statusId);
        return (
          <div key={lane} className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#012352]">
              {LANE_COPY[lane].title}
              {lane === "happy_path" ? " · Recommended" : ""}
            </p>
            <p className="mt-0.5 text-[11px] leading-4 text-[#64748B]">{LANE_COPY[lane].detail}</p>
            {lanes[lane].length === 0 ? (
              <p className="mt-2 text-xs text-[#94A3B8]">None in this category.</p>
            ) : (
              <ol className="mt-2 space-y-1">
                {lanes[lane].map((status, index) => (
                  <li
                    key={status.id}
                    className="flex flex-col gap-2 rounded-md bg-white px-2 py-1.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="min-w-0 text-sm text-[#0F172A]">
                      <span className="mr-2 text-xs text-[#94A3B8]">{index + 1}.</span>
                      {status.name}
                    </span>
                    {canManage ? (
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Move ${status.name} up`}
                          disabled={saving || index === 0}
                          onClick={() => move(lane, index, -1)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded border border-[#E2E8F0] bg-white text-[#334155] disabled:opacity-40"
                        >
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${status.name} down`}
                          disabled={saving || index === lanes[lane].length - 1}
                          onClick={() => move(lane, index, 1)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded border border-[#E2E8F0] bg-white text-[#334155] disabled:opacity-40"
                        >
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <label className="sr-only" htmlFor={`${lane}-${status.id}-lane`}>
                          Move {status.name} to another category
                        </label>
                        <select
                          id={`${lane}-${status.id}-lane`}
                          value={lane}
                          disabled={saving}
                          onChange={(event) =>
                            changeLane(status.id, lane, event.target.value as StageStatusLane)
                          }
                          className="h-7 rounded border border-[#E2E8F0] bg-white px-1 text-xs text-[#334155]"
                        >
                          <option value="happy_path">Primary</option>
                          <option value="alternate">Alternate</option>
                          <option value="closed">Closing</option>
                        </select>
                        <button
                          type="button"
                          aria-label={`Remove ${status.name}`}
                          disabled={saving}
                          onClick={() => remove(lane, status.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded border border-[#E2E8F0] bg-white text-[#334155] disabled:opacity-40"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
            {canManage && lane === "alternate" ? (
              <button
                type="button"
                disabled={saving || placements.alternate.length === 0}
                onClick={() => commit({ ...placements, alternate: [] })}
                className="mt-2 inline-flex h-8 items-center rounded-md border border-[#CBD5E1] bg-white px-3 text-xs font-medium text-[#334155] disabled:opacity-50"
              >
                Remove alternate button
              </button>
            ) : null}
            {canManage && lane === "closed" ? (
              <button
                type="button"
                disabled={saving || placements.closed.length === 0}
                onClick={() => commit({ ...placements, closed: [] })}
                className="mt-2 inline-flex h-8 items-center rounded-md border border-[#FECACA] bg-white px-3 text-xs font-medium text-[#B42318] disabled:opacity-50"
              >
                Remove closing button
              </button>
            ) : null}
            {canManage ? (
              <div className="mt-3 space-y-2 border-t border-[#E2E8F0] pt-3">
                <label className="block text-xs font-medium text-[#334155]" htmlFor={`${lane}-new-status`}>
                  New status name
                </label>
                <input
                  id={`${lane}-new-status`}
                  value={draft.name}
                  disabled={saving}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [lane]: { ...current[lane], name: event.target.value },
                    }))
                  }
                  placeholder="Type a new status"
                  aria-label={`New ${LANE_COPY[lane].title.toLowerCase()} name`}
                  className="h-9 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm"
                />
                <label className="block text-xs font-medium text-[#334155]" htmlFor={`${lane}-add-status`}>
                  Or choose an existing status
                </label>
                <select
                  id={`${lane}-add-status`}
                  value={draft.statusId}
                  disabled={saving || available.length === 0}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [lane]: { ...current[lane], statusId: event.target.value },
                    }))
                  }
                  className="h-9 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm"
                >
                  <option value="">
                    {available.length === 0 ? "Every status is already on this stage" : "Choose an existing status…"}
                  </option>
                  {available.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={saving || !canAdd}
                  onClick={() => {
                    onAddStatus(lane, { name: draft.name, statusId: draft.statusId });
                    setDrafts((current) => ({
                      ...current,
                      [lane]: { name: "", statusId: "" },
                    }));
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-[#012352] px-3 text-sm font-medium text-white disabled:opacity-50"
                >
                  Add status
                </button>
              </div>
            ) : null}
            {laneFooter && lane !== "happy_path" ? <div className="mt-3">{laneFooter(lane)}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

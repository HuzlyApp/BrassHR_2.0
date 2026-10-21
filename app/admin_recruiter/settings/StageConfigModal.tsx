"use client";

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import {
  parseReasonCodeList,
  preferredReasonCodeLane,
  type ReasonCodeLane,
} from "@/lib/jobs/application-statuses/stage-reason-codes";
import {
  STAGE_STATUS_LANES,
  type StageStatusLane,
} from "@/lib/jobs/application-statuses/stage-status-lanes";
import { PRE_HIRE_STAGE_SUMMARIES, type StageConfigDraft } from "./pre-hire-stage-draft";

const LANE_LABEL: Record<StageStatusLane, string> = {
  happy_path: "Primary",
  alternate: "Alternate",
  closed: "Closing",
};

const SECTION_COPY: Record<StageStatusLane, { title: string; empty: string }> = {
  happy_path: {
    title: "Recommended (Primary)",
    empty: "No recommended statuses yet.",
  },
  alternate: {
    title: "Alternate",
    empty: "No alternate statuses. This category is optional.",
  },
  closed: {
    title: "Closing",
    empty: "No closing statuses. This category is optional.",
  },
};

const fieldClass =
  "h-8 w-full rounded-md border border-[#CBD5E1] bg-white px-2.5 text-sm text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:border-[#012352] disabled:bg-[#F8FAFC]";

function cloneDraft(draft: StageConfigDraft): StageConfigDraft {
  return {
    lanes: {
      happy_path: draft.lanes.happy_path.map((status) => ({ ...status })),
      alternate: draft.lanes.alternate.map((status) => ({ ...status })),
      closed: draft.lanes.closed.map((status) => ({ ...status })),
    },
    reasonCodes: {
      alternate: [...draft.reasonCodes.alternate],
      closed: [...draft.reasonCodes.closed],
    },
  };
}

function draftSignature(draft: StageConfigDraft): string {
  return JSON.stringify({
    lanes: {
      happy_path: draft.lanes.happy_path.map((status) => status.id),
      alternate: draft.lanes.alternate.map((status) => status.id),
      closed: draft.lanes.closed.map((status) => status.id),
    },
    reasonCodes: draft.reasonCodes,
  });
}

function placedIds(draft: StageConfigDraft): Set<string> {
  return new Set(
    STAGE_STATUS_LANES.flatMap((lane) => draft.lanes[lane].map((status) => status.id))
  );
}

export function StatusCountPills({
  counts,
}: {
  counts: Record<StageStatusLane, number>;
}) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {STAGE_STATUS_LANES.map((lane) => (
        <span
          key={lane}
          className="inline-flex items-center gap-1 rounded-md bg-[#F8FAFC] px-1.5 py-0.5 text-[11px] leading-4 text-[#64748B] ring-1 ring-inset ring-[#E2E8F0]"
        >
          <span className="font-semibold tabular-nums text-[#0F172A]">{counts[lane]}</span>
          {LANE_LABEL[lane]}
        </span>
      ))}
    </span>
  );
}

export function StageConfigModal({
  stage,
  summary,
  initial,
  catalog,
  reasonSuggestions,
  canManage,
  saving,
  saveError,
  inheritsDefault,
  workflowName,
  onClose,
  onSave,
}: {
  stage: string;
  summary: string;
  initial: StageConfigDraft;
  catalog: Array<{ id: string; name: string }>;
  reasonSuggestions: Record<ReasonCodeLane, string[]>;
  canManage: boolean;
  saving: boolean;
  saveError: string | null;
  inheritsDefault: boolean;
  workflowName: string | null;
  onClose: () => void;
  onSave: (draft: StageConfigDraft) => void;
}) {
  const [draft, setDraft] = useState(() => cloneDraft(initial));
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [statusDrafts, setStatusDrafts] = useState<Record<StageStatusLane, string>>({
    happy_path: "",
    alternate: "",
    closed: "",
  });
  const [statusErrors, setStatusErrors] = useState<Partial<Record<StageStatusLane, string>>>({});
  const [pendingReasons, setPendingReasons] = useState<Record<ReasonCodeLane, boolean>>({
    alternate: false,
    closed: false,
  });
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const baseline = useMemo(() => draftSignature(initial), [initial]);
  const dirty = draftSignature(draft) !== baseline;

  function requestClose() {
    if (saving) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }

  function move(lane: StageStatusLane, index: number, delta: number) {
    setDraft((current) => {
      const next = cloneDraft(current);
      const target = index + delta;
      const rows = next.lanes[lane];
      if (target < 0 || target >= rows.length) return current;
      const [row] = rows.splice(index, 1);
      rows.splice(target, 0, row);
      return next;
    });
  }

  function changeLane(statusId: string, from: StageStatusLane, to: StageStatusLane) {
    if (from === to) return;
    setDraft((current) => {
      const row = current.lanes[from].find((status) => status.id === statusId);
      if (!row) return current;
      const next = cloneDraft(current);
      next.lanes[from] = next.lanes[from].filter((status) => status.id !== statusId);
      next.lanes[to] = [...next.lanes[to], row];
      return next;
    });
  }

  function removeStatus(lane: StageStatusLane, statusId: string) {
    setDraft((current) => {
      const next = cloneDraft(current);
      next.lanes[lane] = next.lanes[lane].filter((status) => status.id !== statusId);
      return next;
    });
  }

  function addExisting(lane: StageStatusLane, statusId: string) {
    if (!statusId) return;
    const status = catalog.find((item) => item.id === statusId);
    if (!status) return;
    if (placedIds(draft).has(status.id)) {
      setStatusErrors((current) => ({ ...current, [lane]: `${status.name} is already on this stage.` }));
      return;
    }
    setDraft((current) => {
      const next = cloneDraft(current);
      next.lanes[lane] = [
        ...next.lanes[lane],
        { id: status.id, name: status.name, noteId: null, note: null },
      ];
      return next;
    });
    setStatusErrors((current) => ({ ...current, [lane]: undefined }));
  }

  function addNew(lane: StageStatusLane) {
    const name = statusDrafts[lane].trim().replace(/\s+/g, " ");
    if (!name) {
      setStatusErrors((current) => ({ ...current, [lane]: "Enter a status name." }));
      return;
    }
    if (name.length > 80) {
      setStatusErrors((current) => ({ ...current, [lane]: "Status names must be 80 characters or fewer." }));
      return;
    }
    const existing = catalog.find((status) => status.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      addExisting(lane, existing.id);
      if (!placedIds(draft).has(existing.id)) {
        setStatusDrafts((current) => ({ ...current, [lane]: "" }));
      }
      return;
    }
    const alreadyNamed = STAGE_STATUS_LANES.some((item) =>
      draft.lanes[item].some((status) => status.name.toLowerCase() === name.toLowerCase())
    );
    if (alreadyNamed) {
      setStatusErrors((current) => ({ ...current, [lane]: `${name} is already on this stage.` }));
      return;
    }
    setDraft((current) => {
      const next = cloneDraft(current);
      next.lanes[lane] = [
        ...next.lanes[lane],
        { id: `new-${crypto.randomUUID()}`, name, noteId: null, note: null, isNew: true },
      ];
      return next;
    });
    setStatusDrafts((current) => ({ ...current, [lane]: "" }));
    setStatusErrors((current) => ({ ...current, [lane]: undefined }));
  }

  const sortedCatalog = useMemo(
    () => [...catalog].sort((a, b) => a.name.localeCompare(b.name)),
    [catalog]
  );
  const taken = placedIds(draft);

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[220] bg-[#0F172A]/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[221] flex max-h-[min(720px,calc(100vh-2rem))] w-[min(92vw,40rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-xl outline-none"
          onEscapeKeyDown={(event) => {
            if (!dirty && !saving) return;
            event.preventDefault();
            if (!saving) setConfirmDiscard(true);
          }}
          onPointerDownOutside={(event) => {
            if (!dirty && !saving) return;
            event.preventDefault();
            if (!saving) setConfirmDiscard(true);
          }}
          tabIndex={-1}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const content = event.currentTarget;
            if (content instanceof HTMLElement) content.focus();
          }}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] px-5 py-3.5">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#64748B]">
                Pre-Hire stage
              </p>
              <Dialog.Title className="mt-0.5 text-base font-semibold tracking-tight text-[#012352]">
                {stage}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-[#64748B]">
                {summary}
                {workflowName ? ` · ${workflowName}` : ""}
              </Dialog.Description>
            </div>
            <button
              type="button"
              onClick={requestClose}
              disabled={saving}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[#64748B] transition hover:bg-[#F1F5F9] hover:text-[#0F172A] disabled:opacity-50"
              aria-label={`Close ${stage}`}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {inheritsDefault ? (
              <p className="border-b border-[#E2E8F0] bg-[#F8FAFC] px-5 py-2 text-xs text-[#64748B]">
                This workflow is using the organization default. Saving stores a list for this workflow only.
              </p>
            ) : null}
            {STAGE_STATUS_LANES.map((lane) => (
              <section key={lane} className="border-b border-[#E2E8F0] px-5 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-[#012352]">{SECTION_COPY[lane].title}</h3>
                  <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[#475569]">
                    {draft.lanes[lane].length}
                  </span>
                </div>
                {draft.lanes[lane].length === 0 ? (
                  <p className="mt-2 text-sm text-[#94A3B8]">{SECTION_COPY[lane].empty}</p>
                ) : (
                  <ol className="mt-2 divide-y divide-[#F1F5F9] rounded-lg border border-[#E2E8F0]">
                    {draft.lanes[lane].map((status, index) => (
                      <li key={status.id} className="flex flex-wrap items-center gap-2 px-2 py-1.5">
                        <span className="w-4 shrink-0 text-center text-[11px] tabular-nums text-[#94A3B8]">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-[#0F172A]">{status.name}</span>
                        {canManage ? (
                          <span className="flex shrink-0 items-center gap-1">
                            <label className="sr-only" htmlFor={`${lane}-${status.id}-category`}>
                              Category for {status.name}
                            </label>
                            <select
                              id={`${lane}-${status.id}-category`}
                              value={lane}
                              disabled={saving}
                              onChange={(event) =>
                                changeLane(status.id, lane, event.target.value as StageStatusLane)
                              }
                              className="h-7 rounded-md border border-[#E2E8F0] bg-white px-1.5 text-xs text-[#334155]"
                            >
                              <option value="happy_path">Primary</option>
                              <option value="alternate">Alternate</option>
                              <option value="closed">Closing</option>
                            </select>
                            <button
                              type="button"
                              aria-label={`Move ${status.name} up`}
                              disabled={saving || index === 0}
                              onClick={() => move(lane, index, -1)}
                              className="inline-flex size-7 items-center justify-center rounded-md border border-[#E2E8F0] text-[#334155] disabled:opacity-40"
                            >
                              <ChevronUp className="size-3.5" aria-hidden />
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${status.name} down`}
                              disabled={saving || index === draft.lanes[lane].length - 1}
                              onClick={() => move(lane, index, 1)}
                              className="inline-flex size-7 items-center justify-center rounded-md border border-[#E2E8F0] text-[#334155] disabled:opacity-40"
                            >
                              <ChevronDown className="size-3.5" aria-hidden />
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove ${status.name}`}
                              disabled={saving}
                              onClick={() => removeStatus(lane, status.id)}
                              className="inline-flex size-7 items-center justify-center rounded-md border border-[#E2E8F0] text-[#334155] disabled:opacity-40"
                            >
                              <X className="size-3.5" aria-hidden />
                            </button>
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
                {canManage ? (
                  <div className="mt-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <label className="sr-only" htmlFor={`${lane}-new-status`}>
                        New {LANE_LABEL[lane].toLowerCase()} status
                      </label>
                      <input
                        id={`${lane}-new-status`}
                        value={statusDrafts[lane]}
                        disabled={saving}
                        maxLength={80}
                        placeholder="New status"
                        onChange={(event) => {
                          const value = event.target.value;
                          setStatusDrafts((current) => ({ ...current, [lane]: value }));
                          setStatusErrors((current) => ({ ...current, [lane]: undefined }));
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addNew(lane);
                          }
                        }}
                        className={fieldClass}
                      />
                      <button
                        type="button"
                        disabled={saving || !statusDrafts[lane].trim()}
                        onClick={() => addNew(lane)}
                        className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-[#CBD5E1] bg-white px-3 text-xs font-semibold text-[#012352] disabled:opacity-50"
                      >
                        Add
                      </button>
                      <label className="sr-only" htmlFor={`${lane}-existing-status`}>
                        Add an existing status to {LANE_LABEL[lane]}
                      </label>
                      <select
                        id={`${lane}-existing-status`}
                        value=""
                        disabled={saving || sortedCatalog.length === 0}
                        onChange={(event) => {
                          addExisting(lane, event.target.value);
                          event.target.value = "";
                        }}
                        className={`${fieldClass} sm:w-44`}
                      >
                        <option value="">
                          {sortedCatalog.length === 0 ? "No existing statuses" : "Add existing"}
                        </option>
                        {sortedCatalog.map((status) => (
                          <option key={status.id} value={status.id} disabled={taken.has(status.id)}>
                            {status.name}
                            {taken.has(status.id) ? " · on this stage" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    {statusErrors[lane] ? (
                      <p className="mt-1 text-xs text-[#B42318]" role="alert">
                        {statusErrors[lane]}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {lane === "happy_path" ? null : (
                  <ReasonCodeSection
                    lane={lane}
                    codes={draft.reasonCodes[lane]}
                    otherCodes={draft.reasonCodes[lane === "alternate" ? "closed" : "alternate"]}
                    suggestions={reasonSuggestions[lane]}
                    canManage={canManage}
                    saving={saving}
                    onChange={(codes) =>
                      setDraft((current) => ({
                        ...current,
                        reasonCodes: { ...current.reasonCodes, [lane]: codes },
                      }))
                    }
                    onPendingChange={(pending) =>
                      setPendingReasons((current) =>
                        current[lane] === pending ? current : { ...current, [lane]: pending }
                      )
                    }
                  />
                )}
              </section>
            ))}
          </div>

          <div className="border-t border-[#E2E8F0] bg-[#F8FAFC] px-5 py-3">
            {saveError || saveHint ? (
              <p className="mb-2 text-sm text-[#B42318]" role="alert">
                {saveError || saveHint}
              </p>
            ) : null}
            {confirmDiscard ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-[#0F172A]">Discard unsaved changes?</p>
                <span className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDiscard(false)}
                    className="inline-flex h-8 items-center rounded-md border border-[#CBD5E1] bg-white px-3 text-xs font-semibold text-[#334155]"
                  >
                    Keep editing
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-8 items-center rounded-md bg-[#012352] px-3 text-xs font-semibold text-white"
                  >
                    Discard
                  </button>
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={requestClose}
                  className="inline-flex h-8 items-center rounded-md border border-[#CBD5E1] bg-white px-3 text-sm font-medium text-[#334155] disabled:opacity-50"
                >
                  Cancel
                </button>
                {canManage ? (
                  <button
                    type="button"
                    disabled={saving || !dirty}
                    onClick={() => {
                      const pendingStatus = STAGE_STATUS_LANES.some((lane) => statusDrafts[lane].trim());
                      if (pendingStatus || pendingReasons.alternate || pendingReasons.closed) {
                        setSaveHint("Add or clear the open field before saving.");
                        return;
                      }
                      setSaveHint(null);
                      onSave(draft);
                    }}
                    className="inline-flex h-8 items-center rounded-md bg-[#012352] px-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                ) : (
                  <p className="text-xs text-[#64748B]">Only administrators can edit this stage.</p>
                )}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ReasonCodeSection({
  lane,
  codes,
  otherCodes,
  suggestions,
  canManage,
  saving,
  onChange,
  onPendingChange,
}: {
  lane: ReasonCodeLane;
  codes: string[];
  otherCodes: string[];
  suggestions: string[];
  canManage: boolean;
  saving: boolean;
  onChange: (codes: string[]) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const otherLabel = lane === "alternate" ? "Closing" : "Alternate";
  const typed = query.trim().replace(/\s+/g, " ");
  const matches = suggestions.filter((code) => {
    if (codes.some((item) => item.toLowerCase() === code.toLowerCase())) return false;
    if (!typed) return false;
    return code.toLowerCase().includes(typed.toLowerCase());
  });

  function add(value: string) {
    const next = value.trim().replace(/\s+/g, " ");
    if (!next) return;
    if (next.length > 80) {
      setError("Reason codes must be 80 characters or fewer.");
      return;
    }
    if (codes.length >= 30) {
      setError("This section can have 30 reason codes.");
      return;
    }
    if (codes.some((item) => item.toLowerCase() === next.toLowerCase())) {
      setError("Already in this section.");
      return;
    }
    if (otherCodes.some((item) => item.toLowerCase() === next.toLowerCase())) {
      setError(`Already listed under ${otherLabel}.`);
      return;
    }
    const preferred = preferredReasonCodeLane(next);
    if (preferred && preferred !== lane) {
      setError(`${next} belongs with ${preferred === "alternate" ? "Alternate" : "Closing"}.`);
      return;
    }
    const known =
      suggestions.find((item) => item.toLowerCase() === next.toLowerCase()) ??
      codes.find((item) => item.toLowerCase() === next.toLowerCase());
    onChange(parseReasonCodeList([...codes, known ?? next]));
    setQuery("");
    setError(null);
    onPendingChange?.(false);
  }

  return (
    <div className="mt-3 border-t border-dashed border-[#E2E8F0] pt-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-[#334155]">Reason codes</h4>
        <span className="text-[11px] tabular-nums text-[#94A3B8]">{codes.length}</span>
      </div>
      {codes.length === 0 ? (
        <p className="mt-1.5 text-sm text-[#94A3B8]">No reason codes.</p>
      ) : (
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {codes.map((code) => (
            <li
              key={code}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#F8FAFC] py-0.5 pl-2 pr-1 text-xs text-[#0F172A] ring-1 ring-inset ring-[#E2E8F0]"
            >
              <span className="truncate">{code}</span>
              {canManage ? (
                <button
                  type="button"
                  aria-label={`Remove ${code}`}
                  disabled={saving}
                  onClick={() => onChange(codes.filter((item) => item !== code))}
                  className="inline-flex size-4 items-center justify-center rounded-full text-[#64748B] hover:bg-white hover:text-[#0F172A] disabled:opacity-40"
                >
                  <X className="size-3" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        <div className="mt-2">
          <div className="flex gap-2">
            <label className="sr-only" htmlFor={`${lane}-reason-search`}>
              Search or add {lane === "alternate" ? "an alternate" : "a closing"} reason code
            </label>
            <input
              id={`${lane}-reason-search`}
              value={query}
              disabled={saving}
              maxLength={80}
              placeholder="Search or add a reason code"
              onChange={(event) => {
                const value = event.target.value;
                setQuery(value);
                setError(null);
                onPendingChange?.(Boolean(value.trim()));
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  add(typed);
                }
              }}
              className={fieldClass}
            />
            <button
              type="button"
              disabled={saving || !typed}
              onClick={() => add(typed)}
              className="inline-flex h-8 shrink-0 items-center rounded-md border border-[#CBD5E1] bg-white px-3 text-xs font-semibold text-[#012352] disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {typed && matches.length > 0 ? (
            <ul className="mt-1 max-h-28 overflow-auto rounded-md border border-[#E2E8F0] bg-white">
              {matches.slice(0, 6).map((code) => (
                <li key={code}>
                  <button
                    type="button"
                    onClick={() => add(code)}
                    className="block w-full px-2.5 py-1.5 text-left text-sm text-[#0F172A] hover:bg-[#F8FAFC]"
                  >
                    {code}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {error ? (
            <p className="mt-1 text-xs text-[#B42318]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function stageSummary(stage: string): string {
  if (Object.prototype.hasOwnProperty.call(PRE_HIRE_STAGE_SUMMARIES, stage)) {
    return PRE_HIRE_STAGE_SUMMARIES[stage as keyof typeof PRE_HIRE_STAGE_SUMMARIES];
  }
  return "Pre-Hire stage";
}

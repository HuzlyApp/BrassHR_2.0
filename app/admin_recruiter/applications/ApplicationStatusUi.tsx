"use client";

import { useEffect } from "react";

export type ApplicationStatusOption = {
  id: string;
  name: string;
  systemKey: string | null;
  color: string | null;
  sortOrder: number;
  groupId?: string | null;
  groupName?: string | null;
  groupDescription?: string | null;
  groupSortOrder?: number | null;
  groupSystemKey?: string | null;
};

type ApplicationStatusChangeModalProps = {
  open: boolean;
  candidateName: string;
  fromLabel: string;
  toLabel: string;
  note: string;
  busy: boolean;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ApplicationStatusChangeModal({
  open,
  candidateName,
  fromLabel,
  toLabel,
  note,
  busy,
  onNoteChange,
  onCancel,
  onConfirm,
}: ApplicationStatusChangeModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-status-change-title"
        className="w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xl"
      >
        <h2 id="app-status-change-title" className="text-lg font-semibold text-[#0F172A]">
          Change Candidate Status
        </h2>
        <p className="mt-1 text-sm font-medium text-[#334155]">{candidateName}</p>
        <p className="mt-2 text-sm text-[#64748B]">
          {fromLabel} → {toLabel}
        </p>
        <label className="mt-4 block space-y-1.5">
          <span className="text-sm font-medium text-[#0F172A]">Note (optional)</span>
          <textarea
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            rows={4}
            disabled={busy}
            className="w-full resize-none rounded-xl border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#334155] outline-none focus:border-[color:var(--brand-primary)]"
            placeholder="Add a note about this change…"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="h-10 rounded-xl border border-[#CBD5E1] bg-white px-4 text-sm font-medium text-[#334155] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="h-10 rounded-xl bg-[#012352] px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Updating…" : "Update"}
          </button>
        </div>
      </div>
    </div>
  );
}

type HistoryEntry = {
  id: string;
  fromStatus: { id: string | null; name: string | null };
  toStatus: { id: string | null; name: string };
  note: string | null;
  changedBy: { id: string | null; name: string | null };
  changedAt: string;
};

type ApplicationStatusHistoryDialogProps = {
  open: boolean;
  candidateName: string;
  loading: boolean;
  error: string | null;
  history: HistoryEntry[];
  onClose: () => void;
};

function formatHistoryWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", { timeZone: "America/New_York", 
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ApplicationStatusHistoryDialog({
  open,
  candidateName,
  loading,
  error,
  history,
  onClose,
}: ApplicationStatusHistoryDialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-status-history-title"
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-[#E5E7EB] bg-white shadow-xl"
      >
        <div className="border-b border-[#E5E7EB] px-5 py-4">
          <h2 id="app-status-history-title" className="text-lg font-semibold text-[#0F172A]">
            {candidateName}
          </h2>
          <p className="mt-0.5 text-sm text-[#64748B]">Status History</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-[#94A3B8]">Loading history…</p>
          ) : error ? (
            <p className="text-sm text-[#B91C1C]">{error}</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-[#94A3B8]">No status changes yet.</p>
          ) : (
            <ol className="space-y-4">
              {history.map((entry, index) => (
                <li key={entry.id} className="relative border-l-2 border-[#CBD5E1] pl-4">
                  <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-[#64748B]" />
                  <p className="text-sm font-semibold text-[#0F172A]">{entry.toStatus.name}</p>
                  {entry.fromStatus.name ? (
                    <p className="mt-0.5 text-xs text-[#64748B]">From {entry.fromStatus.name}</p>
                  ) : (
                    <p className="mt-0.5 text-xs text-[#64748B]">Application created</p>
                  )}
                  <p className="mt-0.5 text-xs text-[#94A3B8]">
                    {formatHistoryWhen(entry.changedAt)}
                  </p>
                  <p className="mt-0.5 text-xs text-[#64748B]">
                    Changed by {entry.changedBy.name || "System"}
                  </p>
                  {entry.note?.trim() ? (
                    <p className="mt-2 text-sm leading-5 text-[#475569]">{entry.note}</p>
                  ) : null}
                  {index < history.length - 1 ? <div className="h-1" /> : null}
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="border-t border-[#E5E7EB] px-5 py-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-[#CBD5E1] bg-white px-4 text-sm font-medium text-[#334155]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

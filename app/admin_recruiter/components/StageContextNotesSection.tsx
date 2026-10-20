"use client";

import { useCallback, useEffect, useState } from "react";
import type { StageContextNoteDto, StageNoteContextKind } from "@/lib/stage-context-notes";

type StageContextNotesSectionProps = {
  workerId: string;
  applicationId?: string | null;
  contextKind: StageNoteContextKind;
  contextKey: string;
  title?: string;
  subtitle?: string;
};

function formatNoteDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function StageContextNotesSection({
  workerId,
  applicationId,
  contextKind,
  contextKey,
  title = "Notes",
  subtitle = "Notes saved here stay on this step.",
}: StageContextNotesSectionProps) {
  const [notes, setNotes] = useState<StageContextNoteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    if (!workerId || !contextKey) {
      setNotes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        workerId,
        contextKind,
        contextKey,
      });
      if (applicationId?.trim()) params.set("applicationId", applicationId.trim());
      const res = await fetch(`/api/admin/stage-context-notes?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as { notes?: StageContextNoteDto[]; error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to load notes");
      setNotes(json.notes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notes");
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [applicationId, contextKey, contextKind, workerId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  async function saveNote() {
    const body = draft.trim();
    if (!body) {
      setError("Type a note before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stage-context-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workerId,
          applicationId: applicationId?.trim() || undefined,
          contextKind,
          contextKey,
          body,
        }),
      });
      const json = (await res.json()) as { note?: StageContextNoteDto; error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to save note");
      if (json.note) {
        setNotes((current) => [json.note!, ...current.filter((note) => note.id !== json.note!.id)]);
      } else {
        await loadNotes();
      }
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {loading ? "…" : notes.length}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a note for this step"
          rows={3}
          className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[color:var(--brand-primary)]"
        />
        <div className="flex justify-end">
          <button
            type="button"
            disabled={saving || !draft.trim()}
            onClick={() => void saveNote()}
            className="inline-flex h-9 items-center rounded-lg bg-[color:var(--brand-primary)] px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add note"}
          </button>
        </div>
      </div>

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}

      <ul className="mt-3 space-y-2">
        {loading ? (
          <li className="text-sm text-slate-500">Loading notes…</li>
        ) : notes.length === 0 ? (
          <li className="text-sm text-slate-500">No notes on this step yet.</li>
        ) : (
          notes.map((note) => (
            <li key={note.id} className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="whitespace-pre-wrap text-sm text-slate-800">{note.body}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                {note.author_name} · {formatNoteDate(note.created_at)}
              </p>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileBadge, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

type DocumentKind = "certificate" | "license";

type DocumentDraft = {
  id: string;
  name: string;
  documentKind: DocumentKind;
  isRequired: boolean;
  hasExpiration: boolean;
  sortOrder: number;
};

type ProfessionRow = {
  id: string;
  name: string;
  documents: DocumentDraft[];
};

type CatalogPayload = {
  canManage: boolean;
  industryKey: string | null;
  industryLabel: string | null;
  professions: ProfessionRow[];
  error?: string;
};

function newDocument(): DocumentDraft {
  return {
    id: `new-${crypto.randomUUID()}`,
    name: "",
    documentKind: "certificate",
    isRequired: true,
    hasExpiration: true,
    sortOrder: 0,
  };
}

export default function ProfessionDocumentsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [industryLabel, setIndustryLabel] = useState<string | null>(null);
  const [professions, setProfessions] = useState<ProfessionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DocumentDraft[]>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});

  const applyPayload = useCallback((payload: CatalogPayload) => {
    const rows = payload.professions ?? [];
    const nextDrafts: Record<string, DocumentDraft[]> = {};
    const nextSaved: Record<string, string> = {};
    for (const profession of rows) {
      const documents = profession.documents.map((doc) => ({
        ...doc,
        hasExpiration: doc.hasExpiration === true,
      }));
      nextDrafts[profession.id] = documents;
      nextSaved[profession.id] = JSON.stringify(documents);
    }
    setCanManage(payload.canManage);
    setIndustryLabel(payload.industryLabel);
    setProfessions(rows);
    setDrafts(nextDrafts);
    setSaved(nextSaved);
    setSelectedId((current) =>
      current && rows.some((row) => row.id === current) ? current : rows[0]?.id ?? null
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/profession-documents");
      const payload = (await response.json()) as CatalogPayload;
      if (!response.ok) throw new Error(payload.error || "Could not load documents");
      applyPayload(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load documents");
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = professions.find((profession) => profession.id === selectedId) ?? null;
  const documents = selectedId ? drafts[selectedId] ?? [] : [];
  const dirty = useMemo(() => {
    if (!selectedId) return false;
    return JSON.stringify(drafts[selectedId] ?? []) !== (saved[selectedId] ?? "[]");
  }, [drafts, saved, selectedId]);

  function updateDocument(id: string, patch: Partial<DocumentDraft>) {
    if (!selectedId || !canManage) return;
    setDrafts((current) => ({
      ...current,
      [selectedId]: (current[selectedId] ?? []).map((doc) => (doc.id === id ? { ...doc, ...patch } : doc)),
    }));
  }

  function selectProfession(professionId: string) {
    if (professionId === selectedId) return;
    if (dirty && !window.confirm("Discard unsaved document changes for this profession?")) return;
    if (selectedId && dirty) {
      const snapshot = saved[selectedId];
      setDrafts((current) => ({
        ...current,
        [selectedId]: snapshot ? (JSON.parse(snapshot) as DocumentDraft[]) : [],
      }));
    }
    setSelectedId(professionId);
  }

  async function save() {
    if (!selectedId || !canManage || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/profession-documents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionId: selectedId,
          documents: documents.map((doc) => ({
            id: doc.id,
            name: doc.name,
            documentKind: doc.documentKind,
            isRequired: doc.isRequired,
            hasExpiration: doc.hasExpiration,
          })),
        }),
      });
      const payload = (await response.json()) as { error?: string; documents?: DocumentDraft[] };
      if (!response.ok) throw new Error(payload.error || "Could not save documents");
      const next = (payload.documents ?? []).map((doc) => ({
        ...doc,
        hasExpiration: doc.hasExpiration === true,
      }));
      setDrafts((current) => ({ ...current, [selectedId]: next }));
      setSaved((current) => ({ ...current, [selectedId]: JSON.stringify(next) }));
      toast.success("Upload documents saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save documents");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm text-[#64748B]">Loading upload documents…</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F1F5F9] text-[#012352]">
          <FileBadge className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <h3 className="text-base font-semibold text-[#0F172A]">Upload documents</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#64748B]">
            Choose the certificates and licenses each profession uploads. Mark each one required or optional,
            and whether an expiry date is required on upload. Applicants can attach up to 5 files per
            document. This list is for your organization
            {industryLabel ? ` in ${industryLabel}` : ""}.
          </p>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : !industryLabel ? (
        <p className="text-sm text-[#64748B]">Set this organization’s industry before adding upload documents.</p>
      ) : professions.length === 0 ? (
        <p className="text-sm text-[#64748B]">No professions are set up for {industryLabel} yet.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#64748B]">Profession</p>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Professions">
              {professions.map((profession) => {
                const active = profession.id === selectedId;
                return (
                  <button
                    key={profession.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => selectProfession(profession.id)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                      active ? "bg-[#012352] text-white" : "bg-[#F1F5F9] text-[#012352] hover:bg-[#E2E8F0]"
                    }`}
                  >
                    {profession.name}
                  </button>
                );
              })}
            </div>
          </div>

          {selected ? (
            <div className="space-y-3">
              {documents.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-3 py-4 text-sm text-[#64748B]">
                  No certificates or licenses for {selected.name} yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {documents.map((doc) => (
                    <li
                      key={doc.id}
                      className="grid gap-2 rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-3 sm:grid-cols-[minmax(0,1fr)_140px_auto_auto_auto] sm:items-center"
                    >
                      <label className="block">
                        <span className="sr-only">Document name</span>
                        <input
                          value={doc.name}
                          disabled={!canManage}
                          onChange={(event) => updateDocument(doc.id, { name: event.target.value })}
                          placeholder="Certificate or license name"
                          className="h-9 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A] disabled:bg-[#F1F5F9]"
                        />
                      </label>
                      <label className="block">
                        <span className="sr-only">Document type</span>
                        <select
                          value={doc.documentKind}
                          disabled={!canManage}
                          onChange={(event) =>
                            updateDocument(doc.id, { documentKind: event.target.value as DocumentKind })
                          }
                          className="h-9 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A] disabled:bg-[#F1F5F9]"
                        >
                          <option value="certificate">Certificate</option>
                          <option value="license">License</option>
                        </select>
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-[#0F172A]">
                        <input
                          type="checkbox"
                          checked={doc.isRequired}
                          disabled={!canManage}
                          onChange={(event) => updateDocument(doc.id, { isRequired: event.target.checked })}
                          className="h-4 w-4 rounded border-[#CBD5E1]"
                        />
                        {doc.isRequired ? "Required" : "Optional"}
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-[#0F172A]">
                        <span className="text-[#64748B]">Expiry</span>
                        <select
                          value={doc.hasExpiration ? "yes" : "no"}
                          disabled={!canManage}
                          onChange={(event) =>
                            updateDocument(doc.id, { hasExpiration: event.target.value === "yes" })
                          }
                          className="h-9 rounded-lg border border-[#CBD5E1] bg-white px-2 text-sm text-[#0F172A] disabled:bg-[#F1F5F9]"
                          aria-label={`${doc.name || "Document"} requires expiry date`}
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={!canManage}
                        onClick={() => {
                          if (!selectedId) return;
                          setDrafts((current) => ({
                            ...current,
                            [selectedId]: (current[selectedId] ?? []).filter((row) => row.id !== doc.id),
                          }));
                        }}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#64748B] hover:bg-white hover:text-[#B91C1C] disabled:opacity-40"
                        aria-label={`Remove ${doc.name || "document"}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={!canManage}
                  onClick={() => {
                    if (!selectedId) return;
                    setDrafts((current) => ({
                      ...current,
                      [selectedId]: [...(current[selectedId] ?? []), newDocument()],
                    }));
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#012352] hover:underline disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Add certificate or license
                </button>
                <button
                  type="button"
                  disabled={!canManage || !dirty || saving}
                  onClick={() => void save()}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-[#012352] px-5 text-sm font-medium text-white disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save documents"}
                </button>
              </div>
              {!canManage ? (
                <p className="text-xs text-[#64748B]">Only an administrator can change these documents.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

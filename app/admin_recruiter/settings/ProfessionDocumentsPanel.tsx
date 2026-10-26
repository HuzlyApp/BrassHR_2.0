"use client";

import { Children, isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, FileBadge, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  PROFESSION_DOCUMENT_KINDS,
  professionDocumentKindLabel,
  type ProfessionDocumentKind,
} from "@/lib/professions/profession-documents";

type DocumentKind = ProfessionDocumentKind;

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

type CatalogProfessionOption = {
  key: string;
  name: string;
  industryKey: string;
  industryLabel: string | null;
};

type CatalogPayload = {
  canManage: boolean;
  industryKey: string | null;
  industryLabel: string | null;
  professions: ProfessionRow[];
  availableProfessions?: CatalogProfessionOption[];
  error?: string;
};

const fieldClassName =
  "h-9 w-full cursor-pointer appearance-none rounded-lg border border-[#CBD5E1] bg-white pl-3 pr-8 text-sm text-[#0F172A] outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--brand-secondary)_35%,transparent)] disabled:cursor-not-allowed disabled:bg-[#F1F5F9]";

function readSelectOptions(children: ReactNode): Array<{ value: string; label: string }> {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode }>(child)) return [];
    const label = child.props.children;
    return [
      {
        value: child.props.value == null ? "" : String(child.props.value),
        label: typeof label === "string" || typeof label === "number" ? String(label) : "",
      },
    ];
  });
}

function SelectField({
  label,
  className,
  children,
  value,
  disabled,
  onChange,
}: {
  label: string;
  className?: string;
  children: ReactNode;
  value?: string;
  disabled?: boolean;
  onChange?: (event: { target: { value: string } }) => void;
}) {
  const options = readSelectOptions(children);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const currentValue = value ?? "";
  const display = options.find((option) => option.value === currentValue)?.label ?? "";

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`${fieldClassName} flex items-center text-left`}
      >
        <span className="truncate">{display}</span>
      </button>
      <ChevronDown
        className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]"
        aria-hidden
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-[#E5E7EB] bg-white py-1 shadow-lg"
        >
          {options.map((option) => {
            const selected = option.value === currentValue;
            return (
              <li key={option.value || "__empty"} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange?.({ target: { value: option.value } });
                    setOpen(false);
                  }}
                  className={`flex w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-[#EFF6FF] ${
                    selected ? "bg-[#DBEAFE] font-medium text-[#0F172A]" : "text-[#0F172A]"
                  }`}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function RequiredCheckbox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <span className="relative inline-flex h-4 w-4 shrink-0">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer h-4 w-4 cursor-pointer appearance-none rounded-[5px] border border-[#CBD5E1] bg-white checked:border-[color:var(--brand-secondary)] checked:bg-[color:var(--brand-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--brand-secondary)_35%,transparent)] disabled:cursor-not-allowed disabled:opacity-50"
      />
      <Check
        className="pointer-events-none absolute inset-0 m-auto hidden h-3 w-3 text-white peer-checked:block"
        strokeWidth={3}
        aria-hidden
      />
    </span>
  );
}

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

  const [availableProfessions, setAvailableProfessions] = useState<CatalogProfessionOption[]>([]);
  const [selectedCatalogKey, setSelectedCatalogKey] = useState("");
  const [addingProfession, setAddingProfession] = useState(false);

  const applyPayload = useCallback((payload: CatalogPayload, preferId?: string) => {
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
    setAvailableProfessions(payload.availableProfessions ?? []);
    setSelectedCatalogKey((current) =>
      (payload.availableProfessions ?? []).some((option) => option.key === current) ? current : ""
    );
    setProfessions(rows);
    setDrafts(nextDrafts);
    setSaved(nextSaved);
    setSelectedId((current) => {
      if (preferId && rows.some((row) => row.id === preferId)) return preferId;
      return current && rows.some((row) => row.id === current) ? current : rows[0]?.id ?? null;
    });
  }, []);

  const load = useCallback(async (preferId?: string, options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/profession-documents");
      const payload = (await response.json()) as CatalogPayload;
      if (!response.ok) throw new Error(payload.error || "Could not load documents");
      applyPayload(payload, preferId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load documents");
    } finally {
      if (!options?.silent) setLoading(false);
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

  async function addProfession() {
    const catalogKey = selectedCatalogKey.trim();
    if (!catalogKey || !canManage || addingProfession) return;
    if (dirty && !window.confirm("Discard unsaved document changes for this profession?")) return;
    setAddingProfession(true);
    try {
      const response = await fetch("/api/admin/professions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogKey }),
      });
      const payload = (await response.json()) as { error?: string; profession?: { id?: string } };
      if (!response.ok) throw new Error(payload.error || "Could not add profession");
      setSelectedCatalogKey("");
      toast.success("Profession added");
      await load(payload.profession?.id, { silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add profession");
    } finally {
      setAddingProfession(false);
    }
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
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#64748B]">Profession</p>
            <div className="flex flex-wrap items-center gap-3">
              {professions.length === 0 ? (
                <p className="text-sm text-[#64748B]">No professions are set up for {industryLabel} yet.</p>
              ) : (
                <div className="flex min-w-0 flex-1 flex-wrap gap-2" role="tablist" aria-label="Professions">
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
              )}
              {canManage && availableProfessions.length > 0 ? (
                <form
                  className="ml-auto flex shrink-0 items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void addProfession();
                  }}
                >
                  <SelectField
                    label="Select profession"
                    value={selectedCatalogKey}
                    onChange={(event) => setSelectedCatalogKey(event.target.value)}
                    className="w-[220px]"
                  >
                    <option value="">Choose a profession</option>
                    {availableProfessions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.industryLabel ? `${option.name} (${option.industryLabel})` : option.name}
                      </option>
                    ))}
                  </SelectField>
                  <button
                    type="submit"
                    disabled={addingProfession || selectedCatalogKey.length === 0}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-[#012352] bg-white px-3 text-sm font-medium text-[#012352] hover:bg-[#F8FAFC] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-secondary)] disabled:opacity-60"
                  >
                    {addingProfession ? "Adding…" : "Add profession"}
                  </button>
                </form>
              ) : canManage ? (
                <p className="ml-auto text-sm text-[#64748B]">Every catalog profession is already on this organization.</p>
              ) : null}
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
                      className="grid gap-2 rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-3 sm:grid-cols-[minmax(0,1fr)_168px_auto_auto_auto] sm:items-center"
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
                      <SelectField
                        label="Document type"
                        value={doc.documentKind}
                        disabled={!canManage}
                        onChange={(event) =>
                          updateDocument(doc.id, { documentKind: event.target.value as DocumentKind })
                        }
                      >
                        {PROFESSION_DOCUMENT_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {professionDocumentKindLabel(kind)}
                          </option>
                        ))}
                      </SelectField>
                      <label className="inline-flex items-center gap-2 text-sm text-[#0F172A]">
                        <RequiredCheckbox
                          checked={doc.isRequired}
                          disabled={!canManage}
                          onChange={(isRequired) => updateDocument(doc.id, { isRequired })}
                        />
                        {doc.isRequired ? "Required" : "Optional"}
                      </label>
                      <div className="inline-flex items-center gap-2 text-sm text-[#0F172A]">
                        <span className="text-[#64748B]">Expiry</span>
                        <SelectField
                          label={`${doc.name || "Document"} requires expiry date`}
                          value={doc.hasExpiration ? "yes" : "no"}
                          disabled={!canManage}
                          onChange={(event) =>
                            updateDocument(doc.id, { hasExpiration: event.target.value === "yes" })
                          }
                          className="w-[88px]"
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </SelectField>
                      </div>
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

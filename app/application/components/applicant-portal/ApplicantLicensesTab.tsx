"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Upload } from "lucide-react";
import { useApplicantPortal } from "./ApplicantPortalProvider";
import { WorkerFilePicker } from "./WorkerFilePicker";
import { WORKER_BTN_OUTLINE, WORKER_BTN_PRIMARY } from "./worker-portal-buttons";
import {
  WORKER_DOCUMENTS_PAGE_SECTION_TITLE_CLASS,
  WORKER_DOCUMENTS_PAGE_SECTION_TITLE_STYLE,
  WORKER_PORTAL_PAGE_PAD_CLASS,
  WORKER_SCHEDULE_CARD_CLASS,
} from "./worker-schedule-typography";

type CredentialItem = {
  id: string;
  required_document_id: string;
  license_name: string;
  issuing_organization: string | null;
  scope: string | null;
  validity: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  document_url: string | null;
  original_file_name: string | null;
  status: string;
};

type UploadTarget = {
  id: string;
  name: string;
  has_expiration: boolean;
  collect_issuing_organization: boolean;
  collect_scope: boolean;
  collect_validity: boolean;
};

function StatusBadge({ label, tone }: { label: string; tone: "red" | "amber" | "green" | "gray" }) {
  const styles = {
    red: "bg-red-50 text-red-700 border-red-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    gray: "bg-slate-50 text-slate-700 border-slate-200",
  }[tone];
  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles}`}>{label}</span>;
}

function statusTone(status: string) {
  if (status === "expired" || status === "rejected") return "red" as const;
  if (status === "needs_revision") return "amber" as const;
  if (status === "approved") return "green" as const;
  return "gray" as const;
}

export function ApplicantLicensesTab({ embedded = false }: { embedded?: boolean }) {
  const { sessionReady, authHeaders } = useApplicantPortal();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [credentials, setCredentials] = useState<CredentialItem[]>([]);
  const [documents, setDocuments] = useState<UploadTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiredDocumentId, setRequiredDocumentId] = useState("");
  const [issuingOrganization, setIssuingOrganization] = useState("");
  const [scope, setScope] = useState("");
  const [validity, setValidity] = useState("");
  const [issuedDate, setIssuedDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const selectedDocument = useMemo(
    () => documents.find((doc) => doc.id === requiredDocumentId) ?? null,
    [documents, requiredDocumentId]
  );

  async function loadCredentials() {
    const headers = await authHeaders();
    if (!headers) return;
    const res = await fetch("/api/applicant-portal/credentials", { headers, cache: "no-store" });
    const payload = (await res.json().catch(() => ({}))) as {
      credentials?: CredentialItem[];
      documents?: UploadTarget[];
      error?: string;
    };
    if (!res.ok) throw new Error(payload.error || "Could not load certifications.");
    setCredentials(payload.credentials ?? []);
    setDocuments(payload.documents ?? []);
    setRequiredDocumentId((current) => current || payload.documents?.[0]?.id || "");
  }

  useEffect(() => {
    if (!sessionReady) return;
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        await loadCredentials();
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Could not load certifications.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [authHeaders, sessionReady]);

  async function openFile(id: string) {
    const headers = await authHeaders();
    if (!headers) return;
    const res = await fetch(`/api/applicant-portal/files?source=credential&id=${encodeURIComponent(id)}`, {
      headers,
      cache: "no-store",
    });
    const payload = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !payload.url) {
      setError(payload.error || "Could not open file.");
      return;
    }
    window.open(payload.url, "_blank", "noopener,noreferrer");
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!requiredDocumentId) {
      setError("Choose the document this file replaces.");
      return;
    }
    if (selectedDocument?.has_expiration && (!issuedDate || !expiryDate)) {
      setError("Issued date and expiry date are required.");
      return;
    }
    if (!selectedFile) {
      setError("Choose a file to upload.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      if (!headers) throw new Error("You need to sign in again.");
      const form = new FormData();
      form.append("requiredDocumentId", requiredDocumentId);
      form.append("issuingOrganization", issuingOrganization);
      form.append("scope", scope);
      form.append("validity", validity);
      form.append("issuedDate", issuedDate);
      form.append("expiryDate", expiryDate);
      form.append("file", selectedFile);
      const res = await fetch("/api/applicant-portal/credentials", { method: "POST", headers, body: form });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Could not upload certification.");
      setSelectedFile(null);
      setIssuingOrganization("");
      setScope("");
      setValidity("");
      setIssuedDate("");
      setExpiryDate("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadCredentials();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload certification.");
    } finally {
      setUploading(false);
    }
  }

  const expiredCount = credentials.filter((item) => item.status === "expired").length;

  return (
    <div className={embedded ? "space-y-6" : `${WORKER_PORTAL_PAGE_PAD_CLASS} space-y-6`}>
      {expiredCount > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{expiredCount} certification(s) expired.</p>
          </div>
        </div>
      ) : null}

      <div className={`${WORKER_SCHEDULE_CARD_CLASS} overflow-hidden`}>
        <div className="border-b border-[#E5E7EB] px-4 py-3">
          <h2 className={WORKER_DOCUMENTS_PAGE_SECTION_TITLE_CLASS} style={WORKER_DOCUMENTS_PAGE_SECTION_TITLE_STYLE}>
            Upload certification
          </h2>
          <p className="mt-1 text-sm text-[#64748B]">
            A new file replaces the current one for that document.
          </p>
        </div>
        <form onSubmit={handleUpload} className="space-y-4 p-4">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-[#374151]">Document</label>
              <div className="relative">
                <select
                  value={requiredDocumentId}
                  onChange={(event) => setRequiredDocumentId(event.target.value)}
                  className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-[#D1D5DB] bg-white py-2 pl-3 pr-10 text-sm text-[#334155] outline-none focus:border-[color:var(--brand-primary)]"
                >
                  {documents.length === 0 ? <option value="">No documents for your jobs</option> : null}
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" aria-hidden />
              </div>
            </div>
            {selectedDocument?.collect_issuing_organization ? (
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[#374151]">Issuing organization</label>
                <input value={issuingOrganization} onChange={(event) => setIssuingOrganization(event.target.value)} className="h-10 w-full rounded-lg border border-[#D1D5DB] px-3 text-sm outline-none focus:border-[color:var(--brand-primary)]" />
              </div>
            ) : null}
            {selectedDocument?.collect_scope ? (
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[#374151]">Scope</label>
                <input value={scope} onChange={(event) => setScope(event.target.value)} className="h-10 w-full rounded-lg border border-[#D1D5DB] px-3 text-sm outline-none focus:border-[color:var(--brand-primary)]" />
              </div>
            ) : null}
            {selectedDocument?.collect_validity ? (
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[#374151]">Validity</label>
                <input value={validity} onChange={(event) => setValidity(event.target.value)} placeholder="3 Years" className="h-10 w-full rounded-lg border border-[#D1D5DB] px-3 text-sm outline-none focus:border-[color:var(--brand-primary)]" />
              </div>
            ) : null}
            {selectedDocument?.has_expiration ? (
              <>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-[#374151]">Issued date</label>
                  <input type="date" value={issuedDate} onChange={(event) => setIssuedDate(event.target.value)} className="h-10 w-full rounded-lg border border-[#D1D5DB] px-3 text-sm outline-none focus:border-[color:var(--brand-primary)]" />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-[#374151]">Expiry date</label>
                  <input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} className="h-10 w-full rounded-lg border border-[#D1D5DB] px-3 text-sm outline-none focus:border-[color:var(--brand-primary)]" />
                </div>
              </>
            ) : null}
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-[#374151]">File</label>
              <WorkerFilePicker inputRef={fileInputRef} file={selectedFile} onChange={setSelectedFile} disabled={uploading} />
            </div>
          </div>
          <button type="submit" disabled={uploading || documents.length === 0} className={WORKER_BTN_PRIMARY}>
            <Upload className="h-4 w-4" />
            {uploading ? "Uploading..." : "Submit for review"}
          </button>
        </form>
      </div>

      <div className={`${WORKER_SCHEDULE_CARD_CLASS} overflow-hidden`}>
        <div className="border-b border-[#E5E7EB] px-4 py-3">
          <h2 className={WORKER_DOCUMENTS_PAGE_SECTION_TITLE_CLASS} style={WORKER_DOCUMENTS_PAGE_SECTION_TITLE_STYLE}>
            Your certifications
          </h2>
        </div>
        <div className="divide-y divide-[#E5E7EB]">
          {loading ? (
            <p className="px-4 py-6 text-sm text-[#64748B]">Loading certifications...</p>
          ) : credentials.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[#64748B]">No certification records yet.</p>
          ) : (
            credentials.map((credential) => (
              <div key={credential.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#0F172A]">{credential.license_name}</p>
                  <p className="mt-1 break-words text-xs leading-5 text-[#64748B]">
                    {[
                      credential.issuing_organization,
                      credential.scope,
                      credential.validity,
                      credential.issued_date ? `Issued ${credential.issued_date}` : null,
                      credential.expiry_date ? `Expires ${credential.expiry_date}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No details yet"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                  <StatusBadge label={credential.status.replaceAll("_", " ")} tone={statusTone(credential.status)} />
                  {credential.document_url || credential.original_file_name ? (
                    <button type="button" onClick={() => void openFile(credential.id)} className={`${WORKER_BTN_OUTLINE} w-auto`}>
                      Go to url
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

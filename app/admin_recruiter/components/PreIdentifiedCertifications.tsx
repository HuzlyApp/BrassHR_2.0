"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye } from "lucide-react";
import BrandedFileTypeIcon from "./BrandedFileTypeIcon";
import { isPdfFile } from "@/lib/document-upload-helpers";

type CertificationFile = {
  id: string;
  licenseType: string;
  certificationName: string | null;
  licenseTypeLabel: string;
  originalFileName: string | null;
  hasFile: boolean;
  issuingOrganization: string | null;
  scope: string | null;
  validity: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  documentUrl: string | null;
  requiredDocumentId: string;
};

type PendingUpload = {
  requiredDocumentId: string;
  issuedDate: string;
  expiryDate: string;
};

const PRESET_SLOTS: Array<{
  code: "BLS" | "ACLS";
  title: string;
}> = [
  { code: "BLS", title: "BLS" },
  { code: "ACLS", title: "ACLS" },
];

type CredentialDocument = {
  id: string;
  code: string;
  name: string;
};

function groupOtherCertifications(files: CertificationFile[]) {
  const groups = new Map<string, { name: string; files: CertificationFile[] }>();
  for (const file of files) {
    if (file.licenseType === "BLS" || file.licenseType === "ACLS") continue;
    const name = file.licenseTypeLabel?.trim() || "Certification";
    const key = name.toLowerCase();
    const existing = groups.get(key);
    if (existing) existing.files.push(file);
    else groups.set(key, { name, files: [file] });
  }
  return Array.from(groups.values());
}

export default function PreIdentifiedCertifications({ workerId }: { workerId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<PendingUpload | null>(null);
  const pendingKeyRef = useRef<string | null>(null);
  const [files, setFiles] = useState<CertificationFile[]>([]);
  const [documents, setDocuments] = useState<CredentialDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/admin/worker-credentials?workerId=${encodeURIComponent(workerId)}`,
      { cache: "no-store" }
    );
    const payload = (await res.json().catch(() => ({}))) as {
      credentials?: Array<{
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
      }>;
      documents?: CredentialDocument[];
      error?: string;
    };
    if (!res.ok) throw new Error(payload.error || "Could not load certifications.");
    const docs = payload.documents ?? [];
    setDocuments(docs);
    const codeById = new Map(docs.map((doc) => [doc.id, doc.code]));
    setFiles(
      (payload.credentials ?? []).map((row) => ({
        id: row.id,
        licenseType: codeById.get(row.required_document_id) || row.license_name,
        certificationName: row.license_name,
        licenseTypeLabel: row.license_name,
        originalFileName: row.original_file_name,
        hasFile: Boolean(row.document_url || row.original_file_name),
        issuingOrganization: row.issuing_organization,
        scope: row.scope,
        validity: row.validity,
        issuedDate: row.issued_date,
        expiryDate: row.expiry_date,
        documentUrl: row.document_url,
        requiredDocumentId: row.required_document_id,
      }))
    );
  }, [workerId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        await load();
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Could not load certifications.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const otherGroups = useMemo(
    () => groupOtherCertifications(files),
    [files]
  );

  async function fileUrl(id: string) {
    const res = await fetch(
      `/api/admin/worker-account-files?workerId=${encodeURIComponent(workerId)}&source=credential&id=${encodeURIComponent(id)}`
    );
    const payload = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !payload.url) {
      throw new Error(payload.error || "Could not open file.");
    }
    return payload.url;
  }

  async function openFile(id: string) {
    try {
      window.open(await fileUrl(id), "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open file.");
    }
  }

  async function downloadFile(id: string, name: string) {
    try {
      const url = await fileUrl(id);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download file.");
    }
  }

  function openPicker(target: PendingUpload, uploadKey: string) {
    if (!target.requiredDocumentId) {
      setError("This document is not on the worker's workflow yet.");
      return;
    }
    setError(null);
    pendingRef.current = target;
    pendingKeyRef.current = uploadKey;
    fileInputRef.current?.click();
  }

  async function handleFilesSelected(selected: FileList | null) {
    const target = pendingRef.current;
    const uploadKey = pendingKeyRef.current;
    const chosen = selected ? Array.from(selected).slice(0, 1) : [];
    pendingRef.current = null;
    pendingKeyRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!target || chosen.length === 0) return;

    setUploadingKey(uploadKey);
    setError(null);
    try {
      const file = chosen[0];
      const form = new FormData();
      form.append("workerId", workerId);
      form.append("requiredDocumentId", target.requiredDocumentId);
      form.append("issuedDate", target.issuedDate);
      form.append("expiryDate", target.expiryDate);
      form.append("file", file);
      const res = await fetch("/api/admin/worker-credentials", { method: "POST", body: form });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error || `Could not upload ${file.name}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload certification.");
      await load().catch(() => undefined);
    } finally {
      setUploadingKey(null);
    }
  }

  function filesFor(licenseType: string) {
    return files.filter((file) => file.licenseType === licenseType);
  }

  return (
    <section className="mt-8">
      <div className="mb-4 border-b border-[#E5E7EB] pb-4">
        <h3 className="text-[20px] font-semibold leading-7 text-[#111827]">
          Pre-Identified Certifications
        </h3>
        <p className="mt-1 text-sm text-[#6B7280]">
          One current file per document. A new upload replaces it.
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
        onChange={(event) => {
          void handleFilesSelected(event.target.files);
        }}
      />

      {loading ? (
        <p className="text-sm text-[#6B7280]">Loading certifications...</p>
      ) : (
        <div className="space-y-3">
          {PRESET_SLOTS.map((slot, index) => {
            const document = documents.find((item) => item.code === slot.code);
            return (
            <CertificationCard
              key={slot.code}
              index={index + 1}
              title={slot.title}
              files={filesFor(slot.code)}
              uploading={uploadingKey === slot.code}
              onUpload={(dates) =>
                openPicker(
                  { requiredDocumentId: document?.id ?? "", ...dates },
                  slot.code
                )
              }
              onView={(id) => void openFile(id)}
              onDownload={(id, name) => void downloadFile(id, name)}
            />
            );
          })}

          {otherGroups.map((group, index) => (
            <CertificationCard
              key={group.name}
              index={PRESET_SLOTS.length + index + 1}
              title={group.name}
              files={group.files}
              uploading={uploadingKey === `other:${group.name.toLowerCase()}`}
              onUpload={(dates) =>
                openPicker(
                  { requiredDocumentId: group.files[0]?.requiredDocumentId ?? "", ...dates },
                  `other:${group.name.toLowerCase()}`
                )
              }
              onView={(id) => void openFile(id)}
              onDownload={(id, name) => void downloadFile(id, name)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CertificationCard({
  index,
  title,
  files,
  uploading,
  onUpload,
  onView,
  onDownload,
}: {
  index: number;
  title: string;
  files: CertificationFile[];
  uploading: boolean;
  onUpload: (dates: { issuedDate: string; expiryDate: string }) => void;
  onView: (id: string) => void;
  onDownload: (id: string, name: string) => void;
}) {
  const [issuedDate, setIssuedDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  return (
    <div className="w-full rounded-md border border-[#D1D5DB]">
      <div className="flex min-h-[44px] items-center justify-between gap-3 px-5 pt-3 pb-2">
        <div className="min-w-0 text-[16px] font-semibold leading-6 text-[#111827]">
          {index}. {title}
        </div>
        <button
          type="button"
          disabled={uploading}
          onClick={() => onUpload({ issuedDate, expiryDate })}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-[color:var(--brand-primary)] px-5 text-xs font-semibold text-white hover:brightness-95 disabled:opacity-50"
        >
          {uploading ? "Uploading..." : files.length > 0 ? "Replace" : "Upload"}
        </button>
      </div>

      <div className="space-y-2 px-5 py-3">
        <div className="flex flex-wrap gap-2">
          <input type="date" value={issuedDate} onChange={(event) => setIssuedDate(event.target.value)} aria-label={`${title} issued date`} className="h-8 rounded-md border border-[#D1D5DB] px-2 text-xs" />
          <input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} aria-label={`${title} expiry date`} className="h-8 rounded-md border border-[#D1D5DB] px-2 text-xs" />
        </div>
        {files.length === 0 ? (
          <div className="flex h-[50px] w-full max-w-[520px] items-center rounded-[8px] border border-dashed border-[color:color-mix(in_srgb,var(--brand-primary)_30%,white)] bg-[#F8FAFC] px-3 text-xs text-[#6B7280]">
            No Document
          </div>
        ) : (
          files.map((file) => {
            const name = file.originalFileName?.trim() || "Uploaded file";
            const pdf = isPdfFile(null, name);
            return (
              <div
                key={file.id}
                className="flex h-[50px] w-full max-w-[520px] items-center gap-2 rounded-[8px] border border-[color:color-mix(in_srgb,var(--brand-primary)_30%,white)] bg-[#F8FAFC] px-3"
              >
                <BrandedFileTypeIcon type={pdf ? "pdf" : "jpeg"} className="h-6 w-6 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold leading-4 text-[color:var(--brand-primary)]">
                    {name}
                  </div>
                  <div className="text-xs text-[#6B7280]">
                    {[file.issuingOrganization, file.scope, file.validity, file.issuedDate, file.expiryDate]
                      .filter(Boolean)
                      .join(" · ") || "Uploaded file"}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!file.hasFile}
                  onClick={() => onView(file.id)}
                  className="inline-flex h-5 w-5 items-center justify-center text-[color:var(--brand-primary)] disabled:opacity-40"
                  aria-label={`View ${name}`}
                >
                  <Eye className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  disabled={!file.hasFile}
                  onClick={() => onDownload(file.id, name)}
                  className="inline-flex h-5 w-5 items-center justify-center text-[color:var(--brand-primary)] disabled:opacity-40"
                  aria-label={`Download ${name}`}
                >
                  <Download className="h-5 w-5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

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
};

type PendingUpload = {
  licenseType: "bls_certification" | "acls_certification" | "other_certification";
  certificationName?: string;
};

const PRESET_SLOTS: Array<{
  licenseType: "bls_certification" | "acls_certification";
  title: string;
}> = [
  { licenseType: "bls_certification", title: "BLS" },
  { licenseType: "acls_certification", title: "ACLS" },
];

function groupOtherCertifications(files: CertificationFile[]) {
  const groups = new Map<string, { name: string; files: CertificationFile[] }>();
  for (const file of files) {
    if (file.licenseType !== "other_certification") continue;
    const name = file.certificationName?.trim() || "Other Certification";
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
  const [loading, setLoading] = useState(true);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [otherName, setOtherName] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/admin/worker-account-licenses?workerId=${encodeURIComponent(workerId)}`,
      { cache: "no-store" }
    );
    const payload = (await res.json().catch(() => ({}))) as {
      licenses?: CertificationFile[];
      error?: string;
    };
    if (!res.ok) throw new Error(payload.error || "Could not load certifications.");
    setFiles(
      (payload.licenses ?? []).filter((license) =>
        ["bls_certification", "acls_certification", "other_certification"].includes(
          license.licenseType
        )
      )
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
      `/api/admin/worker-account-files?workerId=${encodeURIComponent(workerId)}&source=license&id=${encodeURIComponent(id)}`
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
    if (target.licenseType === "other_certification" && !target.certificationName?.trim()) {
      setError("Enter the certification name.");
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
    const chosen = selected ? Array.from(selected) : [];
    pendingRef.current = null;
    pendingKeyRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!target || chosen.length === 0) return;

    setUploadingKey(uploadKey);
    setError(null);
    try {
      for (const file of chosen) {
        const form = new FormData();
        form.append("workerId", workerId);
        form.append("licenseType", target.licenseType);
        form.append("file", file);
        if (target.certificationName) form.append("certificationName", target.certificationName);
        const res = await fetch("/api/admin/worker-account-licenses", { method: "POST", body: form });
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(payload.error || `Could not upload ${file.name}.`);
      }
      if (target.licenseType === "other_certification" && target.certificationName === otherName.trim()) {
        setOtherName("");
      }
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
          BLS, ACLS, and any other certification this position requires. Each one can hold more than one document.
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
          {PRESET_SLOTS.map((slot, index) => (
            <CertificationCard
              key={slot.licenseType}
              index={index + 1}
              title={slot.title}
              files={filesFor(slot.licenseType)}
              uploading={uploadingKey === slot.licenseType}
              onUpload={() => openPicker({ licenseType: slot.licenseType }, slot.licenseType)}
              onView={(id) => void openFile(id)}
              onDownload={(id, name) => void downloadFile(id, name)}
            />
          ))}

          {otherGroups.map((group, index) => (
            <CertificationCard
              key={group.name}
              index={PRESET_SLOTS.length + index + 1}
              title={`Other Certification: ${group.name}`}
              files={group.files}
              uploading={uploadingKey === `other:${group.name.toLowerCase()}`}
              onUpload={() =>
                openPicker(
                  { licenseType: "other_certification", certificationName: group.name },
                  `other:${group.name.toLowerCase()}`
                )
              }
              onView={(id) => void openFile(id)}
              onDownload={(id, name) => void downloadFile(id, name)}
            />
          ))}

          <div className="w-full rounded-md border border-[#D1D5DB]">
            <div className="flex min-h-[44px] items-center justify-between gap-3 px-5 pt-3 pb-2">
              <div className="min-w-0 text-[16px] font-semibold leading-6 text-[#111827]">
                {PRESET_SLOTS.length + otherGroups.length + 1}. Other Certification
              </div>
            </div>
            <div className="flex flex-col gap-3 px-5 py-3 md:flex-row md:items-center">
              <input
                value={otherName}
                onChange={(event) => setOtherName(event.target.value)}
                maxLength={120}
                placeholder="Certification name required by this position"
                className="h-10 w-full rounded-md border border-[#D1D5DB] px-3 text-sm outline-none focus:border-[color:var(--brand-primary)] md:max-w-md"
              />
              <button
                type="button"
                disabled={uploadingKey === "other:new"}
                onClick={() =>
                  openPicker(
                    { licenseType: "other_certification", certificationName: otherName.trim() },
                    "other:new"
                  )
                }
                className="inline-flex h-8 items-center justify-center rounded-md bg-[color:var(--brand-primary)] px-5 text-xs font-semibold text-white hover:brightness-95 disabled:opacity-50"
              >
                {uploadingKey === "other:new" ? "Uploading..." : "Upload documents"}
              </button>
            </div>
          </div>
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
  onUpload: () => void;
  onView: (id: string) => void;
  onDownload: (id: string, name: string) => void;
}) {
  return (
    <div className="w-full rounded-md border border-[#D1D5DB]">
      <div className="flex min-h-[44px] items-center justify-between gap-3 px-5 pt-3 pb-2">
        <div className="min-w-0 text-[16px] font-semibold leading-6 text-[#111827]">
          {index}. {title}
        </div>
        <button
          type="button"
          disabled={uploading}
          onClick={onUpload}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-[color:var(--brand-primary)] px-5 text-xs font-semibold text-white hover:brightness-95 disabled:opacity-50"
        >
          {uploading ? "Uploading..." : files.length > 0 ? "Add documents" : "Upload"}
        </button>
      </div>

      <div className="space-y-2 px-5 py-3">
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
                  <div className="text-xs text-[#6B7280]">Uploaded file</div>
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

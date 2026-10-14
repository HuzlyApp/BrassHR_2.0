"use client";

import { CheckCircle2, Download, Eye, FileText, UploadCloud } from "lucide-react";
import { useRef } from "react";
import type { InspectableDocument } from "@/lib/onboarding/candidate-workflow-step-inspection";
import type { StepDocumentUploads, StepUploadSlot } from "@/lib/onboarding/staff-step-documents";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp";

const SLOT_STATUS: Record<string, { label: string; className: string }> = {
  approved: { label: "Approved", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/25" },
  uploaded: { label: "Uploaded", className: "bg-indigo-50 text-indigo-700 ring-indigo-600/25" },
  under_review: { label: "Under review", className: "bg-amber-50 text-amber-800 ring-amber-600/25" },
  needs_revision: { label: "Needs revision", className: "bg-orange-50 text-orange-800 ring-orange-600/25" },
  rejected: { label: "Rejected", className: "bg-red-50 text-red-700 ring-red-600/25" },
};
const MISSING_STATUS = { label: "Not uploaded", className: "bg-slate-100 text-slate-600 ring-slate-500/25" };

function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SlotRow({
  slot,
  document,
  canUpload,
  uploading,
  disabled,
  onUpload,
}: {
  slot: StepUploadSlot;
  document: InspectableDocument | null;
  canUpload: boolean;
  uploading: boolean;
  disabled: boolean;
  onUpload: (slot: StepUploadSlot, file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const status = slot.documentId
    ? SLOT_STATUS[String(slot.documentStatus ?? "uploaded").toLowerCase()] ?? SLOT_STATUS.uploaded
    : MISSING_STATUS;
  const uploadedAt = formatDateTime(document?.uploadedAt);

  return (
    <li className="rounded-lg border border-slate-200 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
            {slot.documentId ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            ) : (
              <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            )}
            {slot.title}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {slot.required ? "Required" : "Optional"}
            </span>
          </p>
          {document ? (
            <>
              <p className="mt-1 break-words text-xs text-slate-700">
                {document.originalFileName || "Uploaded file"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Uploaded by <span className="font-medium text-slate-700">{document.uploadedBy || "—"}</span>
                {uploadedAt ? ` · ${uploadedAt}` : ""}
              </p>
            </>
          ) : null}
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${status.className}`}
        >
          {status.label}
        </span>
      </div>

      {document?.reviewNotes ? <p className="mt-1 text-xs text-rose-700">{document.reviewNotes}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {document?.fileUnavailable ? (
          <p className="text-xs text-amber-800">File unavailable.</p>
        ) : document?.previewUrl ? (
          <>
            <a
              href={document.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold transition hover:brightness-95"
              style={{
                borderColor: "var(--brand-primary)",
                color: "var(--brand-primary)",
                backgroundColor: "color-mix(in srgb, var(--brand-primary) 6%, white)",
              }}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden />
              Preview
            </a>
            <a
              href={document.downloadUrl ?? document.previewUrl}
              target="_blank"
              rel="noreferrer"
              download={document.originalFileName ?? true}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Download
            </a>
          </>
        ) : null}
        {canUpload ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onUpload(slot, file);
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:brightness-[0.97] disabled:opacity-50"
              style={{ background: "var(--step-modal-cta)", color: "var(--step-modal-on-primary)" }}
            >
              <UploadCloud className="h-3.5 w-3.5" aria-hidden />
              {uploading ? "Uploading…" : slot.documentId ? "Replace" : "Upload"}
            </button>
          </>
        ) : null}
      </div>
    </li>
  );
}

export default function StepDocumentUploadsSection({
  uploads,
  documents,
  candidateStep,
  canEdit,
  uploadingKey,
  error,
  onUpload,
}: {
  uploads: StepDocumentUploads;
  documents: InspectableDocument[];
  /** Candidate-owned step, so a complete upload set lets staff finish it for the candidate. */
  candidateStep: boolean;
  canEdit: boolean;
  uploadingKey: string | null;
  error: string | null;
  onUpload: (slot: StepUploadSlot, file: File) => void;
}) {
  const documentById = new Map(documents.map((doc) => [doc.id, doc]));
  const filled = uploads.slots.filter((slot) => slot.documentId).length;
  const canUpload = canEdit && uploads.canUpload;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Documents</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {filled}/{uploads.slots.length}
        </span>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        {canUpload
          ? "Upload a document for the candidate if they sent it to you another way (email, text). It counts the same as the candidate's own upload."
          : "Documents for this step and who uploaded them."}
      </p>

      <ul className="space-y-3">
        {uploads.slots.map((slot) => (
          <SlotRow
            key={slot.key}
            slot={slot}
            document={slot.documentId ? documentById.get(slot.documentId) ?? null : null}
            canUpload={canUpload}
            uploading={uploadingKey === slot.key}
            disabled={uploadingKey != null}
            onUpload={onUpload}
          />
        ))}
      </ul>

      {error ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {candidateStep && canUpload && uploads.missingRequired.length > 0 ? (
        <p className="mt-3 text-xs text-slate-600">
          To mark this step complete for the candidate, upload: {uploads.missingRequired.join(", ")}.
        </p>
      ) : null}
    </section>
  );
}

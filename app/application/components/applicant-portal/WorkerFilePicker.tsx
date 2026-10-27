"use client";

import { useId, useRef, type RefObject } from "react";
import { Trash2 } from "lucide-react";
import BrandedFileTypeIcon from "@/app/admin_recruiter/components/BrandedFileTypeIcon";
import { WORKER_BTN_FILE_CHOOSE, WORKER_BTN_GHOST_ICON } from "./worker-portal-buttons";

type WorkerFilePickerProps = {
  id?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  accept?: string;
  disabled?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  emptyLabel?: string;
  error?: string;
};

function iconTypeForFile(file: File): "pdf" | "jpeg" | "docx" {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (name.endsWith(".pdf") || type === "application/pdf") return "pdf";
  if (
    name.endsWith(".doc") ||
    name.endsWith(".docx") ||
    type === "application/msword" ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (
    type.startsWith("image/") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png") ||
    name.endsWith(".gif") ||
    name.endsWith(".webp")
  ) {
    return "jpeg";
  }
  return "pdf";
}

export function WorkerFilePicker({
  id,
  file,
  onChange,
  accept = ".pdf,image/*",
  disabled = false,
  inputRef,
  emptyLabel = "No file chosen",
  error,
}: WorkerFilePickerProps) {
  const fallbackId = useId();
  const internalRef = useRef<HTMLInputElement>(null);
  const resolvedRef = inputRef ?? internalRef;

  function clearFile() {
    onChange(null);
    if (resolvedRef.current) resolvedRef.current.value = "";
  }

  return (
    <div>
      <div
        className={`rounded-lg border border-dashed bg-[#F8FAFC] p-3 ${
          error ? "border-red-300" : "border-[#D1D5DB]"
        }`}
      >
        {file ? (
          <div className="flex min-h-11 items-center gap-3">
            <BrandedFileTypeIcon type={iconTypeForFile(file)} className="h-8 w-8 shrink-0" />
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-[#334155]" title={file.name}>
              {file.name}
            </p>
            <button
              type="button"
              disabled={disabled}
              onClick={clearFile}
              className={`${WORKER_BTN_GHOST_ICON} shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700`}
              aria-label={`Remove ${file.name}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          <div className="flex min-h-11 flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={disabled}
              onClick={() => resolvedRef.current?.click()}
              className={WORKER_BTN_FILE_CHOOSE}
            >
              Choose file
            </button>
            <p className="min-w-0 flex-1 break-words text-sm text-[#64748B]">{emptyLabel}</p>
          </div>
        )}
        <input
          ref={resolvedRef}
          id={id ?? fallbackId}
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        />
      </div>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

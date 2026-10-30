"use client";

import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import { ListExportDropdown } from "@/app/admin_recruiter/components/ListExportDropdown";
import {
  BULK_SELECTION_SNACKBAR_BG,
  BULK_SELECTION_SNACKBAR_CLASS,
  BULK_SELECTION_SNACKBAR_LABEL_CLASS,
  BULK_SELECTION_SNACKBAR_ACTION_CLASS,
  BULK_SELECTION_SNACKBAR_ICON_BTN_CLASS,
} from "@/app/admin_recruiter/components/bulk-selection-snackbar-styles";
import { RotateCcw } from "lucide-react";

const JOBS_UNPUBLISH_ICON_SRC = "/icons/jobs-icons/unpublish.svg";
const JOBS_IMPORT_MSP_ICON_SRC = "/icons/jobs-icons/import-msp.svg";
const JOBS_ARCHIVE_ICON_SRC = "/icons/jobs-icons/archived.svg";
const JOBS_DELETE_ICON_SRC = "/icons/delete-icon.svg";

type JobsBulkSelectionSnackbarProps = {
  totalSelectedCount: number;
  unpublishDisabled?: boolean;
  archiveDisabled?: boolean;
  deleteDisabled?: boolean;
  exportDisabled?: boolean;
  busy?: boolean;
  onUnpublish: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onExportCsv: () => void;
  onExportXls: () => void;
  onImportFromMsp: () => void;
  onClear: () => void;
};

function SnackbarGlyph({
  src,
  className,
}: {
  src: string;
  className: string;
}) {
  return (
    <span className="relative size-4 shrink-0 overflow-hidden" aria-hidden>
      <BrandedSvgIcon
        src={src}
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${className}`}
        color="#FFFFFF"
      />
    </span>
  );
}

export function JobsBulkSelectionSnackbar({
  totalSelectedCount,
  unpublishDisabled = false,
  archiveDisabled = false,
  deleteDisabled = false,
  exportDisabled = false,
  busy = false,
  onUnpublish,
  onArchive,
  onDelete,
  onExportCsv,
  onExportXls,
  onImportFromMsp,
  onClear,
}: JobsBulkSelectionSnackbarProps) {
  if (totalSelectedCount <= 0) return null;

  const selectionLabel =
    totalSelectedCount === 1 ? "1 job selected" : `${totalSelectedCount} jobs selected`;

  return (
    <div
      className={`sticky top-0 z-20 ${BULK_SELECTION_SNACKBAR_CLASS}`}
      style={{
        backgroundColor: BULK_SELECTION_SNACKBAR_BG,
        borderColor: "var(--brand-primary)",
      }}
      role="status"
      aria-live="polite"
    >
      <p className={BULK_SELECTION_SNACKBAR_LABEL_CLASS}>
        {selectionLabel}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onUnpublish}
          disabled={busy || unpublishDisabled}
          className={BULK_SELECTION_SNACKBAR_ACTION_CLASS}
        >
          <SnackbarGlyph src={JOBS_UNPUBLISH_ICON_SRC} className="h-[9.33px] w-[14px]" />
          Unpublish
        </button>
        <button
          type="button"
          onClick={onArchive}
          disabled={busy || archiveDisabled}
          className={BULK_SELECTION_SNACKBAR_ACTION_CLASS}
        >
          <SnackbarGlyph src={JOBS_ARCHIVE_ICON_SRC} className="size-3.5" />
          Archive
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy || deleteDisabled}
          className={BULK_SELECTION_SNACKBAR_ACTION_CLASS}
        >
          <SnackbarGlyph src={JOBS_DELETE_ICON_SRC} className="size-4" />
          Delete
        </button>
        <ListExportDropdown
          variant="snackbar"
          onExportCsv={onExportCsv}
          onExportXls={onExportXls}
          disabled={busy || exportDisabled}
        />
        <button
          type="button"
          onClick={onImportFromMsp}
          disabled={busy}
          className={BULK_SELECTION_SNACKBAR_ACTION_CLASS}
        >
          <SnackbarGlyph src={JOBS_IMPORT_MSP_ICON_SRC} className="h-[11.87px] w-[13.2px]" />
          <span className="whitespace-nowrap">
            Import <span className="hidden sm:inline">from </span>MSP
          </span>
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          className={BULK_SELECTION_SNACKBAR_ICON_BTN_CLASS}
          aria-label="Clear selection"
          title="Clear selection"
        >
          <RotateCcw className="size-4 shrink-0" aria-hidden />
        </button>
      </div>
    </div>
  );
}

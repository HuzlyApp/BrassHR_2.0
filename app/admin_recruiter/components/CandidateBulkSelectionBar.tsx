"use client";

import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import { ListExportDropdown } from "@/app/admin_recruiter/components/ListExportDropdown";
import {
  BULK_SELECTION_SNACKBAR_BG,
  BULK_SELECTION_SNACKBAR_ACTION_CLASS,
  BULK_SELECTION_SNACKBAR_CLASS,
  BULK_SELECTION_SNACKBAR_ICON_BTN_CLASS,
  BULK_SELECTION_SNACKBAR_LABEL_CLASS,
} from "@/app/admin_recruiter/components/bulk-selection-snackbar-styles";
import { RefreshCw, RotateCcw, Sparkles } from "lucide-react";

const CANDIDATE_ARCHIVE_ICON_SRC = "/icons/jobs-icons/archived.svg";
const CANDIDATE_DELETE_ICON_SRC = "/icons/delete-icon.svg";

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

type CandidateBulkSelectionBarProps = {
  selectedCount: number;
  eligibleCount: number;
  scopeLabel?: string;
  claimBusy?: boolean;
  archiveBusy?: boolean;
  deleteBusy?: boolean;
  analyzeBusy?: boolean;
  archiveLabel?: string;
  archiveDisabled?: boolean;
  deleteDisabled?: boolean;
  exportDisabled?: boolean;
  analyzeDisabled?: boolean;
  reanalyzeDisabled?: boolean;
  hideClaim?: boolean;
  onClaim?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onAnalyze?: () => void;
  onReanalyze?: () => void;
  onExportCsv?: () => void;
  onExportXls?: () => void;
  onClear: () => void;
};

export function CandidateBulkSelectionBar({
  selectedCount,
  eligibleCount,
  scopeLabel,
  claimBusy = false,
  archiveBusy = false,
  deleteBusy = false,
  analyzeBusy = false,
  archiveLabel = "Archive",
  archiveDisabled = false,
  deleteDisabled = false,
  exportDisabled = false,
  analyzeDisabled = false,
  reanalyzeDisabled = false,
  hideClaim = false,
  onClaim,
  onArchive,
  onDelete,
  onAnalyze,
  onReanalyze,
  onExportCsv,
  onExportXls,
  onClear,
}: CandidateBulkSelectionBarProps) {
  if (selectedCount <= 0) return null;

  const selectedLabel =
    scopeLabel ||
    (selectedCount === 1 ? "1 candidate selected" : `${selectedCount} candidates selected`);
  const claimLabel = eligibleCount === 1 ? "Claim Candidate" : "Claim Candidates";
  const busy = claimBusy || archiveBusy || deleteBusy || analyzeBusy;
  const showExport = Boolean(onExportCsv && onExportXls);

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
      <div className="min-w-0">
        <p className={BULK_SELECTION_SNACKBAR_LABEL_CLASS}>{selectedLabel}</p>
        {!hideClaim && eligibleCount < selectedCount ? (
          <p className="text-xs text-[#B45309]">
            {eligibleCount} eligible to claim · {selectedCount - eligibleCount} will be skipped
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {showExport ? (
          <ListExportDropdown
            variant="snackbar"
            onExportCsv={onExportCsv!}
            onExportXls={onExportXls!}
            disabled={busy || exportDisabled}
          />
        ) : null}
        {onAnalyze ? (
          <button
            type="button"
            onClick={onAnalyze}
            disabled={busy || analyzeDisabled}
            className={BULK_SELECTION_SNACKBAR_ACTION_CLASS}
            title="Analyze selected candidates that have not been analyzed yet"
          >
            <Sparkles className="size-4 shrink-0" aria-hidden />
            {analyzeBusy ? "Analyzing…" : "Analyze"}
          </button>
        ) : null}
        {onReanalyze ? (
          <button
            type="button"
            onClick={onReanalyze}
            disabled={busy || reanalyzeDisabled}
            className={BULK_SELECTION_SNACKBAR_ACTION_CLASS}
            title="Reanalyze selected candidates that already have a match score"
          >
            <RefreshCw className="size-4 shrink-0" aria-hidden />
            Reanalyze
          </button>
        ) : null}
        {onArchive ? (
          <button
            type="button"
            onClick={onArchive}
            disabled={busy || archiveDisabled}
            className={BULK_SELECTION_SNACKBAR_ACTION_CLASS}
          >
            <SnackbarGlyph src={CANDIDATE_ARCHIVE_ICON_SRC} className="size-3.5" />
            {archiveBusy ? "Archiving…" : archiveLabel}
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy || deleteDisabled}
            className={BULK_SELECTION_SNACKBAR_ACTION_CLASS}
          >
            <SnackbarGlyph src={CANDIDATE_DELETE_ICON_SRC} className="size-4" />
            Delete
          </button>
        ) : null}
        {!hideClaim && onClaim ? (
          <button
            type="button"
            onClick={onClaim}
            disabled={busy || eligibleCount === 0}
            className={BULK_SELECTION_SNACKBAR_ACTION_CLASS}
          >
            {claimBusy ? "Claiming…" : claimLabel}
          </button>
        ) : null}
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

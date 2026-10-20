"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { invalidateCandidatesListCache } from "@/lib/workers/candidates-list-session-cache";
import toast from "react-hot-toast";
import {
  ApplicationStatusChangeModal,
  type ApplicationStatusOption,
} from "../applications/ApplicationStatusUi";
import { applicationStatusDotClassName, applicationStatusLabel } from "@/lib/jobs/application-status";
import { filterApplicationStatusesForSource } from "@/lib/jobs/msp-submission";
import { readStatusGroupFields } from "@/lib/jobs/application-statuses/groups";
import { GroupedStatusMenuList } from "@/app/admin_recruiter/components/GroupedStatusMenu";
import type { CandidateRow } from "./types";

const FORM_SURFACE_CLASS = "rounded-lg border border-[#CBD5E1] bg-white";
const STATUS_DROPDOWN_WIDTH = 240;
const STATUS_DROPDOWN_ESTIMATED_HEIGHT = 420;

export function mapWorkerProgressStatusFields(item: {
  application_id?: string | null;
  application_status_id?: string | null;
  application_status_name?: string | null;
  application_status_key?: string | null;
  application_status_ambiguous?: boolean | null;
  application_source_type?: string | null;
}) {
  return {
    progressStatusApplicationId: item.application_id?.trim() || null,
    progressStatusId: item.application_status_id?.trim() || null,
    progressStatusName: item.application_status_name?.trim() || null,
    progressStatusKey: item.application_status_key?.trim() || null,
    progressStatusAmbiguous: Boolean(item.application_status_ambiguous),
    applicationSourceType: item.application_source_type?.trim() || null,
  };
}

function progressStatusLabel(row: CandidateRow, options: ApplicationStatusOption[]): string {
  const fromOptions = options.find((option) => option.id === row.progressStatusId)?.name?.trim();
  return (
    fromOptions ||
    row.progressStatusName?.trim() ||
    (row.progressStatusKey ? applicationStatusLabel(row.progressStatusKey) : "") ||
    "—"
  );
}

function ProgressStatusDropdownPortal({
  options,
  currentStatusId,
  anchor,
  busy,
  onClose,
  onSelect,
}: {
  options: ApplicationStatusOption[];
  currentStatusId: string | null;
  anchor: HTMLElement;
  busy: boolean;
  onClose: () => void;
  onSelect: (option: ApplicationStatusOption) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });

  const updatePosition = useCallback(() => {
    const rect = anchor.getBoundingClientRect();
    let top = rect.bottom + 4;
    if (top + STATUS_DROPDOWN_ESTIMATED_HEIGHT > window.innerHeight - 8) {
      top = Math.max(8, rect.top - STATUS_DROPDOWN_ESTIMATED_HEIGHT - 4);
    }
    setStyle({
      position: "fixed",
      top,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - STATUS_DROPDOWN_WIDTH - 8)),
      width: STATUS_DROPDOWN_WIDTH,
      visibility: "visible",
    });
  }, [anchor]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition]);

  useEffect(() => {
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [updatePosition]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchor.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [anchor, onClose]);

  if (typeof document === "undefined") return null;

  const selectable = options.filter((option) => option.id !== currentStatusId);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={style}
      className="z-[200] max-h-72 overflow-y-auto rounded-xl border border-[#E5E7EB] bg-white py-1 text-left shadow-lg"
    >
      {selectable.length === 0 ? (
        <p className="px-3 py-2 text-sm text-[#94A3B8]">No other statuses</p>
      ) : (
        <GroupedStatusMenuList
          options={selectable}
          renderOption={(option) => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                onSelect(option);
                onClose();
              }}
              className="flex w-full items-center px-3 py-2 text-left text-sm text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-50"
            >
              {option.name}
            </button>
          )}
        />
      )}
    </div>,
    document.body
  );
}

export function CandidateProgressStatusCell({
  row,
  options,
  menuOpen,
  busy,
  onToggleMenu,
}: {
  row: CandidateRow;
  options: ApplicationStatusOption[];
  menuOpen: boolean;
  busy: boolean;
  onToggleMenu: (anchor: HTMLButtonElement) => void;
}) {
  const applicationId = row.progressStatusApplicationId?.trim() ?? "";
  if (!applicationId) {
    return <span className="text-sm text-[#94A3B8]">—</span>;
  }

  const label = progressStatusLabel(row, options);
  const optionColor = options.find((option) => option.id === row.progressStatusId)?.color?.trim();
  const fallbackKey = row.progressStatusKey || "new";

  return (
    <div className="inline-flex justify-center">
      <button
        type="button"
        disabled={busy || options.length === 0}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={`Change progress status for ${row.name || "candidate"}`}
        onClick={(event) => onToggleMenu(event.currentTarget)}
        className={`inline-flex h-8 w-fit items-center justify-center gap-2 whitespace-nowrap px-2.5 text-sm text-[#334155] transition hover:bg-zinc-50 disabled:opacity-50 ${FORM_SURFACE_CLASS}`}
        title={row.progressStatusAmbiguous ? "Latest application status" : "Change progress status"}
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${optionColor ? "" : applicationStatusDotClassName(fallbackKey)}`}
          style={optionColor ? { backgroundColor: optionColor } : undefined}
          aria-hidden
        />
        <span className="max-w-[7.5rem] truncate">{label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[#94A3B8] ${menuOpen ? "rotate-180" : ""}`}
        />
      </button>
    </div>
  );
}

export function useCandidateProgressStatus(
  candidates: CandidateRow[],
  setCandidates: Dispatch<SetStateAction<CandidateRow[]>>
) {
  const [statusOptions, setStatusOptions] = useState<ApplicationStatusOption[]>([]);
  const [statusMenu, setStatusMenu] = useState<{ workerId: string; anchor: HTMLElement } | null>(
    null
  );
  const [statusBusyWorkerId, setStatusBusyWorkerId] = useState<string | null>(null);
  const [pendingChange, setPendingChange] = useState<{
    workerId: string;
    applicationId: string;
    candidateName: string;
    fromLabel: string;
    toOption: ApplicationStatusOption;
  } | null>(null);
  const [statusChangeNote, setStatusChangeNote] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/application-statuses?activeOnly=1", {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Failed to load statuses");
        setStatusOptions(
          ((payload.statuses ?? []) as Array<Record<string, unknown>>).map((row) => ({
            id: String(row.id),
            name: String(row.name),
            systemKey: (row.systemKey as string | null) ?? null,
            color: (row.color as string | null) ?? null,
            sortOrder: Number(row.sortOrder ?? 0),
            ...readStatusGroupFields(row),
          }))
        );
      } catch {
        setStatusOptions([]);
      }
    })();
  }, []);

  const applyProgressStatus = useCallback(
    async (
      workerId: string,
      applicationId: string,
      toOption: ApplicationStatusOption,
      note?: string
    ) => {
      if (statusBusyWorkerId) {
        toast.error("Please wait — a status update is already in progress.");
        return;
      }
      setStatusBusyWorkerId(workerId);
      try {
        const response = await fetch(
          `/api/admin/job-applications/${encodeURIComponent(applicationId)}/status`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              statusId: toOption.id,
              note: note?.trim() || undefined,
            }),
          }
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            typeof payload.error === "string" ? payload.error : "Failed to update status"
          );
        }
        const nextStatusId = String(payload.application?.statusId ?? toOption.id);
        const nextStatusName = String(payload.application?.statusName ?? toOption.name);
        const nextStatusKey = String(payload.application?.status ?? toOption.systemKey ?? "");
        setCandidates((current) =>
          current.map((row) =>
            row.id === workerId
              ? {
                  ...row,
                  progressStatusId: nextStatusId,
                  progressStatusName: nextStatusName,
                  progressStatusKey: nextStatusKey || row.progressStatusKey,
                }
              : row
          )
        );
        setPendingChange(null);
        setStatusChangeNote("");
        invalidateCandidatesListCache();
        toast.success(`${nextStatusName} saved`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update status");
      } finally {
        setStatusBusyWorkerId(null);
      }
    },
    [setCandidates, statusBusyWorkerId]
  );

  const beginProgressStatusChange = useCallback(
    (row: CandidateRow, toOption: ApplicationStatusOption) => {
      const applicationId = row.progressStatusApplicationId?.trim();
      if (!applicationId) {
        toast.error("This candidate has no job application to update.");
        return;
      }
      if (row.progressStatusId === toOption.id) {
        toast.success(`Candidate is already ${toOption.name.toLowerCase()}`);
        return;
      }
      setStatusMenu(null);
      setPendingChange({
        workerId: row.id,
        applicationId,
        candidateName: row.name || "Candidate",
        fromLabel: progressStatusLabel(row, statusOptions),
        toOption,
      });
      setStatusChangeNote("");
    },
    [statusOptions]
  );

  const confirmProgressStatusChange = useCallback(async () => {
    if (!pendingChange || statusBusyWorkerId) return;
    await applyProgressStatus(
      pendingChange.workerId,
      pendingChange.applicationId,
      pendingChange.toOption,
      statusChangeNote
    );
  }, [applyProgressStatus, pendingChange, statusBusyWorkerId, statusChangeNote]);

  const menuRow = statusMenu
    ? candidates.find((row) => row.id === statusMenu.workerId) ?? null
    : null;

  const progressStatusUi = (
    <>
      {statusMenu && menuRow ? (
        <ProgressStatusDropdownPortal
          options={filterApplicationStatusesForSource(
            statusOptions,
            menuRow.applicationSourceType,
            menuRow.progressStatusId
          )}
          currentStatusId={menuRow.progressStatusId ?? null}
          anchor={statusMenu.anchor}
          busy={statusBusyWorkerId === statusMenu.workerId}
          onClose={() => setStatusMenu(null)}
          onSelect={(option) => beginProgressStatusChange(menuRow, option)}
        />
      ) : null}
      <ApplicationStatusChangeModal
        open={Boolean(pendingChange)}
        candidateName={pendingChange?.candidateName ?? ""}
        fromLabel={pendingChange?.fromLabel ?? ""}
        toLabel={pendingChange?.toOption.name ?? ""}
        note={statusChangeNote}
        busy={Boolean(pendingChange && statusBusyWorkerId === pendingChange.workerId)}
        onNoteChange={setStatusChangeNote}
        onCancel={() => {
          if (statusBusyWorkerId) return;
          setPendingChange(null);
          setStatusChangeNote("");
        }}
        onConfirm={() => void confirmProgressStatusChange()}
      />
    </>
  );

  return {
    statusOptions,
    statusMenu,
    setStatusMenu,
    statusBusyWorkerId,
    progressStatusUi,
  };
}

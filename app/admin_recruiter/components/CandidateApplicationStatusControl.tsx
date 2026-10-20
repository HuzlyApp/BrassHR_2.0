"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import { brandingToCssVars } from "@/lib/tenant/tenant-branding";
import { filterApplicationStatusesForSource } from "@/lib/jobs/msp-submission";
import { readStatusGroupFields } from "@/lib/jobs/application-statuses/groups";
import { filterStatusesForAssignedGroups } from "@/lib/jobs/application-statuses/stage-status-filter";
import { GroupedStatusMenuList } from "@/app/admin_recruiter/components/GroupedStatusMenu";

export type StatusOption = {
  id: string;
  name: string;
  systemKey: string | null;
  sortOrder?: number;
  groupId?: string | null;
  groupName?: string | null;
  groupDescription?: string | null;
  groupSortOrder?: number | null;
  groupSystemKey?: string | null;
  buttonLane?: string | null;
};

type StatusHistoryItem = {
  id: string;
  fromStatus: { id: string | null; name: string | null };
  toStatus: { id: string | null; name: string };
  note: string | null;
  changedBy: { id: string | null; name: string | null };
  changedAt: string;
};

type ApplicationContext = {
  applicationId: string | null;
  ambiguous: boolean;
  statusId: string | null;
  statusName: string | null;
  jobTitle: string | null;
  jobSourceType: string | null;
};

type CandidateApplicationStatusControlProps = {
  workerId?: string;
  /** When set, updates this job application instead of the worker’s primary/ambiguous lookup. */
  applicationId?: string | null;
  /** Fallback label when no application status exists (e.g. worker pipeline label). */
  fallbackStatus?: string | null;
  compact?: boolean;
  /** Override chip classes (e.g. AI Analysis Overview header). */
  buttonClassName?: string;
  /**
   * Pre-Hire stage or AI analysis step. The menu lists statuses from the groups
   * assigned to this stage in Settings, plus Closed. Job source does not remove them.
   */
  stageName?: string | null;
  onStatusChanged?: (next: { statusName: string; statusId: string }) => void;
};

function firstRelation(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? (row as Record<string, unknown>) : null;
}

export function mapApplicationStatusOptions(payload: unknown): StatusOption[] {
  const rows =
    payload && typeof payload === "object" && Array.isArray((payload as { statuses?: unknown }).statuses)
      ? ((payload as { statuses: Array<Record<string, unknown>> }).statuses)
      : [];
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    systemKey: typeof row.systemKey === "string" ? row.systemKey : null,
    sortOrder: Number(row.sortOrder ?? 0),
    buttonLane: typeof row.buttonLane === "string" ? row.buttonLane : null,
    ...readStatusGroupFields(row),
  }));
}

export function resolveApplicationStatusFromPayload(
  application: { status?: unknown; status_id?: unknown },
  options: StatusOption[]
): { statusId: string | null; statusName: string | null } {
  const statusId = application.status_id != null && application.status_id !== ""
    ? String(application.status_id)
    : null;
  const byId = statusId ? options.find((option) => option.id === statusId) : undefined;
  if (byId) return { statusId: byId.id, statusName: byId.name };
  const key = String(application.status ?? "").trim().toLowerCase();
  const byKey = key
    ? options.find((option) => (option.systemKey ?? "").toLowerCase() === key)
    : undefined;
  if (byKey) return { statusId: byKey.id, statusName: byKey.name };
  return {
    statusId,
    statusName: String(application.status ?? "").trim() || null,
  };
}

export function jobTitleFromApplicationPayload(application: Record<string, unknown>): string | null {
  const job = firstRelation(application.job_requisitions);
  const title = job?.public_title;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

function formatHistoryDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", { timeZone: "America/New_York", 
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const MENU_MIN_WIDTH = 240;
const MENU_MAX_HEIGHT = 360;

function StatusOptionsMenu({
  anchor,
  options,
  currentStatusId,
  emptyLabel,
  onSelect,
  onClose,
}: {
  anchor: HTMLElement;
  options: StatusOption[];
  currentStatusId: string | null;
  emptyLabel?: string;
  onSelect: (option: StatusOption) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const branding = useTenantBranding();
  const brandVars = brandingToCssVars(branding) as CSSProperties;
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });

  const updatePosition = useCallback(() => {
    const rect = anchor.getBoundingClientRect();
    const width = Math.max(
      MENU_MIN_WIDTH,
      Math.min(Math.max(rect.width, MENU_MIN_WIDTH), window.innerWidth - 16)
    );
    let top = rect.bottom + 4;
    if (top + MENU_MAX_HEIGHT > window.innerHeight - 8) {
      top = Math.max(8, rect.top - MENU_MAX_HEIGHT - 4);
    }
    let left = rect.right - width;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    setStyle({
      position: "fixed",
      top,
      left,
      width,
      maxHeight: MENU_MAX_HEIGHT,
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

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Application statuses"
      style={{ ...brandVars, ...style }}
      className="z-[200] overflow-y-auto rounded-xl border border-[#E5E7EB] bg-white py-1 shadow-lg"
    >
      {options.length ? (
        <GroupedStatusMenuList
          options={options}
          renderOption={(option) => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              onClick={() => onSelect(option)}
              className="flex min-h-9 w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-[#334155] hover:bg-[#F8FAFC]"
            >
              <span>{option.name}</span>
              {option.id === currentStatusId ? (
                <Check className="h-4 w-4 text-[color:var(--brand-primary)]" />
              ) : null}
            </button>
          )}
        />
      ) : (
        <p className="px-3 py-2 text-sm text-[#98A2B3]">
          {emptyLabel || "No statuses available"}
        </p>
      )}
    </div>,
    document.body
  );
}

export function CandidateApplicationStatusControl({
  workerId,
  applicationId: applicationIdProp,
  fallbackStatus,
  compact = true,
  buttonClassName,
  stageName,
  onStatusChanged,
}: CandidateApplicationStatusControlProps) {
  const [ctx, setCtx] = useState<ApplicationContext | null>(null);
  const [options, setOptions] = useState<StatusOption[]>([]);
  const [stageAssignments, setStageAssignments] = useState<
    Array<{ stageName: string; groupId: string }> | null
  >(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState<StatusOption | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const load = useCallback(async () => {
    const scopedApplicationId = applicationIdProp?.trim() || "";
    const scopedWorkerId = workerId?.trim() || "";
    if (!scopedApplicationId && !scopedWorkerId) return;
    setLoading(true);
    try {
      const statusRes = await fetch("/api/admin/application-statuses?activeOnly=1", {
        cache: "no-store",
      });
      const statusPayload = await statusRes.json();
      if (!statusRes.ok) throw new Error(statusPayload.error || "Failed to load statuses");
      const nextOptions = mapApplicationStatusOptions(statusPayload);
      setOptions(nextOptions);

      if (scopedApplicationId) {
        const appRes = await fetch(
          `/api/admin/job-applications/${encodeURIComponent(scopedApplicationId)}`,
          { cache: "no-store" }
        );
        const appPayload = await appRes.json();
        if (!appRes.ok) throw new Error(appPayload.error || "Failed to load application");
        const application =
          appPayload.application && typeof appPayload.application === "object"
            ? (appPayload.application as Record<string, unknown>)
            : {};
        const resolved = resolveApplicationStatusFromPayload(application, nextOptions);
        const job = firstRelation(application.job_requisitions);
        setCtx({
          applicationId: scopedApplicationId,
          ambiguous: false,
          statusId: resolved.statusId,
          statusName: resolved.statusName,
          jobTitle: jobTitleFromApplicationPayload(application),
          jobSourceType: typeof job?.source_type === "string" ? job.source_type : null,
        });
        return;
      }

      const ctxRes = await fetch(
        `/api/admin/workers/${encodeURIComponent(scopedWorkerId)}/application-status`,
        { cache: "no-store" }
      );
      const ctxPayload = await ctxRes.json();
      if (!ctxRes.ok) throw new Error(ctxPayload.error || "Failed to load application status");

      setCtx({
        applicationId: ctxPayload.applicationId ?? null,
        ambiguous: Boolean(ctxPayload.ambiguous),
        statusId: ctxPayload.status?.id ?? null,
        statusName: ctxPayload.status?.name ?? null,
        jobTitle: ctxPayload.jobTitle ?? null,
        jobSourceType: typeof ctxPayload.sourceType === "string" ? ctxPayload.sourceType : null,
      });
    } catch (error) {
      console.error(error);
      setCtx(null);
    } finally {
      setLoading(false);
    }
  }, [applicationIdProp, workerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stageFilter = stageName?.trim() || "";
  useEffect(() => {
    if (!stageFilter) {
      setStageAssignments(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/admin/application-status-stage-assignments", {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Failed to load stage statuses");
        const rows = Array.isArray(payload.assignments) ? payload.assignments : [];
        if (cancelled) return;
        setStageAssignments(
          rows
            .map((row: { stageName?: unknown; groupId?: unknown }) => ({
              stageName: typeof row.stageName === "string" ? row.stageName : "",
              groupId: typeof row.groupId === "string" ? row.groupId : "",
            }))
            .filter((row: { stageName: string; groupId: string }) => row.stageName && row.groupId)
        );
      } catch (error) {
        console.error(error);
        if (!cancelled) setStageAssignments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stageFilter]);

  const label =
    ctx?.statusName?.trim() ||
    fallbackStatus?.trim() ||
    (loading ? "…" : "No status");

  function beginChange(option: StatusOption) {
    if (!ctx?.applicationId) {
      toast.error("This candidate has no job application to update.");
      return;
    }
    if (ctx.ambiguous) {
      toast.error("This candidate has multiple applications. Update status from Applications.");
      return;
    }
    if (option.id === ctx.statusId) {
      setMenuOpen(false);
      return;
    }
    setMenuOpen(false);
    setPending(option);
    setNote("");
  }

  async function confirmChange() {
    if (!ctx?.applicationId || !pending) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(ctx.applicationId)}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            statusId: pending.id,
            note: note.trim() || undefined,
            stageName: stageFilter || undefined,
          }),
        }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to update status");

      const nextName = String(payload.application?.statusName ?? pending.name);
      const nextId = String(payload.application?.statusId ?? pending.id);
      setCtx((current) =>
        current
          ? {
              ...current,
              statusId: nextId,
              statusName: nextName,
              jobSourceType: current.jobSourceType,
            }
          : current
      );
      setPending(null);
      setNote("");
      toast.success(
        payload.unchanged ? "Status unchanged" : `Status updated to ${nextName}`
      );
      onStatusChanged?.({ statusName: nextName, statusId: nextId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update status");
    } finally {
      setBusy(false);
    }
  }

  const chipClass =
    buttonClassName ??
    (compact
      ? "inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1 truncate rounded-md border border-[#D1D5DB] bg-white px-1.5 text-center text-[10px] font-semibold leading-4 text-[#111827] min-[700px]:max-w-none min-[700px]:flex-none min-[700px]:px-3 min-[700px]:text-xs disabled:opacity-50"
      : "inline-flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-[#CBD5E1] bg-white px-3 text-sm text-[#334155] disabled:opacity-50");

  const canChangeStatus = Boolean(ctx?.applicationId) && !ctx?.ambiguous && !loading && !busy;
  const visibleOptions = useMemo(() => {
    if (!stageFilter) {
      return filterApplicationStatusesForSource(options, ctx?.jobSourceType, ctx?.statusId);
    }
    if (stageAssignments == null) return [];
    const assignedGroupIds = stageAssignments
      .filter((row) => row.stageName === stageFilter)
      .map((row) => row.groupId);
    return filterStatusesForAssignedGroups(options, assignedGroupIds, ctx?.statusId);
  }, [options, ctx?.jobSourceType, ctx?.statusId, stageFilter, stageAssignments]);

  return (
    <>
      <div
        className={
          buttonClassName
            ? "relative z-20 shrink-0"
            : "relative z-20 min-w-0 flex-1 min-[700px]:flex-none"
        }
      >
        <button
          ref={buttonRef}
          type="button"
          disabled={loading || busy || !ctx?.applicationId}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className={chipClass}
          title={
            ctx?.ambiguous
              ? "Multiple applications — open Applications to change status"
              : ctx?.jobTitle
                ? `Application status for ${ctx.jobTitle}`
                : "Change application status"
          }
        >
          <span className="min-w-0 truncate">{label}</span>
          {canChangeStatus ? (
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 ${menuOpen ? "rotate-180" : ""}`} />
          ) : null}
        </button>
        {menuOpen && buttonRef.current ? (
          <StatusOptionsMenu
            anchor={buttonRef.current}
            options={visibleOptions}
            currentStatusId={ctx?.statusId ?? null}
            emptyLabel={
              stageFilter
                ? stageAssignments == null
                  ? "Loading statuses for this step…"
                  : "No statuses assigned to this step yet. Add a status group in Settings. Closed stays available once those statuses exist."
                : undefined
            }
            onSelect={beginChange}
            onClose={closeMenu}
          />
        ) : null}
      </div>

      {pending ? (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="candidate-change-status-title"
            className="w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xl"
          >
            <h2
              id="candidate-change-status-title"
              className="text-lg font-semibold text-[#0F172A]"
            >
              Change Status
            </h2>
            <p className="mt-1 text-sm text-[#64748B]">
              {label} → {pending.name}
            </p>
            <label className="mt-4 block space-y-1.5">
              <span className="text-sm font-medium text-[#0F172A]">Note (optional)</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={4}
                className="w-full resize-none rounded-xl border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#334155] outline-none"
                placeholder="Add context for this status change…"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setPending(null);
                  setNote("");
                }}
                className="h-10 rounded-xl border border-[#CBD5E1] bg-white px-4 text-sm font-medium text-[#334155]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmChange()}
                className="h-10 rounded-xl bg-[#012352] px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Updating…" : "Update Status"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function CandidateStatusHistoryPanel({
  workerId,
  layout = "page",
}: {
  workerId: string;
  layout?: "page" | "sidebar";
}) {
  const [history, setHistory] = useState<StatusHistoryItem[]>([]);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!workerId) return;
      setLoading(true);
      setError(null);
      try {
        const ctxRes = await fetch(
          `/api/admin/workers/${encodeURIComponent(workerId)}/application-status`,
          { cache: "no-store" }
        );
        const ctxPayload = await ctxRes.json();
        if (!ctxRes.ok) throw new Error(ctxPayload.error || "Failed to load status");
        const appId = typeof ctxPayload.applicationId === "string" ? ctxPayload.applicationId : null;
        if (cancelled) return;
        setApplicationId(appId);
        if (!appId) {
          setHistory([]);
          return;
        }
        const histRes = await fetch(
          `/api/admin/job-applications/${encodeURIComponent(appId)}/status-history`,
          { cache: "no-store" }
        );
        const histPayload = await histRes.json();
        if (!histRes.ok) throw new Error(histPayload.error || "Failed to load history");
        if (!cancelled) {
          setHistory((histPayload.history ?? []) as StatusHistoryItem[]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load status history");
          setHistory([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [workerId]);

  if (!applicationId && !loading) {
    return null;
  }

  return (
    <section
      className={
        layout === "page"
          ? "mb-6 rounded-xl border border-[#E5E7EB] bg-white p-4 sm:p-5"
          : "mb-4 rounded-xl border border-[#E5E7EB] bg-white p-3"
      }
    >
      <h3 className="text-sm font-semibold text-[#0F172A]">Status History</h3>
      {loading ? (
        <p className="mt-2 text-xs text-[#94A3B8]">Loading history…</p>
      ) : error ? (
        <p className="mt-2 text-xs text-[#B91C1C]">{error}</p>
      ) : history.length === 0 ? (
        <p className="mt-2 text-xs text-[#94A3B8]">No status changes yet.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {history.map((entry) => (
            <div key={entry.id} className="border-l-2 border-[#CBD5E1] pl-3">
              <p className="text-sm font-medium text-[#0F172A]">{entry.toStatus.name}</p>
              <p className="mt-0.5 text-xs text-[#94A3B8]">
                {formatHistoryDate(entry.changedAt)} · {entry.changedBy.name || "System"}
              </p>
              {entry.fromStatus.name ? (
                <p className="mt-0.5 text-xs text-[#64748B]">From {entry.fromStatus.name}</p>
              ) : (
                <p className="mt-0.5 text-xs text-[#64748B]">Application created</p>
              )}
              {entry.note?.trim() ? (
                <p className="mt-1 text-xs leading-5 text-[#475569]">{entry.note}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

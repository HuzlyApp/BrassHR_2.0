"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import DetailedCandidateHeader from "../../../components/DetailedCandidateHeader";
import DetailedTabs from "../../../components/DetailedTabs";
import CandidateDetailLoader from "../../../components/CandidateDetailLoader";
import CandidateAvatarIcon from "../../../components/CandidateAvatarIcon";
import BrandedHistoryIcon from "../../../components/BrandedHistoryIcon";
import AddCallLogModal from "../../../components/AddCallLogModal";
import { checklistSectionDetailHref } from "@/lib/admin/checklist-section-navigation";
import { dispatchCandidatePipelineRefresh } from "@/lib/admin/candidate-pipeline-events";
import { Check, CheckCircle2, MoreVertical } from "lucide-react";

type ItemState = "pending" | "complete" | "uploaded" | "answered" | "warning" | "not_reachable" | "not_applicable";

type ChecklistRow = {
  id: string;
  title: string;
  subtitle?: string;
  state: ItemState;
  optional?: boolean;
  checked?: boolean;
  detailLine?: string;
  badge?: string;
  manualCompletionEnabled?: boolean;
  callLogCompleted?: boolean;
  checkboxLabel?: string;
  callOutcome?: "answered" | "no_answer" | null;
};

type ChecklistSection = {
  id: string;
  title: string;
  subtitle?: string;
  rows: ChecklistRow[];
};

type ChecklistActivityEntry = {
  id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: unknown;
  created_at: string | null;
};

type ChecklistPayload = {
  worker: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email?: string | null;
    job_role: string | null;
    city: string | null;
    state: string | null;
    created_at: string | null;
    updated_at?: string | null;
    status_label: string;
    profile_photo_url?: string | null;
  };
  activity_history?: ChecklistActivityEntry[];
  meta: {
    daysInStage: number;
    progressPercent: number;
    completedItems: number;
    totalItems: number;
    verifiedDocuments: { done: number; total: number };
    skillAssessments: { completed: number; total: number };
  };
  tracker: { labels: string[]; done: boolean[] };
  sections: ChecklistSection[];
  permissions?: { canManualCompleteScreening?: boolean; canManualCompletePipeline?: boolean };
};

function badgeClasses(state: ItemState): string {
  switch (state) {
    case "uploaded":
      return "bg-[#00B135] text-white border-[#00B135]";
    case "complete":
      return "bg-emerald-50 text-emerald-800 border-emerald-100";
    case "answered":
      return "bg-[#00B135] text-white border-[#00B135]";
    case "warning":
      return "bg-amber-50 text-amber-900 border-amber-100";
    case "not_reachable":
      return "bg-[#FB7185] text-white border-[#FB7185]";
    case "not_applicable":
      return "bg-slate-50 text-gray-600 border-slate-100";
    default:
      return "bg-white text-[#374151] border-[#D1D5DB]";
  }
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return hrs === 1 ? "1 hour ago" : `${hrs} hours ago`;
  const days = Math.floor(hrs / 24);
  if (days < 14) return days === 1 ? "1 day ago" : `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  return months <= 1 ? "1 month ago" : `${months} months ago`;
}

function formatDateTimeParts(iso: string): { dateLine: string; timeLine: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { dateLine: "—", timeLine: "—" };
  }
  const dateLine = d.toLocaleDateString("en-US", { timeZone: "America/New_York", 
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeLine = d.toLocaleTimeString("en-US", { timeZone: "America/New_York", 
    hour: "numeric",
    minute: "2-digit",
  });
  return { dateLine, timeLine };
}

type RecentHistoryRow = {
  key: string;
  title: string;
  metaLine: string;
};

function buildRecentHistoryRows(data: ChecklistPayload | null): RecentHistoryRow[] {
  if (!data) return [];

  const logs = data.activity_history ?? [];
  const withTime = logs.filter((e) => e.created_at?.trim());
  if (withTime.length > 0) {
    return withTime.map((entry, index) => {
      const at = entry.created_at!.trim();
      const { dateLine, timeLine } = formatDateTimeParts(at);
      return {
        key: entry.id ?? `activity-${index}`,
        title: entry.action?.trim() || "Activity",
        metaLine: `${formatRelative(at)} • ${dateLine} • ${timeLine}`,
      };
    });
  }

  const w = data.worker;
  const created = w.created_at?.trim() ?? "";
  const updatedRaw = w.updated_at?.trim() ?? "";
  const updated = updatedRaw && updatedRaw !== created ? updatedRaw : "";

  type Row = { key: string; title: string; at: string };
  const rows: Row[] = [];
  if (created) {
    rows.push({ key: "created", title: "Applicant record created", at: created });
  }
  if (updated) {
    rows.push({ key: "updated", title: "Applicant profile updated", at: updated });
  }
  rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return rows.map((r) => {
    const { dateLine, timeLine } = formatDateTimeParts(r.at);
    return {
      key: r.key,
      title: r.title,
      metaLine: `${formatRelative(r.at)} • ${dateLine} • ${timeLine}`,
    };
  });
}

const MANUAL_PIPELINE_SECTION_IDS = new Set([
  "screening",
  "compliance",
  "facility_req",
  "new_hire",
  "final",
]);

function rowIsComplete(row: ChecklistRow): boolean {
  return (
    row.checked === true ||
    row.state === "answered" ||
    row.state === "complete" ||
    row.state === "uploaded"
  );
}

function pipelineCheckboxText(row: ChecklistRow): string {
  if (row.checkboxLabel?.trim()) return row.checkboxLabel.trim();
  const subtitle = row.subtitle?.trim() ?? "";
  if (subtitle && !subtitle.startsWith("(")) return subtitle.replace(/^\d+\.\s*/, "");
  const cleanTitle = row.title.replace(/^\d+\.\s*/, "");
  if (row.id === "oig") return "For Verification";
  if (row.id === "drug") return "For Drug Test";
  if (row.id === "bg") return "For Background Check";
  return `For ${cleanTitle}`;
}

function pendingDetailLine(row: ChecklistRow): string | undefined {
  if (row.id === "call_1" || row.id === "call_2") return "No call logs synced yet";
  return undefined;
}

function completedDetailLine(row: ChecklistRow, manualOnly: boolean): string | undefined {
  if (row.id === "call_1" || row.id === "call_2") {
    if (row.callLogCompleted && !manualOnly) return "Completed via call log sync";
    return "Completed manually";
  }
  return "Completed manually";
}

function RowBadge({ text, state }: { text: string; state: ItemState }) {
  return (
    <span
      className={`inline-flex h-6 min-w-16 items-center justify-center rounded-[4px] border px-2 py-1 text-center text-xs font-semibold leading-4 ${badgeClasses(state)}`}
    >
      {text}
    </span>
  );
}

export default function NewApplicantChecklistPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const applicantId = params?.id;

  // Checklist tab is disabled for now; redirect to Profile tab (kept for future use)
  useEffect(() => {
    if (applicantId) {
      router.replace(`/admin_recruiter/new/profile/${applicantId}`);
    }
  }, [applicantId, router]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ChecklistPayload | null>(null);
  const [pipelineSaveError, setPipelineSaveError] = useState<string | null>(null);
  const [savingPipelineItemId, setSavingPipelineItemId] = useState<string | null>(null);
  const [callLogModalOpen, setCallLogModalOpen] = useState(false);
  const [callLogAttempt, setCallLogAttempt] = useState<number | null>(null);

  const canManualCompletePipeline =
    data?.permissions?.canManualCompletePipeline !== false &&
    data?.permissions?.canManualCompleteScreening !== false;

  async function togglePipelineItem(row: ChecklistRow, sectionId: string) {
    if (!applicantId || !canManualCompletePipeline) return;
    if (!MANUAL_PIPELINE_SECTION_IDS.has(sectionId)) return;

    const nextCompleted = !rowIsComplete(row);
    const optimisticCompleted = nextCompleted || row.callLogCompleted === true;

    const previousData = data;
    setPipelineSaveError(null);
    setSavingPipelineItemId(row.id);

    setData((current) => {
      if (!current) return current;
      const nextState: ItemState = optimisticCompleted
        ? "complete"
        : row.optional
          ? "not_applicable"
          : "pending";
      return {
        ...current,
        sections: current.sections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                rows: section.rows.map((item) =>
                  item.id === row.id
                    ? {
                        ...item,
                        checked: optimisticCompleted,
                        state: nextState,
                        badge: optimisticCompleted ? "Complete" : "Pending",
                        detailLine: optimisticCompleted
                          ? item.callLogCompleted && !nextCompleted
                            ? completedDetailLine(item, false)
                            : completedDetailLine(item, true)
                          : pendingDetailLine(item),
                      }
                    : item
                ),
              }
            : section
        ),
      };
    });

    try {
      const res = await fetch("/api/admin/worker-checklist/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workerId: applicantId,
          itemKey: row.id,
          completed: nextCompleted,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        row?: ChecklistRow;
        sectionId?: string;
      };
      if (!res.ok) throw new Error(json.error || "Failed to save checklist item");

      if (json.row) {
        const targetSectionId = json.sectionId ?? sectionId;
        setData((current) => {
          if (!current) return current;
          return {
            ...current,
            sections: current.sections.map((section) =>
              section.id === targetSectionId
                ? {
                    ...section,
                    rows: section.rows.map((item) =>
                      item.id === row.id ? { ...item, ...json.row } : item
                    ),
                  }
                : section
            ),
          };
        });
      }

      if (applicantId) {
        dispatchCandidatePipelineRefresh(applicantId);
      }
    } catch (e) {
      console.error(e);
      setData(previousData);
      setPipelineSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingPipelineItemId(null);
    }
  }

  async function loadChecklist(options?: { silent?: boolean }) {
    if (!applicantId) return;
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/worker-checklist?workerId=${encodeURIComponent(applicantId)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as ChecklistPayload & { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to load checklist");
      setData(json);
    } catch (e) {
      console.error(e);
      if (!options?.silent) {
        setError(e instanceof Error ? e.message : "Failed to load");
        setData(null);
      }
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadChecklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicantId]);

  const candidateName = useMemo(() => {
    const w = data?.worker;
    const n = `${w?.first_name ?? ""} ${w?.last_name ?? ""}`.trim();
    return n || "Applicant";
  }, [data?.worker]);

  const candidateRole = data?.worker?.job_role || "N/A";
  const candidateLocation = useMemo(() => {
    const parts = [data?.worker?.city ?? "", data?.worker?.state ?? ""].filter(Boolean);
    return parts.length ? parts.join(", ") : "—";
  }, [data?.worker?.city, data?.worker?.state]);

  const recentHistoryRows = useMemo(() => buildRecentHistoryRows(data), [data]);

  return (
    <div className="w-full min-w-0 overflow-auto admin-recruiter-page-pad">
      <div className="admin-recruiter-content-width">
        <CandidateDetailLoader label="Opening candidate profile..." />
      </div>

      {/* Checklist tab content is hidden for now and not needed in candidate details screen. Kept for future use. */}
      {false && (
        <>
          <div className="admin-recruiter-content-width">
            <DetailedTabs applicantId={applicantId} activeTab="Checklist" checklistPayload={data} />

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            {pipelineSaveError ? (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {pipelineSaveError}
              </div>
            ) : null}

            {loading ? (
              <CandidateDetailLoader label="Loading checklist..." />
            ) : (
              <>
            <DetailedCandidateHeader
              name={candidateName}
              role={candidateRole}
              status={data?.worker?.status_label}
              profilePhotoUrl={data?.worker?.profile_photo_url}
              workerId={applicantId}
              candidateEmail={data?.worker?.email ?? null}
            />

            <div className="flex w-full min-w-0 admin-recruiter-content-width flex-col gap-[30px] overflow-hidden rounded-md border border-[#E5E7EB] bg-white p-5">
              <div className="hidden p-3 sm:p-4 border-b border-[#9CC3FF]/30 bg-white/40">
                <div className="flex h-[92px] w-full min-w-0 items-center justify-between rounded-md border border-[#D1D5DB] bg-white px-5">
                  <div className="flex items-center gap-3">
                    <CandidateAvatarIcon />
                    <div>
                      <div className="text-base font-semibold leading-6 text-[#0D9488]">
                        {loading ? "John Doe" : candidateName || "John Doe"}
                      </div>
                      <div className="mt-0.5 text-xs font-normal leading-4 text-[#4B5563]">
                        {candidateRole || "Licensed Practical Nurse , LPN"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex h-8 items-center justify-center rounded-md border border-[#D1D5DB] bg-white px-3 text-center text-xs font-semibold leading-4 text-[#111827] hover:bg-[#F9FAFB]"
                    >
                      New Applicant
                    </button>
                    <button
                      type="button"
                      aria-label="More options"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-[#6B7280] hover:bg-[#F3F4F6]"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-[30px]">
                <div className="w-full rounded-md border border-[#0D9488] bg-[#F8FAFC] px-3 py-3 sm:px-6 sm:py-5">
                  <div className="flex min-w-0 flex-row flex-nowrap items-center justify-between gap-2">
                    <div className="min-w-0 truncate text-[11px] font-semibold leading-4 text-[#1F2937] sm:text-sm sm:leading-5">
                      Progress Checklist Tracker
                    </div>
                    <div className="shrink-0 whitespace-nowrap text-[10px] font-normal leading-4 text-[#374151] sm:text-xs sm:leading-5">
                      Days in current stage:{" "}
                      <span className="font-semibold text-[#1F2937]">{data?.meta?.daysInStage ?? "—"} days</span>
                    </div>
                  </div>
                  <div className="mt-3 flex w-full items-center gap-2 sm:mt-4 sm:gap-4">
                    <div className="h-[8px] min-w-0 flex-1 overflow-hidden rounded-[100px] bg-[#ECF1F9] sm:h-[10px]">
                      <div
                        className="h-full rounded-[100px] bg-[#0D9488] transition-all"
                        style={{ width: `${data?.meta?.progressPercent ?? 0}%` }}
                      />
                    </div>
                    <div className="shrink-0 text-xs font-semibold leading-4 text-[#111827] sm:text-sm sm:leading-5">
                      {data?.meta?.progressPercent ?? 0}%
                    </div>
                  </div>
                </div>

                <main className="@container/checklist-main space-y-4">
                    <div className="grid w-full min-w-0 grid-cols-1 gap-4 @min-[680px]:grid-cols-2 @min-[680px]:gap-[30px]">
                      {(data?.sections ?? []).map((section, sectionIndex) => (
                        <div
                          key={section.id}
                          className="flex min-w-0 flex-col rounded-lg border border-[#E5E7EB] bg-white"
                        >
                          <div
                            className={`flex items-start justify-between gap-3 border-b border-[#E5E7EB] px-5 py-4 max-[450px]:px-3 max-[450px]:py-3 ${
                              sectionIndex < 2 ? "max-[679px]:min-h-[88px]" : ""
                            }`}
                          >
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)] text-[13px] font-semibold leading-none tabular-nums text-white">
                                {sectionIndex + 1}
                              </span>
                              <div className="min-w-0 flex-1 pt-0.5 text-[18px] font-semibold leading-6 text-[#111827] max-[450px]:text-[9px] max-[450px]:leading-[12px] @max-[899px]:text-[15px] @max-[899px]:leading-5">
                                {section.title}
                              </div>
                            </div>
                            {(() => {
                              const detailsHref = applicantId
                                ? checklistSectionDetailHref(section.id, applicantId)
                                : null;
                              const detailsClassName =
                                "inline-flex h-8 w-[73px] shrink-0 items-center justify-center gap-1.5 rounded-[8px] border border-[color:var(--brand-primary)] px-4 py-2 text-xs font-semibold leading-4 text-[color:var(--brand-primary)] hover:bg-[color:color-mix(in_srgb,var(--brand-primary)_8%,white)]";

                              if (detailsHref) {
                                return (
                                  <Link href={detailsHref} className={detailsClassName}>
                                    Details
                                  </Link>
                                );
                              }

                              return (
                                <button type="button" disabled className={`${detailsClassName} opacity-50`}>
                                  Details
                                </button>
                              );
                            })()}
                          </div>

                          <div className="space-y-3 p-5 pt-4">
                            {sectionIndex === 0 ? (
                              <>
                                {section.rows.slice(0, 2).map((row, rowIndex) => (
                                  <div key={row.id} className="p-0">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="text-sm font-semibold leading-5 text-[#111827]">
                                          {rowIndex + 1}. {row.title}
                                        </div>
                                      </div>
                                      <RowBadge text={row.badge ?? "Pending"} state={row.state} />
                                    </div>

                                    <div className="mt-3 flex items-center gap-3 text-sm text-[#6B7280]">
                                      <div className="h-4 w-4 rounded-[4px] border border-zinc-300 bg-white" />
                                      <span>{(row.subtitle?.trim() || row.title).replace(/^\d+\.\s*/, "")}</span>
                                    </div>
                                  </div>
                                ))}

                                {section.rows[2] ? (
                                  <div className="p-0">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="text-sm font-semibold leading-5 text-[#111827]">
                                          3. {section.rows[2].title.replace(/^\d+\.\s*/, "")} :
                                          <span className="ml-2 font-normal text-[#6B7280]">
                                            {section.rows[2].subtitle}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="mt-3 space-y-3">
                                      {section.rows.slice(3).map((row) => {
                                        const isVerified =
                                          row.checked === true ||
                                          row.state === "uploaded" ||
                                          row.state === "complete" ||
                                          row.state === "answered";
                                        return (
                                          <div key={row.id} className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                              <div
                                                className={`h-4 w-4 rounded-[4px] border flex items-center justify-center ${
                                                  isVerified
                                                    ? "border-teal-600 bg-teal-600"
                                                    : "border-zinc-300 bg-white"
                                                }`}
                                              >
                                                {isVerified ? (
                                                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                                                ) : null}
                                              </div>
                                              <span className="text-sm leading-5 text-[#111827]">
                                                {row.title.replace(/^\d+\.\s*/, "")}
                                              </span>
                                            </div>
                                            <RowBadge text={row.badge ?? "Pending"} state={row.state} />
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ) : null}
                              </>
                            ) : MANUAL_PIPELINE_SECTION_IDS.has(section.id) ? (
                              <>
                                {section.rows.map((row, rowIndex) => {
                                  const isChecked = rowIsComplete(row);
                                  const isSaving = savingPipelineItemId === row.id;
                                  const isCallRow = row.id === "call_1" || row.id === "call_2";
                                  const attemptForRow = row.id === "call_1" ? 1 : row.id === "call_2" ? 2 : null;
                                  const isNoAnswer = row.callOutcome === "no_answer";
                                  const checkboxDisabled = isCallRow
                                    ? !canManualCompletePipeline
                                    : !canManualCompletePipeline || isSaving;
                                  const cleanTitle = row.title.replace(/^\d+\.\s*/, "");
                                  const subtitleIsMeta = (row.subtitle ?? "").startsWith("(");
                                  const checkboxText = pipelineCheckboxText(row);
                                  return (
                                    <div key={row.id} className="p-0">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="text-sm font-semibold leading-5 text-[#111827]">
                                            {rowIndex + 1}. {cleanTitle}
                                            {subtitleIsMeta ? (
                                              <span className="ml-2 font-normal text-[#6B7280]">{row.subtitle}</span>
                                            ) : null}
                                          </div>
                                        </div>
                                        <RowBadge text={row.badge ?? "Pending"} state={row.state} />
                                      </div>

                                      <div className="mt-3 flex items-center gap-3 text-sm text-[#374151]">
                                        <button
                                          type="button"
                                          aria-label={
                                            isCallRow
                                              ? `Add call log for ${row.title}`
                                              : `Mark ${row.title} ${isChecked ? "incomplete" : "complete"}`
                                          }
                                          aria-pressed={isChecked}
                                          disabled={checkboxDisabled}
                                          onClick={() => {
                                            if (isCallRow && attemptForRow) {
                                              setCallLogAttempt(attemptForRow);
                                              setCallLogModalOpen(true);
                                              return;
                                            }
                                            void togglePipelineItem(row, section.id);
                                          }}
                                          className={`h-4 w-4 rounded-[4px] border flex items-center justify-center transition-opacity ${
                                            isChecked
                                              ? "border-teal-600 bg-teal-600"
                                              : isNoAnswer
                                                ? "border-[#FB7185] bg-white"
                                                : "border-zinc-300 bg-white"
                                          } ${checkboxDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-teal-500"}`}
                                        >
                                          {isSaving ? (
                                            <span className="h-2.5 w-2.5 animate-pulse rounded-[2px] bg-white/80" />
                                          ) : isChecked ? (
                                            <Check className="w-3 h-3 text-white" strokeWidth={3} />
                                          ) : null}
                                        </button>
                                        <span>{checkboxText}</span>
                                      </div>

                                      {row.detailLine ? (
                                        <div className="mt-1 pl-7 text-[11px] text-[#94A3B8]">{row.detailLine}</div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </>
                            ) : (
                              <>
                                {section.rows.map((row) => (
                                  <div key={row.id} className="p-0">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="text-sm font-semibold leading-5 text-[#111827]">{row.title}</div>
                                        {row.subtitle ? (
                                      <div className="mt-0.5 text-sm font-normal leading-5 text-[#6B7280]">
                                            {row.subtitle}
                                          </div>
                                        ) : null}
                                      </div>
                                      <RowBadge text={row.badge ?? "Pending"} state={row.state} />
                                    </div>

                                    {typeof row.checked === "boolean" ||
                                    row.state === "uploaded" ||
                                    row.state === "complete" ||
                                    row.state === "answered" ? (
                                      <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
                                        {(() => {
                                          const isVerified =
                                            row.checked === true ||
                                            row.state === "uploaded" ||
                                            row.state === "complete" ||
                                            row.state === "answered";
                                          return (
                                            <div
                                              className={`h-4 w-4 rounded-[4px] border flex items-center justify-center ${
                                                isVerified
                                                  ? "border-teal-600 bg-teal-600"
                                                  : "border-zinc-300 bg-white"
                                              }`}
                                            >
                                              {isVerified ? (
                                                <Check className="w-3 h-3 text-white" strokeWidth={3} />
                                              ) : null}
                                            </div>
                                          );
                                        })()}
                                        <span>{(row.subtitle?.trim() || row.title).replace(/^\d+\.\s*/, "")}</span>
                                      </div>
                                    ) : null}

                                    {row.detailLine ? (
                                      <div className="mt-2 text-[11px] text-gray-600">{row.detailLine}</div>
                                    ) : null}
                                  </div>
                                ))}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                  <section className="mt-4 rounded-lg border border-[#E5E7EB] bg-white p-5">
                    <h3 className="text-[28px] font-semibold leading-7 text-[#111827]">Recent History</h3>
                    <div className="mt-4">
                      {recentHistoryRows.length === 0 ? (
                        <div className="rounded-md border border-dashed border-[#E5E7EB] px-4 py-8 text-center text-sm text-[#6B7280]">
                          No history yet.
                        </div>
                      ) : (
                        recentHistoryRows.map((entry) => (
                          <div
                            key={entry.key}
                            className="flex items-start gap-3 border-b border-[#E5E7EB] py-3 last:border-b-0"
                          >
                            <BrandedHistoryIcon className="mt-0.5 h-[30px] w-[30px] shrink-0" />
                            <div className="min-w-0">
                              <div className="text-sm font-medium leading-5 text-[#0D9488]">{entry.title}</div>
                              <div className="text-xs leading-4 text-[#6B7280]">{entry.metaLine}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </main>
              </div>
            </div>
              </>
            )}
      </div>

      {applicantId ? (
        <AddCallLogModal
          open={callLogModalOpen}
          workerId={applicantId}
          attemptNumber={callLogAttempt}
          onClose={() => {
            setCallLogModalOpen(false);
            setCallLogAttempt(null);
          }}
          onAdded={async () => {
            await loadChecklist({ silent: true });
            dispatchCandidatePipelineRefresh(applicantId);
          }}
        />
      ) : null}
        </>
      )}
    </div>
  );
}

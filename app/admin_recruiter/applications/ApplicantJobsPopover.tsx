"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { resolveApplicationApplicantName } from "@/lib/jobs/application-applicant-display";

type JobRecord = Record<string, unknown> | Record<string, unknown>[] | null | undefined;

export type ApplicantJobRow = {
  id: string;
  created_at: string;
  submitted_at?: string | null;
  job_requisition_id: string;
  workflow_phase?: string | null;
  statusName?: string | null;
  statusNote?: string | null;
  status?: string | null;
  ai_match_score?: number | null;
  job_role?: string | null;
  job_requisitions?: JobRecord;
  applicant_profiles?: JobRecord;
  worker?: JobRecord;
};

type ApplicantJobsPopoverProps = {
  anchor: HTMLElement;
  applicantName: string;
  applications: ApplicantJobRow[];
  loading: boolean;
  onClose: () => void;
};

function one(value: JobRecord): Record<string, unknown> {
  if (!value) return {};
  return (Array.isArray(value) ? value[0] : value) ?? {};
}

function jobTitle(row: ApplicantJobRow): string {
  return (
    String(one(row.job_requisitions).public_title ?? "").trim() ||
    row.job_role?.trim() ||
    "Untitled job"
  );
}

function clientName(row: ApplicantJobRow): string {
  const job = one(row.job_requisitions);
  return (
    String(job.facility_name ?? job.msp_name ?? job.facility ?? job.location ?? "").trim() || "—"
  );
}

function stageLabel(row: ApplicantJobRow): string {
  return row.statusNote?.trim() || row.workflow_phase?.trim() || row.statusName?.trim() || "Need review";
}

function stageClass(label: string): string {
  const norm = label.toLowerCase();
  if (norm.includes("offer") || norm.includes("hired")) return "bg-[#ECFDF5] text-[#059669]";
  if (norm.includes("submitted")) return "bg-[#EEF2FF] text-[#4F46E5]";
  if (norm.includes("interview")) return "bg-[#FEF3C7] text-[#D97706]";
  if (norm.includes("screening")) return "bg-[#FEF9C3] text-[#CA8A04]";
  return "bg-[#F0F9FF] text-[#0284C7]";
}

function jobStatusLabel(row: ApplicantJobRow): string {
  const status = String(one(row.job_requisitions).status ?? "").trim().toLowerCase();
  if (!status) return "";
  if (status === "open" || status === "published" || status === "active") return "Open job";
  if (status === "paused") return "Paused";
  if (status === "closed" || status === "filled" || status === "archived") return "Closed";
  return status.replace(/_/g, " ");
}

function appliedTime(row: ApplicantJobRow): number {
  const value = new Date(row.submitted_at || row.created_at).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function ApplicantJobsPopover({
  anchor,
  applicantName,
  applications,
  loading,
  onClose,
}: ApplicantJobsPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const firstName =
    applicantName.trim().split(/\s+/)[0] ||
    resolveApplicationApplicantName(applications[0] ?? {}) ||
    "Applicant";
  const count = applications.length;
  const latestId = [...applications].sort((a, b) => appliedTime(b) - appliedTime(a))[0]?.id;
  const bestMatch = applications.reduce<{ id: string; score: number } | null>((best, row) => {
    if (row.ai_match_score == null) return best;
    if (!best || row.ai_match_score > best.score) return { id: row.id, score: row.ai_match_score };
    return best;
  }, null);

  useLayoutEffect(() => {
    const width = 491;
    const rect = anchor.getBoundingClientRect();
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
    const top = Math.min(rect.bottom + 6, Math.max(8, window.innerHeight - 240));
    setPosition({ top, left });
  }, [anchor, count]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (anchor.contains(target) || panelRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [anchor, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`${firstName}'s applications`}
      className="fixed z-[80] w-[491px] max-w-[calc(100vw-16px)] overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.16)]"
      style={{ top: position.top, left: position.left }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] px-3 py-2.5">
        <p className="truncate text-xs font-semibold leading-4 text-[#111827]">
          {firstName}&apos;s applications
        </p>
        <p className="shrink-0 text-xs font-semibold leading-4 text-[#374151]">
          {loading ? "…" : `${count} Job${count === 1 ? "" : "s"}`}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] border-collapse text-left">
          <thead>
            <tr className="text-[10px] font-semibold uppercase leading-[15px] text-[#6B7280]">
              <th className="px-3.5 py-1.5 font-semibold">Job</th>
              <th className="px-3.5 py-1.5 font-semibold">Client</th>
              <th className="px-3.5 py-1.5 font-semibold">Stage</th>
              <th className="px-3.5 py-1.5 text-center font-semibold">Match</th>
              <th className="px-3.5 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {applications.map((row) => {
              const title = jobTitle(row);
              const stage = stageLabel(row);
              const subtitle =
                row.id === latestId
                  ? "Latest"
                  : bestMatch?.id === row.id
                    ? "Latest match is for this job"
                    : "";
              const href = `/admin_recruiter/applications/review?jobId=${encodeURIComponent(row.job_requisition_id)}&applicationId=${encodeURIComponent(row.id)}`;
              return (
                <tr key={row.id} className="border-t border-[#F1F5F9]">
                  <td className="px-3.5 py-2 align-middle">
                    <Link href={href} className="block min-w-[120px] hover:underline" onClick={onClose}>
                      <span className="block truncate text-xs font-semibold leading-[15px] text-[#374151]">
                        {title}
                      </span>
                      {subtitle ? (
                        <span className="block truncate text-[10px] leading-[15px] text-[#6B7280]">
                          {subtitle}
                        </span>
                      ) : null}
                    </Link>
                  </td>
                  <td className="max-w-[110px] px-3.5 py-2 align-middle">
                    <span className="block truncate text-xs leading-[15px] text-[#374151]">
                      {clientName(row)}
                    </span>
                  </td>
                  <td className="px-3.5 py-2 align-middle">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold leading-[15px] ${stageClass(stage)}`}
                    >
                      {stage}
                    </span>
                  </td>
                  <td className="px-3.5 py-2 text-center align-middle text-xs font-medium leading-[15px] text-[#111827]">
                    {row.ai_match_score == null ? "—" : Math.round(row.ai_match_score)}
                  </td>
                  <td className="px-3.5 py-2 align-middle">
                    {jobStatusLabel(row) ? (
                      <span className="inline-flex items-center rounded-full bg-[#ECFDF5] px-2.5 py-1 text-[10px] font-semibold leading-[15px] text-[#059669]">
                        {jobStatusLabel(row)}
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>,
    document.body
  );
}

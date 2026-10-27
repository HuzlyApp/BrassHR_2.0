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
  job_role_subtitle?: string | null;
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
    String(
      job.facility_name ??
      job.client_name ??
      job.client ??
      job.msp_name ??
      job.facility ??
      job.location ??
      ""
    ).trim() || "—"
  );
}

function isPhaseName(s?: string | null): boolean {
  if (!s) return false;
  const l = s.trim().toLowerCase();
  return (
    l === "pre_hire" ||
    l === "post_hire" ||
    l === "pre-hire" ||
    l === "post-hire" ||
    l === "prehire" ||
    l === "posthire"
  );
}

function stageLabel(row: ApplicantJobRow): string {
  const note = row.statusNote?.trim();
  if (note && !isPhaseName(note)) return note;

  const statusName = row.statusName?.trim();
  if (statusName && !isPhaseName(statusName)) return statusName;

  const phase = row.workflow_phase?.trim();
  if (phase && !isPhaseName(phase)) return phase;

  return "Need review";
}

function stageClass(label: string): string {
  const norm = label.toLowerCase();
  if (norm.includes("interview")) return "bg-[#EEF2FF] text-[#4F46E5]";
  if (norm.includes("screening")) return "bg-[#FEF3C7] text-[#92400E]";
  if (norm.includes("need review") || norm.includes("review")) return "bg-[#E0F2FE] text-[#0369A1]";
  if (norm.includes("offer") || norm.includes("hired")) return "bg-[#ECFDF5] text-[#047857]";
  if (norm.includes("submitted")) return "bg-[#EEF2FF] text-[#4F46E5]";
  return "bg-[#F1F5F9] text-[#475569]";
}

function matchScoreColor(score: number | null | undefined): string {
  if (score == null) return "text-[#94A3B8]";
  if (score >= 70) return "text-[#16A34A]"; // Green
  if (score >= 50) return "text-[#D97706]"; // Amber
  return "text-[#EA580C]"; // Warm red-orange
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

  useLayoutEffect(() => {
    if (!anchor) return;
    const width = 580;
    const rect = anchor.getBoundingClientRect();
    
    // Position aligned with anchor, nicely bounded within screen
    let left = Math.max(16, rect.left - 100);
    if (left + width > window.innerWidth - 16) {
      left = Math.max(16, window.innerWidth - width - 16);
    }

    const estimatedHeight = Math.min(480, 120 + Math.max(1, count) * 60);
    let top = rect.bottom + 8;
    if (top + estimatedHeight > window.innerHeight - 16 && rect.top > estimatedHeight + 16) {
      top = rect.top - estimatedHeight - 8;
    }
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
      aria-label={`${firstName}’s applications`}
      className="fixed z-[80] w-[580px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_20px_50px_rgba(15,23,42,0.16)] animate-in fade-in zoom-in-95 duration-150"
      style={{ top: position.top, left: position.left }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-[#F1F5F9] px-6 py-4 bg-white">
        <p className="truncate text-base sm:text-lg font-bold text-[#0F172A]">
          {firstName}’s applications
        </p>
        <p className="shrink-0 text-sm sm:text-base font-semibold text-[#475569]">
          {loading ? "Loading…" : `${count} Job${count === 1 ? "" : "s"}`}
        </p>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] border-collapse text-left">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#F1F5F9] text-xs font-semibold text-[#475569]">
              <th className="px-6 py-2.5 font-semibold text-left">Job</th>
              <th className="px-4 py-2.5 font-semibold text-left">Client</th>
              <th className="px-4 py-2.5 font-semibold text-center">Stage</th>
              <th className="px-4 py-2.5 font-semibold text-center">Match</th>
              <th className="px-6 py-2.5 w-[110px]" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9] bg-white">
            {applications.map((row, index) => {
              const title = jobTitle(row);
              const stage = stageLabel(row);
              const isLatest = row.id === latestId;
              const subtitle = row.job_role_subtitle || (index === 2 ? "Latest" : "latest");
              const reviewHref = `/admin_recruiter/applications/review?jobId=${encodeURIComponent(row.job_requisition_id)}&applicationId=${encodeURIComponent(row.id)}`;
              const jobDetailHref = row.job_requisition_id
                ? `/admin_recruiter/jobs/${encodeURIComponent(row.job_requisition_id)}`
                : reviewHref;

              return (
                <tr key={row.id} className="transition-colors hover:bg-[#FAFAFA]">
                  {/* Job */}
                  <td className="px-6 py-3.5 align-middle">
                    <Link
                      href={reviewHref}
                      className="block max-w-[180px] truncate text-xs sm:text-sm font-semibold text-[#0F172A] underline underline-offset-2 hover:text-indigo-600 transition-colors"
                      onClick={onClose}
                      title={title}
                    >
                      {title}
                    </Link>
                    <span className="block text-[11px] text-[#64748B] font-normal leading-tight mt-0.5">
                      {subtitle}
                    </span>
                  </td>

                  {/* Client */}
                  <td className="px-4 py-3.5 align-middle">
                    <span className="block max-w-[120px] truncate text-xs sm:text-sm text-[#334155] font-normal" title={clientName(row)}>
                      {clientName(row)}
                    </span>
                  </td>

                  {/* Stage */}
                  <td className="px-4 py-3.5 text-center align-middle">
                    <span
                      className={`inline-flex items-center justify-center rounded-full px-3.5 py-1 text-xs font-semibold leading-tight ${stageClass(stage)}`}
                    >
                      {stage}
                    </span>
                  </td>

                  {/* Match */}
                  <td className={`px-4 py-3.5 text-center align-middle text-sm font-bold ${matchScoreColor(row.ai_match_score)}`}>
                    {row.ai_match_score == null ? "—" : Math.round(row.ai_match_score)}
                  </td>

                  {/* Open Job Action */}
                  <td className="px-6 py-3.5 text-right align-middle">
                    <Link
                      href={jobDetailHref}
                      className="inline-flex items-center justify-center rounded-lg border border-[#CBD5E1] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#334155] shadow-xs hover:bg-[#F8FAFC] hover:border-[#94A3B8] hover:text-[#0F172A] transition-colors"
                      onClick={onClose}
                    >
                      Open job
                    </Link>
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

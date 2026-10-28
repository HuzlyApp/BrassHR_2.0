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
  workflow_id?: string;
  applicant_workflow_instance_id?: string;
  workflow_phase?: string | null;
  statusName?: string | null;
  statusNote?: string | null;
  status_id?: string | null;
  status?: string | null;
  ai_match_score?: number | null;
  ai_match_stage?: string | null;
  job_role?: string | null;
  job_role_subtitle?: string | null;
  work_type?: string | null;
  application_statuses?:
    | { id?: string; name?: string; system_key?: string | null; color?: string | null }
    | { id?: string; name?: string; system_key?: string | null; color?: string | null }[]
    | null;
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
  resolveStage?: (row: ApplicantJobRow) => string;
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

export function defaultStageLabel(row: ApplicantJobRow): string {
  // 1. Status note or workflow phase if matching a stage keyword
  const noteOrPhase = (row.workflow_phase || row.statusNote || "").trim();
  const normPhase = noteOrPhase.toLowerCase();
  if (normPhase.includes("intake")) return "Intake";
  if (normPhase.includes("screen")) return "Screening";
  if (normPhase.includes("interview")) return "Interview";
  if (normPhase.includes("submit") || normPhase.includes("msp")) return "Submission";
  if (normPhase.includes("compliance") || normPhase.includes("verif")) return "Compliance";
  if (normPhase.includes("offer") || normPhase.includes("agree")) return "Offer & Agreement";
  if (normPhase.includes("approv")) return "Approvals";

  // 2. Status name / code lookup
  const statusLabel = (row.statusName || row.status || "").toLowerCase().trim();
  if (
    statusLabel.includes("interview") ||
    statusLabel.includes("qualified") ||
    statusLabel === "interviewing"
  ) {
    return "Interview";
  }
  if (
    statusLabel.includes("screening") ||
    statusLabel.includes("screen") ||
    statusLabel.includes("attempted contact") ||
    statusLabel.includes("phone screen") ||
    statusLabel.includes("under review")
  ) {
    return "Screening";
  }
  if (
    statusLabel.includes("submission") ||
    statusLabel.includes("submit") ||
    statusLabel.includes("msp") ||
    statusLabel.includes("presented to client") ||
    statusLabel.includes("client review") ||
    statusLabel.includes("profile ready")
  ) {
    return "Submission";
  }
  if (
    statusLabel.includes("compliance") ||
    statusLabel.includes("verification") ||
    statusLabel.includes("background") ||
    statusLabel.includes("drug") ||
    statusLabel.includes("license")
  ) {
    return "Compliance";
  }
  if (
    statusLabel.includes("offer") ||
    statusLabel.includes("agreement") ||
    statusLabel.includes("pay rate") ||
    statusLabel.includes("contract")
  ) {
    return "Offer & Agreement";
  }
  if (
    statusLabel.includes("approval") ||
    statusLabel.includes("approvals") ||
    statusLabel.includes("final approval") ||
    statusLabel.includes("selected") ||
    statusLabel.includes("hired")
  ) {
    return "Approvals";
  }
  if (
    statusLabel.includes("new") ||
    statusLabel.includes("applied") ||
    statusLabel.includes("intake") ||
    statusLabel.includes("contact") ||
    statusLabel.includes("resume") ||
    statusLabel.includes("document")
  ) {
    return "Intake";
  }

  if (row.ai_match_stage?.trim()) return row.ai_match_stage.trim();
  if (row.statusNote?.trim() && !isPhaseName(row.statusNote)) return row.statusNote.trim();
  if (row.statusName?.trim() && !isPhaseName(row.statusName)) return row.statusName.trim();
  if (row.workflow_phase?.trim() && !isPhaseName(row.workflow_phase)) return row.workflow_phase.trim();

  return "Intake";
}

function stageBadgeClass(label: string): string {
  const norm = label.toLowerCase().trim();
  if (norm.includes("interview")) {
    return "bg-[#FEF3C7] text-[#D97706] border-[#FDE68A]";
  }
  if (norm.includes("screening")) {
    return "bg-[#FEF9C3] text-[#CA8A04] border-[#FEF08A]";
  }
  if (norm.includes("submission")) {
    return "bg-[#EEF2FF] text-[#4F46E5] border-[#C7D2FE]";
  }
  if (norm.includes("compliance")) {
    return "bg-[#F5F3FF] text-[#7C3AED] border-[#DDD6FE]";
  }
  if (norm.includes("offer")) {
    return "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]";
  }
  if (norm.includes("approval")) {
    return "bg-[#F0FDF4] text-[#16A34A] border-[#BBF7D0]";
  }
  if (norm.includes("intake")) {
    return "bg-[#F0F9FF] text-[#0284C7] border-[#BAE6FD]";
  }
  return "bg-[#F8FAFC] text-[#475569] border-[#CBD5E1]";
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
  resolveStage,
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
    const width = 640;
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
      className="fixed z-[80] w-[640px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_20px_50px_rgba(15,23,42,0.16)] animate-in fade-in zoom-in-95 duration-150"
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
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#F1F5F9] text-xs font-semibold text-[#475569]">
              <th className="px-5 py-2.5 font-semibold text-left">Job</th>
              <th className="px-4 py-2.5 font-semibold text-left">Client</th>
              <th className="px-4 py-2.5 font-semibold text-center whitespace-nowrap">Stage</th>
              <th className="px-3 py-2.5 font-semibold text-center whitespace-nowrap">Match</th>
              <th className="px-5 py-2.5 text-right w-[125px] whitespace-nowrap" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9] bg-white">
            {applications.map((row) => {
              const title = jobTitle(row);
              const stage = resolveStage ? resolveStage(row) : defaultStageLabel(row);
              const isLatest = row.id === latestId;
              const subtitle = row.job_role_subtitle || (isLatest ? "Latest" : row.work_type || undefined);
              const reviewHref = `/admin_recruiter/applications/review?jobId=${encodeURIComponent(row.job_requisition_id)}&applicationId=${encodeURIComponent(row.id)}`;
              const jobDetailHref = row.job_requisition_id
                ? `/admin_recruiter/jobs/${encodeURIComponent(row.job_requisition_id)}`
                : reviewHref;

              return (
                <tr key={row.id} className="transition-colors hover:bg-[#FAFAFA]">
                  {/* Job */}
                  <td className="px-5 py-3.5 align-middle">
                    <Link
                      href={jobDetailHref}
                      className="block max-w-[190px] truncate text-xs sm:text-sm font-semibold text-[#0F172A] underline underline-offset-2 hover:text-indigo-600 transition-colors"
                      onClick={onClose}
                      title={title}
                    >
                      {title}
                    </Link>
                    {subtitle ? (
                      <span className="block text-[11px] text-[#64748B] font-normal leading-tight mt-0.5">
                        {subtitle}
                      </span>
                    ) : null}
                  </td>

                  {/* Client */}
                  <td className="px-4 py-3.5 align-middle">
                    <span
                      className="block max-w-[130px] truncate text-xs sm:text-sm text-[#334155] font-normal"
                      title={clientName(row)}
                    >
                      {clientName(row)}
                    </span>
                  </td>

                  {/* Stage */}
                  <td className="px-4 py-3.5 text-center align-middle whitespace-nowrap">
                    <span
                      className={`inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${stageBadgeClass(stage)}`}
                    >
                      {stage}
                    </span>
                  </td>

                  {/* Match */}
                  <td className={`px-3 py-3.5 text-center align-middle text-sm font-bold whitespace-nowrap ${matchScoreColor(row.ai_match_score)}`}>
                    {row.ai_match_score == null ? "—" : Math.round(row.ai_match_score)}
                  </td>

                  {/* Open Job Action */}
                  <td className="px-5 py-3.5 text-right align-middle whitespace-nowrap">
                    <Link
                      href={jobDetailHref}
                      className="inline-flex shrink-0 whitespace-nowrap items-center justify-center rounded-lg border border-[#CBD5E1] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#334155] shadow-xs hover:bg-[#F8FAFC] hover:border-[#94A3B8] hover:text-[#0F172A] transition-colors"
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

"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { candidateMailHref } from "@/app/admin_recruiter/candidates/candidate-links";
import { adminWorkerProfileHref } from "./worker-profile-links";
import type { WorkerColumnId } from "./worker-columns";
import type { WorkerListRow } from "./figma-demo-data";

export type { WorkerListRow };

export type RenderWorkerCellCallbacks = {
  onOpenActionsMenu?: (worker: WorkerListRow, anchor: HTMLElement) => void;
  openMenuWorkerId?: string | null;
};

export function renderWorkerListCell(
  col: WorkerColumnId,
  w: WorkerListRow,
  formatDate: (iso: string | null) => string,
  callbacks?: RenderWorkerCellCallbacks
): ReactNode {
  switch (col) {
    case "name":
      return (
        <div className="min-w-[160px] whitespace-nowrap">
          <Link
            href={adminWorkerProfileHref(w.profileId)}
            className="block truncate text-sm font-semibold text-[#111827] hover:underline whitespace-nowrap"
            title={w.name}
          >
            {w.name}
          </Link>
          <p className="truncate text-xs text-[#6B7280] whitespace-nowrap">
            {w.experience || "—"}
          </p>
        </div>
      );

    case "contact":
      return (
        <div className="min-w-[180px] whitespace-nowrap">
          {w.email ? (
            <Link
              href={candidateMailHref(w.profileId)}
              className="block truncate text-xs font-normal text-[#374151] hover:underline whitespace-nowrap"
              title={w.email}
            >
              {w.email}
            </Link>
          ) : (
            <span className="block text-xs text-[#374151] whitespace-nowrap">—</span>
          )}
          <span className="block truncate text-xs text-[#6B7280] whitespace-nowrap">
            {w.phone || "—"}
          </span>
        </div>
      );

    case "assignment": {
      const start = w.assignmentStartDate || (w.createdAt ? formatDate(w.createdAt) : "");
      const end = w.assignmentEndDate || "Ongoing";
      const display = start ? `${start} - ${end}` : end;
      return (
        <span className="text-xs text-[#374151] whitespace-nowrap" title={display}>
          {display}
        </span>
      );
    }

    case "startDate":
      return (
        <span className="text-xs text-[#374151] whitespace-nowrap">
          {w.assignmentStartDate || (w.createdAt ? formatDate(w.createdAt) : "—")}
        </span>
      );

    case "endDate":
      return (
        <span className="text-xs text-[#374151] whitespace-nowrap">
          {w.assignmentEndDate || "Ongoing"}
        </span>
      );

    case "hiredDate":
      return (
        <span className="text-xs text-[#374151] whitespace-nowrap">
          {w.hiredDate || (w.createdAt ? formatDate(w.createdAt) : "—")}
        </span>
      );

    case "jobRole": {
      const hasJobLink = Boolean(w.jobId || (w.jobRole && w.jobRole !== "—"));
      const jobHref = w.jobId
        ? `/admin_recruiter/jobs/${encodeURIComponent(w.jobId)}`
        : `/admin_recruiter/jobs?q=${encodeURIComponent(w.jobRole)}`;

      return (
        <div className="min-w-[180px] max-w-[280px] whitespace-nowrap">
          {hasJobLink ? (
            <Link
              href={jobHref}
              className="block truncate text-xs font-medium text-[#0F172A] hover:text-[color:var(--brand-primary,#C59B27)] hover:underline whitespace-nowrap transition-colors cursor-pointer"
              title={w.jobRole || "—"}
            >
              {w.jobRole || "—"}
            </Link>
          ) : (
            <span
              className="block truncate text-xs text-[#374151] font-normal whitespace-nowrap"
              title={w.jobRole || "—"}
            >
              {w.jobRole || "—"}
            </span>
          )}
        </div>
      );
    }

    case "payRate":
      return (
        <span className="text-xs text-[#374151] whitespace-nowrap">
          {w.payRate || "—"}
        </span>
      );

    case "billRate":
      return (
        <span className="text-xs text-[#374151] whitespace-nowrap">
          {w.billRate || "—"}
        </span>
      );

    case "overtimeRate":
      return (
        <span className="text-xs text-[#374151] whitespace-nowrap">
          {w.overtimeRate || "—"}
        </span>
      );

    case "status": {
      const statusLower = (w.status || "").toLowerCase();
      const isInactive = statusLower === "inactive" || statusLower === "terminated";
      return (
        <span
          className={`inline-flex items-center rounded-full px-3 py-0.5 text-xs font-medium whitespace-nowrap ${
            isInactive
              ? "bg-[#94A3B8] text-white"
              : "bg-[#14B8A6] text-white"
          }`}
        >
          {w.status || "Active"}
        </span>
      );
    }

    case "client":
      return (
        <div className="min-w-[120px] max-w-[200px] whitespace-nowrap">
          <span
            className="block truncate text-xs text-[#374151] whitespace-nowrap"
            title={w.client || "—"}
          >
            {w.client || "—"}
          </span>
        </div>
      );

    case "facilities": {
      const facStr =
        w.facilities && w.facilities.length > 0 ? w.facilities.join(", ") : w.client || "—";
      return (
        <div className="min-w-[140px] max-w-[240px] whitespace-nowrap">
          <span className="block truncate text-xs text-[#374151] whitespace-nowrap" title={facStr}>
            {facStr}
          </span>
        </div>
      );
    }

    case "manager":
      return <span className="text-xs text-[#374151] whitespace-nowrap">{w.manager || "—"}</span>;

    case "experience":
      return <span className="text-xs text-[#374151] whitespace-nowrap">{w.experience || "—"}</span>;

    case "department":
      return <span className="text-xs text-[#374151] whitespace-nowrap">{w.department || "—"}</span>;

    case "specialty":
      return <span className="text-xs text-[#374151] whitespace-nowrap">{w.specialty || "—"}</span>;

    case "profession":
      return <span className="text-xs text-[#374151] whitespace-nowrap">{w.profession || "—"}</span>;

    case "shiftType":
      return <span className="text-xs text-[#374151] whitespace-nowrap">{w.shiftType || "—"}</span>;

    case "shiftDetails":
      return <span className="text-xs text-[#374151] whitespace-nowrap">{w.shiftDetails || "—"}</span>;

    case "hoursPerWeek":
      return (
        <span className="text-xs text-[#374151] whitespace-nowrap">
          {w.hoursPerWeek ? `${w.hoursPerWeek} hrs/wk` : "—"}
        </span>
      );

    case "documentsCount":
      return (
        <span className="text-xs text-[#374151] whitespace-nowrap">
          {typeof w.documentsCount === "number"
            ? `${w.documentsCount} doc${w.documentsCount === 1 ? "" : "s"}`
            : "—"}
        </span>
      );

    case "location":
      return <span className="text-xs text-[#374151] whitespace-nowrap">{w.location || "—"}</span>;

    case "email":
      return w.email ? (
        <Link
          href={candidateMailHref(w.profileId)}
          className="text-xs font-normal text-[#374151] hover:underline whitespace-nowrap"
          title={w.email}
        >
          {w.email}
        </Link>
      ) : (
        <span className="text-xs text-[#374151] whitespace-nowrap">—</span>
      );

    case "phone":
      return <span className="text-xs text-[#374151] whitespace-nowrap">{w.phone || "—"}</span>;

    case "workerType":
      return <span className="text-xs text-[#374151] whitespace-nowrap">{w.workerType || "—"}</span>;

    case "employmentType":
      return <span className="text-xs text-[#374151] whitespace-nowrap">{w.employmentType || "—"}</span>;

    case "reference":
      return <span className="text-xs text-[#374151] whitespace-nowrap">{w.reference || "—"}</span>;

    case "createdDate":
      return <span className="text-xs text-[#374151] whitespace-nowrap">{formatDate(w.createdAt)}</span>;

    case "profile": {
      const isMenuOpen = callbacks?.openMenuWorkerId === w.id;
      return (
        <div className="flex items-center justify-end gap-2 whitespace-nowrap" data-worker-action-menu>
          <Link
            href={adminWorkerProfileHref(w.profileId)}
            className="inline-flex items-center justify-center rounded-full border border-[#D1D5DB] bg-white px-3.5 py-1 text-xs font-medium text-[#374151] shadow-2xs transition hover:bg-gray-50 cursor-pointer whitespace-nowrap"
          >
            Profile
          </Link>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              callbacks?.onOpenActionsMenu?.(w, e.currentTarget);
            }}
            className={`flex size-7 items-center justify-center rounded-full transition cursor-pointer shrink-0 ${
              isMenuOpen ? "bg-gray-100 text-gray-700" : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            }`}
            aria-label="More options"
            title="More options"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </div>
      );
    }

    default:
      return <span className="text-xs text-[#4B5563] whitespace-nowrap">—</span>;
  }
}

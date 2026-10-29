"use client";

import { ChevronDown, ChevronLeft, /* ClipboardList, Link2, Loader2, */ Mail, MapPin, Phone } from "lucide-react";
import Link from "next/link";
// import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import CandidateAvatarIcon from "./CandidateAvatarIcon";
// import { useResendApplicationStatusLink } from "@/app/admin_recruiter/hooks/useResendApplicationStatusLink";
// import {
//   candidateDetailAiAnalysisHref,
//   candidateHireJourneyHref,
// } from "@/app/admin_recruiter/candidates/candidate-links";

type DetailedCandidateHeaderProps = {
  name: string;
  role: string;
  loading?: boolean;
  profilePhotoUrl?: string | null;
  workerId?: string | null;
  candidateEmail?: string | null;
  phone?: string | null;
  location?: string | null;
  statusLabel?: string | null;
  applicationDate?: string | null;
  jobId?: string | null;
  source?: string | null;
  progressPercent?: number | null;
  progressInProgress?: number | null;
  progressUpcoming?: number | null;
  progressDate?: string | null;
  onMessageClick?: () => void;
  messageDisabled?: boolean;
  onResendStatusClick?: () => void;
  resendStatusDisabled?: boolean;
  resendingStatus?: boolean;
  /** Override AI analysis URL; defaults to worker AI overview when workerId is set. */
  aiAnalysisHref?: string | null;
};

const outlineBtn =
  "inline-flex h-8 items-center justify-center gap-1 rounded-md border border-[#D1D5DB] bg-white px-3 text-xs font-medium text-[#012352] transition hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50";

export default function DetailedCandidateHeader({
  name,
  role,
  loading = false,
  profilePhotoUrl,
  // workerId,
  candidateEmail,
  phone,
  location,
  statusLabel,
  applicationDate,
  jobId,
  source,
  progressPercent,
  progressInProgress,
  progressUpcoming,
  progressDate,
  onMessageClick,
  messageDisabled = false,
  // onResendStatusClick,
  // resendStatusDisabled,
  // resendingStatus,
  // aiAnalysisHref,
}: DetailedCandidateHeaderProps) {
  // Figma header actions: Offer / Message / Send Offer.
  // Resend status link + AI analysis overview stay available on their tabs; commented here to match Figma.
  // const internalResend = useResendApplicationStatusLink(workerId);
  // const showResendStatus = Boolean(workerId?.trim());
  // const resendHandler = onResendStatusClick ?? internalResend.resend;
  // const resending = resendingStatus ?? internalResend.resending;
  // const resendDisabled =
  //   resendStatusDisabled ?? (!candidateEmail?.trim() || loading || resending);
  // const resolvedAiHref =
  //   typeof aiAnalysisHref === "string" && aiAnalysisHref.trim()
  //     ? aiAnalysisHref.trim()
  //     : workerId?.trim()
  //       ? candidateDetailAiAnalysisHref(workerId.trim())
  //       : null;
  // const hireJourneyHref = workerId?.trim()
  //   ? candidateHireJourneyHref(workerId.trim())
  //   : null;

  const displayName = loading ? "Loading..." : name.trim() || "Applicant";
  const displayRole = loading ? "—" : role.trim() || "—";
  const displayEmail = candidateEmail?.trim() || "—";
  const displayPhone = phone?.trim() || "—";
  const displayLocation = location?.trim() || "—";
  const displayStatus = statusLabel?.trim() || "Applicant";
  const percent = Math.max(0, Math.min(100, Math.round(progressPercent ?? 0)));

  return (
    <div className="mb-5 w-full min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/admin_recruiter/applications"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7280] transition-colors hover:text-[color:var(--brand-primary)]"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Back
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2">
        {/* Offer / Send Offer — no dedicated handlers in codebase yet; keep UI shell only. */}
        <button type="button" disabled className={outlineBtn} title="Offer actions coming soon">
          Offer
          <ChevronDown className="size-3.5 opacity-60" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onMessageClick}
          disabled={!onMessageClick || messageDisabled || loading}
          className={outlineBtn}
          title={onMessageClick ? undefined : "Open profile to message"}
        >
          <Mail className="size-3.5" aria-hidden />
          Message
        </button>
        <button
          type="button"
          disabled
          title="Send Offer coming soon"
          className="inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
          style={{ backgroundColor: "var(--brand-primary)" }}
        >
          Send Offer
        </button>
        {/* {showResendStatus ? (
          <button type="button" onClick={() => void resendHandler()} disabled={resendDisabled} className={outlineBtn}>
            {resending ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
            Resend status link
          </button>
        ) : null} */}
        {/* {resolvedAiHref && !loading ? (
          <Link href={resolvedAiHref} className={outlineBtn}>
            <BrandedSvgIcon src="/ai-icon.svg" className="size-3.5" color="var(--brand-primary)" />
            View AI analysis overview
          </Link>
        ) : null} */}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(260px,350px)]">
        <div className="rounded-lg border border-[#E5E7EB] bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="relative shrink-0">
                <CandidateAvatarIcon
                  photoUrl={profilePhotoUrl}
                  name={displayName}
                  className="h-[100px] w-[100px] rounded-full text-3xl"
                />
              </div>
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0">
                    <h1 className="truncate text-xl font-semibold leading-7 text-[#012352]">
                      {displayName}
                    </h1>
                    <p className="mt-0.5 text-sm text-[#6B7280]">{displayRole}</p>
                  </div>
                  <span className="inline-flex rounded bg-[#EFF6FF] px-2.5 py-1 text-xs font-medium text-[#1D4ED8]">
                    Applicant
                  </span>
                </div>
                <div className="space-y-1.5 text-sm text-[#374151]">
                  <div className="flex items-center gap-2">
                    <Mail className="size-[18px] shrink-0 text-[color:var(--brand-primary)]" aria-hidden />
                    <span className="truncate">{displayEmail}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="size-[18px] shrink-0 text-[color:var(--brand-primary)]" aria-hidden />
                    <span className="truncate">{displayPhone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="size-[18px] shrink-0 text-[color:var(--brand-primary)]" aria-hidden />
                    <span className="truncate">{displayLocation}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full shrink-0 space-y-2.5 border-t border-[#E5E7EB] pt-4 text-sm lg:w-[280px] lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
              <MetaRow label="Application Date" value={applicationDate?.trim() || "—"} />
              <MetaRow label="Job ID" value={jobId?.trim() || "—"} />
              <MetaRow label="Source" value={source?.trim() || "—"} />
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#6B7280]">Current Status</span>
                <span className="inline-flex rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-xs font-medium text-[#166534]">
                  {displayStatus}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[#E5E7EB] bg-white p-4 sm:p-5">
          <h2 className="text-base font-semibold text-[#012352]">Overall Hiring Progress</h2>
          <div className="mt-4">
            <div className="h-3 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${percent}%`,
                  backgroundColor: "var(--brand-primary)",
                }}
              />
            </div>
            <p className="mt-2 text-sm text-[#6B7280]">
              {progressInProgress != null ? `${progressInProgress} In Progress` : "—"}
              {" • "}
              {progressUpcoming != null ? `${progressUpcoming} Upcoming` : "—"}
            </p>
          </div>
          <div className="mt-6 flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-[#012352]">{percent}% Completed</span>
            <span className="text-[#6B7280]">{progressDate?.trim() || "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[#6B7280]">{label}</span>
      <span className="font-semibold text-[#012352]">{value}</span>
    </div>
  );
}

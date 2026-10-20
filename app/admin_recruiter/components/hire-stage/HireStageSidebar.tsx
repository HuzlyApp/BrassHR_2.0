"use client";

import Link from "next/link";
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import { CandidateListAvatar } from "@/app/admin_recruiter/components/CandidateListAvatar";
import type { HireStageLifecycle } from "@/lib/onboarding/hire-stage-groups";
import { HireFigmaIcon, PRE_HIRE_UI_ICONS } from "./hire-figma-assets";

export type HireStageSidebarProfile = {
  name: string;
  role: string;
  statusLabel: string | null;
  photoUrl: string | null;
  workType: string | null;
  department: string | null;
  location: string | null;
  source: string | null;
  dateApplied: string | null;
};

function SidebarIconTile({
  src,
  alt,
  iconWidth,
  iconHeight,
}: {
  src: string;
  alt: string;
  iconWidth: number;
  iconHeight: number;
}) {
  return (
    <span
      className="relative inline-flex h-[50px] w-[50px] shrink-0 items-center justify-center overflow-hidden rounded-xl"
      style={{ backgroundColor: "var(--brand-secondary)" }}
    >
      <HireFigmaIcon src={src} alt={alt} width={iconWidth} height={iconHeight} />
    </span>
  );
}

export function HireStageSidebar({
  lifecycle,
  profile,
  templateName,
  progressPercent,
  progressLabel,
  lastUpdated,
  showProceedToPostHire,
  onProceedToPostHire,
  proceedDisabledReason,
  proceedBusy,
  proceedNote,
  proceedError,
  aiAnalysisHref,
}: {
  lifecycle: HireStageLifecycle;
  profile: HireStageSidebarProfile;
  aiAnalysisHref?: string | null;
  templateName: string | null;
  progressPercent: number;
  progressLabel: string;
  lastUpdated: string | null;
  showProceedToPostHire?: boolean;
  onProceedToPostHire?: () => void;
  proceedDisabledReason?: string | null;
  proceedBusy?: boolean;
  /** What proceeding does, shown under the button when it is enabled. */
  proceedNote?: string | null;
  proceedError?: string | null;
}) {
  const phaseLabel = lifecycle === "pre_hire" ? "Pre-hire" : "Post-hire";
  const clamped = Math.max(0, Math.min(100, progressPercent));

  return (
    <aside className="flex w-full max-w-[366px] flex-col gap-4 self-center lg:w-[366px] lg:shrink-0 lg:self-start">
      <section
        className="flex w-full flex-col rounded-2xl border border-[#E8ECF0] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
        style={{ minHeight: 420 }}
      >
        <h2
          className="text-center font-semibold"
          style={{ color: "#000000", fontSize: 16, lineHeight: "24px", fontWeight: 600 }}
        >
          Candidate Profile
        </h2>

        <div className="mt-6 flex justify-center">
          {profile.photoUrl ? (
            <div className="relative h-[88px] w-[88px] overflow-hidden rounded-full border-2 border-[#E8ECF0] bg-[#EEF2FF]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={profile.photoUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-full border-2 border-[#E8ECF0]">
              <CandidateListAvatar
                name={profile.name || "NA"}
                photoUrl={null}
                className="!h-full !w-full !text-2xl"
                size="md"
              />
            </div>
          )}
        </div>

        <div className="mt-4 text-center">
          <p
            className="font-semibold"
            style={{ color: "#012352", fontSize: 18, lineHeight: "28px", fontWeight: 600 }}
          >
            {profile.name || "—"}
          </p>
          <p
            className="mt-1 font-normal"
            style={{ color: "#6B7280", fontSize: 14, lineHeight: "20px", fontWeight: 400 }}
          >
            {profile.role || "—"}
          </p>
        </div>

        <dl className="mt-6 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="shrink-0 font-semibold text-black">Work Type</dt>
            <dd>
              {profile.workType ? (
                <span
                  className="inline-flex rounded-md text-[11px] font-semibold"
                  style={{
                    color: "#12AA00",
                    backgroundColor: "color-mix(in srgb, #12AA00 12%, white)",
                    padding: "4px 6px",
                  }}
                >
                  {profile.workType}
                </span>
              ) : (
                <span className="text-[#94A3B8]">—</span>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="shrink-0 font-semibold text-black">Department</dt>
            <dd className="text-right text-[#6B7280]">{profile.department || "—"}</dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="shrink-0 font-semibold text-black">Location</dt>
            <dd className="max-w-[160px] text-right text-[#6B7280]">{profile.location || "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="shrink-0 font-semibold text-black">Source</dt>
            <dd className="text-right text-[#6B7280]">{profile.source || "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="shrink-0 font-semibold text-black">Date Applied</dt>
            <dd className="text-right text-[#6B7280]">{profile.dateApplied || "—"}</dd>
          </div>
        </dl>

        {profile.statusLabel ? (
          <div className="mt-auto flex justify-center pt-5">
            <span
              className="inline-flex rounded-md text-[11px] font-semibold"
              style={{
                color: "#0050AA",
                backgroundColor: "color-mix(in srgb, #0050AA 12%, white)",
                padding: "4px 6px",
              }}
            >
              {profile.statusLabel}
            </span>
          </div>
        ) : null}

        {aiAnalysisHref ? (
          <Link
            href={aiAnalysisHref}
            aria-label={`Open AI analysis overview for ${profile.name}`}
            className={`${profile.statusLabel ? "mt-3" : "mt-auto"} inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-primary)]`}
            style={{
              color: "var(--brand-primary)",
              borderColor: "color-mix(in srgb, var(--brand-primary) 35%, white)",
              backgroundColor: "color-mix(in srgb, var(--brand-primary) 10%, white)",
            }}
          >
            <BrandedSvgIcon src="/ai-icon.svg" className="h-4 w-4" color="var(--brand-primary)" />
            AI Analysis Overview
          </Link>
        ) : null}
      </section>

      <section className="w-full rounded-2xl border border-[#E8ECF0] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span
              style={{
                color: "#374151",
                fontFamily: "var(--font-tenant-branding-inter), Inter, sans-serif",
                fontSize: 16,
                fontWeight: 600,
                lineHeight: "24px",
              }}
            >
              Progress
            </span>
            <span
              className="text-right"
              style={{
                color: "#374151",
                fontFamily: "var(--font-tenant-branding-inter), Inter, sans-serif",
                fontSize: 12,
                fontWeight: 600,
                lineHeight: "16px",
              }}
            >
              {clamped}% Completed
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-[#E5E7EB]">
            <div
              className="h-full rounded-full bg-[#22C55E] transition-all duration-300"
              style={{ width: `${clamped}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-medium text-[#64748B]">{progressLabel}</p>
          {lastUpdated ? (
            <p
              className="mt-4 flex items-center justify-center gap-1.5 text-center"
              style={{
                color: "#374151",
                fontFamily: "var(--font-tenant-branding-inter), Inter, sans-serif",
                fontSize: 12,
                fontWeight: 600,
                lineHeight: "16px",
              }}
            >
              <HireFigmaIcon src={PRE_HIRE_UI_ICONS.calendarDate} width={16} height={16} />
              Last Updated: {lastUpdated}
            </p>
          ) : null}
        </div>

        <div className="mt-5 space-y-4 border-t border-[#F1F5F9] pt-4">
          <div className="flex items-center gap-3">
            <SidebarIconTile
              src={PRE_HIRE_UI_ICONS.phasePeople}
              alt="Phase"
              iconWidth={25}
              iconHeight={22}
            />
            <div className="min-w-0">
              <p
                style={{
                  color: "#6B7280",
                  fontFamily: "var(--font-tenant-branding-inter), Inter, sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  lineHeight: "20px",
                }}
              >
                Phase
              </p>
              <p className="text-sm font-semibold" style={{ color: "var(--brand-secondary)" }}>
                {phaseLabel}
              </p>
            </div>
          </div>

          <div className="border-t border-[#F1F5F9]" />

          <div className="flex items-center gap-3">
            <SidebarIconTile
              src={PRE_HIRE_UI_ICONS.templateSearch}
              alt="Template"
              iconWidth={29}
              iconHeight={29}
            />
            <div className="min-w-0">
              <p
                style={{
                  color: "#6B7280",
                  fontFamily: "var(--font-tenant-branding-inter), Inter, sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  lineHeight: "20px",
                }}
              >
                Template
              </p>
              <p
                className="truncate text-sm font-semibold"
                style={{ color: "var(--brand-secondary)" }}
              >
                {templateName || "—"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {showProceedToPostHire ? (
        <section
          className="w-full rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          style={{
            borderColor: "color-mix(in srgb, var(--brand-primary) 35%, white)",
            backgroundColor: "color-mix(in srgb, var(--brand-primary) 10%, white)",
          }}
        >
          <h3 className="text-sm font-semibold" style={{ color: "var(--brand-primary)" }}>
            Ready to move forward?
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-[#64748B]">
            Start the pre-boarding process and prepare everything for new hire needs before day
            one.
          </p>
          <button
            type="button"
            onClick={onProceedToPostHire}
            disabled={Boolean(proceedDisabledReason) || proceedBusy}
            aria-busy={proceedBusy || undefined}
            title={proceedDisabledReason || undefined}
            className="mt-4 inline-flex w-full items-center justify-center gap-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: "var(--brand-primary)" }}
          >
            {proceedBusy ? "Moving to Post-hire…" : "Proceed to Post-hire process →"}
          </button>
          {proceedError ? (
            <p className="mt-2 text-[11px] text-rose-700" role="alert">
              {proceedError}
            </p>
          ) : proceedDisabledReason ? (
            <p className="mt-2 text-[11px] text-[#B45309]">{proceedDisabledReason}</p>
          ) : proceedNote ? (
            <p className="mt-2 text-[11px] text-[#64748B]">{proceedNote}</p>
          ) : null}
        </section>
      ) : null}
    </aside>
  );
}

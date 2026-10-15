"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, ChevronUp, Shield } from "lucide-react";
import { CandidateListAvatar } from "@/app/admin_recruiter/components/CandidateListAvatar";
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import type { CandidateWorkflowStepView } from "@/lib/onboarding/candidate-workflow-phase-view";
import {
  isReferenceVerificationStep,
  stepDecision,
  stepDisplayStatusLabel,
  stepStatusPill,
} from "@/lib/onboarding/assigned-workflow-steps";
import { STEP_PILL_TONE_CLASSES } from "@/lib/onboarding/interview-step";
import type { HireStageGroup } from "@/lib/onboarding/hire-stage-groups";
import {
  HireFigmaIcon,
  PRE_HIRE_TITLE_STYLE,
  PRE_HIRE_UI_ICONS,
  resolveStageHeroIcon,
} from "./hire-figma-assets";
import { HireStepTypeIcon } from "./HireStepTypeIcon";
import type { HireStageSidebarProfile } from "./HireStageSidebar";
import { StepRefreshButton, useStepStatusRefresh } from "./StepStatusRefresh";

const CLIPBOARD_ICON = "/icons/Hire-icons/pre-hire-icons/clipboard-task-list.svg";
const HERO_SIZE_PX = 165;

function formatShortDate(value: string | null | undefined, prefix: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${prefix} on ${mm}/${dd}/${date.getFullYear()}`;
}

function isStepDone(step: CandidateWorkflowStepView): boolean {
  return (
    step.displayStatus === "completed" ||
    step.displayStatus === "approved" ||
    step.displayStatus === "submitted" ||
    step.displayStatus === "skipped" ||
    step.displayStatus === "not_applicable"
  );
}

function stepSubtitle(step: CandidateWorkflowStepView, done: boolean, hasPill: boolean): string {
  const prefix =
    step.displayStatus === "submitted"
      ? "Submitted"
      : isReferenceVerificationStep(step)
        ? "Verified"
        : "Completed";
  const status = done
    ? formatShortDate(step.completedAt, prefix) ?? (hasPill ? null : stepDisplayStatusLabel(step))
    : hasPill
      ? null
      : stepDisplayStatusLabel(step);
  return [status, step.required ? null : "Optional"].filter(Boolean).join(" · ");
}

function incompleteRemaining(stage: HireStageGroup): number {
  return stage.steps.filter((step) => !isStepDone(step)).length;
}

function SummaryText({ summary }: { summary: string }) {
  return (
    <>
      {summary.split(/(•)/).map((part, i) => (
        <span
          key={`${i}-${part}`}
          style={{
            color:
              /\bIn Progress\b/i.test(part) && !/\bCurrent Step\b/i.test(part)
                ? "var(--brand-secondary)"
                : "var(--brand-primary)",
          }}
        >
          {part}
        </span>
      ))}
    </>
  );
}

export function PostHireSummaryBanner({
  profile,
  statusLabel,
  hiredAt,
  percent,
  completedSteps,
  totalSteps,
  lastUpdated,
  aiAnalysisHref,
}: {
  profile: HireStageSidebarProfile;
  statusLabel: string;
  hiredAt: string | null;
  percent: number;
  completedSteps: number;
  totalSteps: number;
  lastUpdated: string | null;
  aiAnalysisHref?: string | null;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <section className="overflow-hidden rounded-2xl border border-[#E8ECF0] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col lg:flex-row lg:items-stretch">
        <div className="flex w-full items-center gap-4 p-4 sm:gap-5 sm:p-5 lg:w-1/2">
          <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-full border-2 border-[#E8ECF0] sm:h-[88px] sm:w-[88px]">
            <CandidateListAvatar
              name={profile.name || "NA"}
              photoUrl={profile.photoUrl}
              className="!h-full !w-full !text-2xl"
              size="md"
            />
          </div>
          <div className="min-w-0">
            <span
              className="inline-flex rounded-md text-[11px] font-semibold"
              style={{
                color: "#0050AA",
                backgroundColor: "color-mix(in srgb, #0050AA 12%, white)",
                padding: "4px 8px",
              }}
            >
              {statusLabel}
            </span>
            <p
              className="mt-2 truncate font-semibold"
              style={{ color: "#012352", fontSize: 18, lineHeight: "28px" }}
            >
              {profile.name}
            </p>
            {profile.role ? (
              <p className="mt-0.5 truncate text-sm text-[#6B7280]">{profile.role}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="flex items-center gap-1.5 text-xs text-[#94A3B8]">
                <HireFigmaIcon src={PRE_HIRE_UI_ICONS.calendarDate} width={14} height={14} />
                Hire date: {hiredAt ?? "—"}
              </p>
              {aiAnalysisHref ? (
                <Link
                  href={aiAnalysisHref}
                  aria-label={`Open AI analysis overview for ${profile.name}`}
                  className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-primary)]"
                  style={{
                    color: "var(--brand-primary)",
                    borderColor: "color-mix(in srgb, var(--brand-primary) 35%, white)",
                    backgroundColor: "color-mix(in srgb, var(--brand-primary) 10%, white)",
                  }}
                >
                  <BrandedSvgIcon src="/ai-icon.svg" className="h-3.5 w-3.5" color="var(--brand-primary)" />
                  AI Analysis Overview
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        <div
          className="mx-4 h-px shrink-0 bg-[#E5E7EB] lg:mx-0 lg:my-5 lg:h-auto lg:w-px lg:self-stretch"
          aria-hidden
        />

        <div className="flex w-full flex-col justify-center p-4 sm:p-5 lg:w-1/2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <HireFigmaIcon src={CLIPBOARD_ICON} width={24} height={24} className="shrink-0" />
              <h3 className="truncate text-sm font-semibold" style={{ color: "var(--brand-secondary)" }}>
                Overall Onboarding Progress
              </h3>
            </div>
            <span className="shrink-0 text-sm font-semibold" style={{ color: "var(--brand-secondary)" }}>
              {clamped}%
            </span>
          </div>
          <div
            className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#E5E7EB]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={clamped}
            aria-label="Overall onboarding progress"
          >
            <div
              className="h-full rounded-full bg-[#22C55E] transition-all duration-300"
              style={{ width: `${clamped}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B]">
            <span className="font-medium">
              {completedSteps} of {totalSteps} Completed
            </span>
            <span className="inline-flex items-center gap-1.5 text-[#94A3B8]">
              <HireFigmaIcon src={PRE_HIRE_UI_ICONS.calendarDate} width={14} height={14} />
              Last Updated: {lastUpdated ?? "—"}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function StageHero({ src, muted, compact }: { src: string; muted?: boolean; compact?: boolean }) {
  return (
    <div className={`flex justify-center px-4 ${compact ? "pt-[26.4px] pb-[8.8px]" : "pt-[26.4px] pb-6"}`}>
      <div className="relative" style={{ height: HERO_SIZE_PX, width: HERO_SIZE_PX }}>
        <Image
          src={src}
          alt=""
          fill
          className={`object-contain ${muted ? "opacity-70 grayscale" : ""}`}
          sizes={`${HERO_SIZE_PX}px`}
        />
      </div>
    </div>
  );
}

function PostTaskCard({
  step,
  onInspect,
  refreshingId,
  onRefreshStep,
}: {
  step: CandidateWorkflowStepView;
  onInspect: (step: CandidateWorkflowStepView) => void;
  refreshingId: string | null;
  onRefreshStep?: (stepId: string) => void;
}) {
  const done = isStepDone(step);
  const pill = stepStatusPill(step);
  const rejected = step.displayStatus === "rejected" || step.displayStatus === "blocked";
  const settled = done || rejected || stepDecision(step) != null;
  const inProgress = !settled;
  const subtitle = stepSubtitle(step, done, Boolean(pill));

  return (
    <div
      className="flex w-full items-center gap-2 rounded-xl border bg-white px-3 py-3 transition hover:shadow-sm"
      style={{
        borderColor: settled ? "#E8ECF0" : "color-mix(in srgb, var(--brand-primary) 40%, #E8ECF0)",
      }}
    >
      <button
        type="button"
        onClick={() => onInspect(step)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-primary)]"
      >
        <HireStepTypeIcon step={step} done={settled} />
        <span className="min-w-0 flex-1">
          <span
            className="block truncate"
            style={{
              color: "#000000",
              fontFamily: "var(--font-tenant-branding-inter), Inter, sans-serif",
              fontSize: 16.1,
              fontWeight: 600,
              lineHeight: "22px",
            }}
          >
            {step.title}
          </span>
          {subtitle ? (
            <span
              className="mt-0.5 block text-xs"
              style={{ color: inProgress ? "var(--brand-secondary)" : "#6B7280" }}
            >
              {subtitle}
            </span>
          ) : null}
        </span>
      </button>
      {pill ? (
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${STEP_PILL_TONE_CLASSES[pill.tone]}`}
        >
          {pill.label}
        </span>
      ) : done ? (
        <HireFigmaIcon src={PRE_HIRE_UI_ICONS.stageCheckOutlineGreen} width={22} height={22} className="shrink-0" />
      ) : (
        <StepRefreshButton step={step} refreshingId={refreshingId} onRefreshStep={onRefreshStep} />
      )}
    </div>
  );
}

function LockedStageCard({
  stage,
  previousStageName,
  isNextUnlock,
}: {
  stage: HireStageGroup;
  previousStageName: string | null;
  isNextUnlock: boolean;
}) {
  const total = stage.steps.length;
  return (
    <div className="mx-3 mb-5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-5 text-center sm:mx-4">
      <div className="mb-3 flex justify-center">
        <HireFigmaIcon
          src={isNextUnlock ? PRE_HIRE_UI_ICONS.pendingClock : PRE_HIRE_UI_ICONS.stageLocked}
          width={isNextUnlock ? 28 : 32}
          height={isNextUnlock ? 28 : 32}
          className="opacity-70"
        />
      </div>
      {isNextUnlock ? (
        <p className="text-sm font-medium leading-snug text-[#374151]">
          {previousStageName
            ? `Available after completing the ${previousStageName}`
            : "Available after completing prior steps"}
        </p>
      ) : (
        <>
          <p className="text-base font-semibold text-[#374151]">Locked</p>
          <p className="mt-1 text-sm text-[#6B7280]">Complete prior steps to continue</p>
        </>
      )}
      <p className="mt-3 text-sm font-semibold" style={{ color: "var(--brand-secondary)" }}>
        {total} {total === 1 ? "Task" : "Tasks"} Total
      </p>
    </div>
  );
}

function PostStageColumn({
  stage,
  index,
  previousStageName,
  isNextUnlock,
  onInspectStep,
  refreshingId,
  onRefreshStep,
}: {
  stage: HireStageGroup;
  index: number;
  previousStageName: string | null;
  isNextUnlock: boolean;
  onInspectStep: (step: CandidateWorkflowStepView) => void;
  refreshingId: string | null;
  onRefreshStep?: (stepId: string) => void;
}) {
  const locked = stage.status === "locked";
  const completed = stage.status === "completed";
  const current = stage.status === "current" || stage.status === "in_progress";
  const [viewTasks, setViewTasks] = useState(current);
  const heroSrc = resolveStageHeroIcon(stage.name, "post_hire");
  const remaining = incompleteRemaining(stage);

  useEffect(() => {
    if (current) setViewTasks(true);
  }, [current]);

  return (
    <section
      aria-label={`${stage.name} stage`}
      className={`flex min-h-[420px] min-w-[260px] flex-1 basis-0 flex-col overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${
        locked ? "border-[#E8ECF0] bg-[#F8FAFC]" : completed ? "border-transparent bg-white" : "border-[#E8ECF0]"
      }`}
      style={current ? { backgroundColor: "color-mix(in srgb, var(--brand-primary) 6%, white)" } : undefined}
    >
      <header className="flex items-start gap-3 border-b border-[#E8ECF0]/60 px-3 py-3.5 sm:px-4">
        <span
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
            locked ? "bg-[#E5E7EB] text-[#9CA3AF]" : "text-white"
          }`}
          style={
            locked
              ? undefined
              : { backgroundColor: completed ? "#12AA00" : "var(--brand-secondary)" }
          }
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold" style={PRE_HIRE_TITLE_STYLE}>
            {stage.name}
          </h3>
          <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-medium sm:text-sm">
            {completed ? (
              <HireFigmaIcon src={PRE_HIRE_UI_ICONS.doubleCheck} width={14} height={14} className="shrink-0" />
            ) : null}
            {locked ? (
              <>
                <HireFigmaIcon src={PRE_HIRE_UI_ICONS.pendingClock} width={14} height={14} className="shrink-0" />
                <span className="text-[#9CA3AF]">Upcoming</span>
              </>
            ) : (
              <SummaryText summary={stage.summaryLabel} />
            )}
          </p>
        </div>
      </header>

      <div className="flex flex-1 flex-col">
        {locked ? (
          <>
            <StageHero src={heroSrc} muted />
            <LockedStageCard stage={stage} previousStageName={previousStageName} isNextUnlock={isNextUnlock} />
          </>
        ) : viewTasks ? (
          <div className="flex flex-col gap-[11px] px-3 py-[13.2px]">
            <StageHero src={heroSrc} compact />
            {stage.steps.map((step) => (
              <PostTaskCard
                key={step.id}
                step={step}
                onInspect={onInspectStep}
                refreshingId={refreshingId}
                onRefreshStep={onRefreshStep}
              />
            ))}
            {current && remaining > 0 ? (
              <div
                className="mt-1 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium"
                style={{
                  borderColor: "color-mix(in srgb, var(--brand-secondary) 35%, white)",
                  color: "var(--brand-secondary)",
                  backgroundColor: "color-mix(in srgb, var(--brand-secondary) 6%, white)",
                }}
              >
                <HireFigmaIcon src={PRE_HIRE_UI_ICONS.stageLocked} width={18} height={18} />
                {remaining} {remaining === 1 ? "task" : "tasks"} remaining
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <StageHero src={heroSrc} />
            {completed ? (
              <p className="mt-1 px-4 pb-4 text-center text-sm font-semibold" style={{ color: "#12AA00" }}>
                {stage.completedCount} {stage.completedCount === 1 ? "Task" : "Tasks"} Completed
              </p>
            ) : (
              <p className="px-4 pb-4 text-center text-sm font-medium text-[#6B7280]">
                {stage.steps.length} {stage.steps.length === 1 ? "Task" : "Tasks"} Total
              </p>
            )}
          </>
        )}
      </div>

      {!locked ? (
        <button
          type="button"
          onClick={() => setViewTasks((open) => !open)}
          className="mt-auto flex items-center justify-center gap-1 border-t border-[#E8ECF0] bg-white/80 px-3 py-3 text-sm font-semibold text-[#64748B] transition hover:bg-white"
          aria-expanded={viewTasks}
        >
          View Tasks
          {viewTasks ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      ) : null}
    </section>
  );
}

/** Figma Post-Hire board: one card per stage, left to right, driven by the candidate's workflow steps. */
export function PostHireStageColumns({
  stages,
  onInspectStep,
  onRefresh,
}: {
  stages: HireStageGroup[];
  onInspectStep: (step: CandidateWorkflowStepView) => void;
  /** Reloads the journey; the pending-step icon becomes a refresh button when set. */
  onRefresh?: () => void | Promise<void>;
}) {
  const { refreshingId, refreshStep } = useStepStatusRefresh(onRefresh);
  const onRefreshStep = onRefresh ? (stepId: string) => void refreshStep(stepId) : undefined;

  if (!stages.length) {
    return (
      <div className="rounded-2xl border border-[#E8ECF0] bg-white px-5 py-8 text-sm text-[#64748B]">
        No workflow steps are assigned for this phase yet.
      </div>
    );
  }

  const firstLockedIndex = stages.findIndex((stage) => stage.status === "locked");

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {stages.map((stage, index) => (
          <PostStageColumn
            key={stage.id}
            stage={stage}
            index={index}
            previousStageName={index > 0 ? stages[index - 1]!.name : null}
            isNextUnlock={index === firstLockedIndex}
            onInspectStep={onInspectStep}
            refreshingId={refreshingId}
            onRefreshStep={onRefreshStep}
          />
        ))}
      </div>
      <p className="flex items-center justify-center gap-2 pb-2 text-center text-xs text-[#94A3B8]">
        <Shield className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Your data is secured and protected. BrassHR follows industry-standard security and compliance.
      </p>
    </>
  );
}

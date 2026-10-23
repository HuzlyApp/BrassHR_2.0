"use client";

import { useMemo, useState } from "react";
import CandidateWorkflowStepModal from "@/app/admin_recruiter/components/CandidateWorkflowStepModal";
import { candidateAiAnalysisHref } from "@/app/admin_recruiter/candidates/candidate-links";
import type { KnownStageApplication } from "@/app/admin_recruiter/components/StageStatusSequenceButtons";
import { ScheduleInterviewModal } from "@/app/admin_recruiter/calendar/components/ScheduleInterviewModal";
import {
  invitationSuccessMessage,
  type InterviewInvitationSummary,
  type ScheduleInterviewPayload,
} from "@/lib/interviews/schedule-payload";
import SuccessModal from "@/app/components/SuccessModal";
import type {
  CandidateWorkflowAssignmentView,
  CandidateWorkflowPhaseView,
  CandidateWorkflowStepView,
} from "@/lib/onboarding/candidate-workflow-phase-view";
import type { WorkflowStepInspection } from "@/lib/onboarding/candidate-workflow-step-inspection";
import {
  groupStepsIntoHireStages,
  hireStageProgressMeta,
  isStepLockedAfterScreeningRejection,
  type HireStageLifecycle,
} from "@/lib/onboarding/hire-stage-groups";
import { HireStageAccordion } from "./HireStageAccordion";
import { HireStageSidebar, type HireStageSidebarProfile } from "./HireStageSidebar";
import { HireStageStepper } from "./HireStageStepper";
import { PostHireStageColumns, PostHireSummaryBanner } from "./PostHireStageColumns";

import { areAllRequiredPreHireStepsComplete } from "@/lib/onboarding/lock-post-hire";

function formatLongDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { timeZone: "America/New_York", 
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function HireStageBoard({
  workerId,
  lifecycle,
  loading,
  error,
  assigned,
  emptyMessage,
  steps,
  assignment,
  phaseView,
  profile,
  activationFailed,
  onRequestPostHireTab,
  onPostHireActivated,
  applicationId,
  knownApplication,
  jobTitle,
  onRetry,
  onScheduled,
  onWorkflowChanged,
}: {
  workerId?: string;
  lifecycle: HireStageLifecycle;
  loading?: boolean;
  error?: string | null;
  assigned: boolean;
  emptyMessage: string;
  steps: CandidateWorkflowStepView[];
  assignment?: CandidateWorkflowAssignmentView | null;
  phaseView?: CandidateWorkflowPhaseView | null;
  profile: HireStageSidebarProfile & {
    email?: string | null;
    phone?: string | null;
  };
  activationFailed?: boolean;
  onRequestPostHireTab?: () => void;
  /** Called after "Proceed" hires the candidate; should refresh the journey and open Post-Hire. */
  onPostHireActivated?: () => void | Promise<void>;
  applicationId?: string | null;
  knownApplication?: KnownStageApplication | null;
  jobTitle?: string | null;
  onRetry?: () => void;
  onScheduled?: () => void | Promise<void>;
  /** Called after staff change a step's status so the journey can refresh without unmounting. */
  onWorkflowChanged?: () => void | Promise<void>;
}) {
  const stages = useMemo(() => groupStepsIntoHireStages(steps, lifecycle), [steps, lifecycle]);
  const progressMeta = useMemo(() => hireStageProgressMeta(stages), [stages]);

  const [openStepId, setOpenStepId] = useState<string | null>(null);
  const [inspection, setInspection] = useState<WorkflowStepInspection | null>(null);
  const [inspectionLoading, setInspectionLoading] = useState(false);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [scheduleSuccess, setScheduleSuccess] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const title = lifecycle === "pre_hire" ? "Pre-hire" : "Post-hire";
  const aiAnalysisHref = workerId ? candidateAiAnalysisHref(workerId, { applicationId }) : null;
  const subtitle =
    lifecycle === "pre_hire"
      ? "Track every step before someone becomes part of your team."
      : "Track onboarding steps after the candidate joins your team.";

  const requiredPreHireDone =
    lifecycle === "pre_hire" && areAllRequiredPreHireStepsComplete(steps);
  const preHireComplete = requiredPreHireDone && Boolean(phaseView?.postHireVisible);

  // Unlock happens when the last required Pre-Hire step is completed. This button only opens the tab.
  const canActivatePostHire = false;
  const [activatingPostHire, setActivatingPostHire] = useState(false);
  const [activatePostHireError, setActivatePostHireError] = useState<string | null>(null);

  const proceedDisabledReason = canActivatePostHire
    ? null
    : !phaseView?.postHireVisible
      ? "Select the candidate and complete required Pre-Hire steps to unlock Post-Hire."
      : phaseView.postHireLocked
        ? "Post-Hire is locked until hire activation completes."
        : null;

  async function proceedToPostHire() {
    if (proceedDisabledReason || activatingPostHire) return;
    if (!canActivatePostHire) {
      onRequestPostHireTab?.();
      return;
    }
    setActivatingPostHire(true);
    setActivatePostHireError(null);
    try {
      const res = await fetch(`/api/admin/job-applications/${encodeURIComponent(applicationId!)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "hired", note: "Pre-Hire completed; moved to Post-Hire" }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not move the candidate to Post-Hire.");
      if (onPostHireActivated) {
        await onPostHireActivated();
      } else {
        await onWorkflowChanged?.();
        onRequestPostHireTab?.();
      }
    } catch (err) {
      setActivatePostHireError(
        err instanceof Error ? err.message : "Could not move the candidate to Post-Hire."
      );
    } finally {
      setActivatingPostHire(false);
    }
  }

  async function fetchInspection(stepId: string, options?: { silent?: boolean }) {
    if (!workerId) return;
    if (!options?.silent) {
      setInspection(null);
      setInspectionError(null);
      setInspectionLoading(true);
    }
    try {
      const res = await fetch(
        `/api/admin/candidates/${encodeURIComponent(workerId)}/workflow-steps/${encodeURIComponent(stepId)}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as WorkflowStepInspection & { error?: string };
      if (!res.ok) {
        if (!options?.silent) setInspectionError(json.error || "Failed to load step details.");
        return;
      }
      setInspection(json);
    } catch (err) {
      if (!options?.silent) {
        setInspectionError(err instanceof Error ? err.message : "Failed to load step details.");
      }
    } finally {
      if (!options?.silent) setInspectionLoading(false);
    }
  }

  function openStep(step: CandidateWorkflowStepView) {
    if (lifecycle === "pre_hire" && isStepLockedAfterScreeningRejection(step, steps)) return;
    setOpenStepId(step.id);
    void fetchInspection(step.id);
  }

  function closeStep() {
    setOpenStepId(null);
    setInspection(null);
    setInspectionError(null);
  }

  async function handleStepUpdated() {
    await Promise.all([
      onWorkflowChanged?.(),
      openStepId ? fetchInspection(openStepId, { silent: true }) : null,
    ]);
  }

  function openSchedule() {
    closeStep();
    setScheduleError(null);
    setScheduleOpen(true);
  }

  async function handleSchedule(payload: ScheduleInterviewPayload) {
    setScheduleSubmitting(true);
    setScheduleError(null);
    try {
      const res = await fetch("/api/admin/applicant-appointments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        invitation?: InterviewInvitationSummary;
      };
      if (!res.ok) throw new Error(json.error || "Failed to schedule interview");
      setScheduleOpen(false);
      setScheduleSuccess(invitationSuccessMessage(json.invitation));
      await onScheduled?.();
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Failed to schedule interview");
    } finally {
      setScheduleSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-[#E5E7EB] bg-white px-5 py-10 text-sm text-[#64748B]">
        Loading {title} workflow…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-6 text-sm text-red-700">
        <p>{error}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 text-sm font-semibold underline underline-offset-2"
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  if (!assigned) {
    return (
      <div className="rounded-xl border border-[#E5E7EB] bg-white px-5 py-8 text-sm text-[#64748B]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Centered under Pre Hire / Post Hire tabs */}
        <div className="flex w-full justify-center">
          <HireStageStepper stages={stages} />
        </div>

        <header className="w-full shrink-0">
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{ color: "var(--brand-secondary)" }}
          >
            {title}
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">{subtitle}</p>
        </header>

        {activationFailed ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Candidate is hired but Post-Hire activation did not complete. Retry status change or
            conversion.
          </div>
        ) : null}

        {lifecycle === "post_hire" ? (
          <>
            <PostHireSummaryBanner
              profile={profile}
              statusLabel={
                phaseView?.currentStage === "onboarded"
                  ? "Onboarding / Worker Created"
                  : "Hired / Post-Hire Onboarding"
              }
              hiredAt={formatLongDate(phaseView?.hiredAt)}
              percent={
                progressMeta.totalStages > 0
                  ? Math.round((progressMeta.completedStages / progressMeta.totalStages) * 100)
                  : 0
              }
              completedSteps={progressMeta.completedStages}
              totalSteps={progressMeta.totalStages}
              lastUpdated={formatLongDate(phaseView?.phaseStartedAt ?? assignment?.assignedAt)}
              aiAnalysisHref={aiAnalysisHref}
            />
            <PostHireStageColumns
              stages={stages}
              onInspectStep={openStep}
              onRefresh={onWorkflowChanged}
            />
          </>
        ) : (
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              <HireStageAccordion
                stages={stages}
                workflowSteps={steps}
                lifecycle={lifecycle}
                applicationId={applicationId}
                knownApplication={knownApplication}
                onInspectStep={openStep}
                onScheduleInterview={openSchedule}
                onRefresh={onWorkflowChanged}
                onStatusChanged={() => void onWorkflowChanged?.()}
              />
            </div>

            <HireStageSidebar
              lifecycle={lifecycle}
              profile={profile}
              templateName={assignment?.workflowName ?? phaseView?.currentWorkflowName ?? null}
              progressPercent={progressMeta.percent}
              progressLabel={progressMeta.label}
              lastUpdated={formatLongDate(phaseView?.phaseStartedAt ?? assignment?.assignedAt)}
              showProceedToPostHire={preHireComplete && phaseView?.workflowHasPostHireSteps !== false}
              proceedDisabledReason={proceedDisabledReason}
              aiAnalysisHref={aiAnalysisHref}
              proceedBusy={activatingPostHire}
              proceedError={activatePostHireError}
              proceedNote={
                canActivatePostHire
                  ? "This marks the candidate as hired and emails them their Post-Hire steps."
                  : null
              }
              onProceedToPostHire={() => void proceedToPostHire()}
            />
          </div>
        )}
      </div>

      <CandidateWorkflowStepModal
        open={Boolean(openStepId)}
        onOpenChange={(open) => {
          if (!open) closeStep();
        }}
        loading={inspectionLoading}
        error={inspectionError}
        inspection={inspection}
        workerId={workerId}
        onStepUpdated={handleStepUpdated}
        onScheduleInterview={lifecycle === "pre_hire" && workerId ? openSchedule : undefined}
      />

      {workerId ? (
        <ScheduleInterviewModal
          open={scheduleOpen}
          applicants={[
            {
              id: workerId,
              name: profile.name || "Candidate",
              status: "interview",
            },
          ]}
          submitting={scheduleSubmitting}
          error={scheduleError}
          onClose={() => {
            setScheduleOpen(false);
            setScheduleError(null);
          }}
          onSubmit={(payload) => void handleSchedule(payload)}
          fixedWorkerId={workerId}
          fixedApplicantName={profile.name || "Candidate"}
          fixedApplicationId={applicationId ?? undefined}
          fixedJobTitle={jobTitle ?? undefined}
          defaultTitle={
            jobTitle ? `Interview — ${jobTitle}` : `Interview — ${profile.name || "Candidate"}`
          }
        />
      ) : null}
      <SuccessModal
        open={Boolean(scheduleSuccess)}
        onClose={() => setScheduleSuccess(null)}
        title="Interview scheduled"
        message={scheduleSuccess || ""}
      />
    </>
  );
}

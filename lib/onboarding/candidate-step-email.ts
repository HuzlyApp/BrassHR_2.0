import type { SupabaseClient } from "@supabase/supabase-js";
import { writeActivityLog } from "@/lib/audit/activity-log";
import {
  buildApplicantEmailContext,
  contextToTemplateVariables,
} from "@/lib/email/applicant-email-context";
import { sendOnboardingApplicantEmail } from "@/lib/email/send-templated-email";
import { EMAIL_TEMPLATE_TYPE } from "@/lib/email-templates/template-keys";
import { sendStepReadyEmail } from "@/lib/onboarding/step-ready-email";
import {
  computeCandidateOnboardingFrontier,
  type CandidateOnboardingFrontier,
} from "@/lib/onboarding/candidate-onboarding-projection";
import { buildProgressStatusMaps } from "@/lib/onboarding/compute-max-allowed-from-progress";
import { ensureWorkerOnboardingProgress } from "@/lib/onboarding/ensure-worker-progress";
import { isAgreementEsignStep } from "@/lib/onboarding/lock-post-hire";
import type { StaffStepEmailResult } from "@/lib/onboarding/staff-step-review-shared";
import {
  applyStaffWorkflowStepAction,
  loadApplicationApplicantConfig,
  loadProgressPayload,
  loadStaffStepContext,
  resolveStaffStepEligibility,
  type StaffStepContext,
} from "@/lib/onboarding/staff-workflow-step-review";
import { isWelcomeEmailWorkflowStep } from "@/lib/onboarding/welcome-email-step";
import { getEnabledTenantSteps } from "@/lib/onboarding/tenant-step-navigation";
import type { OnboardingStepStatus, TenantOnboardingStep } from "@/lib/onboarding/types";

type StepFailure = { ok: false; status: number; code?: string; error: string };

export type CandidateStepEmailResult = { ok: true; email: StaffStepEmailResult } | StepFailure;

async function sendWelcomeEmailFromPostHireStep(
  supabase: SupabaseClient,
  params: {
    ctx: StaffStepContext;
    workerId: string;
    tenantId: string;
    stepRecordId: string;
    origin: string | null;
    actor: { userId: string | null; email: string | null };
    request?: Request;
  }
): Promise<CandidateStepEmailResult> {
  const { ctx, workerId, tenantId, stepRecordId } = params;
  if (!params.origin) {
    return { ok: false, status: 400, code: "NO_APP_ORIGIN", error: "Could not resolve the candidate portal address." };
  }
  if (ctx.phase !== "post_hire") {
    return {
      ok: false,
      status: 409,
      code: "NOT_POST_HIRE",
      error: "The welcome email template is sent from Post-Hire welcome steps only.",
    };
  }

  const { jobTitle } = await loadApplicationApplicantConfig(supabase, {
    tenantId,
    applicationId: ctx.applicationId,
  });

  let sendResult;
  try {
    sendResult = await sendOnboardingApplicantEmail(supabase, {
      tenantId,
      workerId,
      templateKey: EMAIL_TEMPLATE_TYPE.WELCOME,
      origin: params.origin,
      continuationReason: "welcome",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send welcome email.";
    return { ok: false, status: 502, code: "SEND_FAILED", error: message };
  }

  if (sendResult.sent && ctx.mapped.status !== "completed") {
    await applyStaffWorkflowStepAction(supabase, {
      workerId,
      tenantId,
      stepRecordId,
      action: "complete",
      note: null,
      actor: params.actor,
      notifyCandidate: false,
      origin: params.origin,
      request: params.request,
    }).catch((error) => {
      console.error("[candidate-step-email] welcome step complete after send failed", error);
    });
  }

  await writeActivityLog({
    actorUserId: params.actor.userId,
    action: "workflow_step.welcome_email_sent",
    entityType: "applicant_workflow_step_record",
    entityId: String(ctx.record.id),
    tenantId,
    metadata: {
      worker_id: workerId,
      application_id: ctx.applicationId,
      step_title: ctx.mapped.title,
      template_key: EMAIL_TEMPLATE_TYPE.WELCOME,
      job_title: jobTitle ?? null,
      sent: sendResult.sent,
      skipped: sendResult.skipped ?? false,
      reason: sendResult.reason ?? null,
    },
    request: params.request,
  });

  return {
    ok: true,
    email: {
      sent: sendResult.sent,
      skipped: sendResult.skipped ?? false,
      reason: sendResult.reason,
      nextStepTitle: ctx.mapped.title,
      lockedStepTitle: null,
    },
  };
}

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Why the candidate can't act on `targetStepId` right now, or null when the step is open to them.
 * Uses the same frontier as the applicant portal so the email never points at a locked step.
 */
export function candidateStepEmailBlock(params: {
  candidateSteps: TenantOnboardingStep[];
  targetStepId: string;
  statusById: Map<string, OnboardingStepStatus | string>;
  frontier: CandidateOnboardingFrontier;
}): { code: string; error: string } | null {
  const index = params.candidateSteps.findIndex((step) => step.id === params.targetStepId);
  if (index < 0) {
    return {
      code: "STEP_NOT_IN_APPLICATION",
      error: "This step isn't part of the candidate's current application steps.",
    };
  }
  const status = params.statusById.get(params.targetStepId) ?? "pending";
  if (status === "completed") {
    return { code: "STEP_ALREADY_COMPLETED", error: "The candidate has already completed this step." };
  }
  if (index + 1 <= params.frontier.maxAllowedStepIndex) return null;

  const earlier = params.candidateSteps.slice(0, index).find((step) => {
    const earlierStatus = params.statusById.get(step.id) ?? "pending";
    return earlierStatus !== "completed" && earlierStatus !== "skipped";
  });
  if (params.frontier.waitingOnInternal || !earlier) {
    return {
      code: "STEP_LOCKED",
      error: "This step is still locked. It unlocks after your team completes an earlier internal step.",
    };
  }
  return {
    code: "STEP_LOCKED",
    error: `This step is still locked. The candidate must first complete "${earlier.title}".`,
  };
}

/** Staff-triggered email asking the candidate to complete one of their own (candidate-owned) steps. */
export async function sendCandidateStepEmail(
  supabase: SupabaseClient,
  params: {
    workerId: string;
    tenantId: string;
    stepRecordId: string;
    origin: string | null;
    actor: { userId: string | null; email: string | null };
    request?: Request;
  }
): Promise<CandidateStepEmailResult> {
  const { workerId, tenantId } = params;
  if (!params.origin) {
    return { ok: false, status: 400, code: "NO_APP_ORIGIN", error: "Could not resolve the candidate portal address." };
  }

  const ctx = await loadStaffStepContext(supabase, { workerId, tenantId, stepRecordId: params.stepRecordId });
  if (!ctx.ok) return ctx;

  const recordStepType = asText(ctx.record.step_type) ?? ctx.mapped.stepType;
  if (isWelcomeEmailWorkflowStep(recordStepType)) {
    return sendWelcomeEmailFromPostHireStep(supabase, {
      ctx,
      workerId,
      tenantId,
      stepRecordId: params.stepRecordId,
      origin: params.origin,
      actor: params.actor,
      request: params.request,
    });
  }

  const eligibility = resolveStaffStepEligibility(ctx.tenantStep, "pending", {
    stepType: asText(ctx.record.step_type),
    settings: asObject(ctx.record.settings),
  });
  if (eligibility.allowed) {
    return {
      ok: false,
      status: 409,
      code: "STEP_STAFF_OWNED",
      error: "Your team completes this step, so there's nothing for the candidate to fill in.",
    };
  }

  const { config, engineConfig, activePhase, jobToken, jobTitle } = await loadApplicationApplicantConfig(
    supabase,
    { tenantId, applicationId: ctx.applicationId }
  );
  if (!config) {
    return { ok: false, status: 409, code: "NO_APPLICANT_CONFIG", error: "The candidate's application steps couldn't be loaded." };
  }

  const snapshotStepId = asText(ctx.record.snapshot_step_id);
  const candidateSteps = getEnabledTenantSteps(config);
  const target =
    candidateSteps.find((step) => step.id === ctx.mapped.tenantStepId) ??
    candidateSteps.find((step) => snapshotStepId && asText(step.metadata?.workflow_node_id) === snapshotStepId) ??
    null;

  const { progressId } = await ensureWorkerOnboardingProgress(supabase, workerId, tenantId, ctx.applicationId);
  const progress = await loadProgressPayload(supabase, progressId, engineConfig);
  const allCandidateStepsCompleted =
    candidateSteps.length > 0 &&
    candidateSteps.every(
      (step) => progress.steps.find((s) => s.onboarding_step_id === step.id)?.status === "completed"
    );
  if (activePhase === "pre_hire" && progress.submittedAt && allCandidateStepsCompleted) {
    return {
      ok: false,
      status: 409,
      code: "APPLICATION_SUBMITTED",
      error: "The candidate has already completed all steps for their application.",
    };
  }

  const statusById = buildProgressStatusMaps(candidateSteps, progress);
  const frontier = computeCandidateOnboardingFrontier({
    engineOrder: config.candidateEngineOrder,
    candidateSteps,
    progress,
  });
  const block = candidateStepEmailBlock({
    candidateSteps,
    targetStepId: target?.id ?? "",
    statusById,
    frontier,
  });
  const agreementAwaitingRecruiter = isAgreementEsignStep({
    snapshotStepId: String(ctx.tenantStep?.metadata?.workflow_step_id ?? ctx.mapped.snapshotStepId ?? ""),
    stepKey: ctx.mapped.stepKey,
    stepType: recordStepType,
    title: ctx.mapped.title,
  }) && asText(ctx.record.review_decision) !== "complete";
  if (block?.code === "STEP_ALREADY_COMPLETED" && !agreementAwaitingRecruiter) {
    return { ok: false, status: 409, code: "STEP_ALREADY_COMPLETED", error: "The candidate has already completed this step." };
  }
  if (!target) {
    return { ok: false, status: 409, ...(block ?? { code: "STEP_NOT_IN_APPLICATION", error: "Step not found." }) };
  }
  // Staff explicitly clicked "Send Email" for this step modal, so send step-wise mail for target step.
  const emailStep = target;
  const lockedStepTitle = null;

  const emailCtx = await buildApplicantEmailContext(supabase, {
    tenantId,
    workerId,
    origin: params.origin,
    continuationReason: "step_ready",
    continuationMetadata: {
      purpose: "staff_step_email",
      stepKey: emailStep.step_key,
      requestedStepKey: target.step_key,
      sentBy: params.actor.userId,
    },
    applicationId: ctx.applicationId,
    jobToken,
    continuationTargetStepKey: emailStep.step_key,
  });
  if (!emailCtx) {
    return { ok: false, status: 409, code: "NO_APPLICANT_EMAIL", error: "This candidate has no email address on file." };
  }

  const result = await sendStepReadyEmail(supabase, {
    phase: activePhase,
    to: emailCtx.applicantEmail,
    tenantId,
    variables: {
      ...contextToTemplateVariables(emailCtx),
      jobTitle,
      completedStepTitle: "",
      nextStepTitle: emailStep.title,
      nextStepLink: emailCtx.applicantContinuationLink,
    },
  });

  await writeActivityLog({
    actorUserId: params.actor.userId,
    action: "workflow_step.candidate_email_sent",
    entityType: "applicant_workflow_step_record",
    entityId: String(ctx.record.id),
    tenantId,
    metadata: {
      worker_id: workerId,
      application_id: ctx.applicationId,
      onboarding_step_id: emailStep.id,
      step_title: emailStep.title,
      requested_step_title: target.title,
      sent: result.sent,
      reason: result.reason ?? null,
    },
    request: params.request,
  });

  return {
    ok: true,
    email: {
      sent: result.sent,
      skipped: result.skipped ?? false,
      reason: result.reason,
      nextStepTitle: emailStep.title,
      lockedStepTitle,
    },
  };
}

/** First candidate step inside the frontier that still needs the candidate. */
export function currentOpenCandidateStep(
  candidateSteps: TenantOnboardingStep[],
  statusById: Map<string, OnboardingStepStatus | string>,
  frontier: CandidateOnboardingFrontier
): TenantOnboardingStep | null {
  return (
    candidateSteps.find((step, index) => {
      if (index + 1 > frontier.maxAllowedStepIndex) return false;
      const status = statusById.get(step.id) ?? "pending";
      return status !== "completed" && status !== "skipped";
    }) ?? null
  );
}

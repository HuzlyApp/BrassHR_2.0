import type { SupabaseClient } from "@supabase/supabase-js";
import { staffDisplayName } from "@/lib/account/resolve-staff-users";
import { writeActivityLog } from "@/lib/audit/activity-log";
import {
  buildApplicantEmailContext,
  contextToTemplateVariables,
} from "@/lib/email/applicant-email-context";
import { sendStepReadyEmail } from "@/lib/onboarding/step-ready-email";
import {
  ASSIGNED_STEP_RECORD_COLUMNS,
  POST_HIRE_NOT_AVAILABLE_CODE,
  POST_HIRE_NOT_AVAILABLE_MESSAGE,
  isStaffOwnedAssignedRecord,
  mapAssignedStepRecords,
  parseAssignedStepPhase,
  resolveAssignedStepStatus,
  toAssignedStepRecordInput,
  type MappedAssignedStep,
  type ProgressRowInput,
} from "@/lib/onboarding/assigned-workflow-steps";
import { computeCandidateOnboardingFrontier } from "@/lib/onboarding/candidate-onboarding-projection";
import { buildProgressStatusMaps } from "@/lib/onboarding/compute-max-allowed-from-progress";
import { ensureWorkerOnboardingProgress } from "@/lib/onboarding/ensure-worker-progress";
import { applyApplicantConfigFilters } from "@/lib/onboarding/filter-applicant-steps";
import { loadApplicantConfigForJobToken } from "@/lib/onboarding/load-config-for-job-workflow";
import { loadTenantOnboardingConfig } from "@/lib/onboarding/load-tenant-config";
import { canStaffAccessPostHireSteps } from "@/lib/onboarding/resolve-candidate-hire-gate";
import { ensureCandidateConvertedIfAgreementCompleted } from "@/lib/onboarding/auto-convert-after-agreement";
import { isAgreementEsignStep } from "@/lib/onboarding/lock-post-hire";
import { loadApplicationWorkflowPhase } from "@/lib/onboarding/resolve-application-workflow-phase";
import { resolveInstanceApplicationId } from "@/lib/onboarding/scoped-step-progress";
import { RECRUITER_SCREENING_STEP_TYPE } from "@/lib/onboarding/recruiter-screening-progress";
import { advanceApplicationToScreeningComplete } from "@/lib/onboarding/recruiter-screening-status";
import { isInterviewStep } from "@/lib/onboarding/interview-step";
import { advanceApplicationToInterviewComplete } from "@/lib/onboarding/interview-completion-status";
import { advanceApplicationToSelected } from "@/lib/onboarding/selected-status";
import {
  allowedStaffActions,
  completionOwnerLabel,
  readStaffStepReview,
  staffActionTargetStatus,
  type StaffStepAction,
  type StaffStepActionEligibility,
  type StaffStepEmailResult,
  type StaffStepReview,
  staffStepVariantForLibraryId,
  type StaffStepVariant,
} from "@/lib/onboarding/staff-step-review-shared";
import {
  approveStepDocumentsOnCompletion,
  loadStepDocumentUploads,
} from "@/lib/onboarding/staff-step-documents";
import { getEnabledTenantSteps } from "@/lib/onboarding/tenant-step-navigation";
import type {
  OnboardingStepStatus,
  StepProgressRow,
  TenantOnboardingConfig,
  TenantOnboardingStep,
  WorkerOnboardingProgressPayload,
} from "@/lib/onboarding/types";
import type { EmploymentLifecyclePhase } from "@/lib/onboarding/workflow-phase-groups";
import type { ApplicantLifecyclePhase } from "@/lib/onboarding/workflow-phase";
import {
  getWorkflowSettings,
  isApplicantCompletionOwner,
  isInternalLibraryStepId,
  isWorkerVisibleStep,
} from "@/lib/onboarding/workflow-settings";
import { isParameterizedJobApplicationStepType } from "@/lib/onboarding/job-application-parameters";

const STAFF_REVIEW_HISTORY_LIMIT = 20;

export type StaffStepActionResult =
  | {
      ok: true;
      status: OnboardingStepStatus;
      review: StaffStepReview;
      email: StaffStepEmailResult | null;
      applicationStatus?: { statusName: string } | null;
    }
  | { ok: false; status: number; code?: string; error: string };

type StepFailure = { ok: false; status: number; code?: string; error: string };

export type StaffStepContext = {
  ok: true;
  record: Record<string, unknown>;
  instance: Record<string, unknown>;
  phase: EmploymentLifecyclePhase;
  mapped: MappedAssignedStep;
  tenantStep: TenantOnboardingStep | null;
  config: TenantOnboardingConfig | null;
  applicationId: string | null;
};

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const STEP_RECORD_SELECT = ASSIGNED_STEP_RECORD_COLUMNS;

/**
 * Maps every record in the instance (not just the target) so tenant-step matching
 * agrees with the Hire Journey list, which consumes candidates in position order.
 */
export async function mapInstanceStepRecord(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    instanceId: string;
    recordId: string;
    tenantSteps: TenantOnboardingStep[];
    progressByStepId: Map<string, ProgressRowInput>;
    assignedAt: string | null;
    applicationId?: string | null;
  }
): Promise<MappedAssignedStep | null> {
  const { data, error } = await supabase
    .from("applicant_workflow_step_records")
    .select(STEP_RECORD_SELECT)
    .eq("tenant_id", params.tenantId)
    .eq("workflow_instance_id", params.instanceId)
    .order("position", { ascending: true });
  if (error) throw error;
  const mapped = mapAssignedStepRecords({
    records: ((data ?? []) as Array<Record<string, unknown>>).map(toAssignedStepRecordInput),
    tenantSteps: params.tenantSteps,
    progressByStepId: params.progressByStepId,
    assignedAt: params.assignedAt,
    applicationId: params.applicationId,
  });
  return mapped.find((step) => step.id === params.recordId) ?? null;
}

/** Assigned step record fields used when the step has no published tenant step behind it. */
export type UnlinkedStepRecord = {
  stepType: string | null;
  settings: Record<string, unknown> | null;
};

export function staffStepVariant(
  tenantStep: TenantOnboardingStep | null,
  stepType?: string | null
): StaffStepVariant {
  const fromRecord = staffStepVariantForLibraryId(stepType);
  if (fromRecord !== "default") return fromRecord;
  return staffStepVariantForLibraryId(asText(tenantStep?.metadata?.workflow_step_id));
}

/**
 * Staff-owned steps without a published tenant step (job workflows can contain nodes the tenant
 * config never published) are reviewed on the assigned step record itself.
 */
export function canReviewUnlinkedRecord(record: UnlinkedStepRecord | null | undefined): boolean {
  if (!record) return false;
  if (isInternalLibraryStepId(record.stepType) || isParameterizedJobApplicationStepType(record.stepType)) return true;
  return !isApplicantCompletionOwner(asText(record.settings?.completionOwner));
}

/** Internal steps whose completion owner defaulted to the applicant still belong to staff. */
function staffOwnerLabel(owner: string | null | undefined, stepType: string | null | undefined): string {
  if (!isApplicantCompletionOwner(owner)) return completionOwnerLabel(owner);
  return isParameterizedJobApplicationStepType(stepType) ? "Recruiter / HR" : "Internal team";
}

export function resolveStaffStepEligibility(
  tenantStep: TenantOnboardingStep | null,
  currentStatus: OnboardingStepStatus | string | null | undefined,
  record?: UnlinkedStepRecord | null
): StaffStepActionEligibility {
  if (!tenantStep) {
    if (canReviewUnlinkedRecord(record)) {
      const variant = staffStepVariant(null, record!.stepType);
      return {
        allowed: true,
        ownerLabel: staffOwnerLabel(asText(record!.settings?.completionOwner), record!.stepType),
        actions: allowedStaffActions(currentStatus, variant),
        variant,
        reason: null,
      };
    }
    return {
      allowed: false,
      ownerLabel: null,
      actions: [],
      variant: "default",
      reason: "This step isn't linked to a stored progress record, so it can't be updated here.",
    };
  }
  if (isWorkerVisibleStep(tenantStep)) {
    return {
      allowed: false,
      ownerLabel: "Candidate",
      actions: [],
      variant: "default",
      reason: "The candidate completes this step from their application portal.",
    };
  }
  const owner = getWorkflowSettings(tenantStep).completionOwner;
  const variant = staffStepVariant(tenantStep, record?.stepType);
  return {
    allowed: true,
    ownerLabel: staffOwnerLabel(owner, record?.stepType ?? asText(tenantStep.metadata?.workflow_step_id)),
    actions: allowedStaffActions(currentStatus, variant),
    variant,
    reason: null,
  };
}

export async function loadStaffStepContext(
  supabase: SupabaseClient,
  params: { workerId: string; tenantId: string; stepRecordId: string }
): Promise<StaffStepContext | StepFailure> {
  const { workerId, tenantId, stepRecordId } = params;

  const { data: worker, error: workerError } = await supabase
    .from("worker")
    .select("id, status, converted_at, converted_worker_id, conversion_status")
    .eq("id", workerId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (workerError) throw workerError;
  if (!worker) return { ok: false, status: 404, error: "Candidate not found" };

  const { data: record, error: recordError } = await supabase
    .from("applicant_workflow_step_records")
    .select(STEP_RECORD_SELECT)
    .eq("id", stepRecordId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (recordError) throw recordError;
  if (!record) return { ok: false, status: 404, error: "Workflow step not found" };

  const { data: instance, error: instanceError } = await supabase
    .from("applicant_workflow_instances")
    .select("id, worker_id, application_id, started_at, created_at, tenant_id")
    .eq("id", record.workflow_instance_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (instanceError) throw instanceError;
  if (!instance || asText(instance.worker_id) !== workerId) {
    return { ok: false, status: 404, error: "Workflow step not found" };
  }

  const phase = parseAssignedStepPhase({
    phase: asText(record.phase),
    settings: asObject(record.settings),
  });
  if (phase === "post_hire") {
    try {
      await ensureCandidateConvertedIfAgreementCompleted(supabase, { tenantId, workerId });
    } catch (e) {
      console.warn("[staff-review] ensureCandidateConvertedIfAgreementCompleted failed", e);
    }
  }
  if (
    phase === "post_hire" &&
    !(await canStaffAccessPostHireSteps(supabase, { tenantId, workerId, worker }))
  ) {
    return {
      ok: false,
      status: 403,
      code: POST_HIRE_NOT_AVAILABLE_CODE,
      error: POST_HIRE_NOT_AVAILABLE_MESSAGE,
    };
  }

  const [config, applicationId] = await Promise.all([
    loadTenantOnboardingConfig(supabase, tenantId, { workerFacing: false }),
    resolveInstanceApplicationId(supabase, {
      tenantId,
      instanceId: String(instance.id),
      instanceApplicationId: asText(instance.application_id),
    }),
  ]);
  const tenantSteps = config?.steps ?? [];

  const mapped = await mapInstanceStepRecord(supabase, {
    tenantId,
    instanceId: String(instance.id),
    recordId: String(record.id),
    tenantSteps,
    progressByStepId: new Map(),
    assignedAt: asText(instance.started_at) ?? asText(instance.created_at),
  });
  if (!mapped) return { ok: false, status: 404, error: "Workflow step not found" };

  return {
    ok: true,
    record: record as Record<string, unknown>,
    instance: instance as Record<string, unknown>,
    phase,
    mapped,
    tenantStep: mapped.tenantStepId
      ? tenantSteps.find((step) => step.id === mapped.tenantStepId) ?? null
      : null,
    config,
    applicationId,
  };
}

async function resolveActorName(
  supabase: SupabaseClient,
  actor: { userId: string | null; email: string | null }
): Promise<string | null> {
  if (actor.userId) {
    const { data } = await supabase
      .from("users")
      .select("first_name, last_name, email")
      .eq("id", actor.userId)
      .maybeSingle();
    if (data) {
      return staffDisplayName(
        data.first_name as string | null,
        data.last_name as string | null,
        (data.email as string | null) ?? actor.email
      );
    }
  }
  return actor.email?.trim() || null;
}

export type UnlockedApplicantStep =
  | { step: TenantOnboardingStep; reason: null }
  | { step: null; reason: "WAITING_ON_INTERNAL_STEP" | "NO_NEW_CANDIDATE_STEP" };

/**
 * Candidate-fillable step that completing `completedStepId` newly unlocked, using the same
 * engine-order gate as the applicant portal. Compares the frontier with the staff step
 * pending vs completed, so a candidate who is still working on earlier steps (or is blocked
 * by another internal step) gets no email.
 */
export function resolveUnlockedApplicantStep(params: {
  config: TenantOnboardingConfig;
  progress: WorkerOnboardingProgressPayload;
  completedStepId: string;
}): UnlockedApplicantStep {
  const candidateSteps = getEnabledTenantSteps(params.config);
  const frontierFor = (progress: WorkerOnboardingProgressPayload) =>
    computeCandidateOnboardingFrontier({
      engineOrder: params.config.candidateEngineOrder,
      candidateSteps,
      progress,
    });
  const before = frontierFor({
    ...params.progress,
    steps: params.progress.steps.map((row) =>
      row.onboarding_step_id === params.completedStepId ? { ...row, status: "pending" } : row
    ),
  });
  const after = frontierFor(params.progress);

  const statusById = buildProgressStatusMaps(candidateSteps, params.progress);
  const step = candidateSteps.find((candidate, index) => {
    const position = index + 1;
    if (position <= before.maxAllowedStepIndex || position > after.maxAllowedStepIndex) return false;
    const status = statusById.get(candidate.id) ?? "pending";
    return status !== "completed" && status !== "skipped";
  });
  if (step) return { step, reason: null };
  return {
    step: null,
    reason: after.waitingOnInternal ? "WAITING_ON_INTERNAL_STEP" : "NO_NEW_CANDIDATE_STEP",
  };
}

export async function loadProgressPayload(
  supabase: SupabaseClient,
  progressId: string,
  config: TenantOnboardingConfig | null
): Promise<WorkerOnboardingProgressPayload> {
  const [{ data, error }, { data: progressRow, error: progressError }] = await Promise.all([
    supabase
      .from("worker_onboarding_step_progress")
      .select("onboarding_step_id, status, completed_at, data")
      .eq("worker_onboarding_progress_id", progressId),
    supabase
      .from("worker_onboarding_progress")
      .select("status, submitted_at")
      .eq("id", progressId)
      .maybeSingle(),
  ]);
  if (error) throw error;
  if (progressError) throw progressError;
  const stepKeyById = new Map((config?.steps ?? []).map((step) => [step.id, step.step_key]));
  const steps: StepProgressRow[] = ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const stepId = String(row.onboarding_step_id);
    return {
      onboarding_step_id: stepId,
      step_key: stepKeyById.get(stepId) ?? null,
      status: String(row.status ?? "pending") as OnboardingStepStatus,
      completed_at: asText(row.completed_at),
      data: asObject(row.data),
    };
  });
  return {
    progressId,
    status: asText(progressRow?.status) ?? "in_progress",
    steps,
    submittedAt: asText(progressRow?.submitted_at),
  };
}

type ApplicationApplicantConfig = {
  /** The steps the candidate portal runs for this application (job workflow when available). */
  config: TenantOnboardingConfig | null;
  /** Same config before candidate projection, so internal (staff) steps are still in `steps`. */
  engineConfig: TenantOnboardingConfig | null;
  activePhase: ApplicantLifecyclePhase;
  jobToken: string | null;
  jobTitle: string;
};

export async function loadApplicationApplicantConfig(
  supabase: SupabaseClient,
  params: { tenantId: string; applicationId: string | null }
): Promise<ApplicationApplicantConfig> {
  const phaseRecord = params.applicationId
    ? await loadApplicationWorkflowPhase(supabase, {
        tenantId: params.tenantId,
        applicationId: params.applicationId,
      })
    : null;

  let jobToken: string | null = null;
  let jobTitle = "your application";
  if (phaseRecord?.jobRequisitionId) {
    const { data: job } = await supabase
      .from("job_requisitions")
      .select("public_job_token, public_title, source_job_title")
      .eq("id", phaseRecord.jobRequisitionId)
      .eq("tenant_id", params.tenantId)
      .maybeSingle();
    jobToken = asText(job?.public_job_token);
    jobTitle = asText(job?.public_title) ?? asText(job?.source_job_title) ?? jobTitle;
  }

  let config = await loadTenantOnboardingConfig(supabase, params.tenantId, { workerFacing: true });
  if (jobToken) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("slug")
      .eq("id", params.tenantId)
      .maybeSingle();
    try {
      config = (await loadApplicantConfigForJobToken(supabase, asText(tenant?.slug), jobToken)).config;
    } catch {
      // Stale or unpublished job: fall back to the tenant's published config.
    }
  }
  const activePhase = phaseRecord?.phase ?? "pre_hire";
  return {
    config: config ? applyApplicantConfigFilters(config, { activePhase }) : null,
    engineConfig: config,
    activePhase,
    jobToken,
    jobTitle,
  };
}

/**
 * The internal step the candidate portal gates on for an assigned record the Hire Journey
 * couldn't link (the job workflow has nodes the tenant's published config doesn't).
 */
export function findCandidateGateStep(
  config: TenantOnboardingConfig | null,
  snapshotStepId: string | null
): TenantOnboardingStep | null {
  if (!config || !snapshotStepId) return null;
  return (
    config.steps.find(
      (step) =>
        !step.id.startsWith("preview-") &&
        asText(step.metadata?.workflow_node_id) === snapshotStepId &&
        (!isWorkerVisibleStep(step) || isParameterizedJobApplicationStepType(asText(step.metadata?.workflow_step_id)))
    ) ?? null
  );
}

async function notifyCandidateNextStep(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    workerId: string;
    applicationId: string | null;
    origin: string | null;
    progressId: string | null;
    tenantConfig: TenantOnboardingConfig | null;
    completedStepId: string;
    completedStepTitle: string;
    instanceId?: string | null;
    completedRecordId?: string | null;
    completedPosition?: number | null;
  }
): Promise<StaffStepEmailResult> {
  if (!params.origin) return { sent: false, skipped: true, reason: "NO_APP_ORIGIN" };
  try {
    const { config, engineConfig, activePhase, jobToken, jobTitle } = await loadApplicationApplicantConfig(supabase, {
      tenantId: params.tenantId,
      applicationId: params.applicationId,
    });
    if (!config && !params.instanceId) return { sent: false, skipped: true, reason: "NO_APPLICANT_CONFIG" };

    let nextStepTitle: string | null = null;
    let nextStepKey: string | null = null;

    // 1. Check assigned workflow step records for this instance
    if (params.instanceId) {
      const { data: stepRows } = await supabase
        .from("applicant_workflow_step_records")
        .select(STEP_RECORD_SELECT)
        .eq("tenant_id", params.tenantId)
        .eq("workflow_instance_id", params.instanceId)
        .order("position", { ascending: true });

      const records = ((stepRows ?? []) as Array<Record<string, unknown>>).map(toAssignedStepRecordInput);
      const completedPos = params.completedPosition ?? 0;

      // Find the next incomplete step after the completed step
      const nextIncomplete = records.find(
        (r) => (r.position ?? 0) > completedPos && r.status !== "completed" && r.status !== "skipped"
      );

      if (nextIncomplete) {
        if (isStaffOwnedAssignedRecord(nextIncomplete)) {
          // The next step is another staff step, so candidate shouldn't be emailed yet
          return { sent: false, skipped: true, reason: "WAITING_ON_INTERNAL_STEP", nextStepTitle: null };
        }
        // It is a candidate step!
        nextStepTitle = nextIncomplete.title;
        nextStepKey = nextIncomplete.snapshot_step_id || nextIncomplete.step_type;
      }
    }

    // 2. Fall back to resolveUnlockedApplicantStep if not determined via instance records
    if (!nextStepTitle && config && params.progressId) {
      const progress = await loadProgressPayload(supabase, params.progressId, params.tenantConfig ?? engineConfig);
      const next = resolveUnlockedApplicantStep({
        config,
        progress,
        completedStepId: params.completedStepId,
      });
      if (next.step) {
        nextStepTitle = next.step.title;
        nextStepKey = next.step.step_key;
      } else if (!params.instanceId) {
        return { sent: false, skipped: true, reason: next.reason, nextStepTitle: null };
      }
    }

    if (!nextStepTitle) {
      return { sent: false, skipped: true, reason: "NO_NEW_CANDIDATE_STEP", nextStepTitle: null };
    }

    const ctx = await buildApplicantEmailContext(supabase, {
      tenantId: params.tenantId,
      workerId: params.workerId,
      origin: params.origin,
      continuationReason: "step_ready",
      continuationTargetStepKey: nextStepKey,
      continuationMetadata: {
        purpose: "next_step_ready",
        completedStepTitle: params.completedStepTitle,
        nextStepKey,
      },
      applicationId: params.applicationId,
      jobToken,
    });
    if (!ctx) {
      return { sent: false, skipped: true, reason: "NO_APPLICANT_EMAIL", nextStepTitle };
    }

    const result = await sendStepReadyEmail(supabase, {
      phase: activePhase,
      to: ctx.applicantEmail,
      tenantId: params.tenantId,
      variables: {
        ...contextToTemplateVariables(ctx),
        jobTitle,
        completedStepTitle: params.completedStepTitle,
        nextStepTitle,
        nextStepLink: ctx.applicantContinuationLink,
      },
    });
    return {
      sent: result.sent,
      skipped: result.skipped ?? false,
      reason: result.reason,
      nextStepTitle,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "EMAIL_FAILED";
    console.error("[staff-workflow-step-review] next step email failed", {
      tenantId: params.tenantId,
      workerId: params.workerId,
      reason,
    });
    return { sent: false, skipped: false, reason };
  }
}

export async function buildStaffReview(
  supabase: SupabaseClient,
  params: {
    action: StaffStepAction;
    note: string | null;
    actor: { userId: string | null; email: string | null };
    now: string;
  }
): Promise<StaffStepReview> {
  return {
    decision: params.action,
    note: params.note,
    reviewedByUserId: params.actor.userId,
    reviewedByName: await resolveActorName(supabase, params.actor),
    reviewedAt: params.now,
  };
}

/** Writes `staff_review` + capped `staff_review_history` into a progress row's `data`. */
function withStaffReview(
  existing: Record<string, unknown>,
  review: StaffStepReview,
  previousStatus: string,
  stepRecordId: string
): Record<string, unknown> {
  const stored = {
    step_record_id: stepRecordId,
    decision: review.decision,
    note: review.note,
    reviewed_by_user_id: review.reviewedByUserId,
    reviewed_by_name: review.reviewedByName,
    reviewed_at: review.reviewedAt,
    previous_status: previousStatus,
    source: "admin_hire_journey",
  };
  const history = Array.isArray(existing.staff_review_history)
    ? (existing.staff_review_history as unknown[])
    : readStaffStepReview(existing)
      ? [existing.staff_review]
      : [];
  return {
    ...existing,
    staff_review: stored,
    staff_review_history: [...history, stored].slice(-STAFF_REVIEW_HISTORY_LIMIT),
  };
}

/** The step record is the source of truth for staff decisions; every change is also appended to the event log. */
export async function writeStepRecordDecision(
  supabase: SupabaseClient,
  params: {
    recordId: string;
    instanceId: string;
    tenantId: string;
    action: StaffStepAction;
    previousStatus: string;
    nextStatus: OnboardingStepStatus;
    review: StaffStepReview;
    /** Keeps the candidate's own completion time when staff only verify the step. */
    completedAt?: string | null;
  }
): Promise<void> {
  const { recordId, tenantId, review, nextStatus } = params;
  // Actor ids reference public.users; an auth user without a profile row is stored by name only.
  const isMissingUser = (error: { code?: string } | null) => error?.code === "23503";

  const updateRecord = (actorId: string | null) =>
    supabase
      .from("applicant_workflow_step_records")
      .update({
        status: nextStatus,
        completed_at: nextStatus === "completed" ? params.completedAt ?? review.reviewedAt : null,
        completed_by: nextStatus === "completed" ? actorId : null,
        status_changed_at: review.reviewedAt,
        status_changed_by: actorId,
        status_changed_by_name: review.reviewedByName,
        review_decision: params.action,
        review_note: review.note,
        updated_at: review.reviewedAt,
      })
      .eq("id", recordId)
      .eq("tenant_id", tenantId);
  let { error } = await updateRecord(review.reviewedByUserId);
  if (isMissingUser(error)) ({ error } = await updateRecord(null));
  if (error) throw error;

  const insertEvent = (actorId: string | null) =>
    supabase.from("applicant_workflow_step_events").insert({
      tenant_id: tenantId,
      workflow_instance_id: params.instanceId,
      step_record_id: recordId,
      action: params.action,
      from_status: params.previousStatus,
      to_status: nextStatus,
      note: review.note,
      actor_user_id: actorId,
      actor_name: review.reviewedByName,
      created_at: review.reviewedAt,
    });
  let { error: eventError } = await insertEvent(review.reviewedByUserId);
  if (isMissingUser(eventError)) ({ error: eventError } = await insertEvent(null));
  if (eventError) {
    console.error("[staff-workflow-step-review] step event insert failed", eventError.message);
  }
}

async function loadLinkedProgressRow(
  supabase: SupabaseClient,
  params: {
    progressId: string;
    tenantStepId: string;
    workerId: string;
    tenantId: string;
    applicationId: string | null;
  }
): Promise<ProgressRowInput | null> {
  const load = async () => {
    const { data, error } = await supabase
      .from("worker_onboarding_step_progress")
      .select("onboarding_step_id, status, completed_at, updated_at, data")
      .eq("worker_onboarding_progress_id", params.progressId)
      .eq("onboarding_step_id", params.tenantStepId)
      .maybeSingle();
    if (error) throw error;
    return (data as ProgressRowInput | null) ?? null;
  };

  const row = await load();
  if (row) return row;
  const { error: insertError } = await supabase.from("worker_onboarding_step_progress").insert({
    worker_onboarding_progress_id: params.progressId,
    worker_id: params.workerId,
    tenant_id: params.tenantId,
    onboarding_step_id: params.tenantStepId,
    status: "pending",
    ...(params.applicationId ? { application_id: params.applicationId } : {}),
  });
  if (insertError && insertError.code !== "23505") throw insertError;
  return load();
}

function staffEligibilityFor(ctx: StaffStepContext): StaffStepActionEligibility {
  return resolveStaffStepEligibility(ctx.tenantStep, "pending", {
    stepType: asText(ctx.record.step_type),
    settings: asObject(ctx.record.settings),
  });
}

/**
 * Authorization eSign completed by a recruiter uses the same conversion as a candidate signature.
 * Post-hire e-sign steps stay on their own phase and do not convert the candidate.
 */
export function agreementStepCompletedByStaff(ctx: StaffStepContext): TenantOnboardingStep | null {
  if (ctx.phase === "post_hire") return null;
  const snapshotId = ctx.mapped.snapshotStepId;
  const title = ctx.tenantStep?.title ?? ctx.mapped.title;
  const stepKey = ctx.tenantStep?.step_key ?? ctx.mapped.stepKey;
  const workflowStepId = String(ctx.tenantStep?.metadata?.workflow_step_id ?? snapshotId ?? "");
  if (
    !isAgreementEsignStep({
      snapshotStepId: workflowStepId,
      stepKey,
      stepType: ctx.mapped.stepType,
      title,
    })
  ) {
    return null;
  }
  if (ctx.tenantStep) return ctx.tenantStep;
  return {
    id: ctx.mapped.tenantStepId ?? ctx.mapped.id,
    step_key: stepKey || "employee-agreement",
    title,
    description: null,
    step_type: "authorizations",
    sort_order: 0,
    is_required: ctx.mapped.required,
    is_enabled: true,
    metadata: {
      workflow_step_id: workflowStepId || "employee-agreement",
      workflow_settings: { phase: "pre_hire" },
    },
  };
}

function notStaffOwned(eligibility: StaffStepActionEligibility): StepFailure {
  return {
    ok: false,
    status: 409,
    code: "STEP_NOT_STAFF_OWNED",
    error: eligibility.reason ?? "This step can't be updated by staff.",
  };
}

export async function applyStaffWorkflowStepAction(
  supabase: SupabaseClient,
  params: {
    workerId: string;
    tenantId: string;
    stepRecordId: string;
    action: StaffStepAction;
    note: string | null;
    actor: { userId: string | null; email: string | null };
    notifyCandidate: boolean;
    origin: string | null;
    request?: Request;
    /** Staff completing a candidate's upload step after collecting the documents themselves. */
    onBehalfOfCandidate?: boolean;
  }
): Promise<StaffStepActionResult> {
  const { workerId, tenantId, action } = params;
  const note = params.note?.trim() || null;
  if (action === "reject" && !note) {
    return { ok: false, status: 400, code: "NOTE_REQUIRED", error: "Add a note explaining why this step is rejected." };
  }

  const ctx = await loadStaffStepContext(supabase, {
    workerId,
    tenantId,
    stepRecordId: params.stepRecordId,
  });
  if (!ctx.ok) return ctx;

  const initial = staffEligibilityFor(ctx);
  const onBehalf =
    !initial.allowed &&
    ctx.mapped.candidateOwned === true &&
    params.onBehalfOfCandidate === true &&
    action === "complete";
  if (action === "complete" && agreementStepCompletedByStaff(ctx)) {
    return {
      ok: false,
      status: 409,
      code: "AGREEMENT_AWAITING_CANDIDATE_SIGNATURE",
      error:
        "The candidate has to sign Authorization eSign first. After their signature is saved, review the signed document and mark the step complete.",
    };
  }
  if (!initial.allowed && !onBehalf) return notStaffOwned(initial);

  // Unlinked internal steps still gate the candidate on the job workflow's step, so mirror there.
  const tenantStepId =
    ctx.mapped.tenantStepId ??
    findCandidateGateStep(
      (await loadApplicationApplicantConfig(supabase, { tenantId, applicationId: ctx.applicationId }))
        .engineConfig,
      asText(ctx.record.snapshot_step_id)
    )?.id ??
    null;

  const { progressId } = await ensureWorkerOnboardingProgress(supabase, workerId, tenantId, ctx.applicationId);
  let progressRow: ProgressRowInput | null = null;
  if (tenantStepId) {
    progressRow = await loadLinkedProgressRow(supabase, {
      progressId,
      tenantStepId,
      workerId,
      tenantId,
      applicationId: ctx.applicationId,
    });
  }

  const currentStatus = resolveAssignedStepStatus(
    toAssignedStepRecordInput(ctx.record),
    progressRow ?? undefined
  ).status;
  let onBehalfDocumentIds: string[] = [];
  if (onBehalf) {
    if (currentStatus === "completed") {
      return {
        ok: false,
        status: 409,
        code: "INVALID_TRANSITION",
        error: "This step is already completed. Refresh to see the latest status.",
      };
    }
    const uploads = await loadStepDocumentUploads(supabase, {
      tenantId,
      workerId,
      tenantStepId: ctx.mapped.tenantStepId,
      stepType: ctx.mapped.stepType,
      config: ctx.config,
      candidateOwned: true,
      stepStatus: currentStatus,
    });
    onBehalfDocumentIds = uploads.slots.flatMap((slot) =>
      slot.requiredDocumentId ? [slot.requiredDocumentId] : []
    );
  } else if (!allowedStaffActions(currentStatus, initial.variant).includes(action)) {
    return {
      ok: false,
      status: 409,
      code: "INVALID_TRANSITION",
      error: `This step is already ${currentStatus === "failed" ? "rejected" : currentStatus.replaceAll("_", " ")}. Refresh to see the latest status.`,
    };
  }

  const now = new Date().toISOString();
  const nextStatus = staffActionTargetStatus(action);
  const review = await buildStaffReview(supabase, { action, note, actor: params.actor, now });

  await writeStepRecordDecision(supabase, {
    recordId: String(ctx.record.id),
    instanceId: String(ctx.instance.id),
    tenantId,
    action,
    previousStatus: currentStatus,
    nextStatus,
    review,
  });

  if (progressId && tenantStepId) {
    const { error: progressError } = await supabase
      .from("worker_onboarding_step_progress")
      .update({
        status: nextStatus,
        completed_at: nextStatus === "completed" ? now : null,
        updated_at: now,
        data: withStaffReview(asObject(progressRow?.data), review, currentStatus, String(ctx.record.id)),
      })
      .eq("worker_onboarding_progress_id", progressId)
      .eq("onboarding_step_id", tenantStepId);
    if (progressError) {
      console.error("[staff-workflow-step-review] progress mirror failed", progressError.message);
    }
  }

  if (onBehalf) {
    try {
      await approveStepDocumentsOnCompletion(supabase, {
        tenantId,
        workerId,
        requiredDocumentIds: onBehalfDocumentIds,
        reviewerUserId: params.actor.userId,
        reviewedAt: now,
      });
    } catch (approveError) {
      console.error("[staff-workflow-step-review] document approval failed", approveError);
    }
  }

  await writeActivityLog({
    actorUserId: params.actor.userId,
    action: `workflow_step.staff_${action}`,
    entityType: "applicant_workflow_step_record",
    entityId: String(ctx.record.id),
    tenantId,
    metadata: {
      worker_id: workerId,
      application_id: ctx.applicationId,
      onboarding_step_id: tenantStepId,
      step_title: ctx.mapped.title,
      previous_status: currentStatus,
      status: nextStatus,
      note,
      ...(onBehalf ? { on_behalf_of_candidate: true } : {}),
    },
    request: params.request,
  });

  let applicationStatus: { statusName: string } | null = null;
  if (action === "complete") {
    if (ctx.mapped.stepType === RECRUITER_SCREENING_STEP_TYPE) {
      try {
        applicationStatus = await advanceApplicationToScreeningComplete(supabase, {
          tenantId,
          applicationId: ctx.applicationId,
          actorUserId: params.actor.userId,
          origin: params.origin,
        });
      } catch (statusError) {
        console.error("[staff-workflow-step-review] screening status update failed", statusError);
      }
    } else if (
      isInterviewStep({
        stepKey: ctx.mapped.stepKey,
        stepType: ctx.mapped.stepType,
        onboardingType: ctx.mapped.onboardingType,
        title: ctx.mapped.title,
      })
    ) {
      try {
        applicationStatus = await advanceApplicationToInterviewComplete(supabase, {
          tenantId,
          applicationId: ctx.applicationId,
          actorUserId: params.actor.userId,
          origin: params.origin,
        });
      } catch (statusError) {
        console.error("[staff-workflow-step-review] interview status update failed", statusError);
      }
    } else if (initial.variant === "selection") {
      try {
        applicationStatus = await advanceApplicationToSelected(supabase, {
          tenantId,
          applicationId: ctx.applicationId,
          actorUserId: params.actor.userId,
          origin: params.origin,
        });
      } catch (statusError) {
        console.error("[staff-workflow-step-review] selected status update failed", statusError);
      }
    }
  }

  const email =
    action === "complete" && params.notifyCandidate
      ? await notifyCandidateNextStep(supabase, {
          tenantId,
          workerId,
          applicationId: ctx.applicationId,
          origin: params.origin,
          progressId,
          tenantConfig: ctx.config,
          completedStepId: tenantStepId ?? String(ctx.record.id),
          completedStepTitle: ctx.mapped.title,
          instanceId: String(ctx.instance.id),
          completedRecordId: String(ctx.record.id),
          completedPosition: typeof ctx.record.position === "number" ? ctx.record.position : 0,
        })
      : null;

  return { ok: true, status: nextStatus, review, email, applicationStatus };
}


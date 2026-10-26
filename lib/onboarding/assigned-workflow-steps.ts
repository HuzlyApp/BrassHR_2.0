import { isCandidateCheckboxStep, isI9CheckboxStep } from "@/lib/onboarding/candidate-checkbox-steps";
import { workflowStepIdToOnboardingType } from "@/lib/onboarding/workflow-step-mapping";
import type { OnboardingStepStatus, TenantOnboardingStep } from "@/lib/onboarding/types";
import { readStepLifecyclePhase } from "@/lib/onboarding/workflow-phase";
import {
  isAlwaysOptionalStep,
  isReferenceVerificationStep,
} from "@/lib/onboarding/reference-verification";
import {
  isApplicantCompletionOwner,
  isInternalLibraryStepId,
  isWorkerVisibleStep,
} from "@/lib/onboarding/workflow-settings";
import {
  decisionLabel,
  isDecisionVariant,
  staffStepVariantForLibraryId,
  type StaffDecisionAction,
} from "@/lib/onboarding/staff-step-review-shared";
import {
  interviewStepStatus,
  type InterviewStepSummary,
  type StepPillTone,
} from "@/lib/onboarding/interview-step";
import {
  countsForPhase,
  readNodeLifecyclePhase,
  type EmploymentLifecyclePhase,
  type PhaseProgressCounts,
} from "@/lib/onboarding/workflow-phase-groups";
import {
  findParameterizedJobApplicationProgress,
  isJobScreeningProgressData,
  isParameterizedJobApplicationStepType,
} from "@/lib/onboarding/job-application-parameters";
import {
  postHireScreenKindForStepId,
  readPostHireSubmission,
} from "@/lib/onboarding/post-hire-step-screens";

export type WorkflowStepDisplayStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "under_review"
  | "completed"
  | "approved"
  | "rejected"
  | "needs_revision"
  | "skipped"
  | "not_applicable"
  | "blocked";

export type WorkflowAssignmentSource = "job_mapping" | "manual" | "unknown";

export type AssignedStepRecordInput = {
  id: string;
  snapshot_step_id: string;
  title: string;
  step_type: string;
  is_required: boolean;
  status?: string | null;
  position: number;
  phase?: string | null;
  settings?: Record<string, unknown> | null;
  completed_at?: string | null;
  created_at?: string | null;
  completed_by?: string | null;
  status_changed_at?: string | null;
  status_changed_by?: string | null;
  status_changed_by_name?: string | null;
  review_decision?: string | null;
  review_note?: string | null;
};

/** Columns read from `applicant_workflow_step_records` for {@link toAssignedStepRecordInput}. */
export const ASSIGNED_STEP_RECORD_COLUMNS =
  "id, tenant_id, workflow_instance_id, snapshot_step_id, title, step_type, is_required, status, position, phase, settings, completed_at, created_at, completed_by, status_changed_at, status_changed_by, status_changed_by_name, review_decision, review_note";

export function toAssignedStepRecordInput(row: Record<string, unknown>): AssignedStepRecordInput {
  const settings = row.settings;
  return {
    id: String(row.id),
    snapshot_step_id: String(row.snapshot_step_id ?? ""),
    title: String(row.title ?? "Step"),
    step_type: String(row.step_type ?? "custom-step"),
    is_required: row.is_required !== false,
    status: asText(row.status),
    position: typeof row.position === "number" ? row.position : 0,
    phase: asText(row.phase),
    settings:
      settings && typeof settings === "object" && !Array.isArray(settings)
        ? (settings as Record<string, unknown>)
        : {},
    completed_at: asText(row.completed_at),
    created_at: asText(row.created_at),
    completed_by: asText(row.completed_by),
    status_changed_at: asText(row.status_changed_at),
    status_changed_by: asText(row.status_changed_by),
    status_changed_by_name: asText(row.status_changed_by_name),
    review_decision: asText(row.review_decision),
    review_note: asText(row.review_note),
  };
}

export type ProgressRowInput = {
  onboarding_step_id?: string | null;
  status?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  data?: Record<string, unknown> | null;
};

export type CandidateWorkflowAssignmentView = {
  workflowName: string;
  phase: EmploymentLifecyclePhase;
  version: string | null;
  assignedAt: string | null;
  assignmentSource: WorkflowAssignmentSource;
  currentStepTitle: string | null;
  completedCount: number;
  totalCount: number;
};

export type MappedAssignedStep = {
  id: string;
  snapshotStepId: string;
  tenantStepId: string | null;
  title: string;
  stepKey: string;
  stepType: string;
  onboardingType: string;
  phase: EmploymentLifecyclePhase;
  required: boolean;
  status: OnboardingStepStatus;
  displayStatus: WorkflowStepDisplayStatus;
  inspectable: boolean;
  unmatched: boolean;
  detail?: string;
  assignedAt: string | null;
  completedAt: string | null;
  /** Workflow builder settings (includes Figma stageName when present). */
  settings?: Record<string, unknown> | null;
  /** Booked interviews, set on interview steps by admin views. */
  interview?: InterviewStepSummary | null;
  reviewDecision?: string | null;
  reviewNote?: string | null;
  /** The candidate completes this step in their portal (not a recruiter / internal step). */
  candidateOwned?: boolean;
  /** When a recruiter verified the candidate's submission; null while it awaits review. */
  verifiedAt?: string | null;
  verifiedByName?: string | null;
};

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export function snapshotStepKey(snapshotStepId: string): string {
  return snapshotStepId.replace(/^step-/, "").trim();
}

export function parseAssignedStepPhase(
  record: Pick<AssignedStepRecordInput, "phase" | "settings">
): EmploymentLifecyclePhase {
  const fromColumn = asText(record.phase);
  if (fromColumn === "post_hire") return "post_hire";
  if (fromColumn === "pre_hire" || fromColumn === "transition") return "pre_hire";
  return readNodeLifecyclePhase(record.settings?.phase);
}

export function mapProgressToDisplayStatus(
  progressStatus: string | null | undefined,
  documentStatus?: string | null
): WorkflowStepDisplayStatus {
  const doc = String(documentStatus ?? "").trim().toLowerCase();
  if (doc === "rejected") return "rejected";
  if (doc === "needs_revision" || doc === "revision_requested") return "needs_revision";
  if (doc === "approved") return "approved";
  if (doc === "uploaded" || doc === "submitted") return "submitted";
  if (doc === "under_review" || doc === "review") return "under_review";

  const status = String(progressStatus ?? "").trim().toLowerCase();
  if (status === "completed") return "completed";
  if (status === "in_progress") return "in_progress";
  if (status === "skipped") return "skipped";
  if (status === "failed") return "blocked";
  if (status === "not_applicable" || status === "n/a") return "not_applicable";
  if (status === "submitted") return "submitted";
  if (status === "under_review") return "under_review";
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "blocked") return "blocked";
  return "not_started";
}

const VERIFIABLE_DISPLAY_STATUSES: ReadonlySet<WorkflowStepDisplayStatus> = new Set([
  "submitted",
  "completed",
  "approved",
]);

const RECRUITER_REVIEW_LIBRARY_IDS = new Set([
  "document-upload",
  "credential-license-verification",
  "certification-upload",
  "ssn-identity-verification",
  "tax-forms",
  "employee-agreement",
  "agreement-esign",
  "agreement-signature",
  "welcome-packet-esign",
  "policy-acknowledgment",
  "background-check",
  "authorization-esign",
]);

function libraryTokens(step: {
  snapshotStepId?: string | null;
  stepKey?: string | null;
  stepType?: string | null;
}): string[] {
  return [step.snapshotStepId, step.stepKey, step.stepType]
    .map((value) => String(value ?? "").trim().toLowerCase().replaceAll("_", "-"))
    .filter(Boolean);
}

/**
 * Agreement / signature and document steps stay Submitted until a recruiter verifies them.
 * Checkbox, typed answers, and resume steps do not: the candidate finishing them is completion.
 */
export function candidateStepRequiresRecruiterReview(step: {
  snapshotStepId?: string | null;
  stepKey?: string | null;
  stepType?: string | null;
  onboardingType?: string | null;
  title?: string | null;
}): boolean {
  if (isResumeLikeAssignedStep(step)) return false;
  const checkboxLike = {
    step_key: step.stepKey ?? step.stepType,
    title: step.title,
    metadata: { workflow_step_id: step.stepType ?? step.snapshotStepId ?? "" },
  };
  if (isCandidateCheckboxStep(checkboxLike) || isI9CheckboxStep({ ...step, ...checkboxLike })) return false;

  const onboarding = String(step.onboardingType ?? "").trim().toLowerCase();
  if (
    onboarding === "document_upload" ||
    onboarding === "professional_license" ||
    onboarding === "authorizations"
  ) {
    return true;
  }

  const tokens = libraryTokens(step);
  if (tokens.some((token) => RECRUITER_REVIEW_LIBRARY_IDS.has(token) || [...RECRUITER_REVIEW_LIBRARY_IDS].some((id) => token.includes(id)))) {
    return true;
  }

  const title = String(step.title ?? "").trim().toLowerCase();
  if (
    /collect documents|document upload|upload documents|certification|credential|licen[cs]e|tax form|identity verification/.test(
      title
    )
  ) {
    return true;
  }
  return /agreement|e-sign|esign|\bsignature\b/.test(title);
}

/**
 * Document and agreement steps the candidate finished read Submitted until a recruiter
 * marks them complete. Checkbox, input, and resume steps read Completed immediately.
 * Progress stays `completed`, so the candidate's next step is never held back.
 */
export function candidateReviewDisplayStatus(
  step: Pick<
    MappedAssignedStep,
    | "status"
    | "displayStatus"
    | "candidateOwned"
    | "verifiedAt"
    | "snapshotStepId"
    | "stepKey"
    | "stepType"
    | "onboardingType"
    | "title"
  >
): WorkflowStepDisplayStatus {
  if (!step.candidateOwned) return step.displayStatus;
  if (candidateStepRequiresRecruiterReview(step)) {
    if (step.status !== "completed") return step.displayStatus;
    if (!VERIFIABLE_DISPLAY_STATUSES.has(step.displayStatus)) return step.displayStatus;
    return step.verifiedAt ? "completed" : "submitted";
  }
  if (
    step.displayStatus === "rejected" ||
    step.displayStatus === "needs_revision" ||
    step.displayStatus === "blocked"
  ) {
    return step.displayStatus;
  }
  if (step.status === "completed" || step.displayStatus === "submitted" || step.displayStatus === "approved") {
    return "completed";
  }
  return step.displayStatus;
}

/** Resume / profile collection steps often have evidence in worker_resumes, not step_progress. */
export function isResumeLikeAssignedStep(step: {
  stepKey?: string | null;
  stepType?: string | null;
  onboardingType?: string | null;
  title?: string | null;
}): boolean {
  const hay = `${step.stepKey ?? ""} ${step.stepType ?? ""} ${step.onboardingType ?? ""} ${step.title ?? ""}`
    .trim()
    .toLowerCase();
  return /resume/.test(hay) || hay.includes("basic profile");
}

export const SSN_IDENTITY_STEP_TYPE = "ssn-identity-verification";

/**
 * SSN / ID files live on the shared `worker_documents` row, so an earlier step (e.g. a background
 * check authorization) can collect them; the fronts of both are what the identity step requires.
 */
export function hasRequiredIdentityDocuments(
  row: Record<string, unknown> | null | undefined
): boolean {
  return Boolean(String(row?.ssn_url ?? "").trim() && String(row?.drivers_license_url ?? "").trim());
}

/**
 * Align list-card displayStatus with the step drawer: uploaded docs / resumes
 * should show Submitted (etc.) even when worker_onboarding_step_progress is still pending.
 */
export function enrichAssignedStepsDisplayFromEvidence(params: {
  steps: MappedAssignedStep[];
  documentStatusByStepKey?: Map<string, string | null | undefined>;
  hasResumeUpload?: boolean;
  hasIdentityDocuments?: boolean;
}): MappedAssignedStep[] {
  const byKey = params.documentStatusByStepKey ?? new Map();
  return params.steps.map((step) => {
    let docStatus =
      byKey.get(step.stepKey) ??
      byKey.get(step.stepType) ??
      byKey.get(step.onboardingType) ??
      null;

    if (!docStatus && params.hasResumeUpload && isResumeLikeAssignedStep(step)) {
      docStatus = "uploaded";
    }

    if (
      !docStatus &&
      params.hasIdentityDocuments &&
      step.stepType === SSN_IDENTITY_STEP_TYPE &&
      (step.displayStatus === "not_started" || step.displayStatus === "in_progress")
    ) {
      docStatus = "uploaded";
    }

    if (!docStatus) return step;

    const displayStatus = candidateReviewDisplayStatus({
      ...step,
      displayStatus: mapProgressToDisplayStatus(step.status, docStatus),
    });
    if (displayStatus === step.displayStatus) return step;
    return { ...step, displayStatus };
  });
}

export function displayStatusLabel(status: WorkflowStepDisplayStatus): string {
  const labels: Record<WorkflowStepDisplayStatus, string> = {
    not_started: "Not Started",
    in_progress: "In Progress",
    submitted: "Submitted",
    under_review: "Under Review",
    completed: "Completed",
    approved: "Approved",
    rejected: "Rejected",
    needs_revision: "Needs Revision",
    skipped: "Skipped",
    not_applicable: "Not Applicable",
    blocked: "Blocked",
  };
  return labels[status];
}

export { isReferenceVerificationStep };

/**
 * Decision steps are only touched by staff, so each status maps to the button that produced it
 * (e.g. Qualified / On Hold / Not Selected); undecided reads as "Pending Decision", never "Not Started".
 */
function decisionForDisplayStatus(status: WorkflowStepDisplayStatus): StaffDecisionAction | null {
  switch (status) {
    case "completed":
    case "approved":
      return "complete";
    case "in_progress":
    case "under_review":
    case "needs_revision":
      return "needs_review";
    case "rejected":
    case "blocked":
      return "reject";
    default:
      return null;
  }
}

/** Staff decision on a decision step (reference verification, internal select), or null while undecided. */
export function stepDecision(step: {
  displayStatus: WorkflowStepDisplayStatus;
  stepType?: string | null;
}): { action: StaffDecisionAction; label: string } | null {
  const variant = staffStepVariantForLibraryId(step.stepType);
  if (!isDecisionVariant(variant)) return null;
  const action = decisionForDisplayStatus(step.displayStatus);
  return action ? { action, label: decisionLabel(variant, action) } : null;
}

type StepStatusInput = {
  displayStatus: WorkflowStepDisplayStatus;
  stepType?: string | null;
  interview?: InterviewStepSummary | null;
};

const DECISION_PILL_TONE: Record<StaffDecisionAction, StepPillTone> = {
  complete: "success",
  needs_review: "warning",
  reject: "danger",
};

/** Status pill for the right end of a step row; null when the row shows an icon instead. */
export function stepStatusPill(step: StepStatusInput): { label: string; tone: StepPillTone } | null {
  const interview = interviewStepStatus(step);
  if (interview) return interview.key === "not_scheduled" ? null : { label: interview.label, tone: interview.tone };
  const decision = stepDecision(step);
  if (decision) return { label: decision.label, tone: DECISION_PILL_TONE[decision.action] };
  if (step.displayStatus === "rejected" || step.displayStatus === "blocked") {
    return { label: "Rejected", tone: "danger" };
  }
  if (step.displayStatus === "submitted") return { label: "Submitted", tone: "info" };
  return null;
}

/** Step-aware wording for admin views. */
export function stepDisplayStatusLabel(step: StepStatusInput): string {
  const interview = interviewStepStatus(step);
  if (interview) return interview.label;
  const variant = staffStepVariantForLibraryId(step.stepType);
  if (!isDecisionVariant(variant)) {
    // Staff reject stores `failed`, which maps to `blocked`.
    return step.displayStatus === "blocked" ? "Rejected" : displayStatusLabel(step.displayStatus);
  }
  if (step.displayStatus === "skipped" || step.displayStatus === "not_applicable") {
    return displayStatusLabel(step.displayStatus);
  }
  return decisionLabel(variant, decisionForDisplayStatus(step.displayStatus));
}

export function isCompleteDisplayStatus(status: WorkflowStepDisplayStatus | OnboardingStepStatus): boolean {
  return (
    status === "completed" ||
    status === "approved" ||
    status === "submitted" ||
    status === "skipped" ||
    status === "not_applicable"
  );
}

export function resolveAssignmentSource(params: {
  workflowId?: string | null;
  mappedWorkflowIds?: Iterable<string>;
}): WorkflowAssignmentSource {
  const workflowId = asText(params.workflowId);
  if (!workflowId) return "unknown";
  const mapped = new Set(
    Array.from(params.mappedWorkflowIds ?? [])
      .map((id) => asText(id))
      .filter((id): id is string => Boolean(id))
  );
  if (mapped.has(workflowId)) return "job_mapping";
  return "manual";
}

export function assignmentSourceLabel(source: WorkflowAssignmentSource): string {
  if (source === "job_mapping") return "Job mapping";
  if (source === "manual") return "Manual assignment";
  return "Unknown";
}

function tenantWorkflowNodeId(step: TenantOnboardingStep): string | null {
  return asText(step.metadata?.workflow_node_id);
}

function tenantWorkflowStepId(step: TenantOnboardingStep): string | null {
  return asText(step.metadata?.workflow_step_id);
}

/**
 * Link a snapshot step to a published tenant step without guessing by title.
 * Order: explicit settings id → workflow_node_id → step-{key} → unique library id + phase → unique type + phase.
 *
 * Exact links also consider disabled tenant steps: job workflows keep writing progress to steps
 * that a later publish of a different flow disabled. Heuristic fallbacks stay on enabled steps,
 * except a disabled step with the same library id that the candidate has progress on.
 */
export function matchTenantStepForAssignedRecord(
  record: AssignedStepRecordInput,
  tenantSteps: TenantOnboardingStep[],
  usedIds: Set<string>,
  hasProgress?: (tenantStepId: string) => boolean
): TenantOnboardingStep | null {
  const unused = tenantSteps.filter((step) => !usedIds.has(step.id));
  const available = unused.filter((step) => step.is_enabled !== false);
  const exactCandidates = [...available, ...unused.filter((step) => step.is_enabled === false)];
  const settings = record.settings && typeof record.settings === "object" ? record.settings : {};
  const explicitId = asText(settings.onboarding_step_id);
  if (explicitId) {
    const found = exactCandidates.find((step) => step.id === explicitId);
    if (found) return found;
  }

  const snapshotId = asText(record.snapshot_step_id);
  if (snapshotId) {
    const byNode = exactCandidates.find((step) => tenantWorkflowNodeId(step) === snapshotId);
    if (byNode) return byNode;

    const key = snapshotStepKey(snapshotId);
    const byKey = exactCandidates.find((step) => step.step_key === key);
    if (byKey) return byKey;
  }

  const libraryId = asText(record.step_type);
  const phase = parseAssignedStepPhase(record);
  if (libraryId) {
    if (hasProgress) {
      const withProgress = exactCandidates.filter(
        (step) => tenantWorkflowStepId(step) === libraryId && hasProgress(step.id)
      );
      const enabledWithProgress = withProgress.filter((step) => step.is_enabled !== false);
      if (enabledWithProgress.length === 1) return enabledWithProgress[0];
      if (!enabledWithProgress.length && withProgress.length) {
        return [...withProgress].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
      }
    }
    const byLibrary = available.filter((step) => tenantWorkflowStepId(step) === libraryId);
    if (byLibrary.length === 1) return byLibrary[0];
    const byLibraryPhase = byLibrary.filter((step) => readStepLifecyclePhase(step) === phase);
    if (byLibraryPhase.length === 1) return byLibraryPhase[0];
    if (byLibraryPhase.length > 1 && isParameterizedJobApplicationStepType(libraryId)) {
      return [...byLibraryPhase].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
    }
  }

  const onboardingType = workflowStepIdToOnboardingType(libraryId ?? "");
  const byTypePhase = available.filter((step) => {
    if (step.step_type !== onboardingType || readStepLifecyclePhase(step) !== phase) return false;
    const stepLibraryId = tenantWorkflowStepId(step);
    return !libraryId || !stepLibraryId || stepLibraryId === libraryId;
  });
  if (byTypePhase.length === 1) return byTypePhase[0];
  return null;
}

const STEP_STATUSES: readonly OnboardingStepStatus[] = [
  "pending",
  "in_progress",
  "completed",
  "skipped",
  "failed",
];

function normalizeStepStatus(value: unknown): OnboardingStepStatus {
  const status = asText(value) as OnboardingStepStatus | null;
  return status && STEP_STATUSES.includes(status) ? status : "pending";
}

function timeOf(value: string | null | undefined): number {
  const ms = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(ms) ? ms : Number.NaN;
}

export function isStaffOwnedAssignedRecord(
  record: Pick<AssignedStepRecordInput, "settings"> & { step_type?: string | null }
): boolean {
  if (isInternalLibraryStepId(record.step_type)) return true;
  return !isApplicantCompletionOwner(asText(record.settings?.completionOwner));
}

/** Same split as staff step eligibility: worker-visible tenant steps, or unlinked records the applicant owns. */
export function isCandidateOwnedAssignedStep(
  record: Pick<AssignedStepRecordInput, "settings" | "step_type">,
  tenantStep: TenantOnboardingStep | null
): boolean {
  if (tenantStep) return isWorkerVisibleStep(tenantStep);
  if (isParameterizedJobApplicationStepType(record.step_type)) return false;
  return !isStaffOwnedAssignedRecord(record);
}

/**
 * Authorization and background-check signing refresh `completed_at` after the candidate
 * has already submitted (Firma status, a second save of the same signature). That refresh
 * is not a new submission, so a recruiter verification on these steps stays Completed.
 */
export function recruiterVerificationStaysAfterRefresh(step: {
  snapshotStepId?: string | null;
  stepKey?: string | null;
  stepType?: string | null;
  title?: string | null;
}): boolean {
  const hay = [step.snapshotStepId, step.stepKey, step.stepType]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .join(" ");
  if (
    hay.includes("background-check") ||
    hay.includes("background_check") ||
    hay.includes("employee-agreement") ||
    hay.includes("agreement-esign") ||
    hay.includes("agreement_signature") ||
    hay.includes("authorization")
  ) {
    return true;
  }
  const title = String(step.title ?? "").trim().toLowerCase();
  return (
    title.includes("auth release") ||
    title.includes("authorization") ||
    title.includes("agreement e")
  );
}

/** A recruiter's Mark as complete on a candidate step holds until the candidate submits it again. */
export function candidateStepVerifiedAt(
  record: Pick<
    AssignedStepRecordInput,
    "review_decision" | "status_changed_at" | "snapshot_step_id" | "step_type" | "title"
  >,
  progress: Pick<ProgressRowInput, "completed_at"> | undefined
): string | null {
  if (asText(record.review_decision) !== "complete") return null;
  const verifiedAt = timeOf(record.status_changed_at);
  if (Number.isNaN(verifiedAt)) return null;
  const submittedAt = timeOf(progress?.completed_at);
  if (
    !recruiterVerificationStaysAfterRefresh({
      snapshotStepId: record.snapshot_step_id,
      stepType: record.step_type,
      title: record.title,
    }) &&
    !Number.isNaN(submittedAt) &&
    submittedAt > verifiedAt
  ) {
    return null;
  }
  return record.status_changed_at ?? null;
}

/**
 * A staff decision mirrored onto a progress row for a different step record (the candidate
 * engine can gate an internal step on a progress row the Hire Journey links to another step).
 */
function progressDecidedForOtherRecord(recordId: string, progress: ProgressRowInput | undefined): boolean {
  const review = progress?.data?.staff_review;
  if (!review || typeof review !== "object" || Array.isArray(review)) return false;
  const owner = asText((review as Record<string, unknown>).step_record_id);
  return Boolean(owner) && owner !== recordId;
}

/**
 * Candidate steps follow the linked progress row (that is where submissions land). Staff-owned
 * steps keep their decision on the step record, because the progress row is keyed by the tenant's
 * published step and is replaced when the workflow is re-published. A non-pending progress row
 * only wins for a staff step when it changed after the last staff decision (e.g. an automated
 * check completed it).
 */
export function resolveAssignedStepStatus(
  record: AssignedStepRecordInput,
  progress: ProgressRowInput | undefined
): { status: OnboardingStepStatus; completedAt: string | null } {
  const fromProgress = {
    status: normalizeStepStatus(progress?.status),
    completedAt: progress?.completed_at ?? record.completed_at ?? null,
  };
  const fromRecord = {
    status: normalizeStepStatus(record.status),
    completedAt: record.completed_at ?? null,
  };
  if (!isStaffOwnedAssignedRecord(record)) {
    if (progressDecidedForOtherRecord(record.id, progress)) return fromRecord;
    return asText(progress?.status) ? fromProgress : fromRecord;
  }
  if (!progress || fromProgress.status === "pending") return fromRecord;
  const decidedAt = timeOf(record.status_changed_at);
  if (Number.isNaN(decidedAt)) return fromProgress;
  const progressAt = timeOf(progress.updated_at ?? progress.completed_at);
  return !Number.isNaN(progressAt) && progressAt > decidedAt ? fromProgress : fromRecord;
}

export function mapAssignedStepRecords(params: {
  records: AssignedStepRecordInput[];
  tenantSteps: TenantOnboardingStep[];
  progressByStepId: Map<string, ProgressRowInput>;
  assignedAt?: string | null;
  applicationId?: string | null;
}): MappedAssignedStep[] {
  const usedIds = new Set<string>();
  return params.records.map((record) => {
    let matched = matchTenantStepForAssignedRecord(record, params.tenantSteps, usedIds, (id) =>
      params.progressByStepId.has(id)
    );
    let progress = matched ? params.progressByStepId.get(matched.id) : undefined;

    if (!progress && isParameterizedJobApplicationStepType(record.step_type)) {
      const linked = findParameterizedJobApplicationProgress(
        params.progressByStepId,
        params.applicationId
      );
      if (linked) {
        progress = linked.progress;
        if (!matched && linked.tenantStepId) {
          const fromProgress = params.tenantSteps.find((step) => step.id === linked.tenantStepId);
          if (
            fromProgress &&
            !usedIds.has(fromProgress.id) &&
            (isParameterizedJobApplicationStepType(tenantWorkflowStepId(fromProgress) ?? fromProgress.step_type) ||
              fromProgress.step_key === "parameterized_job_application")
          ) {
            matched = fromProgress;
            usedIds.add(fromProgress.id);
          }
        }
      }
    }

    const postHireKind = postHireScreenKindForStepId(record.step_type);
    if (postHireKind) {
      const currentSub = progress ? readPostHireSubmission(progress.data) : null;
      if (!currentSub || currentSub.kind !== postHireKind) {
        for (const [stepId, pRow] of params.progressByStepId) {
          const sub = readPostHireSubmission(pRow.data);
          if (sub?.kind === postHireKind) {
            progress = pRow;
            const fromP = params.tenantSteps.find((s) => s.id === stepId);
            if (fromP && (!matched || matched.id !== fromP.id)) {
              if (matched) usedIds.delete(matched.id);
              matched = fromP;
              usedIds.add(fromP.id);
            }
            break;
          }
        }
      }
    }

    if (matched && !usedIds.has(matched.id)) usedIds.add(matched.id);
    const resolved = resolveAssignedStepStatus(record, progress);
    const normalizedStatus = resolved.status;
    const hasLinkedPostHire = Boolean(progress && readPostHireSubmission(progress.data));
    const hasLinkedProgress = Boolean(
      hasLinkedPostHire ||
      (progress && isJobScreeningProgressData(
        progress.data && typeof progress.data === "object" && !Array.isArray(progress.data)
          ? (progress.data as Record<string, unknown>)
          : null
      ))
    );
    const unmatched = !matched && !hasLinkedProgress;
    const settings =
      record.settings && typeof record.settings === "object" && !Array.isArray(record.settings)
        ? record.settings
        : null;
    const tenantStepId = matched?.id ?? (hasLinkedProgress ? asText(progress?.onboarding_step_id) : null);
    const ownerStep =
      matched ?? (tenantStepId ? params.tenantSteps.find((step) => step.id === tenantStepId) ?? null : null);
    const candidateOwned = isCandidateOwnedAssignedStep(record, ownerStep);
    const verifiedAt = candidateOwned ? candidateStepVerifiedAt(record, progress) : null;
    return {
      id: record.id,
      snapshotStepId: record.snapshot_step_id,
      tenantStepId,
      title: record.title,
      stepKey: matched?.step_key ?? snapshotStepKey(record.snapshot_step_id),
      stepType: record.step_type,
      onboardingType: matched?.step_type ?? workflowStepIdToOnboardingType(record.step_type),
      phase: parseAssignedStepPhase(record),
      required: record.is_required !== false && !isAlwaysOptionalStep({ stepType: record.step_type }),
      status: normalizedStatus,
      displayStatus: candidateReviewDisplayStatus({
        status: normalizedStatus,
        displayStatus: mapProgressToDisplayStatus(normalizedStatus),
        candidateOwned,
        verifiedAt,
        snapshotStepId: record.snapshot_step_id,
        stepKey: matched?.step_key ?? snapshotStepKey(record.snapshot_step_id),
        stepType: record.step_type,
        onboardingType: matched?.step_type ?? workflowStepIdToOnboardingType(record.step_type),
        title: record.title,
      }),
      inspectable: true,
      unmatched,
      // Staff-owned unmatched steps are reviewed on the record itself, so only candidate steps lose data.
      detail:
        unmatched && !isStaffOwnedAssignedRecord(record)
          ? "This step could not be linked to a stored submission record."
          : undefined,
      assignedAt: params.assignedAt ?? record.created_at ?? null,
      completedAt: resolved.completedAt,
      settings,
      reviewDecision: record.review_decision ?? null,
      reviewNote: record.review_note ?? null,
      candidateOwned,
      verifiedAt,
      verifiedByName: verifiedAt ? record.status_changed_by_name ?? null : null,
    };
  });
}

export function buildPhaseAssignment(params: {
  workflowName: string | null;
  version: string | null;
  assignedAt: string | null;
  assignmentSource: WorkflowAssignmentSource;
  phase: EmploymentLifecyclePhase;
  steps: Array<{ title: string; status: OnboardingStepStatus; displayStatus?: WorkflowStepDisplayStatus }>;
}): CandidateWorkflowAssignmentView {
  const current =
    params.steps.find((step) => step.status === "in_progress") ??
    params.steps.find((step) => step.status === "pending" || step.status === "failed") ??
    null;
  const complete = params.steps.filter((step) =>
    isCompleteDisplayStatus(step.displayStatus ?? step.status)
  ).length;
  return {
    workflowName: params.workflowName?.trim() || "Workflow",
    phase: params.phase,
    version: params.version,
    assignedAt: params.assignedAt,
    assignmentSource: params.assignmentSource,
    currentStepTitle: current?.title ?? null,
    completedCount: complete,
    totalCount: params.steps.length,
  };
}

export function countsFromAssignedSteps(
  steps: Array<{ status: OnboardingStepStatus; displayStatus?: WorkflowStepDisplayStatus }>,
  phase: EmploymentLifecyclePhase
): PhaseProgressCounts {
  return countsForPhase(
    steps.length,
    steps.filter((step) => isCompleteDisplayStatus(step.displayStatus ?? step.status)).length,
    phase
  );
}

export function sanitizeTagsForClient<T extends { phase: EmploymentLifecyclePhase | "both" }>(
  tags: T[],
  postHireVisible: boolean
): T[] {
  if (postHireVisible) return tags;
  return tags
    .filter((tag) => tag.phase !== "post_hire")
    .map((tag) => (tag.phase === "both" ? { ...tag, phase: "pre_hire" as const } : tag));
}

export const POST_HIRE_NOT_AVAILABLE_CODE = "POST_HIRE_NOT_AVAILABLE";
export const POST_HIRE_NOT_AVAILABLE_MESSAGE =
  "Post-Hire is not available until this candidate is converted to a worker.";
export const POST_HIRE_UNASSIGNED_MESSAGE =
  "No Post-Hire workflow has been assigned to this worker.";
export const PRE_HIRE_UNASSIGNED_MESSAGE = "No Pre-Hire workflow is assigned to this applicant.";
export const STEP_COMPLETED_WITHOUT_DOCUMENT_MESSAGE =
  "Completed through candidate confirmation. No document was required.";
export const ASSESSMENT_COMPLETED_WITHOUT_ANSWERS_MESSAGE =
  "This step is marked complete, but no skill assessment answers were saved for this candidate. Reopen the step so the candidate can retake the assessment.";
export const LEGACY_UNMATCHED_STEP_MESSAGE =
  "This step could not be linked to a stored submission record.";

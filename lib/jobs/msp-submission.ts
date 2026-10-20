import type { AppRole } from "@/lib/auth/app-role";
import { isStaffRole } from "@/lib/auth/app-role";
import { INDUSTRY_TO_AI_PACK } from "@/lib/ai-catalog/industry-catalog";

/**
 * MSP submission is recorded inside BrassHR.
 * No inbound MSP/client feed is connected, so an external response must not move a stage.
 */
export const MSP_EXTERNAL_RESPONSE_INTEGRATION_CONNECTED = false;

export function externalMspResponseMayAdvanceStage(): boolean {
  return MSP_EXTERNAL_RESPONSE_INTEGRATION_CONNECTED;
}

export const MSP_PACKET_VARIANTS = [
  "w2",
  "1099",
  "recruit_and_release",
  "msp_eor",
  "healthcare",
  "non_healthcare",
] as const;

export type MspPacketVariant = (typeof MSP_PACKET_VARIANTS)[number];

export const MSP_PACKET_VARIANT_LABELS: Record<MspPacketVariant, string> = {
  w2: "W2",
  "1099": "1099",
  recruit_and_release: "Recruit & Release",
  msp_eor: "MSP EOR",
  healthcare: "Healthcare",
  non_healthcare: "Non-healthcare",
};

export const SUBMITTED_TO_MSP_STATUS_NAME = "Submitted to MSP";
export const SUBMITTED_FOR_MSP_REVIEW_STATUS_NAME = "Submitted for MSP Review";

const SUBMISSION_STATUS_NAMES = new Set([
  "submitted to msp",
  "submitted for msp review",
]);

const MSP_ONLY_STATUS_NAMES = new Set([
  ...SUBMISSION_STATUS_NAMES,
  "at msp",
  "at msp submission",
  "presented to client",
  "client interview",
  "approved by msp",
  "rejected by msp",
  "rejected by client",
]);

const INTERNAL_ONLY_STATUS_NAMES = new Set([
  "internal select",
  "selected",
  "final approval",
]);

const COMPLETE_STEP_STATUSES = new Set([
  "completed",
  "complete",
  "skipped",
  "approved",
  "not_applicable",
  "n/a",
]);

const PRESENT_DOCUMENT_STATUSES = new Set(["uploaded", "under_review", "approved", "verified"]);

const PROFILE_FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  phone: "Phone",
};

const APPLICATION_STAGE_PATCH_KEYS = new Set([
  "status",
  "status_id",
  "statusId",
  "workflow_phase",
  "workflowPhase",
]);

export type StageAudience = "shared" | "msp" | "internal";
export type JobSourceKind = "msp" | "internal" | "unknown";

export type MspWorkflowStep = {
  id: string;
  stepKey: string;
  title: string;
  required: boolean;
  status: string;
  position: number;
  settings?: Record<string, unknown> | null;
};

export type MspProfileDetails = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  resumeOnFile: boolean;
};

export type MspDocumentEvidence = {
  id: string;
  label: string;
  stepKey: string | null;
  status: string;
};

export type MspSubmissionJob = {
  id: string;
  sourceType: string | null;
  placementType: string | null;
  employmentType: string | null;
  eorType: string | null;
  industryKey: string | null;
  externalRequisitionId: string | null;
};

export type MspSubmissionContext = {
  tenantId: string;
  applicationId: string;
  workerId: string | null;
  currentStatusName: string | null;
  currentStatusKey: string | null;
  job: MspSubmissionJob;
  profile: MspProfileDetails;
  documents: MspDocumentEvidence[];
  steps: MspWorkflowStep[];
};

export type MspReadinessCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type MspSubmissionBlocker = {
  code: string;
  message: string;
};

export type MspSubmissionRecord = {
  id: string;
  tenantId: string;
  jobApplicationId: string;
  jobRequisitionId: string;
  workerId: string | null;
  submittedByUserId: string | null;
  submittedAt: string;
  status: "submitted";
  mspReference: string | null;
  notes: string | null;
  packetVariants: MspPacketVariant[];
  readinessSnapshot: MspReadinessCheck[];
};

export type MspSubmissionDecision = {
  applicable: boolean;
  sourceKind: JobSourceKind;
  packetVariants: MspPacketVariant[];
  checks: MspReadinessCheck[];
  blockers: MspSubmissionBlocker[];
  ready: boolean;
  alreadySubmitted: boolean;
  rejected: boolean;
  /** Set only when this submit may move the application, and only to the submission stage. */
  nextStatusName: typeof SUBMITTED_TO_MSP_STATUS_NAME | null;
  submitStepId: string | null;
  externalResponseAdvancesStage: false;
};

export type StatusOptionLike = {
  id: string;
  name: string;
  systemKey?: string | null;
};

export function normalizeStatusName(name: string | null | undefined): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function jobSourceKind(sourceType: string | null | undefined): JobSourceKind {
  const raw = String(sourceType ?? "").trim().toLowerCase();
  if (raw === "msp") return "msp";
  if (raw === "internal") return "internal";
  return "unknown";
}

export function isMspSubmissionStatusName(name: string | null | undefined): boolean {
  return SUBMISSION_STATUS_NAMES.has(normalizeStatusName(name));
}

export function applicationStageAudience(
  name: string | null | undefined,
  _systemKey?: string | null
): StageAudience {
  const normalized = normalizeStatusName(name);
  if (!normalized) return "shared";
  if (MSP_ONLY_STATUS_NAMES.has(normalized)) return "msp";
  if (normalized.includes("submitted to msp") || normalized.includes("submitted for msp")) {
    return "msp";
  }
  if (INTERNAL_ONLY_STATUS_NAMES.has(normalized)) return "internal";
  return "shared";
}

export function filterApplicationStatusesForSource<T extends StatusOptionLike>(
  statuses: T[],
  sourceType: string | null | undefined,
  currentStatusId?: string | null
): T[] {
  const source = jobSourceKind(sourceType);
  if (source === "unknown") return statuses;
  return statuses.filter((status) => {
    if (currentStatusId && status.id === currentStatusId) return true;
    const audience = applicationStageAudience(status.name, status.systemKey);
    if (source === "msp") return audience !== "internal";
    return audience !== "msp";
  });
}

export function planApplicationStatusChange(input: {
  sourceType: string | null;
  targetName: string;
  targetSystemKey?: string | null;
  currentStatusId: string | null;
  targetStatusId: string;
  hasMspSubmission: boolean;
  /** Status group is assigned to the Pre-Hire stage or AI step the recruiter is on. */
  assignedToStage?: boolean;
}):
  | { ok: true }
  | { ok: false; status: number; code: "VALIDATION" | "CONFLICT"; message: string } {
  if (input.currentStatusId && input.currentStatusId === input.targetStatusId) {
    return { ok: true };
  }

  // Stage menus follow Settings group attachments. Job source still applies
  // when the change is not tied to one of those stages.
  if (!input.assignedToStage) {
    const audience = applicationStageAudience(input.targetName, input.targetSystemKey);
    const source = jobSourceKind(input.sourceType);
    if (source === "internal" && audience === "msp") {
      return {
        ok: false,
        status: 400,
        code: "VALIDATION",
        message: `${input.targetName} is an MSP stage and is hidden on Internal requisitions.`,
      };
    }
    if (source === "msp" && audience === "internal") {
      return {
        ok: false,
        status: 400,
        code: "VALIDATION",
        message: `${input.targetName} is an Internal stage and is hidden on MSP requisitions.`,
      };
    }
  }
  if (isMspSubmissionStatusName(input.targetName) && !input.hasMspSubmission) {
    return {
      ok: false,
      status: 409,
      code: "CONFLICT",
      message:
        "Use Submit to MSP to record the submission. Changing the stage alone does not store the packet, recruiter, or timestamp.",
    };
  }
  return { ok: true };
}

export function canSubmitCandidateToMsp(role: AppRole | null | undefined, godAdmin = false): boolean {
  if (godAdmin) return true;
  if (!role) return false;
  return isStaffRole(role);
}

export function profilePatchChangesApplicationStage(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).some((key) => APPLICATION_STAGE_PATCH_KEYS.has(key));
}

export function resolveMspPacketVariants(job: MspSubmissionJob): MspPacketVariant[] {
  const variants: MspPacketVariant[] = [];
  const employment = String(job.employmentType ?? "").trim().toLowerCase();
  const placement = String(job.placementType ?? "").trim().toLowerCase();
  const eor = String(job.eorType ?? "").trim().toLowerCase();
  const industry = String(job.industryKey ?? "").trim().toLowerCase();

  if (employment === "w2") variants.push("w2");
  if (employment === "1099") variants.push("1099");
  if (
    placement === "recruit_and_release" ||
    placement === "recruit & release" ||
    employment === "rnr"
  ) {
    variants.push("recruit_and_release");
  }
  if (eor === "msp") variants.push("msp_eor");

  if (industry) {
    const pack = INDUSTRY_TO_AI_PACK[industry as keyof typeof INDUSTRY_TO_AI_PACK];
    variants.push(pack === "healthcare" ? "healthcare" : "non_healthcare");
  }

  return variants;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function parsePacketVariants(value: unknown): MspPacketVariant[] | null {
  const raw = asStringList(value).map((item) => item.toLowerCase().replace(/[\s-]+/g, "_"));
  const known = raw.filter((item): item is MspPacketVariant =>
    (MSP_PACKET_VARIANTS as readonly string[]).includes(item)
  );
  return known.length ? known : null;
}

export function isSubmitToMspStep(step: Pick<MspWorkflowStep, "stepKey" | "title" | "settings">): boolean {
  const key = String(step.stepKey ?? "").trim().toLowerCase();
  if (key === "submit-to-msp" || key === "submit_to_msp") return true;
  const title = normalizeStatusName(step.title);
  if (title === "submit to msp") return true;
  const settings = step.settings ?? {};
  const task = String(settings.taskKey ?? settings.mspTask ?? "").trim().toLowerCase();
  return task === "submit-to-msp" || task === "submit_to_msp";
}

function stepAppliesToVariants(step: MspWorkflowStep, variants: MspPacketVariant[]): boolean {
  const tagged = parsePacketVariants(step.settings?.packetVariants);
  if (!tagged) return true;
  return tagged.some((variant) => variants.includes(variant));
}

function isStepComplete(status: string | null | undefined): boolean {
  return COMPLETE_STEP_STATUSES.has(String(status ?? "").trim().toLowerCase());
}

function isRejectionContext(context: MspSubmissionContext): boolean {
  const key = String(context.currentStatusKey ?? "").trim().toLowerCase();
  if (key === "rejected" || key === "withdrawn" || key === "archived") return true;
  const name = normalizeStatusName(context.currentStatusName);
  if (!name) return false;
  if (name === "position closed" || name === "candidate withdrew") return true;
  return name === "not a fit" || name.startsWith("rejected");
}

function profileValue(profile: MspProfileDetails, field: string): string {
  if (field === "firstName") return profile.firstName?.trim() ?? "";
  if (field === "lastName") return profile.lastName?.trim() ?? "";
  if (field === "email") return profile.email?.trim() ?? "";
  if (field === "phone") return profile.phone?.trim() ?? "";
  return "";
}

function defaultProfileFields(step: MspWorkflowStep): string[] {
  const configured = asStringList(step.settings?.requiredProfileFields);
  if (configured.length) return configured;
  const key = step.stepKey.trim().toLowerCase();
  if (key === "resume-basic-profile" || key === "parameterized-job-application") {
    return ["firstName", "lastName", "email"];
  }
  return [];
}

function documentLabelsForStep(step: MspWorkflowStep): string[] {
  const configured = asStringList(step.settings?.requiredDocuments);
  if (configured.length) return configured;
  const key = step.stepKey.trim().toLowerCase();
  if (key === "document-upload" || key === "credential-license-verification" || key === "ssn-identity-verification") {
    return [step.title.trim() || "Required document"];
  }
  return [];
}

function documentMatchesLabel(document: MspDocumentEvidence, label: string, step: MspWorkflowStep): boolean {
  const wanted = label.trim().toLowerCase();
  const docLabel = document.label.trim().toLowerCase();
  const stepKey = step.stepKey.trim().toLowerCase();
  if (document.stepKey && document.stepKey.trim().toLowerCase() === stepKey) return true;
  if (!wanted) return false;
  return docLabel === wanted || docLabel.includes(wanted) || wanted.includes(docLabel);
}

function documentIsPresent(status: string): boolean {
  return PRESENT_DOCUMENT_STATUSES.has(status.trim().toLowerCase());
}

function pushCheck(
  checks: MspReadinessCheck[],
  blockers: MspSubmissionBlocker[],
  check: MspReadinessCheck,
  code: string
) {
  checks.push(check);
  if (!check.ok) blockers.push({ code, message: check.detail });
}

export function evaluateMspSubmission(
  context: MspSubmissionContext,
  existing: MspSubmissionRecord | null
): MspSubmissionDecision {
  const sourceKind = jobSourceKind(context.job.sourceType);
  const packetVariants = sourceKind === "msp" ? resolveMspPacketVariants(context.job) : [];
  const checks: MspReadinessCheck[] = [];
  const blockers: MspSubmissionBlocker[] = [];
  const rejected = isRejectionContext(context);
  const alreadySubmitted = Boolean(existing && existing.status === "submitted");

  if (sourceKind !== "msp") {
    blockers.push({
      code: "NOT_MSP_JOB",
      message: "MSP submission is only available on MSP requisitions.",
    });
    return {
      applicable: false,
      sourceKind,
      packetVariants,
      checks,
      blockers,
      ready: false,
      alreadySubmitted,
      rejected,
      nextStatusName: null,
      submitStepId: null,
      externalResponseAdvancesStage: false,
    };
  }

  const ordered = [...context.steps].sort(
    (a, b) => a.position - b.position || a.title.localeCompare(b.title)
  );
  const submitStep = ordered.find(
    (step) => isSubmitToMspStep(step) && stepAppliesToVariants(step, packetVariants)
  );

  pushCheck(
    checks,
    blockers,
    submitStep
      ? {
          id: "submit-task",
          label: "Submit to MSP task",
          ok: submitStep.required,
          detail: submitStep.required
            ? `${submitStep.title} is a required task on this workflow.`
            : "Submit to MSP is on this workflow but is not marked required.",
        }
      : {
          id: "submit-task",
          label: "Submit to MSP task",
          ok: false,
          detail:
            "This workflow does not include a required Submit to MSP task. Add it in the workflow configurator for this packet.",
        },
    "SUBMIT_TASK"
  );

  const submitPosition = submitStep?.position ?? Number.POSITIVE_INFINITY;
  const predecessors = submitStep
    ? ordered.filter(
        (step) =>
          step.id !== submitStep.id &&
          step.position < submitPosition &&
          step.required &&
          stepAppliesToVariants(step, packetVariants)
      )
    : [];
  const seenProfileFields = new Set<string>();
  const seenDocuments = new Set<string>();

  for (const step of predecessors) {
    const complete = isStepComplete(step.status);
    pushCheck(
      checks,
      blockers,
      {
        id: `step:${step.id}`,
        label: step.title,
        ok: complete,
        detail: complete
          ? `${step.title} is complete.`
          : `${step.title} is required before MSP submission and is still ${step.status || "not started"}.`,
      },
      "WORKFLOW_STEP"
    );

    for (const field of defaultProfileFields(step)) {
      if (field === "resume") continue;
      if (seenProfileFields.has(field)) continue;
      seenProfileFields.add(field);
      const value = profileValue(context.profile, field);
      const label = PROFILE_FIELD_LABELS[field] ?? field;
      pushCheck(
        checks,
        blockers,
        {
          id: `profile:${step.id}:${field}`,
          label,
          ok: Boolean(value),
          detail: value
            ? `${label} is on the profile.`
            : `${label} is required for ${step.title} and is missing.`,
        },
        "PROFILE"
      );
    }

    const needsResume =
      step.stepKey.trim().toLowerCase() === "resume-basic-profile" ||
      asStringList(step.settings?.requiredProfileFields).includes("resume");
    if (needsResume) {
      pushCheck(
        checks,
        blockers,
        {
          id: `profile:${step.id}:resume`,
          label: "Resume",
          ok: context.profile.resumeOnFile,
          detail: context.profile.resumeOnFile
            ? "A resume is on file."
            : `A resume is required for ${step.title} and is not on file.`,
        },
        "PROFILE"
      );
    }

    for (const label of documentLabelsForStep(step)) {
      const documentKey = label.trim().toLowerCase();
      if (seenDocuments.has(documentKey)) continue;
      seenDocuments.add(documentKey);
      const matches = context.documents.filter((document) =>
        documentMatchesLabel(document, label, step)
      );
      const present = matches.some((document) => documentIsPresent(document.status));
      const rejectedDoc = matches.find(
        (document) => document.status.trim().toLowerCase() === "rejected"
      );
      let detail: string;
      if (present) {
        detail = `${label} is on file.`;
      } else if (rejectedDoc) {
        detail = `${label} was rejected and must be replaced before MSP submission.`;
      } else {
        detail = `${label} is required for this packet and is missing.`;
      }
      pushCheck(
        checks,
        blockers,
        {
          id: `document:${step.id}:${label.toLowerCase()}`,
          label,
          ok: present,
          detail,
        },
        "DOCUMENT"
      );
    }
  }

  if (rejected) {
    blockers.push({
      code: "REJECTED",
      message: `This candidate is ${context.currentStatusName || "on a closed path"}. MSP submission stays separate from rejection and will not move the stage.`,
    });
  }

  if (alreadySubmitted) {
    blockers.push({
      code: "ALREADY_SUBMITTED",
      message: "This candidate was already submitted to the MSP for this requisition.",
    });
  }

  const ready = blockers.length === 0 && Boolean(submitStep?.required);
  return {
    applicable: true,
    sourceKind,
    packetVariants,
    checks,
    blockers,
    ready,
    alreadySubmitted,
    rejected,
    nextStatusName: ready ? SUBMITTED_TO_MSP_STATUS_NAME : null,
    submitStepId: submitStep?.id ?? null,
    externalResponseAdvancesStage: false,
  };
}

export function buildMspSubmissionRecord(input: {
  id: string;
  context: MspSubmissionContext;
  decision: MspSubmissionDecision;
  submittedByUserId: string;
  submittedAt: string;
  mspReference: string | null;
  notes: string | null;
}): MspSubmissionRecord {
  return {
    id: input.id,
    tenantId: input.context.tenantId,
    jobApplicationId: input.context.applicationId,
    jobRequisitionId: input.context.job.id,
    workerId: input.context.workerId,
    submittedByUserId: input.submittedByUserId,
    submittedAt: input.submittedAt,
    status: "submitted",
    mspReference: input.mspReference,
    notes: input.notes,
    packetVariants: input.decision.packetVariants,
    readinessSnapshot: input.decision.checks,
  };
}

export class MspSubmissionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 400,
    public readonly blockers: MspSubmissionBlocker[] = []
  ) {
    super(message);
    this.name = "MspSubmissionError";
  }
}

export async function commitReadyMspSubmission(args: {
  actorAllowed: boolean;
  context: MspSubmissionContext;
  existing: MspSubmissionRecord | null;
  actorUserId: string;
  notes: string | null;
  mspReference: string | null;
  submittedAt?: string;
  createId?: () => string;
  persist: (record: MspSubmissionRecord) => Promise<MspSubmissionRecord>;
  changeStatus: (statusName: typeof SUBMITTED_TO_MSP_STATUS_NAME) => Promise<void>;
  audit: (record: MspSubmissionRecord) => Promise<void>;
  markStepComplete?: (stepId: string) => Promise<void>;
}): Promise<{ submission: MspSubmissionRecord; decision: MspSubmissionDecision }> {
  if (!args.actorAllowed) {
    throw new MspSubmissionError("Staff role required to submit a candidate to the MSP", "FORBIDDEN", 403);
  }
  const decision = evaluateMspSubmission(args.context, args.existing);
  if (!decision.ready || decision.nextStatusName !== SUBMITTED_TO_MSP_STATUS_NAME) {
    const message = decision.blockers[0]?.message ?? "This candidate is not ready to submit to the MSP.";
    throw new MspSubmissionError(message, decision.blockers[0]?.code ?? "NOT_READY", 409, decision.blockers);
  }

  const submittedAt = args.submittedAt ?? new Date().toISOString();
  const draft = buildMspSubmissionRecord({
    id: args.createId?.() ?? "",
    context: args.context,
    decision,
    submittedByUserId: args.actorUserId,
    submittedAt,
    mspReference: args.mspReference,
    notes: args.notes,
  });
  const submission = await args.persist(draft);
  await args.audit(submission);
  try {
    await args.changeStatus(SUBMITTED_TO_MSP_STATUS_NAME);
  } catch (error) {
    console.error("[msp-submission] status update failed after record insert", error);
    throw new MspSubmissionError(
      "The MSP submission was saved, but the application stage could not be updated. Reload and confirm the stage.",
      "STATUS_UPDATE_FAILED",
      500
    );
  }
  if (decision.submitStepId && args.markStepComplete) {
    await args.markStepComplete(decision.submitStepId);
  }
  return { submission, decision };
}

export function cleanSubmissionText(
  value: unknown,
  field: "notes" | "mspReference"
): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new MspSubmissionError(`${field === "notes" ? "Notes" : "MSP reference"} must be text`, "VALIDATION");
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const limit = field === "notes" ? 4000 : 200;
  if (trimmed.length > limit) {
    throw new MspSubmissionError(
      field === "notes"
        ? "Notes must be 4000 characters or fewer"
        : "MSP reference must be 200 characters or fewer",
      "VALIDATION"
    );
  }
  return trimmed;
}

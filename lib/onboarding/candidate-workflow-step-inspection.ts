import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTenantOnboardingConfig } from "@/lib/onboarding/load-tenant-config";
import { canStaffAccessPostHireSteps } from "@/lib/onboarding/resolve-candidate-hire-gate";
import { ensureCandidateConvertedIfAgreementCompleted } from "@/lib/onboarding/auto-convert-after-agreement";
import {
  enrollmentDecisionLabel,
  enrollmentQuestionForStep,
  isEnrollmentDecisionStepType,
  readEnrollmentDecision,
  type EnrollmentDecision,
} from "@/lib/onboarding/enrollment-decision-step";
import { workflowStepIdToOnboardingType } from "@/lib/onboarding/workflow-step-mapping";
import { storedCheckboxQuestions } from "@/lib/onboarding/candidate-checkbox-steps";
import {
  postHireScreenKindForStepId,
  readPostHireSubmission,
} from "@/lib/onboarding/post-hire-step-screens";
import type { OnboardingStepStatus } from "@/lib/onboarding/types";
import {
  ASSIGNED_STEP_RECORD_COLUMNS,
  ASSESSMENT_COMPLETED_WITHOUT_ANSWERS_MESSAGE,
  LEGACY_UNMATCHED_STEP_MESSAGE,
  POST_HIRE_NOT_AVAILABLE_CODE,
  POST_HIRE_NOT_AVAILABLE_MESSAGE,
  SSN_IDENTITY_STEP_TYPE,
  STEP_COMPLETED_WITHOUT_DOCUMENT_MESSAGE,
  candidateReviewDisplayStatus,
  displayStatusLabel,
  enrichAssignedStepsDisplayFromEvidence,
  hasRequiredIdentityDocuments,
  isCompleteDisplayStatus,
  mapProgressToDisplayStatus,
  parseAssignedStepPhase,
  type MappedAssignedStep,
} from "@/lib/onboarding/assigned-workflow-steps";
import {
  RECRUITER_SCREENING_STEP_TYPE,
  applicationQuickMatchRan,
  applyQuickMatchScreeningProgress,
} from "@/lib/onboarding/recruiter-screening-progress";
import {
  loadScopedStepProgress,
  resolveInstanceApplicationId,
} from "@/lib/onboarding/scoped-step-progress";
import { REPLACED_STEP_DATA_KEY } from "@/lib/onboarding/replaced-step-progress";
import {
  readRecordStaffReview,
  readStaffStepReview,
  type StaffStepActionEligibility,
  type StaffStepReview,
} from "@/lib/onboarding/staff-step-review-shared";
import {
  mapInstanceStepRecord,
  resolveStaffStepEligibility,
} from "@/lib/onboarding/staff-workflow-step-review";
import {
  IDENTITY_UPLOAD_SLOTS,
  buildStepDocumentUploads,
  identityDocumentId,
  loadIdentityDocumentRow,
  loadStepSubmittedDocuments,
  staffUploaderIdFromPath,
  stepUploadRequirements,
  type StepDocumentUploads,
} from "@/lib/onboarding/staff-step-documents";
import { filterResumesForApplication } from "@/lib/jobs/match-analysis/pick-resume-for-application";
import { classifyResumeUploaderRole } from "@/lib/resume/resume-upload-limit";
import { staffRoleLabel, type StaffConsoleRole } from "@/lib/admin/staff-directory-types";
import { staffDisplayName } from "@/lib/account/resolve-staff-users";
import { resolveStorageAccessibleUrl } from "@/lib/supabase/resolve-storage-accessible-url";
import {
  WORKER_REQUIRED_FILES_BUCKET,
  WORKER_RESUMES_BUCKET,
} from "@/lib/supabase-storage-buckets";
import type { EmploymentLifecyclePhase } from "@/lib/onboarding/workflow-phase-groups";
import {
  buildSkillAssessmentResults,
  type SkillAnswerRowInput,
  type SkillAssessmentResultsSummary,
  type SkillAssessmentRowInput,
  type SkillCategoryResult,
} from "@/lib/skill-assessment/admin-results";
import {
  loadTenantSkillAssessmentSettings,
  publishedCatalogForApplicants,
} from "@/lib/skill-assessment/load-settings";
import { createDefaultSkillAssessmentCatalog } from "@/lib/skill-assessment/defaults";
import { loadCandidateInterviews } from "@/lib/interviews/candidate-interview-history";
import { loadStepCheckResult, type StepCheckResult } from "@/lib/onboarding/step-check-results";
import { formatInterviewDate, formatInterviewTimeRange } from "@/lib/interviews/format";
import { isParameterizedJobApplicationStepType } from "@/lib/onboarding/job-application-parameters";
import {
  loadJobApplicationStepView,
  type JobApplicationStepView,
} from "@/lib/onboarding/job-application-step";
import { applyParameterizedJobApplicationStepEvidence } from "@/lib/onboarding/parameterized-job-application-progress";
import {
  isOfferAcceptanceStepType,
  loadOfferDetailsForApplication,
  readOfferDecision,
  type OfferDecision,
  type OfferDetails,
} from "@/lib/onboarding/offer-acceptance";
import {
  getFirmaRecruiterTemplateId,
  isFirmaAttachableWorkflowStepId,
  isFirmaSigningComplete,
} from "@/lib/onboarding/firma-step-settings";
import { tryGetFirmaSigningRequestDownload } from "@/lib/firma/client";
import { resolveTenantFirmaWorkspaceId } from "@/lib/firma/resolve-tenant-workspace";
import { isAgreementOrSignatureStep } from "@/lib/onboarding/is-agreement-step";
import { isAgreementEsignStep } from "@/lib/onboarding/lock-post-hire";
import {
  interviewStepStatus,
  isInterviewStep,
  summarizeInterviews,
  type CandidateInterview,
} from "@/lib/onboarding/interview-step";

export type WorkflowStepInspectionKind =
  | "resume"
  | "upload"
  | "form"
  | "assessment"
  | "references"
  | "agreement"
  | "background_check"
  | "final_review"
  | "job_application"
  | "offer"
  | "generic";

export type WorkflowStepInspectionError = {
  ok: false;
  status: number;
  code?: string;
  error: string;
};

export type InspectableDocument = {
  id: string;
  /** Requirement or slot the file was uploaded for, e.g. "Nursing License". */
  documentName: string | null;
  originalFileName: string | null;
  documentType: string | null;
  fileSize: number | null;
  uploadedAt: string | null;
  uploadedBy: string | null;
  verificationStatus: string | null;
  previewUrl: string | null;
  downloadUrl: string | null;
  fileUnavailable: boolean;
  approvedOrRejectedAt: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
};

export type CandidateStepReview = {
  verified: boolean;
  verifiedAt: string | null;
  verifiedBy: string | null;
  /** The candidate submitted the step and no recruiter has marked it complete yet. */
  canVerify: boolean;
  /** The candidate hasn't completed the step, so a recruiter can complete it on their behalf. */
  canComplete: boolean;
};

export const CANDIDATE_STEP_AWAITING_REVIEW_MESSAGE =
  "The candidate submitted this step. Review their submission below, then click Mark as complete to verify it.";

export type WorkflowStepInspection = {
  ok: true;
  kind: WorkflowStepInspectionKind;
  step: MappedAssignedStep;
  /** Job application the workflow instance belongs to, when it is tied to one. */
  applicationId: string | null;
  workflowName: string | null;
  workflowVersion: string | null;
  phase: EmploymentLifecyclePhase;
  assignedAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  approvedOrRejectedAt: string | null;
  completedBy: string | null;
  approvedOrRejectedBy: string | null;
  /** False for steps with no approve/reject review (e.g. résumé upload). */
  reviewable: boolean;
  notes: string | null;
  emptyState: string | null;
  /** Whether staff can complete / reject / reopen this step from the drawer. */
  staffAction: StaffStepActionEligibility;
  staffReview: StaffStepReview | null;
  /** Recruiter verification of a candidate step's submission. Null on recruiter steps. */
  candidateReview: CandidateStepReview | null;
  /** Compliance check / facility approval result for those step types. */
  checkResult: StepCheckResult | null;
  documents: InspectableDocument[];
  /** Upload fields on this step; staff can fill them for the candidate. Null when the step has none. */
  documentUploads: StepDocumentUploads | null;
  form: {
    questions: Array<{
      label: string;
      fieldType: string;
      answer: unknown;
      submittedAt: string | null;
      reviewResult: string | null;
    }>;
  } | null;
  assessment: {
    name: string;
    startedAt: string | null;
    completedAt: string | null;
    summary: SkillAssessmentResultsSummary;
    categories: SkillCategoryResult[];
  } | null;
  references: Array<{
    id: string;
    name: string;
    relationship: string | null;
    email: string | null;
    phone: string | null;
    verificationStatus: string | null;
    submittedAt: string | null;
    recruiterNotes: string | null;
  }>;
  agreement: {
    documentName: string;
    signatureStatus: string;
    sentAt: string | null;
    viewedAt: string | null;
    signedAt: string | null;
    signerIdentity: string | null;
    completedDocumentUrl: string | null;
    downloadUrl: string | null;
    signingRequestId: string | null;
    firmaStatus: string | null;
    canResync: boolean;
    isSigned: boolean;
    auditHistory: Array<{ status: string; at: string | null }>;
  } | null;
  authorization: {
    authorizationStatus: string | null;
    consentTimestamp: string | null;
    providerSafeStatus: string | null;
    reviewStatus: string | null;
  } | null;
  finalReview: {
    submittedAt: string | null;
    confirmation: string | null;
    missingRequirements: string[];
    stepsIncluded: string[];
    reviewer: string | null;
    decision: string | null;
    notes: string | null;
  } | null;
  /** Every interview booked with the candidate, oldest first. Null on non-interview steps. */
  interviews: CandidateInterview[] | null;
  /** Requisition parameters + screening answers. Null except on Parameterized Job Application. */
  jobApplication: JobApplicationStepView | null;
  /** Job offer + the candidate's Accept / Decline. Null except on Offer Acceptance. */
  offer: { details: OfferDetails | null; decision: OfferDecision | null } | null;
  /** Question + the candidate's Agree / Not ready. Null except on Benefits / 401(k) enrollment. */
  enrollment: {
    question: string;
    decision: EnrollmentDecision | null;
    decisionLabel: string | null;
    answeredAt: string | null;
  } | null;
};

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function isManualHrTask(stepType: string | null | undefined): boolean {
  return String(stepType ?? "").trim().toLowerCase() === "manual-task-hr-action";
}

export function inspectionKindForStep(params: {
  stepType: string;
  onboardingType: string;
  /** A Firma template is attached, so the candidate e-signs instead of uploading. */
  usesESign?: boolean;
}): WorkflowStepInspectionKind {
  const stepType = params.stepType.trim().toLowerCase();
  const onboardingType = params.onboardingType.trim().toLowerCase();
  if (isParameterizedJobApplicationStepType(stepType)) return "job_application";
  if (isOfferAcceptanceStepType(stepType)) return "offer";
  if (params.usesESign && stepType !== "background-check") return "agreement";
  if (onboardingType === "resume_upload" || stepType === "resume-basic-profile") return "resume";
  if (
    onboardingType === "professional_license" ||
    onboardingType === "document_upload" ||
    stepType === "credential-license-verification" ||
    stepType === "certification-upload" ||
    stepType === "document-upload"
  ) {
    return "upload";
  }
  if (onboardingType === "skill_assessment" || stepType === "skill-qualification-assessment") {
    return "assessment";
  }
  if (onboardingType === "references" || stepType.includes("reference")) return "references";
  if (
    onboardingType === "authorizations" ||
    stepType === "employee-agreement" ||
    stepType === "welcome-packet-esign" ||
    stepType === "policy-acknowledgment"
  ) {
    return "agreement";
  }
  if (stepType === "background-check") return "background_check";
  if (
    onboardingType === "review_submit" ||
    stepType === "completion-milestone" ||
    stepType === "hr-final-approval"
  ) {
    return "final_review";
  }
  if (onboardingType === "custom_question" || onboardingType === "profile_information") return "form";
  return "generic";
}

const CANDIDATE_SCREEN_BY_KIND: Partial<Record<WorkflowStepInspectionKind, string>> = {
  offer: "accepts or declines the offer on the Offer Acceptance screen",
  agreement: "reviews and e-signs it on the Authorizations & Documents screen",
  background_check: "signs the authorization on the Authorizations & Documents screen",
  upload: "uploads the documents on the document upload screen",
  references: "adds them on the References screen",
  assessment: "takes it on the Skill Assessment screen",
  resume: "uploads their resume on the Resume & Profile screen",
  form: "answers it on this step's screen",
};

/** Candidate-owned step with nothing submitted yet: who does it and where, since staff have no buttons. */
export function candidateWaitingMessage(
  kind: WorkflowStepInspectionKind,
  status: OnboardingStepStatus,
  screenTitle?: string | null
): string {
  const where = screenTitle
    ? `completes it on the ${screenTitle} screen`
    : CANDIDATE_SCREEN_BY_KIND[kind] ?? "completes it in the application portal";
  const progress =
    status === "in_progress"
      ? "The candidate has opened this step but hasn't finished it yet."
      : "Waiting for the candidate.";
  return `${progress} This is a candidate step: the candidate ${where} in their application portal once they reach it, and their response will appear here when they submit it. Use Send Email to remind them, or Mark as complete to complete it on their behalf.`;
}

/** Candidate upload step with nothing submitted yet: staff can also upload the files themselves. */
export function candidateUploadWaitingMessage(status: OnboardingStepStatus): string {
  const progress =
    status === "in_progress"
      ? "The candidate has opened this step but hasn't finished it yet."
      : "Waiting for the candidate.";
  return `${progress} The candidate can upload these documents in their application portal, or you can upload them below for the candidate (for example, files they sent you by email) and mark the step complete.`;
}

/** Filters post-hire direct deposit submission fields so recruiter view only sees the authorization confirmation checkbox. */
export function filterDirectDepositInspectionFields(
  fields: Array<{ label: string; value: string }>
): Array<{ label: string; value: string }> {
  const checkboxFields = fields.filter((field) =>
    /authoriz|consent|agreement|confirm|checkbox/i.test(field.label)
  );
  if (checkboxFields.length > 0) {
    return checkboxFields;
  }
  return [{ label: "Deposit authorization", value: "Authorized" }];
}

function signatureStatusLabel(raw: string | null): string {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "completed" || value === "signed") return "Signed";
  if (value === "viewed") return "Viewed";
  if (value === "sent" || value === "pending") return "Sent";
  if (value === "declined") return "Declined";
  if (value === "expired") return "Expired";
  if (!value) return "Not started";
  return value.replaceAll("_", " ");
}

export type StaffMember = { name: string; role: StaffConsoleRole };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function candidateUploaderLabel(candidateName: string | null | undefined): string {
  return `${candidateName?.trim() || "Candidate"} (Applicant)`;
}

function staffMemberLabel(staff: StaffMember): string {
  return `${staff.name} (${staffRoleLabel(staff.role)})`;
}

/** "Name (Admin|Recruiter)" for a reviewer, falling back to the stored name. */
export function reviewerLabel(
  userId: string | null | undefined,
  fallbackName: string | null | undefined,
  staffById: Map<string, StaffMember>
): string | null {
  const staff = userId ? staffById.get(userId.trim()) : undefined;
  if (staff) return staffMemberLabel(staff);
  return fallbackName?.trim() || null;
}

/** "Name (Applicant)" for the candidate's own uploads, "Name (Admin|Recruiter)" for staff. */
export function resumeUploaderLabel(params: {
  uploadedByUserId: string | null | undefined;
  workerUserId: string | null | undefined;
  workerId: string;
  candidateName: string | null | undefined;
  staffById: Map<string, StaffMember>;
}): string {
  const role = classifyResumeUploaderRole(
    params.uploadedByUserId,
    params.workerUserId,
    params.workerId
  );
  if (role === "worker") return candidateUploaderLabel(params.candidateName);
  const staff = params.staffById.get(String(params.uploadedByUserId).trim());
  if (!staff) return "Team member (Staff)";
  return staffMemberLabel(staff);
}

async function loadStaffMembers(
  supabase: SupabaseClient,
  tenantId: string,
  userIds: string[]
): Promise<Map<string, StaffMember>> {
  const result = new Map<string, StaffMember>();
  const ids = [...new Set(userIds.map((id) => id.trim()).filter((id) => UUID_RE.test(id)))];
  if (!ids.length) return result;

  const [{ data: users, error: usersError }, { data: memberships, error: membershipError }] =
    await Promise.all([
      supabase.from("users").select("id, first_name, last_name, email, role").in("id", ids),
      supabase.from("user_roles").select("user_id, role").eq("tenant_id", tenantId).in("user_id", ids),
    ]);
  if (usersError) throw usersError;
  if (membershipError) throw membershipError;

  const membershipRoleById = new Map(
    ((memberships ?? []) as Array<{ user_id: string; role: string | null }>).map((row) => [
      String(row.user_id),
      asText(row.role),
    ])
  );
  for (const user of (users ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    role: string | null;
  }>) {
    const id = String(user.id);
    const isAdmin = [asText(user.role), membershipRoleById.get(id) ?? null].some(
      (role) => role === "admin" || role === "owner"
    );
    result.set(id, {
      name: staffDisplayName(user.first_name, user.last_name, user.email),
      role: isAdmin ? "admin" : "recruiter",
    });
  }
  return result;
}

async function signedOrUnavailable(
  supabase: SupabaseClient,
  stored: string | null | undefined,
  defaultBucket: string
): Promise<{ url: string | null; unavailable: boolean }> {
  const raw = asText(stored);
  if (!raw) return { url: null, unavailable: false };
  const url = await resolveStorageAccessibleUrl(supabase, raw, { defaultBucket });
  return { url, unavailable: !url };
}

const UPLOAD_NAME_PREFIX_RE =
  /^\d+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;

/** Original file name from a stored path (`<timestamp>-<uuid>-<name>`). */
export function storedFileName(stored: string): string {
  const path = stored.split("?")[0] ?? stored;
  let name = path.split("/").filter(Boolean).pop() ?? path;
  try {
    name = decodeURIComponent(name);
  } catch {
    // keep the raw segment
  }
  return name.replace(UPLOAD_NAME_PREFIX_RE, "") || name;
}

/** "Name (Admin|Recruiter)" when staff uploaded the file for the candidate, else "Name (Applicant)". */
function documentUploaderLabel(
  staffUserId: string | null,
  candidateName: string,
  staffById: Map<string, StaffMember>
): string {
  if (!staffUserId) return candidateUploaderLabel(candidateName);
  const staff = staffById.get(staffUserId);
  return staff ? staffMemberLabel(staff) : "Team member (Staff)";
}

/** SSN / ID uploads live on the worker's `worker_documents` row, not per required document. */
async function identityDocuments(
  supabase: SupabaseClient,
  params: {
    row: Record<string, unknown> | null;
    workerId: string;
    candidateName: string;
    uploaderById: Map<string, StaffMember>;
  }
): Promise<{ documents: InspectableDocument[]; complete: boolean }> {
  const { row } = params;
  if (!row) return { documents: [], complete: false };

  const documents: InspectableDocument[] = [];
  for (const slot of IDENTITY_UPLOAD_SLOTS) {
    const stored = asText(row[slot.column]);
    if (!stored) continue;
    const signed = await signedOrUnavailable(supabase, stored, WORKER_REQUIRED_FILES_BUCKET);
    documents.push({
      id: identityDocumentId(row, params.workerId, slot.column),
      documentName: slot.title,
      originalFileName: storedFileName(stored),
      documentType: slot.title,
      fileSize: null,
      uploadedAt: asText(row.updated_at),
      uploadedBy: documentUploaderLabel(
        staffUploaderIdFromPath(stored),
        params.candidateName,
        params.uploaderById
      ),
      verificationStatus: null,
      previewUrl: signed.url,
      downloadUrl: signed.url,
      fileUnavailable: signed.unavailable,
      approvedOrRejectedAt: null,
      reviewedBy: null,
      reviewNotes: null,
    });
  }
  return { documents, complete: hasRequiredIdentityDocuments(row) };
}

export async function loadCandidateWorkflowStepInspection(
  supabase: SupabaseClient,
  params: {
    workerId: string;
    tenantId: string;
    stepId: string;
  }
): Promise<WorkflowStepInspection | WorkflowStepInspectionError> {
  const { workerId, tenantId, stepId } = params;

  const { data: worker, error: workerError } = await supabase
    .from("worker")
    .select("id, user_id, first_name, last_name, status, converted_at, converted_worker_id, conversion_status")
    .eq("id", workerId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (workerError) throw workerError;
  if (!worker) return { ok: false, status: 404, error: "Candidate not found" };

  const { data: record, error: recordError } = await supabase
    .from("applicant_workflow_step_records")
    .select(ASSIGNED_STEP_RECORD_COLUMNS)
    .eq("id", stepId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (recordError) throw recordError;
  if (!record) {
    return { ok: false, status: 404, error: "Workflow step not found" };
  }

  const { data: instance, error: instanceError } = await supabase
    .from("applicant_workflow_instances")
    .select(
      "id, worker_id, workflow_name, workflow_version, started_at, created_at, tenant_id, application_id"
    )
    .eq("id", record.workflow_instance_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (instanceError) throw instanceError;
  if (!instance || asText(instance.worker_id) !== workerId) {
    return { ok: false, status: 404, error: "Workflow step not found" };
  }

  const phase = parseAssignedStepPhase({
    phase: asText(record.phase),
    settings:
      record.settings && typeof record.settings === "object" && !Array.isArray(record.settings)
        ? (record.settings as Record<string, unknown>)
        : {},
  });
  if (phase === "post_hire") {
    try {
      await ensureCandidateConvertedIfAgreementCompleted(supabase, { tenantId, workerId });
    } catch (e) {
      console.warn("[inspection] ensureCandidateConvertedIfAgreementCompleted failed", e);
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

  const applicationId = await resolveInstanceApplicationId(supabase, {
    tenantId,
    instanceId: String(instance.id),
    instanceApplicationId: asText(instance.application_id),
  });
  const [config, progressByStepId] = await Promise.all([
    loadTenantOnboardingConfig(supabase, tenantId, { workerFacing: false }),
    loadScopedStepProgress(supabase, { tenantId, workerId, applicationId }),
  ]);
  const tenantSteps = config?.steps ?? [];

  let mapped = await mapInstanceStepRecord(supabase, {
    tenantId,
    instanceId: String(instance.id),
    recordId: String(record.id),
    tenantSteps,
    progressByStepId,
    assignedAt: asText(instance.started_at) ?? asText(instance.created_at),
    applicationId,
  });

  if (!mapped) {
    return { ok: false, status: 404, error: "Workflow step not found" };
  }

  const mappedTenantStepId = mapped.tenantStepId;
  let progress = mappedTenantStepId ? progressByStepId.get(mappedTenantStepId) : undefined;
  const postHireKind = postHireScreenKindForStepId(mapped.stepType);
  if (postHireKind && (!progress || !readPostHireSubmission(progress.data))) {
    for (const [, pRow] of progressByStepId) {
      const sub = readPostHireSubmission(pRow.data);
      if (sub?.kind === postHireKind) {
        progress = pRow;
        break;
      }
    }
  }
  const progressData =
    progress?.data && typeof progress.data === "object" && !Array.isArray(progress.data)
      ? (progress.data as Record<string, unknown>)
      : {};
  const tenantStep = mappedTenantStepId
    ? tenantSteps.find((step) => step.id === mappedTenantStepId) ?? null
    : null;
  const recordSettings =
    record.settings && typeof record.settings === "object" && !Array.isArray(record.settings)
      ? (record.settings as Record<string, unknown>)
      : {};
  const staffAction = resolveStaffStepEligibility(tenantStep, mapped.status, {
    stepType: asText(record.step_type),
    settings: recordSettings,
  });
  const recordReview = readRecordStaffReview(record);
  const progressReview = readStaffStepReview(progressData);
  const staffReview =
    recordReview && progressReview
      ? Date.parse(progressReview.reviewedAt) > Date.parse(recordReview.reviewedAt)
        ? progressReview
        : recordReview
      : recordReview ?? progressReview;
  const staffDecision =
    staffReview && staffReview.decision !== "reopen" ? staffReview : null;
  const usesESign =
    isFirmaAttachableWorkflowStepId(mapped.stepType) &&
    Boolean(
      asText(recordSettings.firmaRecruiterTemplateId) ??
        (tenantStep ? getFirmaRecruiterTemplateId(tenantStep) : null)
    );
  const kind = inspectionKindForStep({
    stepType: mapped.stepType,
    onboardingType: mapped.onboardingType || workflowStepIdToOnboardingType(mapped.stepType),
    usesESign,
  });

  const requiredDocTitleById = new Map(
    (config?.requiredDocuments ?? [])
      .filter((doc) => doc.onboarding_step_id === mappedTenantStepId)
      .map((doc) => [doc.id, doc.title])
  );
  const uploadRequirements = stepUploadRequirements(config, mappedTenantStepId);
  const isIdentityStep = mapped.stepType === SSN_IDENTITY_STEP_TYPE;

  const [submittedRows, identityRow] = await Promise.all([
    loadStepSubmittedDocuments(supabase, {
      tenantId,
      workerId,
      requiredDocumentIds: [...requiredDocTitleById.keys()],
    }),
    isIdentityStep
      ? loadIdentityDocumentRow(supabase, { tenantId, workerId }).catch((error) => {
          console.error("[candidate-workflow-step-inspection] identity documents unavailable", error);
          return null;
        })
      : Promise.resolve(null),
  ]);

  const candidateName = [asText(worker.first_name), asText(worker.last_name)]
    .filter(Boolean)
    .join(" ");
  const uploaderById = await loadStaffMembers(supabase, tenantId, [
    ...submittedRows.map((row) => asText(row.uploaded_by_user_id) ?? ""),
    ...IDENTITY_UPLOAD_SLOTS.map((slot) => staffUploaderIdFromPath(asText(identityRow?.[slot.column])) ?? ""),
  ]);
  const documents: InspectableDocument[] = [];
  for (const row of submittedRows) {
    const signed = await signedOrUnavailable(
      supabase,
      asText(row.file_url),
      WORKER_REQUIRED_FILES_BUCKET
    );
    documents.push({
      id: String(row.id),
      documentName: requiredDocTitleById.get(String(row.required_document_id)) ?? null,
      originalFileName: asText(row.original_file_name),
      documentType: asText(row.file_type),
      fileSize: typeof row.file_size === "number" ? row.file_size : null,
      uploadedAt: asText(row.uploaded_at),
      uploadedBy: documentUploaderLabel(asText(row.uploaded_by_user_id), candidateName, uploaderById),
      verificationStatus: asText(row.status),
      previewUrl: signed.url,
      downloadUrl: signed.url,
      fileUnavailable: signed.unavailable,
      approvedOrRejectedAt: asText(row.reviewed_at),
      reviewedBy: asText(row.reviewed_by),
      reviewNotes: asText(row.review_notes),
    });
  }

  if (kind === "resume") {
    const { data: resumes } = await supabase
      .from("worker_resumes")
      .select(
        "id, file_url, storage_path, original_file_name, file_name, file_type, file_size_bytes, uploaded_at, uploaded_by_user_id, job_application_id"
      )
      .eq("tenant_id", tenantId)
      .eq("worker_id", workerId)
      .is("deleted_at", null)
      .order("uploaded_at", { ascending: false });
    const applicationResumes = filterResumesForApplication(
      (resumes ?? []) as Array<Record<string, unknown> & { job_application_id?: string | null }>,
      applicationId
    );
    const workerUserId = asText(worker.user_id);
    const staffById = await loadStaffMembers(
      supabase,
      tenantId,
      applicationResumes
        .map((row) => asText(row.uploaded_by_user_id))
        .filter((id): id is string => Boolean(id) && id !== workerUserId && id !== workerId)
    );
    for (const row of applicationResumes) {
      const stored = asText(row.storage_path) ?? asText(row.file_url);
      const signed = await signedOrUnavailable(supabase, stored, WORKER_RESUMES_BUCKET);
      documents.push({
        id: String(row.id),
        documentName: "Resume",
        originalFileName: asText(row.original_file_name) ?? asText(row.file_name),
        documentType: asText(row.file_type) ?? "resume",
        fileSize: typeof row.file_size_bytes === "number" ? row.file_size_bytes : null,
        uploadedAt: asText(row.uploaded_at),
        uploadedBy: resumeUploaderLabel({
          uploadedByUserId: asText(row.uploaded_by_user_id),
          workerUserId,
          workerId,
          candidateName,
          staffById,
        }),
        verificationStatus: "uploaded",
        previewUrl: signed.url,
        downloadUrl: signed.url,
        fileUnavailable: signed.unavailable,
        approvedOrRejectedAt: null,
        reviewedBy: null,
        reviewNotes: null,
      });
    }
  }

  const latestDoc = documents[0] ?? null;
  const stepOnlyStatus = mapProgressToDisplayStatus(mapped.status);
  mapped.displayStatus =
    kind === "resume" && stepOnlyStatus === "completed"
      ? stepOnlyStatus
      : mapProgressToDisplayStatus(mapped.status, latestDoc?.verificationStatus);
  if (mapped.stepType === RECRUITER_SCREENING_STEP_TYPE) {
    mapped.displayStatus = applyQuickMatchScreeningProgress(
      [mapped],
      await applicationQuickMatchRan(supabase, { tenantId, applicationId })
    )[0].displayStatus;
  }

  // Identity uploads have no review status of their own; they only lift an untouched step to Submitted.
  if (isIdentityStep) {
    const identity = await identityDocuments(supabase, {
      row: identityRow,
      workerId,
      candidateName,
      uploaderById,
    });
    documents.push(...identity.documents);
    mapped.displayStatus = enrichAssignedStepsDisplayFromEvidence({
      steps: [mapped],
      hasIdentityDocuments: identity.complete,
    })[0].displayStatus;
  }
  mapped.displayStatus = candidateReviewDisplayStatus(mapped);

  const documentUploads = buildStepDocumentUploads({
    workerId,
    stepType: mapped.stepType,
    requirements: uploadRequirements,
    submittedRows: submittedRows.map((row) => ({
      id: String(row.id),
      required_document_id: asText(row.required_document_id),
      status: asText(row.status),
    })),
    identityRow,
    candidateOwned: !staffAction.allowed && Boolean(mappedTenantStepId),
    stepStatus: mapped.status,
  });

  let enrollment: WorkflowStepInspection["enrollment"] = null;
  if (isEnrollmentDecisionStepType(mapped.stepType)) {
    const saved = readEnrollmentDecision(progressData);
    const tenantStep = mappedTenantStepId
      ? config?.steps.find((step) => step.id === mappedTenantStepId) ?? null
      : null;
    enrollment = {
      question:
        saved?.question ??
        enrollmentQuestionForStep(
          tenantStep ?? { title: mapped.title, metadata: { workflow_step_id: mapped.stepType } }
        ),
      decision: saved?.decision ?? null,
      decisionLabel: saved ? enrollmentDecisionLabel(saved.decision) : null,
      answeredAt: saved?.answeredAt ?? null,
    };
  }

  const hasPostHireScreen = phase === "post_hire" && postHireScreenKindForStepId(mapped.stepType) != null;

  let form: WorkflowStepInspection["form"] = null;
  if (!enrollment && !hasPostHireScreen && (kind === "form" || asText(progressData.response) != null)) {
    const prompt = asText(
      (mappedTenantStepId
        ? config?.steps.find((step) => step.id === mappedTenantStepId)?.metadata?.prompt
        : null) ?? record.settings?.prompt
    );
    form = {
      questions: [
        {
          label: prompt || mapped.title,
          fieldType: asText(progressData.step_type) || mapped.onboardingType || "text",
          answer: progressData.response ?? null,
          submittedAt: asText(progress?.updated_at) ?? asText(progress?.completed_at),
          reviewResult: asText(progressData.reason),
        },
      ],
    };
  }

  const responseSubmittedAt = asText(progress?.updated_at) ?? asText(progress?.completed_at);
  const checkboxQuestions = storedCheckboxQuestions(progressData, responseSubmittedAt);
  const postHireSubmission = enrollment ? null : readPostHireSubmission(progressData);
  if (postHireSubmission && postHireSubmission.fields.length > 0) {
    const submittedAt = postHireSubmission.submittedAt ?? responseSubmittedAt;
    let fields = postHireSubmission.fields;
    if (postHireSubmission.kind === "direct_deposit") {
      fields = filterDirectDepositInspectionFields(fields);
    }
    form = {
      questions: fields.map((field) => ({
        label: field.label,
        fieldType: /authoriz|consent|agreement|confirm/i.test(field.label) ? "checkbox" : "text",
        answer: field.value,
        submittedAt,
        reviewResult: null,
      })),
    };
  } else if (checkboxQuestions) {
    form = { questions: checkboxQuestions };
  } else if (!form && phase === "post_hire" && progressData && Object.keys(progressData).length > 0) {
    const IGNORED_KEYS = new Set([
      "step_type",
      "partner_dispatch",
      "signing_provider",
      "firma_status",
      "flow_paused",
      "pause_reason",
      "reason",
      "source",
    ]);
    const dynamicQuestions: Array<{
      label: string;
      fieldType: string;
      answer: unknown;
      submittedAt: string | null;
      reviewResult: string | null;
    }> = [];

    for (const [k, v] of Object.entries(progressData)) {
      if (IGNORED_KEYS.has(k) || v == null || v === "") continue;
      const label =
        k === "response"
          ? mapped.title || "Response"
          : k.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const answer = typeof v === "boolean" ? (v ? "Yes / Confirmed" : "No") : v;
      dynamicQuestions.push({
        label,
        fieldType: "text",
        answer,
        submittedAt: asText(progress?.updated_at) ?? asText(progress?.completed_at),
        reviewResult: null,
      });
    }

    if (dynamicQuestions.length > 0) {
      const screenKind = postHireScreenKindForStepId(mapped.stepType);
      if (screenKind === "direct_deposit" || screenKind === "confirmation") {
        const message = asText(progressData.checkbox_label) || asText(progressData.response);
        form = {
          questions: [
            {
              label: message || mapped.title || "Confirmation",
              fieldType: "checkbox",
              answer: "Confirmed",
              submittedAt: responseSubmittedAt,
              reviewResult: null,
            },
          ],
        };
      } else {
        form = { questions: dynamicQuestions };
      }
    }
  }

  if (
    !form &&
    hasPostHireScreen &&
    (postHireScreenKindForStepId(mapped.stepType) === "direct_deposit" ||
      postHireScreenKindForStepId(mapped.stepType) === "confirmation") &&
    (mapped.status === "completed" || progress?.completed_at != null)
  ) {
    const message = asText(progressData.checkbox_label) || asText(progressData.response);
    form = {
      questions: [
        {
          label: message || mapped.title || "Confirmation",
          fieldType: "checkbox",
          answer: "Confirmed",
          submittedAt: responseSubmittedAt,
          reviewResult: null,
        },
      ],
    };
  }

  let assessment: WorkflowStepInspection["assessment"] = null;
  if (kind === "assessment") {
    const [{ data: skillRows }, { data: answerRows }, catalog] = await Promise.all([
      supabase
        .from("skill_assessments")
        .select("category, answers, completed, created_at")
        .eq("worker_id", workerId)
        .eq("tenant_id", tenantId),
      supabase
        .from("applicant_skill_assessment_answers")
        .select("category_id, skill_id, answer_value, created_at")
        .eq("tenant_id", tenantId)
        .eq("applicant_id", workerId),
      loadTenantSkillAssessmentSettings(supabase, tenantId)
        .then(publishedCatalogForApplicants)
        .catch(() => createDefaultSkillAssessmentCatalog()),
    ]);
    const assessmentRows = (skillRows ?? []) as SkillAssessmentRowInput[];
    const ratingRows = (answerRows ?? []) as SkillAnswerRowInput[];
    const results = buildSkillAssessmentResults(catalog, assessmentRows, ratingRows);
    const timestamps = [...assessmentRows, ...ratingRows]
      .map((item) => asText(item.created_at))
      .filter((value): value is string => Boolean(value))
      .sort();
    const allCompleted =
      results.summary.totalCategories > 0 &&
      results.summary.completedCategories === results.summary.totalCategories;
    assessment = {
      name: mapped.title,
      startedAt: timestamps[0] ?? null,
      completedAt: allCompleted
        ? asText(progress?.completed_at) ?? timestamps[timestamps.length - 1] ?? null
        : null,
      summary: results.summary,
      categories: results.categories,
    };
  }

  let references: WorkflowStepInspection["references"] = [];
  if (kind === "references") {
    const { data: rows } = await supabase
      .from("worker_references")
      .select(
        "id, reference_first_name, reference_last_name, relationship, reference_email, reference_phone, notes, created_at"
      )
      .eq("tenant_id", tenantId)
      .eq("worker_id", workerId)
      .order("created_at", { ascending: false });
    references = ((rows ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      name: `${asText(row.reference_first_name) ?? ""} ${asText(row.reference_last_name) ?? ""}`.trim() || "Reference",
      relationship: asText(row.relationship),
      email: asText(row.reference_email),
      phone: asText(row.reference_phone),
      verificationStatus: null,
      submittedAt: asText(row.created_at),
      recruiterNotes: asText(row.notes),
    }));
  }

  let agreement: WorkflowStepInspection["agreement"] = null;
  const isAgreementStep =
    kind === "agreement" ||
    isAgreementOrSignatureStep({
      id: mapped.id,
      stepKey: mapped.stepKey,
      stepType: mapped.stepType,
      title: mapped.title,
      phase: mapped.phase,
      metadata: (record.settings as Record<string, unknown> | null) ?? null,
      data: progressData,
    });

  // A signing session opened before a re-publish stays on the replaced step.
  const sessionStepIds = [mappedTenantStepId, asText(progressData[REPLACED_STEP_DATA_KEY])].filter(
    (id): id is string => Boolean(id)
  );

  if (isAgreementStep || (kind === "background_check" && sessionStepIds.length)) {
    let query = supabase
      .from("worker_firma_signing_sessions")
      .select(
        "id, onboarding_step_id, firma_status, created_at, updated_at, recruiter_template_id, signing_request_id, firma_workspace_id"
      )
      .eq("tenant_id", tenantId)
      .eq("worker_id", workerId)
      .order("created_at", { ascending: false });

    if (sessionStepIds.length) {
      query = query.in("onboarding_step_id", sessionStepIds);
    } else if (mapped.id) {
      query = query.eq("onboarding_step_id", mapped.id);
    }
    const { data: sessions } = await query;
    let session = ((sessions ?? []) as Array<Record<string, unknown>>)[0] ?? null;

    if (!session && asText(progressData.signing_request_id)) {
      const { data: byRequestId } = await supabase
        .from("worker_firma_signing_sessions")
        .select(
          "id, onboarding_step_id, firma_status, created_at, updated_at, recruiter_template_id, signing_request_id, firma_workspace_id"
        )
        .eq("tenant_id", tenantId)
        .eq("signing_request_id", asText(progressData.signing_request_id)!)
        .maybeSingle();
      if (byRequestId) session = byRequestId;
    }

    const signingRequestId = asText(session?.signing_request_id) ?? asText(progressData.signing_request_id);
    const firmaStatus = asText(session?.firma_status) ?? asText(progressData.firma_status);
    const authorizationEsign =
      mapped.phase !== "post_hire" &&
      isAgreementEsignStep({
        snapshotStepId: mapped.snapshotStepId,
        stepKey: mapped.stepKey,
        stepType: mapped.stepType,
        title: mapped.title,
      });
    const storedSignature =
      isFirmaSigningComplete(firmaStatus) ||
      progressData.firma_signed === true ||
      progressData.authorization_agreed === true ||
      Boolean(asText(progressData.signed_document_url) || asText(progressData.download_url));
    let isSigned = authorizationEsign
      ? storedSignature
      : storedSignature ||
        mapped.displayStatus === "completed" ||
        mapped.displayStatus === "approved" ||
        (mapped.displayStatus === "submitted" && mapped.status === "completed");

    const completedDoc = documents.find((doc) => doc.verificationStatus === "approved") ?? documents[0] ?? null;
    let resolvedDownloadUrl =
      asText(progressData.download_url) ??
      asText(progressData.signed_document_url) ??
      completedDoc?.downloadUrl ??
      null;

    if (!resolvedDownloadUrl && signingRequestId) {
      try {
        const wsId =
          asText(session?.firma_workspace_id) ??
          (await resolveTenantFirmaWorkspaceId(supabase, tenantId).catch(() => null));
        if (wsId) {
          resolvedDownloadUrl = await tryGetFirmaSigningRequestDownload(signingRequestId, wsId);
        }
      } catch {
        /* best effort fetch */
      }
    }

    if (session || signingRequestId || isAgreementStep) {
      agreement = {
        documentName: mapped.title,
        signatureStatus: signatureStatusLabel(firmaStatus ?? (isSigned ? "completed" : "pending")),
        sentAt: asText(session?.created_at) ?? asText(mapped.assignedAt),
        viewedAt: null,
        signedAt: isSigned
          ? asText(session?.updated_at) ?? asText(progress?.completed_at) ?? asText(mapped.completedAt)
          : null,
        signerIdentity: candidateName || "Applicant",
        completedDocumentUrl: resolvedDownloadUrl ?? completedDoc?.previewUrl ?? null,
        downloadUrl: resolvedDownloadUrl ?? completedDoc?.downloadUrl ?? null,
        signingRequestId,
        firmaStatus,
        canResync: Boolean(signingRequestId || session || mappedTenantStepId),
        isSigned,
        auditHistory: [
          {
            status: signatureStatusLabel(firmaStatus ?? (isSigned ? "completed" : "pending")),
            at: asText(session?.updated_at) ?? asText(progress?.completed_at) ?? asText(session?.created_at),
          },
        ],
      };
    }
  }

  let authorization: WorkflowStepInspection["authorization"] = null;
  if (kind === "background_check" || kind === "agreement") {
    const partner =
      progressData.partner_dispatch && typeof progressData.partner_dispatch === "object"
        ? (progressData.partner_dispatch as Record<string, unknown>)
        : {};
    authorization = {
      authorizationStatus:
        progressData.authorization_agreed === true
          ? "Authorized"
          : progressData.authorization_agreed === false
            ? "Not authorized"
            : null,
      consentTimestamp: asText(progress?.completed_at) ?? asText(progress?.updated_at),
      providerSafeStatus: asText(partner.status) ?? asText(progressData.firma_status),
      reviewStatus: displayStatusLabel(mapped.displayStatus),
    };
  }

  let finalReview: WorkflowStepInspection["finalReview"] = null;
  if (kind === "final_review") {
    const { data: onboarding } = await supabase
      .from("worker_onboarding_progress")
      .select("submitted_at, submitted_with_incomplete_steps, incomplete_step_keys, status")
      .eq("tenant_id", tenantId)
      .eq("worker_id", workerId)
      .maybeSingle();
    const missing = Array.isArray(onboarding?.incomplete_step_keys)
      ? (onboarding?.incomplete_step_keys as unknown[]).map((item) => String(item))
      : [];
    const { data: instanceSteps } = await supabase
      .from("applicant_workflow_step_records")
      .select("title, phase, position")
      .eq("workflow_instance_id", record.workflow_instance_id)
      .eq("tenant_id", tenantId)
      .order("position", { ascending: true });
    finalReview = {
      submittedAt: asText(onboarding?.submitted_at),
      confirmation: onboarding?.submitted_at ? "Candidate submitted this application for review." : null,
      missingRequirements: missing,
      stepsIncluded: ((instanceSteps ?? []) as Array<{ title?: string; phase?: string }>)
        .filter((item) => String(item.phase ?? "") !== "post_hire")
        .map((item) => String(item.title ?? "Step")),
      reviewer: null,
      decision: asText(onboarding?.status),
      notes: asText(progressData.reason),
    };
  }

  const checkResult = await loadStepCheckResult(supabase, {
    tenantId,
    stepRecordId: String(record.id),
    stepType: asText(record.step_type),
  });

  let interviews: CandidateInterview[] | null = null;
  let step = mapped;
  if (isInterviewStep(mapped)) {
    interviews = await loadCandidateInterviews(supabase, { tenantId, workerId });
    step = { ...mapped, interview: summarizeInterviews(interviews) };
  }
  const interviewStatus = interviewStepStatus(step);

  const jobApplication =
    kind === "job_application"
      ? await loadJobApplicationStepView(supabase, { tenantId, applicationId })
      : null;

  if (kind === "job_application" && mapped) {
    const [withEvidence] = applyParameterizedJobApplicationStepEvidence({
      steps: [mapped],
      progressByStepId,
      applicationId,
      jobApplication,
    });
    if (withEvidence) {
      mapped = withEvidence;
      step = isInterviewStep(mapped)
        ? { ...withEvidence, interview: step.interview ?? null }
        : withEvidence;
    }
  }

  const offer =
    kind === "offer"
      ? {
          details: applicationId
            ? await loadOfferDetailsForApplication(supabase, { tenantId, applicationId }).catch((error) => {
                console.error("[candidate-workflow-step-inspection] offer details unavailable", error);
                return null;
              })
            : null,
          decision: readOfferDecision(progressData, progress?.status),
        }
      : null;
  const candidateHasSubmitted =
    documents.length > 0 ||
    Boolean(offer?.decision) ||
    Boolean(agreement?.signedAt) ||
    Boolean(enrollment?.decision) ||
    Boolean(postHireSubmission) ||
    Boolean(jobApplication?.screening.some((item) => item.answered));

  let emptyState: string | null = null;
  if (enrollment) {
    if (!enrollment.decision) {
      emptyState =
        progressData.system_completed === true
          ? "The system marked this step complete before the candidate answered."
          : `Waiting for the candidate to answer Agree or Not ready on the ${mapped.title} screen.`;
    } else if (enrollment.decision === "not_ready") {
      emptyState = mapped.required
        ? "The candidate isn't ready yet. This step is required, so they can't continue until they agree."
        : "The candidate isn't ready yet. This step is optional, so it doesn't block their next step.";
    }
  } else if (mapped.unmatched && !staffAction.allowed) emptyState = LEGACY_UNMATCHED_STEP_MESSAGE;
  else if (
    jobApplication &&
    staffAction.allowed &&
    (mapped.status === "pending" || mapped.status === "in_progress")
  ) {
    emptyState = `Waiting for ${staffAction.ownerLabel ?? "the internal team"} to review the job details below and complete this step. The candidate can't continue past it until then.`;
  } else if (interviewStatus?.key === "not_scheduled") {
    emptyState = "No interview scheduled yet. Use Schedule Interview to book one with the candidate.";
  } else if (interviewStatus?.key === "scheduled" && step.interview?.latest) {
    const latest = step.interview.latest;
    emptyState = `${latest.title} is scheduled for ${formatInterviewDate(latest.startsAt)}, ${formatInterviewTimeRange(latest.startsAt, latest.endsAt)} ET. After it takes place, add your notes and mark it Completed or Rejected.`;
  } else if (interviewStatus?.key === "awaiting_decision") {
    emptyState = "The interview has taken place. Add your notes and mark it Completed or Rejected.";
  } else if (staffAction.allowed && staffAction.variant === "selection") {
    if (mapped.status === "pending") {
      emptyState = `Waiting for ${staffAction.ownerLabel ?? "the internal team"} to decide whether to move this candidate forward. This step is optional and doesn't block the next stage.`;
    } else if (mapped.status === "in_progress") {
      emptyState = "Candidate is on hold. This doesn't block the next stage.";
    }
  } else if (staffAction.allowed && staffAction.variant === "verification") {
    if (mapped.status === "pending") {
      emptyState = `Waiting for ${staffAction.ownerLabel ?? "the internal team"} to verify the references. This step is optional and doesn't block the candidate's next stage.`;
    } else if (mapped.status === "in_progress") {
      emptyState = "References are marked as needing review. This doesn't block the candidate's next stage.";
    }
  } else if (staffAction.allowed && isManualHrTask(mapped.stepType)) {
    if (mapped.status === "pending" || mapped.status === "in_progress") {
      emptyState =
        "This is a recruiter step. Add a note if you need to, then mark it complete. The candidate does not complete this step.";
    }
  } else if (staffAction.allowed && !mapped.required) {
    if (mapped.status === "pending" || mapped.status === "in_progress") {
      emptyState = `Waiting for ${staffAction.ownerLabel ?? "the internal team"} to complete this step. It's optional, so it doesn't block the candidate's next stage.`;
    }
  } else if (staffAction.allowed) {
    if (mapped.status === "pending" || mapped.status === "in_progress") {
      emptyState = `Waiting for ${staffAction.ownerLabel ?? "the internal team"} to complete this step. The candidate can't continue past it until then.`;
    }
  } else if (postHireSubmission) {
    emptyState = null;
  } else if (
    (kind === "upload" || kind === "resume") &&
    documents.length === 0 &&
    (mapped.status === "completed" || mapped.displayStatus === "completed")
  ) {
    emptyState = STEP_COMPLETED_WITHOUT_DOCUMENT_MESSAGE;
  } else if (
    kind === "form" &&
    !asText(progressData.response) &&
    mapped.status === "completed"
  ) {
    emptyState = STEP_COMPLETED_WITHOUT_DOCUMENT_MESSAGE;
  } else if (
    !staffAction.allowed &&
    !candidateHasSubmitted &&
    (mapped.status === "pending" || mapped.status === "in_progress")
  ) {
    emptyState = documentUploads.canUpload
      ? candidateUploadWaitingMessage(mapped.status)
      : candidateWaitingMessage(kind, mapped.status, hasPostHireScreen ? mapped.title : null);
  } else if (!progress && documents.length === 0 && mapped.status === "pending") {
    emptyState = "No submission received for this step.";
  } else if (mapped.status === "completed" && documents.length === 0 && !form && !assessment && !agreement) {
    emptyState = STEP_COMPLETED_WITHOUT_DOCUMENT_MESSAGE;
  }

  if (
    assessment &&
    assessment.summary.answeredQuestions === 0 &&
    isCompleteDisplayStatus(mapped.displayStatus)
  ) {
    emptyState = ASSESSMENT_COMPLETED_WITHOUT_ANSWERS_MESSAGE;
  }

  const candidateStep = !staffAction.allowed && mapped.candidateOwned === true;
  const authorizationEsign =
    phase !== "post_hire" &&
    isAgreementEsignStep({
      snapshotStepId: mapped.snapshotStepId,
      stepKey: mapped.stepKey,
      stepType: mapped.stepType,
      title: mapped.title,
    });
  const signatureStored = agreement?.isSigned === true;
  const canVerify =
    candidateStep &&
    mapped.status === "completed" &&
    !mapped.verifiedAt &&
    mapped.displayStatus === "submitted" &&
    (!authorizationEsign || signatureStored);
  if (canVerify && (emptyState == null || emptyState === STEP_COMPLETED_WITHOUT_DOCUMENT_MESSAGE)) {
    emptyState = CANDIDATE_STEP_AWAITING_REVIEW_MESSAGE;
  }

  const verifiedByUserId = mapped.verifiedAt ? asText(record.status_changed_by) : null;
  const reviewable = kind !== "resume";
  const reviewerById = await loadStaffMembers(
    supabase,
    tenantId,
    [
      ...documents.map((doc) => doc.reviewedBy ?? ""),
      staffDecision?.reviewedByUserId ?? "",
      verifiedByUserId ?? "",
    ]
  );
  for (const doc of documents) {
    doc.reviewedBy = reviewerLabel(doc.reviewedBy, null, reviewerById);
  }
  const staffDecisionBy = staffDecision
    ? reviewerLabel(staffDecision.reviewedByUserId, staffDecision.reviewedByName, reviewerById)
    : null;
  const candidateReview: CandidateStepReview | null = candidateStep
    ? {
        verified: Boolean(mapped.verifiedAt),
        verifiedAt: mapped.verifiedAt ?? null,
        verifiedBy: mapped.verifiedAt
          ? reviewerLabel(verifiedByUserId, mapped.verifiedByName, reviewerById)
          : null,
        canVerify,
        canComplete: authorizationEsign ? false : mapped.status !== "completed" && !mapped.verifiedAt,
      }
    : null;
  // A recruiter verifying a candidate step doesn't make them its completer; completing it
  // on the candidate's behalf (recorded on the progress row too) does.
  const completedByStaff = staffAction.allowed
    ? staffDecision?.decision === "complete"
    : progressReview?.decision === "complete";

  return {
    ok: true,
    kind,
    step,
    applicationId: applicationId ?? null,
    workflowName: asText(instance.workflow_name),
    workflowVersion: asText(instance.workflow_version),
    phase,
    assignedAt: asText(instance.started_at) ?? asText(instance.created_at),
    startedAt: asText(progress?.created_at),
    submittedAt: asText(progress?.completed_at) ?? asText(progress?.updated_at),
    completedAt: mapped.completedAt,
    approvedOrRejectedAt: latestDoc?.approvedOrRejectedAt ?? staffDecision?.reviewedAt ?? null,
    completedBy:
      completedByStaff
        ? staffDecisionBy ?? staffAction.ownerLabel
        : staffAction.allowed
          ? null
          : (progress || latestDoc) && isCompleteDisplayStatus(mapped.displayStatus)
            ? latestDoc?.uploadedBy ?? candidateUploaderLabel(candidateName)
            : null,
    approvedOrRejectedBy: reviewable ? (latestDoc?.reviewedBy ?? staffDecisionBy) : null,
    reviewable,
    notes:
      latestDoc?.reviewNotes ??
      staffReview?.note ??
      (progressData.system_completed === true ? null : asText(progressData.reason)),
    emptyState,
    staffAction,
    staffReview,
    candidateReview,
    checkResult,
    documents,
    documentUploads: documentUploads.slots.length ? documentUploads : null,
    form,
    assessment,
    references,
    agreement,
    authorization: kind === "background_check" ? authorization : kind === "agreement" ? authorization : authorization,
    finalReview,
    interviews,
    jobApplication,
    offer,
    enrollment,
  };
}

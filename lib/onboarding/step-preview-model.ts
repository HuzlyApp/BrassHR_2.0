import type { Node } from "@xyflow/react";
import type {
  WorkflowCanvasNodeData,
  WorkflowNodeData,
  WorkflowState,
} from "@/app/components/workflow-builder/types";
import { isStepNode } from "@/app/components/workflow-builder/types";
import { createStepDraftForType } from "@/lib/onboarding/create-step-draft";
import {
  getWorkflowSettings,
  isApplicantCompletionOwner,
  isApplicantWaitingGateStep,
  isWorkerVisibleStep,
  type ParsedWorkflowSettings,
} from "@/lib/onboarding/workflow-settings";
import { serializeWorkflowState } from "@/lib/onboarding/workflow-builder-serialization";
import { workflowStateToStepDrafts } from "@/lib/onboarding/workflow-to-drafts";
import type { OnboardingStepDraft } from "@/lib/onboarding/default-onboarding-steps";
import type { TenantOnboardingStep } from "@/lib/onboarding/types";
import { applicantPortalCopy, parseWorkflowTemplatePhase, readStepLifecyclePhase } from "@/lib/onboarding/workflow-phase";
import {
  formatPhaseProgressShort,
  groupTenantStepsByPhase,
  lifecyclePhaseLabel,
  type EmploymentLifecyclePhase,
} from "@/lib/onboarding/workflow-phase-groups";
import { isCandidateCheckboxStep } from "@/lib/onboarding/candidate-checkbox-steps";
import { stepUsesFirmaSigning } from "@/lib/onboarding/firma-step-settings";
import {
  professionDocumentKindLabel,
  type ProfessionUploadDocument,
} from "@/lib/professions/profession-documents";

export const STEP_PREVIEW_SAMPLE = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane.doe@example.com",
  phone: "(555) 010-2345",
  address1: "123 Main Street",
  address2: "Suite 200",
  city: "Austin",
  state: "Texas",
  zip: "78701",
  position: "Independent Contractor",
  facility: "Example Facility",
  compensation: "$45 / hour",
  startDate: "September 8, 2026",
  resumeFileName: "Jane_Doe_resume.pdf",
} as const;

export type StepPreviewKind =
  | "resume_upload"
  | "profile_form"
  | "job_application"
  | "offer_acceptance"
  | "agreement"
  | "approval"
  | "document_upload"
  | "references"
  | "skills_intro"
  | "custom_question"
  | "checkbox_confirmation"
  | "waiting_gate"
  | "screening"
  | "summary"
  | "notification"
  | "unsupported";

export type StepPreviewState =
  | "default"
  | "empty"
  | "filled"
  | "completed"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "error";

export type StepPreviewStepperItem = {
  id: string;
  title: string;
  current: boolean;
  phase: EmploymentLifecyclePhase;
  required: boolean;
  stepType: string;
};

export type StepPreviewDocument = {
  title: string;
  description: string;
  is_required: boolean;
};

export type StepPreviewModel = {
  step: TenantOnboardingStep;
  settings: ParsedWorkflowSettings;
  libraryId: string;
  kind: StepPreviewKind;
  audienceLabel: string;
  isConditional: boolean;
  isApplicantFacing: boolean;
  availableStates: StepPreviewState[];
  requiredDocuments: StepPreviewDocument[];
  firmaTemplateName: string | null;
  stepperSteps: StepPreviewStepperItem[];
  preHireSteps: StepPreviewStepperItem[];
  postHireSteps: StepPreviewStepperItem[];
  selectedPhase: EmploymentLifecyclePhase;
  prompt: string | null;
  header: string;
  progressLabel: string;
  preHireProgressLabel: string;
  postHireProgressLabel: string;
};

const NOTIFICATION_LIBRARY_IDS = new Set([
  "welcome-email",
  "status-update-notification",
  "reminder-follow-up-notification",
  "manager-welcome-call",
  "final-onboarding-call",
]);

const CANDIDATE_KINDS = new Set<StepPreviewKind>([
  "resume_upload",
  "profile_form",
  "job_application",
  "offer_acceptance",
  "agreement",
  "document_upload",
  "references",
  "skills_intro",
  "custom_question",
  "checkbox_confirmation",
  "summary",
]);

function draftToTenantStep(draft: OnboardingStepDraft, index: number): TenantOnboardingStep {
  return {
    id: `preview-${draft.step_key}`,
    step_key: draft.step_key,
    title: draft.title,
    description: draft.description?.trim() || null,
    step_type: draft.step_type,
    sort_order: draft.sort_order ?? (index + 1) * 10,
    is_required: draft.is_required,
    is_enabled: true,
    metadata: draft.metadata ?? {},
  };
}

function readLibraryId(step: TenantOnboardingStep): string {
  const id = step.metadata?.workflow_step_id;
  return typeof id === "string" ? id.trim() : "";
}

function readPrompt(step: TenantOnboardingStep): string | null {
  const prompt = step.metadata?.prompt;
  return typeof prompt === "string" && prompt.trim() ? prompt.trim() : null;
}

export function resolveStepPreviewKind(
  step: TenantOnboardingStep,
  libraryId: string
): StepPreviewKind {
  const title = (step.title || "").toLowerCase();

  if (libraryId === "resume-basic-profile" || step.step_type === "resume_upload") {
    return "resume_upload";
  }
  if (libraryId === "parameterized-job-application" || libraryId === "custom-application-form") {
    return "job_application";
  }
  if (libraryId === "offer-acceptance") return "offer_acceptance";
  if (
    libraryId === "manager-facility-approval" ||
    libraryId === "hr-final-approval" ||
    libraryId === "client-review" ||
    libraryId === "candidate-selection" ||
    libraryId === "recruiter-screening"
  ) {
    return "approval";
  }
  if (
    libraryId === "employee-agreement" ||
    libraryId === "welcome-packet-esign" ||
    libraryId === "policy-acknowledgment" ||
    step.step_type === "authorizations" ||
    /independent contractor|contractor agreement|employee agreement|contract esign/.test(title)
  ) {
    return "agreement";
  }
  if (libraryId === "references-collection" || step.step_type === "references") {
    return "references";
  }
  if (
    libraryId === "skill-qualification-assessment" ||
    libraryId === "training-modules-quiz" ||
    step.step_type === "skill_assessment"
  ) {
    return "skills_intro";
  }
  if (
    step.step_type === "document_upload" ||
    step.step_type === "professional_license" ||
    libraryId === "document-upload" ||
    libraryId === "i9-right-to-work-verification" ||
    libraryId === "tax-forms" ||
    libraryId === "ssn-identity-verification" ||
    libraryId === "certification-upload" ||
    libraryId === "credential-license-verification" ||
    libraryId === "equipment-badge-acknowledgment"
  ) {
    return "document_upload";
  }
  if (
    libraryId === "oig-exclusion-check" ||
    libraryId === "background-check" ||
    libraryId === "drug-test-screening"
  ) {
    return "screening";
  }
  if (step.step_type === "review_submit" || libraryId === "completion-milestone") {
    return "summary";
  }
  if (NOTIFICATION_LIBRARY_IDS.has(libraryId)) return "notification";
  if (
    isCandidateCheckboxStep({
      ...step,
      metadata: { ...step.metadata, workflow_step_id: libraryId || readLibraryId(step) },
    })
  ) {
    return "checkbox_confirmation";
  }
  if (libraryId === "collect-extra-files") return "document_upload";
  if (libraryId === "collect-references") return "references";
  if (step.step_type === "profile_information") return "profile_form";
  // Candidate steps with no separate screen use the same confirmation as Your Application.
  if (
    libraryId === "custom-step" ||
    libraryId === "custom-form" ||
    libraryId === "record-selection" ||
    step.step_type === "custom_question"
  ) {
    return isApplicantWaitingGateStep(step) ? "waiting_gate" : "checkbox_confirmation";
  }
  if (isApplicantWaitingGateStep(step)) return "waiting_gate";
  return "unsupported";
}

export function previewAudienceLabel(owner: string, libraryId: string, kind: StepPreviewKind): string {
  const value = owner.trim().toLowerCase();
  if (value.includes("facility")) return "Facility Preview";
  if (value.includes("manager")) return "Manager Preview";
  if (
    value.includes("hr") ||
    value.includes("admin") ||
    value.includes("recruiter") ||
    value.includes("internal")
  ) {
    return "Admin Preview";
  }
  if (CANDIDATE_KINDS.has(kind)) return "Candidate Preview";
  if (libraryId === "manager-facility-approval") return "Manager Preview";
  if (kind === "approval") return "Admin Preview";
  return isApplicantCompletionOwner(owner) ? "Candidate Preview" : "Admin Preview";
}

export function previewStatesForKind(kind: StepPreviewKind): StepPreviewState[] {
  if (kind === "unsupported" || kind === "notification") return ["default"];
  if (kind === "approval" || kind === "screening" || kind === "waiting_gate") {
    return ["default", "pending_approval", "approved", "rejected", "error"];
  }
  if (kind === "offer_acceptance") {
    return ["default", "filled", "completed", "rejected", "error"];
  }
  return ["default", "empty", "filled", "completed", "error"];
}

export const STEP_PREVIEW_STATE_LABELS: Record<StepPreviewState, string> = {
  default: "Default",
  empty: "Empty",
  filled: "Filled / sample data",
  completed: "Completed",
  pending_approval: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
  error: "Error / validation",
};

function documentsForDraft(draft: OnboardingStepDraft | undefined): StepPreviewDocument[] {
  const fromDraft = (draft?.required_documents ?? [])
    .map((doc) => ({
      title: doc.title.trim() || "Required document",
      description: doc.description?.trim() || "",
      is_required: doc.is_required !== false,
    }))
    .filter((doc) => doc.title);
  if (fromDraft.length) return fromDraft;
  const fallback = createStepDraftForType(draft?.step_type ?? "document_upload", []);
  return fallback.required_documents
    .map((doc) => ({
      title: doc.title.trim() || "Required document",
      description: doc.description?.trim() || "",
      is_required: doc.is_required !== false,
    }))
    .filter((doc) => doc.title);
}

/** SSN / Identity Verification shows the same cards the candidate uploads on apply. */
export function isSsnIdentityPreview(libraryId: string, stepType: string, stepKey: string): boolean {
  return (
    libraryId === "ssn-identity-verification" ||
    stepType === "ssn-identity-verification" ||
    stepKey === "ssn-identity-verification"
  );
}

/** Credential / license steps that use Settings → profession document catalogs at runtime. */
export function stepPreviewUsesProfessionDocuments(
  libraryId: string,
  stepType: string
): boolean {
  return (
    stepType === "professional_license" ||
    libraryId === "credential-license-verification" ||
    libraryId === "certification-upload" ||
    libraryId === "collect-extra-files"
  );
}

/** Map Settings profession docs the same way applicant load attaches them. */
export function mapProfessionDocumentsToPreview(
  documents: ProfessionUploadDocument[]
): StepPreviewDocument[] {
  return [...documents]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((doc) => ({
      title: doc.name,
      description: professionDocumentKindLabel(doc.documentKind),
      is_required: doc.isRequired !== false,
    }))
    .filter((doc) => doc.title.trim());
}

export function buildStepPreviewModel(
  state: WorkflowState,
  selectedNode: Node<WorkflowNodeData> | Node<WorkflowCanvasNodeData> | null
): StepPreviewModel | null {
  if (!selectedNode || !isStepNode(selectedNode)) return null;

  const serialized = serializeWorkflowState(state.nodes, state.edges);
  const drafts = workflowStateToStepDrafts(serialized);
  const selectedDraft =
    drafts.find((draft) => draft.metadata?.workflow_node_id === selectedNode.id) ??
    drafts.find((draft) => draft.metadata?.workflow_step_id === selectedNode.data.stepId);

  const steps = drafts.map(draftToTenantStep);
  const selectedStep =
    steps.find((step) => step.metadata?.workflow_node_id === selectedNode.id) ??
    (selectedDraft ? draftToTenantStep(selectedDraft, 0) : null);

  if (!selectedStep) return null;

  const settings = getWorkflowSettings(selectedStep);
  const libraryId = readLibraryId(selectedStep) || selectedNode.data.stepId;
  const kind = resolveStepPreviewKind(selectedStep, libraryId);
  const lifecycle = parseWorkflowTemplatePhase(settings.phase);
  const copy = applicantPortalCopy(lifecycle === "post_hire" ? "post_hire" : "pre_hire");
  const visibleSteps = steps.filter((step) => isWorkerVisibleStep(step));
  const stepperSource = visibleSteps.length ? visibleSteps : [selectedStep];
  const stepperSteps: StepPreviewStepperItem[] = stepperSource.map((step) => ({
    id: step.id,
    title: step.title,
    current: step.id === selectedStep.id || step.step_key === selectedStep.step_key,
    phase: readStepLifecyclePhase(step),
    required: step.is_required !== false,
    stepType: step.step_type,
  }));
  const grouped = groupTenantStepsByPhase(stepperSource);
  const preHireSteps = stepperSteps.filter((step) => step.phase === "pre_hire");
  const postHireSteps = stepperSteps.filter((step) => step.phase === "post_hire");
  const selectedPhase: EmploymentLifecyclePhase =
    lifecycle === "post_hire" ? "post_hire" : "pre_hire";

  return {
    step: selectedStep,
    settings,
    libraryId,
    kind,
    audienceLabel: previewAudienceLabel(settings.completionOwner, libraryId, kind),
    isConditional: settings.isConditional === true,
    isApplicantFacing: CANDIDATE_KINDS.has(kind) && isWorkerVisibleStep(selectedStep),
    availableStates: previewStatesForKind(kind),
    requiredDocuments: documentsForDraft(selectedDraft),
    firmaTemplateName: stepUsesFirmaSigning(selectedStep)
      ? settings.firmaRecruiterTemplateName?.trim() || "Attached e-sign template"
      : settings.firmaRecruiterTemplateName?.trim() || null,
    stepperSteps,
    preHireSteps,
    postHireSteps,
    selectedPhase,
    prompt: readPrompt(selectedStep),
    header: copy.header,
    progressLabel: copy.progressLabel,
    preHireProgressLabel: formatPhaseProgressShort(0, grouped.preHire.length, "pre_hire"),
    postHireProgressLabel: formatPhaseProgressShort(0, grouped.postHire.length, "post_hire"),
  };
}

export function coercePreviewState(
  requested: StepPreviewState | null | undefined,
  available: StepPreviewState[]
): StepPreviewState {
  if (requested && available.includes(requested)) return requested;
  return available[0] ?? "default";
}

import type { OnboardingDbClient } from "@/lib/onboarding/load-tenant-config";
import { loadTenantOnboardingConfig } from "@/lib/onboarding/load-tenant-config";
import {
  getOnboardingFlowById,
  resolvePublishedWorkerOnboardingFlow,
} from "@/lib/onboarding/onboarding-flows";
import { projectCandidateOnboardingConfig } from "@/lib/onboarding/candidate-onboarding-projection";
import { workflowStateToStepDrafts } from "@/lib/onboarding/workflow-to-drafts";
import { enforceUploadResumeFirstInWorkflowState } from "@/lib/onboarding/normalize-builder-workflow";
import {
  isSerializableWorkflowState,
  type SerializableWorkflowState,
} from "@/lib/onboarding/workflow-builder-serialization";
import { normalizeJobToken } from "@/lib/jobs/public-application-routing";
import { resolvePublicTenant } from "@/lib/jobs/tenant";
import {
  JobApplicationGateError,
  validatePublishedJobForApplication,
} from "@/lib/jobs/validate-job-application";
import type { OnboardingStepDraft } from "@/lib/onboarding/default-onboarding-steps";
import { isPreviewOnboardingStepId } from "@/lib/onboarding/load-applicant-draft-config";
import type {
  TenantOnboardingConfig,
  TenantOnboardingStep,
  TenantRequiredDocument,
} from "@/lib/onboarding/types";
import type { WorkflowDocumentRow } from "@/lib/professions/service";
import { attachPublishedSkillAssessmentToConfig } from "@/lib/skill-assessment/load-settings";

function workflowNodeId(meta: Record<string, unknown> | undefined): string | null {
  const value = meta?.workflow_node_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function workflowStepId(meta: Record<string, unknown> | undefined): string | null {
  const value = meta?.workflow_step_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Prefer real published step UUIDs so progress FK writes keep working. */
export function matchPublishedStepForJobDraft(
  publishedSteps: TenantOnboardingStep[],
  draft: OnboardingStepDraft,
  usedIds: Set<string>
): TenantOnboardingStep | null {
  const available = publishedSteps.filter((step) => !usedIds.has(step.id));

  const draftNodeId = workflowNodeId(draft.metadata);
  if (draftNodeId) {
    const byNode = available.find((step) => workflowNodeId(step.metadata) === draftNodeId);
    if (byNode) return byNode;
  }

  const draftWorkflowStepId = workflowStepId(draft.metadata);
  if (draftWorkflowStepId) {
    const byWorkflowStep = available.find(
      (step) => workflowStepId(step.metadata) === draftWorkflowStepId
    );
    if (byWorkflowStep) return byWorkflowStep;
  }

  const byKey = available.find((step) => step.step_key === draft.step_key);
  if (byKey) return byKey;

  // Numbered keys and step-type guesses must not collapse two different library
  // steps (for example Collect references and Background check) onto one row.
  const sameLibrary = (step: TenantOnboardingStep) => {
    const stepLibraryId = workflowStepId(step.metadata);
    if (!draftWorkflowStepId || !stepLibraryId) return true;
    return stepLibraryId === draftWorkflowStepId;
  };

  const draftBase = draft.step_key.replace(/_\d+$/, "");
  const byBaseKey = available.find(
    (step) => sameLibrary(step) && step.step_key.replace(/_\d+$/, "") === draftBase
  );
  if (byBaseKey) return byBaseKey;

  return available.find((step) => sameLibrary(step) && step.step_type === draft.step_type) ?? null;
}

/** Drafts that have no real tenant step yet. Preview ids are not persistable progress targets. */
export function unmatchedJobWorkflowDrafts(
  publishedSteps: TenantOnboardingStep[],
  drafts: OnboardingStepDraft[]
): OnboardingStepDraft[] {
  const realSteps = publishedSteps.filter((step) => !isPreviewOnboardingStepId(step.id));
  const usedIds = new Set<string>();
  return drafts.filter((draft) => {
    const matched = matchPublishedStepForJobDraft(realSteps, draft, usedIds);
    if (!matched) return true;
    usedIds.add(matched.id);
    return false;
  });
}

/**
 * Builds applicant-facing config from a job's published onboarding flow canvas.
 * Step order/titles/settings come from the flow; IDs reuse published tenant steps when possible.
 */
export function configFromJobWorkflowDraft(
  published: TenantOnboardingConfig,
  builderDraft: SerializableWorkflowState
): TenantOnboardingConfig {
  const normalizedDraft = enforceUploadResumeFirstInWorkflowState(builderDraft, []);
  const stepDrafts = workflowStateToStepDrafts(normalizedDraft, []).filter(
    (step) => step.is_enabled !== false
  );

  const usedIds = new Set<string>();
  const steps: TenantOnboardingStep[] = stepDrafts.map((draft, index) => {
    const matched = matchPublishedStepForJobDraft(published.steps, draft, usedIds);
    if (matched) usedIds.add(matched.id);

    return {
      id: matched?.id ?? `preview-${draft.step_key}`,
      step_key: draft.step_key,
      title: draft.title,
      description: draft.description?.trim() || null,
      step_type: draft.step_type,
      sort_order: draft.sort_order ?? (index + 1) * 10,
      is_required: draft.is_required,
      is_enabled: true,
      metadata: draft.metadata ?? {},
    };
  });

  const publishedIdToJobId = new Map<string, string>();
  for (const step of steps) {
    if (!step.id.startsWith("preview-")) {
      publishedIdToJobId.set(step.id, step.id);
    }
  }

  return {
    ...published,
    steps,
    requiredDocuments: published.requiredDocuments
      .filter((doc) => publishedIdToJobId.has(doc.onboarding_step_id))
      .map((doc) => ({
        ...doc,
        onboarding_step_id: publishedIdToJobId.get(doc.onboarding_step_id)!,
      })),
    skillAssessments: published.skillAssessments
      .filter((assessment) => publishedIdToJobId.has(assessment.onboarding_step_id))
      .map((assessment) => ({
        ...assessment,
        onboarding_step_id: publishedIdToJobId.get(assessment.onboarding_step_id)!,
      })),
  };
}

export function attachWorkflowDocuments(
  config: TenantOnboardingConfig,
  documents: WorkflowDocumentRow[]
): TenantOnboardingConfig {
  const active = documents.filter((doc) => doc.is_active);
  if (!active.length) return config;

  const step =
    config.steps.find((item) => item.step_type === "professional_license") ??
    config.steps.find((item) => item.step_type === "document_upload");
  if (!step) return config;

  const mapped: TenantRequiredDocument[] = active.map((doc) => ({
    id: doc.id,
    onboarding_step_id: step.id,
    title: doc.name,
    description: null,
    is_required: doc.is_required,
    sort_order: doc.sort_order,
    accepted_file_types: ["pdf", "png", "jpg", "jpeg", "webp"],
    max_file_size_mb: 10,
    source: "workflow",
    code: doc.code,
    has_expiration: doc.has_expiration,
    collect_issuing_organization: doc.collect_issuing_organization,
    collect_scope: doc.collect_scope,
    collect_validity: doc.collect_validity,
  }));

  return {
    ...config,
    requiredDocuments: [
      ...config.requiredDocuments.filter((doc) => doc.onboarding_step_id !== step.id),
      ...mapped,
    ],
  };
}

export type JobWorkflowConfigResult = {
  config: TenantOnboardingConfig;
  tenantId: string;
  tenantSlug: string;
  workflowId: string;
  workflowName: string;
  jobToken: string;
};

export type TenantDefaultWorkflowConfigResult = {
  config: TenantOnboardingConfig;
  tenantId: string;
  tenantSlug: string;
  workflowId: string;
  workflowName: string;
};

async function loadApplicantConfigFromFlow(
  supabase: OnboardingDbClient,
  tenantId: string,
  flow: {
    id: string;
    name: string;
    builderDraft: SerializableWorkflowState | null;
  },
  unavailableMessage: string
): Promise<{
  config: TenantOnboardingConfig;
  workflowId: string;
  workflowName: string;
}> {
  if (!isSerializableWorkflowState(flow.builderDraft) || !flow.builderDraft.nodes.length) {
    throw new JobApplicationGateError(unavailableMessage, "WORKFLOW_DRAFT_MISSING");
  }

  const published = await loadTenantOnboardingConfig(supabase, tenantId, {
    workerFacing: false,
  });
  if (!published) {
    throw new JobApplicationGateError(
      "Onboarding configuration is missing for this organization.",
      "TENANT_CONFIG_MISSING"
    );
  }

  const stepDrafts = workflowStateToStepDrafts(
    enforceUploadResumeFirstInWorkflowState(flow.builderDraft, []),
    []
  ).filter((step) => step.is_enabled !== false);
  const { ensureJobWorkflowStepAnchors } = await import(
    "@/lib/onboarding/ensure-job-workflow-step-anchors"
  );
  const anchoredPublished = await ensureJobWorkflowStepAnchors(supabase, published, stepDrafts);
  const fromFlow = configFromJobWorkflowDraft(anchoredPublished, flow.builderDraft);
  const candidatePreview = projectCandidateOnboardingConfig(fromFlow);
  if (!candidatePreview.steps.length) {
    throw new JobApplicationGateError(
      "This workflow has no applicant steps.",
      "WORKFLOW_EMPTY"
    );
  }

  const withSkills = await attachPublishedSkillAssessmentToConfig(supabase, tenantId, fromFlow);
  let config = withSkills;
  let attachedProfessionDocuments = false;
  try {
    const { attachProfessionDocuments, listActiveProfessionDocuments, readFlowProfessionId } =
      await import("@/lib/professions/profession-documents");
    const professionId = await readFlowProfessionId(supabase, tenantId, flow.id);
    if (professionId) {
      const professionDocuments = await listActiveProfessionDocuments(supabase, tenantId, professionId);
      if (professionDocuments.length) {
        config = attachProfessionDocuments(withSkills, professionDocuments);
        attachedProfessionDocuments = true;
      }
    }
  } catch {
    config = withSkills;
  }
  if (!attachedProfessionDocuments) {
    try {
      const { listFlowDocuments } = await import("@/lib/professions/service");
      const documents = await listFlowDocuments(supabase, tenantId, flow.id);
      config = attachWorkflowDocuments(withSkills, documents);
    } catch {
      config = withSkills;
    }
  }

  return {
    config,
    workflowId: flow.id,
    workflowName: flow.name,
  };
}

async function loadWorkerOnboardingApplicantConfig(
  supabase: OnboardingDbClient,
  tenantId: string
): Promise<{
  config: TenantOnboardingConfig;
  workflowId: string;
  workflowName: string;
}> {
  let flow;
  try {
    flow = await resolvePublishedWorkerOnboardingFlow(supabase, tenantId);
  } catch (error) {
    throw new JobApplicationGateError(
      error instanceof Error
        ? error.message
        : "Worker Onboarding workflow is unavailable.",
      "WORKFLOW_UNAVAILABLE"
    );
  }

  return loadApplicantConfigFromFlow(
    supabase,
    tenantId,
    flow,
    "Worker Onboarding workflow is unavailable."
  );
}

/**
 * Applicant steps when starting without a job token (new tenant / no open jobs).
 * Uses Worker Onboarding as the tenant fallback.
 */
export async function loadApplicantConfigForTenantDefault(
  supabase: OnboardingDbClient,
  tenantSlugInput: string | null | undefined
): Promise<TenantDefaultWorkflowConfigResult> {
  const tenant = await resolvePublicTenant(supabase as never, tenantSlugInput);
  if (!tenant) {
    throw new JobApplicationGateError("This organization was not found.", "TENANT_NOT_FOUND");
  }

  const loaded = await loadWorkerOnboardingApplicantConfig(supabase, tenant.id);
  return {
    ...loaded,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
  };
}

/**
 * Resolve applicant onboarding steps for a published job.
 * Uses the workflow assigned to the job (`job.workflow_id`).
 */
export async function loadApplicantConfigForJobToken(
  supabase: OnboardingDbClient,
  tenantSlug: string | null | undefined,
  jobTokenInput: string | null | undefined
): Promise<JobWorkflowConfigResult> {
  const jobToken = normalizeJobToken(jobTokenInput);
  if (!jobToken) {
    throw new JobApplicationGateError(
      "A job must be selected before starting an application.",
      "JOB_TOKEN_REQUIRED"
    );
  }

  const validated = await validatePublishedJobForApplication(supabase, tenantSlug, jobToken);
  const flow = await getOnboardingFlowById(supabase, validated.tenantId, validated.workflowId);
  if (!flow || flow.status !== "published") {
    throw new JobApplicationGateError(
      "The workflow assigned to this job is unavailable.",
      "WORKFLOW_UNAVAILABLE"
    );
  }

  const loaded = await loadApplicantConfigFromFlow(
    supabase,
    validated.tenantId,
    flow,
    "The workflow assigned to this job is unavailable."
  );

  return {
    ...loaded,
    tenantId: validated.tenantId,
    tenantSlug: validated.tenantSlug,
    jobToken: validated.jobToken,
  };
}

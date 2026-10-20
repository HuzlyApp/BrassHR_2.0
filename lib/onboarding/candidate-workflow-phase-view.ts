import type { SupabaseClient } from "@supabase/supabase-js";
import { isCandidateAlreadyConverted } from "@/lib/admin/convert-candidate-to-worker";
import type { AdminAttachmentRequirement } from "@/lib/onboarding/build-admin-attachment-requirements";
import { loadAdminAttachmentRequirements } from "@/lib/onboarding/load-admin-attachment-requirements";
import { loadTenantOnboardingConfig } from "@/lib/onboarding/load-tenant-config";
import {
  canRevealPostHire,
  canRevealPostHireForStaffJourney,
  hasCompletedAgreementEsignStep,
} from "@/lib/onboarding/lock-post-hire";

import { resolveCandidateHireGate } from "@/lib/onboarding/resolve-candidate-hire-gate";
import {
  type EmploymentJourneyStage,
  type EmploymentLifecyclePhase,
  type PhaseProgressCounts,
  resolveEmploymentJourneyStage,
} from "@/lib/onboarding/workflow-phase-groups";
import {
  ASSIGNED_STEP_RECORD_COLUMNS,
  type CandidateWorkflowAssignmentView,
  type MappedAssignedStep,
  buildPhaseAssignment,
  countsFromAssignedSteps,
  enrichAssignedStepsDisplayFromEvidence,
  hasRequiredIdentityDocuments,
  mapAssignedStepRecords,
  resolveAssignmentSource,
  sanitizeTagsForClient,
  toAssignedStepRecordInput,
} from "@/lib/onboarding/assigned-workflow-steps";
import {
  SCOPED_STEP_PROGRESS_SELECT,
  type ScopedProgressRow,
  loadApplicationProgressIds,
  pickStepProgressRows,
} from "@/lib/onboarding/scoped-step-progress";
import { carryOverReplacedStepProgressSafely } from "@/lib/onboarding/replaced-step-progress";
import {
  RECRUITER_SCREENING_STEP_TYPE,
  applicationQuickMatchRan,
  applyQuickMatchScreeningProgress,
} from "@/lib/onboarding/recruiter-screening-progress";
import { isParameterizedJobApplicationStepType } from "@/lib/onboarding/job-application-parameters";
import { loadJobApplicationStepView } from "@/lib/onboarding/job-application-step";
import { applyParameterizedJobApplicationStepEvidence } from "@/lib/onboarding/parameterized-job-application-progress";
import {
  syncActiveWorkflowInstancesSafely,
  workflowDraftHasNewSteps,
} from "@/lib/onboarding/sync-workflow-instances";

export type { CandidateWorkflowAssignmentView } from "@/lib/onboarding/assigned-workflow-steps";

export type CandidateWorkflowTag = {
  id: string;
  workflowName: string;
  workflowType: string | null;
  phase: EmploymentLifecyclePhase | "both";
  version: string | null;
  assignedAt: string | null;
  assignmentState: "active" | "completed" | "replaced" | "archived";
  active: boolean;
};

export type CandidateWorkflowStepView = MappedAssignedStep;

export type CandidateWorkflowDocumentView = AdminAttachmentRequirement & {
  stepTitle: string;
};

export type CandidateWorkflowPhaseBlock = {
  assigned: boolean;
  progress: PhaseProgressCounts;
  steps: CandidateWorkflowStepView[];
  documents: CandidateWorkflowDocumentView[];
  assignment: CandidateWorkflowAssignmentView | null;
};

export type CandidateWorkflowPhaseView = {
  currentStage: EmploymentJourneyStage;
  isHired: boolean;
  hiredAt: string | null;
  hiredBy: string | null;
  postHireVisible: boolean;
  /** False when the assigned workflow has no post-hire steps, so staff UI hides Post-Hire entirely. */
  workflowHasPostHireSteps: boolean;
  postHireUnlocked: boolean;
  postHireLocked: boolean;
  postHireSuspended: boolean;
  postHireActivationFailed: boolean;
  phaseStartedAt: string | null;
  workflowPhase: "pre_hire" | "post_hire" | "completed";
  currentWorkflowName: string | null;
  currentStepTitle: string | null;
  tags: CandidateWorkflowTag[];
  preHire: CandidateWorkflowPhaseBlock;
  postHire: CandidateWorkflowPhaseBlock | null;
};

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function assignmentStateOf(value: unknown): CandidateWorkflowTag["assignmentState"] {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "replaced" || raw === "archived" || raw === "completed") return raw;
  return "active";
}

function instanceHasPhase(
  records: Array<{ phase: EmploymentLifecyclePhase }>,
  phase: EmploymentLifecyclePhase
): boolean {
  return records.some((row) => row.phase === phase);
}

/**
 * A Manual Task / HR Action added on the canvas (and renamed, for example to
 * "Recruiter Offer Call") is missing from hire journey until the candidate's
 * step records include that node. Pull those steps from the saved flow.
 */
async function syncMissingFlowSteps(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    instances: Array<Record<string, unknown>>;
    records: Array<Record<string, unknown>>;
  }
): Promise<boolean> {
  const active =
    params.instances.find((row) => assignmentStateOf(row.assignment_state ?? row.status) === "active") ??
    params.instances[0] ??
    null;
  const activeId = asText(active?.id);
  const flowId = asText(active?.workflow_id) ?? asText(active?.onboarding_flow_id);
  if (!activeId || !flowId) return false;

  const { data: flow, error } = await supabase
    .from("onboarding_flows")
    .select("name, builder_draft")
    .eq("tenant_id", params.tenantId)
    .eq("id", flowId)
    .maybeSingle();
  if (error || !flow?.builder_draft) return false;

  const recordIds = params.records
    .filter((row) => asText(row.workflow_instance_id) === activeId)
    .map((row) => asText(row.snapshot_step_id))
    .filter((id): id is string => Boolean(id));
  if (!workflowDraftHasNewSteps(recordIds, flow.builder_draft)) return false;

  await syncActiveWorkflowInstancesSafely(supabase, {
    tenantId: params.tenantId,
    flowId,
    draft: flow.builder_draft,
    flowName: asText(flow.name),
  });
  return true;
}

async function loadStepRecords(
  supabase: SupabaseClient,
  tenantId: string,
  instanceIds: string[]
): Promise<Array<Record<string, unknown>>> {
  if (!instanceIds.length) return [];
  const { data, error } = await supabase
    .from("applicant_workflow_step_records")
    .select(ASSIGNED_STEP_RECORD_COLUMNS)
    .eq("tenant_id", tenantId)
    .in("workflow_instance_id", instanceIds)
    .order("position", { ascending: true });
  if (error && !/does not exist/i.test(error.message)) throw error;
  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function loadCandidateWorkflowPhaseView(
  supabase: SupabaseClient,
  params: {
    workerId: string;
    tenantId: string;
    resumeUrl?: string | null;
    resumePath?: string | null;
    resumePathRaw?: string | null;
    legacyUrls?: {
      nursing_license_url: string | null;
      tb_test_url: string | null;
      cpr_certification_url: string | null;
      authorization_document_url: string | null;
    };
  }
): Promise<CandidateWorkflowPhaseView> {
  const { workerId, tenantId } = params;

  await carryOverReplacedStepProgressSafely(supabase, { tenantId, workerId });

  const [
    applicationsRes,
    instancesRes,
    workerRes,
    config,
    progressRes,
    mappingsRes,
    resumeRes,
    identityDocsRes,
  ] = await Promise.all([
    supabase
      .from("job_applications")
      .select(
        "id, status, status_id, workflow_phase, post_hire_activated_at, post_hire_suspended_at, hired_at, hired_by, created_at, updated_at, workflow_id, applicant_workflow_instance_id"
      )
      .eq("tenant_id", tenantId)
      .eq("worker_id", workerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("applicant_workflow_instances")
      .select(
        "id, workflow_id, workflow_name, workflow_version, status, assignment_state, started_at, created_at, completed_at, post_hire_unlocked_at, pre_hire_completed_at, application_id, onboarding_flow_id, conversion_status, converted_worker_id, converted_at"
      )
      .eq("tenant_id", tenantId)
      .eq("worker_id", workerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("worker")
      .select("status, converted_at, converted_worker_type, converted_worker_id, conversion_status")
      .eq("id", workerId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    loadTenantOnboardingConfig(supabase, tenantId, { workerFacing: false }),
    supabase
      .from("worker_onboarding_step_progress")
      .select(SCOPED_STEP_PROGRESS_SELECT)
      .eq("tenant_id", tenantId)
      .eq("worker_id", workerId),
    supabase.from("workflow_mappings").select("workflow_id").eq("tenant_id", tenantId).eq("is_active", true),
    supabase
      .from("worker_resumes")
      .select("id, uploaded_at, storage_path, file_url")
      .eq("tenant_id", tenantId)
      .eq("worker_id", workerId)
      .is("deleted_at", null)
      .order("uploaded_at", { ascending: false })
      .limit(1),
    supabase.from("worker_documents").select("*").eq("worker_id", workerId).limit(1),
  ]);

  if (applicationsRes.error && !/hired_at|post_hire_suspended_at|does not exist/i.test(applicationsRes.error.message)) {
    throw applicationsRes.error;
  }
  if (instancesRes.error && !/assignment_state|does not exist/i.test(instancesRes.error.message)) {
    throw instancesRes.error;
  }

  const applications = (applicationsRes.data ?? []) as Array<Record<string, unknown>>;
  const instances = (instancesRes.data ?? []) as Array<Record<string, unknown>>;
  const primaryApp = applications[0] ?? null;
  const hireGate = resolveCandidateHireGate(applications);
  const isHired = hireGate.isHired;
  const workflowPhase = hireGate.workflowPhase;
  const postHireUnlockedAt = hireGate.postHireUnlockedAt;
  const postHireSuspended = hireGate.postHireSuspended;
  const postHireUnlocked = hireGate.postHireUnlocked;
  const postHireActivationFailed = hireGate.postHireActivationFailed;

  const workerRow = (workerRes.data ?? {}) as Record<string, unknown>;
  const convertedVisible = canRevealPostHire({
    workerStatus: asText(workerRow.status),
    convertedAt: asText(workerRow.converted_at),
    convertedWorkerId: asText(workerRow.converted_worker_id),
    conversionStatus: asText(workerRow.conversion_status),
  });

  const instanceIds = instances.map((row) => asText(row.id)).filter((id): id is string => Boolean(id));
  let stepRecords = await loadStepRecords(supabase, tenantId, instanceIds);
  const synced = await syncMissingFlowSteps(supabase, { tenantId, instances, records: stepRecords }).catch(
    (error) => {
      console.warn("[workflow-phases] could not add new workflow steps", error);
      return false;
    }
  );
  if (synced) {
    stepRecords = await loadStepRecords(supabase, tenantId, instanceIds);
  }

  const activeInstance =
    instances.find((row) => assignmentStateOf(row.assignment_state ?? row.status) === "active") ??
    instances[0] ??
    null;
  const activeInstanceId = asText(activeInstance?.id);
  const activeRecords = stepRecords.filter((row) => asText(row.workflow_instance_id) === activeInstanceId);
  const activeApplicationId =
    asText(activeInstance?.application_id) ??
    asText(
      applications.find(
        (row) => activeInstanceId && asText(row.applicant_workflow_instance_id) === activeInstanceId
      )?.id
    );
  const progressByStepId = pickStepProgressRows(
    (progressRes.data ?? []) as ScopedProgressRow[],
    await loadApplicationProgressIds(supabase, {
      tenantId,
      workerId,
      applicationId: activeApplicationId,
    })
  );

  const tenantSteps = config?.steps ?? [];
  const latestResume = ((resumeRes.data ?? []) as Array<Record<string, unknown>>)[0] ?? null;
  const hasResumeUpload = Boolean(
    params.resumeUrl?.trim() ||
      params.resumePath?.trim() ||
      asText(latestResume?.storage_path) ||
      asText(latestResume?.file_url) ||
      asText(latestResume?.id)
  );

  let mappedSteps = mapAssignedStepRecords({
    records: activeRecords.map(toAssignedStepRecordInput),
    tenantSteps,
    progressByStepId,
    assignedAt: asText(activeInstance?.started_at) ?? asText(activeInstance?.created_at),
    applicationId: activeApplicationId,
  });

  if (
    activeApplicationId &&
    mappedSteps.some((step) => isParameterizedJobApplicationStepType(step.stepType))
  ) {
    const jobApplication = await loadJobApplicationStepView(supabase, {
      tenantId,
      applicationId: activeApplicationId,
    }).catch(() => null);
    mappedSteps = applyParameterizedJobApplicationStepEvidence({
      steps: mappedSteps,
      progressByStepId,
      applicationId: activeApplicationId,
      jobApplication,
    });
  }

  const documents = await loadAdminAttachmentRequirements({
    supabase,
    workerId,
    tenantId,
    resumeUrl:
      params.resumeUrl ??
      (hasResumeUpload ? asText(latestResume?.file_url) || "resume-uploaded" : null),
    resumePath: params.resumePath ?? asText(latestResume?.storage_path),
    resumePathRaw: params.resumePathRaw ?? asText(latestResume?.storage_path),
    legacyUrls: params.legacyUrls ?? {
      nursing_license_url: null,
      tb_test_url: null,
      cpr_certification_url: null,
      authorization_document_url: null,
    },
  }).catch(() => [] as AdminAttachmentRequirement[]);

  const documentStatusByStepKey = new Map<string, string | null | undefined>();
  for (const doc of documents) {
    const key = asText(doc.step_key);
    const status = asText(doc.status);
    if (!key || !status) continue;
    if (!documentStatusByStepKey.has(key)) documentStatusByStepKey.set(key, status);
  }

  const identityDocsRow = ((identityDocsRes.data ?? []) as Array<Record<string, unknown>>)[0] ?? null;
  const identityDocsTenant = asText(identityDocsRow?.tenant_id);
  mappedSteps = enrichAssignedStepsDisplayFromEvidence({
    steps: mappedSteps,
    documentStatusByStepKey,
    hasResumeUpload,
    hasIdentityDocuments:
      (!identityDocsTenant || identityDocsTenant === tenantId) &&
      hasRequiredIdentityDocuments(identityDocsRow),
  });
  if (mappedSteps.some((step) => step.stepType === RECRUITER_SCREENING_STEP_TYPE)) {
    mappedSteps = applyQuickMatchScreeningProgress(
      mappedSteps,
      await applicationQuickMatchRan(supabase, { tenantId, applicationId: activeApplicationId })
    );
  }

  const preHireSteps = mappedSteps.filter((step) => step.phase === "pre_hire");
  const postHireSteps = mappedSteps.filter((step) => step.phase === "post_hire");
  const postHireVisible = canRevealPostHireForStaffJourney({
    convertedVisible,
    applicationHired: isHired,
    preHireSteps,
  });

  const mappedWorkflowIds = ((mappingsRes.data ?? []) as Array<{ workflow_id?: string }>)
    .map((row) => asText(row.workflow_id))
    .filter((id): id is string => Boolean(id));
  const assignmentSource = resolveAssignmentSource({
    workflowId: asText(activeInstance?.workflow_id) ?? asText(activeInstance?.onboarding_flow_id),
    mappedWorkflowIds,
  });

  const flowIds = [
    ...new Set(
      instances
        .map((row) => asText(row.workflow_id) ?? asText(row.onboarding_flow_id))
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const flowsById = new Map<
    string,
    { name: string | null; employment_type: string | null; version: number | null }
  >();
  if (flowIds.length) {
    const { data: flows } = await supabase
      .from("onboarding_flows")
      .select("id, name, employment_type, version")
      .eq("tenant_id", tenantId)
      .in("id", flowIds);
    for (const flow of flows ?? []) {
      const row = flow as {
        id: string;
        name?: string | null;
        employment_type?: string | null;
        version?: number | null;
      };
      flowsById.set(String(row.id), {
        name: asText(row.name),
        employment_type: asText(row.employment_type),
        version: typeof row.version === "number" ? row.version : null,
      });
    }
  }

  const recordsByInstance = new Map<string, CandidateWorkflowStepView[]>();
  for (const record of stepRecords) {
    const instanceId = asText(record.workflow_instance_id);
    if (!instanceId) continue;
    const list = recordsByInstance.get(instanceId) ?? [];
    const phase =
      asText(record.phase) === "post_hire"
        ? "post_hire"
        : ("pre_hire" as EmploymentLifecyclePhase);
    list.push({
      id: String(record.id),
      snapshotStepId: String(record.snapshot_step_id ?? ""),
      tenantStepId: null,
      title: String(record.title ?? "Step"),
      stepKey: String(record.snapshot_step_id ?? ""),
      stepType: String(record.step_type ?? ""),
      onboardingType: "custom_question",
      phase,
      required: record.is_required !== false,
      status: "pending",
      displayStatus: "not_started",
      inspectable: true,
      unmatched: false,
      assignedAt: asText(record.created_at),
      completedAt: asText(record.completed_at),
    });
    recordsByInstance.set(instanceId, list);
  }

  const tags: CandidateWorkflowTag[] = instances.map((row, index) => {
    const workflowId = asText(row.workflow_id) ?? asText(row.onboarding_flow_id);
    const flow = workflowId ? flowsById.get(workflowId) : null;
    const assignmentState = assignmentStateOf(row.assignment_state ?? row.status);
    const name = asText(row.workflow_name) || flow?.name || "Workflow";
    const instanceSteps = recordsByInstance.get(asText(row.id) ?? "") ?? [];
    const hasPre = instanceHasPhase(instanceSteps, "pre_hire") || (row === activeInstance && preHireSteps.length > 0);
    const hasPost = instanceHasPhase(instanceSteps, "post_hire") || (row === activeInstance && postHireSteps.length > 0);
    return {
      id: asText(row.id) || `tag-${index}`,
      workflowName: name,
      workflowType: flow?.employment_type ?? null,
      phase: hasPre && hasPost ? "both" : hasPost ? "post_hire" : "pre_hire",
      version: asText(row.workflow_version) ?? (flow?.version != null ? String(flow.version) : null),
      assignedAt: asText(row.started_at) ?? asText(row.created_at),
      assignmentState,
      active:
        assignmentState === "active" &&
        !instances
          .slice(0, index)
          .some((prior) => assignmentStateOf(prior.assignment_state ?? prior.status) === "active"),
    };
  });

  const assignedAt = asText(activeInstance?.started_at) ?? asText(activeInstance?.created_at);
  const workflowName =
    asText(activeInstance?.workflow_name) ||
    (asText(activeInstance?.workflow_id)
      ? flowsById.get(asText(activeInstance?.workflow_id) ?? "")?.name
      : null) ||
    tags.find((tag) => tag.active)?.workflowName ||
    null;
  const workflowVersion = asText(activeInstance?.workflow_version);

  const toDocumentView = (doc: AdminAttachmentRequirement): CandidateWorkflowDocumentView => ({
    ...doc,
    stepTitle: doc.step_title?.trim() || doc.title,
  });

  const stepIds = new Set(mappedSteps.map((step) => step.tenantStepId).filter((id): id is string => Boolean(id)));
  const stepKeys = new Set(mappedSteps.map((step) => step.stepKey));
  const documentsForPhase = (phase: EmploymentLifecyclePhase, steps: CandidateWorkflowStepView[]) => {
    const ids = new Set(steps.map((step) => step.tenantStepId).filter((id): id is string => Boolean(id)));
    const keys = new Set(steps.map((step) => step.stepKey));
    return documents
      .filter((doc) => {
        if (doc.phase !== phase) return false;
        if (ids.size && doc.required_document_id) {
          const tenantDocStep = steps.find((step) => step.stepKey === doc.step_key);
          if (tenantDocStep) return true;
        }
        return keys.has(doc.step_key) || stepKeys.has(doc.step_key) || stepIds.has(doc.id);
      })
      .map(toDocumentView);
  };

  const preHireAssignment =
    preHireSteps.length || workflowName
      ? buildPhaseAssignment({
          workflowName,
          version: workflowVersion,
          assignedAt,
          assignmentSource,
          phase: "pre_hire",
          steps: preHireSteps,
        })
      : null;
  const postHireAssignment =
    postHireSteps.length || workflowName
      ? buildPhaseAssignment({
          workflowName,
          version: workflowVersion,
          assignedAt,
          assignmentSource,
          phase: "post_hire",
          steps: postHireSteps,
        })
      : null;

  const currentStep =
    (postHireVisible ? mappedSteps : preHireSteps).find((step) => step.status === "in_progress") ??
    (postHireVisible ? mappedSteps : preHireSteps).find(
      (step) => step.status === "pending" || step.status === "failed"
    ) ??
    null;

  const agreementEsignDone = hasCompletedAgreementEsignStep(preHireSteps);
  const effectivePostHireUnlocked = postHireVisible && (postHireUnlocked || agreementEsignDone);

  const onboarded = isCandidateAlreadyConverted(workerRow);
  const currentStage = resolveEmploymentJourneyStage({
    isHired: postHireVisible || isHired,
    workflowPhase: postHireVisible ? workflowPhase : workflowPhase === "post_hire" ? "pre_hire" : workflowPhase,
    hasPreHireWorkflow: preHireSteps.length > 0 || tags.some((tag) => tag.phase !== "post_hire"),
    hasPostHireWorkflow: postHireVisible && (postHireSteps.length > 0 || tags.some((tag) => tag.phase !== "pre_hire")),
    postHireUnlocked: effectivePostHireUnlocked,
    onboarded: postHireVisible && onboarded,
  });

  const view: CandidateWorkflowPhaseView = {
    currentStage,
    isHired,
    hiredAt: hireGate.hiredAt,
    hiredBy: hireGate.hiredBy,
    postHireVisible,
    workflowHasPostHireSteps: postHireSteps.length > 0,
    postHireUnlocked: effectivePostHireUnlocked,
    postHireLocked: !postHireVisible,
    postHireSuspended,
    postHireActivationFailed: postHireVisible && postHireActivationFailed,
    phaseStartedAt:
      currentStage === "post_hire"
        ? postHireUnlockedAt
        : asText(primaryApp?.created_at) ?? asText(activeInstance?.started_at),
    workflowPhase,
    currentWorkflowName: workflowName,
    currentStepTitle: currentStep?.title ?? null,
    tags: sanitizeTagsForClient(tags, postHireVisible),
    preHire: {
      assigned: preHireSteps.length > 0,
      progress: countsFromAssignedSteps(preHireSteps, "pre_hire"),
      steps: preHireSteps,
      documents: documentsForPhase("pre_hire", preHireSteps),
      assignment: preHireSteps.length ? preHireAssignment : null,
    },
    postHire: postHireVisible
      ? {
          assigned: postHireSteps.length > 0,
          progress: countsFromAssignedSteps(postHireSteps, "post_hire"),
          steps: postHireSteps,
          documents: documentsForPhase("post_hire", postHireSteps),
          assignment: postHireSteps.length ? postHireAssignment : null,
        }
      : null,
  };

  return view;
}

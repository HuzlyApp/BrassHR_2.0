import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/auth/app-role";
import { writeActivityLog } from "@/lib/audit/activity-log";
import {
  ApplicationStatusError,
  changeApplicationStatus,
  listApplicationStatuses,
  statusGroupIsOnStage,
} from "@/lib/jobs/application-statuses";
import { isAssignableStatusStageName } from "@/lib/jobs/application-statuses/stage-assignments";
import {
  SUBMITTED_FOR_MSP_REVIEW_STATUS_NAME,
  SUBMITTED_TO_MSP_STATUS_NAME,
  MspSubmissionError,
  canSubmitCandidateToMsp,
  cleanSubmissionText,
  commitReadyMspSubmission,
  evaluateMspSubmission,
  planApplicationStatusChange,
  type MspDocumentEvidence,
  type MspPacketVariant,
  type MspReadinessCheck,
  type MspSubmissionContext,
  type MspSubmissionDecision,
  type MspSubmissionRecord,
  type MspWorkflowStep,
} from "@/lib/jobs/msp-submission";

export type MspSubmissionActor = {
  userId: string;
  role: AppRole;
  godAdmin?: boolean;
};

export type MspSubmissionView = {
  decision: MspSubmissionDecision;
  submission: MspSubmissionRecord | null;
};

type SubmissionRow = {
  id: string;
  tenant_id: string;
  job_application_id: string;
  job_requisition_id: string;
  worker_id: string | null;
  submitted_by_user_id: string | null;
  submitted_at: string;
  status: "submitted";
  msp_reference: string | null;
  notes: string | null;
  packet_variants: string[] | null;
  readiness_snapshot: MspReadinessCheck[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function text(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function mapSubmission(row: SubmissionRow): MspSubmissionRecord {
  const variants = (row.packet_variants ?? []).filter((item): item is MspPacketVariant =>
    item === "w2" ||
    item === "1099" ||
    item === "recruit_and_release" ||
    item === "msp_eor" ||
    item === "healthcare" ||
    item === "non_healthcare"
  );
  return {
    id: row.id,
    tenantId: row.tenant_id,
    jobApplicationId: row.job_application_id,
    jobRequisitionId: row.job_requisition_id,
    workerId: row.worker_id,
    submittedByUserId: row.submitted_by_user_id,
    submittedAt: row.submitted_at,
    status: "submitted",
    mspReference: row.msp_reference,
    notes: row.notes,
    packetVariants: variants,
    readinessSnapshot: Array.isArray(row.readiness_snapshot) ? row.readiness_snapshot : [],
  };
}

function assertActor(actor: MspSubmissionActor) {
  if (!canSubmitCandidateToMsp(actor.role, actor.godAdmin)) {
    throw new MspSubmissionError("Staff role required to submit a candidate to the MSP", "FORBIDDEN", 403);
  }
}

async function loadExisting(
  supabase: SupabaseClient,
  tenantId: string,
  applicationId: string
): Promise<MspSubmissionRecord | null> {
  const { data, error } = await supabase
    .from("msp_submissions")
    .select(
      "id, tenant_id, job_application_id, job_requisition_id, worker_id, submitted_by_user_id, submitted_at, status, msp_reference, notes, packet_variants, readiness_snapshot"
    )
    .eq("tenant_id", tenantId)
    .eq("job_application_id", applicationId)
    .maybeSingle();
  if (error) {
    if (/msp_submissions/i.test(error.message) && /schema cache|does not exist/i.test(error.message)) {
      return null;
    }
    throw error;
  }
  return data ? mapSubmission(data as SubmissionRow) : null;
}

export async function loadMspSubmissionContext(
  supabase: SupabaseClient,
  tenantId: string,
  applicationId: string
): Promise<MspSubmissionContext | null> {
  const { data, error } = await supabase
    .from("job_applications")
    .select(
      "id, tenant_id, worker_id, applicant_workflow_instance_id, status, status_id, job_requisition_id, application_statuses(name, system_key), applicant_profiles!applicant_profile_id(first_name, last_name, email, phone), worker:worker_id(first_name, last_name, email, phone), job_requisitions(id, source_type, placement_type, employment_type, eor_type, industry_key, external_requisition_id)"
    )
    .eq("id", applicationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const job = one(row.job_requisitions as Record<string, unknown> | Record<string, unknown>[] | null);
  const worker = one(row.worker as Record<string, unknown> | Record<string, unknown>[] | null);
  const profile = one(
    row.applicant_profiles as Record<string, unknown> | Record<string, unknown>[] | null
  );
  const status = one(
    row.application_statuses as { name?: string | null; system_key?: string | null } | Array<{
      name?: string | null;
      system_key?: string | null;
    }> | null
  );
  const workerId = text(row.worker_id);
  const instanceId = text(row.applicant_workflow_instance_id);

  let steps: MspWorkflowStep[] = [];
  if (instanceId) {
    const { data: stepRows, error: stepError } = await supabase
      .from("applicant_workflow_step_records")
      .select("id, snapshot_step_id, step_type, title, is_required, status, position, settings")
      .eq("tenant_id", tenantId)
      .eq("workflow_instance_id", instanceId)
      .order("position", { ascending: true });
    if (stepError) throw stepError;
    steps = (stepRows ?? []).map((step) => {
      const record = step as Record<string, unknown>;
      const settings =
        record.settings && typeof record.settings === "object" && !Array.isArray(record.settings)
          ? (record.settings as Record<string, unknown>)
          : {};
      const libraryKey = text(settings.library_step_key) || text(record.step_type) || text(record.snapshot_step_id) || "";
      return {
        id: String(record.id),
        stepKey: libraryKey,
        title: text(record.title) || libraryKey,
        required: record.is_required === true,
        status: text(record.status) || "pending",
        position: Number(record.position ?? 0),
        settings,
      };
    });
  }

  let documents: MspDocumentEvidence[] = [];
  let resumeOnFile = false;
  if (workerId) {
    const { data: docs, error: docError } = await supabase
      .from("worker_submitted_documents")
      .select("id, status, original_file_name, tenant_required_documents(title)")
      .eq("tenant_id", tenantId)
      .eq("worker_id", workerId);
    if (docError) throw docError;
    documents = (docs ?? []).map((doc) => {
      const record = doc as Record<string, unknown>;
      const required = one(
        record.tenant_required_documents as { title?: string | null } | Array<{ title?: string | null }> | null
      );
      return {
        id: String(record.id),
        label: text(required?.title) || text(record.original_file_name) || "Document",
        stepKey: null,
        status: text(record.status) || "uploaded",
      };
    });

    const { data: resumes, error: resumeError } = await supabase
      .from("worker_resumes")
      .select("id")
      .eq("worker_id", workerId)
      .limit(1);
    if (resumeError) throw resumeError;
    resumeOnFile = (resumes ?? []).length > 0;
  }

  return {
    tenantId,
    applicationId,
    workerId,
    currentStatusName: text(status?.name) || text(row.status),
    currentStatusKey: text(status?.system_key) || text(row.status),
    job: {
      id: text(job?.id) || text(row.job_requisition_id) || "",
      sourceType: text(job?.source_type),
      placementType: text(job?.placement_type),
      employmentType: text(job?.employment_type),
      eorType: text(job?.eor_type),
      industryKey: text(job?.industry_key),
      externalRequisitionId: text(job?.external_requisition_id),
    },
    profile: {
      firstName: text(worker?.first_name) || text(profile?.first_name),
      lastName: text(worker?.last_name) || text(profile?.last_name),
      email: text(worker?.email) || text(profile?.email),
      phone: text(worker?.phone) || text(profile?.phone),
      resumeOnFile,
    },
    documents,
    steps,
  };
}

export async function getMspSubmissionView(
  supabase: SupabaseClient,
  actor: MspSubmissionActor,
  tenantId: string,
  applicationId: string
): Promise<MspSubmissionView> {
  assertActor(actor);
  const context = await loadMspSubmissionContext(supabase, tenantId, applicationId);
  if (!context) throw new MspSubmissionError("Application not found", "NOT_FOUND", 404);
  const submission = await loadExisting(supabase, tenantId, applicationId);
  return {
    decision: evaluateMspSubmission(context, submission),
    submission,
  };
}

async function resolveSubmittedStatusId(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ id: string; name: string }> {
  const statuses = await listApplicationStatuses(supabase, tenantId, { ensureDefaults: true });
  const preferred = statuses.find(
    (status) => status.isActive && status.name.trim().toLowerCase() === SUBMITTED_TO_MSP_STATUS_NAME.toLowerCase()
  );
  const fallback = statuses.find(
    (status) =>
      status.isActive &&
      status.name.trim().toLowerCase() === SUBMITTED_FOR_MSP_REVIEW_STATUS_NAME.toLowerCase()
  );
  const match = preferred ?? fallback;
  if (!match) {
    throw new MspSubmissionError(
      "Add an active Submitted to MSP status before submitting a candidate.",
      "CONFIGURATION",
      409
    );
  }
  return { id: match.id, name: match.name };
}

export async function submitCandidateToMsp(
  supabase: SupabaseClient,
  actor: MspSubmissionActor,
  input: {
    tenantId: string;
    applicationId: string;
    mspReference?: unknown;
    notes?: unknown;
    origin?: string | null;
  }
): Promise<{ submission: MspSubmissionRecord; decision: MspSubmissionDecision; statusName: string }> {
  assertActor(actor);
  const notes = cleanSubmissionText(input.notes, "notes");
  const mspReference = cleanSubmissionText(input.mspReference, "mspReference");
  const context = await loadMspSubmissionContext(supabase, input.tenantId, input.applicationId);
  if (!context) throw new MspSubmissionError("Application not found", "NOT_FOUND", 404);

  const existing = await loadExisting(supabase, input.tenantId, input.applicationId);
  const preview = evaluateMspSubmission(context, existing);
  if (!preview.ready) {
    const message = preview.blockers[0]?.message ?? "This candidate is not ready to submit to the MSP.";
    throw new MspSubmissionError(message, preview.blockers[0]?.code ?? "NOT_READY", 409, preview.blockers);
  }
  const target = await resolveSubmittedStatusId(supabase, input.tenantId);
  const store = new Map<string, MspSubmissionRecord>();
  if (existing) store.set(existing.jobApplicationId, existing);

  const committed = await commitReadyMspSubmission({
    actorAllowed: true,
    context,
    existing,
    actorUserId: actor.userId,
    notes,
    mspReference,
    persist: async (draft) => {
      if (store.has(draft.jobApplicationId)) {
        throw new MspSubmissionError(
          "This candidate was already submitted to the MSP for this requisition.",
          "ALREADY_SUBMITTED",
          409
        );
      }
      const { data: inserted, error: insertError } = await supabase
        .from("msp_submissions")
        .insert({
          tenant_id: draft.tenantId,
          job_application_id: draft.jobApplicationId,
          job_requisition_id: draft.jobRequisitionId,
          worker_id: draft.workerId,
          submitted_by_user_id: draft.submittedByUserId,
          submitted_at: draft.submittedAt,
          status: "submitted",
          msp_reference: draft.mspReference,
          notes: draft.notes,
          packet_variants: draft.packetVariants,
          readiness_snapshot: draft.readinessSnapshot,
        })
        .select(
          "id, tenant_id, job_application_id, job_requisition_id, worker_id, submitted_by_user_id, submitted_at, status, msp_reference, notes, packet_variants, readiness_snapshot"
        )
        .single();
      if (insertError) {
        if (insertError.code === "23505") {
          throw new MspSubmissionError(
            "This candidate was already submitted to the MSP for this requisition.",
            "ALREADY_SUBMITTED",
            409
          );
        }
        throw insertError;
      }
      const saved = mapSubmission(inserted as SubmissionRow);
      store.set(saved.jobApplicationId, saved);
      return saved;
    },
    changeStatus: async () => {
      await changeApplicationStatus(supabase, {
        tenantId: input.tenantId,
        applicationId: input.applicationId,
        statusId: target.id,
        changedByUserId: actor.userId,
        note: notes ?? "Submitted to MSP",
        origin: input.origin,
      });
    },
    audit: async (submission) => {
      await writeActivityLog({
        actorUserId: actor.userId,
        action: "msp_submission.created",
        entityType: "msp_submission",
        entityId: submission.id,
        tenantId: input.tenantId,
        metadata: {
          jobApplicationId: submission.jobApplicationId,
          jobRequisitionId: submission.jobRequisitionId,
          workerId: submission.workerId,
          packetVariants: submission.packetVariants,
          mspReference: submission.mspReference,
          externalResponseAdvancesStage: false,
        },
      });
    },
    markStepComplete: async (stepId) => {
      const { error: stepError } = await supabase
        .from("applicant_workflow_step_records")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", stepId)
        .eq("tenant_id", input.tenantId);
      if (stepError) console.error("[msp-submission] workflow step completion failed", stepError);
    },
  });

  return { ...committed, statusName: target.name };
}

function oneGroupKey(
  value: { system_key?: string | null } | { system_key?: string | null }[] | null | undefined
): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  return typeof row?.system_key === "string" ? row.system_key : null;
}

export async function guardJobApplicationStatusChange(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    applicationId: string;
    statusId?: string;
    systemKey?: string;
    /** Pre-Hire stage or AI analysis step whose Settings groups may include this status. */
    stageName?: string;
  }
): Promise<void> {
  const statusId = input.statusId?.trim() ?? "";
  const systemKey = input.systemKey?.trim().toLowerCase() ?? "";
  const stageName = input.stageName?.trim() ?? "";

  const { data: application, error: appError } = await supabase
    .from("job_applications")
    .select("id, status_id, job_requisitions(source_type)")
    .eq("id", input.applicationId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (appError) throw appError;
  if (!application) {
    throw new ApplicationStatusError("Application not found", "NOT_FOUND", 404);
  }

  let statusQuery = supabase
    .from("application_statuses")
    .select("id, name, system_key, is_active, group_id, application_status_groups(system_key)")
    .eq("tenant_id", input.tenantId);
  statusQuery = statusId ? statusQuery.eq("id", statusId) : statusQuery.eq("system_key", systemKey);
  const { data: statusRow, error: statusError } = await statusQuery.maybeSingle();
  if (statusError) throw statusError;
  if (!statusRow) {
    throw new ApplicationStatusError("Status not found", "NOT_FOUND", 404);
  }
  if (statusRow.is_active === false) {
    throw new ApplicationStatusError("Status is inactive", "INACTIVE", 400);
  }

  const status = statusRow as {
    id: string;
    name: string;
    system_key: string | null;
    group_id: string | null;
    application_status_groups?: { system_key?: string | null } | { system_key?: string | null }[] | null;
  };

  let assignedToStage = false;
  if (stageName) {
    if (!isAssignableStatusStageName(stageName)) {
      throw new ApplicationStatusError(`Unknown stage: ${stageName}`, "VALIDATION");
    }
    const { data: assignmentRows, error: assignmentError } = await supabase
      .from("application_status_group_stage_assignments")
      .select("group_id")
      .eq("tenant_id", input.tenantId)
      .eq("stage_name", stageName);
    if (assignmentError) throw assignmentError;
    const assignedGroupIds = ((assignmentRows ?? []) as Array<{ group_id?: string | null }>)
      .map((row) => row.group_id)
      .filter((groupId): groupId is string => Boolean(groupId));
    assignedToStage = statusGroupIsOnStage({
      groupId: status.group_id,
      groupSystemKey: oneGroupKey(status.application_status_groups),
      statusName: status.name,
      assignedGroupIds,
    });
    if (!assignedToStage) {
      const { data: laneRow, error: laneError } = await supabase
        .from("application_status_stage_lanes")
        .select("id")
        .eq("tenant_id", input.tenantId)
        .eq("stage_name", stageName)
        .eq("status_id", status.id)
        .maybeSingle();
      if (laneError) {
        const message = String((laneError as { message?: string }).message ?? laneError);
        if (!/application_status_stage_lanes|schema cache|Could not find/i.test(message)) {
          throw laneError;
        }
      } else if (laneRow) {
        assignedToStage = true;
      }
    }
    if (!assignedToStage) {
      throw new ApplicationStatusError(
        `${status.name} is not assigned to ${stageName}.`,
        "VALIDATION"
      );
    }
  }

  const existing = await loadExisting(supabase, input.tenantId, input.applicationId);
  const job = one(
    (application as { job_requisitions?: { source_type?: string | null } | { source_type?: string | null }[] })
      .job_requisitions
  );
  const plan = planApplicationStatusChange({
    sourceType: job?.source_type ?? null,
    targetName: String(status.name ?? ""),
    targetSystemKey: status.system_key ?? null,
    currentStatusId: (application as { status_id?: string | null }).status_id ?? null,
    targetStatusId: String(status.id),
    hasMspSubmission: Boolean(existing),
    assignedToStage,
  });

  if (!plan.ok) {
    throw new ApplicationStatusError(plan.message, plan.code, plan.status);
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { writeActivityLog } from "@/lib/audit/activity-log";
import { loadCandidateWorkflowStepInspection } from "@/lib/onboarding/candidate-workflow-step-inspection";
import { approveStepDocumentsOnCompletion } from "@/lib/onboarding/staff-step-documents";
import {
  buildStaffReview,
  writeStepRecordDecision,
  type StaffStepActionResult,
} from "@/lib/onboarding/staff-workflow-step-review";

/**
 * Recruiter "Mark as complete" on a candidate step the candidate already submitted. Only the
 * step record (plus the event and activity logs) changes: the candidate's progress row is
 * already completed, so their portal and next step are unaffected.
 */
export async function verifyCandidateStepSubmission(
  supabase: SupabaseClient,
  params: {
    workerId: string;
    tenantId: string;
    stepRecordId: string;
    note: string | null;
    actor: { userId: string | null; email: string | null };
    request?: Request;
  }
): Promise<StaffStepActionResult> {
  const { workerId, tenantId, stepRecordId } = params;
  const note = params.note?.trim() || null;

  const inspection = await loadCandidateWorkflowStepInspection(supabase, {
    workerId,
    tenantId,
    stepId: stepRecordId,
  });
  if (!inspection.ok) return inspection;

  const review = inspection.candidateReview;
  if (!review?.canVerify) {
    return {
      ok: false,
      status: 409,
      code: review?.verified ? "ALREADY_VERIFIED" : "STEP_NOT_SUBMITTED",
      error: review?.verified
        ? "This step is already marked complete. Refresh to see the latest status."
        : !review
          ? "This is a recruiter step. Use its own actions to complete it."
          : "The candidate hasn't submitted this step yet, so there's nothing to verify.",
    };
  }

  const { data: record, error: recordError } = await supabase
    .from("applicant_workflow_step_records")
    .select("id, workflow_instance_id")
    .eq("id", stepRecordId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (recordError) throw recordError;
  if (!record) return { ok: false, status: 404, error: "Workflow step not found" };

  const now = new Date().toISOString();
  const staffReview = await buildStaffReview(supabase, {
    action: "complete",
    note,
    actor: params.actor,
    now,
  });

  await writeStepRecordDecision(supabase, {
    recordId: String(record.id),
    instanceId: String(record.workflow_instance_id),
    tenantId,
    action: "complete",
    previousStatus: inspection.step.status,
    nextStatus: "completed",
    review: staffReview,
    completedAt: inspection.step.completedAt ?? now,
  });

  const requiredDocumentIds = (inspection.documentUploads?.slots ?? []).flatMap((slot) =>
    slot.requiredDocumentId ? [slot.requiredDocumentId] : []
  );
  try {
    await approveStepDocumentsOnCompletion(supabase, {
      tenantId,
      workerId,
      requiredDocumentIds,
      reviewerUserId: params.actor.userId,
      reviewedAt: now,
    });
  } catch (approveError) {
    console.error("[candidate-step-verification] document approval failed", approveError);
  }

  await writeActivityLog({
    actorUserId: params.actor.userId,
    action: "workflow_step.staff_verify_submission",
    entityType: "applicant_workflow_step_record",
    entityId: String(record.id),
    tenantId,
    metadata: {
      worker_id: workerId,
      application_id: inspection.applicationId,
      onboarding_step_id: inspection.step.tenantStepId,
      step_title: inspection.step.title,
      phase: inspection.phase,
      previous_status: "submitted",
      status: "completed",
      note,
    },
    request: params.request,
  });

  return { ok: true, status: "completed", review: staffReview, email: null };
}

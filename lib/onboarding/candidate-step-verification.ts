import type { SupabaseClient } from "@supabase/supabase-js";
import { writeActivityLog } from "@/lib/audit/activity-log";
import { autoConvertCandidateAfterAgreement } from "@/lib/onboarding/auto-convert-after-agreement";
import { loadCandidateWorkflowStepInspection } from "@/lib/onboarding/candidate-workflow-step-inspection";
import { isAgreementEsignStep } from "@/lib/onboarding/lock-post-hire";
import { approveStepDocumentsOnCompletion } from "@/lib/onboarding/staff-step-documents";
import {
  buildStaffReview,
  writeStepRecordDecision,
  type StaffStepActionResult,
} from "@/lib/onboarding/staff-workflow-step-review";
import type { TenantOnboardingStep } from "@/lib/onboarding/types";

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
    origin?: string | null;
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
  const authorizationEsign =
    inspection.phase !== "post_hire" &&
    isAgreementEsignStep({
      snapshotStepId: inspection.step.snapshotStepId,
      stepKey: inspection.step.stepKey,
      stepType: inspection.step.stepType,
      title: inspection.step.title,
    });
  if (authorizationEsign && !inspection.agreement?.isSigned) {
    return {
      ok: false,
      status: 409,
      code: "AGREEMENT_AWAITING_CANDIDATE_SIGNATURE",
      error:
        "The candidate hasn't signed yet. Send them an email to complete the signature, then review the saved signature and mark the step complete.",
    };
  }
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

  if (inspection.phase !== "post_hire") {
    const workflowStepId = inspection.step.stepType || inspection.step.snapshotStepId;
    const agreementStep: TenantOnboardingStep | null = isAgreementEsignStep({
      snapshotStepId: inspection.step.snapshotStepId,
      stepKey: inspection.step.stepKey,
      stepType: inspection.step.stepType,
      title: inspection.step.title,
    })
      ? {
          id: inspection.step.tenantStepId ?? inspection.step.id,
          step_key: inspection.step.stepKey || "employee-agreement",
          title: inspection.step.title,
          description: null,
          step_type: "authorizations",
          sort_order: 0,
          is_required: inspection.step.required,
          is_enabled: true,
          metadata: {
            workflow_step_id: workflowStepId || "employee-agreement",
            workflow_settings: { phase: "pre_hire" },
          },
        }
      : null;
    if (agreementStep) {
      try {
        await autoConvertCandidateAfterAgreement(supabase, {
          tenantId,
          workerId,
          applicationId: inspection.applicationId,
          step: agreementStep,
          origin: params.origin ?? null,
        });
      } catch (conversionError) {
        console.error("[candidate-step-verification] agreement conversion failed", conversionError);
      }
    }
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

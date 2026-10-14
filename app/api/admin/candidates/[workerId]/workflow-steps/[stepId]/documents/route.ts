import { NextResponse } from "next/server";
import {
  resolveCandidateStepRequest,
  type CandidateStepRouteContext,
} from "@/lib/admin/candidate-step-request";
import {
  resolveDocumentField,
  saveStaffLegacyDocumentUpload,
  saveStaffRequiredDocumentUpload,
} from "@/lib/admin/staff-document-upload";
import { writeActivityLog } from "@/lib/audit/activity-log";
import {
  resolveAssignedStepStatus,
  toAssignedStepRecordInput,
} from "@/lib/onboarding/assigned-workflow-steps";
import { loadCandidateWorkflowStepInspection } from "@/lib/onboarding/candidate-workflow-step-inspection";
import { loadScopedStepProgress } from "@/lib/onboarding/scoped-step-progress";
import { loadStepDocumentUploads } from "@/lib/onboarding/staff-step-documents";
import { loadStaffStepContext } from "@/lib/onboarding/staff-workflow-step-review";
import { enforceRateLimit, getClientIp } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

/** POST — staff upload a document into one of the step's upload fields on the candidate's behalf. */
export async function POST(req: Request, context: CandidateStepRouteContext) {
  try {
    const limited = await enforceRateLimit(req, {
      namespace: "admin-workflow-step-document-upload",
      key: getClientIp(req),
      limit: Number(process.env.RATE_LIMIT_UPLOADS_PER_HOUR ?? 40),
      windowMs: 60 * 60 * 1000,
      failClosed: false,
    });
    if (limited) return limited;

    const resolved = await resolveCandidateStepRequest(context);
    if (!resolved.ok) return resolved.response;
    const { auth, supabase, tenantId, workerId, stepId } = resolved;

    const formData = await req.formData();
    const file = formData.get("file");
    const slotKey = String(formData.get("slotKey") ?? "").trim();
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
    }
    if (!slotKey) {
      return NextResponse.json({ error: "Missing slotKey" }, { status: 400 });
    }

    const ctx = await loadStaffStepContext(supabase, { workerId, tenantId, stepRecordId: stepId });
    if (!ctx.ok) {
      return NextResponse.json({ error: ctx.error, code: ctx.code ?? null }, { status: ctx.status });
    }

    const progressByStepId = await loadScopedStepProgress(supabase, {
      tenantId,
      workerId,
      applicationId: ctx.applicationId,
    });
    const progress = ctx.mapped.tenantStepId ? progressByStepId.get(ctx.mapped.tenantStepId) : undefined;
    const stepStatus = resolveAssignedStepStatus(toAssignedStepRecordInput(ctx.record), progress).status;
    const uploads = await loadStepDocumentUploads(supabase, {
      tenantId,
      workerId,
      tenantStepId: ctx.mapped.tenantStepId,
      stepType: ctx.mapped.stepType,
      config: ctx.config,
      candidateOwned: false,
      stepStatus,
    });
    const slot = uploads.slots.find((candidate) => candidate.key === slotKey);
    if (!slot) {
      return NextResponse.json({ error: "This step has no such document field." }, { status: 400 });
    }
    if (!uploads.canUpload) {
      return NextResponse.json(
        { error: "This step is already completed, so its documents can't be changed here." },
        { status: 409 }
      );
    }

    let result;
    if (slot.requiredDocumentId) {
      result = await saveStaffRequiredDocumentUpload(supabase, {
        tenantId,
        workerId,
        actorUserId: auth.userId,
        uploadedByUserId: auth.devBypass ? null : auth.userId,
        requiredDocumentId: slot.requiredDocumentId,
        file,
        documentTitle: slot.title,
        applicationId: ctx.applicationId,
      });
    } else {
      const column = slot.identityField ? resolveDocumentField(slot.identityField, slot.title) : null;
      if (!column) {
        return NextResponse.json({ error: "This document field can't be uploaded here." }, { status: 400 });
      }
      result = await saveStaffLegacyDocumentUpload(supabase, {
        tenantId,
        workerId,
        actorUserId: auth.userId,
        column,
        file,
        documentTitle: slot.title,
      });
    }
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await writeActivityLog({
      actorUserId: auth.userId,
      action: "workflow_step.staff_document_upload",
      entityType: "applicant_workflow_step_record",
      entityId: stepId,
      tenantId,
      metadata: {
        worker_id: workerId,
        application_id: ctx.applicationId,
        step_title: ctx.mapped.title,
        document_title: slot.title,
        file_name: file.name,
      },
      request: req,
    });

    const inspection = await loadCandidateWorkflowStepInspection(supabase, { workerId, tenantId, stepId });
    return NextResponse.json({ ok: true, inspection: inspection.ok ? inspection : null });
  } catch (error) {
    console.error("[admin/workflow-steps/documents] upload failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload the document" },
      { status: 500 }
    );
  }
}

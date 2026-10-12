import { NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { canAccessWorkerRecord } from "@/lib/auth/worker-record-access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import { parseRequiredUuid } from "@/lib/validation/uuid";
import {
  getFirmaSigningRequest,
  getFirmaSigningRequestUsers,
  resolveApplicantSigningRecipient,
  tryGetFirmaSigningRequestDownload,
} from "@/lib/firma/client";
import { resolveTenantFirmaWorkspaceId } from "@/lib/firma/resolve-tenant-workspace";
import {
  isFirmaSigningComplete,
  resolveFirmaSigningStatusFromSources,
} from "@/lib/onboarding/firma-step-settings";
import { loadCandidateWorkflowStepInspection } from "@/lib/onboarding/candidate-workflow-step-inspection";
import { ensureWorkerOnboardingProgress } from "@/lib/onboarding/ensure-worker-progress";
import { autoConvertCandidateAfterAgreement } from "@/lib/onboarding/auto-convert-after-agreement";
import { notifyRecruiterOnAgreementStepCompletion } from "@/lib/onboarding/notify-recruiter-on-agreement-step";
import type { TenantOnboardingStep } from "@/lib/onboarding/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ workerId: string; stepId: string }> };

export async function POST(req: Request, context: RouteContext) {
  try {
    const auth = await requireStaffApiSession();
    if (auth instanceof NextResponse) return auth;

    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
    }

    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) {
      return NextResponse.json({ error: "No tenant selected" }, { status: 400 });
    }

    const { workerId: workerIdRaw, stepId: stepIdRaw } = await context.params;
    const workerCheck = parseRequiredUuid(workerIdRaw, "workerId");
    const stepCheck = parseRequiredUuid(stepIdRaw, "stepId");
    if (!workerCheck.ok) {
      return NextResponse.json({ error: workerCheck.error }, { status: 400 });
    }
    if (!stepCheck.ok) {
      return NextResponse.json({ error: stepCheck.error }, { status: 400 });
    }

    const workerId = workerCheck.value;
    const stepId = stepCheck.value;

    const { data: worker, error: workerError } = await supabase
      .from("worker")
      .select("id, user_id, email, first_name, last_name")
      .eq("id", workerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (workerError) throw workerError;
    if (!worker) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }
    if (!canAccessWorkerRecord(auth, { id: String(worker.id), user_id: worker.user_id })) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Load session matching this worker and step, or by worker_onboarding_step_progress
    const progressPayload = await ensureWorkerOnboardingProgress(supabase, workerId, tenantId);
    const existingProgressStep = progressPayload.steps.find(
      (s) => String(s.onboarding_step_id) === String(stepId)
    );
    const previousData =
      existingProgressStep?.data &&
      typeof existingProgressStep.data === "object" &&
      !Array.isArray(existingProgressStep.data)
        ? (existingProgressStep.data as Record<string, unknown>)
        : {};

    const progressSigningRequestId = previousData.signing_request_id as string | undefined;

    let query = supabase
      .from("worker_firma_signing_sessions")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("worker_id", workerId);

    if (progressSigningRequestId) {
      query = query.eq("signing_request_id", progressSigningRequestId);
    } else {
      query = query.eq("onboarding_step_id", stepId);
    }

    const { data: sessionRows } = await query
      .order("created_at", { ascending: false })
      .limit(1);

    const session = sessionRows?.[0] ?? null;

    if (!session?.signing_request_id) {
      return NextResponse.json(
        { error: "No Firma signing request found to re-sync for this step.", code: "NO_SESSION" },
        { status: 404 }
      );
    }

    const workspaceId =
      session.firma_workspace_id ||
      (await resolveTenantFirmaWorkspaceId(supabase, tenantId).catch(() => null));

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Firma workspace ID not configured for this tenant.", code: "WORKSPACE_NOT_CONFIGURED" },
        { status: 400 }
      );
    }

    // Fetch live status from Firma dev API
    const signingDetail = await getFirmaSigningRequest(session.signing_request_id, workspaceId);
    const users =
      Array.isArray(signingDetail.recipients) && signingDetail.recipients.length > 0
        ? signingDetail.recipients
        : await getFirmaSigningRequestUsers(session.signing_request_id, workspaceId);

    const applicantEmail = worker.email || "";
    const recipient = resolveApplicantSigningRecipient(signingDetail, applicantEmail, users);
    const newFirmaStatus = resolveFirmaSigningStatusFromSources({
      requestStatus: signingDetail.status,
      recipient,
      fallback: session.firma_status,
    });

    const isSigned = isFirmaSigningComplete(newFirmaStatus);

    let downloadUrl: string | null = null;
    if (isSigned) {
      downloadUrl = await tryGetFirmaSigningRequestDownload(session.signing_request_id, workspaceId);
    }

    // Update worker_firma_signing_sessions
    await supabase
      .from("worker_firma_signing_sessions")
      .update({
        firma_status: newFirmaStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id);

    // Update worker_onboarding_step_progress
    const nextData = {
      ...previousData,
      signing_provider: "firma",
      signing_request_id: session.signing_request_id,
      firma_status: newFirmaStatus,
      ...(downloadUrl ? { download_url: downloadUrl, signed_document_url: downloadUrl } : {}),
    };

    if (existingProgressStep) {
      await supabase
        .from("worker_onboarding_step_progress")
        .update({
          status: isSigned ? "completed" : existingProgressStep.status,
          completed_at: isSigned ? new Date().toISOString() : existingProgressStep.completed_at,
          data: nextData,
          updated_at: new Date().toISOString(),
        })
        .eq("worker_onboarding_progress_id", progressPayload.progressId)
        .eq("onboarding_step_id", stepId);
    }

    if (isSigned) {
      const stepStub = { id: stepId, step_key: "agreement", title: "Agreement" } as unknown as TenantOnboardingStep;
      const applicationId = (session.application_id as string | null) ?? null;
      try {
        await autoConvertCandidateAfterAgreement(supabase, {
          tenantId,
          workerId,
          applicationId,
          step: stepStub,
          origin: new URL(req.url).origin,
        });
      } catch (e) {
        console.warn("[resync-firma] auto convert warning", e);
      }

      try {
        await notifyRecruiterOnAgreementStepCompletion(supabase, {
          tenantId,
          workerId,
          applicationId,
          step: stepStub,
          data: nextData,
          origin: new URL(req.url).origin,
          request: req,
        });
      } catch (e) {
        console.warn("[resync-firma] notify warning", e);
      }
    }

    // Reload fresh inspection to return back to caller
    const inspectionResult = await loadCandidateWorkflowStepInspection(supabase, {
      workerId,
      tenantId,
      stepId,
    });

    return NextResponse.json({
      ok: true,
      firma_status: newFirmaStatus,
      is_signed: isSigned,
      download_url: downloadUrl,
      inspection: inspectionResult.ok ? inspectionResult : null,
    });
  } catch (err: unknown) {
    console.error("[admin/workflow-steps/resync-firma]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to re-sync Firma signing status",
      },
      { status: 500 }
    );
  }
}

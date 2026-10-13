import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase-env";
import {
  FirmaOnboardingSigningError,
  shouldCompleteOnboardingStepFromFirmaStatus,
  syncFirmaSigningSessionStatus,
  syncFirmaSigningStatusByRequestId,
} from "@/lib/onboarding/firma-onboarding-signing";
import { mapFirmaStatusToOnboardingStatus } from "@/lib/onboarding/firma-step-settings";
import { resolveDraftPreviewFirmaSignerEmail } from "@/lib/onboarding/is-draft-preview";
import { ensureWorkerOnboardingProgress } from "@/lib/onboarding/ensure-worker-progress";
import { resolveFirmaOnboardingContext } from "@/lib/onboarding/resolve-firma-onboarding-context";
import { resolveApplicantSigningProfile } from "@/lib/onboarding/resolve-applicant-signing-profile";
import { tryGetFirmaSigningRequestDownload } from "@/lib/firma/client";
import { resolveTenantFirmaWorkspaceId } from "@/lib/firma/resolve-tenant-workspace";
import {
  E_SIGNATURE_USER_ERRORS,
  sanitizeESignatureUserMessage,
} from "@/lib/e-signature/user-facing";
import { autoConvertCandidateAfterAgreement } from "@/lib/onboarding/auto-convert-after-agreement";
import { notifyRecruiterOnAgreementStepCompletion } from "@/lib/onboarding/notify-recruiter-on-agreement-step";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const applicantId = req.nextUrl.searchParams.get("applicantId")?.trim() || "";
    const stepKey = req.nextUrl.searchParams.get("stepKey")?.trim() || "";
    const stepId = req.nextUrl.searchParams.get("stepId")?.trim() || "";
    const tenantSlug = req.nextUrl.searchParams.get("tenantSlug")?.trim() || "";
    const applicationId = req.nextUrl.searchParams.get("applicationId")?.trim() || "";
    const preferDraftConfig = req.nextUrl.searchParams.get("preview") === "draft";
    if (!applicantId || !stepKey) {
      return NextResponse.json({ error: "Missing applicantId or stepKey" }, { status: 400 });
    }

    const url = getSupabaseUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
    }

    const supabase = createClient(url, key);
    const resolved = await resolveFirmaOnboardingContext({
      supabase,
      applicantId,
      stepKey,
      stepId: stepId || null,
      tenantSlug: tenantSlug || null,
      preferDraftConfig,
    });

    if (!resolved.ok) {
      return NextResponse.json(
        { error: resolved.error, code: resolved.code },
        { status: resolved.status }
      );
    }

    if (resolved.draftPreview) {
      const signingRequestId = req.nextUrl.searchParams.get("signingRequestId")?.trim() || "";
      if (!signingRequestId) {
        return NextResponse.json(
          { error: "Missing signingRequestId for draft preview", code: "INVALID_SESSION" },
          { status: 400 }
        );
      }

      const session = await syncFirmaSigningStatusByRequestId({
        signingRequestId,
        applicantEmail: resolveDraftPreviewFirmaSignerEmail(),
        step: resolved.step,
        tenantId: resolved.tenantId,
        supabase,
      });
      const onboardingStatus = mapFirmaStatusToOnboardingStatus(session.firma_status);
      const completed = shouldCompleteOnboardingStepFromFirmaStatus(session.firma_status);

      let draftDownloadUrl: string | null = null;
      if (completed && session.signing_request_id) {
        const wsId = await resolveTenantFirmaWorkspaceId(supabase, resolved.tenantId).catch(() => null);
        if (wsId) {
          draftDownloadUrl = await tryGetFirmaSigningRequestDownload(session.signing_request_id, wsId);
        }
      }

      return NextResponse.json({
        session,
        onboarding_status: onboardingStatus,
        completed,
        download_url: draftDownloadUrl,
      });
    }

    const workerId = resolved.workerId;
    if (!workerId) {
      return NextResponse.json(
        { error: "Worker not found", code: "WORKER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const profile = await resolveApplicantSigningProfile(supabase, workerId, applicantId);
    if (!profile) {
      return NextResponse.json(
        {
          error:
            "A valid applicant email is required before signing. Complete the first onboarding step with your email address.",
          code: "INVALID_APPLICANT_EMAIL",
        },
        { status: 400 }
      );
    }

    const signingRequestId = req.nextUrl.searchParams.get("signingRequestId")?.trim() || "";

    const session = await syncFirmaSigningSessionStatus({
      supabase,
      tenantId: resolved.tenantId,
      workerId,
      applicantEmail: profile.email,
      applicantFirstName: profile.firstName,
      applicantLastName: profile.lastName,
      step: resolved.step,
      signingRequestId: signingRequestId || undefined,
      applicationId: applicationId || null,
    });

    const onboardingStatus = mapFirmaStatusToOnboardingStatus(session.firma_status);
    const completed = shouldCompleteOnboardingStepFromFirmaStatus(session.firma_status);

    const progressPayload = await ensureWorkerOnboardingProgress(
      supabase,
      workerId,
      resolved.tenantId
    );
    const progressStatus = completed
      ? "completed"
      : onboardingStatus === "in_progress"
        ? "in_progress"
        : onboardingStatus === "failed"
          ? "failed"
          : "pending";

    const existingRow = progressPayload.steps.find(
      (row) => String(row.onboarding_step_id) === String(resolved.step.id)
    );
    const previousData =
      existingRow?.data && typeof existingRow.data === "object" && !Array.isArray(existingRow.data)
        ? (existingRow.data as Record<string, unknown>)
        : {};

    let downloadUrl: string | null = (previousData.download_url as string) || (previousData.signed_document_url as string) || null;
    if (completed && session.signing_request_id && !downloadUrl) {
      try {
        const wsId = await resolveTenantFirmaWorkspaceId(supabase, resolved.tenantId).catch(() => null);
        if (wsId) {
          downloadUrl = await tryGetFirmaSigningRequestDownload(session.signing_request_id, wsId);
        }
      } catch {
        /* best effort fetch */
      }
    }

    const nextData: Record<string, unknown> = {
      ...previousData,
      signing_provider: "firma",
      signing_request_id: session.signing_request_id,
      firma_status: session.firma_status,
      ...(downloadUrl ? { download_url: downloadUrl, signed_document_url: downloadUrl } : {}),
    };

    const nextStatus =
      progressStatus === "completed" || progressStatus === "failed" || progressStatus === "in_progress"
        ? progressStatus
        : existingRow?.status === "in_progress" || existingRow?.status === "completed"
          ? existingRow.status
          : "in_progress";

    const wasAlreadyCompleted =
      existingRow?.status === "completed" ||
      Boolean(existingRow?.completed_at) ||
      Boolean(previousData?.recruiter_notified_at);

    const effectiveCompletedAt =
      existingRow?.completed_at ?? (completed ? new Date().toISOString() : null);

    if (completed && !wasAlreadyCompleted) {
      nextData.recruiter_notified_at = new Date().toISOString();
    }

    if (existingRow) {
      const { error: upErr } = await supabase
        .from("worker_onboarding_step_progress")
        .update({
          status: nextStatus,
          completed_at: effectiveCompletedAt,
          data: nextData,
          updated_at: new Date().toISOString(),
        })
        .eq("worker_onboarding_progress_id", progressPayload.progressId)
        .eq("onboarding_step_id", resolved.step.id);

      if (upErr) throw upErr;
    } else {
      const { error: insErr } = await supabase.from("worker_onboarding_step_progress").insert({
        worker_onboarding_progress_id: progressPayload.progressId,
        worker_id: workerId,
        tenant_id: resolved.tenantId,
        onboarding_step_id: resolved.step.id,
        status: nextStatus,
        completed_at: effectiveCompletedAt,
        data: nextData,
      });
      if (insErr) throw insErr;
    }

    let postHireConversion: Awaited<ReturnType<typeof autoConvertCandidateAfterAgreement>> | null = null;
    if (completed && !wasAlreadyCompleted) {
      try {
        postHireConversion = await autoConvertCandidateAfterAgreement(supabase, {
          tenantId: resolved.tenantId,
          workerId,
          applicationId: applicationId || null,
          step: resolved.step,
          origin: req.nextUrl.origin,
        });
      } catch (conversionError) {
        console.error("[onboarding/firma-sign/status] auto conversion failed", conversionError);
      }

      try {
        await notifyRecruiterOnAgreementStepCompletion(supabase, {
          tenantId: resolved.tenantId,
          workerId,
          applicationId: applicationId || null,
          step: resolved.step,
          stepKey: resolved.step.step_key,
          data: nextData,
          origin: req.nextUrl.origin,
          request: req,
        });
      } catch (notifyError) {
        console.warn("[onboarding/firma-sign/status] recruiter agreement notification failed", notifyError);
      }
    }

    return NextResponse.json({
      session,
      onboarding_status: onboardingStatus,
      completed,
      download_url: downloadUrl,
      postHireConversion,
    });
  } catch (err: unknown) {
    if (err instanceof FirmaOnboardingSigningError) {
      return NextResponse.json(
        {
          error: sanitizeESignatureUserMessage(
            err.message,
            E_SIGNATURE_USER_ERRORS.statusUnavailable
          ),
          code: err.code,
        },
        { status: err.status }
      );
    }
    console.error("[onboarding/firma-sign/status]", err);
    return NextResponse.json(
      { error: E_SIGNATURE_USER_ERRORS.statusUnavailable },
      { status: 500 }
    );
  }
}

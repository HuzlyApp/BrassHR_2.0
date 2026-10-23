import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import { extractResumeTextFromUpload } from "@/lib/jobs/match-analysis/extract-resume-text";
import { persistWorkerResumeRecord } from "@/lib/onboarding/persist-worker-resume-record";
import { syncWorkerPrimaryResumePath } from "@/lib/onboarding/sync-worker-primary-resume-path";
import { assertResumeUploadWithinLimit } from "@/lib/resume/assert-resume-upload-limit";
import { resumeUploadFolder } from "@/lib/resume/resume-reupload-path";
import {
  isResumeUploadValidationError,
  resolveResumeFileType,
  validateExtractedResumeText,
  validateResumeUploadFile,
} from "@/lib/resume/validate-resume-upload";
import { WORKER_RESUMES_BUCKET } from "@/lib/supabase-storage-buckets";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { buildWorkerResumeFileName } from "@/lib/resume/worker-resume-file-name";
import { runAutoQuickMatchForApplication } from "@/lib/jobs/match-analysis/auto-quick-match";
import { parseAnalysisProvider } from "@/lib/jobs/match-analysis/schema";

export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_RESUME_BYTES = Number(process.env.MAX_RESUME_UPLOAD_BYTES ?? 10 * 1024 * 1024);

function formatApiError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return fallback;
}

/**
 * POST — add or replace a résumé for a job application.
 * Same format + content gates as applicant /api/upload-resume.
 * multipart/form-data: resume=<file>, resumeId=<id> (replace instead of add).
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });

    const { id } = await context.params;
    const applicationId = id?.trim();
    if (!applicationId) {
      return NextResponse.json({ error: "Application id is required" }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get("resume");
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: "Please select a resume file to upload." }, { status: 400 });
    }

    // Present when replacing an existing resume rather than adding a new one.
    const replacedResumeId = String(form.get("resumeId") ?? "").trim();
    const analysisProvider = parseAnalysisProvider(form.get("analysisProvider"));

    const formatError = validateResumeUploadFile({
      name: file.name,
      type: file.type,
      size: file.size,
      maxBytes: MAX_RESUME_BYTES,
    });
    if (formatError) {
      return NextResponse.json({ error: formatError }, { status: 400 });
    }

    const fileType = resolveResumeFileType(file);
    if (fileType === "doc") {
      return NextResponse.json(
        {
          error:
            "Legacy .doc files are not supported. Please save the resume as .docx or PDF.",
        },
        { status: 400 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());

    let extractedText = "";
    try {
      extractedText = await extractResumeTextFromUpload(bytes, file.name);
    } catch (extractError) {
      return NextResponse.json(
        {
          error:
            extractError instanceof Error
              ? extractError.message
              : "Could not read resume. Please upload a PDF or DOCX resume.",
        },
        { status: 400 }
      );
    }

    const contentError = validateExtractedResumeText(extractedText);
    if (contentError) {
      return NextResponse.json({ error: contentError }, { status: 400 });
    }

    const { data: application, error: appError } = await supabase
      .from("job_applications")
      .select("id, tenant_id, worker_id, applicant_profile_id")
      .eq("tenant_id", tenantId)
      .eq("id", applicationId)
      .maybeSingle();
    if (appError) throw appError;
    if (!application?.id) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const workerId =
      typeof application.worker_id === "string" && application.worker_id.trim()
        ? application.worker_id.trim()
        : null;
    const profileId =
      typeof application.applicant_profile_id === "string" &&
      application.applicant_profile_id.trim()
        ? application.applicant_profile_id.trim()
        : null;

    if (!workerId && !profileId) {
      return NextResponse.json(
        { error: "Candidate profile is not linked yet. Cannot update resume." },
        { status: 400 }
      );
    }

    let resumeOwnerId: string | null = null;
    let workerUserId: string | null = null;
    let workerFirstName: string | null = null;
    let workerLastName: string | null = null;
    if (workerId) {
      const { data: worker, error: workerError } = await supabase
        .from("worker")
        .select("id, user_id, tenant_id, first_name, last_name")
        .eq("id", workerId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (workerError) throw workerError;

      workerUserId =
        worker?.user_id != null && String(worker.user_id).trim()
          ? String(worker.user_id).trim()
          : null;
      resumeOwnerId = workerUserId || workerId;
      workerFirstName =
        worker?.first_name != null && String(worker.first_name).trim()
          ? String(worker.first_name).trim()
          : null;
      workerLastName =
        worker?.last_name != null && String(worker.last_name).trim()
          ? String(worker.last_name).trim()
          : null;

      if (!replacedResumeId) {
        await assertResumeUploadWithinLimit(supabase, {
          workerId,
          workerUserId,
          uploadedByUserId: auth.userId,
          role: "admin",
        });
      }
    }

    const safeName = buildWorkerResumeFileName({
      firstName: workerFirstName,
      lastName: workerLastName,
      originalFileName: file.name || "resume.pdf",
    });
    const objectPath = workerId
      ? `${resumeUploadFolder(workerId, Boolean(replacedResumeId))}/${randomUUID()}-${safeName}`
      : `admin-candidates/${tenantId}/${randomUUID()}/${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(WORKER_RESUMES_BUCKET)
      .upload(objectPath, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message || "Failed to upload resume" },
        { status: 500 }
      );
    }

    if (workerId && resumeOwnerId) {
      await persistWorkerResumeRecord(
        supabase,
        resumeOwnerId,
        {
          fileUrl: objectPath,
          originalFileName: safeName,
          fileType,
          fileSizeBytes: file.size,
          parsingStatus: "pending",
          textLength: extractedText.trim().length,
          extractedText,
          parsedData: { text: extractedText },
          jobApplicationId: applicationId,
          uploadedByUserId: auth.userId,
          uploaderRole: "admin",
          workerId,
          tenantId,
        },
        replacedResumeId
          ? { mode: "update", resumeId: replacedResumeId }
          : { mode: "insert" }
      );
      await syncWorkerPrimaryResumePath(supabase, workerId, resumeOwnerId);
    }

    if (profileId) {
      const { error: profileError } = await supabase
        .from("applicant_profiles")
        .update({
          resume_path: objectPath,
          resume_file_name: safeName,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenantId)
        .eq("id", profileId);
      if (profileError) throw profileError;
    }

    // Resume changed — reset match cache so UI can recalculate against the new file.
    // Keep previous file in storage until this new upload succeeds (we never delete first).
    const { error: matchResetError } = await supabase
      .from("job_applications")
      .update({
        ai_match_status: "READY",
        ai_match_score: null,
        ai_match_category: null,
        ai_match_action: null,
        ai_match_readiness: null,
        ai_match_display_category: null,
        ai_match_stage: null,
        ai_analysis: null,
        ai_analyzed_at: null,
        ai_analysis_error: null,
        ai_analysis_progress: null,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("id", applicationId);
    if (matchResetError) throw matchResetError;

    // Step 1 Quick Match runs automatically after résumé attach; manual Re-run remains available.
    const autoQuickMatch = await runAutoQuickMatchForApplication({
      supabase,
      tenantId,
      jobApplicationId: applicationId,
      analyzedByUserId: auth.userId,
      analysisProvider,
      reason: "admin_resume_upload",
    });

    return NextResponse.json({
      ok: true,
      path: objectPath,
      fileName: safeName,
      applicationId,
      workerId,
      autoQuickMatch,
    });
  } catch (error) {
    console.error("[admin/job-applications/resume]", error);
    return NextResponse.json(
      { error: formatApiError(error, "Failed to upload resume") },
      { status: isResumeUploadValidationError(error) ? 400 : 500 }
    );
  }
}

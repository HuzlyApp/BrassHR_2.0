import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractResumeTextFromUpload } from "@/lib/jobs/match-analysis/extract-resume-text";
import { queuedAutoQuickMatchResult } from "@/lib/jobs/match-analysis/auto-quick-match";
import { parseAnalysisProvider } from "@/lib/jobs/match-analysis/schema";
import { persistWorkerResumeRecord } from "@/lib/onboarding/persist-worker-resume-record";
import { syncWorkerPrimaryResumePath } from "@/lib/onboarding/sync-worker-primary-resume-path";
import { hashResumeBytes } from "@/lib/resume/resume-file-hash";
import { assertResumeObjectPath } from "@/lib/resume/resume-object-path";
import { resumeUploadFolder } from "@/lib/resume/resume-reupload-path";
import { runUploadedResumeProcessing } from "@/lib/resume/schedule-uploaded-resume-processing";
import { createResumeSignedUpload, readResumeObjectSize } from "@/lib/resume/signed-resume-upload";
import {
  resolveResumeFileType,
  validateExtractedResumeText,
  validateResumeUploadFile,
} from "@/lib/resume/validate-resume-upload";
import { buildWorkerResumeFileName } from "@/lib/resume/worker-resume-file-name";
import { WORKER_RESUMES_BUCKET } from "@/lib/supabase-storage-buckets";

const MAX_RESUME_BYTES = Number(process.env.MAX_RESUME_UPLOAD_BYTES ?? 10 * 1024 * 1024);

type JsonRecord = Record<string, unknown>;

function textField(body: JsonRecord, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

async function loadApplication(
  supabase: SupabaseClient,
  tenantId: string,
  applicationId: string
) {
  const { data, error } = await supabase
    .from("job_applications")
    .select("id, tenant_id, worker_id, applicant_profile_id")
    .eq("tenant_id", tenantId)
    .eq("id", applicationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function handleAdminResumeJsonPost(args: {
  supabase: SupabaseClient;
  tenantId: string;
  applicationId: string;
  userId: string;
  body: JsonRecord | null;
}): Promise<NextResponse> {
  const body = args.body;
  if (!body) return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  const phase = textField(body, "phase");
  if (phase === "prepare") return prepare(args.supabase, args.tenantId, args.applicationId, body);
  if (phase === "finalize") return finalize({ ...args, body });
  return NextResponse.json({ error: "Unknown resume upload phase." }, { status: 400 });
}

async function prepare(
  supabase: SupabaseClient,
  tenantId: string,
  applicationId: string,
  body: JsonRecord
): Promise<NextResponse> {
  const fileName = textField(body, "fileName");
  const contentType = textField(body, "contentType");
  const fileSizeBytes = Number(body.fileSizeBytes);
  const formatError = validateResumeUploadFile({
    name: fileName,
    type: contentType,
    size: Number.isFinite(fileSizeBytes) ? fileSizeBytes : 0,
    maxBytes: MAX_RESUME_BYTES,
  });
  if (formatError) return NextResponse.json({ error: formatError }, { status: 400 });
  if (resolveResumeFileType({ name: fileName, type: contentType }) === "doc") {
    return NextResponse.json(
      { error: "Legacy .doc files are not supported. Please save the resume as .docx or PDF." },
      { status: 400 }
    );
  }

  const application = await loadApplication(supabase, tenantId, applicationId);
  if (!application?.id) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  const workerId = typeof application.worker_id === "string" ? application.worker_id.trim() : "";
  const replacedResumeId = textField(body, "resumeId");
  let folder = `admin-candidates/${tenantId}`;
  let safeName = fileName || "resume.pdf";
  if (workerId) {
    const { data: worker } = await supabase
      .from("worker")
      .select("first_name, last_name")
      .eq("id", workerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    safeName = buildWorkerResumeFileName({
      firstName: worker?.first_name as string | null | undefined,
      lastName: worker?.last_name as string | null | undefined,
      originalFileName: fileName,
    });
    folder = resumeUploadFolder(workerId, Boolean(replacedResumeId));
  }
  const objectPath = `${folder}/${randomUUID()}-${safeName.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 180)}`;
  const signed = await createResumeSignedUpload(supabase, objectPath);
  return NextResponse.json({
    direct: true,
    uploadUrl: signed.uploadUrl,
    token: signed.token,
    objectPath: signed.objectPath,
    fileName: safeName,
  });
}

async function finalize(args: {
  supabase: SupabaseClient;
  tenantId: string;
  applicationId: string;
  userId: string;
  body: JsonRecord;
}): Promise<NextResponse> {
  const { supabase, tenantId, applicationId, userId, body } = args;
  const application = await loadApplication(supabase, tenantId, applicationId);
  if (!application?.id) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  const workerId = typeof application.worker_id === "string" ? application.worker_id.trim() : "";
  const replacedResumeId = textField(body, "resumeId");
  const prefixes = [
    workerId ? resumeUploadFolder(workerId, false) : "",
    workerId ? resumeUploadFolder(workerId, true) : "",
    `admin-candidates/${tenantId}`,
  ].filter(Boolean);

  let objectPath: string;
  try {
    objectPath = assertResumeObjectPath(textField(body, "objectPath"), prefixes);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid resume path." },
      { status: 400 }
    );
  }

  const objectSize = await readResumeObjectSize(supabase, objectPath);
  if (objectSize == null || objectSize <= 0) {
    return NextResponse.json({ error: "The resume upload did not finish. Please try again." }, { status: 400 });
  }
  if (objectSize > MAX_RESUME_BYTES) {
    return NextResponse.json({ error: "Max file size is 10 MB." }, { status: 400 });
  }

  const fileName = textField(body, "fileName") || "resume.pdf";
  const fileType = resolveResumeFileType({ name: fileName, type: textField(body, "contentType") });
  const analysisProvider = parseAnalysisProvider(body.analysisProvider);

  let savedResumeId = "";
  if (workerId) {
    const { data: worker } = await supabase
      .from("worker")
      .select("user_id")
      .eq("id", workerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const workerUserId = worker?.user_id != null ? String(worker.user_id).trim() : "";
    const ownerId = workerUserId || workerId;
    const persisted = await persistWorkerResumeRecord(
      supabase,
      ownerId,
      {
        fileUrl: objectPath,
        originalFileName: fileName,
        fileType,
        fileSizeBytes: objectSize,
        parsingStatus: "processing",
        jobApplicationId: applicationId,
        uploadedByUserId: userId,
        uploaderRole: "admin",
        workerId,
        tenantId,
        enforceUploadLimit: !replacedResumeId,
        preserveParsedJson: false,
      },
      { mode: "insert" }
    );
    savedResumeId = persisted || "";
    await syncWorkerPrimaryResumePath(supabase, workerId, ownerId);
  }

  const profileId =
    typeof application.applicant_profile_id === "string" ? application.applicant_profile_id.trim() : "";
  if (profileId) {
    await supabase
      .from("applicant_profiles")
      .update({
        resume_path: objectPath,
        resume_file_name: fileName,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("id", profileId);
  }

  const capturedResumeId = savedResumeId;
  const capturedWorkerId = workerId;
  const capturedReplacedId = replacedResumeId;
  after(async () => {
    const { data, error } = await supabase.storage.from(WORKER_RESUMES_BUCKET).download(objectPath);
    if (error || !data) {
      if (capturedResumeId) {
        await supabase
          .from("worker_resumes")
          .update({ parsing_status: "failed", parse_status: "failed", parse_error: "Could not read the uploaded resume." })
          .eq("id", capturedResumeId);
      }
      return;
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    const fileHash = hashResumeBytes(buffer);
    let text = "";
    try {
      text = await extractResumeTextFromUpload(buffer, fileName);
    } catch (extractError) {
      const message = extractError instanceof Error ? extractError.message : "Could not read resume.";
      if (capturedResumeId) {
        await supabase
          .from("worker_resumes")
          .update({
            parsing_status: "failed",
            parse_status: "failed",
            parse_error: message,
            file_hash: fileHash,
          })
          .eq("id", capturedResumeId);
      }
      return;
    }
    const contentError = validateExtractedResumeText(text);
    if (contentError) {
      if (capturedResumeId) {
        await supabase
          .from("worker_resumes")
          .update({
            parsing_status: "failed",
            parse_status: "failed",
            parse_error: contentError,
            extracted_text: text,
            file_hash: fileHash,
            text_length: text.trim().length,
          })
          .eq("id", capturedResumeId);
      }
      return;
    }

    if (capturedReplacedId) {
      const { data: previous } = await supabase
        .from("worker_resumes")
        .select("file_hash")
        .eq("id", capturedReplacedId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const { data: applicationMatch } = await supabase
        .from("job_applications")
        .select("ai_match_status")
        .eq("id", applicationId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (previous?.file_hash === fileHash && applicationMatch?.ai_match_status === "ANALYZED") {
        if (capturedResumeId) {
          await supabase
            .from("worker_resumes")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", capturedResumeId)
            .eq("tenant_id", tenantId);
        }
        if (capturedWorkerId) {
          await syncWorkerPrimaryResumePath(supabase, capturedWorkerId);
        }
        return;
      }
    }

    if (capturedResumeId) {
      await supabase
        .from("worker_resumes")
        .update({
          extracted_text: text,
          parsed_data: { text },
          file_hash: fileHash,
          text_length: text.trim().length,
          parsing_status: "processing",
          parse_status: "processing",
        })
        .eq("id", capturedResumeId)
        .eq("tenant_id", tenantId);
    }

    await supabase
      .from("job_applications")
      .update({
        ai_match_status: "ANALYZING",
        ai_match_score: null,
        ai_match_category: null,
        ai_match_action: null,
        ai_match_readiness: null,
        ai_match_display_category: null,
        ai_match_stage: null,
        ai_analysis: null,
        ai_analysis_progress: "preparing",
        ai_analysis_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("id", applicationId);

    await runUploadedResumeProcessing({
      supabase,
      resumeId: capturedResumeId,
      text,
      fileHash,
      workerId: capturedWorkerId,
      tenantId,
      jobApplicationId: applicationId,
      analyzedByUserId: userId,
      analysisProvider,
      reason: "admin_resume_direct_upload",
      skipParse: !capturedResumeId,
      supersedeResumeId: capturedReplacedId && capturedReplacedId !== capturedResumeId ? capturedReplacedId : null,
    });
  });

  return NextResponse.json({
    ok: true,
    path: objectPath,
    fileName,
    applicationId,
    workerId: workerId || null,
    parseStatus: "processing",
    autoQuickMatch: queuedAutoQuickMatchResult(),
  });
}

import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { extractResumeTextFromUpload } from "@/lib/jobs/match-analysis/extract-resume-text";
import { JobValidationError } from "@/lib/jobs/types";
import { startOrResumeJobApplication } from "@/lib/jobs/service";
import { persistWorkerResumeRecord } from "@/lib/onboarding/persist-worker-resume-record";
import {
  resolveOrEnsureWorkerForApplicant,
  resolveWorkerByApplicantId,
  type WorkerContext,
} from "@/lib/onboarding/resolve-worker-context";
import { syncWorkerPrimaryResumePath } from "@/lib/onboarding/sync-worker-primary-resume-path";
import { isDraftPreviewApplicantId } from "@/lib/onboarding/is-draft-preview";
import { hashResumeBytes } from "@/lib/resume/resume-file-hash";
import { assertResumeObjectPath } from "@/lib/resume/resume-object-path";
import { runUploadedResumeProcessing } from "@/lib/resume/schedule-uploaded-resume-processing";
import { createResumeSignedUpload, readResumeObjectSize } from "@/lib/resume/signed-resume-upload";
import { createTimer, logResumeTiming } from "@/lib/resume/timing";
import { validateExtractedResumeText, validateResumeUploadFile } from "@/lib/resume/validate-resume-upload";
import { buildWorkerResumeFileName } from "@/lib/resume/worker-resume-file-name";
import { parseServiceAreaLocation } from "@/lib/service-area/parse-location";
import { jobValidationServiceAreaResponse } from "@/lib/service-area/http";
import { getSupabaseUrl } from "@/lib/supabase-env";
import { WORKER_RESUMES_BUCKET } from "@/lib/supabase-storage-buckets";

const MAX_RESUME_BYTES = Number(process.env.MAX_RESUME_UPLOAD_BYTES ?? 10 * 1024 * 1024);

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function textField(body: JsonRecord, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

function serviceClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function resolveWorker(
  supabase: SupabaseClient,
  applicantId: string,
  tenantSlug: string,
  workerIdHint: string,
  tenantIdHint: string
): Promise<WorkerContext | null> {
  if (tenantIdHint) {
    const owned = await resolveWorkerByApplicantId(supabase, applicantId, tenantIdHint);
    if (owned) return owned;
  }
  return resolveOrEnsureWorkerForApplicant(supabase, applicantId, tenantSlug || null);
}

function fileTypeFromName(fileName: string): "pdf" | "docx" | "doc" | "unknown" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".doc")) return "doc";
  return "unknown";
}

async function markResumeFailed(
  supabase: SupabaseClient,
  resumeId: string,
  message: string
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("worker_resumes")
    .update({
      parsing_status: "failed",
      parse_status: "failed",
      parse_error: message.slice(0, 500),
      parse_completed_at: now,
    })
    .eq("id", resumeId);
}

export async function handleApplicantResumeJsonPost(req: Request): Promise<NextResponse> {
  const body = asRecord(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  const phase = textField(body, "phase");
  if (phase === "prepare") return prepareApplicantResumeUpload(body);
  if (phase === "finalize") return finalizeApplicantResumeUpload(req, body);
  return NextResponse.json({ error: "Unknown resume upload phase." }, { status: 400 });
}

async function prepareApplicantResumeUpload(body: JsonRecord): Promise<NextResponse> {
  const applicantId = textField(body, "applicantId");
  const fileName = textField(body, "fileName");
  const contentType = textField(body, "contentType");
  const fileSizeBytes = Number(body.fileSizeBytes);
  if (!applicantId) {
    return NextResponse.json({ error: "Applicant session is required before uploading a resume" }, { status: 400 });
  }
  if (isDraftPreviewApplicantId(applicantId)) {
    return NextResponse.json({ direct: false });
  }
  const formatError = validateResumeUploadFile({
    name: fileName,
    type: contentType,
    size: Number.isFinite(fileSizeBytes) ? fileSizeBytes : 0,
    maxBytes: MAX_RESUME_BYTES,
  });
  if (formatError) return NextResponse.json({ error: formatError }, { status: 400 });
  const fileType = fileTypeFromName(fileName);
  if (fileType === "doc") {
    return NextResponse.json(
      { error: "Legacy .doc files are not supported. Please save your resume as .docx or PDF." },
      { status: 400 }
    );
  }

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role not configured" }, { status: 503 });
  }

  const tenantSlug = textField(body, "tenantSlug").toLowerCase();
  const worker = await resolveWorker(
    supabase,
    applicantId,
    tenantSlug,
    textField(body, "workerId"),
    textField(body, "tenantId")
  );
  if (!worker) {
    return NextResponse.json(
      { error: "We could not start your application. Please try again." },
      { status: 400 }
    );
  }

  const { data: workerNames } = await supabase
    .from("worker")
    .select("first_name, last_name")
    .eq("id", worker.workerId)
    .maybeSingle();
  const storedFileName = buildWorkerResumeFileName({
    firstName: workerNames?.first_name as string | null | undefined,
    lastName: workerNames?.last_name as string | null | undefined,
    originalFileName: fileName,
  });
  const objectPath = `${applicantId}/${randomUUID()}-${storedFileName.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200)}`;
  const signed = await createResumeSignedUpload(supabase, objectPath);
  return NextResponse.json({
    direct: true,
    uploadUrl: signed.uploadUrl,
    token: signed.token,
    objectPath: signed.objectPath,
    fileName: storedFileName,
  });
}

async function finalizeApplicantResumeUpload(req: Request, body: JsonRecord): Promise<NextResponse> {
  const routeTimer = createTimer();
  const applicantId = textField(body, "applicantId");
  const fileName = textField(body, "fileName");
  const contentType = textField(body, "contentType");
  const declaredSize = Number(body.fileSizeBytes);
  if (!applicantId || isDraftPreviewApplicantId(applicantId)) {
    return NextResponse.json({ error: "Applicant session is required before uploading a resume" }, { status: 400 });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role not configured" }, { status: 503 });
  }

  let objectPath: string;
  try {
    objectPath = assertResumeObjectPath(textField(body, "objectPath"), [applicantId]);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid resume path." },
      { status: 400 }
    );
  }

  const objectSize = await readResumeObjectSize(supabase, objectPath);
  if (objectSize == null || objectSize <= 0) {
    return NextResponse.json(
      { error: "The resume upload did not finish. Please try again." },
      { status: 400 }
    );
  }
  if (objectSize > MAX_RESUME_BYTES) {
    return NextResponse.json({ error: "Resume file is too large" }, { status: 400 });
  }

  const tenantSlug = textField(body, "tenantSlug").toLowerCase();
  const worker = await resolveWorker(
    supabase,
    applicantId,
    tenantSlug,
    textField(body, "workerId"),
    textField(body, "tenantId")
  );
  if (!worker) {
    return NextResponse.json(
      { error: "We could not start your application. Please try again." },
      { status: 400 }
    );
  }

  const jobToken = textField(body, "jobToken");
  const workLocation = parseServiceAreaLocation(body.workLocation);
  let jobApplication: {
    application: { id: string; applicant_workflow_instance_id?: string | null };
    resumed: boolean;
  } | null = null;
  if (jobToken) {
    try {
      jobApplication = await startOrResumeJobApplication(supabase, {
        tenantId: worker.tenantId,
        jobToken,
        applicantAuthUserId: applicantId,
        workerId: worker.workerId,
        workLocation,
      });
    } catch (error) {
      const serviceArea =
        error instanceof JobValidationError ? jobValidationServiceAreaResponse(error, true) : null;
      if (serviceArea) return serviceArea;
      const message = error instanceof Error ? error.message : "This job is unavailable.";
      return NextResponse.json({ error: message }, { status: error instanceof JobValidationError ? 409 : 500 });
    }
  }

  const storedFileName = textField(body, "storedFileName") || fileName || "resume.pdf";
  const fileType = fileTypeFromName(storedFileName || fileName);
  let resumeId: string | null = null;
  try {
    resumeId = await persistWorkerResumeRecord(supabase, applicantId, {
      fileUrl: objectPath,
      originalFileName: storedFileName,
      parsedData: {},
      parsingStatus: "processing",
      fileType,
      fileSizeBytes: objectSize || (Number.isFinite(declaredSize) ? declaredSize : null),
      jobApplicationId: jobApplication?.application.id ?? null,
      uploadedByUserId: applicantId,
      uploaderRole: "worker",
      enforceUploadLimit: false,
      workerId: worker.workerId,
      tenantId: worker.tenantId,
    });
    await syncWorkerPrimaryResumePath(supabase, worker.workerId, applicantId);
  } catch (error) {
    if (jobApplication && !jobApplication.resumed) {
      await supabase
        .from("job_applications")
        .delete()
        .eq("id", jobApplication.application.id)
        .eq("tenant_id", worker.tenantId);
    }
    const message = error instanceof Error ? error.message : "Failed to save resume record";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!resumeId) {
    return NextResponse.json(
      { error: "Resume was uploaded but the resume database record was not created." },
      { status: 500 }
    );
  }

  const capturedResumeId = resumeId;
  const capturedWorkerId = worker.workerId;
  const capturedTenantId = worker.tenantId;
  const capturedApplicationId = jobApplication?.application.id ?? null;
  const capturedFileName = storedFileName || fileName;
  const capturedContentType = contentType;
  after(async () => {
    const started = Date.now();
    const { data, error } = await supabase.storage.from(WORKER_RESUMES_BUCKET).download(objectPath);
    if (error || !data) {
      await markResumeFailed(supabase, capturedResumeId, "Could not read the uploaded resume.");
      return;
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    const fileHash = hashResumeBytes(buffer);
    let text = "";
    try {
      text = await extractResumeTextFromUpload(buffer, capturedFileName || "resume.pdf");
    } catch (extractError) {
      const message =
        extractError instanceof Error ? extractError.message : "Could not read resume.";
      await supabase
        .from("worker_resumes")
        .update({ file_hash: fileHash, extraction_ms: Date.now() - started })
        .eq("id", capturedResumeId);
      await markResumeFailed(supabase, capturedResumeId, message);
      logResumeTiming("upload-resume", "direct-extraction-failed-kept", {
        resumeId: capturedResumeId,
        fileSizeBytes: buffer.byteLength,
      });
      return;
    }

    const contentError = validateExtractedResumeText(text);
    const extractionMs = Date.now() - started;
    if (contentError) {
      await supabase
        .from("worker_resumes")
        .update({
          file_hash: fileHash,
          extracted_text: text,
          text_length: text.trim().length,
          extraction_ms: extractionMs,
        })
        .eq("id", capturedResumeId);
      await markResumeFailed(supabase, capturedResumeId, contentError);
      return;
    }

    await supabase
      .from("worker_resumes")
      .update({
        file_hash: fileHash,
        extracted_text: text,
        parsed_data: { text },
        text_length: text.trim().length,
        extraction_ms: extractionMs,
        parsing_status: "processing",
        parse_status: "processing",
      })
      .eq("id", capturedResumeId);

    logResumeTiming("upload-resume", "direct-extraction-complete", {
      resumeId: capturedResumeId,
      extractionMs,
      textLength: text.trim().length,
      fileSizeBytes: buffer.byteLength,
      contentType: capturedContentType || null,
    });

    await runUploadedResumeProcessing({
      supabase,
      resumeId: capturedResumeId,
      text,
      fileHash,
      workerId: capturedWorkerId,
      tenantId: capturedTenantId,
      jobApplicationId: capturedApplicationId,
      reason: "candidate_resume_upload",
      skipMatch: !capturedApplicationId,
    });
  });

  logResumeTiming("upload-resume", "direct-response", {
    totalMs: routeTimer.elapsedMs(),
    fileSizeBytes: objectSize,
    resumeId: capturedResumeId,
    parseStatus: "processing",
  });

  return NextResponse.json({
    resumeId: capturedResumeId,
    fileName: storedFileName,
    storagePath: objectPath,
    parseStatus: "processing",
    bucket: WORKER_RESUMES_BUCKET,
    textLength: null,
    applicationId: jobApplication?.application.id ?? null,
    workflowInstanceId: jobApplication?.application.applicant_workflow_instance_id ?? null,
    resumedApplication: jobApplication?.resumed ?? false,
  });
}

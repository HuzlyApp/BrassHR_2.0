import { randomUUID } from "node:crypto"
import { after, NextResponse } from "next/server"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import mammoth from "mammoth"
import { extractPdfText } from "@/lib/resume/extract-pdf-text"
import { getSupabaseUrl } from "@/lib/supabase-env"
import { syncWorkerPrimaryResumePath } from "@/lib/onboarding/sync-worker-primary-resume-path"
import { persistWorkerResumeRecord } from "@/lib/onboarding/persist-worker-resume-record"
import { resolveOrEnsureWorkerForApplicant, resolveWorkerByApplicantId, type WorkerContext } from "@/lib/onboarding/resolve-worker-context"
import { isDraftPreviewApplicantId } from "@/lib/onboarding/is-draft-preview"
import { runResumeParseJob } from "@/lib/resume/run-resume-parse-job"
import { createTimer, logResumeTiming } from "@/lib/resume/timing"
import { sendResumeContinuationEmail } from "@/lib/onboarding/send-resume-continuation-email"
import { resolveApplicantEmailAppOrigin } from "@/lib/resolve-app-origin"
import { WORKER_RESUMES_BUCKET } from "@/lib/supabase-storage-buckets"
import { enforceRateLimit, getClientIp } from "@/lib/security/rate-limit"
import { JobValidationError } from "@/lib/jobs/types"
import { startOrResumeJobApplication } from "@/lib/jobs/service"
import { parseServiceAreaLocationFromFormData } from "@/lib/service-area/parse-location"
import { jobValidationServiceAreaResponse } from "@/lib/service-area/http"
import { isResumeUploadValidationError } from "@/lib/resume/validate-resume-upload"
import { normalizeResumeWhitespace } from "@/lib/jobs/match-analysis/sanitize-resume"
import { repairExtractedResumeText } from "@/lib/resume/normalize-resume-text"
import { buildWorkerResumeFileName } from "@/lib/resume/worker-resume-file-name"
import { scheduleAutoQuickMatchForApplication } from "@/lib/jobs/match-analysis/auto-quick-match"

function finalizeExtractedResumeText(text: string): string {
  return repairExtractedResumeText(normalizeResumeWhitespace(text))
}

export const runtime = "nodejs"
const MAX_RESUME_BYTES = Number(process.env.MAX_RESUME_UPLOAD_BYTES ?? 10 * 1024 * 1024)
const STORAGE_UPLOAD_TIMEOUT_MS = Number(process.env.RESUME_STORAGE_UPLOAD_TIMEOUT_MS ?? 45_000)
const RESUME_DB_TIMEOUT_MS = Number(process.env.RESUME_DB_TIMEOUT_MS ?? 6_000)
const WORKER_ENSURE_TIMEOUT_MS = Number(process.env.RESUME_WORKER_ENSURE_TIMEOUT_MS ?? 15_000)
const ALLOWED_RESUME_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
])

function sanitizeFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200)
}

function resolveFileType(file: Pick<File, "name" | "type">): string {
  const lower = file.name.toLowerCase()
  const mime = (file.type || "").toLowerCase()
  if (mime === "application/pdf" || lower.endsWith(".pdf")) return "pdf"
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    return "docx"
  }
  if (mime === "application/msword" || lower.endsWith(".doc")) return "doc"
  return "unknown"
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer)
    }),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    }),
  ])
}

async function resolveWorkerForUpload(
  supabase: SupabaseClient,
  applicantId: string,
  tenantSlug: string,
  workerIdHint: string,
  tenantIdHint: string,
): Promise<WorkerContext | null> {
  // Hints come from the browser; only accept the worker this applicant owns in that tenant.
  if (tenantIdHint) {
    const owned = await resolveWorkerByApplicantId(supabase, applicantId, tenantIdHint)
    if (owned) {
      if (workerIdHint && owned.workerId !== workerIdHint) {
        console.warn("[upload-resume] ignoring workerId hint not owned by applicant", {
          applicantId,
          workerIdHint,
          resolvedWorkerId: owned.workerId,
        })
      }
      return owned
    }
  }

  return resolveOrEnsureWorkerForApplicant(supabase, applicantId, tenantSlug || null)
}

async function extractText(buffer: Buffer, file: Pick<File, "name" | "type">): Promise<string> {
  const lower = file.name.toLowerCase()
  const mime = (file.type || "").toLowerCase()

  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    return finalizeExtractedResumeText(await extractPdfText(buffer))
  }

  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer })
    return finalizeExtractedResumeText(result.value || "")
  }

  if (mime === "application/msword" || lower.endsWith(".doc")) {
    throw new Error(
      "Legacy .doc files are not supported. Please save your resume as .docx or PDF."
    )
  }

  throw new Error("Only PDF, DOC, and DOCX resumes are supported")
}

export async function POST(req: Request) {
  const routeTimer = createTimer()

  const limited = await enforceRateLimit(req, {
    namespace: "upload-resume",
    key: getClientIp(req),
    limit: Number(process.env.RATE_LIMIT_UPLOADS_PER_HOUR ?? 20),
    windowMs: 60 * 60 * 1000,
    failClosed: false,
  })
  if (limited) return limited

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const applicantIdRaw = formData.get("applicantId")
  const applicantId =
    typeof applicantIdRaw === "string" ? applicantIdRaw.trim() : ""
  const tenantSlugRaw = formData.get("tenantSlug")
  const tenantSlug =
    typeof tenantSlugRaw === "string" ? tenantSlugRaw.trim().toLowerCase() : ""
  const workerIdHint =
    typeof formData.get("workerId") === "string" ? String(formData.get("workerId")).trim() : ""
  const tenantIdHint =
    typeof formData.get("tenantId") === "string" ? String(formData.get("tenantId")).trim() : ""
  const jobToken =
    typeof formData.get("jobToken") === "string" ? String(formData.get("jobToken")).trim() : ""
  const workLocation = parseServiceAreaLocationFromFormData(formData)

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
  }
  if (!applicantId) {
    return NextResponse.json({ error: "Applicant session is required before uploading a resume" }, { status: 400 })
  }
  const lowerName = file.name.toLowerCase()
  const mime = (file.type || "").toLowerCase()
  const fileType = resolveFileType(file)
  const fileSizeBytes = file.size

  if (file.size > MAX_RESUME_BYTES) {
    return NextResponse.json({ error: "Resume file is too large" }, { status: 400 })
  }
  if (
    !ALLOWED_RESUME_MIME.has(mime) &&
    !lowerName.endsWith(".pdf") &&
    !lowerName.endsWith(".docx") &&
    !lowerName.endsWith(".doc")
  ) {
    return NextResponse.json({ error: "Only PDF, DOC, and DOCX resumes are supported" }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  /**
   * Admin Test workflow / draft preview uses a synthetic applicant id.
   * Validate + extract text, but never create production workers, applications, or resumes.
   */
  if (isDraftPreviewApplicantId(applicantId)) {
    const extractionTimer = createTimer()
    let text = ""
    let extractionError: string | null = null
    try {
      text = await extractText(buffer, { name: file.name, type: file.type || "application/octet-stream" })
    } catch (e: unknown) {
      extractionError = e instanceof Error ? e.message : "Could not read resume"
      if (fileType === "doc" || lowerName.endsWith(".doc")) {
        return NextResponse.json({ error: extractionError }, { status: 400 })
      }
    }

    const resumeId = `draft-preview-${randomUUID()}`
    const extractionMs = extractionTimer.elapsedMs()
    const textLength = text.trim().length

    console.info("[upload-resume] workflow_test_resume_upload", {
      stage: "resume_upload_init",
      applicantId,
      tenantSlug: tenantSlug || null,
      fileType,
      fileSizeBytes,
      textLength,
      extractionError: extractionError ? "extract_failed" : null,
    })
    logResumeTiming("upload-resume", "workflow-test-complete", {
      totalMs: routeTimer.elapsedMs(),
      extractionMs,
      textLength,
      fileType,
      fileSizeBytes,
      resumeId,
      parseStatus: textLength > 0 ? "completed" : "skipped",
    })

    return NextResponse.json({
      resumeId,
      fileName: file.name,
      storagePath: null,
      parseStatus: textLength > 0 ? "completed" : "skipped",
      bucket: null,
      textLength,
      extractionMs,
      applicationId: null,
      workflowInstanceId: null,
      resumedApplication: false,
      workflowTest: true,
      draftPreview: true,
    })
  }

  const url = getSupabaseUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json(
      { error: "Supabase service role not configured" },
      { status: 503 }
    )
  }

  const supabase = createClient(url, key)
  const workerTimer = createTimer()
  logResumeTiming("upload-resume", "worker-ensure-start", {
    applicantId,
    tenantSlug,
    workerIdHint: workerIdHint || null,
  })

  let workerCtx: WorkerContext | null = null
  try {
    workerCtx = await withTimeout(
      resolveWorkerForUpload(supabase, applicantId, tenantSlug, workerIdHint, tenantIdHint),
      workerIdHint || tenantIdHint ? RESUME_DB_TIMEOUT_MS : WORKER_ENSURE_TIMEOUT_MS,
      "Worker profile setup",
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Worker profile setup timed out"
    console.error("[upload-resume] worker ensure", msg)
    return NextResponse.json({ error: msg }, { status: 504 })
  }

  const workerEnsureMs = workerTimer.elapsedMs()
  logResumeTiming("upload-resume", "worker-ensure-complete", {
    workerEnsureMs,
    workerId: workerCtx?.workerId ?? null,
    tenantId: workerCtx?.tenantId ?? null,
  })

  if (!workerCtx) {
    console.error("[upload-resume] applicant_create failed", {
      stage: "applicant_create",
      applicantId,
      tenantSlug: tenantSlug || null,
      hasWorkerHint: Boolean(workerIdHint),
      hasTenantHint: Boolean(tenantIdHint),
    })
    return NextResponse.json(
      {
        error: tenantSlug
          ? "We could not start your application. Please try again."
          : "This application link belongs to an invalid or unavailable organization.",
      },
      { status: 400 },
    )
  }

  let jobApplication:
    | {
        application: {
          id: string
          applicant_workflow_instance_id?: string | null
          status: string
        }
        resumed: boolean
      }
    | null = null
  if (jobToken) {
    try {
      jobApplication = await startOrResumeJobApplication(supabase, {
        tenantId: workerCtx.tenantId,
        jobToken,
        applicantAuthUserId: applicantId,
        workerId: workerCtx.workerId,
        workLocation,
      })
    } catch (error) {
      const serviceArea = error instanceof JobValidationError
        ? jobValidationServiceAreaResponse(error, true)
        : null
      if (serviceArea) return serviceArea
      const validation =
        error instanceof JobValidationError ||
        (error instanceof Error && error.name === "JobValidationError");
      const status = validation ? 409 : 500;
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" &&
              error &&
              "message" in error &&
              typeof (error as { message?: unknown }).message === "string"
            ? (error as { message: string }).message
            : "This job is unavailable or no longer accepting applications.";
      console.error("[upload-resume] startOrResumeJobApplication", {
        jobToken,
        tenantId: workerCtx.tenantId,
        error,
      });
      return NextResponse.json(
        {
          error: message,
          code:
            validation && error instanceof JobValidationError
              ? error.code
              : typeof error === "object" &&
                  error &&
                  "code" in error &&
                  typeof (error as { code?: unknown }).code === "string"
                ? (error as { code: string }).code
                : undefined,
        },
        { status }
      );
    }
  }

  // An application without its resume is an orphan entry on the job; undo it when the upload fails.
  const newApplicationId =
    jobApplication && !jobApplication.resumed ? jobApplication.application.id : null
  const applicationTenantId = workerCtx.tenantId
  const discardNewApplication = async () => {
    if (!newApplicationId) return
    const { error } = await supabase
      .from("job_applications")
      .delete()
      .eq("id", newApplicationId)
      .eq("tenant_id", applicationTenantId)
    if (error) {
      console.error("[upload-resume] failed to discard application after upload error", {
        applicationId: newApplicationId,
        error: error.message,
      })
    }
  }

  const folder = applicantId
  const { data: workerNames } = await supabase
    .from("worker")
    .select("first_name, last_name")
    .eq("id", workerCtx.workerId)
    .maybeSingle()
  const storedFileName = buildWorkerResumeFileName({
    firstName: workerNames?.first_name as string | null | undefined,
    lastName: workerNames?.last_name as string | null | undefined,
    originalFileName: file.name,
  })
  const objectPath = `${folder}/${randomUUID()}-${sanitizeFileName(storedFileName)}`

  const storageTimer = createTimer()
  let uploadError: { message?: string } | null = null
  try {
    logResumeTiming("upload-resume", "storage-start", {
      fileType,
      fileSizeBytes,
      objectPath,
    })
    const uploadResult = await withTimeout(
      supabase.storage
        .from(WORKER_RESUMES_BUCKET)
        .upload(objectPath, buffer, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        }),
      STORAGE_UPLOAD_TIMEOUT_MS,
      "Resume storage upload",
    )
    uploadError = uploadResult.error
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Resume storage upload timed out"
    console.error("[upload-resume] storage upload timeout", msg)
    await discardNewApplication()
    return NextResponse.json({ error: msg }, { status: 504 })
  }
  const storageUploadMs = storageTimer.elapsedMs()

  if (uploadError) {
    console.error("[upload-resume] storage upload", uploadError)
    await discardNewApplication()
    return NextResponse.json(
      { error: uploadError.message || "Failed to store resume" },
      { status: 500 }
    )
  }

  logResumeTiming("upload-resume", "storage-complete", {
    storageUploadMs,
    fileType,
    fileSizeBytes,
  })

  const extractionTimer = createTimer()
  let text: string
  try {
    logResumeTiming("upload-resume", "extraction-start", {
      fileType,
      fileSizeBytes,
      objectPath,
    })
    text = await extractText(buffer, { name: file.name, type: file.type || "application/octet-stream" })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Could not read resume"
    await discardNewApplication()
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  const extractionMs = extractionTimer.elapsedMs()
  const textLength = text.trim().length
  logResumeTiming("upload-resume", "extraction-complete", {
    extractionMs,
    textLength,
    fileType,
    fileSizeBytes,
  })

  let resumeId: string | null
  const parseStartedAt = new Date().toISOString()

  try {
    const dbTimer = createTimer()
    logResumeTiming("upload-resume", "db-write-start", {
      workerId: workerCtx.workerId,
      tenantId: workerCtx.tenantId,
      textLength,
    })
    resumeId = await withTimeout(
      persistWorkerResumeRecord(supabase, applicantId, {
        fileUrl: objectPath,
        originalFileName: storedFileName,
        parsedData: { text },
        parsingStatus: "processing",
        textLength,
        extractionMs,
        parseStartedAt,
        fileType,
        fileSizeBytes,
        extractedText: text,
        jobApplicationId: jobApplication?.application.id ?? null,
        uploadedByUserId: applicantId,
        uploaderRole: "worker",
        enforceUploadLimit: false,
      }),
      RESUME_DB_TIMEOUT_MS,
      "Resume record persistence",
    )
    await withTimeout(
      syncWorkerPrimaryResumePath(supabase, workerCtx.workerId, applicantId),
      RESUME_DB_TIMEOUT_MS,
      "Resume path persistence",
    )
    logResumeTiming("upload-resume", "db-write-complete", {
      dbWriteMs: dbTimer.elapsedMs(),
      resumeId,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save resume record"
    console.error("[upload-resume] worker_resumes", e)
    await discardNewApplication()
    return NextResponse.json(
      { error: msg },
      { status: isResumeUploadValidationError(e) ? 400 : 500 },
    )
  }

  if (!resumeId) {
    await discardNewApplication()
    return NextResponse.json(
      { error: "Resume was uploaded but the resume database record was not created." },
      { status: 500 },
    )
  }

  const capturedResumeId = resumeId
  const capturedWorkerId = workerCtx.workerId
  const capturedTenantId = workerCtx.tenantId
  const capturedText = text
  const capturedTenantSlug = tenantSlug
  const capturedApplicationId = jobApplication?.application.id ?? null
  if (text.trim()) {
    after(async () => {
      const origin = resolveApplicantEmailAppOrigin(req)

      console.info("[upload-resume] resume upload success", {
        workerId: capturedWorkerId,
        tenantId: capturedTenantId,
        resumeId: capturedResumeId,
        textLength,
        origin: origin ?? null,
      })

      if (capturedApplicationId && capturedTenantId) {
        scheduleAutoQuickMatchForApplication({
          supabase,
          tenantId: capturedTenantId,
          jobApplicationId: capturedApplicationId,
          analyzedByUserId: null,
          reason: "candidate_resume_upload",
        })
      }

      if (origin) {
        await sendResumeContinuationEmail(supabase, {
          workerId: capturedWorkerId,
          tenantId: capturedTenantId,
          resumeId: capturedResumeId,
          origin,
          tenantSlug: capturedTenantSlug || null,
          extractedText: capturedText,
          trigger: "resume_upload",
          request: req,
        })
      } else {
        console.warn("[upload-resume] skipping continuation email — could not resolve app origin", {
          workerId: capturedWorkerId,
          resumeId: capturedResumeId,
        })
      }

      logResumeTiming("upload-resume", "ai-parse-enqueued", {
        resumeId: capturedResumeId,
        textLength,
      })
      await runResumeParseJob({
        supabase,
        resumeId: capturedResumeId,
        text: capturedText,
        continuationEmail:
          origin && capturedWorkerId && capturedTenantId
            ? {
                workerId: capturedWorkerId,
                tenantId: capturedTenantId,
                resumeId: capturedResumeId,
                origin,
                tenantSlug: capturedTenantSlug || null,
                request: req,
              }
            : undefined,
      })
    })
  } else if (capturedResumeId) {
    after(async () => {
      const origin = resolveApplicantEmailAppOrigin(req)
      if (!origin) return

      await sendResumeContinuationEmail(supabase, {
        workerId: capturedWorkerId,
        tenantId: capturedTenantId,
        resumeId: capturedResumeId,
        origin,
        tenantSlug: capturedTenantSlug || null,
        extractedText: capturedText,
        trigger: "resume_upload",
        request: req,
      })
    })
  }

  const totalMs = routeTimer.elapsedMs()
  logResumeTiming("upload-resume", "response", {
    totalMs,
    storageUploadMs,
    workerEnsureMs,
    extractionMs,
    textLength,
    fileType,
    fileSizeBytes,
    resumeId: capturedResumeId,
    parseStatus: "processing",
  })

  return NextResponse.json({
    resumeId: capturedResumeId,
    fileName: storedFileName,
    storagePath: objectPath,
    parseStatus: "processing",
    bucket: WORKER_RESUMES_BUCKET,
    textLength,
    extractionMs,
    applicationId: jobApplication?.application.id ?? null,
    workflowInstanceId:
      jobApplication?.application.applicant_workflow_instance_id ?? null,
    resumedApplication: jobApplication?.resumed ?? false,
  })
}

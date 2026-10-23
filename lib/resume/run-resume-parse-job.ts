import type { SupabaseClient } from "@supabase/supabase-js"
import {
  evaluateResumeParseQuality,
  normalizedResumeToStoredJson,
  RESUME_PARSE_FAILED_USER_MESSAGE,
} from "@/lib/resumeParseQuality"
import { grokParseResume } from "@/lib/resume/grok-parse-resume"
import { sanitizePostgresJson, stripNullBytes } from "@/lib/resume/sanitize-postgres-text"
import { createTimer, logResumeTiming } from "@/lib/resume/timing"
import { sendResumeContinuationEmail } from "@/lib/onboarding/send-resume-continuation-email"
import { buildWorkerResumeFileName } from "@/lib/resume/worker-resume-file-name"

export type ResumeParseJobResult = {
  parsingStatus: "completed" | "failed"
  parsedJson: Record<string, string> | null
  parseError: string | null
  aiParseMs: number
  qualityPassed: boolean
}

export type ResumeParseContinuationEmailParams = {
  workerId: string
  tenantId: string
  resumeId: string
  origin: string
  tenantSlug?: string | null
  request?: Request
}

export async function runResumeParseJob(params: {
  supabase: SupabaseClient
  resumeId: string
  text: string
  continuationEmail?: ResumeParseContinuationEmailParams
  /** Present when the caller did not already copy a completed parse for this hash. */
  fileHash?: string | null
  workerId?: string | null
  tenantId?: string | null
}): Promise<ResumeParseJobResult> {
  const { supabase, resumeId, text } = params
  const safeText = stripNullBytes(text)
  const jobTimer = createTimer()
  const now = new Date().toISOString()

  await supabase
    .from("worker_resumes")
    .update({
      parsing_status: "processing",
      parse_status: "processing",
      parse_started_at: now,
      parse_error: null,
    })
    .eq("id", resumeId)

  logResumeTiming("resume-parse-job", "started", {
    resumeId,
    textLength: text.length,
  })

  if (params.fileHash && params.workerId && params.tenantId) {
    const { findReusableResumeParse } = await import("@/lib/resume/find-reusable-resume-parse")
    const reusable = await findReusableResumeParse(supabase, {
      tenantId: params.tenantId,
      workerId: params.workerId,
      fileHash: params.fileHash,
      excludeResumeId: resumeId,
    }).catch(() => null)
    if (reusable?.parsedJson) {
      const completedAt = new Date().toISOString()
      await supabase
        .from("worker_resumes")
        .update({
          parsing_status: "completed",
          parse_status: "completed",
          parsed_json: reusable.parsedJson,
          parsed_data: sanitizePostgresJson({ text: safeText }),
          extracted_text: safeText,
          parse_error: null,
          parse_completed_at: completedAt,
          parsed_at: completedAt,
          ai_parse_ms: 0,
          file_hash: params.fileHash,
        })
        .eq("id", resumeId)
      logResumeTiming("resume-parse-job", "reused-file-hash", {
        resumeId,
        reusedFrom: reusable.id,
        aiParseMs: 0,
      })
      return {
        parsingStatus: "completed",
        parsedJson: reusable.parsedJson as Record<string, string>,
        parseError: null,
        aiParseMs: 0,
        qualityPassed: true,
      }
    }
  }

  const { data: existingResume } = await supabase
    .from("worker_resumes")
    .select("original_file_name, file_name")
    .eq("id", resumeId)
    .maybeSingle()
  const originalFileName =
    (typeof existingResume?.original_file_name === "string"
      ? existingResume.original_file_name
      : null) ||
    (typeof existingResume?.file_name === "string" ? existingResume.file_name : null)

  let aiParseMs = 0
  try {
    const grok = await grokParseResume(safeText, { fileName: originalFileName })
    aiParseMs = grok.aiParseMs

    const qualityTimer = createTimer()
    const quality = evaluateResumeParseQuality(grok.normalized)
    const qualityMs = qualityTimer.elapsedMs()

    logResumeTiming("resume-parse-job", "quality-gate", {
      resumeId,
      qualityMs,
      qualityPassed: quality.ok,
    })

    const parsedJson = sanitizePostgresJson(
      normalizedResumeToStoredJson(
        quality.ok ? quality.normalized : grok.normalized,
      ),
    )
    const completedAt = new Date().toISOString()
    const parsedFirst =
      typeof parsedJson.first_name === "string" ? parsedJson.first_name : ""
    const parsedLast = typeof parsedJson.last_name === "string" ? parsedJson.last_name : ""
    const namedFile = buildWorkerResumeFileName({
      firstName: parsedFirst,
      lastName: parsedLast,
      originalFileName,
    })
    const renamePatch =
      parsedFirst.trim() || parsedLast.trim()
        ? { original_file_name: namedFile, file_name: namedFile }
        : {}

    if (quality.ok) {
      await supabase
        .from("worker_resumes")
        .update({
          parsing_status: "completed",
          parse_status: "completed",
          parsed_json: parsedJson,
          parsed_data: sanitizePostgresJson({ text: safeText, pre_extracted: grok.preExtracted }),
          extracted_text: safeText,
          parse_error: null,
          parse_completed_at: completedAt,
          parsed_at: completedAt,
          ai_parse_ms: aiParseMs,
          ...renamePatch,
        })
        .eq("id", resumeId)

      logResumeTiming("resume-parse-job", "completed", {
        resumeId,
        totalMs: jobTimer.elapsedMs(),
        aiParseMs,
        qualityPassed: true,
      })

      if (params.continuationEmail) {
        await sendResumeContinuationEmail(params.supabase, {
          workerId: params.continuationEmail.workerId,
          tenantId: params.continuationEmail.tenantId,
          resumeId: params.continuationEmail.resumeId,
          origin: params.continuationEmail.origin,
          tenantSlug: params.continuationEmail.tenantSlug ?? null,
          extractedText: safeText,
          parsedResume: parsedJson,
          trigger: "resume_parse",
          request: params.continuationEmail.request,
        })
      }

      return {
        parsingStatus: "completed",
        parsedJson,
        parseError: null,
        aiParseMs,
        qualityPassed: true,
      }
    }

    const parseError = quality.message ?? RESUME_PARSE_FAILED_USER_MESSAGE
    await supabase
      .from("worker_resumes")
      .update({
        parsing_status: "failed",
        parse_status: "failed",
        parsed_json: parsedJson,
        parsed_data: sanitizePostgresJson({ text: safeText, pre_extracted: grok.preExtracted }),
        extracted_text: safeText,
        parse_error: parseError,
        parse_completed_at: completedAt,
        parsed_at: null,
        ai_parse_ms: aiParseMs,
      })
      .eq("id", resumeId)

    logResumeTiming("resume-parse-job", "quality-failed-non-blocking", {
      resumeId,
      totalMs: jobTimer.elapsedMs(),
      aiParseMs,
      parseError,
    })

    return {
      parsingStatus: "failed",
      parsedJson,
      parseError,
      aiParseMs,
      qualityPassed: false,
    }
  } catch (e: unknown) {
    const parseError = e instanceof Error ? e.message : "Resume parsing failed"
    const completedAt = new Date().toISOString()

    await supabase
      .from("worker_resumes")
      .update({
        parsing_status: "failed",
        parse_status: "failed",
        parse_error: parseError,
        parse_completed_at: completedAt,
        ai_parse_ms: aiParseMs || null,
      })
      .eq("id", resumeId)

    logResumeTiming("resume-parse-job", "error", {
      resumeId,
      totalMs: jobTimer.elapsedMs(),
      parseError,
    })

    return {
      parsingStatus: "failed",
      parsedJson: null,
      parseError,
      aiParseMs,
      qualityPassed: false,
    }
  }
}

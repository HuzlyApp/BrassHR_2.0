import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeActivityLog } from "@/lib/audit/activity-log";
import { PromptNotConfiguredError, PROMPT_NOT_CONFIGURED } from "@/lib/ai-catalog/errors";
import { industryKeyFromLegacyLabel } from "@/lib/ai-catalog/industry-catalog";
import { recordAiPromptRun } from "@/lib/ai-catalog/record-run";
import { resolvePromptVersion } from "@/lib/ai-catalog/resolve-prompt";
import { sanitizePostgresJson, stripNullBytes } from "@/lib/resume/sanitize-postgres-text";
import { WORKER_RESUMES_BUCKET } from "@/lib/supabase-storage-buckets";
import { isDeepMatchStage } from "./match-stage";
import { matchProgressionVariantKey } from "./prompt-variant";
import { matchAnalysisResponseSchema, type MatchAnalysisResponse } from "./schema";
import { generateOptimizedSubmissionResume } from "./generate-submission-resume";
import { loadSubmissionEnrichment } from "./submission-enrichment";
import { isSubmissionResumeFileName, submissionResumeFileName, submissionResumeToPlainText } from "./submission-resume";
import { renderSubmissionResumeDocx } from "./submission-resume-docx";
import type { SubmissionImprovementSummary } from "./submission-resume-improvement";
import { renderSubmissionResumePdf } from "./submission-resume-pdf";
import { resolveSubmissionResumeIdentity } from "./resolve-submission-identity";

export class SubmissionResumeError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SubmissionResumeError";
    this.status = status;
  }
}

export type DraftSubmissionResumeResult = {
  /** Editable Word deliverable (primary download). */
  docx: Buffer;
  /** PDF preview of the same optimized content. */
  pdf: Buffer;
  fileName: string;
  previewFileName: string;
  resumeId: string;
  previewResumeId: string;
  stage: "submission";
  usedModel: boolean;
  improvementSummary: SubmissionImprovementSummary;
};

function parseStoredAnalysis(value: unknown): MatchAnalysisResponse | null {
  const parsed = matchAnalysisResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function loadSourceResumeText(
  supabase: SupabaseClient,
  tenantId: string,
  applicationId: string,
  workerId: string | null
): Promise<string> {
  const { data: scoped } = await supabase
    .from("worker_resumes")
    .select("extracted_text, file_name, original_file_name, uploaded_at")
    .eq("tenant_id", tenantId)
    .eq("job_application_id", applicationId)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false })
    .limit(8);

  let rows = scoped ?? [];
  if (!rows.length && workerId) {
    const { data: workerRows } = await supabase
      .from("worker_resumes")
      .select("extracted_text, file_name, original_file_name, uploaded_at")
      .eq("tenant_id", tenantId)
      .eq("worker_id", workerId)
      .is("deleted_at", null)
      .order("uploaded_at", { ascending: false })
      .limit(8);
    rows = workerRows ?? [];
  }

  const preferred =
    rows.find((row) => !isSubmissionResumeFileName(String(row.original_file_name || row.file_name || ""))) ??
    rows[0];
  return String(preferred?.extracted_text ?? "").trim();
}

async function insertSubmissionResumeRow(args: {
  supabase: SupabaseClient;
  workerId: string;
  tenantId: string;
  applicationId: string;
  staffUserId: string | null;
  storagePath: string;
  fileName: string;
  contentType: string;
  byteLength: number;
  extractedText: string;
  parsedPayload: unknown;
  now: string;
}): Promise<string> {
  const { data: inserted, error: insertError } = await args.supabase
    .from("worker_resumes")
    .insert({
      worker_id: args.workerId,
      tenant_id: args.tenantId,
      file_url: args.storagePath,
      storage_path: args.storagePath,
      original_file_name: args.fileName,
      file_name: args.fileName,
      file_type: args.contentType,
      file_size_bytes: args.byteLength,
      parsed_data: sanitizePostgresJson(args.parsedPayload),
      parsing_status: "completed",
      parse_status: "completed",
      parsed_at: args.now,
      uploaded_at: args.now,
      text_length: args.extractedText.length,
      extracted_text: stripNullBytes(args.extractedText),
      parse_started_at: args.now,
      parse_completed_at: args.now,
      parse_error: null,
      parsed_json: sanitizePostgresJson(args.parsedPayload),
      job_application_id: args.applicationId,
      uploaded_by_user_id: args.staffUserId,
    })
    .select("id")
    .single();
  if (insertError || !inserted?.id) {
    throw new SubmissionResumeError(insertError?.message || "Failed to save the submission résumé.", 500);
  }
  return String(inserted.id);
}

export async function draftSubmissionResumePack(args: {
  supabase: SupabaseClient;
  tenantId: string;
  applicationId: string;
  staffUserId: string | null;
}): Promise<DraftSubmissionResumeResult> {
  const { supabase, tenantId, applicationId, staffUserId } = args;

  const { data: application, error: appError } = await supabase
    .from("job_applications")
    .select(
      "id, tenant_id, worker_id, applicant_profile_id, job_requisition_id, ai_match_status, ai_match_stage, ai_analysis"
    )
    .eq("id", applicationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (appError) throw new SubmissionResumeError(appError.message, 500);
  if (!application) throw new SubmissionResumeError("Application not found", 404);
  if (application.ai_match_status !== "ANALYZED") {
    throw new SubmissionResumeError("Run Deep Match before drafting the submission résumé.", 409);
  }
  if (!isDeepMatchStage(application.ai_match_stage)) {
    throw new SubmissionResumeError("Run Deep Match before drafting the submission résumé.", 409);
  }

  const [{ data: worker }, { data: profile }, { data: job }] = await Promise.all([
    application.worker_id
      ? supabase
          .from("worker")
          .select("id, first_name, last_name, email, phone, city, state")
          .eq("id", application.worker_id)
          .eq("tenant_id", tenantId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    application.applicant_profile_id
      ? supabase
          .from("applicant_profiles")
          .select("first_name, last_name, email, phone, city_state_zip")
          .eq("id", application.applicant_profile_id)
          .eq("tenant_id", tenantId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("job_requisitions")
      .select("title, public_title, industry_key, msp_client, msp_name, job_source_id")
      .eq("id", application.job_requisition_id)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  const identity = resolveSubmissionResumeIdentity({
    worker,
    profile,
    jobTitle: String(job?.public_title || job?.title || "").trim() || "this assignment",
  });

  const analysis = parseStoredAnalysis(application.ai_analysis);
  const workerId = application.worker_id ? String(application.worker_id) : null;
  const [resumeText, enrichment, tenantRow] = await Promise.all([
    loadSourceResumeText(supabase, tenantId, applicationId, workerId),
    loadSubmissionEnrichment({
      supabase,
      tenantId,
      applicationId,
      workerId,
      analysis,
    }),
    supabase
      .from("tenants")
      .select("primary_industry_key, industry")
      .eq("id", tenantId)
      .maybeSingle()
      .then((res) => res.data),
  ]);
  if (!resumeText && !analysis) {
    throw new SubmissionResumeError("No résumé text is available to optimize.", 409);
  }

  let clientName =
    typeof job?.msp_client === "string" && job.msp_client.trim()
      ? job.msp_client
      : typeof job?.msp_name === "string" && job.msp_name.trim()
        ? job.msp_name
        : null;
  let sourceKey =
    typeof job?.msp_name === "string" && job.msp_name.trim() ? job.msp_name : null;
  if (typeof job?.job_source_id === "string" && job.job_source_id.trim()) {
    const { data: sourceRow } = await supabase
      .from("job_sources")
      .select("name, code")
      .eq("id", job.job_source_id)
      .maybeSingle();
    if (typeof sourceRow?.name === "string" && sourceRow.name.trim()) clientName = sourceRow.name;
    if (typeof sourceRow?.code === "string" && sourceRow.code.trim()) sourceKey = sourceRow.code;
  }
  const jobIndustryKey =
    typeof job?.industry_key === "string" && job.industry_key.trim() ? String(job.industry_key) : null;
  const tenantPrimary =
    typeof tenantRow?.primary_industry_key === "string" && tenantRow.primary_industry_key.trim()
      ? String(tenantRow.primary_industry_key)
      : industryKeyFromLegacyLabel(
          typeof tenantRow?.industry === "string" ? tenantRow.industry : null
        );

  const startedAt = Date.now();
  let resolved;
  try {
    resolved = await resolvePromptVersion(supabase, {
      tenantId,
      featureKey: "candidate_match",
      variantKey: matchProgressionVariantKey("submission"),
      industryKey: jobIndustryKey,
      tenantPrimaryIndustryKey: tenantPrimary,
      clientName,
      sourceKey,
    });
  } catch (error) {
    if (error instanceof PromptNotConfiguredError) {
      await recordAiPromptRun(supabase, {
        tenantId,
        featureKey: "candidate_match",
        variantKey: "submission",
        verticalKey: null,
        industryKey: jobIndustryKey ?? tenantPrimary,
        promptVersionId: null,
        contentHash: null,
        entityType: "job_application",
        entityId: applicationId,
        inputHash: null,
        model: null,
        inputTokens: null,
        outputTokens: null,
        latencyMs: Date.now() - startedAt,
        creditCost: null,
        status: "skipped_no_prompt",
        errorCode: PROMPT_NOT_CONFIGURED,
        outputReference: null,
        requestedBy: staffUserId,
      }).catch(() => undefined);
      throw new SubmissionResumeError(error.message, 503);
    }
    throw error;
  }

  const { resume, improvementSummary, usedModel, model } = await generateOptimizedSubmissionResume({
    identity,
    analysis,
    resumeText,
    enrichmentNotes: enrichment.promptNotes,
    evidenceNotes: enrichment.evidenceNotes,
    resolved,
  });
  await recordAiPromptRun(supabase, {
    tenantId,
    featureKey: "candidate_match",
    variantKey: resolved.variantKey,
    verticalKey: resolved.resolvedVerticalKey,
    industryKey: resolved.requestedIndustryKey ?? jobIndustryKey ?? tenantPrimary,
    promptVersionId: resolved.promptVersionId,
    contentHash: resolved.contentHash,
    entityType: "job_application",
    entityId: applicationId,
    inputHash: null,
    model,
    inputTokens: null,
    outputTokens: null,
    latencyMs: Date.now() - startedAt,
    creditCost: null,
    status: usedModel ? "success" : "skipped_no_prompt",
    errorCode: usedModel ? null : "MODEL_UNAVAILABLE",
    outputReference: null,
    requestedBy: staffUserId,
  }).catch(() => undefined);

  const [docx, pdf] = await Promise.all([
    renderSubmissionResumeDocx(resume),
    renderSubmissionResumePdf(resume),
  ]);
  const fileName = submissionResumeFileName(resume.fullName || identity.fullName, ".docx");
  const previewFileName = submissionResumeFileName(resume.fullName || identity.fullName, ".pdf");
  const extractedText = submissionResumeToPlainText(resume);
  const parsedPayload = { ...resume, improvementSummary };
  const docxPath = `submission-resumes/${tenantId}/${applicationId}/${randomUUID()}.docx`;
  const pdfPath = `submission-resumes/${tenantId}/${applicationId}/${randomUUID()}.pdf`;

  const [{ error: docxUploadError }, { error: pdfUploadError }] = await Promise.all([
    supabase.storage.from(WORKER_RESUMES_BUCKET).upload(docxPath, docx, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: false,
    }),
    supabase.storage.from(WORKER_RESUMES_BUCKET).upload(pdfPath, pdf, {
      contentType: "application/pdf",
      upsert: false,
    }),
  ]);
  if (docxUploadError) {
    throw new SubmissionResumeError(docxUploadError.message || "Failed to store the submission résumé.", 502);
  }
  if (pdfUploadError) {
    throw new SubmissionResumeError(pdfUploadError.message || "Failed to store the submission résumé preview.", 502);
  }

  const now = new Date().toISOString();
  if (!workerId) {
    throw new SubmissionResumeError("This application has no candidate record to attach the résumé to.", 409);
  }

  const resumeId = await insertSubmissionResumeRow({
    supabase,
    workerId,
    tenantId,
    applicationId,
    staffUserId,
    storagePath: docxPath,
    fileName,
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    byteLength: docx.byteLength,
    extractedText,
    parsedPayload,
    now,
  });
  const previewResumeId = await insertSubmissionResumeRow({
    supabase,
    workerId,
    tenantId,
    applicationId,
    staffUserId,
    storagePath: pdfPath,
    fileName: previewFileName,
    contentType: "application/pdf",
    byteLength: pdf.byteLength,
    extractedText,
    parsedPayload,
    now,
  });

  if (application.ai_match_stage !== "submission") {
    const { error: stageError } = await supabase
      .from("job_applications")
      .update({
        ai_match_stage: "submission",
        updated_at: now,
      })
      .eq("id", applicationId)
      .eq("tenant_id", tenantId);
    if (stageError) throw new SubmissionResumeError(stageError.message, 500);
  }

  void writeActivityLog({
    actorUserId: staffUserId,
    action: "job_application.submission_resume_drafted",
    entityType: "job_application",
    entityId: applicationId,
    tenantId,
    metadata: {
      resumeId,
      previewResumeId,
      fileName,
      previewFileName,
      usedModel,
      skillEvidenceQuality: improvementSummary.skillEvidenceQuality,
    },
  });

  return {
    docx,
    pdf,
    fileName,
    previewFileName,
    resumeId,
    previewResumeId,
    stage: "submission",
    usedModel,
    improvementSummary,
  };
}

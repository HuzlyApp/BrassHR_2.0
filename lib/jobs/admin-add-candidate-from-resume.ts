import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractResumeTextFromUpload } from "@/lib/jobs/match-analysis/extract-resume-text";
import { createAdminJobApplication, findActiveApplicationForJob } from "@/lib/jobs/service";
import { JobValidationError } from "@/lib/jobs/types";
import { normalizeApplicantEmail } from "@/lib/jobs/validation";
import { syncWorkerPrimaryResumePath } from "@/lib/onboarding/sync-worker-primary-resume-path";
import { validatePersonName } from "@/lib/person-name";
import { grokParseResumeCached } from "@/lib/resume/grok-parse-resume-cached";
import {
  extractLocationFromResumeText,
  preExtractResumeFields,
} from "@/lib/resume/normalize-resume-text";
import {
  hasAdminCandidateIdentity,
  normalizeParsedResume,
  normalizedResumeToStoredJson,
  RESUME_PARSE_FAILED_USER_MESSAGE,
  type NormalizedParsedResume,
} from "@/lib/resumeParseQuality";
import { resumeTextToPdfBuffer } from "@/lib/resume/resume-text-to-pdf";
import { sanitizePostgresJson, stripNullBytes } from "@/lib/resume/sanitize-postgres-text";
import {
  resolveResumeFileType,
  validateExtractedResumeText,
  validateResumeUploadFile,
} from "@/lib/resume/validate-resume-upload";
import { WORKER_RESUMES_BUCKET } from "@/lib/supabase-storage-buckets";
import { buildWorkerResumeFileName } from "@/lib/resume/worker-resume-file-name";
import {
  runAutoQuickMatchForApplication,
  type AutoQuickMatchResult,
} from "@/lib/jobs/match-analysis/auto-quick-match";
import type { AnalysisProvider } from "@/lib/jobs/match-analysis/schema";

const MAX_RESUME_BYTES = Number(process.env.MAX_RESUME_UPLOAD_BYTES ?? 10 * 1024 * 1024);

export type AdminAddCandidateFromResumeInput = {
  tenantId: string;
  jobRequisitionId: string;
  staffUserId?: string | null;
  resumeFile?: File | null;
  resumeText?: string | null;
  resumeTitle?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  workCity?: string | null;
  workState?: string | null;
  workPostalCode?: string | null;
  relocateToJobSite?: boolean;
  /** Grok (default) or Gemini — used for Step 1 auto Quick Match. */
  analysisProvider?: AnalysisProvider;
};

export type AdminAddCandidateFromResumeResult = {
  applicationId: string;
  applicantProfileId: string;
  jobTitle: string;
  candidateName: string;
  autoQuickMatch: AutoQuickMatchResult | null;
};

function sanitizeFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200);
}

function formatCityStateZip(city: string, state: string, zip: string): string {
  const parts = [city, state, zip].map((part) => part.trim()).filter(Boolean);
  return parts.join(", ");
}

function formatFullName(firstName: string, lastName: string): string {
  return [firstName, lastName].map((part) => part.trim()).filter(Boolean).join(" ");
}

async function uploadResumeBytes(
  supabase: SupabaseClient,
  tenantId: string,
  bytes: Buffer,
  fileName: string,
  contentType: string
): Promise<{ path: string; fileName: string }> {
  const safeName = sanitizeFileName(fileName || "resume.pdf");
  const path = `admin-candidates/${tenantId}/${randomUUID()}/${safeName}`;
  const { error } = await supabase.storage.from(WORKER_RESUMES_BUCKET).upload(path, bytes, {
    contentType,
    upsert: false,
  });
  if (error) {
    throw new Error(error.message || "Failed to upload resume");
  }
  return { path, fileName: safeName };
}

async function persistWorkerResumeByWorkerId(
  supabase: SupabaseClient,
  workerId: string,
  tenantId: string,
  opts: {
    fileUrl: string;
    originalFileName?: string | null;
    parsedData?: Record<string, unknown>;
    textLength?: number | null;
    extractedText?: string | null;
    fileType?: string | null;
    fileSizeBytes?: number | null;
    jobApplicationId?: string | null;
    uploadedByUserId?: string | null;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const parsedData = sanitizePostgresJson(opts.parsedData ?? {});
  const row = {
    worker_id: workerId,
    tenant_id: tenantId,
    file_url: opts.fileUrl.trim(),
    storage_path: opts.fileUrl.trim(),
    original_file_name: opts.originalFileName?.trim()
      ? stripNullBytes(opts.originalFileName.trim())
      : null,
    file_name: opts.originalFileName?.trim()
      ? stripNullBytes(opts.originalFileName.trim())
      : null,
    file_type: opts.fileType ?? null,
    file_size_bytes: opts.fileSizeBytes ?? null,
    parsed_data: parsedData,
    parsing_status: "completed" as const,
    parse_status: "completed" as const,
    parsed_at: now,
    uploaded_at: now,
    text_length: opts.textLength ?? null,
    extracted_text:
      opts.extractedText != null ? stripNullBytes(opts.extractedText) : null,
    parse_started_at: now,
    parse_completed_at: now,
    parse_error: null,
    parsed_json: parsedData,
    job_application_id: opts.jobApplicationId?.trim() || null,
    uploaded_by_user_id: opts.uploadedByUserId?.trim() || null,
  };

  // Always insert. Workers can have multiple resumes; `.maybeSingle()` throws
  // when more than one row already exists (PGRST116).
  for (let attempt = 1; ; attempt += 1) {
    const { error } = await supabase.from("worker_resumes").insert(row);
    if (!error) return;
    if (attempt >= RESUME_INSERT_ATTEMPTS || !isTransientDbError(error)) throw error;
    console.warn(
      `[admin-add-candidate-from-resume] worker_resumes insert attempt ${attempt} failed, retrying`,
      error
    );
    await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    if (await workerResumeRowExists(supabase, row)) return;
  }
}

const RESUME_INSERT_ATTEMPTS = 3;

function isTransientDbError(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown } | null;
  // 57014 = statement_timeout cancellation.
  if (err?.code === "57014") return true;
  const message = typeof err?.message === "string" ? err.message : "";
  return /statement timeout|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i.test(message);
}

async function workerResumeRowExists(
  supabase: SupabaseClient,
  row: { worker_id: string; storage_path: string; job_application_id: string | null }
): Promise<boolean> {
  let query = supabase
    .from("worker_resumes")
    .select("id")
    .eq("worker_id", row.worker_id)
    .eq("storage_path", row.storage_path)
    .is("deleted_at", null)
    .limit(1);
  query = row.job_application_id
    ? query.eq("job_application_id", row.job_application_id)
    : query.is("job_application_id", null);
  const { data, error } = await query;
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/**
 * A previous add for this candidate + job can create the application and then fail to
 * save the résumé row (e.g. statement timeout). When the recruiter retries, attach the new
 * upload to that application instead of failing with DUPLICATE_APPLICATION.
 */
async function findApplicationMissingResume(
  supabase: SupabaseClient,
  input: { tenantId: string; jobRequisitionId: string; email: string }
): Promise<{ applicationId: string; workerId: string; applicantProfileId: string } | null> {
  const { data: profile, error: profileError } = await supabase
    .from("applicant_profiles")
    .select("id, worker_id")
    .eq("tenant_id", input.tenantId)
    .eq("normalized_email", normalizeApplicantEmail(input.email))
    .maybeSingle();
  if (profileError || !profile?.id) return null;

  const application = await findActiveApplicationForJob(supabase, {
    tenantId: input.tenantId,
    jobRequisitionId: input.jobRequisitionId,
    applicantProfileId: String(profile.id),
  });
  const workerId =
    application?.worker_id?.trim() ||
    (profile.worker_id != null ? String(profile.worker_id).trim() : "");
  if (!application || !workerId) return null;

  const { data: bound, error: boundError } = await supabase
    .from("worker_resumes")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("job_application_id", application.id)
    .is("deleted_at", null)
    .limit(1);
  if (boundError || (bound?.length ?? 0) > 0) return null;

  return {
    applicationId: application.id,
    workerId,
    applicantProfileId: String(profile.id),
  };
}

export type PreparedResumeCandidate = {
  extractedText: string;
  resumeBytes: Buffer;
  resumeFileName: string;
  resumeContentType: string;
  resumeFileType: ReturnType<typeof resolveResumeFileType>;
  parsed: NormalizedParsedResume;
  parsedJson: Record<string, string>;
  qualityOk: boolean;
  qualityMessage: string | null;
};

export function resolveAdminCandidateIdentity(
  parsed: NormalizedParsedResume,
  input: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  }
): {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
} {
  const firstName = input.firstName?.trim() || parsed.first_name.trim();
  const lastName = input.lastName?.trim() || parsed.last_name.trim();
  const email = input.email?.trim() || parsed.email.trim();
  const phone = input.phone?.trim() || parsed.phone.trim();
  return {
    firstName,
    lastName,
    fullName: formatFullName(firstName, lastName),
    email,
    phone,
  };
}

async function parseExtractedResumeText(
  extractedText: string,
  fileName?: string | null,
): Promise<{
  parsed: NormalizedParsedResume;
  qualityOk: boolean;
  qualityMessage: string | null;
}> {
  const contentError = validateExtractedResumeText(extractedText);
  const preExtracted = preExtractResumeFields(extractedText, { fileName });
  const fallback = normalizeParsedResume(preExtracted);

  let parsed = fallback;
  if (!contentError) {
    try {
      parsed = normalizeParsedResume(
        await grokParseResumeCached(extractedText, { fileName }),
      );
    } catch (parseError) {
      console.error("[admin-add-candidate-from-resume] grok parse failed", parseError);
      parsed = fallback;
    }
  }

  // Cached Grok results can omit city/state even when the text has them — always backfill.
  if (!parsed.city.trim() || !parsed.state.trim()) {
    const fromText = extractLocationFromResumeText(extractedText);
    parsed = normalizeParsedResume({
      ...parsed,
      city: parsed.city.trim() || fromText.city || preExtracted.city || "",
      state: parsed.state.trim() || fromText.state || preExtracted.state || "",
    });
  }

  if (hasAdminCandidateIdentity(parsed)) {
    return { parsed, qualityOk: true, qualityMessage: null };
  }

  return {
    parsed,
    qualityOk: false,
    qualityMessage: contentError ?? RESUME_PARSE_FAILED_USER_MESSAGE,
  };
}

/**
 * Validate, extract, and AI-parse a resume upload (or pasted text).
 * Shared by the parse preview endpoint and the candidate create flow; the Grok call is
 * cached by text, so previewing then submitting the same resume parses only once.
 */
export async function prepareResumeCandidate(input: {
  resumeFile?: File | null;
  resumeText?: string | null;
  resumeTitle?: string | null;
}): Promise<PreparedResumeCandidate> {
  let extractedText = "";
  let resumeBytes: Buffer | null = null;
  let resumeFileName = "resume.pdf";
  let resumeContentType = "application/pdf";
  let resumeFileType: ReturnType<typeof resolveResumeFileType> = "unknown";

  if (input.resumeFile && input.resumeFile.size > 0) {
    const file = input.resumeFile;
    const formatError = validateResumeUploadFile({
      name: file.name,
      type: file.type,
      size: file.size,
      maxBytes: MAX_RESUME_BYTES,
    });
    if (formatError) {
      throw new JobValidationError(formatError, {}, "INVALID_RESUME_FORMAT");
    }

    resumeFileType = resolveResumeFileType(file);
    if (resumeFileType === "doc") {
      throw new JobValidationError(
        "Legacy .doc files are not supported. Please save the resume as .docx or PDF.",
        {},
        "INVALID_RESUME_FORMAT"
      );
    }

    resumeBytes = Buffer.from(await file.arrayBuffer());
    try {
      extractedText = stripNullBytes(
        await extractResumeTextFromUpload(resumeBytes, file.name)
      );
    } catch (extractError) {
      console.error("[admin-add-candidate-from-resume] resume extraction failed", extractError);
      extractedText = "";
    }

    resumeFileName = file.name;
    resumeContentType = file.type || "application/octet-stream";
  } else {
    const text = String(input.resumeText ?? "").trim();
    if (!text) {
      throw new JobValidationError(
        "Please upload a resume file or paste resume text.",
        {},
        "RESUME_REQUIRED"
      );
    }
    extractedText = stripNullBytes(text);
    const titleBase = sanitizeFileName(String(input.resumeTitle ?? "").trim() || "pasted-resume");
    resumeFileName = titleBase.toLowerCase().endsWith(".pdf") ? titleBase : `${titleBase}.pdf`;
    // UTF-8 placeholder — converted to PDF only when uploading to storage.
    resumeBytes = Buffer.from(extractedText, "utf8");
    resumeContentType = "application/pdf";
    resumeFileType = "pdf";
  }

  if (!resumeBytes) {
    throw new JobValidationError("Resume content is missing.", {}, "RESUME_REQUIRED");
  }

  const { parsed, qualityOk, qualityMessage } = await parseExtractedResumeText(
    extractedText,
    resumeFileName,
  );

  return {
    extractedText,
    resumeBytes,
    resumeFileName,
    resumeContentType,
    resumeFileType,
    parsed,
    parsedJson: normalizedResumeToStoredJson(parsed),
    qualityOk,
    qualityMessage,
  };
}

export async function adminAddCandidateFromResume(
  supabase: SupabaseClient,
  input: AdminAddCandidateFromResumeInput
): Promise<AdminAddCandidateFromResumeResult> {
  const jobRequisitionId = input.jobRequisitionId.trim();
  if (!jobRequisitionId) {
    throw new JobValidationError("jobId is required.", {}, "JOB_REQUIRED");
  }

  const {
    extractedText,
    resumeBytes,
    resumeFileName,
    resumeContentType,
    resumeFileType,
    parsed,
  } = await prepareResumeCandidate({
    resumeFile: input.resumeFile,
    resumeText: input.resumeText,
    resumeTitle: input.resumeTitle,
  });

  const identity = resolveAdminCandidateIdentity(parsed, input);
  const { email, phone } = identity;

  if (!identity.fullName) {
    throw new JobValidationError(
      "First and last name are required. Fill them in and try again.",
      { name: "Name is required." },
      "NAME_REQUIRED"
    );
  }
  const firstNameCheck = validatePersonName(identity.firstName, { label: "First name" });
  const lastNameCheck = validatePersonName(identity.lastName, { label: "Last name" });
  if (!firstNameCheck.ok) {
    throw new JobValidationError(firstNameCheck.error, { name: firstNameCheck.error }, "NAME_NEEDS_REVIEW");
  }
  if (!lastNameCheck.ok) {
    throw new JobValidationError(lastNameCheck.error, { name: lastNameCheck.error }, "NAME_NEEDS_REVIEW");
  }
  const resolvedFirstName = firstNameCheck.value;
  const resolvedLastName = lastNameCheck.value;
  const fullName = [resolvedFirstName, resolvedLastName].join(" ");
  if (!email) {
    throw new JobValidationError(
      "Email is required. Fill it in and try again.",
      { email: "Email is required." },
      "EMAIL_REQUIRED"
    );
  }

  const parsedJson = normalizedResumeToStoredJson({
    ...parsed,
    first_name: resolvedFirstName,
    last_name: resolvedLastName,
    email,
    phone,
  });

  const uploadBytes =
    !input.resumeFile?.size && input.resumeText?.trim()
      ? await resumeTextToPdfBuffer(extractedText)
      : resumeBytes;

  const namedFile = buildWorkerResumeFileName({
    firstName: resolvedFirstName,
    lastName: resolvedLastName,
    originalFileName: resumeFileName,
  });

  const uploaded = await uploadResumeBytes(
    supabase,
    input.tenantId,
    uploadBytes,
    namedFile,
    resumeContentType
  );

  let applicationId: string;
  let applicantProfileId: string;
  let jobTitle: string;
  let workerId: string;
  let repairedExistingApplication = false;
  try {
    const result = await createAdminJobApplication(supabase, {
      tenantId: input.tenantId,
      jobRequisitionId,
      name: fullName,
      email,
      phone,
      streetAddress: [parsed.address1, parsed.address2].filter(Boolean).join(" ").trim() || null,
      cityStateZip: formatCityStateZip(parsed.city, parsed.state, parsed.zip) || null,
      lastJobTitle: parsed.job_role.trim() || null,
      createdByStaffUserId: input.staffUserId ?? null,
      resumePath: uploaded.path,
      resumeFileName: uploaded.fileName,
      workLocation: input.workCity && input.workState
        ? {
            country: "US",
            city: input.workCity,
            state: input.workState,
            postalCode: input.workPostalCode ?? null,
            locationType: "onsite",
            relocateToJobSite: Boolean(input.relocateToJobSite),
          }
        : null,
    });
    applicationId = String(result.application?.id ?? "").trim();
    applicantProfileId = result.applicantProfileId;
    jobTitle = result.jobTitle;

    const { data: profileRow } = await supabase
      .from("applicant_profiles")
      .select("worker_id")
      .eq("tenant_id", input.tenantId)
      .eq("id", result.applicantProfileId)
      .maybeSingle();
    workerId = profileRow?.worker_id != null ? String(profileRow.worker_id).trim() : "";
  } catch (error) {
    const missing =
      error instanceof JobValidationError && error.code === "DUPLICATE_APPLICATION"
        ? await findApplicationMissingResume(supabase, {
            tenantId: input.tenantId,
            jobRequisitionId,
            email,
          }).catch(() => null)
        : null;
    if (!missing) throw error;

    applicationId = missing.applicationId;
    applicantProfileId = missing.applicantProfileId;
    workerId = missing.workerId;
    const { data: job } = await supabase
      .from("job_requisitions")
      .select("public_title")
      .eq("tenant_id", input.tenantId)
      .eq("id", jobRequisitionId)
      .maybeSingle();
    jobTitle = String(job?.public_title ?? "");
    repairedExistingApplication = true;
  }

  if (workerId) {
    await persistWorkerResumeByWorkerId(supabase, workerId, input.tenantId, {
      fileUrl: uploaded.path,
      originalFileName: uploaded.fileName,
      parsedData: parsedJson,
      textLength: extractedText.trim().length,
      extractedText,
      fileType: resumeFileType === "unknown" ? "txt" : resumeFileType,
      fileSizeBytes: resumeBytes.byteLength,
      jobApplicationId: applicationId || null,
      uploadedByUserId: input.staffUserId ?? null,
    });
  }

  if (repairedExistingApplication) {
    const { error: profileError } = await supabase
      .from("applicant_profiles")
      .update({
        resume_path: uploaded.path,
        resume_file_name: uploaded.fileName,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", applicantProfileId);
    if (profileError) {
      console.warn("[admin-add-candidate-from-resume] profile resume_path repair failed", profileError);
    }
    await syncWorkerPrimaryResumePath(supabase, workerId).catch((err) => {
      console.warn("[admin-add-candidate-from-resume] sync primary resume path", err);
    });
  }

  let autoQuickMatch: AutoQuickMatchResult | null = null;
  if (applicationId) {
    // Await Step 1 so Vercel does not kill fire-and-forget work, and the UI can show fit.
    autoQuickMatch = await runAutoQuickMatchForApplication({
      supabase,
      tenantId: input.tenantId,
      jobApplicationId: applicationId,
      analyzedByUserId: input.staffUserId ?? null,
      analysisProvider: input.analysisProvider,
      reason: "admin_add_candidate_from_resume",
    });
  }

  return {
    applicationId,
    applicantProfileId,
    jobTitle,
    candidateName: fullName,
    autoQuickMatch,
  };
}

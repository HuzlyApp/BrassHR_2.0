import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApplicantWorkerRow } from "@/lib/applicant-portal";
import { persistWorkerResumeRecord } from "@/lib/onboarding/persist-worker-resume-record";
import { startOrResumeJobApplication } from "@/lib/jobs/service";
import { JobValidationError } from "@/lib/jobs/types";
import type { ServiceAreaLocation } from "@/lib/service-area/types";
import { normalizeJobToken } from "@/lib/jobs/public-application-routing";

export type ApplyWorkerToJobInput = {
  applicant: ApplicantWorkerRow;
  authUserId: string;
  jobToken: string;
  workLocation?: ServiceAreaLocation | null;
};

export type ApplyWorkerToJobResult = {
  applicationId: string;
  resumed: boolean;
  resumeId: string;
};

type WorkerResumeRow = {
  id: string;
  file_url: string | null;
  storage_path: string | null;
  original_file_name: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size_bytes: number | null;
  extracted_text: string | null;
  text_length: number | null;
  parsing_status: string | null;
  parse_status: string | null;
  parsed_data: Record<string, unknown> | null;
  job_application_id: string | null;
};

async function getLatestWorkerResume(
  supabase: SupabaseClient,
  applicant: ApplicantWorkerRow
): Promise<WorkerResumeRow> {
  const { data, error } = await supabase
    .from("worker_resumes")
    .select(
      "id, file_url, storage_path, original_file_name, file_name, file_type, file_size_bytes, extracted_text, text_length, parsing_status, parse_status, parsed_data, job_application_id, uploaded_at"
    )
    .eq("worker_id", applicant.id)
    .eq("tenant_id", applicant.tenant_id)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  const resume = data as WorkerResumeRow | null;
  if (!resume?.id) {
    throw new JobValidationError(
      "No resume found on your profile. Upload a resume under Profile → Documents, then try again.",
      {},
      "RESUME_REQUIRED"
    );
  }
  return resume;
}

async function linkResumeToApplication(
  supabase: SupabaseClient,
  applicant: ApplicantWorkerRow,
  resume: WorkerResumeRow,
  applicationId: string,
  uploadedByUserId: string
): Promise<void> {
  const fileUrl = (resume.storage_path || resume.file_url || "").trim();
  if (!fileUrl) {
    throw new JobValidationError("Selected resume file is missing.", {}, "RESUME_FILE_MISSING");
  }

  const existingApplicationId = resume.job_application_id?.trim() || null;
  if (!existingApplicationId) {
    const { error } = await supabase
      .from("worker_resumes")
      .update({ job_application_id: applicationId })
      .eq("id", resume.id)
      .eq("worker_id", applicant.id)
      .eq("tenant_id", applicant.tenant_id)
      .is("deleted_at", null);
    if (error) throw error;
    return;
  }

  if (existingApplicationId === applicationId) return;

  // Reuse the same stored file for a new application without counting against upload quota.
  const parsingStatusRaw = (resume.parse_status || resume.parsing_status || "pending")
    .trim()
    .toLowerCase();
  const parsingStatus =
    parsingStatusRaw === "completed" ||
    parsingStatusRaw === "processing" ||
    parsingStatusRaw === "failed"
      ? parsingStatusRaw
      : "pending";

  const linkedId = await persistWorkerResumeRecord(
    supabase,
    applicant.id,
    {
      fileUrl,
      originalFileName: resume.original_file_name || resume.file_name || "Resume.pdf",
      parsedData: resume.parsed_data ?? {},
      parsingStatus,
      textLength: resume.text_length,
      fileType: resume.file_type,
      fileSizeBytes: resume.file_size_bytes,
      extractedText: resume.extracted_text,
      jobApplicationId: applicationId,
      uploadedByUserId,
      uploaderRole: "worker",
      enforceUploadLimit: false,
      workerId: applicant.id,
      tenantId: applicant.tenant_id,
    },
    { mode: "insert" }
  );

  if (!linkedId) {
    throw new JobValidationError("Could not attach resume to this application.", {}, "RESUME_LINK_FAILED");
  }
}

/**
 * Apply an approved worker to a published job using their existing worker +
 * applicant profile and their latest uploaded resume (no new worker row).
 */
export async function applyWorkerToJobWithResume(
  supabase: SupabaseClient,
  input: ApplyWorkerToJobInput
): Promise<ApplyWorkerToJobResult> {
  const jobToken = normalizeJobToken(input.jobToken);
  if (!jobToken) {
    throw new JobValidationError("Job token is required.", {}, "JOB_TOKEN_REQUIRED");
  }

  const resume = await getLatestWorkerResume(supabase, input.applicant);

  const result = await startOrResumeJobApplication(supabase, {
    tenantId: input.applicant.tenant_id,
    jobToken,
    applicantAuthUserId: input.authUserId,
    workerId: input.applicant.id,
    email: input.applicant.email,
    workLocation: input.workLocation ?? null,
  });

  const applicationId = String(result.application?.id ?? "").trim();
  if (!applicationId) {
    throw new JobValidationError("Could not create job application.", {}, "APPLICATION_CREATE_FAILED");
  }

  if (result.resumed) {
    throw new JobValidationError(
      "You have already applied for this job.",
      {},
      "ALREADY_APPLIED"
    );
  }

  const nowIso = new Date().toISOString();
  const { error: submitError } = await supabase
    .from("job_applications")
    .update({
      status: "new",
      submitted_at: nowIso,
      worker_id: input.applicant.id,
    })
    .eq("id", applicationId)
    .eq("tenant_id", input.applicant.tenant_id);
  if (submitError) throw submitError;

  await linkResumeToApplication(
    supabase,
    input.applicant,
    resume,
    applicationId,
    input.authUserId
  );

  return { applicationId, resumed: false, resumeId: resume.id };
}

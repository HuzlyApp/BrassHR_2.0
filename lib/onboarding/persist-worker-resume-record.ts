import type { SupabaseClient } from "@supabase/supabase-js";
import { assertResumeUploadWithinLimit } from "@/lib/resume/assert-resume-upload-limit";
import type { ResumeUploaderRole } from "@/lib/resume/resume-upload-limit";
import { sanitizePostgresJson, stripNullBytes } from "@/lib/resume/sanitize-postgres-text";
import { buildWorkerResumeFileName } from "@/lib/resume/worker-resume-file-name";

export type WorkerResumeParsingStatus = "pending" | "processing" | "completed" | "failed";

export type PersistWorkerResumeRecordOpts = {
  fileUrl: string;
  originalFileName?: string | null;
  parsedData?: Record<string, unknown>;
  parsingStatus?: WorkerResumeParsingStatus;
  textLength?: number | null;
  extractionMs?: number | null;
  parseStartedAt?: string | null;
  fileType?: string | null;
  fileSizeBytes?: number | null;
  extractedText?: string | null;
  jobApplicationId?: string | null;
  uploadedByUserId?: string | null;
  uploaderRole?: ResumeUploaderRole;
  /**
   * Worker already resolved for this upload. Required when the auth user has
   * a worker row in more than one tenant — an unscoped user_id lookup then
   * returns multiple rows and PostgREST rejects maybeSingle().
   */
  workerId?: string | null;
  tenantId?: string | null;
  /**
   * Applying to a job always has to succeed, so the job-application resume step
   * opts out of the quota. Uploads started from a Resume Submitted screen do not.
   */
  enforceUploadLimit?: boolean;
};

export type PersistWorkerResumeRecordMode = "insert" | "update";

export type PersistWorkerResumeRecordOptions = {
  mode?: PersistWorkerResumeRecordMode;
  resumeId?: string;
};

const WORKER_RESUME_SELECT = "id, tenant_id, user_id, first_name, last_name";

type WorkerResumeIdentity = {
  workerId: string;
  tenantId: string;
  userId: string | null;
  firstName: string | null;
  lastName: string | null;
};

function mapWorkerResumeIdentity(worker: {
  id?: unknown;
  tenant_id?: unknown;
  user_id?: unknown;
  first_name?: unknown;
  last_name?: unknown;
}): WorkerResumeIdentity | null {
  if (!worker?.id || worker.tenant_id == null) return null;
  return {
    workerId: String(worker.id),
    tenantId: String(worker.tenant_id),
    userId: worker.user_id != null ? String(worker.user_id) : null,
    firstName: worker.first_name != null ? String(worker.first_name) : null,
    lastName: worker.last_name != null ? String(worker.last_name) : null,
  };
}

async function resolveWorkerForResume(
  supabase: SupabaseClient,
  applicantId: string,
  scope?: { workerId?: string | null; tenantId?: string | null }
): Promise<WorkerResumeIdentity | null> {
  const scopedWorkerId = scope?.workerId?.trim() || "";
  const scopedTenantId = scope?.tenantId?.trim() || "";

  if (scopedWorkerId) {
    let query = supabase
      .from("worker")
      .select(WORKER_RESUME_SELECT)
      .eq("id", scopedWorkerId);
    if (scopedTenantId) query = query.eq("tenant_id", scopedTenantId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return mapWorkerResumeIdentity(data ?? {});
  }

  if (scopedTenantId) {
    const byUser = await supabase
      .from("worker")
      .select(WORKER_RESUME_SELECT)
      .eq("user_id", applicantId)
      .eq("tenant_id", scopedTenantId)
      .maybeSingle();
    if (byUser.error) throw byUser.error;
    const scoped = mapWorkerResumeIdentity(byUser.data ?? {});
    if (scoped) return scoped;

    const byId = await supabase
      .from("worker")
      .select(WORKER_RESUME_SELECT)
      .eq("id", applicantId)
      .eq("tenant_id", scopedTenantId)
      .maybeSingle();
    if (byId.error) throw byId.error;
    return mapWorkerResumeIdentity(byId.data ?? {});
  }

  // One auth user can have a worker row per tenant. maybeSingle() errors
  // (PGRST116) when more than one row matches, which aborted resume save.
  const byUser = await supabase
    .from("worker")
    .select(WORKER_RESUME_SELECT)
    .eq("user_id", applicantId)
    .limit(2);
  if (byUser.error) throw byUser.error;
  const userRows = byUser.data ?? [];
  if (userRows.length > 1) {
    throw new Error(
      "Multiple worker profiles exist for this account. Tenant is required to save the resume."
    );
  }

  let worker: (typeof userRows)[number] | null = userRows[0] ?? null;
  if (!worker?.id) {
    const byId = await supabase
      .from("worker")
      .select(WORKER_RESUME_SELECT)
      .eq("id", applicantId)
      .maybeSingle();
    if (byId.error) throw byId.error;
    worker = byId.data;
  }

  return mapWorkerResumeIdentity(worker ?? {});
}

function buildResumeRow(
  workerId: string,
  tenantId: string,
  opts: PersistWorkerResumeRecordOpts,
  workerNames?: { firstName: string | null; lastName: string | null }
) {
  const parsingStatus = opts.parsingStatus ?? (opts.parsedData ? "completed" : "pending");
  const now = new Date().toISOString();
  const original = opts.originalFileName?.trim()
    ? stripNullBytes(opts.originalFileName.trim())
    : null;
  const fileName = buildWorkerResumeFileName({
    firstName: workerNames?.firstName,
    lastName: workerNames?.lastName,
    originalFileName: original,
  });

  return {
    worker_id: workerId,
    tenant_id: tenantId,
    file_url: opts.fileUrl.trim(),
    storage_path: opts.fileUrl.trim(),
    original_file_name: fileName,
    file_name: fileName,
    file_type: opts.fileType ?? null,
    file_size_bytes: opts.fileSizeBytes ?? null,
    parsed_data: sanitizePostgresJson(opts.parsedData ?? {}),
    parsing_status: parsingStatus,
    parse_status: parsingStatus,
    parsed_at: parsingStatus === "completed" ? now : null,
    uploaded_at: now,
    text_length: opts.textLength ?? null,
    extraction_ms: opts.extractionMs ?? null,
    extracted_text:
      opts.extractedText != null ? stripNullBytes(opts.extractedText) : null,
    parse_started_at: opts.parseStartedAt ?? (parsingStatus === "processing" ? now : null),
    parse_completed_at: parsingStatus === "completed" ? now : null,
    parse_error: null,
    parsed_json: null,
    ai_parse_ms: null,
    deleted_at: null,
    job_application_id: opts.jobApplicationId?.trim() || null,
    uploaded_by_user_id: opts.uploadedByUserId?.trim() || null,
  };
}

export async function persistWorkerResumeRecord(
  supabase: SupabaseClient,
  applicantId: string,
  opts: PersistWorkerResumeRecordOpts,
  recordOptions?: PersistWorkerResumeRecordOptions
): Promise<string | null> {
  const worker = await resolveWorkerForResume(supabase, applicantId, {
    workerId: opts.workerId,
    tenantId: opts.tenantId,
  });
  if (!worker) return null;

  const mode = recordOptions?.mode ?? "insert";
  const row = buildResumeRow(worker.workerId, worker.tenantId, opts, {
    firstName: worker.firstName,
    lastName: worker.lastName,
  });

  if (mode === "insert" && opts.enforceUploadLimit !== false) {
    await assertResumeUploadWithinLimit(supabase, {
      workerId: worker.workerId,
      workerUserId: worker.userId,
      uploadedByUserId: opts.uploadedByUserId,
      role: opts.uploaderRole,
    });
  }

  if (mode === "update") {
    const resumeId = recordOptions?.resumeId?.trim();
    if (!resumeId) throw new Error("Resume id is required to update a resume.");

    const { data: existing, error: existingErr } = await supabase
      .from("worker_resumes")
      .select("id, job_application_id")
      .eq("id", resumeId)
      .eq("worker_id", worker.workerId)
      .is("deleted_at", null)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (!existing?.id) throw new Error("Resume not found.");

    const updateRow = {
      ...row,
      job_application_id:
        opts.jobApplicationId?.trim() ||
        (existing.job_application_id as string | null) ||
        null,
    };

    const { error } = await supabase.from("worker_resumes").update(updateRow).eq("id", resumeId);
    if (error) throw error;
    return resumeId;
  }

  const { data: inserted, error } = await supabase
    .from("worker_resumes")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;
  return inserted?.id ? String(inserted.id) : null;
}

export async function softDeleteWorkerResumeRecord(
  supabase: SupabaseClient,
  workerId: string,
  resumeId: string
): Promise<void> {
  const { data: existing, error: existingErr } = await supabase
    .from("worker_resumes")
    .select("id")
    .eq("id", resumeId)
    .eq("worker_id", workerId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (!existing?.id) throw new Error("Resume not found.");

  const { error } = await supabase
    .from("worker_resumes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", resumeId);
  if (error) throw error;
}

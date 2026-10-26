import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractResumeTextFromUpload } from "@/lib/jobs/match-analysis/extract-resume-text";
import type { ApplicantWorkerRow } from "@/lib/applicant-portal";
import { resolveStaffProfilePhotoUrl } from "@/lib/account/staff-profile-photo";
import { resolveWorkerProfilePhotoUrl } from "@/lib/applicant-portal/worker-profile-photo";
import { publicJobDisplayTitle } from "@/lib/jobs/public-application-routing";
import {
  persistWorkerResumeRecord,
  softDeleteWorkerResumeRecord,
  type WorkerResumeParsingStatus,
} from "@/lib/onboarding/persist-worker-resume-record";
import { syncWorkerPrimaryResumePath } from "@/lib/onboarding/sync-worker-primary-resume-path";
import { assertResumeUploadWithinLimit } from "@/lib/resume/assert-resume-upload-limit";
import {
  isReuploadedResumePath,
  resumeUploadFolder,
} from "@/lib/resume/resume-reupload-path";
import {
  resolveResumeFileType,
  ResumeUploadValidationError,
  validateExtractedResumeText,
  validateResumeUploadFile,
} from "@/lib/resume/validate-resume-upload";
import { resolveStorageAccessibleUrl } from "@/lib/supabase/resolve-storage-accessible-url";
import { WORKER_RESUMES_BUCKET } from "@/lib/supabase-storage-buckets";
import { buildWorkerResumeFileName } from "@/lib/resume/worker-resume-file-name";
import { scheduleAutoQuickMatchForApplication } from "@/lib/jobs/match-analysis/auto-quick-match";

export type WorkerAppliedJobOption = {
  applicationId: string;
  jobTitle: string;
  location: string | null;
  statusLabel: string;
};

export type WorkerResumeListItem = {
  id: string;
  originalFileName: string;
  fileType: string | null;
  fileSizeBytes: number | null;
  fileSizeLabel: string;
  parsingStatus: WorkerResumeParsingStatus;
  parsingStatusLabel: string;
  uploadedAt: string;
  uploadedAtLabel: string;
  isReuploaded: boolean;
  jobApplicationId: string | null;
  jobTitle: string | null;
  uploadedByName: string;
  uploadedByPhotoUrl: string | null;
  uploadedByRoleLabel: "Admin" | "Worker" | "";
};

type JobRequisitionJoin = {
  public_title?: string | null;
  source_job_title?: string | null;
  source_type?: string | null;
  employment_type?: string | null;
  location?: string | null;
};

type WorkerResumeRow = {
  id: string;
  original_file_name: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size_bytes: number | null;
  parsing_status: string | null;
  parse_status: string | null;
  uploaded_at: string;
  file_url: string | null;
  storage_path: string | null;
  job_application_id: string | null;
  uploaded_by_user_id?: string | null;
  job_applications?: {
    job_requisitions?: JobRequisitionJoin | JobRequisitionJoin[] | null;
  } | null;
};

function sanitizeFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200);
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatUploadedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", { timeZone: "America/New_York", 
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function resolveParsingStatus(row: WorkerResumeRow): WorkerResumeParsingStatus {
  const raw = (row.parse_status || row.parsing_status || "pending").trim().toLowerCase();
  if (raw === "completed" || raw === "processing" || raw === "failed") return raw;
  return "pending";
}

function parsingStatusLabel(status: WorkerResumeParsingStatus): string {
  if (status === "completed") return "Parsed";
  if (status === "processing") return "Parsing…";
  if (status === "failed") return "Parse failed";
  return "Pending";
}

function jobTitleFromResumeRow(row: WorkerResumeRow): string | null {
  const application = row.job_applications;
  if (!application) return null;
  const jobRaw = application.job_requisitions;
  const job = Array.isArray(jobRaw) ? jobRaw[0] : jobRaw;
  if (!job) return null;
  const title = publicJobDisplayTitle(job).trim();
  return title || null;
}

function formatPersonName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  return [firstName, lastName].map((part) => (part ?? "").trim()).filter(Boolean).join(" ");
}

export function serializeWorkerResume(row: WorkerResumeRow): WorkerResumeListItem {
  const parsingStatus = resolveParsingStatus(row);
  return {
    id: row.id,
    originalFileName:
      row.original_file_name?.trim() ||
      row.file_name?.trim() ||
      "Resume.pdf",
    fileType: row.file_type,
    fileSizeBytes: row.file_size_bytes,
    fileSizeLabel: formatFileSize(row.file_size_bytes),
    parsingStatus,
    parsingStatusLabel: parsingStatusLabel(parsingStatus),
    uploadedAt: row.uploaded_at,
    uploadedAtLabel: formatUploadedAt(row.uploaded_at),
    isReuploaded: isReuploadedResumePath(row.storage_path, row.file_url),
    jobApplicationId: row.job_application_id,
    jobTitle: jobTitleFromResumeRow(row),
    uploadedByName: "Unknown",
    uploadedByPhotoUrl: null,
    uploadedByRoleLabel: "",
  };
}

async function assertJobApplicationForWorker(
  supabase: SupabaseClient,
  workerId: string,
  tenantId: string,
  jobApplicationId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("job_applications")
    .select("id")
    .eq("id", jobApplicationId)
    .eq("worker_id", workerId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) {
    throw new Error("Select a valid job from your applications.");
  }
}

async function extractResumeText(buffer: Buffer, file: Pick<File, "name" | "type">): Promise<string> {
  return extractResumeTextFromUpload(buffer, file.name);
}

async function uploadResumeBuffer(
  supabase: SupabaseClient,
  folder: string,
  file: File,
  buffer: Buffer,
  storedFileName: string
): Promise<string> {
  const objectPath = `${folder}/${randomUUID()}-${sanitizeFileName(storedFileName)}`;
  const { error } = await supabase.storage.from(WORKER_RESUMES_BUCKET).upload(objectPath, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(error.message || "Failed to store resume");
  return objectPath;
}

async function storeResumeFromFile(
  supabase: SupabaseClient,
  applicant: ApplicantWorkerRow,
  userId: string,
  file: File,
  mode: "insert" | "update",
  options?: { resumeId?: string; jobApplicationId?: string | null }
): Promise<{ resumeId: string; parseStatus: WorkerResumeParsingStatus }> {
  const validationError = validateResumeUploadFile({
    name: file.name,
    type: file.type,
    size: file.size,
  });
  if (validationError) throw new ResumeUploadValidationError(validationError);

  if (mode === "insert") {
    const jobApplicationId = options?.jobApplicationId?.trim();
    if (!jobApplicationId) {
      throw new ResumeUploadValidationError("Select a job before uploading your resume.");
    }
    await assertJobApplicationForWorker(
      supabase,
      applicant.id,
      applicant.tenant_id,
      jobApplicationId
    );
    await assertResumeUploadWithinLimit(supabase, {
      workerId: applicant.id,
      workerUserId: applicant.user_id,
      uploadedByUserId: userId,
      role: "worker",
    });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const text = await extractResumeText(buffer, file);
  const contentError = validateExtractedResumeText(text);
  if (contentError) throw new ResumeUploadValidationError(contentError);

  const fileType = resolveResumeFileType(file);
  const storedFileName = buildWorkerResumeFileName({
    firstName: applicant.first_name,
    lastName: applicant.last_name,
    originalFileName: file.name,
  });
  const baseFolder = userId.trim() || applicant.id;
  const folder = resumeUploadFolder(baseFolder, mode === "update");
  const objectPath = await uploadResumeBuffer(supabase, folder, file, buffer, storedFileName);
  const textLength = text.trim().length;

  const persistedId = await persistWorkerResumeRecord(
    supabase,
    applicant.id,
    {
      fileUrl: objectPath,
      originalFileName: storedFileName,
      parsedData: { text },
      parsingStatus: "pending",
      textLength,
      fileType,
      fileSizeBytes: file.size,
      extractedText: text,
      jobApplicationId: options?.jobApplicationId ?? null,
      uploadedByUserId: userId,
      uploaderRole: "worker",
      workerId: applicant.id,
      tenantId: applicant.tenant_id,
    },
    mode === "update"
      ? { mode: "update", resumeId: options?.resumeId }
      : { mode: "insert" }
  );

  if (!persistedId) throw new Error("Could not save resume record.");

  await syncWorkerPrimaryResumePath(supabase, applicant.id, applicant.user_id);

  let jobApplicationId = options?.jobApplicationId?.trim() || "";
  if (!jobApplicationId && mode === "update" && options?.resumeId?.trim()) {
    const { data: existing } = await supabase
      .from("worker_resumes")
      .select("job_application_id")
      .eq("id", options.resumeId.trim())
      .maybeSingle();
    jobApplicationId =
      typeof existing?.job_application_id === "string" ? existing.job_application_id.trim() : "";
  }

  if (jobApplicationId) {
    await supabase
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
      .eq("id", jobApplicationId)
      .eq("tenant_id", applicant.tenant_id);

    scheduleAutoQuickMatchForApplication({
      supabase,
      tenantId: applicant.tenant_id,
      jobApplicationId,
      analyzedByUserId: userId,
      reason: mode === "update" ? "applicant_portal_resume_reupload" : "applicant_portal_resume_upload",
    });
  }

  return { resumeId: persistedId, parseStatus: "pending" };
}

const RESUME_LIST_SELECT = `
  id,
  original_file_name,
  file_name,
  file_type,
  file_size_bytes,
  parsing_status,
  parse_status,
  uploaded_at,
  file_url,
  storage_path,
  job_application_id,
  uploaded_by_user_id,
  job_applications (
    job_requisitions (
      public_title,
      source_job_title,
      source_type,
      employment_type,
      location
    )
  )
`;

export async function listAppliedJobsForWorker(
  supabase: SupabaseClient,
  workerId: string,
  tenantId: string
): Promise<WorkerAppliedJobOption[]> {
  const { data, error } = await supabase
    .from("job_applications")
    .select(
      "id, status, job_requisitions(public_title, source_job_title, source_type, employment_type, location)"
    )
    .eq("worker_id", workerId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const jobRaw = row.job_requisitions;
    const job = (Array.isArray(jobRaw) ? jobRaw[0] : jobRaw) as JobRequisitionJoin | undefined;
    const status = String(row.status ?? "").trim();
    const statusLabel =
      status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) || "Applied";

    return {
      applicationId: String(row.id),
      jobTitle: job ? publicJobDisplayTitle(job) : "Job",
      location: job?.location?.trim() || null,
      statusLabel,
    };
  });
}

export type ListWorkerResumesOptions = {
  /** Signed uploader photos are unused on the recruiter candidate profile. */
  includeUploaderPhotos?: boolean;
};

export async function listWorkerResumesForApplicant(
  supabase: SupabaseClient,
  workerId: string,
  tenantId: string,
  options?: ListWorkerResumesOptions
): Promise<WorkerResumeListItem[]> {
  const { data, error } = await supabase
    .from("worker_resumes")
    .select(RESUME_LIST_SELECT)
    .eq("worker_id", workerId)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: true });

  if (error) throw error;
  const rows = (data ?? []) as WorkerResumeRow[];
  let items = rows.map(serializeWorkerResume);
  items = await enrichResumeJobTitles(supabase, workerId, tenantId, items);
  return enrichResumeUploaders(supabase, workerId, tenantId, items, rows, {
    includeUploaderPhotos: options?.includeUploaderPhotos !== false,
  });
}

type WorkerApplicationForResume = {
  id: string;
  createdAt: string;
  jobTitle: string;
};

async function loadWorkerApplicationsForResumeMatch(
  supabase: SupabaseClient,
  workerId: string,
  tenantId: string
): Promise<WorkerApplicationForResume[]> {
  const { data, error } = await supabase
    .from("job_applications")
    .select(
      "id, created_at, job_requisitions(public_title, source_job_title, source_type, employment_type, location)"
    )
    .eq("worker_id", workerId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const jobRaw = row.job_requisitions;
    const job = (Array.isArray(jobRaw) ? jobRaw[0] : jobRaw) as JobRequisitionJoin | undefined;
    return {
      id: String(row.id),
      createdAt: String(row.created_at),
      jobTitle: job ? publicJobDisplayTitle(job) : "Job",
    };
  });
}

async function enrichResumeJobTitles(
  supabase: SupabaseClient,
  workerId: string,
  tenantId: string,
  items: WorkerResumeListItem[]
): Promise<WorkerResumeListItem[]> {
  if (!items.some((item) => !item.jobTitle)) return items;

  const applications = await loadWorkerApplicationsForResumeMatch(supabase, workerId, tenantId);
  if (applications.length === 0) return items;

  const applicationById = new Map(applications.map((app) => [app.id, app]));

  return items.map((item) => {
    if (item.jobTitle) return item;

    if (item.jobApplicationId) {
      const linked = applicationById.get(item.jobApplicationId);
      if (linked) {
        return { ...item, jobTitle: linked.jobTitle };
      }
    }

    const uploadedMs = new Date(item.uploadedAt).getTime();
    const matchedByTime =
      applications.find((app) => new Date(app.createdAt).getTime() <= uploadedMs) ??
      applications[0];

    return {
      ...item,
      jobApplicationId: item.jobApplicationId ?? matchedByTime.id,
      jobTitle: matchedByTime.jobTitle,
    };
  });
}

async function enrichResumeUploaders(
  supabase: SupabaseClient,
  workerId: string,
  tenantId: string,
  items: WorkerResumeListItem[],
  rows: WorkerResumeRow[],
  options?: { includeUploaderPhotos?: boolean }
): Promise<WorkerResumeListItem[]> {
  if (items.length === 0) return items;

  const uploaderByResumeId = new Map(
    rows.map((row) => [String(row.id), row.uploaded_by_user_id?.trim() || null])
  );

  const { data: worker, error: workerError } = await supabase
    .from("worker")
    .select("user_id, first_name, last_name, profile_photo")
    .eq("id", workerId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (workerError) throw workerError;

  const workerUserId =
    worker?.user_id != null && String(worker.user_id).trim()
      ? String(worker.user_id).trim()
      : null;
  const workerDisplayName =
    formatPersonName(
      worker?.first_name as string | null | undefined,
      worker?.last_name as string | null | undefined
    ) || "You";
  const workerPhotoUrl =
    options?.includeUploaderPhotos === false
      ? null
      : await resolveWorkerProfilePhotoUrl(supabase, worker?.profile_photo);

  const uploaderIds = [
    ...new Set(
      [...uploaderByResumeId.values()].filter((id): id is string => Boolean(id))
    ),
  ];
  const staffIdsToLoad = uploaderIds.filter((id) => id !== workerUserId);

  const staffNamesById = new Map<string, string>();
  const staffPhotosById = new Map<string, string | null>();
  if (staffIdsToLoad.length > 0) {
    const { data: staffRows, error: staffError } = await supabase
      .from("users")
      .select("id, first_name, last_name, profile_photo")
      .in("id", staffIdsToLoad);
    if (staffError) throw staffError;
    await Promise.all(
      ((staffRows ?? []) as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        profile_photo: string | null;
      }[]).map(async (staff) => {
        const name = formatPersonName(staff.first_name, staff.last_name);
        staffNamesById.set(staff.id, name || "Recruiter");
        staffPhotosById.set(
          staff.id,
          options?.includeUploaderPhotos === false
            ? null
            : await resolveStaffProfilePhotoUrl(supabase, staff.profile_photo)
        );
      })
    );
  }

  return items.map((item) => {
    const uploaderId = uploaderByResumeId.get(item.id) ?? null;
    const originalFileName = buildWorkerResumeFileName({
      firstName: worker?.first_name as string | null | undefined,
      lastName: worker?.last_name as string | null | undefined,
      originalFileName: item.originalFileName,
    });

    if (uploaderId && workerUserId && uploaderId === workerUserId) {
      return {
        ...item,
        originalFileName,
        uploadedByName: workerDisplayName,
        uploadedByPhotoUrl: workerPhotoUrl,
        uploadedByRoleLabel: "Worker",
      };
    }

    if (uploaderId) {
      return {
        ...item,
        originalFileName,
        uploadedByName: staffNamesById.get(uploaderId) || "Recruiter",
        uploadedByPhotoUrl: staffPhotosById.get(uploaderId) ?? null,
        uploadedByRoleLabel: "Admin",
      };
    }

    return {
      ...item,
      originalFileName,
      uploadedByName: workerDisplayName,
      uploadedByPhotoUrl: workerPhotoUrl,
      uploadedByRoleLabel: "Worker",
    };
  });
}

export async function uploadWorkerResumeForApplicant(
  supabase: SupabaseClient,
  applicant: ApplicantWorkerRow,
  userId: string,
  file: File,
  jobApplicationId: string
) {
  return storeResumeFromFile(supabase, applicant, userId, file, "insert", { jobApplicationId });
}

export async function reuploadWorkerResumeForApplicant(
  supabase: SupabaseClient,
  applicant: ApplicantWorkerRow,
  userId: string,
  resumeId: string,
  file: File
) {
  return storeResumeFromFile(supabase, applicant, userId, file, "update", { resumeId });
}

export async function deleteWorkerResumeForApplicant(
  supabase: SupabaseClient,
  applicant: ApplicantWorkerRow,
  resumeId: string
): Promise<void> {
  await softDeleteWorkerResumeRecord(supabase, applicant.id, resumeId);
  await syncWorkerPrimaryResumePath(supabase, applicant.id, applicant.user_id);
}

export async function getWorkerResumeFileUrl(
  supabase: SupabaseClient,
  workerId: string,
  resumeId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("worker_resumes")
    .select("file_url, storage_path")
    .eq("id", resumeId)
    .eq("worker_id", workerId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;

  const stored =
    (data?.storage_path as string | null)?.trim() ||
    (data?.file_url as string | null)?.trim() ||
    null;
  if (!stored) return null;

  return resolveStorageAccessibleUrl(supabase, stored, {
    defaultBucket: WORKER_RESUMES_BUCKET,
    extraBuckets: [WORKER_RESUMES_BUCKET],
  });
}

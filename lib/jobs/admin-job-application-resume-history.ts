import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveStaffProfilePhotoUrl } from "@/lib/account/staff-profile-photo";
import { resolveWorkerProfilePhotoUrl } from "@/lib/applicant-portal/worker-profile-photo";
import { publicJobDisplayTitle } from "@/lib/jobs/public-application-routing";
import { isReuploadedResumePath } from "@/lib/resume/resume-reupload-path";
import { countResumeUploadsForRole } from "@/lib/resume/resume-upload-limit";
import { buildWorkerResumeFileName } from "@/lib/resume/worker-resume-file-name";
import { ensureApplicationResumeFromWorker } from "@/lib/jobs/match-analysis/ensure-application-resume";

export type AdminJobApplicationResumeHistoryItem = {
  id: string;
  fileName: string;
  fileIconType: "pdf" | "jpeg" | "docx";
  uploadedAt: string;
  uploadedAtLabel: string;
  uploadedByName: string;
  uploadedByPhotoUrl: string | null;
  uploadedByType: "worker" | "staff" | "unknown";
  parsingStatus: "pending" | "processing" | "completed" | "failed";
  isReuploaded: boolean;
  improvementSummary?: unknown;
};
export type AdminJobApplicationResumeHistoryResult = {
  jobTitle: string;
  applicationId: string;
  resumes: AdminJobApplicationResumeHistoryItem[];
  /** Admin uploads for this candidate across every job, which is what the quota counts. */
  adminUploadCount: number;
};

type JobRequisitionJoin = {
  public_title?: string | null;
  source_job_title?: string | null;
  source_type?: string | null;
  employment_type?: string | null;
  location?: string | null;
};

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

function formatPersonName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  return [firstName, lastName].map((part) => (part ?? "").trim()).filter(Boolean).join(" ");
}

function resolveFileIconType(
  fileName: string,
  fileType: string | null | undefined
): "pdf" | "jpeg" | "docx" {
  const mime = (fileType ?? "").toLowerCase();
  const lower = fileName.toLowerCase();
  if (mime.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(lower)) return "jpeg";
  if (
    mime.includes("wordprocessingml") ||
    mime === "application/msword" ||
    /\.docx?$/i.test(lower)
  ) {
    return "docx";
  }
  return "pdf";
}

export type ResumeHistorySourceRow = {
  id: string;
  original_file_name: string | null;
  file_name: string | null;
  file_type: string | null;
  uploaded_at: string;
  uploaded_by_user_id: string | null;
  storage_path?: string | null;
  file_url?: string | null;
  job_application_id?: string | null;
  parsing_status?: string | null;
  parse_status?: string | null;
  parsed_json?: unknown;
};

function resolveHistoryParsingStatus(
  row: ResumeHistorySourceRow
): AdminJobApplicationResumeHistoryItem["parsingStatus"] {
  const raw = (row.parse_status || row.parsing_status || "pending").trim().toLowerCase();
  if (raw === "completed" || raw === "processing" || raw === "failed") return raw;
  return "pending";
}

function resumeStoragePath(row: ResumeHistorySourceRow): string {
  return (row.storage_path ?? row.file_url ?? "").trim();
}

function sortByUploadedAt(a: ResumeHistorySourceRow, b: ResumeHistorySourceRow): number {
  return new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime();
}

/**
 * Job-scoped uploads first. If the candidate applied with a résumé that was
 * never tagged to this application (common for public apply), include the
 * currently displayed worker/profile file so history matches the preview.
 */
export function selectResumesForJobHistory(
  rows: ResumeHistorySourceRow[],
  applicationId: string,
  currentResumePaths: string[]
): ResumeHistorySourceRow[] {
  const appId = applicationId.trim();
  const paths = new Set(
    currentResumePaths.map((path) => path.trim()).filter(Boolean)
  );
  const scoped = rows.filter((row) => String(row.job_application_id ?? "").trim() === appId);
  const unscoped = rows.filter((row) => !String(row.job_application_id ?? "").trim());

  if (scoped.length > 0) {
    const scopedPaths = new Set(scoped.map(resumeStoragePath).filter(Boolean));
    const extras = unscoped.filter((row) => {
      const path = resumeStoragePath(row);
      return Boolean(path) && paths.has(path) && !scopedPaths.has(path);
    });
    return [...scoped, ...extras].sort(sortByUploadedAt);
  }

  if (paths.size > 0) {
    const matching = unscoped.filter((row) => paths.has(resumeStoragePath(row)));
    if (matching.length > 0) return matching.sort(sortByUploadedAt);
  }

  if (unscoped.length === 1) return unscoped;
  return [];
}

export async function loadAdminJobApplicationResumeHistory(
  supabase: SupabaseClient,
  tenantId: string,
  applicationId: string
): Promise<AdminJobApplicationResumeHistoryResult | null> {
  const { data: application, error: appError } = await supabase
    .from("job_applications")
    .select(
      "id, worker_id, applicant_profile_id, job_requisitions(public_title, source_job_title, source_type, employment_type, location)"
    )
    .eq("tenant_id", tenantId)
    .eq("id", applicationId)
    .maybeSingle();

  if (appError) throw appError;
  if (!application?.id) return null;

  let workerId =
    typeof application.worker_id === "string" && application.worker_id.trim()
      ? application.worker_id.trim()
      : null;
  const profileId =
    typeof application.applicant_profile_id === "string" &&
    application.applicant_profile_id.trim()
      ? application.applicant_profile_id.trim()
      : null;

  const jobRaw = application.job_requisitions;
  const job = (Array.isArray(jobRaw) ? jobRaw[0] : jobRaw) as JobRequisitionJoin | undefined;
  const jobTitle = job ? publicJobDisplayTitle(job).trim() || "Job" : "Job";

  const currentResumePaths: string[] = [];
  if (profileId) {
    const { data: profile, error: profileError } = await supabase
      .from("applicant_profiles")
      .select("worker_id, resume_path")
      .eq("tenant_id", tenantId)
      .eq("id", profileId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!workerId && typeof profile?.worker_id === "string" && profile.worker_id.trim()) {
      workerId = profile.worker_id.trim();
    }
    const profileResumePath =
      typeof profile?.resume_path === "string" ? profile.resume_path.trim() : "";
    if (profileResumePath) currentResumePaths.push(profileResumePath);
  }

  if (!workerId) {
    return {
      jobTitle,
      applicationId: String(application.id),
      resumes: [],
      adminUploadCount: 0,
    };
  }

  // Import / talent-pool: attach existing worker résumé before listing history.
  await ensureApplicationResumeFromWorker({
    supabase,
    tenantId,
    applicationId,
    workerId,
  }).catch((error) => {
    console.warn(
      "[resume-history] ensure application resume failed:",
      error instanceof Error ? error.message : error
    );
  });

  const { data: worker, error: workerError } = await supabase
    .from("worker")
    .select("id, user_id, first_name, last_name, profile_photo")
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
    ) || "Candidate";
  const workerPhotoUrl = await resolveWorkerProfilePhotoUrl(
    supabase,
    worker?.profile_photo
  );

  const { data: requirementRows, error: requirementError } = await supabase
    .from("worker_requirements")
    .select("resume_path")
    .or(
      workerUserId
        ? `worker_id.eq.${workerId},worker_id.eq.${workerUserId}`
        : `worker_id.eq.${workerId}`
    )
    .order("updated_at", { ascending: false })
    .limit(1);
  if (requirementError) throw requirementError;
  const requirementResumePath =
    typeof requirementRows?.[0]?.resume_path === "string"
      ? requirementRows[0].resume_path.trim()
      : "";
  if (requirementResumePath) currentResumePaths.push(requirementResumePath);

  let resumeQuery = supabase
    .from("worker_resumes")
    .select(
      "id, original_file_name, file_name, file_type, uploaded_at, uploaded_by_user_id, storage_path, file_url, job_application_id, parsing_status, parse_status, parsed_json"
    )
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: true });
  resumeQuery = workerUserId
    ? resumeQuery.or(`worker_id.eq.${workerId},worker_id.eq.${workerUserId}`)
    : resumeQuery.eq("worker_id", workerId);

  const { data: resumeRows, error: resumeError } = await resumeQuery;
  if (resumeError) throw resumeError;

  const selectedResumeRows = selectResumesForJobHistory(
    (resumeRows ?? []) as ResumeHistorySourceRow[],
    applicationId,
    currentResumePaths
  );

  const uploaderIds = [
    ...new Set(
      selectedResumeRows
        .map((row) => row.uploaded_by_user_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const staffNamesById = new Map<string, string>();
  const staffPhotosById = new Map<string, string | null>();
  const staffIdsToLoad = uploaderIds.filter((id) => id !== workerUserId);
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
          await resolveStaffProfilePhotoUrl(supabase, staff.profile_photo)
        );
      })
    );
  }

  const resumes = selectedResumeRows.map((row) => {
    const uploaderId = row.uploaded_by_user_id?.trim() || null;
    let uploadedByType: AdminJobApplicationResumeHistoryItem["uploadedByType"] = "unknown";
    let uploadedByName = "Unknown";
    let uploadedByPhotoUrl: string | null = null;
    const fileName = buildWorkerResumeFileName({
      firstName: worker?.first_name as string | null | undefined,
      lastName: worker?.last_name as string | null | undefined,
      originalFileName:
        row.original_file_name?.trim() ||
        row.file_name?.trim() ||
        "Resume.pdf",
    });

    if (uploaderId && workerUserId && uploaderId === workerUserId) {
      uploadedByType = "worker";
      uploadedByName = workerDisplayName;
      uploadedByPhotoUrl = workerPhotoUrl;
    } else if (uploaderId) {
      uploadedByType = "staff";
      uploadedByName = staffNamesById.get(uploaderId) || "Recruiter";
      uploadedByPhotoUrl = staffPhotosById.get(uploaderId) ?? null;
    } else if (workerUserId) {
      uploadedByType = "worker";
      uploadedByName = workerDisplayName;
      uploadedByPhotoUrl = workerPhotoUrl;
    }

    return {
      id: String(row.id),
      fileName,
      fileIconType: resolveFileIconType(fileName, row.file_type),
      uploadedAt: row.uploaded_at,
      uploadedAtLabel: formatUploadedAt(row.uploaded_at),
      uploadedByName,
      uploadedByPhotoUrl,
      uploadedByType,
      parsingStatus: resolveHistoryParsingStatus(row),
      isReuploaded: isReuploadedResumePath(row.storage_path, row.file_url),
      improvementSummary:
        row.parsed_json &&
        typeof row.parsed_json === "object" &&
        row.parsed_json !== null &&
        "improvementSummary" in row.parsed_json
          ? (row.parsed_json as { improvementSummary?: unknown }).improvementSummary
          : undefined,
    };
  });

  return {
    jobTitle,
    applicationId: String(application.id),
    resumes,
    adminUploadCount: countResumeUploadsForRole(
      (resumeRows ?? []) as Array<{ uploaded_by_user_id?: string | null }>,
      "admin",
      workerUserId,
      workerId
    ),
  };
}

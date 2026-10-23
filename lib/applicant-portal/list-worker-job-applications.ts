import type { SupabaseClient } from "@supabase/supabase-js";
import { applicationStatusLabel } from "@/lib/jobs/application-status";
import { publicJobDisplayTitle } from "@/lib/jobs/public-application-routing";
import { buildWorkerResumeFileName } from "@/lib/resume/worker-resume-file-name";

export type WorkerJobApplicationResume = {
  id: string;
  fileName: string;
  fileSizeLabel: string;
  fileType: string | null;
  /** Application this résumé row is bound to; may differ from the list item when it is a fallback. */
  jobApplicationId: string | null;
};

export type WorkerJobApplicationListItem = {
  id: string;
  jobRequisitionId: string;
  jobTitle: string;
  companyName: string;
  workType: string;
  location: string;
  jobStatus: string | null;
  appliedAt: string;
  status: string;
  statusName: string;
  statusColor: string | null;
  statusGroupName: string | null;
  statusGroupDescription: string | null;
  statusGroupSortOrder: number | null;
  statusNote: string | null;
  resume: WorkerJobApplicationResume | null;
  matchScore: number | null;
  matchCategory: string | null;
  matchStatus: string | null;
};

type JobRequisitionJoin = {
  public_title?: string | null;
  source_job_title?: string | null;
  source_type?: string | null;
  employment_type?: string | null;
  facility?: string | null;
  facility_name?: string | null;
  location?: string | null;
  status?: string | null;
};

type StatusGroupJoin = {
  name?: string | null;
  description?: string | null;
  sort_order?: number | null;
};

type ApplicationStatusJoin = {
  name?: string | null;
  system_key?: string | null;
  color?: string | null;
  application_status_groups?: StatusGroupJoin | StatusGroupJoin[] | null;
};

type TenantJoin = {
  name?: string | null;
};

type ApplicationRow = {
  id: string;
  job_requisition_id?: string | null;
  status?: string | null;
  created_at?: string | null;
  submitted_at?: string | null;
  ai_match_score?: number | null;
  ai_match_category?: string | null;
  ai_match_status?: string | null;
  application_statuses?: ApplicationStatusJoin | ApplicationStatusJoin[] | null;
  job_requisitions?: JobRequisitionJoin | JobRequisitionJoin[] | null;
  tenants?: TenantJoin | TenantJoin[] | null;
};

type StatusHistoryRow = {
  application_id?: string | null;
  note?: string | null;
};

type ResumeRow = {
  id: string;
  original_file_name?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_size_bytes?: number | null;
  job_application_id?: string | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function companyNameFromJob(job: JobRequisitionJoin | null, tenantName: string): string {
  return job?.facility_name?.trim() || job?.facility?.trim() || tenantName || "Company";
}

export async function listWorkerJobApplications(
  supabase: SupabaseClient,
  input: { workerId: string; tenantId: string },
  options?: { includeStatusNotes?: boolean; includeResumes?: boolean }
): Promise<WorkerJobApplicationListItem[]> {
  const includeResumes = options?.includeResumes !== false;
  const includeStatusNotes = options?.includeStatusNotes !== false;
  const [applicationResult, resumeResult, workerResult] = await Promise.all([
    supabase
      .from("job_applications")
      .select(
        [
          "id",
          "job_requisition_id",
          "status",
          "status_id",
          "created_at",
          "submitted_at",
          "tenant_id",
          "ai_match_score",
          "ai_match_category",
          "ai_match_status",
          "application_statuses(name, system_key, color, application_status_groups(name, description, sort_order))",
          "job_requisitions(public_title, source_job_title, source_type, employment_type, facility, facility_name, location, status)",
          "tenants:tenant_id(name)",
        ].join(", ")
      )
      .eq("worker_id", input.workerId)
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false }),
    includeResumes
      ? supabase
          .from("worker_resumes")
          .select("id, original_file_name, file_name, file_type, file_size_bytes, uploaded_at, job_application_id")
          .eq("worker_id", input.workerId)
          .eq("tenant_id", input.tenantId)
          .is("deleted_at", null)
          .order("uploaded_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("worker")
      .select("first_name, last_name")
      .eq("id", input.workerId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle(),
  ]);

  if (applicationResult.error) throw applicationResult.error;

  const rows = (applicationResult.data ?? []) as unknown as ApplicationRow[];
  const applicationIds = rows.map((row) => String(row.id)).filter(Boolean);
  const resumeRows = resumeResult.error ? [] : resumeResult.data;
  const workerFirstName = String(workerResult.data?.first_name ?? "").trim();
  const workerLastName = String(workerResult.data?.last_name ?? "").trim();

  const noteByApplication = new Map<string, string>();
  if (includeStatusNotes && applicationIds.length > 0) {
    const { data: historyRows } = await supabase
      .from("application_status_history")
      .select("application_id, note, created_at")
      .eq("tenant_id", input.tenantId)
      .in("application_id", applicationIds)
      .order("created_at", { ascending: false });

    for (const history of (historyRows ?? []) as unknown as StatusHistoryRow[]) {
      const applicationId = String(history.application_id ?? "");
      if (!applicationId || noteByApplication.has(applicationId)) continue;
      const note = String(history.note ?? "").trim();
      noteByApplication.set(applicationId, note);
    }
  }

  const latestResumeByApplication = new Map<string, WorkerJobApplicationResume>();
  let latestResume: WorkerJobApplicationResume | null = null;

  for (const resume of (resumeRows ?? []) as unknown as ResumeRow[]) {
    const linkedApplicationId = String(resume.job_application_id ?? "").trim();
    const item: WorkerJobApplicationResume = {
      id: String(resume.id),
      fileName: buildWorkerResumeFileName({
        firstName: workerFirstName,
        lastName: workerLastName,
        originalFileName:
          String(resume.original_file_name ?? "").trim() ||
          String(resume.file_name ?? "").trim() ||
          "Resume.pdf",
      }),
      fileSizeLabel: formatFileSize(resume.file_size_bytes),
      fileType: resume.file_type ?? null,
      jobApplicationId: linkedApplicationId || null,
    };
    if (!latestResume) latestResume = item;
    if (linkedApplicationId && !latestResumeByApplication.has(linkedApplicationId)) {
      latestResumeByApplication.set(linkedApplicationId, item);
    }
  }

  return rows.map((row) => {
    const applicationId = String(row.id);
    const status = String(row.status ?? "");
    const statusJoin = one(row.application_statuses);
    const statusGroup = statusJoin?.application_status_groups
      ? Array.isArray(statusJoin.application_status_groups)
        ? statusJoin.application_status_groups[0] ?? null
        : statusJoin.application_status_groups
      : null;
    const job = one(row.job_requisitions);
    const tenant = one(row.tenants);
    const tenantName = tenant?.name?.trim() || "Company";
    const note = (noteByApplication.get(applicationId) ?? "").trim();

    const matchScore =
      row.ai_match_score == null || !Number.isFinite(Number(row.ai_match_score))
        ? null
        : Number(row.ai_match_score);

    return {
      id: applicationId,
      jobRequisitionId: String(row.job_requisition_id ?? "").trim(),
      jobTitle: job ? publicJobDisplayTitle(job) || "Untitled job" : "Untitled job",
      companyName: companyNameFromJob(job, tenantName),
      workType: job?.employment_type?.trim() || "",
      location: job?.location?.trim() || "",
      jobStatus: job?.status?.trim() || null,
      appliedAt: String(row.submitted_at || row.created_at || ""),
      status,
      statusName: statusJoin?.name?.trim() || applicationStatusLabel(status),
      statusColor: statusJoin?.color?.trim() || null,
      statusGroupName: statusGroup?.name?.trim() || null,
      statusGroupDescription: statusGroup?.description?.trim() || null,
      statusGroupSortOrder:
        statusGroup?.sort_order == null ? null : Number(statusGroup.sort_order),
      statusNote: note || null,
      resume: latestResumeByApplication.get(applicationId) ?? latestResume,
      matchScore,
      matchCategory: row.ai_match_category?.trim() || null,
      matchStatus: row.ai_match_status?.trim() || null,
    };
  });
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildSmartInsight,
  countWorkTypes,
  formatCandidateLocation,
  isActiveApplicant,
  pickBestMatch,
  pickProfessionalSummaryText,
  resolveOverallApplicationStatus,
  summarizeApplicationStatuses,
  summarizeWorkTypes,
  type CandidateProfileActivity,
  type CandidateProfileDocument,
  type CandidateProfilePayload,
  type CandidateProfileSubmittedResume,
} from "@/lib/admin/candidate-profile-view";
import { formatPipelineStatusLabel } from "@/lib/workers/candidate-status-label";
import { listWorkerJobApplications } from "@/lib/applicant-portal/list-worker-job-applications";
import { listWorkerResumesForApplicant } from "@/lib/applicant-portal/worker-resume-service";
import { listWorkerDocumentsForApplicant } from "@/lib/applicant-portal/worker-document-service";
import { resolveWorkerProfilePhotoUrl } from "@/lib/applicant-portal/worker-profile-photo";
import { createPerfTimer, logPerf } from "@/lib/perf";

function asText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function asDetail(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return asText(record.message) || asText(record.note) || asText(record.summary);
  }
  return "";
}

const GENERIC_ACTIVITY_DETAILS = new Set(["worker", "candidate", "job_application", "candidate activity"]);

function humanizeAction(action: string): string {
  const normalized = action.trim().toLowerCase().replace(/[.\s]+/g, "_");
  if (normalized === "worker_profile_view" || normalized === "profile_view") return "Viewed profile";
  if (normalized === "job_application_removed_from_job") return "Removed from job";
  return action
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const PROFESSIONAL_SUMMARY_SELECT =
  "extracted_text, parsing_status, parse_status, uploaded_at";

async function loadProfessionalSummaryText(
  supabase: SupabaseClient,
  workerId: string,
  tenantId: string
): Promise<string> {
  const completed = await supabase
    .from("worker_resumes")
    .select(PROFESSIONAL_SUMMARY_SELECT)
    .eq("worker_id", workerId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .or("parse_status.eq.completed,parsing_status.eq.completed")
    .not("extracted_text", "is", null)
    .order("uploaded_at", { ascending: false })
    .limit(1);

  if (completed.error) {
    console.warn("[candidate-profile] professional_summary", completed.error);
  }

  const completedText = pickProfessionalSummaryText(
    (completed.data ?? []) as Array<{
      extracted_text?: string | null;
      parsing_status?: string | null;
      parse_status?: string | null;
      uploaded_at?: string | null;
    }>
  );
  if (completedText) return completedText;

  const latest = await supabase
    .from("worker_resumes")
    .select(PROFESSIONAL_SUMMARY_SELECT)
    .eq("worker_id", workerId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .not("extracted_text", "is", null)
    .order("uploaded_at", { ascending: false })
    .limit(1);

  if (latest.error) {
    console.warn("[candidate-profile] professional_summary_latest", latest.error);
  }

  return pickProfessionalSummaryText(
    (latest.data ?? []) as Array<{
      extracted_text?: string | null;
      parsing_status?: string | null;
      parse_status?: string | null;
      uploaded_at?: string | null;
    }>
  );
}

export async function loadCandidateProfile(
  supabase: SupabaseClient,
  input: { workerId: string; tenantId: string; view?: "full" | "journey" }
): Promise<CandidateProfilePayload | null> {
  const timer = createPerfTimer();
  const journeyView = input.view === "journey";
  const workerPromise = supabase
    .from("worker")
    .select(
      "id, first_name, last_name, email, phone, address1, address2, city, state, zip, job_role, status, profile_photo, tenant_id"
    )
    .eq("id", input.workerId)
    .maybeSingle();

  const relatedPromise = Promise.all([
    listWorkerJobApplications(
      supabase,
      {
        workerId: input.workerId,
        tenantId: input.tenantId,
      },
      journeyView ? { includeStatusNotes: false, includeResumes: false } : undefined
    ),
    journeyView
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("activity_logs")
          .select("id, action, entity_type, details, created_at")
          .eq("entity_id", input.workerId)
          .order("created_at", { ascending: false })
          .limit(500),
    journeyView
      ? Promise.resolve([])
      : listWorkerResumesForApplicant(supabase, input.workerId, input.tenantId, {
          includeUploaderPhotos: false,
        }).catch((error) => {
          console.warn("[candidate-profile] worker_resumes", error);
          return [];
        }),
    journeyView
      ? Promise.resolve([])
      : listWorkerDocumentsForApplicant(supabase, input.workerId, input.tenantId).catch((error) => {
          console.warn("[candidate-profile] worker_documents", error);
          return [];
        }),
    journeyView
      ? Promise.resolve("")
      : loadProfessionalSummaryText(supabase, input.workerId, input.tenantId),
  ]);

  const { data: worker, error } = await workerPromise;
  if (error) throw error;
  if (!worker?.id) return null;

  const workerTenantId = asText(worker.tenant_id);
  if (workerTenantId && workerTenantId !== input.tenantId) return null;

  const [related, photo] = await Promise.all([
    relatedPromise,
    resolveWorkerProfilePhotoUrl(supabase, worker.profile_photo),
  ]);

  const [applications, activityResult, resumeList, documentList, professionalSummary] = related;
  const photoUrl = photo;

  const activityRows = activityResult.error ? [] : (activityResult.data ?? []);
  if (activityResult.error) {
    console.warn("[candidate-profile] activity_logs", activityResult.error);
  }

  const firstName = asText(worker.first_name);
  const lastName = asText(worker.last_name);
  const name = `${firstName} ${lastName}`.trim() || asText(worker.email) || "Applicant";
  const workTypes = countWorkTypes(applications);
  const match = pickBestMatch(applications);
  const overallStatus = resolveOverallApplicationStatus(applications);
  const workerStatus = asText(worker.status);

  const resumes: CandidateProfileSubmittedResume[] = resumeList.map((resume) => ({
    id: resume.id,
    fileName: resume.originalFileName,
    fileSizeLabel: resume.fileSizeLabel,
    fileType: resume.fileType,
    parsingStatus: resume.parsingStatus,
    uploadedAt: resume.uploadedAt,
    uploadedAtLabel: resume.uploadedAtLabel,
    isReuploaded: resume.isReuploaded,
    jobApplicationId: resume.jobApplicationId,
    jobTitle: resume.jobTitle,
    uploadedByName: resume.uploadedByName?.trim() || "Unknown",
    uploadedByRoleLabel: resume.uploadedByRoleLabel,
  }));

  const documents: CandidateProfileDocument[] = documentList.map((doc) => ({
    id: doc.id,
    title: doc.title,
    fileName: doc.fileName,
    kind: "document",
    uploadedAt: doc.uploadedAt,
    uploadedAtLabel: doc.uploadedAtLabel,
    uploadedByName: doc.uploadedByName,
    uploadedByRoleLabel: doc.uploadedByRoleLabel,
  }));

  const activity: CandidateProfileActivity[] = (activityRows as Array<Record<string, unknown>>).map(
    (row) => {
      const title = humanizeAction(asText(row.action) || "Activity");
      const detail = asDetail(row.details);
      const entityType = asText(row.entity_type);
      const showDetail =
        Boolean(detail) &&
        !GENERIC_ACTIVITY_DETAILS.has(detail.toLowerCase()) &&
        detail.toLowerCase() !== title.toLowerCase();
      return {
        id: String(row.id ?? `${row.created_at}-${row.action}`),
        at: asText(row.created_at),
        title,
        detail: showDetail ? detail : entityType && !GENERIC_ACTIVITY_DETAILS.has(entityType.toLowerCase()) ? entityType : "",
      };
    }
  );

  for (const application of applications) {
    activity.push({
      id: `applied-${application.id}`,
      at: application.appliedAt,
      title: `Applied to ${application.jobTitle}`,
      detail: application.companyName,
    });
    if (!application.statusNote) continue;
    activity.push({
      id: `status-note-${application.id}`,
      at: application.appliedAt,
      title: `${application.jobTitle} · ${application.statusName}`,
      detail: application.statusNote,
    });
  }

  activity.sort((a, b) => String(b.at).localeCompare(String(a.at)));

  const payload = {
    candidate: {
      id: String(worker.id),
      name,
      firstName,
      lastName,
      email: asText(worker.email),
      phone: asText(worker.phone),
      location: formatCandidateLocation({
        address1: asText(worker.address1),
        address2: asText(worker.address2),
        city: asText(worker.city),
        state: asText(worker.state),
        zip: asText(worker.zip),
      }),
      role: asText(worker.job_role),
      status: workerStatus,
      statusLabel: formatPipelineStatusLabel(workerStatus),
      isActiveApplicant: isActiveApplicant(workerStatus, applications),
      profilePhotoUrl: photoUrl,
      yearsExperience: null,
    },
    stats: {
      totalApplications: workTypes.total,
      w2Applications: workTypes.w2,
      contractor1099Applications: workTypes.contractor1099,
      overallStatus,
    },
    match,
    applications,
    workTypeSummary: summarizeWorkTypes(applications),
    statusSummary: summarizeApplicationStatuses(applications),
    smartInsight: buildSmartInsight({
      firstName: firstName || name,
      workTypes,
      match,
    }),
    professionalSummary,
    resumes,
    documents,
    activity: activity.slice(0, 500),
  };

  logPerf("candidate.profile.load", {
    totalMs: timer.elapsedMs(),
    workerId: input.workerId,
    tenantId: input.tenantId,
    view: journeyView ? "journey" : "full",
    applications: applications.length,
    resumes: resumes.length,
    documents: documents.length,
    activity: activity.length,
  });

  return payload;
}

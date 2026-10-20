import type { SupabaseClient } from "@supabase/supabase-js";
import {
  WORKER_REQUIRED_FILES_BUCKET,
  WORKER_RESUMES_BUCKET,
} from "@/lib/supabase-storage-buckets";

export type EmploymentDocumentManifestItem = {
  source: "worker_resumes" | "worker_submitted_documents" | "worker_documents";
  id: string;
  title: string;
  path: string;
  bucket: string;
  applicationId?: string | null;
  status?: string | null;
  uploadedAt?: string | null;
  field?: string | null;
};

export type EmploymentApplicationSnapshot = {
  id: string;
  status?: string | null;
  jobRequisitionId?: string | null;
  submittedAt?: string | null;
  hiredAt?: string | null;
  workflowPhase?: string | null;
  source?: string | null;
  aiMatchScore?: number | null;
};

const LEGACY_DOC_FIELDS = [
  "document_url",
  "ssn_url",
  "ssn_back_url",
  "drivers_license_url",
  "drivers_license_back_url",
  "cpr_certification_url",
  "nursing_license_url",
  "tb_test_url",
  "agreement_w2_url",
  "agreement_i9_url",
] as const;

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function buildApplicationSnapshotFromRow(row: {
  id?: string | null;
  status?: string | null;
  job_requisition_id?: string | null;
  submitted_at?: string | null;
  hired_at?: string | null;
  workflow_phase?: string | null;
  source?: string | null;
  ai_match_score?: number | string | null;
} | null): EmploymentApplicationSnapshot | null {
  if (!row?.id) return null;
  const scoreRaw = row.ai_match_score;
  const aiMatchScore =
    typeof scoreRaw === "number"
      ? scoreRaw
      : typeof scoreRaw === "string" && scoreRaw.trim()
        ? Number(scoreRaw)
        : null;
  return {
    id: String(row.id),
    status: row.status ?? null,
    jobRequisitionId: row.job_requisition_id ? String(row.job_requisition_id) : null,
    submittedAt: row.submitted_at ?? null,
    hiredAt: row.hired_at ?? null,
    workflowPhase: row.workflow_phase ?? null,
    source: row.source ?? null,
    aiMatchScore: Number.isFinite(aiMatchScore as number) ? (aiMatchScore as number) : null,
  };
}

export function pushLegacyDocumentFields(
  items: EmploymentDocumentManifestItem[],
  row: Record<string, unknown>
): void {
  const id = row.id != null ? String(row.id) : "";
  if (!id) return;
  const applicationId = row.application_id != null ? String(row.application_id) : null;
  for (const field of LEGACY_DOC_FIELDS) {
    const path = asText(row[field]);
    if (!path) continue;
    items.push({
      source: "worker_documents",
      id,
      title: field,
      path,
      bucket: WORKER_REQUIRED_FILES_BUCKET,
      applicationId,
      field,
    });
  }
}

/** Collect storage inventory for a candidate person id (fallback when RPC helpers unavailable). */
export async function collectEmploymentWorkerTransferSnapshot(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    candidateId: string;
    sourceJobApplicationId?: string | null;
    profilePhoto?: string | null;
  }
): Promise<{
  profilePhoto: string | null;
  applicationSnapshot: EmploymentApplicationSnapshot | Record<string, never>;
  documentsManifest: EmploymentDocumentManifestItem[];
}> {
  const documentsManifest: EmploymentDocumentManifestItem[] = [];

  const [resumesRes, submittedRes, legacyRes, appRes] = await Promise.all([
    supabase
      .from("worker_resumes")
      .select(
        "id, original_file_name, file_name, storage_path, file_url, job_application_id, uploaded_at, deleted_at"
      )
      .eq("tenant_id", input.tenantId)
      .eq("worker_id", input.candidateId)
      .is("deleted_at", null),
    supabase
      .from("worker_submitted_documents")
      .select("id, original_file_name, file_url, application_id, status, uploaded_at")
      .eq("tenant_id", input.tenantId)
      .eq("worker_id", input.candidateId),
    supabase
      .from("worker_documents")
      .select(
        "id, application_id, document_url, ssn_url, ssn_back_url, drivers_license_url, drivers_license_back_url, cpr_certification_url, nursing_license_url, tb_test_url, agreement_w2_url, agreement_i9_url"
      )
      .eq("tenant_id", input.tenantId)
      .eq("worker_id", input.candidateId),
    input.sourceJobApplicationId
      ? supabase
          .from("job_applications")
          .select(
            "id, status, job_requisition_id, submitted_at, hired_at, workflow_phase, source, ai_match_score"
          )
          .eq("tenant_id", input.tenantId)
          .eq("id", input.sourceJobApplicationId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  for (const row of resumesRes.data ?? []) {
    const path = asText(row.storage_path) || asText(row.file_url);
    if (!path) continue;
    documentsManifest.push({
      source: "worker_resumes",
      id: String(row.id),
      title: asText(row.original_file_name) || asText(row.file_name) || "Resume",
      path,
      bucket: WORKER_RESUMES_BUCKET,
      applicationId: row.job_application_id ? String(row.job_application_id) : null,
      uploadedAt: row.uploaded_at ?? null,
    });
  }

  for (const row of submittedRes.data ?? []) {
    const path = asText(row.file_url);
    if (!path) continue;
    documentsManifest.push({
      source: "worker_submitted_documents",
      id: String(row.id),
      title: asText(row.original_file_name) || "Submitted document",
      path,
      bucket: WORKER_REQUIRED_FILES_BUCKET,
      applicationId: row.application_id ? String(row.application_id) : null,
      status: row.status ?? null,
      uploadedAt: row.uploaded_at ?? null,
    });
  }

  for (const row of legacyRes.data ?? []) {
    pushLegacyDocumentFields(documentsManifest, row as Record<string, unknown>);
  }

  const applicationSnapshot =
    buildApplicationSnapshotFromRow(appRes.data) ?? ({} as Record<string, never>);

  return {
    profilePhoto: asText(input.profilePhoto),
    applicationSnapshot,
    documentsManifest,
  };
}

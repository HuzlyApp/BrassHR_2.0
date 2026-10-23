import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAdminAttachmentRequirements,
  type AdminAttachmentRequirement,
  type LegacyDocumentUrls,
  type SubmittedDocumentRecord,
} from "@/lib/onboarding/build-admin-attachment-requirements";
import { loadTenantOnboardingConfig } from "@/lib/onboarding/load-tenant-config";
import { WORKER_REQUIRED_FILES_BUCKET } from "@/lib/supabase-storage-buckets";
import { resolveStorageAccessibleUrl } from "@/lib/supabase/resolve-storage-accessible-url";
import { listActiveProfessionDocuments } from "@/lib/professions/profession-documents";
import {
  applyProfessionDocumentsToAttachments,
  resolveWorkerTenantProfessionId,
  type ProfessionAttachmentFile,
} from "@/lib/onboarding/profession-attachment-requirements";

export type LoadAdminAttachmentRequirementsArgs = {
  supabase: SupabaseClient;
  workerId: string;
  tenantId: string;
  resumeUrl: string | null;
  resumePath: string | null;
  resumePathRaw: string | null;
  legacyUrls: LegacyDocumentUrls;
};

type LegacyReviewRow = {
  document_key?: string | null;
  status?: string | null;
};

export type LoadAdminAttachmentRequirementsOptions = {
  /** When set, skips re-fetching tenants.onboarding_config_version. */
  onboardingConfigVersion?: number;
  /** When set, skips re-fetching worker_legacy_document_reviews. */
  legacyReviewRows?: LegacyReviewRow[];
  /**
   * Hire-journey phase load only reads document status. Signing every file
   * blocks that response and the signed URLs are not opened from the board.
   * Defaults to true for the attachments screen.
   */
  signFileUrls?: boolean;
};

export async function loadAdminAttachmentRequirements(
  args: LoadAdminAttachmentRequirementsArgs,
  options?: LoadAdminAttachmentRequirementsOptions
): Promise<AdminAttachmentRequirement[]> {
  const { supabase, workerId, tenantId } = args;

  let configVersion = options?.onboardingConfigVersion;
  const needsTenantVersion = configVersion == null;

  const [tenantResult, config, submittedResult, legacyReviewsResult] = await Promise.all([
    needsTenantVersion
      ? supabase
          .from("tenants")
          .select("onboarding_config_version")
          .eq("id", tenantId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    loadTenantOnboardingConfig(supabase, tenantId),
    supabase
      .from("worker_submitted_documents")
      .select("id, required_document_id, file_url, original_file_name, status, uploaded_at, reviewed_at, reviewed_by, review_notes")
      .eq("worker_id", workerId),
    options?.legacyReviewRows
      ? Promise.resolve({ data: options.legacyReviewRows })
      : supabase
          .from("worker_legacy_document_reviews")
          .select("document_key, status")
          .eq("worker_id", workerId),
  ]);

  if (configVersion == null) {
    configVersion =
      (tenantResult.data as { onboarding_config_version?: number } | null)
        ?.onboarding_config_version ?? 0;
  }
  const useLegacyFallback = configVersion < 1;

  const { data: submittedRaw, error: submittedErr } = submittedResult;
  if (submittedErr) {
    console.warn("[load-admin-attachment-requirements] worker_submitted_documents", submittedErr);
  }

  const submittedRows = (submittedRaw ?? []) as Array<{
    id?: string;
    required_document_id?: string;
    file_url?: string;
    original_file_name?: string | null;
    status?: string | null;
    uploaded_at?: string | null;
    reviewed_at?: string | null;
    reviewed_by?: string | null;
    review_notes?: string | null;
  }>;

  const signFileUrls = options?.signFileUrls !== false;
  const signedEntries = await Promise.all(
    submittedRows.map(async (row) => {
      const requiredDocumentId = String(row.required_document_id ?? "").trim();
      if (!requiredDocumentId) return null;

      const fileUrl = String(row.file_url ?? "").trim();
      let signedUrl: string | null = null;
      if (fileUrl) {
        // A stored path is enough to mark the file uploaded. Signing is only
        // needed when the caller opens the file.
        signedUrl = signFileUrls
          ? await resolveStorageAccessibleUrl(supabase, fileUrl, {
              defaultBucket: WORKER_REQUIRED_FILES_BUCKET,
            })
          : fileUrl;
        if (signFileUrls && !signedUrl) {
          console.warn("[load-admin-attachment-requirements] signed URL unavailable for", fileUrl);
        }
      }

      return {
        requiredDocumentId,
        record: {
          submitted_document_id: String(row.id ?? "").trim() || null,
          required_document_id: requiredDocumentId,
          signed_url: signedUrl,
          original_file_name:
            row.original_file_name != null ? String(row.original_file_name) : null,
          status: String(row.status ?? "").trim() || null,
          uploaded_at: row.uploaded_at ?? null,
          reviewed_at: row.reviewed_at ?? null,
          reviewed_by: row.reviewed_by ? String(row.reviewed_by) : null,
          review_notes: row.review_notes ?? null,
        } satisfies SubmittedDocumentRecord,
      };
    })
  );

  const submittedByRequiredId = new Map<string, SubmittedDocumentRecord>();
  for (const entry of signedEntries) {
    if (!entry) continue;
    submittedByRequiredId.set(entry.requiredDocumentId, entry.record);
  }

  const rows = buildAdminAttachmentRequirements({
    config,
    resumeUrl: args.resumeUrl,
    resumePath: args.resumePath,
    resumePathRaw: args.resumePathRaw,
    legacyUrls: args.legacyUrls,
    submittedByRequiredId,
    useLegacyFallback,
  });

  const legacyStatusByKey = new Map<string, string>();
  for (const row of legacyReviewsResult.data ?? []) {
    const key = String((row as LegacyReviewRow).document_key ?? "").trim();
    const status = String((row as LegacyReviewRow).status ?? "").trim();
    if (key && status) legacyStatusByKey.set(key, status);
  }

  const withLegacyStatus = rows.map((row) => {
    if (row.submitted_document_id || !row.legacy_document_key) return row;
    const legacyStatus = legacyStatusByKey.get(row.legacy_document_key);
    return legacyStatus ? { ...row, status: legacyStatus } : row;
  });

  try {
    let professionId = await resolveWorkerTenantProfessionId(supabase, tenantId, workerId);
    if (!professionId) {
      const { data: documented, error: documentedError } = await supabase
        .from("tenant_profession_documents")
        .select("profession_id")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      if (documentedError) throw documentedError;
      const professionIds = [
        ...new Set((documented ?? []).map((row) => String(row.profession_id ?? "")).filter(Boolean)),
      ];
      professionId = professionIds.length === 1 ? professionIds[0] : null;
    }

    const documents = professionId
      ? await listActiveProfessionDocuments(supabase, tenantId, professionId)
      : [];

    const { data: uploads, error: uploadError } = await supabase
      .from("worker_profession_document_uploads")
      .select(
        "id, profession_document_id, file_url, original_file_name, status, uploaded_at, issued_date, expiry_date"
      )
      .eq("tenant_id", tenantId)
      .eq("worker_id", workerId)
      .order("uploaded_at", { ascending: true });
    if (uploadError) throw uploadError;

    const filesByDocumentId = new Map<string, ProfessionAttachmentFile[]>();
    await Promise.all(
      (uploads ?? []).map(async (upload) => {
        const documentId = String(upload.profession_document_id ?? "");
        const fileUrl = String(upload.file_url ?? "").trim();
        if (!documentId || !fileUrl) return;
        const signedUrl = signFileUrls
          ? await resolveStorageAccessibleUrl(supabase, fileUrl, {
              defaultBucket: WORKER_REQUIRED_FILES_BUCKET,
            })
          : fileUrl;
        const list = filesByDocumentId.get(documentId) ?? [];
        list.push({
          id: String(upload.id ?? ""),
          signedUrl,
          originalFileName: upload.original_file_name ? String(upload.original_file_name) : null,
          status: upload.status ? String(upload.status) : null,
          issuedDate: upload.issued_date ? String(upload.issued_date) : null,
          expiryDate: upload.expiry_date ? String(upload.expiry_date) : null,
        });
        filesByDocumentId.set(documentId, list);
      })
    );

    return applyProfessionDocumentsToAttachments(
      withLegacyStatus,
      documents,
      filesByDocumentId,
      args.legacyUrls
    );
  } catch (error) {
    console.warn("[load-admin-attachment-requirements] profession documents", error);
    return withLegacyStatus;
  }
}

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAcceptedDocumentFileType } from "@/lib/document-upload-helpers";
import { WORKER_REQUIRED_FILES_BUCKET } from "@/lib/supabase-storage-buckets";

const MAX_DOC_BYTES = Number(process.env.MAX_REQUIRED_FILE_UPLOAD_BYTES ?? 10 * 1024 * 1024);
export const STAFF_ALLOWED_DOC_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export type LegacyDocColumn =
  | "nursing_license_url"
  | "tb_test_url"
  | "cpr_certification_url"
  | "ssn_url"
  | "ssn_back_url"
  | "drivers_license_url"
  | "drivers_license_back_url"
  | "document_url"
  | "agreement_w2_url"
  | "agreement_i9_url";

const DOCUMENT_FIELD_ALIASES: Record<string, LegacyDocColumn> = {
  authorization: "document_url",
  agreement_w2: "agreement_w2_url",
  agreement_i9: "agreement_i9_url",
  ssn_front: "ssn_url",
  ssn_back: "ssn_back_url",
  dl_front: "drivers_license_url",
  dl_back: "drivers_license_back_url",
};

export type StaffUploadResult =
  | { ok: true; path: string; bucket: string }
  | { ok: false; status: number; error: string };

export function sanitizeFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200);
}

function legacyColumnForTitle(title: string): LegacyDocColumn | null {
  const t = title.trim().toLowerCase();
  if (t.includes("i9") || t.includes("i-9")) return "agreement_i9_url";
  if (t.includes("w2") || t.includes("employee agreement") || t.includes("employment agreement")) {
    return "agreement_w2_url";
  }
  if (t.includes("authorization") || t.includes("agreement")) {
    return "document_url";
  }
  if (t.includes("nursing") && t.includes("license")) return "nursing_license_url";
  if (t.includes("tb") || t.includes("tuberculosis")) return "tb_test_url";
  if (t.includes("cpr") || t.includes("bls")) return "cpr_certification_url";
  if (t.includes("ssn") || t.includes("social security")) {
    return t.includes("back") ? "ssn_back_url" : "ssn_url";
  }
  if (t.includes("driver") && t.includes("license")) {
    return t.includes("back") ? "drivers_license_back_url" : "drivers_license_url";
  }
  if (t.includes("license")) return "nursing_license_url";
  return null;
}

export function resolveDocumentField(raw: string, title: string): LegacyDocColumn | null {
  const key = raw.trim().toLowerCase();
  if (key && DOCUMENT_FIELD_ALIASES[key]) return DOCUMENT_FIELD_ALIASES[key];
  return legacyColumnForTitle(title);
}

export async function upsertLegacyWorkerDocumentUrl(
  supabase: SupabaseClient,
  workerId: string,
  tenantId: string,
  column: LegacyDocColumn,
  publicUrl: string,
  extra?: { document_name?: string }
): Promise<void> {
  const { data: existingRows, error: selErr } = await supabase
    .from("worker_documents")
    .select("id")
    .eq("worker_id", workerId)
    .limit(1);

  if (selErr) throw selErr;

  const existing = existingRows?.[0] as { id?: string } | undefined;
  const updated_at = new Date().toISOString();
  const documentName =
    (column === "document_url" || column === "agreement_w2_url") && extra?.document_name
      ? { document_name: extra.document_name }
      : {};

  if (existing?.id) {
    const { error } = await supabase
      .from("worker_documents")
      .update({ updated_at, [column]: publicUrl, ...documentName })
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error: insErr } = await supabase.from("worker_documents").insert({
    tenant_id: tenantId,
    worker_id: workerId,
    updated_at,
    [column]: publicUrl,
    ...documentName,
  });
  if (insErr) throw insErr;
}

function legacyPortalTitle(column: LegacyDocColumn, fallback: string): string {
  if (column === "drivers_license_url") return "Driver's license";
  if (column === "nursing_license_url") return "Nursing license";
  if (column === "tb_test_url") return "TB test";
  if (column === "cpr_certification_url") return "CPR certification";
  return fallback;
}

/** Staff upload into a legacy `worker_documents` slot (SSN, driver's license, …). */
export async function saveStaffLegacyDocumentUpload(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    workerId: string;
    actorUserId: string;
    column: LegacyDocColumn;
    file: File;
    documentTitle?: string | null;
  }
): Promise<StaffUploadResult> {
  const { tenantId, workerId, column, file } = input;
  if (file.size > MAX_DOC_BYTES) return { ok: false, status: 400, error: "File is too large" };
  if (!isAcceptedDocumentFileType(file, STAFF_ALLOWED_DOC_TYPES)) {
    return { ok: false, status: 400, error: "File type not allowed. Upload a PNG, JPG, WebP, or PDF." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const objectPath = `${tenantId}/${workerId}/admin/${input.actorUserId}/${column}/${randomUUID()}-${sanitizeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from(WORKER_REQUIRED_FILES_BUCKET)
    .upload(objectPath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });
  if (uploadError) {
    return { ok: false, status: 500, error: uploadError.message || "Upload failed" };
  }

  await upsertLegacyWorkerDocumentUrl(supabase, workerId, tenantId, column, objectPath, {
    document_name: file.name,
  });

  const { error: portalErr } = await supabase.from("worker_portal_documents").insert({
    worker_id: workerId,
    tenant_id: tenantId,
    title: input.documentTitle?.trim() || legacyPortalTitle(column, file.name),
    document_type: "other",
    file_url: objectPath,
    storage_path: objectPath,
    original_file_name: file.name,
    file_type: file.type || null,
    file_size: file.size,
    status: "under_review",
  });
  if (portalErr) {
    console.warn("[staff-document-upload] portal document", portalErr);
  }

  return { ok: true, path: objectPath, bucket: WORKER_REQUIRED_FILES_BUCKET };
}

/** Staff upload against a tenant required document; counts the same as the candidate's own upload. */
export async function saveStaffRequiredDocumentUpload(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    workerId: string;
    actorUserId: string;
    /** Stored as the uploader; null when the actor has no auth user (dev bypass). */
    uploadedByUserId: string | null;
    requiredDocumentId: string;
    file: File;
    documentTitle?: string | null;
    documentField?: string | null;
    applicationId?: string | null;
  }
): Promise<StaffUploadResult> {
  const { tenantId, workerId, requiredDocumentId, file } = input;
  if (file.size > MAX_DOC_BYTES) return { ok: false, status: 400, error: "File is too large" };
  if (!isAcceptedDocumentFileType(file, STAFF_ALLOWED_DOC_TYPES)) {
    return { ok: false, status: 400, error: "File type not allowed. Upload a PNG, JPG, WebP, or PDF." };
  }

  const { data: reqDoc, error: docErr } = await supabase
    .from("tenant_required_documents")
    .select("id, tenant_id, max_file_size_mb, accepted_file_types, title")
    .eq("id", requiredDocumentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (docErr) throw docErr;
  if (!reqDoc) return { ok: false, status: 404, error: "Document requirement not found" };

  const maxMb = Number(reqDoc.max_file_size_mb) || 10;
  if (file.size > maxMb * 1024 * 1024) {
    return { ok: false, status: 400, error: `File exceeds ${maxMb}MB limit` };
  }
  const accepted = Array.isArray(reqDoc.accepted_file_types)
    ? (reqDoc.accepted_file_types as string[])
    : [];
  if (!isAcceptedDocumentFileType(file, accepted)) {
    return {
      ok: false,
      status: 400,
      error: "File type not allowed for this requirement. Upload a PNG, JPG, WebP, or PDF.",
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const objectPath = `${tenantId}/${workerId}/admin/${input.actorUserId}/${requiredDocumentId}/${randomUUID()}-${sanitizeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from(WORKER_REQUIRED_FILES_BUCKET)
    .upload(objectPath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });
  if (uploadError) {
    return { ok: false, status: 500, error: uploadError.message || "Upload failed" };
  }

  const row = {
    worker_id: workerId,
    tenant_id: tenantId,
    required_document_id: requiredDocumentId,
    file_url: objectPath,
    original_file_name: file.name,
    file_type: file.type || null,
    file_size: file.size,
    status: "uploaded",
    uploaded_at: new Date().toISOString(),
    uploaded_by_user_id: input.uploadedByUserId,
    review_notes: null,
    reviewed_at: null,
    reviewed_by: null,
  };

  const { data: existingRows, error: existingError } = await supabase
    .from("worker_submitted_documents")
    .select("id")
    .eq("worker_id", workerId)
    .eq("required_document_id", requiredDocumentId)
    .order("uploaded_at", { ascending: false })
    .limit(1);
  if (existingError) throw existingError;
  const existingId = (existingRows?.[0] as { id?: string } | undefined)?.id;

  if (existingId) {
    const { error } = await supabase.from("worker_submitted_documents").update(row).eq("id", existingId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("worker_submitted_documents")
      .insert({ ...row, ...(input.applicationId ? { application_id: input.applicationId } : {}) });
    if (error) throw error;
  }

  const title = input.documentTitle?.trim() || String(reqDoc.title ?? "");
  const legacyColumn = resolveDocumentField(input.documentField ?? "", title);
  if (legacyColumn) {
    await upsertLegacyWorkerDocumentUrl(supabase, workerId, tenantId, legacyColumn, objectPath, {
      document_name: file.name,
    });
  }

  return { ok: true, path: objectPath, bucket: WORKER_REQUIRED_FILES_BUCKET };
}

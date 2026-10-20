import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  agreementDocumentFieldForSection,
  agreementLegacyKeyForSection,
  type AgreementSectionId,
} from "@/lib/admin/document-review";
import { WORKER_REQUIRED_FILES_BUCKET } from "@/lib/supabase-storage-buckets";
import { isAcceptedDocumentFileType } from "@/lib/document-upload-helpers";

const ALLOWED_DOC_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_DOC_BYTES = Number(process.env.MAX_REQUIRED_FILE_UPLOAD_BYTES ?? 10 * 1024 * 1024);

function sanitizeFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200);
}

type LegacyAgreementColumn = "agreement_w2_url" | "agreement_i9_url";

function legacyColumnForSection(section: AgreementSectionId): LegacyAgreementColumn {
  return agreementLegacyKeyForSection(section) as LegacyAgreementColumn;
}

async function upsertAgreementUrl(
  supabase: SupabaseClient,
  workerId: string,
  tenantId: string,
  column: LegacyAgreementColumn,
  objectPath: string,
  documentName?: string
): Promise<void> {
  const { data: existingRows, error: selErr } = await supabase
    .from("worker_documents")
    .select("id")
    .eq("worker_id", workerId)
    .limit(1);

  if (selErr) throw selErr;

  const existing = existingRows?.[0] as { id?: string } | undefined;
  const updated_at = new Date().toISOString();
  const extra =
    column === "agreement_w2_url" && documentName
      ? { document_name: documentName }
      : {};

  if (existing?.id) {
    const { error } = await supabase
      .from("worker_documents")
      .update({ updated_at, [column]: objectPath, ...extra })
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error: insErr } = await supabase.from("worker_documents").insert({
    tenant_id: tenantId,
    worker_id: workerId,
    updated_at,
    [column]: objectPath,
    ...extra,
  });
  if (insErr) throw insErr;
}

export async function uploadAgreementSectionFile(
  supabase: SupabaseClient,
  input: {
    workerId: string;
    tenantId: string;
    section: AgreementSectionId;
    file: File;
    requiredDocumentId?: string | null;
  }
): Promise<{ path: string; bucket: string }> {
  const { workerId, tenantId, section, file, requiredDocumentId } = input;
  if (file.size > MAX_DOC_BYTES) {
    throw new Error("File is too large");
  }
  if (!isAcceptedDocumentFileType(file, ALLOWED_DOC_TYPES)) {
    throw new Error("File type not allowed. Upload a PNG, JPG, WebP, or PDF.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const legacyColumn = legacyColumnForSection(section);
  const documentField = agreementDocumentFieldForSection(section);

  if (requiredDocumentId) {
    const { data: reqDoc, error: docErr } = await supabase
      .from("tenant_required_documents")
      .select("id, tenant_id, max_file_size_mb, accepted_file_types")
      .eq("id", requiredDocumentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (docErr) throw docErr;
    if (!reqDoc) {
      throw new Error("Document requirement not found");
    }

    const maxMb = Number(reqDoc.max_file_size_mb) || 10;
    const maxBytes = maxMb * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new Error(`File exceeds ${maxMb}MB limit`);
    }

    const accepted = Array.isArray(reqDoc.accepted_file_types)
      ? (reqDoc.accepted_file_types as string[])
      : [];
    if (!isAcceptedDocumentFileType(file, accepted)) {
      throw new Error("File type not allowed for this requirement. Upload a PNG, JPG, WebP, or PDF.");
    }

    const objectPath = `${tenantId}/${workerId}/${requiredDocumentId}/${randomUUID()}-${sanitizeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from(WORKER_REQUIRED_FILES_BUCKET)
      .upload(objectPath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      });
    if (uploadError) throw uploadError;

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
      uploaded_by_user_id: null,
      review_notes: null,
      reviewed_at: null,
      reviewed_by: null,
    };

    const { data: existing } = await supabase
      .from("worker_submitted_documents")
      .select("id")
      .eq("worker_id", workerId)
      .eq("required_document_id", requiredDocumentId)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from("worker_submitted_documents")
        .update(row)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("worker_submitted_documents").insert(row);
      if (error) throw error;
    }

    await upsertAgreementUrl(
      supabase,
      workerId,
      tenantId,
      legacyColumn,
      objectPath,
      section === "w2" ? file.name : undefined
    );

    return { path: objectPath, bucket: WORKER_REQUIRED_FILES_BUCKET };
  }

  const objectPath = `${tenantId}/${workerId}/admin/${documentField}/${randomUUID()}-${sanitizeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from(WORKER_REQUIRED_FILES_BUCKET)
    .upload(objectPath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });
  if (uploadError) throw uploadError;

  await upsertAgreementUrl(
    supabase,
    workerId,
    tenantId,
    legacyColumn,
    objectPath,
    section === "w2" ? file.name : undefined
  );

  const legacyKey = agreementLegacyKeyForSection(section);
  const reviewedAt = new Date().toISOString();
  const { data: existingReview } = await supabase
    .from("worker_legacy_document_reviews")
    .select("id")
    .eq("worker_id", workerId)
    .eq("document_key", legacyKey)
    .maybeSingle();

  const reviewRow = {
    worker_id: workerId,
    tenant_id: tenantId,
    document_key: legacyKey,
    status: "uploaded",
    review_notes: null,
    reviewed_at: reviewedAt,
    reviewed_by: null,
    updated_at: reviewedAt,
  };

  if (existingReview?.id) {
    const { error } = await supabase
      .from("worker_legacy_document_reviews")
      .update(reviewRow)
      .eq("id", existingReview.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("worker_legacy_document_reviews").insert(reviewRow);
    if (error) throw error;
  }

  return { path: objectPath, bucket: WORKER_REQUIRED_FILES_BUCKET };
}

export async function requestAgreementUpload(
  supabase: SupabaseClient,
  input: {
    workerId: string;
    tenantId: string;
    section: AgreementSectionId;
    title: string;
    submittedDocumentId?: string | null;
    legacyDocumentKey?: string | null;
    recruiterUserId?: string | null;
    message?: string | null;
  }
): Promise<void> {
  const {
    workerId,
    tenantId,
    section,
    title,
    submittedDocumentId,
    legacyDocumentKey,
    recruiterUserId,
    message,
  } = input;
  const reviewedAt = new Date().toISOString();
  const reviewNotes = message?.trim() || `Please upload your ${title}.`;

  if (submittedDocumentId) {
    const { error } = await supabase
      .from("worker_submitted_documents")
      .update({
        status: "needs_revision",
        review_notes: reviewNotes,
        reviewed_at: reviewedAt,
        reviewed_by: recruiterUserId,
      })
      .eq("id", submittedDocumentId)
      .eq("worker_id", workerId);
    if (error) throw error;
  } else {
    const documentKey = legacyDocumentKey ?? agreementLegacyKeyForSection(section);
    const { data: existing } = await supabase
      .from("worker_legacy_document_reviews")
      .select("id")
      .eq("worker_id", workerId)
      .eq("document_key", documentKey)
      .maybeSingle();

    const row = {
      worker_id: workerId,
      tenant_id: tenantId,
      document_key: documentKey,
      status: "needs_revision",
      review_notes: reviewNotes,
      reviewed_at: reviewedAt,
      reviewed_by: recruiterUserId,
      updated_at: reviewedAt,
    };

    if (existing?.id) {
      const { error } = await supabase
        .from("worker_legacy_document_reviews")
        .update(row)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("worker_legacy_document_reviews").insert(row);
      if (error) throw error;
    }
  }

  const body =
    message?.trim() ||
    `Please upload your ${title}. You can upload it from your application or worker portal.`;

  const { error: msgErr } = await supabase.from("applicant_messages").insert({
    tenant_id: tenantId,
    worker_id: workerId,
    sender_role: "recruiter",
    sender_user_id: recruiterUserId,
    body,
    message_type: "text",
    metadata: {
      requestType: "agreement_upload",
      section,
      title,
    },
  });
  if (msgErr) {
    console.warn("[requestAgreementUpload] applicant_messages insert failed", msgErr);
  }
}

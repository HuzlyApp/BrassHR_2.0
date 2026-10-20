import type { SupabaseClient } from "@supabase/supabase-js";
import { easternDateString } from "@/lib/datetime/eastern";
import { isCollectExtraFilesStep } from "@/lib/onboarding/profession-document-checklist";
import { resolveWorkerTenantProfessionId } from "@/lib/onboarding/profession-attachment-requirements";
import type { StepDocumentUploads, StepUploadSlot } from "@/lib/onboarding/staff-step-documents";
import {
  listActiveProfessionDocuments,
  professionDocumentKindLabel,
  type ProfessionUploadDocument,
} from "@/lib/professions/profession-documents";

const PLACEHOLDER_TITLES = new Set(["extra file"]);

/** A stored expiry date is past only when it is before today's Eastern calendar date. */
export function isProfessionDocumentExpired(
  expiryDate: string | null | undefined,
  today = easternDateString(new Date())
): boolean {
  const text = String(expiryDate ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  return text < today;
}
const UNSATISFIED_DOCUMENT_STATUSES = new Set(["rejected", "needs_revision", "revision_requested"]);

export type ProfessionStepFile = {
  id: string;
  professionDocumentId: string;
  fileName: string | null;
  fileUrl: string | null;
  fileType: string | null;
  fileSize: number | null;
  status: string | null;
  uploadedAt: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
};

/** Collect documents uses the profession's license and certificate list, not the generic Extra File slot. */
export function stepShowsProfessionDocuments(input: {
  stepType?: string | null;
  stepKey?: string | null;
  workflowStepId?: string | null;
}): boolean {
  const stepType = String(input.stepType ?? "").trim().toLowerCase();
  const stepKey = String(input.stepKey ?? "").trim().toLowerCase();
  const workflowStepId = String(input.workflowStepId ?? "").trim().toLowerCase();
  return isCollectExtraFilesStep({
    step_key: stepKey || stepType,
    step_type: stepType,
    metadata: { workflow_step_id: workflowStepId || stepKey || stepType },
  });
}

function latestFileByDocument(files: ProfessionStepFile[]): Map<string, ProfessionStepFile> {
  const latest = new Map<string, ProfessionStepFile>();
  const ordered = [...files].sort((a, b) => {
    const aTime = Date.parse(a.uploadedAt ?? "") || 0;
    const bTime = Date.parse(b.uploadedAt ?? "") || 0;
    return bTime - aTime;
  });
  for (const file of ordered) {
    if (!latest.has(file.professionDocumentId)) latest.set(file.professionDocumentId, file);
  }
  return latest;
}

/**
 * Replace the placeholder Extra File row with one slot per profession document.
 * A missing file stays uploadable until the recruiter marks the step complete.
 */
export function applyProfessionDocumentsToStepUploads(input: {
  uploads: StepDocumentUploads;
  documents: ProfessionUploadDocument[];
  files: ProfessionStepFile[];
  stepStatus: string | null | undefined;
  /** Recruiter already verified the step. Candidate submission alone does not close uploads. */
  uploadsClosed?: boolean;
  /** Eastern calendar date `YYYY-MM-DD`. Defaults to today. */
  today?: string;
  candidateOwned: boolean;
}): StepDocumentUploads {
  if (!input.documents.length) return input.uploads;

  const latest = latestFileByDocument(input.files);
  const professionSlots: StepUploadSlot[] = [...input.documents]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((document) => {
      const file = latest.get(document.id) ?? null;
      return {
        key: document.id,
        title: document.name,
        detail: professionDocumentKindLabel(document.documentKind),
        required: document.isRequired,
        requiredDocumentId: null,
        professionDocumentId: document.id,
        identityField: null,
        documentId: file?.id ?? null,
        documentStatus: file?.status ?? null,
        collectDates: document.hasExpiration,
        issuedDate: file?.issuedDate ?? null,
        expiryDate: file?.expiryDate ?? null,
        expired: isProfessionDocumentExpired(file?.expiryDate, input.today),
      };
    });

  const kept = input.uploads.slots.filter(
    (slot) => !PLACEHOLDER_TITLES.has(slot.title.trim().toLowerCase())
  );
  const slots = [...professionSlots, ...kept];
  const satisfied = (slot: StepUploadSlot) =>
    Boolean(slot.documentId) &&
    !UNSATISFIED_DOCUMENT_STATUSES.has(String(slot.documentStatus ?? "").toLowerCase());
  const missingRequired = slots
    .filter((slot) => slot.required && !satisfied(slot))
    .map((slot) => slot.title);
  const stepOpen =
    input.uploadsClosed != null
      ? !input.uploadsClosed
      : String(input.stepStatus ?? "").toLowerCase() !== "completed";

  return {
    slots,
    missingRequired,
    uploadsOptional: input.uploads.uploadsOptional,
    canUpload: slots.length > 0 && stepOpen,
    canCompleteForCandidate:
      input.candidateOwned &&
      stepOpen &&
      slots.length > 0 &&
      (input.uploads.uploadsOptional || missingRequired.length === 0) &&
      slots.some(satisfied),
  };
}

export async function loadProfessionStepFiles(
  supabase: SupabaseClient,
  tenantId: string,
  workerId: string
): Promise<{ documents: ProfessionUploadDocument[]; files: ProfessionStepFile[] }> {
  const professionId = await resolveWorkerTenantProfessionId(supabase, tenantId, workerId);
  if (!professionId) return { documents: [], files: [] };

  const [documents, uploadsResult] = await Promise.all([
    listActiveProfessionDocuments(supabase, tenantId, professionId),
    supabase
      .from("worker_profession_document_uploads")
      .select(
        "id, profession_document_id, original_file_name, file_url, file_type, file_size, status, uploaded_at, issued_date, expiry_date"
      )
      .eq("tenant_id", tenantId)
      .eq("worker_id", workerId)
      .order("uploaded_at", { ascending: false }),
  ]);
  if (uploadsResult.error) throw uploadsResult.error;

  const files: ProfessionStepFile[] = (uploadsResult.data ?? []).map((row) => ({
    id: String(row.id),
    professionDocumentId: String(row.profession_document_id),
    fileName: row.original_file_name ? String(row.original_file_name) : null,
    fileUrl: row.file_url ? String(row.file_url) : null,
    fileType: row.file_type ? String(row.file_type) : null,
    fileSize: typeof row.file_size === "number" ? row.file_size : null,
    status: row.status ? String(row.status) : null,
    uploadedAt: row.uploaded_at ? String(row.uploaded_at) : null,
    issuedDate: row.issued_date ? String(row.issued_date) : null,
    expiryDate: row.expiry_date ? String(row.expiry_date) : null,
  }));

  return { documents, files };
}

export async function withProfessionDocumentSlots(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    workerId: string;
    stepType: string | null | undefined;
    stepKey?: string | null;
    workflowStepId?: string | null;
    stepStatus: string | null | undefined;
    uploadsClosed?: boolean;
    candidateOwned: boolean;
    uploads: StepDocumentUploads;
  }
): Promise<{ uploads: StepDocumentUploads; files: ProfessionStepFile[] }> {
  if (
    !stepShowsProfessionDocuments({
      stepType: params.stepType,
      stepKey: params.stepKey,
      workflowStepId: params.workflowStepId,
    })
  ) {
    return { uploads: params.uploads, files: [] };
  }

  const loaded = await loadProfessionStepFiles(supabase, params.tenantId, params.workerId);
  const documentIds = new Set(loaded.documents.map((document) => document.id));
  const files = loaded.files.filter((file) => documentIds.has(file.professionDocumentId));
  return {
    files,
    uploads: applyProfessionDocumentsToStepUploads({
      uploads: params.uploads,
      documents: loaded.documents,
      files,
      stepStatus: params.stepStatus,
      uploadsClosed: params.uploadsClosed,
      candidateOwned: params.candidateOwned,
    }),
  };
}

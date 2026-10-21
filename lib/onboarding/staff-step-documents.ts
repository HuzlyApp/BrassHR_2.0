import type { SupabaseClient } from "@supabase/supabase-js";
import { SSN_IDENTITY_STEP_TYPE } from "@/lib/onboarding/assigned-workflow-steps";
import { withProfessionDocumentSlots } from "@/lib/onboarding/profession-step-uploads";
import { isUploadLaterStep } from "@/lib/onboarding/reference-verification";
import type { TenantOnboardingConfig, TenantRequiredDocument } from "@/lib/onboarding/types";

/** `worker_documents` slots the identity step collects, keyed by the upload route's field alias. */
export const IDENTITY_UPLOAD_SLOTS = [
  { field: "ssn_front", column: "ssn_url", title: "SSN card (front)", required: true },
  { field: "ssn_back", column: "ssn_back_url", title: "SSN card (back)", required: false },
  { field: "dl_front", column: "drivers_license_url", title: "Driver's license (front)", required: true },
  { field: "dl_back", column: "drivers_license_back_url", title: "Driver's license (back)", required: false },
] as const;

export type IdentityUploadField = (typeof IDENTITY_UPLOAD_SLOTS)[number]["field"];

export type StepUploadSlot = {
  /** Required document id, or the identity field alias. */
  key: string;
  title: string;
  required: boolean;
  requiredDocumentId: string | null;
  /** Profession settings document. Staff upload writes `worker_profession_document_uploads`. */
  professionDocumentId: string | null;
  /** License or Certificate, when this slot comes from profession settings. */
  detail?: string | null;
  /** Profession document requires issued and expiry dates. */
  collectDates?: boolean;
  issuedDate?: string | null;
  expiryDate?: string | null;
  /** True only when the stored expiry date is before today. */
  expired?: boolean;
  identityField: IdentityUploadField | null;
  /** Matches `InspectableDocument.id` of the file currently filling this slot. */
  documentId: string | null;
  documentStatus: string | null;
};

export type StepDocumentUploads = {
  slots: StepUploadSlot[];
  missingRequired: string[];
  /** Upload-later step: missing files are listed but never block completing the step. */
  uploadsOptional: boolean;
  /** Staff may upload into the slots. Closed once the step is completed; profession slots stay open if skipped. */
  canUpload: boolean;
  /** Candidate-owned step whose uploads are all in, so staff can complete it for the candidate. */
  canCompleteForCandidate: boolean;
};

export type SubmittedDocumentRow = {
  id: string;
  required_document_id: string | null;
  status: string | null;
};

const UNSATISFIED_DOCUMENT_STATUSES = new Set(["rejected", "needs_revision", "revision_requested"]);
const CLOSED_STEP_STATUSES = new Set(["completed", "skipped"]);

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

const STAFF_UPLOAD_PATH_RE =
  /\/admin\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i;

/** Staff uploads are stored under `<tenant>/<worker>/admin/<staff user id>/…`. */
export function staffUploaderIdFromPath(stored: string | null | undefined): string | null {
  return STAFF_UPLOAD_PATH_RE.exec(String(stored ?? ""))?.[1]?.toLowerCase() ?? null;
}

export function identityDocumentId(
  row: Record<string, unknown> | null | undefined,
  workerId: string,
  column: string
): string {
  return `${String(row?.id ?? workerId)}:${column}`;
}

/** Tenant required documents the candidate uploads on this step (workflow catalog docs use their own flow). */
export function stepUploadRequirements(
  config: Pick<TenantOnboardingConfig, "requiredDocuments"> | null | undefined,
  tenantStepId: string | null | undefined
): TenantRequiredDocument[] {
  if (!tenantStepId) return [];
  return (config?.requiredDocuments ?? [])
    .filter((doc) => doc.onboarding_step_id === tenantStepId && doc.source !== "workflow")
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function buildStepDocumentUploads(params: {
  workerId: string;
  stepType: string | null | undefined;
  requirements: TenantRequiredDocument[];
  /** Newest first; the first row per requirement is the current file. */
  submittedRows: SubmittedDocumentRow[];
  identityRow: Record<string, unknown> | null;
  candidateOwned: boolean;
  stepStatus: string | null | undefined;
}): StepDocumentUploads {
  const latestByRequirement = new Map<string, SubmittedDocumentRow>();
  for (const row of params.submittedRows) {
    const requirementId = asText(row.required_document_id);
    if (requirementId && !latestByRequirement.has(requirementId)) {
      latestByRequirement.set(requirementId, row);
    }
  }

  const slots: StepUploadSlot[] = [];
  if (params.stepType === SSN_IDENTITY_STEP_TYPE) {
    for (const slot of IDENTITY_UPLOAD_SLOTS) {
      const filled = Boolean(asText(params.identityRow?.[slot.column]));
      slots.push({
        key: slot.field,
        title: slot.title,
        required: slot.required,
        requiredDocumentId: null,
        professionDocumentId: null,
        identityField: slot.field,
        documentId: filled ? identityDocumentId(params.identityRow, params.workerId, slot.column) : null,
        documentStatus: filled ? "uploaded" : null,
      });
    }
  }
  for (const requirement of params.requirements) {
    const row = latestByRequirement.get(requirement.id) ?? null;
    slots.push({
      key: requirement.id,
      title: requirement.title,
      required: requirement.is_required,
      requiredDocumentId: requirement.id,
      professionDocumentId: null,
      identityField: null,
      documentId: row ? String(row.id) : null,
      documentStatus: row ? asText(row.status) : null,
    });
  }

  const satisfied = (slot: StepUploadSlot) =>
    Boolean(slot.documentId) &&
    !UNSATISFIED_DOCUMENT_STATUSES.has(String(slot.documentStatus ?? "").toLowerCase());
  const missingRequired = slots
    .filter((slot) => slot.required && !satisfied(slot))
    .map((slot) => slot.title);

  const stepOpen = !CLOSED_STEP_STATUSES.has(String(params.stepStatus ?? "").toLowerCase());
  const uploadsOptional = isUploadLaterStep({ stepType: params.stepType });
  return {
    slots,
    missingRequired,
    uploadsOptional,
    canUpload: slots.length > 0 && stepOpen,
    canCompleteForCandidate:
      params.candidateOwned &&
      stepOpen &&
      slots.length > 0 &&
      (uploadsOptional || missingRequired.length === 0) &&
      slots.some(satisfied),
  };
}

export async function loadStepSubmittedDocuments(
  supabase: SupabaseClient,
  params: { tenantId: string; workerId: string; requiredDocumentIds: string[] }
): Promise<Array<Record<string, unknown>>> {
  if (!params.requiredDocumentIds.length) return [];
  const { data, error } = await supabase
    .from("worker_submitted_documents")
    .select(
      "id, required_document_id, file_url, original_file_name, file_type, file_size, status, uploaded_at, uploaded_by_user_id, reviewed_at, reviewed_by, review_notes"
    )
    .eq("tenant_id", params.tenantId)
    .eq("worker_id", params.workerId)
    .in("required_document_id", params.requiredDocumentIds)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function loadIdentityDocumentRow(
  supabase: SupabaseClient,
  params: { tenantId: string; workerId: string }
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("worker_documents")
    .select("*")
    .eq("worker_id", params.workerId)
    .limit(1);
  if (error) throw error;
  const row = ((data ?? []) as Array<Record<string, unknown>>)[0] ?? null;
  if (!row || (asText(row.tenant_id) && asText(row.tenant_id) !== params.tenantId)) return null;
  return row;
}

export async function loadStepDocumentUploads(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    workerId: string;
    tenantStepId: string | null;
    stepType: string | null;
    stepKey?: string | null;
    workflowStepId?: string | null;
    config: Pick<TenantOnboardingConfig, "requiredDocuments"> | null;
    candidateOwned: boolean;
    stepStatus: string | null;
    /** When set, overrides the completed-status lock. False keeps uploads open while a submitted step awaits review. */
    uploadsClosed?: boolean;
  }
): Promise<StepDocumentUploads> {
  const requirements = stepUploadRequirements(params.config, params.tenantStepId);
  const [submittedRows, identityRow] = await Promise.all([
    loadStepSubmittedDocuments(supabase, {
      tenantId: params.tenantId,
      workerId: params.workerId,
      requiredDocumentIds: requirements.map((doc) => doc.id),
    }),
    params.stepType === SSN_IDENTITY_STEP_TYPE
      ? loadIdentityDocumentRow(supabase, { tenantId: params.tenantId, workerId: params.workerId })
      : Promise.resolve(null),
  ]);
  const uploads = buildStepDocumentUploads({
    workerId: params.workerId,
    stepType: params.stepType,
    requirements,
    submittedRows: submittedRows.map((row) => ({
      id: String(row.id),
      required_document_id: asText(row.required_document_id),
      status: asText(row.status),
    })),
    identityRow,
    candidateOwned: params.candidateOwned,
    stepStatus: params.stepStatus,
  });
  const withProfession = await withProfessionDocumentSlots(supabase, {
    tenantId: params.tenantId,
    workerId: params.workerId,
    stepType: params.stepType,
    stepKey: params.stepKey,
    workflowStepId: params.workflowStepId,
    stepStatus: params.stepStatus,
    uploadsClosed: params.uploadsClosed,
    candidateOwned: params.candidateOwned,
    uploads,
  });
  return withProfession.uploads;
}

/** Staff completing a candidate's upload step accepts the files that are still awaiting review. */
export async function approveStepDocumentsOnCompletion(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    workerId: string;
    requiredDocumentIds: string[];
    reviewerUserId: string | null;
    reviewedAt: string;
  }
): Promise<void> {
  if (!params.requiredDocumentIds.length) return;
  const update = (reviewedBy: string | null) =>
    supabase
      .from("worker_submitted_documents")
      .update({ status: "approved", reviewed_at: params.reviewedAt, reviewed_by: reviewedBy })
      .eq("tenant_id", params.tenantId)
      .eq("worker_id", params.workerId)
      .in("required_document_id", params.requiredDocumentIds)
      .in("status", ["uploaded", "under_review"]);
  let { error } = await update(params.reviewerUserId);
  if (error?.code === "23503") ({ error } = await update(null));
  if (error) throw error;
}

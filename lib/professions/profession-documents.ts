import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenantOnboardingConfig, TenantRequiredDocument } from "@/lib/onboarding/types";

export const PROFESSION_DOCUMENT_KINDS = ["certificate", "license"] as const;
export type ProfessionDocumentKind = (typeof PROFESSION_DOCUMENT_KINDS)[number];

export type ProfessionUploadDocument = {
  id: string;
  name: string;
  documentKind: ProfessionDocumentKind;
  isRequired: boolean;
  sortOrder: number;
};

export type ProfessionUploadDraft = {
  id?: string | null;
  name: string;
  documentKind: ProfessionDocumentKind;
  isRequired: boolean;
};

const NAME_MAX = 120;
const DOCUMENT_MAX = 40;

export function professionDocumentKindLabel(kind: ProfessionDocumentKind): string {
  return kind === "license" ? "License" : "Certificate";
}

export function normalizeProfessionDocumentDrafts(
  input: unknown
): { documents: ProfessionUploadDraft[] } | { error: string } {
  if (!Array.isArray(input)) return { error: "Documents must be a list." };
  if (input.length > DOCUMENT_MAX) {
    return { error: `A profession can have at most ${DOCUMENT_MAX} documents.` };
  }

  const documents: ProfessionUploadDraft[] = [];
  const seen = new Set<string>();

  for (const row of input) {
    if (!row || typeof row !== "object") return { error: "Each document needs a name." };
    const record = row as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!name) return { error: "Document name is required." };
    if (name.length > NAME_MAX) return { error: "Document name must be 120 characters or fewer." };

    const kind = record.documentKind;
    if (kind !== "certificate" && kind !== "license") {
      return { error: "Each document must be a certificate or a license." };
    }

    const key = name.toLowerCase();
    if (seen.has(key)) return { error: `“${name}” is listed more than once.` };
    seen.add(key);

    const id = typeof record.id === "string" ? record.id.trim() : "";
    documents.push({
      id: id && !id.startsWith("new-") ? id : null,
      name,
      documentKind: kind,
      isRequired: record.isRequired !== false,
    });
  }

  return { documents };
}

export function attachProfessionDocuments(
  config: TenantOnboardingConfig,
  documents: ProfessionUploadDocument[]
): TenantOnboardingConfig {
  const active = [...documents].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  if (!active.length) return config;

  const step =
    config.steps.find((item) => item.step_type === "professional_license") ??
    config.steps.find((item) => item.step_type === "document_upload");
  if (!step) return config;

  const mapped: TenantRequiredDocument[] = active.map((doc) => ({
    id: doc.id,
    onboarding_step_id: step.id,
    title: doc.name,
    description: professionDocumentKindLabel(doc.documentKind),
    is_required: doc.isRequired,
    sort_order: doc.sortOrder,
    accepted_file_types: ["pdf", "png", "jpg", "jpeg", "webp"],
    max_file_size_mb: 10,
    source: "profession",
  }));

  return {
    ...config,
    requiredDocuments: [
      ...config.requiredDocuments.filter((doc) => doc.onboarding_step_id !== step.id),
      ...mapped,
    ],
  };
}

type Db = SupabaseClient;

type ProfessionDocumentRow = {
  id: string;
  profession_id: string;
  name: string;
  document_kind: string;
  is_required: boolean;
  sort_order: number;
};

function mapRow(row: ProfessionDocumentRow): ProfessionUploadDocument {
  return {
    id: row.id,
    name: row.name,
    documentKind: row.document_kind === "license" ? "license" : "certificate",
    isRequired: row.is_required !== false,
    sortOrder: row.sort_order,
  };
}

export async function listProfessionDocuments(supabase: Db, tenantId: string) {
  const { data, error } = await supabase
    .from("tenant_profession_documents")
    .select("id, profession_id, name, document_kind, is_required, sort_order")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;

  const byProfession = new Map<string, ProfessionUploadDocument[]>();
  for (const row of (data ?? []) as ProfessionDocumentRow[]) {
    const list = byProfession.get(row.profession_id) ?? [];
    list.push(mapRow(row));
    byProfession.set(row.profession_id, list);
  }
  return byProfession;
}

export async function listActiveProfessionDocuments(
  supabase: Db,
  tenantId: string,
  professionId: string
): Promise<ProfessionUploadDocument[]> {
  const { data, error } = await supabase
    .from("tenant_profession_documents")
    .select("id, profession_id, name, document_kind, is_required, sort_order")
    .eq("tenant_id", tenantId)
    .eq("profession_id", professionId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as ProfessionDocumentRow[]).map(mapRow);
}

export async function readFlowProfessionId(
  supabase: Db,
  tenantId: string,
  flowId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("onboarding_flows")
    .select("profession_id")
    .eq("id", flowId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  const professionId = data?.profession_id ? String(data.profession_id) : "";
  return professionId || null;
}

export async function saveProfessionDocuments(
  supabase: Db,
  tenantId: string,
  professionId: string,
  drafts: ProfessionUploadDraft[]
): Promise<ProfessionUploadDocument[]> {
  const { data: profession, error: professionError } = await supabase
    .from("tenant_professions")
    .select("id")
    .eq("id", professionId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  if (professionError) throw professionError;
  if (!profession) throw new Error("Profession was not found for this organization.");

  const { data: existing, error: existingError } = await supabase
    .from("tenant_profession_documents")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("profession_id", professionId)
    .eq("is_active", true);
  if (existingError) throw existingError;

  const kept = new Set(drafts.map((doc) => doc.id).filter((id): id is string => Boolean(id)));
  const removed = (existing ?? [])
    .map((row) => String(row.id))
    .filter((id) => !kept.has(id));

  if (removed.length) {
    const { error } = await supabase
      .from("tenant_profession_documents")
      .update({ is_active: false })
      .eq("tenant_id", tenantId)
      .in("id", removed);
    if (error) throw error;
  }

  for (const [index, draft] of drafts.entries()) {
    const row = {
      name: draft.name,
      document_kind: draft.documentKind,
      is_required: draft.isRequired,
      sort_order: (index + 1) * 10,
      is_active: true,
    };
    if (draft.id) {
      const { error } = await supabase
        .from("tenant_profession_documents")
        .update(row)
        .eq("id", draft.id)
        .eq("tenant_id", tenantId)
        .eq("profession_id", professionId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("tenant_profession_documents").insert({
        ...row,
        tenant_id: tenantId,
        profession_id: professionId,
      });
      if (error) throw error;
    }
  }

  return listActiveProfessionDocuments(supabase, tenantId, professionId);
}

export async function linkWorkerProfession(
  supabase: Db,
  tenantId: string,
  workerId: string,
  professionId: string
) {
  const { data: application, error: applicationError } = await supabase
    .from("job_applications")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (applicationError) throw applicationError;
  if (!application?.id) throw new Error("This candidate has no application to connect a profession to.");

  const { error } = await supabase
    .from("job_applications")
    .update({ tenant_profession_id: professionId })
    .eq("id", application.id)
    .eq("tenant_id", tenantId);
  if (error) throw error;
}

export async function renameWorkerDocumentFile(
  supabase: Db,
  tenantId: string,
  workerId: string,
  input: { professionDocumentId?: string | null; submittedDocumentId?: string | null; fileName: string }
) {
  const fileName = input.fileName.trim();
  if (!fileName) throw new Error("File name is required.");

  if (input.professionDocumentId) {
    const { data, error } = await supabase
      .from("worker_profession_document_uploads")
      .update({ original_file_name: fileName })
      .eq("tenant_id", tenantId)
      .eq("worker_id", workerId)
      .eq("profession_document_id", input.professionDocumentId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return;
    if (!input.submittedDocumentId) throw new Error("Uploaded file was not found.");
  }

  if (input.submittedDocumentId) {
    const { data, error } = await supabase
      .from("worker_submitted_documents")
      .update({ original_file_name: fileName })
      .eq("tenant_id", tenantId)
      .eq("worker_id", workerId)
      .eq("id", input.submittedDocumentId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new Error("Uploaded file was not found.");
    return;
  }

  throw new Error("Choose a document file to rename.");
}

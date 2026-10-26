import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveWorkerTenantProfessionId } from "@/lib/onboarding/profession-attachment-requirements";
import {
  listActiveProfessionDocuments,
  type ProfessionDocumentKind,
} from "@/lib/professions/profession-documents";

export type ProfessionChecklistFile = {
  id: string;
  name: string;
};

export type ProfessionChecklistItem = {
  id: string;
  name: string;
  documentKind: ProfessionDocumentKind;
  isRequired: boolean;
  hasExpiration: boolean;
  collected: boolean;
  /** Identity step already stored this file, so it does not need another upload here. */
  collectedOnIdentityStep: boolean;
  files: ProfessionChecklistFile[];
};

export type ProfessionDocumentChecklist = {
  professionId: string | null;
  professionName: string | null;
  items: ProfessionChecklistItem[];
  missingRequired: string[];
};

const UNSATISFIED = new Set(["rejected", "needs_revision", "revision_requested"]);

export function isCollectExtraFilesStep(
  step:
    | {
        step_key?: string | null;
        step_type?: string | null;
        metadata?: Record<string, unknown> | null;
      }
    | null
    | undefined
): boolean {
  if (!step) return false;
  const workflowStepId = String(step.metadata?.workflow_step_id ?? "");
  return (
    step.step_key === "collect-extra-files" ||
    step.step_type === "collect-extra-files" ||
    workflowStepId === "collect-extra-files"
  );
}

export function identityDocumentCoversTitle(
  title: string,
  identity: { ssnUrl?: string | null; driversLicenseUrl?: string | null }
): "ssn" | "driver_license" | null {
  const name = title.trim().toLowerCase();
  if (!name) return null;
  if (
    (name.includes("ssn") || name.includes("social security")) &&
    Boolean(identity.ssnUrl?.trim())
  ) {
    return "ssn";
  }
  if (name.includes("driver") && name.includes("license") && Boolean(identity.driversLicenseUrl?.trim())) {
    return "driver_license";
  }
  return null;
}

export function buildProfessionDocumentChecklist(input: {
  professionId: string | null;
  professionName: string | null;
  documents: Array<{
    id: string;
    name: string;
    documentKind: ProfessionDocumentKind;
    isRequired: boolean;
    hasExpiration: boolean;
    sortOrder: number;
  }>;
  uploads: Array<{
    id: string;
    professionDocumentId: string;
    fileName: string | null;
    status: string | null;
  }>;
  identity: { ssnUrl?: string | null; driversLicenseUrl?: string | null };
}): ProfessionDocumentChecklist {
  const filesByDocument = new Map<string, ProfessionChecklistFile[]>();
  for (const upload of input.uploads) {
    if (UNSATISFIED.has(String(upload.status ?? "").toLowerCase())) continue;
    const list = filesByDocument.get(upload.professionDocumentId) ?? [];
    list.push({
      id: upload.id,
      name: upload.fileName?.trim() || "Uploaded file",
    });
    filesByDocument.set(upload.professionDocumentId, list);
  }

  const items = [...input.documents]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((document) => {
      const files = filesByDocument.get(document.id) ?? [];
      const identityMatch = identityDocumentCoversTitle(document.name, input.identity);
      return {
        id: document.id,
        name: document.name,
        documentKind: document.documentKind,
        isRequired: document.isRequired,
        hasExpiration: document.hasExpiration,
        collected: files.length > 0 || Boolean(identityMatch),
        collectedOnIdentityStep: files.length === 0 && Boolean(identityMatch),
        files,
      };
    });

  return {
    professionId: input.professionId,
    professionName: input.professionName,
    items,
    missingRequired: items.filter((item) => item.isRequired && !item.collected).map((item) => item.name),
  };
}

export async function loadProfessionDocumentChecklist(
  supabase: SupabaseClient,
  tenantId: string,
  workerId: string
): Promise<ProfessionDocumentChecklist> {
  const professionId = await resolveWorkerTenantProfessionId(supabase, tenantId, workerId);
  if (!professionId) {
    return buildProfessionDocumentChecklist({
      professionId: null,
      professionName: null,
      documents: [],
      uploads: [],
      identity: {},
    });
  }

  const [{ data: profession, error: professionError }, documents, uploadsResult, identityResult] =
    await Promise.all([
      supabase
        .from("tenant_professions")
        .select("name")
        .eq("id", professionId)
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      listActiveProfessionDocuments(supabase, tenantId, professionId),
      supabase
        .from("worker_profession_document_uploads")
        .select("id, profession_document_id, original_file_name, status")
        .eq("tenant_id", tenantId)
        .eq("worker_id", workerId),
      supabase
        .from("worker_documents")
        .select("ssn_url, drivers_license_url")
        .eq("worker_id", workerId)
        .limit(1),
    ]);
  if (professionError) throw professionError;
  if (uploadsResult.error) throw uploadsResult.error;
  if (identityResult.error) throw identityResult.error;

  const identity = (identityResult.data ?? [])[0] as
    | { ssn_url?: string | null; drivers_license_url?: string | null }
    | undefined;

  return buildProfessionDocumentChecklist({
    professionId,
    professionName: profession?.name ? String(profession.name) : null,
    documents,
    uploads: (uploadsResult.data ?? []).map((row) => ({
      id: String(row.id),
      professionDocumentId: String(row.profession_document_id),
      fileName: row.original_file_name ? String(row.original_file_name) : null,
      status: row.status ? String(row.status) : null,
    })),
    identity: {
      ssnUrl: identity?.ssn_url ?? null,
      driversLicenseUrl: identity?.drivers_license_url ?? null,
    },
  });
}

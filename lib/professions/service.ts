import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertEmploymentFlowHasProfession,
  type EmploymentFlowType,
  validateCredentialDates,
} from "@/lib/professions/catalog";

type Db = SupabaseClient;

export type WorkflowDocumentRow = {
  id: string;
  code: string;
  name: string;
  is_required: boolean;
  has_expiration: boolean;
  collect_issuing_organization: boolean;
  collect_scope: boolean;
  collect_validity: boolean;
  sort_order: number;
  is_active: boolean;
};

export async function listTenantProfessions(supabase: Db, tenantId: string) {
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("primary_industry_key")
    .eq("id", tenantId)
    .maybeSingle();
  if (tenantError) throw tenantError;

  const { data, error } = await supabase
    .from("tenant_professions")
    .select("id, name, catalog_key, industry_key, is_active")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;

  return {
    industryKey: (tenant?.primary_industry_key as string | null) ?? null,
    professions: data ?? [],
  };
}

export type CatalogProfessionOption = {
  key: string;
  name: string;
  industryKey: string;
  industryLabel: string | null;
};

function isDuplicateProfessionError(error: { message?: string; code?: string }): boolean {
  const message = typeof error.message === "string" ? error.message : "";
  const code = String(error.code ?? "");
  return code === "23505" || /duplicate key|unique constraint/i.test(message);
}

export type CatalogProfessionChoice = {
  key: string;
  name: string;
  industryKey: string;
  professionId: string | null;
};

/** Every active catalog profession, with the tenant row id when it is already added. */
export async function listCatalogProfessionChoices(
  supabase: Db,
  tenantId: string
): Promise<CatalogProfessionChoice[]> {
  const [{ data: catalog, error: catalogError }, { data: existing, error: existingError }] =
    await Promise.all([
      supabase
        .from("profession_catalog")
        .select("key, name, industry_key")
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("tenant_professions")
        .select("id, name, catalog_key")
        .eq("tenant_id", tenantId)
        .eq("is_active", true),
    ]);
  if (catalogError) throw catalogError;
  if (existingError) throw existingError;

  const byKey = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const row of existing ?? []) {
    const id = String(row.id);
    const catalogKey = row.catalog_key ? String(row.catalog_key) : "";
    if (catalogKey) byKey.set(catalogKey, id);
    const name = String(row.name ?? "").trim().toLowerCase();
    if (name && !byName.has(name)) byName.set(name, id);
  }

  return (catalog ?? []).map((row) => {
    const key = String(row.key);
    const name = String(row.name ?? "").trim();
    return {
      key,
      name,
      industryKey: String(row.industry_key),
      professionId: byKey.get(key) ?? byName.get(name.toLowerCase()) ?? null,
    };
  });
}

const PROFESSION_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Flow creation stores tenant_professions.id. The picker can send that id or a catalog key.
 * A catalog key is added to the tenant the first time it is chosen.
 */
export async function resolveFlowProfessionId(
  supabase: Db,
  tenantId: string,
  professionRef: string
): Promise<string> {
  const value = professionRef.trim();
  if (!value) throw new Error("Choose a profession.");

  if (PROFESSION_UUID.test(value)) {
    const { data, error } = await supabase
      .from("tenant_professions")
      .select("id")
      .eq("id", value)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new Error("That profession is not available.");
    return String(data.id);
  }

  const { data: existing, error: existingError } = await supabase
    .from("tenant_professions")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("catalog_key", value)
    .eq("is_active", true)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return String(existing.id);

  const { data: catalogRow, error: catalogError } = await supabase
    .from("profession_catalog")
    .select("name")
    .eq("key", value)
    .maybeSingle();
  if (catalogError) throw catalogError;
  const catalogName = String(catalogRow?.name ?? "").trim();
  if (catalogName) {
    const { data: named, error: namedError } = await supabase
      .from("tenant_professions")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .ilike("name", catalogName)
      .maybeSingle();
    if (namedError) throw namedError;
    if (named?.id) return String(named.id);
  }

  try {
    const created = await addTenantProfessionFromCatalog(supabase, tenantId, value);
    return String(created.id);
  } catch (error) {
    if (!(error instanceof Error) || !/already exists/i.test(error.message)) throw error;
    const { data: raced, error: racedError } = await supabase
      .from("tenant_professions")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("catalog_key", value)
      .eq("is_active", true)
      .maybeSingle();
    if (racedError) throw racedError;
    if (!raced?.id) throw error;
    return String(raced.id);
  }
}

export async function listAvailableCatalogProfessions(
  supabase: Db,
  tenantId: string,
  industryLabel: (industryKey: string) => string | null
): Promise<CatalogProfessionOption[]> {
  const [{ data: catalog, error: catalogError }, { data: existing, error: existingError }] =
    await Promise.all([
      supabase
        .from("profession_catalog")
        .select("key, name, industry_key")
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("tenant_professions")
        .select("name, catalog_key")
        .eq("tenant_id", tenantId)
        .eq("is_active", true),
    ]);
  if (catalogError) throw catalogError;
  if (existingError) throw existingError;

  const takenKeys = new Set(
    (existing ?? []).map((row) => (row.catalog_key ? String(row.catalog_key) : "")).filter(Boolean)
  );
  const takenNames = new Set(
    (existing ?? []).map((row) => String(row.name ?? "").trim().toLowerCase()).filter(Boolean)
  );

  return (catalog ?? [])
    .filter((row) => {
      const key = String(row.key);
      const name = String(row.name ?? "").trim().toLowerCase();
      return !takenKeys.has(key) && !takenNames.has(name);
    })
    .map((row) => {
      const industryKey = String(row.industry_key);
      return {
        key: String(row.key),
        name: String(row.name),
        industryKey,
        industryLabel: industryLabel(industryKey),
      };
    });
}

export async function addTenantProfessionFromCatalog(
  supabase: Db,
  tenantId: string,
  catalogKey: string
) {
  const key = catalogKey.trim();
  if (!/^[a-z][a-z0-9_]{1,62}$/.test(key)) throw new Error("Choose a profession.");

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("primary_industry_key")
    .eq("id", tenantId)
    .maybeSingle();
  if (tenantError) throw tenantError;
  const industryKey = (tenant?.primary_industry_key as string | null)?.trim();
  if (!industryKey) throw new Error("Set the tenant industry before adding a profession.");

  const { data: catalog, error: catalogError } = await supabase
    .from("profession_catalog")
    .select("key, name, is_active")
    .eq("key", key)
    .maybeSingle();
  if (catalogError) throw catalogError;
  if (!catalog || catalog.is_active !== true) throw new Error("That profession is not available.");

  const name = String(catalog.name ?? "").trim();
  if (!name) throw new Error("That profession is not available.");

  const { data, error } = await supabase
    .from("tenant_professions")
    .insert({
      tenant_id: tenantId,
      industry_key: industryKey,
      catalog_key: key,
      name,
      is_active: true,
    })
    .select("id, name, catalog_key, industry_key, is_active")
    .single();
  if (error) {
    if (isDuplicateProfessionError(error)) throw new Error("This profession already exists.");
    throw error;
  }
  return data;
}

export async function addTenantProfession(
  supabase: Db,
  tenantId: string,
  name: string
) {
  const label = name.trim();
  if (!label) throw new Error("Profession name is required.");

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("primary_industry_key")
    .eq("id", tenantId)
    .maybeSingle();
  if (tenantError) throw tenantError;
  const industryKey = (tenant?.primary_industry_key as string | null)?.trim();
  if (!industryKey) throw new Error("Set the tenant industry before adding a profession.");

  const { data, error } = await supabase
    .from("tenant_professions")
    .insert({
      tenant_id: tenantId,
      industry_key: industryKey,
      catalog_key: null,
      name: label,
      is_active: true,
    })
    .select("id, name, catalog_key, industry_key, is_active")
    .single();
  if (error) {
    if (isDuplicateProfessionError(error)) throw new Error("This profession already exists.");
    throw error;
  }
  return data;
}

export function requireProfessionForEmploymentFlow(input: {
  employmentType?: string | null;
  professionId?: string | null;
}) {
  const employmentType = (input.employmentType?.trim() || null) as EmploymentFlowType | null;
  const professionId = input.professionId?.trim() || null;
  if (
    employmentType === "W2" ||
    employmentType === "1099" ||
    employmentType === "Contract" ||
    employmentType === "RNR"
  ) {
    assertEmploymentFlowHasProfession({ employmentType, professionId });
  }
}

export async function listFlowDocuments(supabase: Db, tenantId: string, flowId: string) {
  const { data, error } = await supabase
    .from("workflow_required_documents")
    .select(
      "id, code, name, is_required, has_expiration, collect_issuing_organization, collect_scope, collect_validity, sort_order, is_active"
    )
    .eq("tenant_id", tenantId)
    .eq("flow_id", flowId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WorkflowDocumentRow[];
}

export async function addFlowDocument(
  supabase: Db,
  tenantId: string,
  flowId: string,
  input: {
    code: string;
    name: string;
    isRequired?: boolean;
    hasExpiration?: boolean;
    collectIssuingOrganization?: boolean;
    collectScope?: boolean;
    collectValidity?: boolean;
    sortOrder?: number;
  }
) {
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!/^[A-Z][A-Z0-9_]{1,62}$/.test(code)) {
    throw new Error("Document code must be uppercase letters, numbers, and underscores.");
  }
  if (!name) throw new Error("Document name is required.");

  const hasExpiration = input.hasExpiration === true;
  const { data, error } = await supabase
    .from("workflow_required_documents")
    .insert({
      tenant_id: tenantId,
      flow_id: flowId,
      code,
      name,
      is_required: input.isRequired !== false,
      has_expiration: hasExpiration,
      collect_issuing_organization: input.collectIssuingOrganization === true,
      collect_scope: input.collectScope === true,
      collect_validity: input.collectValidity === true,
      sort_order: input.sortOrder ?? 100,
      is_active: true,
    })
    .select(
      "id, code, name, is_required, has_expiration, collect_issuing_organization, collect_scope, collect_validity, sort_order, is_active"
    )
    .single();
  if (error) throw error;
  return data as WorkflowDocumentRow;
}

export async function listWorkerUploadTargets(supabase: Db, tenantId: string, workerId: string) {
  const { data: applications, error: applicationError } = await supabase
    .from("job_applications")
    .select("workflow_id")
    .eq("tenant_id", tenantId)
    .eq("worker_id", workerId);
  if (applicationError) throw applicationError;

  const flowIds = [
    ...new Set(
      (applications ?? [])
        .map((row) => (row.workflow_id ? String(row.workflow_id) : ""))
        .filter(Boolean)
    ),
  ];
  if (!flowIds.length) return [];

  const { data, error } = await supabase
    .from("workflow_required_documents")
    .select(
      "id, code, name, has_expiration, collect_issuing_organization, collect_scope, collect_validity, sort_order"
    )
    .eq("tenant_id", tenantId)
    .in("flow_id", flowIds)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listWorkerCredentials(supabase: Db, tenantId: string, workerId: string) {
  const { data, error } = await supabase
    .from("worker_credentials")
    .select(
      "id, required_document_id, license_name, issuing_organization, scope, validity, issued_date, expiry_date, document_url, storage_path, original_file_name, status, review_notes, updated_at"
    )
    .eq("tenant_id", tenantId)
    .eq("worker_id", workerId)
    .order("license_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function saveWorkerCredential(
  supabase: Db,
  input: {
    tenantId: string;
    workerId: string;
    requiredDocumentId: string;
    applicationId?: string | null;
    issuingOrganization?: string | null;
    scope?: string | null;
    validity?: string | null;
    issuedDate?: string | null;
    expiryDate?: string | null;
    documentUrl?: string | null;
    storagePath?: string | null;
    originalFileName?: string | null;
    fileType?: string | null;
    fileSize?: number | null;
    status?: string | null;
    reviewNotes?: string | null;
    updatedBy?: string | null;
    allowReviewStatus?: boolean;
  }
) {
  const { data: doc, error: docError } = await supabase
    .from("workflow_required_documents")
    .select("id, name, has_expiration, tenant_id")
    .eq("id", input.requiredDocumentId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (docError) throw docError;
  if (!doc) throw new Error("Document type was not found.");

  const dateError = validateCredentialDates({
    hasExpiration: Boolean(doc.has_expiration),
    issuedDate: input.issuedDate ?? null,
    expiryDate: input.expiryDate ?? null,
  });
  if (dateError) throw new Error(dateError);

  const status = input.allowReviewStatus
    ? input.status?.trim() || "under_review"
    : "uploaded";

  const { data: existing, error: existingError } = await supabase
    .from("worker_credentials")
    .select("id, document_url, storage_path, original_file_name, file_type, file_size")
    .eq("tenant_id", input.tenantId)
    .eq("worker_id", input.workerId)
    .eq("required_document_id", input.requiredDocumentId)
    .maybeSingle();
  if (existingError) throw existingError;

  const row = {
    tenant_id: input.tenantId,
    worker_id: input.workerId,
    required_document_id: input.requiredDocumentId,
    application_id: input.applicationId ?? null,
    license_name: String(doc.name),
    issuing_organization: input.issuingOrganization?.trim() || null,
    scope: input.scope?.trim() || null,
    validity: input.validity?.trim() || null,
    issued_date: input.issuedDate?.trim() || null,
    expiry_date: input.expiryDate?.trim() || null,
    document_url: input.documentUrl ?? existing?.document_url ?? null,
    storage_path: input.storagePath ?? existing?.storage_path ?? null,
    original_file_name: input.originalFileName ?? existing?.original_file_name ?? null,
    file_type: input.fileType ?? existing?.file_type ?? null,
    file_size: input.fileSize ?? existing?.file_size ?? null,
    status,
    review_notes: input.allowReviewStatus ? input.reviewNotes?.trim() || null : null,
    updated_by: input.updatedBy ?? null,
  };

  const write = existing?.id
    ? supabase.from("worker_credentials").update(row).eq("id", existing.id)
    : supabase.from("worker_credentials").insert(row);

  const { data, error } = await write
    .select(
      "id, required_document_id, license_name, issuing_organization, scope, validity, issued_date, expiry_date, document_url, storage_path, original_file_name, status"
    )
    .single();
  if (error) throw error;
  return data;
}

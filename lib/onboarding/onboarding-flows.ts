import type { OnboardingDbClient } from "@/lib/onboarding/load-tenant-config";
import {
  isSerializableWorkflowState,
  type SerializableWorkflowState,
} from "@/lib/onboarding/workflow-builder-serialization";
import { workflowTemplateDraft, getWorkflowTemplateById } from "@/lib/onboarding/workflow-templates";
import {
  loadFlowBuilderDraft,
  replaceFlowStepsFromDraft,
} from "@/lib/onboarding/flow-steps-sync";
import { normalizeFlowNameKey } from "@/lib/onboarding/validate-flow-name";
import { resolveOnboardingLibraryForFlows } from "@/lib/onboarding/onboarding-libraries";
import type { WorkflowTemplateRow } from "@/lib/onboarding/workflow-templates";
import { createDefaultWorkflowState } from "@/lib/onboarding/default-workflow";
import { requireProfessionForEmploymentFlow } from "@/lib/professions/service";

export type OnboardingFlowStatus = "draft" | "published" | "unpublished";

export type OnboardingFlowRow = {
  id: string;
  tenant_id: string;
  library_id: string | null;
  template_id: string | null;
  name: string;
  status: OnboardingFlowStatus;
  created_as_blank: boolean;
  builder_draft: SerializableWorkflowState;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type OnboardingFlowListItem = {
  id: string;
  name: string;
  status: OnboardingFlowStatus;
  libraryId: string | null;
  templateId: string | null;
  createdAsBlank: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OnboardingFlowDetail = OnboardingFlowListItem & {
  builderDraft: SerializableWorkflowState;
  createdBy: string | null;
  updatedBy: string | null;
};

function parseDraft(raw: unknown): SerializableWorkflowState {
  if (isSerializableWorkflowState(raw)) return raw;
  return { nodes: [], edges: [] };
}

function toListItem(row: OnboardingFlowRow): OnboardingFlowListItem {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    libraryId: row.library_id,
    templateId: row.template_id,
    createdAsBlank: row.created_as_blank,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDetail(row: OnboardingFlowRow): OnboardingFlowDetail {
  return {
    ...toListItem(row),
    builderDraft: parseDraft(row.builder_draft),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

export function isPublishedFlowStatus(status: OnboardingFlowStatus): boolean {
  return status === "published";
}

export async function findDuplicateOnboardingFlowName(
  supabase: OnboardingDbClient,
  tenantId: string,
  name: string,
  opts?: { excludeFlowId?: string }
): Promise<string | null> {
  const normalized = normalizeFlowNameKey(name);
  if (!normalized) return "Flow name is required.";

  const { data, error } = await supabase
    .from("onboarding_flows")
    .select("id, name")
    .eq("tenant_id", tenantId);

  if (error) throw error;

  for (const row of data ?? []) {
    if (opts?.excludeFlowId && String(row.id) === opts.excludeFlowId) continue;
    if (normalizeFlowNameKey(String(row.name)) === normalized) {
      return `A flow named "${name.trim()}" already exists. Please choose another name.`;
    }
  }

  return null;
}

export type OnboardingFlowsListResult = {
  flows: OnboardingFlowListItem[];
  publishedCount: number;
  unpublishedCount: number;
  library: { id: string; name: string; slug: string } | null;
};

/**
 * Default applicant-facing onboarding flow for all job applications.
 * Job tokens still bind applications to a job; stepper steps always come from this flow.
 */
export const DEFAULT_ONBOARDING_FLOW_NAME = "Worker Onboarding";

export const DEFAULT_W2_FLOW_NAME = "W2 Employee Workflow";
export const DEFAULT_1099_FLOW_NAME = "1099 Contractor Workflow";
export const DEFAULT_RNR_FLOW_NAME = "RNR Worker Workflow";
/** Legacy flow name for Recruit and Release before RNR became first-class. */
export const DEFAULT_RR_FLOW_NAME = "R&R Workflow";

export const DEFAULT_W2_PRESET_NAME = "Default W2 Employee Workflow";
export const DEFAULT_1099_PRESET_NAME = "Default 1099 Contractor Workflow";
export const DEFAULT_RNR_PRESET_NAME = "Default RNR Worker Workflow";
/** Legacy preset name; prefer DEFAULT_RNR_PRESET_NAME. */
export const DEFAULT_RR_PRESET_NAME = "Default R&R Workflow";

type EmploymentFlowSeed = {
  presetName: string;
  fallbackPresetNames?: readonly string[];
  flowName: string;
  legacyFlowNames?: readonly string[];
  employmentType: "W2" | "1099" | "RNR";
  sortOrder: number;
  optional?: boolean;
};

const DEFAULT_EMPLOYMENT_FLOW_SEEDS: readonly EmploymentFlowSeed[] = [
  {
    presetName: DEFAULT_W2_PRESET_NAME,
    flowName: DEFAULT_W2_FLOW_NAME,
    employmentType: "W2",
    sortOrder: 2,
  },
  {
    presetName: DEFAULT_1099_PRESET_NAME,
    flowName: DEFAULT_1099_FLOW_NAME,
    employmentType: "1099",
    sortOrder: 3,
  },
  {
    presetName: DEFAULT_RNR_PRESET_NAME,
    fallbackPresetNames: [DEFAULT_RR_PRESET_NAME],
    flowName: DEFAULT_RNR_FLOW_NAME,
    legacyFlowNames: [DEFAULT_RR_FLOW_NAME],
    employmentType: "RNR",
    sortOrder: 4,
    optional: true,
  },
];

async function findOnboardingFlowRowByName(
  supabase: OnboardingDbClient,
  tenantId: string,
  flowName: string
): Promise<OnboardingFlowRow | null> {
  const target = normalizeFlowNameKey(flowName);
  const { data, error } = await supabase
    .from("onboarding_flows")
    .select(
      "id, tenant_id, library_id, template_id, name, status, created_as_blank, builder_draft, created_by, updated_by, created_at, updated_at"
    )
    .eq("tenant_id", tenantId);

  if (error) throw error;

  for (const row of data ?? []) {
    if (normalizeFlowNameKey(String(row.name ?? "")) === target) {
      return row as OnboardingFlowRow;
    }
  }
  return null;
}

/**
 * Ensures a published "Worker Onboarding" flow exists for the tenant.
 * Creates it from the platform default 6-step canvas when missing.
 */
export async function ensureWorkerOnboardingFlow(
  supabase: OnboardingDbClient,
  tenantId: string,
  createdBy?: string | null
): Promise<OnboardingFlowDetail> {
  const existing = await findOnboardingFlowRowByName(
    supabase,
    tenantId,
    DEFAULT_ONBOARDING_FLOW_NAME
  );

  if (existing) {
    const detail = await getOnboardingFlowById(supabase, tenantId, existing.id);
    if (!detail) {
      throw new Error(`Worker Onboarding flow ${existing.id} could not be loaded.`);
    }
    return detail;
  }

  const library = await resolveOnboardingLibraryForFlows(supabase, tenantId, {
    librarySlug: "onboarding",
  });
  if (!library) {
    throw new Error("Onboarding library is missing for this organization.");
  }

  const builderDraft = createDefaultWorkflowState();
  const { data, error } = await supabase
    .from("onboarding_flows")
    .insert({
      tenant_id: tenantId,
      library_id: library.id,
      template_id: null,
      name: DEFAULT_ONBOARDING_FLOW_NAME,
      status: "published",
      created_as_blank: false,
      builder_draft: builderDraft,
      sort_order: 1,
      created_by: createdBy ?? null,
      updated_by: createdBy ?? null,
    })
    .select("id")
    .single();

  if (error) throw error;
  if (!data?.id) {
    throw new Error("Failed to create Worker Onboarding flow.");
  }

  if (builderDraft.nodes.length) {
    await replaceFlowStepsFromDraft(supabase, String(data.id), builderDraft);
  }

  const created = await getOnboardingFlowById(supabase, tenantId, String(data.id));
  if (!created) {
    throw new Error("Failed to load Worker Onboarding flow after create.");
  }
  return created;
}

/**
 * Resolve the published Worker Onboarding flow used for all applicant job applications.
 */
export async function resolvePublishedWorkerOnboardingFlow(
  supabase: OnboardingDbClient,
  tenantId: string,
  createdBy?: string | null
): Promise<OnboardingFlowDetail> {
  const flow = await ensureWorkerOnboardingFlow(supabase, tenantId, createdBy);
  if (flow.status !== "published") {
    throw new Error("Worker Onboarding is not published for this organization.");
  }
  if (!isSerializableWorkflowState(flow.builderDraft) || !flow.builderDraft.nodes.length) {
    throw new Error("Worker Onboarding has no applicant steps configured.");
  }
  return flow;
}

async function loadPublishedPresetByName(
  supabase: OnboardingDbClient,
  presetName: string
): Promise<WorkflowTemplateRow | null> {
  const { data, error } = await supabase
    .from("onboarding_templates")
    .select(
      "id, tenant_id, name, description, type, status, employment_type, template_type, is_system_preset, is_editable, version, builder_draft, flow_name, created_by, updated_by, created_at, updated_at"
    )
    .eq("type", "preset")
    .eq("status", "published")
    .eq("name", presetName)
    .maybeSingle();

  if (error) throw error;
  return (data as WorkflowTemplateRow | null) ?? null;
}

async function loadPublishedPresetForSeed(
  supabase: OnboardingDbClient,
  seed: EmploymentFlowSeed
): Promise<WorkflowTemplateRow | null> {
  const names = [seed.presetName, ...(seed.fallbackPresetNames ?? [])];
  for (const name of names) {
    const preset = await loadPublishedPresetByName(supabase, name);
    if (preset) return preset;
  }
  return null;
}

async function employmentTypedFlowExists(
  supabase: OnboardingDbClient,
  tenantId: string,
  seed: EmploymentFlowSeed
): Promise<boolean> {
  const names = [seed.flowName, ...(seed.legacyFlowNames ?? [])];
  for (const name of names) {
    if (await findOnboardingFlowRowByName(supabase, tenantId, name)) return true;
  }
  return false;
}

async function insertEmploymentTypedFlow(
  supabase: OnboardingDbClient,
  tenantId: string,
  libraryId: string,
  seed: EmploymentFlowSeed,
  createdBy?: string | null
): Promise<void> {
  const preset = await loadPublishedPresetForSeed(supabase, seed);
  if (!preset) {
    if (seed.optional) return;
    throw new Error(
      `Missing published system preset "${seed.presetName}". Cannot seed default onboarding flows.`
    );
  }

  const builderDraft = await workflowTemplateDraft(supabase, preset);
  const { data, error } = await supabase
    .from("onboarding_flows")
    .insert({
      tenant_id: tenantId,
      library_id: libraryId,
      template_id: preset.id,
      name: seed.flowName,
      status: "published",
      employment_type: seed.employmentType,
      created_as_blank: false,
      builder_draft: builderDraft,
      sort_order: seed.sortOrder,
      created_by: createdBy ?? null,
      updated_by: createdBy ?? null,
    })
    .select("id")
    .single();

  if (error) throw error;
  if (data?.id && builderDraft.nodes.length) {
    await replaceFlowStepsFromDraft(supabase, String(data.id), builderDraft);
  }
}

async function ensureMissingEmploymentTypedFlows(
  supabase: OnboardingDbClient,
  tenantId: string,
  libraryId: string,
  createdBy?: string | null
): Promise<void> {
  for (const seed of DEFAULT_EMPLOYMENT_FLOW_SEEDS) {
    if (await employmentTypedFlowExists(supabase, tenantId, seed)) continue;
    await insertEmploymentTypedFlow(supabase, tenantId, libraryId, seed, createdBy);
  }
}

/**
 * When an onboarding library has no flows yet, seed published Worker Onboarding
 * (default applicant flow) plus W2, 1099, and RNR flows from system presets.
 * Always ensures Worker Onboarding exists even when other flows are already present.
 */
export async function ensureDefaultTenantOnboardingFlows(
  supabase: OnboardingDbClient,
  tenantId: string,
  libraryId: string,
  createdBy?: string | null
): Promise<void> {
  const { count, error: countError } = await supabase
    .from("onboarding_flows")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("library_id", libraryId);

  if (countError) throw countError;

  if (!count || count === 0) {
    const workerDraft = createDefaultWorkflowState();
    const { data: workerFlow, error: workerError } = await supabase
      .from("onboarding_flows")
      .insert({
        tenant_id: tenantId,
        library_id: libraryId,
        template_id: null,
        name: DEFAULT_ONBOARDING_FLOW_NAME,
        status: "published",
        created_as_blank: false,
        builder_draft: workerDraft,
        sort_order: 1,
        created_by: createdBy ?? null,
        updated_by: createdBy ?? null,
      })
      .select("id")
      .single();

    if (workerError) throw workerError;
    if (workerFlow?.id && workerDraft.nodes.length) {
      await replaceFlowStepsFromDraft(supabase, String(workerFlow.id), workerDraft);
    }

    await ensureMissingEmploymentTypedFlows(supabase, tenantId, libraryId, createdBy);

    try {
      const { ensureEmploymentTypeDefaultMappings } = await import(
        "@/lib/workflow-mappings/service"
      );
      await ensureEmploymentTypeDefaultMappings(supabase as never, tenantId, createdBy);
    } catch {
      // Mapping seed is best-effort; jobs still resolve once mappings exist.
    }
    return;
  }

  await ensureWorkerOnboardingFlow(supabase, tenantId, createdBy);
  await ensureMissingEmploymentTypedFlows(supabase, tenantId, libraryId, createdBy);

  try {
    const { ensureEmploymentTypeDefaultMappings } = await import(
      "@/lib/workflow-mappings/service"
    );
    await ensureEmploymentTypeDefaultMappings(supabase as never, tenantId, createdBy);
  } catch {
    // best-effort
  }
}

/** @deprecated Use ensureDefaultTenantOnboardingFlows */
export async function ensureDefaultTenantOnboardingFlow(
  supabase: OnboardingDbClient,
  tenantId: string,
  libraryId: string,
  createdBy?: string | null
): Promise<void> {
  return ensureDefaultTenantOnboardingFlows(supabase, tenantId, libraryId, createdBy);
}

export async function listOnboardingFlows(
  supabase: OnboardingDbClient,
  tenantId: string,
  opts?: { libraryId?: string; librarySlug?: string; status?: "published" | "unpublished" }
): Promise<OnboardingFlowsListResult> {
  const library = await resolveOnboardingLibraryForFlows(supabase, tenantId, {
    libraryId: opts?.libraryId,
    librarySlug: opts?.librarySlug,
  });

  if (!library) {
    return { flows: [], publishedCount: 0, unpublishedCount: 0, library: null };
  }

  await ensureDefaultTenantOnboardingFlows(supabase, tenantId, library.id);

  const baseQuery = supabase
    .from("onboarding_flows")
    .select(
      "id, tenant_id, library_id, template_id, name, status, created_as_blank, created_at, updated_at, sort_order"
    )
    .eq("tenant_id", tenantId)
    .eq("library_id", library.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  const { data: allRows, error: allError } = await baseQuery;
  if (allError) throw allError;

  const rows = (allRows ?? []) as (OnboardingFlowRow & { sort_order: number })[];
  let publishedCount = 0;
  let unpublishedCount = 0;
  for (const row of rows) {
    if (row.status === "published") publishedCount += 1;
    else unpublishedCount += 1;
  }

  let filtered = rows;
  if (opts?.status === "published") {
    filtered = rows.filter((r) => r.status === "published");
  } else if (opts?.status === "unpublished") {
    filtered = rows.filter((r) => r.status === "unpublished" || r.status === "draft");
  }

  return {
    flows: filtered.map(toListItem),
    publishedCount,
    unpublishedCount,
    library: { id: library.id, name: library.name, slug: library.slug },
  };
}

export async function getOnboardingFlowById(
  supabase: OnboardingDbClient,
  tenantId: string,
  flowId: string
): Promise<OnboardingFlowDetail | null> {
  const { data, error } = await supabase
    .from("onboarding_flows")
    .select(
      "id, tenant_id, library_id, template_id, name, status, created_as_blank, builder_draft, created_by, updated_by, created_at, updated_at"
    )
    .eq("id", flowId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as OnboardingFlowRow;
  const builderDraft = await loadFlowBuilderDraft(supabase, flowId, row.builder_draft);
  return { ...toDetail(row), builderDraft };
}

export async function createOnboardingFlow(
  supabase: OnboardingDbClient,
  tenantId: string,
  input: {
    name: string;
    libraryId?: string | null;
    templateId?: string | null;
    createAsBlank?: boolean;
    status?: OnboardingFlowStatus;
    createdBy: string;
    employmentType?: string | null;
    professionId?: string | null;
  }
): Promise<OnboardingFlowDetail> {
  const duplicate = await findDuplicateOnboardingFlowName(supabase, tenantId, input.name);
  if (duplicate) throw new Error(duplicate);
  requireProfessionForEmploymentFlow({
    employmentType: input.employmentType,
    professionId: input.professionId,
  });

  let libraryId = input.libraryId ?? null;
  if (!libraryId) {
    const library = await resolveOnboardingLibraryForFlows(supabase, tenantId, {
      librarySlug: "onboarding",
    });
    libraryId = library?.id ?? null;
  }

  let builderDraft: SerializableWorkflowState = { nodes: [], edges: [] };
  let templateId: string | null = input.templateId ?? null;
  const createAsBlank = input.createAsBlank === true || !templateId;

  if (!createAsBlank && templateId) {
    const template = await getWorkflowTemplateById(supabase, tenantId, templateId);
    if (!template) throw new Error("Template not found");
    builderDraft = await workflowTemplateDraft(supabase, template);
  }

  const status: OnboardingFlowStatus = input.status ?? "unpublished";

  let sortOrder = 0;
  if (libraryId) {
    const { data: maxRow } = await supabase
      .from("onboarding_flows")
      .select("sort_order")
      .eq("tenant_id", tenantId)
      .eq("library_id", libraryId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    sortOrder = (maxRow?.sort_order ?? 0) + 1;
  }

  const { data, error } = await supabase
    .from("onboarding_flows")
    .insert({
      tenant_id: tenantId,
      library_id: libraryId,
      template_id: templateId,
      name: input.name.trim(),
      status,
      created_as_blank: createAsBlank,
      builder_draft: builderDraft,
      sort_order: sortOrder,
      employment_type: input.employmentType?.trim() || null,
      profession_id: input.professionId?.trim() || null,
      created_by: input.createdBy,
      updated_by: input.createdBy,
    })
    .select(
      "id, tenant_id, library_id, template_id, name, status, created_as_blank, builder_draft, created_by, updated_by, created_at, updated_at"
    )
    .single();

  if (error) {
    const message = [error.message, error.details, error.hint].filter(Boolean).join(" — ");
    throw new Error(message || "Failed to create onboarding flow");
  }

  const detail = toDetail(data as OnboardingFlowRow);
  if (builderDraft.nodes.length) {
    await replaceFlowStepsFromDraft(supabase, detail.id, builderDraft);
  }
  return { ...detail, builderDraft };
}

export async function updateOnboardingFlow(
  supabase: OnboardingDbClient,
  tenantId: string,
  flowId: string,
  input: {
    name?: string;
    status?: OnboardingFlowStatus;
    libraryId?: string | null;
    builderDraft?: SerializableWorkflowState;
    updatedBy: string;
  }
): Promise<OnboardingFlowDetail> {
  const existing = await getOnboardingFlowById(supabase, tenantId, flowId);
  if (!existing) throw new Error("Flow not found");

  if (input.name !== undefined) {
    const duplicate = await findDuplicateOnboardingFlowName(supabase, tenantId, input.name, {
      excludeFlowId: flowId,
    });
    if (duplicate) throw new Error(duplicate);
  }

  const patch: Record<string, unknown> = {
    updated_by: input.updatedBy,
  };

  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.status !== undefined) patch.status = input.status;
  if (input.libraryId !== undefined) patch.library_id = input.libraryId;
  if (input.builderDraft !== undefined) patch.builder_draft = input.builderDraft;

  const { data, error } = await supabase
    .from("onboarding_flows")
    .update(patch)
    .eq("id", flowId)
    .eq("tenant_id", tenantId)
    .select(
      "id, tenant_id, library_id, template_id, name, status, created_as_blank, builder_draft, created_by, updated_by, created_at, updated_at"
    )
    .single();

  if (error) {
    throw new Error(
      [error.message, error.details, error.hint].filter(Boolean).join(" — ") ||
        "Failed to update onboarding flow"
    );
  }

  const detail = toDetail(data as OnboardingFlowRow);
  if (input.builderDraft) {
    await replaceFlowStepsFromDraft(supabase, flowId, input.builderDraft);
    detail.builderDraft = input.builderDraft;
  } else {
    detail.builderDraft = await loadFlowBuilderDraft(
      supabase,
      flowId,
      detail.builderDraft
    );
  }
  return detail;
}

export async function deleteOnboardingFlow(
  supabase: OnboardingDbClient,
  tenantId: string,
  flowId: string
): Promise<void> {
  const { error } = await supabase
    .from("onboarding_flows")
    .delete()
    .eq("id", flowId)
    .eq("tenant_id", tenantId);

  if (error) throw error;
}

export async function saveOnboardingFlowAsTemplate(
  supabase: OnboardingDbClient,
  tenantId: string,
  flowId: string,
  input: { templateName: string; createdBy: string }
): Promise<{ templateId: string }> {
  const flow = await getOnboardingFlowById(supabase, tenantId, flowId);
  if (!flow) throw new Error("Flow not found");

  const { createWorkflowTemplate } = await import("@/lib/onboarding/workflow-templates");
  const template = await createWorkflowTemplate(supabase, tenantId, {
    name: input.templateName,
    folder: "saved-templates",
    builderDraft: flow.builderDraft,
    flowName: flow.name,
    createdBy: input.createdBy,
  });

  return { templateId: template.id };
}

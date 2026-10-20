import type { OnboardingDbClient } from "@/lib/onboarding/load-tenant-config";
import {
  isSerializableWorkflowState,
  type SerializableWorkflowState,
} from "@/lib/onboarding/workflow-builder-serialization";
import { loadTemplateBuilderDraft } from "@/lib/onboarding/flow-steps-sync";
import {
  normalizeTemplateEmploymentType,
  type TemplateEmploymentType,
} from "@/lib/jobs/employment-type";

export type WorkflowTemplateFolder = "presets" | "saved-templates";

export type WorkflowTemplateRow = {
  id: string;
  tenant_id: string | null;
  name: string;
  description?: string | null;
  type: "preset" | "saved";
  status: string;
  employment_type?: TemplateEmploymentType | "Contract" | null;
  template_type?: string | null;
  is_system_preset?: boolean;
  is_editable?: boolean;
  version?: number;
  builder_draft: SerializableWorkflowState;
  flow_name: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowTemplateListItem = {
  id: string;
  name: string;
  description: string | null;
  folder: WorkflowTemplateFolder;
  isPreset: boolean;
  isEditable: boolean;
  status: "draft" | "published" | "unpublished";
  employmentType: TemplateEmploymentType | null;
  templateVersion: number;
  preHireStepCount: number;
  postHireStepCount: number;
  transitionStepCount: number;
  totalStepCount: number;
  flowName: string | null;
  updatedAt: string;
};

const TEMPLATE_SELECT =
  "id, tenant_id, name, description, type, status, employment_type, template_type, is_system_preset, is_editable, version, builder_draft, flow_name, created_by, updated_by, created_at, updated_at";

function rowToFolder(type: "preset" | "saved"): WorkflowTemplateFolder {
  return type === "preset" ? "presets" : "saved-templates";
}

const PRESET_DISPLAY_ORDER = [
  "1099 Workflow (Healthcare Industry)",
  "W2 Workflow (Healthcare Industry)",
  "RnR Workflow (Healthcare Industry)",
  "W2 Workflow (IT Industry)",
  "RnR Workflow (IT Industry)",
];

export function inferEmploymentTypeFromName(name: string): TemplateEmploymentType | null {
  const lower = name.toLowerCase();
  if (lower.includes("1099") || lower.includes("contractor")) return "1099";
  if (
    lower.includes("rnr") ||
    lower.includes("r&r") ||
    lower.includes("recruit and release") ||
    lower.includes("recruit & release")
  ) {
    return "RNR";
  }
  if (lower.includes("w2") || lower.includes("employee")) return "W2";
  return null;
}

function sortPresetTemplates(presets: WorkflowTemplateListItem[]): WorkflowTemplateListItem[] {
  return [...presets].sort((a, b) => {
    const aRank = PRESET_DISPLAY_ORDER.findIndex(
      (name) => name.toLowerCase() === a.name.toLowerCase()
    );
    const bRank = PRESET_DISPLAY_ORDER.findIndex(
      (name) => name.toLowerCase() === b.name.toLowerCase()
    );
    const aOrder = aRank === -1 ? PRESET_DISPLAY_ORDER.length : aRank;
    const bOrder = bRank === -1 ? PRESET_DISPLAY_ORDER.length : bRank;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
  });
}

function normalizeName(name: string): string {
  const trimmed = tenantTemplateDisplayName(name);
  if (!trimmed) return "New Template";
  return trimmed.endsWith(".tpl") ? trimmed : `${trimmed}.tpl`;
}

/** Strip preset chrome so tenant copies are distinct from system starters. */
export function tenantTemplateDisplayName(name: string): string {
  return name.replace(/\.tpl$/i, "").replace(/^Default\s+/i, "").trim();
}

type WorkflowStepPhase = "pre_hire" | "transition" | "post_hire";

function nodePhase(node: { settings?: Record<string, unknown> }): WorkflowStepPhase {
  const phase = node.settings?.phase;
  if (phase === "pre_hire" || phase === "transition" || phase === "post_hire") return phase;
  return "pre_hire";
}

function phaseCounts(draft: SerializableWorkflowState): {
  preHire: number;
  transition: number;
  postHire: number;
  total: number;
} {
  let preHire = 0;
  let transition = 0;
  let postHire = 0;
  for (const node of draft.nodes) {
    const phase = nodePhase(node);
    if (phase === "pre_hire") preHire += 1;
    if (phase === "transition") transition += 1;
    if (phase === "post_hire") postHire += 1;
  }
  return { preHire, transition, postHire, total: draft.nodes.length };
}

function toListItem(row: WorkflowTemplateRow): WorkflowTemplateListItem {
  const draft = parseDraft(row.builder_draft);
  const counts = phaseCounts(draft);
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    folder: rowToFolder(row.type),
    isPreset: row.type === "preset",
    isEditable: row.is_editable ?? (row.type !== "preset" && row.is_system_preset !== true),
    status: row.status === "published" || row.status === "unpublished" ? row.status : "draft",
    employmentType:
      normalizeTemplateEmploymentType(row.employment_type) ??
      inferEmploymentTypeFromName(row.name),
    templateVersion: Math.max(1, Number(row.version) || 1),
    preHireStepCount: counts.preHire,
    transitionStepCount: counts.transition,
    postHireStepCount: counts.postHire,
    totalStepCount: counts.total,
    flowName: row.flow_name,
    updatedAt: row.updated_at,
  };
}

function parseDraft(raw: unknown): SerializableWorkflowState {
  if (isSerializableWorkflowState(raw)) return raw;
  return { nodes: [], edges: [] };
}

async function syncTemplateSteps(
  supabase: OnboardingDbClient,
  templateId: string,
  draft: SerializableWorkflowState
): Promise<void> {
  await supabase.from("onboarding_template_steps").delete().eq("template_id", templateId);
  if (!draft.nodes.length) return;

  const inserts = draft.nodes.map((node, index) => ({
    template_id: templateId,
    step_type: node.stepId,
    title: node.label,
    description: node.description ?? null,
    position: index + 1,
    day: node.day,
    is_required: node.required,
    settings: node.settings,
    metadata: { library_step_key: node.stepId },
    canvas_node_id: node.id,
  }));

  const { error } = await supabase.from("onboarding_template_steps").insert(inserts);
  if (error) throw error;
}

export async function listWorkflowTemplates(
  supabase: OnboardingDbClient,
  tenantId: string
): Promise<{ presets: WorkflowTemplateListItem[]; savedTemplates: WorkflowTemplateListItem[] }> {
  const { data: presetRows, error: presetError } = await supabase
    .from("onboarding_templates")
    .select(TEMPLATE_SELECT)
    .eq("type", "preset")
    .eq("status", "published")
    .order("name", { ascending: true });

  if (presetError) throw presetError;

  const { data: savedRows, error: savedError } = await supabase
    .from("onboarding_templates")
    .select(TEMPLATE_SELECT)
    .eq("tenant_id", tenantId)
    .eq("type", "saved")
    .order("updated_at", { ascending: false });

  if (savedError) throw savedError;

  return {
    presets: sortPresetTemplates(
      (presetRows ?? []).map((row) => toListItem(row as WorkflowTemplateRow))
    ),
    savedTemplates: (savedRows ?? []).map((row) => toListItem(row as WorkflowTemplateRow)),
  };
}

export async function getWorkflowTemplateById(
  supabase: OnboardingDbClient,
  tenantId: string,
  templateId: string
): Promise<WorkflowTemplateRow | null> {
  const { data, error } = await supabase
    .from("onboarding_templates")
    .select(TEMPLATE_SELECT)
    .eq("id", templateId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as WorkflowTemplateRow;
  if (row.type === "preset") return row;
  if (row.tenant_id !== tenantId) return null;
  return row;
}

export async function createWorkflowTemplate(
  supabase: OnboardingDbClient,
  tenantId: string,
  input: {
    name: string;
    description?: string;
    folder?: WorkflowTemplateFolder;
    builderDraft: SerializableWorkflowState;
    flowName?: string;
    createdBy: string;
    isPreset?: boolean;
    employmentType?: TemplateEmploymentType | null;
    templateType?: string;
    isSystemPreset?: boolean;
    isEditable?: boolean;
    status?: "draft" | "published" | "unpublished";
    version?: number;
  }
): Promise<WorkflowTemplateListItem> {
  if (input.isPreset === true || input.isSystemPreset === true) {
    throw new Error("System presets cannot be created or overwritten from the builder");
  }

  const displayName = tenantTemplateDisplayName(input.name) || "New Template";
  const employmentType =
    normalizeTemplateEmploymentType(input.employmentType) ??
    inferEmploymentTypeFromName(input.name) ??
    inferEmploymentTypeFromName(displayName);

  const { data, error } = await supabase
    .from("onboarding_templates")
    .insert({
      tenant_id: tenantId,
      name: normalizeName(displayName),
      description: input.description ?? null,
      type: "saved",
      status: input.status ?? "draft",
      builder_draft: input.builderDraft,
      flow_name: input.flowName?.trim() || displayName,
      created_by: input.createdBy,
      updated_by: input.createdBy,
      employment_type: employmentType,
      template_type: input.templateType ?? "custom",
      is_system_preset: false,
      is_editable: input.isEditable ?? true,
      version: input.version ?? 1,
    })
    .select(TEMPLATE_SELECT)
    .single();

  if (error) throw error;
  if (!data) throw new Error("Template was not created");

  const row = data as WorkflowTemplateRow;
  await syncTemplateSteps(supabase, row.id, input.builderDraft);
  return toListItem(row);
}

function assertTemplateWritable(existing: WorkflowTemplateRow, tenantId: string): void {
  if (existing.type === "preset" && existing.tenant_id === null) {
    throw new Error("Cannot modify system preset");
  }
  if (existing.tenant_id !== null && existing.tenant_id !== tenantId) {
    throw new Error("Template not found");
  }
}

export async function updateWorkflowTemplate(
  supabase: OnboardingDbClient,
  tenantId: string,
  templateId: string,
  input: {
    name?: string;
    description?: string;
    flowName?: string;
    builderDraft?: SerializableWorkflowState;
    status?: "draft" | "published" | "unpublished";
    employmentType?: TemplateEmploymentType | null;
    version?: number;
    updatedBy: string;
  }
): Promise<WorkflowTemplateListItem> {
  const existing = await getWorkflowTemplateById(supabase, tenantId, templateId);
  if (!existing) throw new Error("Template not found");
  assertTemplateWritable(existing, tenantId);

  const patch: Record<string, unknown> = {
    updated_by: input.updatedBy,
  };

  if (input.name !== undefined) patch.name = normalizeName(input.name);
  if (input.description !== undefined) patch.description = input.description;
  if (input.flowName !== undefined) patch.flow_name = input.flowName.trim() || null;
  if (input.builderDraft !== undefined) patch.builder_draft = input.builderDraft;
  if (input.status !== undefined) patch.status = input.status;
  if (input.employmentType !== undefined) patch.employment_type = input.employmentType;
  if (input.version !== undefined) patch.version = input.version;

  const { data, error } = await supabase
    .from("onboarding_templates")
    .update(patch)
    .eq("id", templateId)
    .eq("tenant_id", tenantId)
    .select(TEMPLATE_SELECT)
    .single();

  if (error) throw error;
  if (!data) throw new Error("Template was not updated");

  if (input.builderDraft) {
    await syncTemplateSteps(supabase, templateId, input.builderDraft);
  }

  return toListItem(data as WorkflowTemplateRow);
}

export async function updateWorkflowTemplateName(
  supabase: OnboardingDbClient,
  tenantId: string,
  templateId: string,
  name: string,
  updatedBy: string
): Promise<void> {
  await updateWorkflowTemplate(supabase, tenantId, templateId, { name, updatedBy });
}

export async function deleteWorkflowTemplate(
  supabase: OnboardingDbClient,
  tenantId: string,
  templateId: string
): Promise<void> {
  const existing = await getWorkflowTemplateById(supabase, tenantId, templateId);
  if (!existing) throw new Error("Template not found");
  assertTemplateWritable(existing, tenantId);

  const { error } = await supabase.from("onboarding_templates").delete().eq("id", templateId);
  if (error) throw error;
}

export async function duplicatePresetToTenantDraft(
  supabase: OnboardingDbClient,
  tenantId: string,
  templateId: string,
  createdBy: string
): Promise<{ sourceTemplate: WorkflowTemplateRow; tenantTemplate: WorkflowTemplateListItem }> {
  const source = await getWorkflowTemplateById(supabase, tenantId, templateId);
  if (!source) throw new Error("Template not found");
  if (source.type !== "preset") throw new Error("Only presets can be duplicated");

  const copy = await createWorkflowTemplate(supabase, tenantId, {
    name: source.name.replace(/\.tpl$/i, ""),
    description: source.description ?? undefined,
    folder: "saved-templates",
    builderDraft: parseDraft(source.builder_draft),
    flowName: source.flow_name ?? source.name.replace(/\.tpl$/i, ""),
    createdBy,
    isPreset: false,
    employmentType: normalizeTemplateEmploymentType(source.employment_type),
    templateType: source.template_type ?? "default",
    isSystemPreset: false,
    isEditable: true,
    status: "draft",
    version: Math.max(1, Number(source.version) || 1),
  });

  return { sourceTemplate: source, tenantTemplate: copy };
}

export async function workflowTemplateDraft(
  supabase: OnboardingDbClient,
  row: WorkflowTemplateRow
): Promise<SerializableWorkflowState> {
  return loadTemplateBuilderDraft(supabase, row.id, row.builder_draft);
}

export function workflowTemplateDraftSync(row: WorkflowTemplateRow): SerializableWorkflowState {
  return parseDraft(row.builder_draft);
}

export async function publishWorkflowTemplate(
  supabase: OnboardingDbClient,
  tenantId: string,
  templateId: string,
  input: {
    builderDraft?: SerializableWorkflowState;
    updatedBy: string;
  }
): Promise<{ template: WorkflowTemplateListItem; appliedFlowId: string | null }> {
  const existing = await getWorkflowTemplateById(supabase, tenantId, templateId);
  if (!existing) throw new Error("Template not found");
  assertTemplateWritable(existing, tenantId);

  const draft = input.builderDraft ?? parseDraft(existing.builder_draft);
  if (!draft.nodes.length) {
    throw new Error("Cannot publish an empty template");
  }

  const nextVersion = Math.max(1, Number(existing.version) || 1) + 1;
  const template = await updateWorkflowTemplate(supabase, tenantId, templateId, {
    builderDraft: draft,
    status: "published",
    version: nextVersion,
    updatedBy: input.updatedBy,
  });

  const applied = await applyPublishedTemplateToEmploymentFlow(supabase, tenantId, {
    templateId: template.id,
    employmentType: template.employmentType,
    builderDraft: draft,
    updatedBy: input.updatedBy,
  });

  return { template, appliedFlowId: applied?.flowId ?? null };
}

export async function applyPublishedTemplateToEmploymentFlow(
  supabase: OnboardingDbClient,
  tenantId: string,
  input: {
    templateId: string;
    employmentType: TemplateEmploymentType | null;
    builderDraft: SerializableWorkflowState;
    updatedBy: string;
  }
): Promise<{ flowId: string } | null> {
  if (!input.employmentType) return null;
  if (!input.builderDraft.nodes.length) return null;

  const { data, error } = await supabase
    .from("onboarding_flows")
    .select("id, name, employment_type, status")
    .eq("tenant_id", tenantId);

  if (error) throw error;

  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    employment_type?: string | null;
    status?: string;
  }>;

  const match =
    rows.find(
      (row) =>
        normalizeTemplateEmploymentType(row.employment_type) === input.employmentType
    ) ??
    rows.find((row) => {
      const name = String(row.name ?? "").toLowerCase();
      if (input.employmentType === "1099") {
        return name.includes("1099") || name.includes("contractor");
      }
      if (input.employmentType === "RNR") {
        return (
          name.includes("rnr") ||
          name.includes("r&r") ||
          name.includes("recruit and release") ||
          name.includes("recruit & release")
        );
      }
      if (input.employmentType === "W2") {
        return name.includes("w2") || name.includes("employee");
      }
      return false;
    });

  if (!match) return null;
  if (String(match.name).trim().toLowerCase() === "worker onboarding") return null;

  const { data: updated, error: updateError } = await supabase
    .from("onboarding_flows")
    .update({
      template_id: input.templateId,
      builder_draft: input.builderDraft,
      status: "published",
      updated_by: input.updatedBy,
    })
    .eq("id", match.id)
    .eq("tenant_id", tenantId)
    .select("id")
    .single();

  if (updateError) throw updateError;
  if (!updated?.id) throw new Error("Mapped workflow was not updated");

  const { replaceFlowStepsFromDraft } = await import("@/lib/onboarding/flow-steps-sync");
  await replaceFlowStepsFromDraft(supabase, String(updated.id), input.builderDraft);
  const { syncActiveWorkflowInstancesSafely } = await import(
    "@/lib/onboarding/sync-workflow-instances"
  );
  await syncActiveWorkflowInstancesSafely(supabase, {
    tenantId,
    flowId: String(updated.id),
    draft: input.builderDraft,
    flowName: match.name,
  });
  return { flowId: String(updated.id) };
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkflowMatch, WorkflowMatchKey } from "@/lib/jobs/types";
import { workflowNoMatchMessage } from "@/lib/jobs/validation";
import {
  WorkflowMappingError,
  type WorkflowMappingInput,
  type WorkflowMappingListItem,
  type WorkflowResolveResult,
} from "@/lib/workflow-mappings/types";
import {
  formatRoutingCriteriaLabel,
  mappingSpecificity,
  pickBestMappingMatch,
  validateWorkflowCompatibility,
  type MappingCandidate,
} from "@/lib/workflow-mappings/validation";
import { isRnrEmploymentType } from "@/lib/jobs/employment-type";

type DbClient = SupabaseClient;

const MAPPING_SELECT =
  "id, tenant_id, profession_id, specialty_id, employment_type, location, location_type, years_of_experience, workflow_id, is_active, priority, created_at, updated_at, tenant_professions(name), specialties(name), onboarding_flows(id, name, status, tenant_id, employment_type)";

function cleanText(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function toMatchKey(key: WorkflowMatchKey): WorkflowMatchKey {
  return {
    professionId: key.professionId ?? null,
    specialtyId: key.specialtyId ?? null,
    employmentType: key.employmentType,
    location: cleanText(key.location),
    locationType: cleanText(key.locationType ?? key.jobLocationType),
    yearsOfExperience: cleanText(key.yearsOfExperience),
  };
}

function toCandidate(row: Record<string, unknown>): MappingCandidate | null {
  const flow = Array.isArray(row.onboarding_flows) ? row.onboarding_flows[0] : row.onboarding_flows;
  const flowRecord = flow as { id?: string; name?: string; status?: string; tenant_id?: string } | null;
  if (!flowRecord?.name || flowRecord.status !== "published") return null;

  return {
    id: String(row.id),
    workflowId: String(row.workflow_id),
    workflowName: String(flowRecord.name),
    priority: Number(row.priority) || 100,
    createdAt: String(row.created_at ?? ""),
    employmentType: row.employment_type as MappingCandidate["employmentType"],
    professionId: row.profession_id ? String(row.profession_id) : null,
    specialtyId: row.specialty_id ? String(row.specialty_id) : null,
    location: cleanText(row.location as string | null),
    locationType: cleanText(row.location_type as string | null),
    yearsOfExperience: cleanText(row.years_of_experience as string | null),
  };
}

function toListItem(row: Record<string, unknown>): WorkflowMappingListItem {
  const profession = Array.isArray(row.tenant_professions)
    ? row.tenant_professions[0]
    : row.tenant_professions;
  const specialty = Array.isArray(row.specialties) ? row.specialties[0] : row.specialties;
  const flow = Array.isArray(row.onboarding_flows) ? row.onboarding_flows[0] : row.onboarding_flows;
  const professionId = row.profession_id ? String(row.profession_id) : null;
  const specialtyId = row.specialty_id ? String(row.specialty_id) : null;
  const location = cleanText(row.location as string | null);
  const locationType = cleanText(row.location_type as string | null);
  const yearsOfExperience = cleanText(row.years_of_experience as string | null);
  const employmentType = row.employment_type as WorkflowMappingListItem["employmentType"];

  return {
    id: String(row.id),
    professionId,
    professionName: professionId
      ? String((profession as { name?: string } | null)?.name ?? professionId)
      : null,
    specialtyId,
    specialtyName: specialtyId
      ? String((specialty as { name?: string } | null)?.name ?? specialtyId)
      : null,
    employmentType,
    location,
    locationType,
    yearsOfExperience,
    workflowId: String(row.workflow_id),
    workflowName: String((flow as { name?: string } | null)?.name ?? row.workflow_id),
    workflowEmploymentType:
      ((flow as { employment_type?: string | null } | null)?.employment_type as string | null) ??
      null,
    isActive: row.is_active === true,
    priority: Number(row.priority) || 100,
    specificity: mappingSpecificity({
      employmentType,
      professionId,
      specialtyId,
      location,
      locationType,
      yearsOfExperience,
    }),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function loadActiveMappingCandidates(
  supabase: DbClient,
  tenantId: string,
  employmentType: string
): Promise<MappingCandidate[]> {
  let query = supabase
    .from("workflow_mappings")
    .select(
      "id, workflow_id, priority, created_at, employment_type, profession_id, specialty_id, location, location_type, years_of_experience, onboarding_flows!inner(id, name, status, tenant_id)"
    )
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .eq("onboarding_flows.status", "published")
    .eq("onboarding_flows.tenant_id", tenantId);

  query = isRnrEmploymentType(employmentType)
    ? query.in("employment_type", ["Contract", "RNR"])
    : query.eq("employment_type", employmentType);

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? [])
    .map((row) => toCandidate(row as Record<string, unknown>))
    .filter((row): row is MappingCandidate => Boolean(row));
}

/**
 * Resolve the best workflow for a job using most-specific matching, then
 * employment-type defaults (mappings with only employment type configured).
 */
export async function resolveWorkflowMatch(
  supabase: DbClient,
  tenantId: string,
  key: WorkflowMatchKey
): Promise<WorkflowMatch | null> {
  const matchKey = toMatchKey(key);
  const candidates = await loadActiveMappingCandidates(
    supabase,
    tenantId,
    matchKey.employmentType
  );
  const best = pickBestMappingMatch(candidates, matchKey);
  if (!best) return null;

  const isDefaultOnly =
    !best.professionId &&
    !best.specialtyId &&
    !best.location &&
    !best.locationType &&
    !best.yearsOfExperience;

  return {
    mappingId: best.id,
    workflowId: best.workflowId,
    workflowName: best.workflowName,
    source: isDefaultOnly ? "default" : "mapping",
    specificity: best.specificity,
    criteriaLabel: formatRoutingCriteriaLabel({
      employmentType: best.employmentType,
      professionName: best.professionId ? undefined : null,
      location: best.location,
      locationType: best.locationType,
      yearsOfExperience: best.yearsOfExperience,
    }),
  };
}

export async function resolveWorkflowForCriteria(
  supabase: DbClient,
  tenantId: string,
  key: WorkflowMatchKey
): Promise<WorkflowResolveResult> {
  const matchKey = toMatchKey(key);
  const match = await resolveWorkflowMatch(supabase, tenantId, matchKey);
  if (match) {
    let professionName: string | null = null;
    let specialtyName: string | null = null;

    if (matchKey.professionId) {
      professionName = await tenantProfessionName(supabase, tenantId, matchKey.professionId);
    }
    if (matchKey.specialtyId) {
      const { data: specialty } = await supabase
        .from("specialties")
        .select("name")
        .eq("id", matchKey.specialtyId)
        .maybeSingle();
      specialtyName = specialty?.name ? String(specialty.name) : null;
    }

    return {
      matched: true,
      mappingId: match.mappingId,
      workflowId: match.workflowId,
      workflowName: match.workflowName,
      // Automatic resolve never returns "manual" (job-level override only).
      source: match.source === "default" ? "default" : "mapping",
      specificity: match.specificity,
      criteriaLabel: formatRoutingCriteriaLabel({
        employmentType: matchKey.employmentType,
        professionName,
        specialtyName,
        location: matchKey.location,
        locationType: matchKey.locationType,
        yearsOfExperience: matchKey.yearsOfExperience,
      }),
    };
  }

  let professionName = String(matchKey.professionId ?? "Any profession");
  if (matchKey.professionId) {
    professionName =
      (await tenantProfessionName(supabase, tenantId, matchKey.professionId)) ?? professionName;
  }

  return {
    matched: false,
    workflowId: null,
    message: workflowNoMatchMessage(professionName, matchKey),
  };
}

export async function listWorkflowMappings(
  supabase: DbClient,
  tenantId: string,
  filters?: {
    professionId?: string;
    employmentType?: string;
    activeOnly?: boolean;
  }
): Promise<WorkflowMappingListItem[]> {
  let query = supabase
    .from("workflow_mappings")
    .select(MAPPING_SELECT)
    .eq("tenant_id", tenantId)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (filters?.professionId) query = query.eq("profession_id", filters.professionId);
  if (filters?.employmentType) query = query.eq("employment_type", filters.employmentType);
  if (filters?.activeOnly) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? [])
    .map((row) => toListItem(row as Record<string, unknown>))
    .sort((a, b) => b.specificity - a.specificity || a.priority - b.priority);
}

async function tenantProfessionName(
  supabase: DbClient,
  tenantId: string,
  professionId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("tenant_professions")
    .select("name")
    .eq("id", professionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  return data?.name ? String(data.name) : null;
}

async function assertTenantProfession(
  supabase: DbClient,
  tenantId: string,
  professionId: string | null
) {
  if (!professionId) return;
  const { data, error } = await supabase
    .from("tenant_professions")
    .select("id")
    .eq("id", professionId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new WorkflowMappingError("Choose a profession from this tenant.", "INVALID_PROFESSION", {
      professionId: "That profession is not available.",
    });
  }
}

async function loadPublishedWorkflow(
  supabase: DbClient,
  tenantId: string,
  workflowId: string
) {
  const { data, error } = await supabase
    .from("onboarding_flows")
    .select("id, tenant_id, name, status, employment_type")
    .eq("id", workflowId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new WorkflowMappingError("Workflow not found.", "WORKFLOW_NOT_FOUND");
  return data;
}

export async function saveWorkflowMapping(
  supabase: DbClient,
  tenantId: string,
  actorUserId: string,
  input: WorkflowMappingInput
): Promise<WorkflowMappingListItem> {
  if (!input.employmentType || !input.workflowId) {
    throw new WorkflowMappingError("Employment type and a workflow are required.", "INVALID_INPUT", {
      employmentType: "Employment type is required.",
      workflowId: "Published workflow is required.",
    });
  }

  await assertTenantProfession(supabase, tenantId, input.professionId ?? null);

  const workflow = await loadPublishedWorkflow(supabase, tenantId, input.workflowId);
  if (workflow.status !== "published") {
    throw new WorkflowMappingError("Only published workflows can be mapped.", "WORKFLOW_NOT_PUBLISHED", {
      workflowId: "Select a published workflow.",
    });
  }

  const workflowEmploymentType =
    (workflow as { employment_type?: string | null }).employment_type ?? null;
  const compatibilityError = validateWorkflowCompatibility(input, {
    id: String(workflow.id),
    tenantId: String(workflow.tenant_id),
    name: String(workflow.name),
    status: String(workflow.status),
    employmentType: workflowEmploymentType,
  });
  if (compatibilityError) {
    throw new WorkflowMappingError(compatibilityError, "INCOMPATIBLE_WORKFLOW", {
      workflowId: compatibilityError,
    });
  }

  const row = {
    tenant_id: tenantId,
    profession_id: input.professionId ?? null,
    specialty_id: input.specialtyId ?? null,
    employment_type: input.employmentType,
    location: cleanText(input.location),
    location_type: cleanText(input.locationType),
    years_of_experience: cleanText(input.yearsOfExperience),
    workflow_id: input.workflowId,
    is_active: input.isActive ?? true,
    priority: input.priority ?? 100,
    updated_by: actorUserId,
  };

  const query = input.id
    ? supabase
        .from("workflow_mappings")
        .update(row)
        .eq("id", input.id)
        .eq("tenant_id", tenantId)
    : supabase.from("workflow_mappings").insert({ ...row, created_by: actorUserId });

  const { data, error } = await query.select(MAPPING_SELECT).single();
  if (error) {
    if (error.code === "23505") {
      throw new WorkflowMappingError(
        "An active mapping already exists for these criteria.",
        "DUPLICATE_MAPPING"
      );
    }
    throw error;
  }

  return toListItem(data as Record<string, unknown>);
}

export async function deleteWorkflowMapping(
  supabase: DbClient,
  tenantId: string,
  mappingId: string
): Promise<{ deleted: boolean; deactivated: boolean }> {
  const { data: mapping, error: loadError } = await supabase
    .from("workflow_mappings")
    .select("id, workflow_id")
    .eq("id", mappingId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!mapping) throw new WorkflowMappingError("Mapping not found.", "NOT_FOUND");

  let referencedJobCount = 0;
  const { count, error: countError } = await supabase
    .from("job_requisitions")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("workflow_id", mapping.workflow_id)
    .neq("status", "archived");

  if (countError) {
    const message = countError.message.toLowerCase();
    if (!message.includes("workflow_id") && !message.includes("does not exist")) {
      throw countError;
    }
  } else {
    referencedJobCount = count ?? 0;
  }

  if (referencedJobCount > 0) {
    const { error: deactivateError } = await supabase
      .from("workflow_mappings")
      .update({ is_active: false })
      .eq("id", mappingId)
      .eq("tenant_id", tenantId);
    if (deactivateError) throw deactivateError;
    return { deleted: false, deactivated: true };
  }

  const { error: deleteError } = await supabase
    .from("workflow_mappings")
    .delete()
    .eq("id", mappingId)
    .eq("tenant_id", tenantId);
  if (deleteError) throw deleteError;
  return { deleted: true, deactivated: false };
}

export async function listPublishedWorkflowOptions(
  supabase: DbClient,
  tenantId: string,
  filters?: { employmentType?: string }
) {
  const { data, error } = await supabase
    .from("onboarding_flows")
    .select("id, name, status, employment_type")
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []).filter((row) => {
    if (!filters?.employmentType) return true;
    const workflowEmployment = (row as { employment_type?: string | null }).employment_type ?? null;
    if (!workflowEmployment) return true;
    if (filters.employmentType === "W2") {
      return workflowEmployment !== "1099" && !isRnrEmploymentType(workflowEmployment);
    }
    if (filters.employmentType === "1099") {
      return workflowEmployment !== "W2" && !isRnrEmploymentType(workflowEmployment);
    }
    if (isRnrEmploymentType(filters.employmentType)) {
      return isRnrEmploymentType(workflowEmployment);
    }
    return workflowEmployment === filters.employmentType;
  });
}

/**
 * Ensure employment-type default mappings exist for W2 / 1099 / Contract (RNR)
 * pointing at the tenant's default published flows when present.
 */
export async function ensureEmploymentTypeDefaultMappings(
  supabase: DbClient,
  tenantId: string,
  actorUserId?: string | null
): Promise<void> {
  const defaults: Array<{
    employmentType: "W2" | "1099" | "Contract";
    flowNames: string[];
  }> = [
    { employmentType: "W2", flowNames: ["W2 Employee Workflow"] },
    { employmentType: "1099", flowNames: ["1099 Contractor Workflow"] },
    { employmentType: "Contract", flowNames: ["RNR Worker Workflow", "R&R Workflow"] },
  ];

  const { data: flows, error: flowsError } = await supabase
    .from("onboarding_flows")
    .select("id, name, status")
    .eq("tenant_id", tenantId)
    .eq("status", "published");
  if (flowsError) throw flowsError;

  const byName = new Map(
    (flows ?? []).map((flow) => [String(flow.name).trim().toLowerCase(), String(flow.id)])
  );

  for (const item of defaults) {
    const workflowId = item.flowNames
      .map((name) => byName.get(name.toLowerCase()))
      .find((id): id is string => Boolean(id));
    if (!workflowId) continue;

    const employmentTypesToCheck = isRnrEmploymentType(item.employmentType)
      ? (["Contract", "RNR"] as const)
      : ([item.employmentType] as const);

    let existingId: string | null = null;
    for (const employmentType of employmentTypesToCheck) {
      const { data: existing, error: existingError } = await supabase
        .from("workflow_mappings")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("employment_type", employmentType)
        .is("profession_id", null)
        .is("specialty_id", null)
        .is("location", null)
        .is("location_type", null)
        .is("years_of_experience", null)
        .eq("is_active", true)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing?.id) {
        existingId = String(existing.id);
        break;
      }
    }
    if (existingId) continue;

    const { error: insertError } = await supabase.from("workflow_mappings").insert({
      tenant_id: tenantId,
      profession_id: null,
      specialty_id: null,
      employment_type: item.employmentType,
      location: null,
      location_type: null,
      years_of_experience: null,
      workflow_id: workflowId,
      is_active: true,
      priority: 1000,
      created_by: actorUserId ?? null,
      updated_by: actorUserId ?? null,
    });
    if (insertError && insertError.code !== "23505") throw insertError;
  }
}

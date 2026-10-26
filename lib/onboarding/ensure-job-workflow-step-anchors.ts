import type { OnboardingStepDraft } from "@/lib/onboarding/default-onboarding-steps";
import { invalidateTenantCache } from "@/lib/cache";
import type { OnboardingDbClient } from "@/lib/onboarding/load-tenant-config";
import { unmatchedJobWorkflowDrafts } from "@/lib/onboarding/load-config-for-job-workflow";
import type { TenantOnboardingConfig, TenantOnboardingStep } from "@/lib/onboarding/types";

/** Marks a tenant step that exists only so a job-workflow step can store progress. */
export const JOB_WORKFLOW_CATALOG_ANCHOR = "catalog_anchor";

const ANCHOR_SORT_FLOOR = 300_000;
const STEP_SELECT =
  "id, step_key, title, description, step_type, sort_order, is_required, is_enabled, metadata";

type DbError = { code?: string; message?: string; details?: string } | null;

function uniqueViolationTarget(error: DbError): "step_key" | "sort_order" | "other" | null {
  if (error?.code !== "23505") return null;
  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  if (text.includes("step_key")) return "step_key";
  if (text.includes("sort_order")) return "sort_order";
  return "other";
}

function nextAnchorSort(used: Set<number>): number {
  let sort = ANCHOR_SORT_FLOOR;
  for (const value of used) {
    if (value >= sort) sort = value + 10;
  }
  while (used.has(sort)) sort += 10;
  used.add(sort);
  return sort;
}

function mapStep(row: Record<string, unknown>): TenantOnboardingStep {
  return {
    id: String(row.id),
    step_key: String(row.step_key),
    title: String(row.title),
    description: row.description != null ? String(row.description) : null,
    step_type: row.step_type as TenantOnboardingStep["step_type"],
    sort_order: Number(row.sort_order),
    is_required: Boolean(row.is_required),
    is_enabled: Boolean(row.is_enabled),
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
  };
}

export function tenantStepToAnchorDraft(step: TenantOnboardingStep): OnboardingStepDraft {
  return {
    step_key: step.step_key,
    title: step.title,
    description: step.description ?? "",
    step_type: step.step_type,
    sort_order: step.sort_order,
    is_required: step.is_required,
    is_enabled: true,
    metadata: step.metadata ?? {},
    required_documents: [],
  };
}

async function readAnchorByKey(
  supabase: OnboardingDbClient,
  configId: string,
  stepKey: string
): Promise<TenantOnboardingStep | null> {
  const { data, error } = await supabase
    .from("tenant_onboarding_steps")
    .select(STEP_SELECT)
    .eq("onboarding_config_id", configId)
    .eq("step_key", stepKey)
    .maybeSingle();
  if (error) throw error;
  return data ? mapStep(data as Record<string, unknown>) : null;
}

async function insertAnchor(
  supabase: OnboardingDbClient,
  published: TenantOnboardingConfig,
  draft: OnboardingStepDraft,
  usedSorts: Set<number>
): Promise<TenantOnboardingStep> {
  const metadata = {
    ...(draft.metadata ?? {}),
    [JOB_WORKFLOW_CATALOG_ANCHOR]: true,
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const sortOrder = nextAnchorSort(usedSorts);
    const payload = {
      onboarding_config_id: published.configId,
      tenant_id: published.tenantId,
      step_key: draft.step_key,
      title: draft.title.trim() || draft.step_key,
      description: draft.description?.trim() || null,
      step_type: draft.step_type,
      sort_order: sortOrder,
      is_required: draft.is_required,
      is_enabled: false,
      metadata,
    };

    const { data, error } = await supabase
      .from("tenant_onboarding_steps")
      .insert(payload)
      .select(STEP_SELECT)
      .single();

    if (!error && data) return mapStep(data as Record<string, unknown>);

    const violation = uniqueViolationTarget(error);
    if (violation === "sort_order") continue;
    if (violation === "step_key" || violation === "other") {
      const existing = await readAnchorByKey(supabase, published.configId, draft.step_key);
      if (existing) return existing;
    }
    throw error ?? new Error(`Could not store onboarding step ${draft.step_key}`);
  }

  throw new Error(`Could not store onboarding step ${draft.step_key}`);
}

/**
 * Job workflows can include steps that were never published into the tenant catalog.
 * Those steps are shown with preview-* ids, which cannot be written to progress.
 * Insert a disabled catalog row so the same step keeps a real id across requests
 * without adding it to the tenant's default applicant flow.
 */
export async function ensureJobWorkflowStepAnchors(
  supabase: OnboardingDbClient,
  published: TenantOnboardingConfig,
  drafts: OnboardingStepDraft[]
): Promise<TenantOnboardingConfig> {
  const missing = unmatchedJobWorkflowDrafts(published.steps, drafts);
  if (!missing.length) return published;

  const usedSorts = new Set(published.steps.map((step) => step.sort_order));
  const created: TenantOnboardingStep[] = [];
  for (const draft of missing) {
    created.push(await insertAnchor(supabase, published, draft, usedSorts));
  }

  await Promise.all([
    invalidateTenantCache("tenant_onboarding_configs", published.tenantId),
    invalidateTenantCache("tenant_onboarding_steps", published.tenantId),
  ]);

  const realSteps = published.steps.filter((step) => !step.id.startsWith("preview-"));
  return { ...published, steps: [...realSteps, ...created] };
}

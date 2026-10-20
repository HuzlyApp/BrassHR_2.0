import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenantOnboardingStep } from "@/lib/onboarding/types";
import { readStepLifecyclePhase } from "@/lib/onboarding/workflow-phase";

/**
 * Step types a candidate completes once per hire. Re-publishing a workflow gives these nodes
 * new tenant steps; the candidate's answer on the replaced step still applies to the new one.
 * Repeatable types (document uploads, eSign packets, custom forms) can collect something else
 * after an edit, so they are never carried over.
 */
const CARRY_OVER_STEP_TYPES = new Set([
  "resume-basic-profile",
  "references-collection",
  "collect-references",
  "skill-qualification-assessment",
  "background-check",
  "drug-test-screening",
  "oig-exclusion-check",
  "reference-verification",
  "ssn-identity-verification",
  "direct-deposit-setup",
  "benefits-enrollment",
  "tax-forms",
  "offer-acceptance",
]);

export const REPLACED_STEP_DATA_KEY = "replaced_step_id";

export type CarryOverStep = {
  id: string;
  is_enabled: boolean;
  metadata: Record<string, unknown> | null;
};

export type CarryOverRow = {
  id?: string | null;
  worker_onboarding_progress_id: string | null;
  onboarding_step_id: string;
  worker_id?: string | null;
  tenant_id?: string | null;
  status: string | null;
  completed_at: string | null;
  updated_at?: string | null;
  application_id?: string | null;
  data: Record<string, unknown> | null;
};

export type CarryOverWrite = {
  progressId: string;
  targetStepId: string;
  targetRowId: string | null;
  donorStepId: string;
  workerId: string | null;
  tenantId: string | null;
  completedAt: string | null;
  applicationId: string | null;
  data: Record<string, unknown>;
};

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function stepTypeOf(step: CarryOverStep): string | null {
  return asText(step.metadata?.workflow_step_id)?.toLowerCase() ?? null;
}

function phaseOf(step: CarryOverStep): string {
  return readStepLifecyclePhase({ metadata: step.metadata ?? {} } as TenantOnboardingStep);
}

function hasData(data: Record<string, unknown> | null): boolean {
  return Object.values(data ?? {}).some((value) => value !== null && value !== undefined && value !== "");
}

function rowTime(row: CarryOverRow): number {
  const parsed = Date.parse(row.completed_at ?? row.updated_at ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * For each enabled step whose candidate row is still untouched, finds a completed row on a
 * disabled step of the same type and phase in the same progress record (same application).
 */
export function planReplacedStepCarryOver(params: {
  steps: CarryOverStep[];
  rows: CarryOverRow[];
}): CarryOverWrite[] {
  const groupKey = (step: CarryOverStep) => `${stepTypeOf(step)}::${phaseOf(step)}`;
  const enabledStepIds = new Set(params.steps.filter((step) => step.is_enabled).map((step) => step.id));
  const enabledByGroup = new Map<string, CarryOverStep[]>();
  const disabledGroupByStepId = new Map<string, string>();
  for (const step of params.steps) {
    const type = stepTypeOf(step);
    if (!type || !CARRY_OVER_STEP_TYPES.has(type)) continue;
    const key = groupKey(step);
    if (step.is_enabled) enabledByGroup.set(key, [...(enabledByGroup.get(key) ?? []), step]);
    else disabledGroupByStepId.set(step.id, key);
  }

  const rowsByProgress = new Map<string, CarryOverRow[]>();
  for (const row of params.rows) {
    const progressId = asText(row.worker_onboarding_progress_id);
    if (!progressId) continue;
    rowsByProgress.set(progressId, [...(rowsByProgress.get(progressId) ?? []), row]);
  }

  const writes: CarryOverWrite[] = [];
  for (const [key, enabled] of enabledByGroup) {
    if (enabled.length !== 1) continue;
    const target = enabled[0]!;
    for (const [progressId, rows] of rowsByProgress) {
      const targetRow = rows.find((row) => row.onboarding_step_id === target.id) ?? null;
      if (targetRow) {
        const untouched =
          (targetRow.status === "pending" || targetRow.status === "in_progress") &&
          !hasData(targetRow.data);
        if (!untouched) continue;
      } else if (!rows.some((row) => enabledStepIds.has(row.onboarding_step_id))) {
        // Progress records left behind by older workflows don't get rows for current steps.
        continue;
      }
      const donor = rows
        .filter(
          (row) =>
            row.status === "completed" && disabledGroupByStepId.get(row.onboarding_step_id) === key
        )
        .sort((a, b) => rowTime(b) - rowTime(a))[0];
      if (!donor) continue;
      writes.push({
        progressId,
        targetStepId: target.id,
        targetRowId: asText(targetRow?.id),
        donorStepId: donor.onboarding_step_id,
        workerId: asText(donor.worker_id),
        tenantId: asText(donor.tenant_id),
        completedAt: donor.completed_at ?? donor.updated_at ?? null,
        applicationId: asText(targetRow?.application_id) ?? asText(donor.application_id),
        data: { ...(donor.data ?? {}), [REPLACED_STEP_DATA_KEY]: donor.onboarding_step_id },
      });
    }
  }
  return writes;
}

/**
 * Moves a candidate's completed answers from replaced (disabled) steps onto the current steps,
 * so the portal and the Hire Journey read the same completion. Idempotent: carried rows are no
 * longer untouched.
 */
export async function carryOverReplacedStepProgress(
  supabase: SupabaseClient,
  params: { tenantId: string; workerId: string; progressId?: string | null }
): Promise<number> {
  let rowsQuery = supabase
    .from("worker_onboarding_step_progress")
    .select(
      "id, worker_onboarding_progress_id, onboarding_step_id, worker_id, tenant_id, status, completed_at, updated_at, application_id, data"
    )
    .eq("tenant_id", params.tenantId)
    .eq("worker_id", params.workerId);
  if (params.progressId) rowsQuery = rowsQuery.eq("worker_onboarding_progress_id", params.progressId);
  const { data: rows, error: rowsError } = await rowsQuery;
  if (rowsError) throw rowsError;
  const progressRows = (rows ?? []) as CarryOverRow[];
  if (!progressRows.some((row) => row.status === "completed")) return 0;

  const stepIds = [...new Set(progressRows.map((row) => row.onboarding_step_id))];
  const { data: rowSteps, error: rowStepsError } = await supabase
    .from("tenant_onboarding_steps")
    .select("id, is_enabled, metadata")
    .in("id", stepIds);
  if (rowStepsError) throw rowStepsError;
  const disabledTypes = new Set(
    ((rowSteps ?? []) as CarryOverStep[])
      .filter((step) => !step.is_enabled)
      .map(stepTypeOf)
      .filter((type): type is string => Boolean(type && CARRY_OVER_STEP_TYPES.has(type)))
  );
  if (!disabledTypes.size) return 0;

  const { data: enabledSteps, error: enabledError } = await supabase
    .from("tenant_onboarding_steps")
    .select("id, is_enabled, metadata")
    .eq("tenant_id", params.tenantId)
    .eq("is_enabled", true)
    .in("metadata->>workflow_step_id", [...disabledTypes]);
  if (enabledError) throw enabledError;

  const steps = new Map<string, CarryOverStep>();
  for (const step of [...((rowSteps ?? []) as CarryOverStep[]), ...((enabledSteps ?? []) as CarryOverStep[])]) {
    steps.set(step.id, step);
  }
  const writes = planReplacedStepCarryOver({ steps: [...steps.values()], rows: progressRows });

  let applied = 0;
  for (const write of writes) {
    const values = {
      status: "completed",
      completed_at: write.completedAt,
      data: write.data,
      ...(write.applicationId ? { application_id: write.applicationId } : {}),
    };
    if (write.targetRowId) {
      const { error } = await supabase
        .from("worker_onboarding_step_progress")
        .update(values)
        .eq("id", write.targetRowId)
        .in("status", ["pending", "in_progress"]);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("worker_onboarding_step_progress").insert({
        ...values,
        worker_onboarding_progress_id: write.progressId,
        onboarding_step_id: write.targetStepId,
        worker_id: write.workerId ?? params.workerId,
        tenant_id: write.tenantId ?? params.tenantId,
      });
      if (error && error.code !== "23505") throw error;
    }
    applied += 1;
  }
  return applied;
}

export async function carryOverReplacedStepProgressSafely(
  supabase: SupabaseClient,
  params: { tenantId: string; workerId: string; progressId?: string | null }
): Promise<void> {
  try {
    await carryOverReplacedStepProgress(supabase, params);
  } catch (error) {
    console.error("[replaced-step-progress] carry-over failed", {
      workerId: params.workerId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

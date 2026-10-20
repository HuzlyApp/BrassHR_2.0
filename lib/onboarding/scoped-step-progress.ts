import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProgressRowInput } from "@/lib/onboarding/assigned-workflow-steps";
import { carryOverReplacedStepProgressSafely } from "@/lib/onboarding/replaced-step-progress";

export type ScopedProgressRow = ProgressRowInput & {
  worker_onboarding_progress_id?: string | null;
};

export const SCOPED_STEP_PROGRESS_SELECT =
  "onboarding_step_id, status, completed_at, created_at, updated_at, data, worker_onboarding_progress_id";

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function rowTime(row: ProgressRowInput): number {
  const parsed = Date.parse(row.updated_at ?? row.completed_at ?? row.created_at ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * A worker can hold one progress record per application, each with its own row per step.
 * Rows from the application's progress records win; other rows only fill gaps.
 * Within a group the most recently updated row wins.
 */
export function pickStepProgressRows(
  rows: ScopedProgressRow[],
  scopedProgressIds: ReadonlySet<string>
): Map<string, ProgressRowInput> {
  const scoped = new Map<string, ProgressRowInput>();
  const fallback = new Map<string, ProgressRowInput>();
  for (const row of rows) {
    const stepId = asText(row.onboarding_step_id);
    if (!stepId) continue;
    const progressId = asText(row.worker_onboarding_progress_id);
    const target = progressId && scopedProgressIds.has(progressId) ? scoped : fallback;
    const current = target.get(stepId);
    if (!current || rowTime(row) >= rowTime(current)) target.set(stepId, row);
  }
  for (const [stepId, row] of fallback) {
    if (!scoped.has(stepId)) scoped.set(stepId, row);
  }
  return scoped;
}

export async function loadApplicationProgressIds(
  supabase: SupabaseClient,
  params: { tenantId: string; workerId: string; applicationId: string | null }
): Promise<Set<string>> {
  if (!params.applicationId) return new Set();
  const { data, error } = await supabase
    .from("worker_onboarding_progress")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("worker_id", params.workerId)
    .eq("application_id", params.applicationId);
  if (error) throw error;
  return new Set(((data ?? []) as Array<{ id?: string }>).map((row) => String(row.id ?? "")).filter(Boolean));
}

export async function loadScopedStepProgress(
  supabase: SupabaseClient,
  params: { tenantId: string; workerId: string; applicationId: string | null }
): Promise<Map<string, ProgressRowInput>> {
  await carryOverReplacedStepProgressSafely(supabase, {
    tenantId: params.tenantId,
    workerId: params.workerId,
  });
  const [rowsRes, progressIds] = await Promise.all([
    supabase
      .from("worker_onboarding_step_progress")
      .select(SCOPED_STEP_PROGRESS_SELECT)
      .eq("tenant_id", params.tenantId)
      .eq("worker_id", params.workerId),
    loadApplicationProgressIds(supabase, params),
  ]);
  if (rowsRes.error) throw rowsRes.error;
  return pickStepProgressRows((rowsRes.data ?? []) as ScopedProgressRow[], progressIds);
}

/** Application that owns an applicant workflow instance (column first, then back-reference). */
export async function resolveInstanceApplicationId(
  supabase: SupabaseClient,
  params: { tenantId: string; instanceId: string; instanceApplicationId?: string | null }
): Promise<string | null> {
  const direct = asText(params.instanceApplicationId);
  if (direct) return direct;
  const { data, error } = await supabase
    .from("job_applications")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("applicant_workflow_instance_id", params.instanceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return asText((data as { id?: string } | null)?.id);
}

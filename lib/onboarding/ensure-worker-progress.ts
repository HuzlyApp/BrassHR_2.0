import type { SupabaseClient } from "@supabase/supabase-js";
import type { StepProgressRow, WorkerOnboardingProgressPayload } from "@/lib/onboarding/types";
import { loadTenantOnboardingConfig } from "@/lib/onboarding/load-tenant-config";
import { backfillFarthestReachedStepIndex } from "@/lib/onboarding/persist-farthest-reached-step";
import type { ProgressRowInput } from "@/lib/onboarding/assigned-workflow-steps";
import { syncStaffStepDecisionsIntoProgress } from "@/lib/onboarding/staff-step-record-sync";
import { carryOverReplacedStepProgressSafely } from "@/lib/onboarding/replaced-step-progress";

function normalizeApplicationId(value?: string | null): string {
  return typeof value === "string" ? value.trim() : "";
}

const PROGRESS_SELECT =
  "id, status, submitted_at, submitted_with_incomplete_steps, incomplete_step_keys, farthest_reached_step_index, application_id, updated_at, started_at";

async function loadLatestWorkerProgress(
  supabase: SupabaseClient,
  workerId: string,
  configId: string,
  applicationId: string,
  unscopedOnly: boolean
) {
  // This table has started_at / updated_at, not created_at.
  let query = supabase
    .from("worker_onboarding_progress")
    .select(PROGRESS_SELECT)
    .eq("worker_id", workerId)
    .eq("onboarding_config_id", configId);

  if (applicationId) {
    const { data, error } = await query.eq("application_id", applicationId).limit(1).maybeSingle();
    if (error) throw error;
    return data ?? null;
  }

  if (unscopedOnly) {
    query = query.is("application_id", null);
  }

  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

/**
 * `unscopedOnly`: without an applicationId, ignore progress owned by other job applications
 * (job-link sessions must not inherit another job's step statuses).
 *
 * Not request-cached. Callers that save a step and then reload progress in the same
 * request must see the row they just wrote.
 */
export async function ensureWorkerOnboardingProgress(
  supabase: SupabaseClient,
  workerId: string,
  tenantId: string,
  applicationId?: string | null,
  unscopedOnly = false
): Promise<WorkerOnboardingProgressPayload> {
  const config = await loadTenantOnboardingConfig(supabase, tenantId, { workerFacing: true });
  if (!config) {
    throw new Error("No active onboarding configuration for tenant");
  }

  const scopedApplicationId = normalizeApplicationId(applicationId);
  const existing = await loadLatestWorkerProgress(
    supabase,
    workerId,
    config.configId,
    scopedApplicationId,
    unscopedOnly
  );

  let progressId = existing?.id ? String(existing.id) : null;
  let status = existing?.status ? String(existing.status) : "in_progress";

  if (!progressId) {
    const insertPayload: Record<string, unknown> = {
      worker_id: workerId,
      tenant_id: tenantId,
      onboarding_config_id: config.configId,
      status: "in_progress",
    };
    if (scopedApplicationId) insertPayload.application_id = scopedApplicationId;

    const { data: inserted, error: insErr } = await supabase
      .from("worker_onboarding_progress")
      .insert(insertPayload)
      .select("id, status")
      .single();

    if (insErr) {
      if (insErr.code === "23505") {
        const raced = await loadLatestWorkerProgress(
          supabase,
          workerId,
          config.configId,
          scopedApplicationId,
          unscopedOnly
        );
        if (!raced?.id) throw insErr;
        progressId = String(raced.id);
        status = String(raced.status ?? "in_progress");
      } else {
        throw insErr;
      }
    } else {
      progressId = String(inserted.id);
      status = String(inserted.status);
    }
  }

  const enabledSteps = config.steps.filter((s) => s.is_enabled);
  const stepKeyById = new Map(config.steps.map((s) => [s.id, s.step_key]));

  const { data: stepRows, error: srErr } = await supabase
    .from("worker_onboarding_step_progress")
    .select("onboarding_step_id, status, completed_at, data")
    .eq("worker_onboarding_progress_id", progressId);

  if (srErr) throw srErr;

  const existingStepIds = new Set((stepRows ?? []).map((r) => String(r.onboarding_step_id)));
  const missing = enabledSteps.filter((s) => !existingStepIds.has(s.id));

  if (missing.length) {
    const { error: bulkErr } = await supabase.from("worker_onboarding_step_progress").insert(
      missing.map((s) => ({
        worker_onboarding_progress_id: progressId,
        worker_id: workerId,
        tenant_id: tenantId,
        onboarding_step_id: s.id,
        status: "pending",
        ...(scopedApplicationId ? { application_id: scopedApplicationId } : {}),
      }))
    );
    if (bulkErr) throw bulkErr;
  }

  await carryOverReplacedStepProgressSafely(supabase, { tenantId, workerId, progressId });

  // Not limited to enabled steps: job workflows record progress on steps that a later
  // publish of another flow disabled, and the applicant stepper resolves them by id.
  const { data: allSteps, error: allErr } = await supabase
    .from("worker_onboarding_step_progress")
    .select("onboarding_step_id, status, completed_at, updated_at, data")
    .eq("worker_onboarding_progress_id", progressId);

  if (allErr) throw allErr;

  const storedSteps: StepProgressRow[] = (allSteps ?? []).map((r) => {
    const stepId = String(r.onboarding_step_id);
    return {
      onboarding_step_id: stepId,
      step_key: stepKeyById.get(stepId) ?? null,
      status: r.status as StepProgressRow["status"],
      completed_at: r.completed_at != null ? String(r.completed_at) : null,
      data: (r.data as Record<string, unknown>) ?? {},
    };
  });

  let steps = storedSteps;
  try {
    steps = await syncStaffStepDecisionsIntoProgress(supabase, {
      tenantId,
      workerId,
      applicationId: scopedApplicationId || null,
      progressId: progressId!,
      tenantSteps: config.steps,
      steps: storedSteps,
      progressRows: (allSteps ?? []) as ProgressRowInput[],
    });
  } catch (error) {
    console.error("[ensure-worker-progress] staff step sync failed", {
      workerId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  const persistedFarthest = Number(existing?.farthest_reached_step_index ?? 1);
  const payloadWithoutFarthest: WorkerOnboardingProgressPayload = {
    progressId: progressId!,
    status,
    steps,
    applicationId: existing?.application_id
      ? String(existing.application_id)
      : scopedApplicationId || null,
    farthestReachedStepIndex: persistedFarthest,
    submittedAt: existing?.submitted_at != null ? String(existing.submitted_at) : null,
    submittedWithIncompleteSteps: Boolean(existing?.submitted_with_incomplete_steps),
    incompleteStepKeys: Array.isArray(existing?.incomplete_step_keys)
      ? (existing.incomplete_step_keys as string[])
      : [],
  };

  const farthestReachedStepIndex = await backfillFarthestReachedStepIndex(
    supabase,
    progressId!,
    config,
    payloadWithoutFarthest
  );

  return {
    ...payloadWithoutFarthest,
    farthestReachedStepIndex,
  };
}

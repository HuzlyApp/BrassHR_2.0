import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ASSIGNED_STEP_RECORD_COLUMNS,
  isStaffOwnedAssignedRecord,
  mapAssignedStepRecords,
  toAssignedStepRecordInput,
  type ProgressRowInput,
} from "@/lib/onboarding/assigned-workflow-steps";
import type { StepProgressRow, TenantOnboardingStep } from "@/lib/onboarding/types";

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export type StaffStepStatusOverride = {
  tenantStepId: string;
  status: StepProgressRow["status"];
  completedAt: string | null;
};

/**
 * Staff decisions (stored on the step record) for tenant steps whose progress row disagrees,
 * e.g. after a re-publish linked the record to a fresh "pending" progress row.
 */
export function computeStaffStepStatusOverrides(params: {
  records: Array<Record<string, unknown>>;
  tenantSteps: TenantOnboardingStep[];
  progressByStepId: Map<string, ProgressRowInput>;
}): StaffStepStatusOverride[] {
  const records = params.records.map(toAssignedStepRecordInput);
  if (!records.some((record) => record.status_changed_at && isStaffOwnedAssignedRecord(record))) {
    return [];
  }
  const decided = new Set(
    records
      .filter((record) => record.status_changed_at && isStaffOwnedAssignedRecord(record))
      .map((record) => record.id)
  );
  const mapped = mapAssignedStepRecords({
    records,
    tenantSteps: params.tenantSteps,
    progressByStepId: params.progressByStepId,
  });
  const overrides: StaffStepStatusOverride[] = [];
  for (const step of mapped) {
    if (!step.tenantStepId || !decided.has(step.id)) continue;
    const current = asText(params.progressByStepId.get(step.tenantStepId)?.status) ?? "pending";
    if (current === step.status) continue;
    overrides.push({ tenantStepId: step.tenantStepId, status: step.status, completedAt: step.completedAt });
  }
  return overrides;
}

async function loadWorkerInstanceRecords(
  supabase: SupabaseClient,
  params: { tenantId: string; workerId: string; applicationId: string | null }
): Promise<Array<Record<string, unknown>>> {
  const { data: instances, error } = await supabase
    .from("applicant_workflow_instances")
    .select("id, application_id, status, assignment_state, created_at")
    .eq("tenant_id", params.tenantId)
    .eq("worker_id", params.workerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (instances ?? []) as Array<Record<string, unknown>>;
  if (!rows.length) return [];

  let instance =
    (params.applicationId
      ? rows.find((row) => asText(row.application_id) === params.applicationId)
      : null) ?? null;
  if (!instance && params.applicationId) {
    const { data: app, error: appError } = await supabase
      .from("job_applications")
      .select("applicant_workflow_instance_id")
      .eq("tenant_id", params.tenantId)
      .eq("id", params.applicationId)
      .maybeSingle();
    if (appError) throw appError;
    const linkedId = asText((app as { applicant_workflow_instance_id?: string } | null)?.applicant_workflow_instance_id);
    instance = rows.find((row) => asText(row.id) === linkedId) ?? null;
  }
  instance ??=
    rows.find((row) => asText(row.assignment_state ?? row.status) === "active") ?? rows[0];

  const { data: records, error: recordsError } = await supabase
    .from("applicant_workflow_step_records")
    .select(ASSIGNED_STEP_RECORD_COLUMNS)
    .eq("tenant_id", params.tenantId)
    .eq("workflow_instance_id", String(instance.id))
    .order("position", { ascending: true });
  if (recordsError) throw recordsError;
  return (records ?? []) as Array<Record<string, unknown>>;
}

/**
 * Applies staff decisions from the candidate's workflow step records to their progress rows
 * (in memory and persisted), so candidate gating agrees with the Hire Journey.
 */
export async function syncStaffStepDecisionsIntoProgress(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    workerId: string;
    applicationId: string | null;
    progressId: string;
    tenantSteps: TenantOnboardingStep[];
    steps: StepProgressRow[];
    progressRows: ProgressRowInput[];
  }
): Promise<StepProgressRow[]> {
  const records = await loadWorkerInstanceRecords(supabase, params);
  if (!records.length) return params.steps;

  const progressByStepId = new Map<string, ProgressRowInput>();
  for (const row of params.progressRows) {
    const stepId = asText(row.onboarding_step_id);
    if (stepId) progressByStepId.set(stepId, row);
  }
  const overrides = computeStaffStepStatusOverrides({
    records,
    tenantSteps: params.tenantSteps,
    progressByStepId,
  });
  if (!overrides.length) return params.steps;

  const byStepId = new Map(overrides.map((override) => [override.tenantStepId, override]));
  await Promise.all(
    overrides.map(async (override) => {
      const { error } = await supabase
        .from("worker_onboarding_step_progress")
        .update({
          status: override.status,
          completed_at: override.status === "completed" ? override.completedAt : null,
          updated_at: new Date().toISOString(),
        })
        .eq("worker_onboarding_progress_id", params.progressId)
        .eq("onboarding_step_id", override.tenantStepId);
      if (error) {
        console.error("[staff-step-record-sync] progress sync failed", {
          tenantStepId: override.tenantStepId,
          reason: error.message,
        });
      }
    })
  );

  return params.steps.map((row) => {
    const override = byStepId.get(row.onboarding_step_id);
    return override
      ? {
          ...row,
          status: override.status,
          completed_at: override.status === "completed" ? override.completedAt : null,
        }
      : row;
  });
}

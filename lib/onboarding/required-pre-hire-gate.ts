import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAssignedStepPhase } from "@/lib/onboarding/assigned-workflow-steps";
import { ensureWorkerOnboardingProgress } from "@/lib/onboarding/ensure-worker-progress";
import { loadTenantOnboardingConfig } from "@/lib/onboarding/load-tenant-config";
import {
  areAllRequiredPreHireStepsComplete,
  type PreHireProgressStep,
} from "@/lib/onboarding/lock-post-hire";
import { evaluateWorkflowCompletion } from "@/lib/onboarding/workflow-completion-check";

type StepRecordRow = {
  snapshot_step_id?: string | null;
  title?: string | null;
  step_type?: string | null;
  is_required?: boolean | null;
  status?: string | null;
  phase?: string | null;
  settings?: Record<string, unknown> | null;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function recordToProgressStep(record: StepRecordRow): PreHireProgressStep {
  const settings = asObject(record.settings);
  const workflowStepId =
    typeof settings.workflow_step_id === "string" ? settings.workflow_step_id : null;
  return {
    snapshotStepId: workflowStepId || record.snapshot_step_id || null,
    stepKey: record.step_type ?? null,
    stepType: record.step_type ?? null,
    title: record.title ?? null,
    phase: parseAssignedStepPhase({
      phase: record.phase ?? null,
      settings,
    }),
    required: record.is_required !== false,
    displayStatus: record.status ?? null,
    status: record.status ?? null,
  };
}

async function resolveWorkflowInstanceId(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    workerId: string;
    applicationId?: string | null;
    workflowInstanceId?: string | null;
  }
): Promise<string | null> {
  const explicit = String(params.workflowInstanceId ?? "").trim();
  if (explicit) return explicit;

  const applicationId = String(params.applicationId ?? "").trim();
  if (applicationId) {
    const { data } = await supabase
      .from("job_applications")
      .select("applicant_workflow_instance_id")
      .eq("id", applicationId)
      .eq("tenant_id", params.tenantId)
      .maybeSingle();
    const linked = String(
      (data as { applicant_workflow_instance_id?: string | null } | null)?.applicant_workflow_instance_id ?? ""
    ).trim();
    if (linked) return linked;
  }

  const { data: instances } = await supabase
    .from("applicant_workflow_instances")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("worker_id", params.workerId)
    .order("created_at", { ascending: false })
    .limit(1);
  const latest = (instances ?? [])[0] as { id?: string } | undefined;
  return latest?.id ? String(latest.id) : null;
}

async function requiredCompleteFromTenantConfig(
  supabase: SupabaseClient,
  params: { tenantId: string; workerId: string; applicationId?: string | null }
): Promise<boolean> {
  const config = await loadTenantOnboardingConfig(supabase, params.tenantId);
  if (!config?.steps?.length) return false;
  const progress = await ensureWorkerOnboardingProgress(
    supabase,
    params.workerId,
    params.tenantId,
    params.applicationId ?? null
  );
  return evaluateWorkflowCompletion({ allSteps: config.steps, progress }).preHire.isComplete;
}

/**
 * True when the candidate's dynamic workflow has no remaining required Pre-Hire steps.
 * Assigned step records win. When none exist yet, the full tenant workflow is used,
 * including recruiter steps the candidate does not see.
 */
export async function requiredPreHireStepsComplete(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    workerId: string;
    applicationId?: string | null;
    workflowInstanceId?: string | null;
  }
): Promise<boolean> {
  try {
    const instanceId = await resolveWorkflowInstanceId(supabase, params);
    if (!instanceId) return requiredCompleteFromTenantConfig(supabase, params);

    const { data, error } = await supabase
      .from("applicant_workflow_step_records")
      .select("snapshot_step_id, title, step_type, is_required, status, phase, settings")
      .eq("tenant_id", params.tenantId)
      .eq("workflow_instance_id", instanceId);
    if (error) {
      console.error("[required-pre-hire-gate] step record lookup failed", error.message);
      return false;
    }
    const records = (data ?? []) as StepRecordRow[];
    if (!records.length) return requiredCompleteFromTenantConfig(supabase, params);
    return areAllRequiredPreHireStepsComplete(records.map(recordToProgressStep));
  } catch (error) {
    console.error("[required-pre-hire-gate] completion check failed", error);
    return false;
  }
}

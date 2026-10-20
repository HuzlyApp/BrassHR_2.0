import type { SupabaseClient } from "@supabase/supabase-js";
import {
  NON_NAVIGABLE_SYSTEM_COMPLETE_DATA,
  PARAMETERIZED_JOB_APPLICATION_WORKFLOW_STEP_ID,
} from "@/lib/onboarding/complete-non-navigable-step";
import { isParameterizedJobApplicationStepType } from "@/lib/onboarding/job-application-parameters";
import { ensureWorkerOnboardingProgress } from "@/lib/onboarding/ensure-worker-progress";
import { loadTenantOnboardingConfig } from "@/lib/onboarding/load-tenant-config";
import { getEnabledTenantSteps } from "@/lib/onboarding/tenant-step-navigation";
import { readStepLifecyclePhase } from "@/lib/onboarding/workflow-phase";
import type { OnboardingStepType, TenantOnboardingStep } from "@/lib/onboarding/types";

async function markEnabledStepCompleted(
  supabase: SupabaseClient,
  input: {
    workerId: string;
    tenantId: string;
    step: TenantOnboardingStep;
    applicationId?: string | null;
    configSteps?: TenantOnboardingStep[];
    data?: Record<string, unknown>;
  }
): Promise<void> {
  const progress = await ensureWorkerOnboardingProgress(
    supabase,
    input.workerId,
    input.tenantId,
    input.applicationId
  );

  const existing = progress.steps.find((row) => row.onboarding_step_id === input.step.id);
  if (existing?.status === "completed") return;

  const now = new Date().toISOString();
  const data = input.data ?? {};
  if (!existing) {
    const { error: insertErr } = await supabase.from("worker_onboarding_step_progress").insert({
      worker_onboarding_progress_id: progress.progressId,
      worker_id: input.workerId,
      tenant_id: input.tenantId,
      onboarding_step_id: input.step.id,
      status: "completed",
      completed_at: now,
      data,
    });
    if (insertErr && insertErr.code !== "23505") throw insertErr;
  }

  const { error: updateErr } = await supabase
    .from("worker_onboarding_step_progress")
    .update({
      status: "completed",
      completed_at: now,
      updated_at: now,
      data,
    })
    .eq("worker_onboarding_progress_id", progress.progressId)
    .eq("onboarding_step_id", input.step.id)
    .neq("status", "completed");

  if (updateErr) throw updateErr;

  if (input.configSteps?.length) {
    const stepIdx = input.configSteps.findIndex((s) => s.id === input.step.id || s.step_key === input.step.step_key);
    if (stepIdx >= 0) {
      await supabase
        .from("worker_onboarding_progress")
        .update({
          farthest_reached_step_index: Math.max(
            progress.farthestReachedStepIndex ?? 1,
            stepIdx + 2
          ),
          updated_at: now,
        })
        .eq("id", progress.progressId);
    }
  }
}

/**
 * Marks the first matching enabled tenant step as completed for a worker.
 * Used when a dedicated save API has already verified step requirements.
 */
export async function markTenantStepCompletedByType(
  supabase: SupabaseClient,
  input: {
    workerId: string;
    tenantId: string;
    stepType: OnboardingStepType;
    stepKey?: string;
  }
): Promise<void> {
  const config = await loadTenantOnboardingConfig(supabase, input.tenantId, {
    workerFacing: true,
  });
  if (!config) return;

  const enabled = getEnabledTenantSteps(config);
  const step =
    (input.stepKey
      ? enabled.find((s) => s.step_key === input.stepKey) ??
        enabled.find((s) => s.step_key.replace(/_\d+$/, "") === input.stepKey!.replace(/_\d+$/, ""))
      : null) ??
    enabled.find((s) => s.step_type === input.stepType) ??
    null;

  if (!step) return;

  await markEnabledStepCompleted(supabase, {
    workerId: input.workerId,
    tenantId: input.tenantId,
    step,
    configSteps: enabled,
  });
}

/**
 * Completes a builder-library placeholder (e.g. parameterized-job-application)
 * after its real submission path succeeds.
 */
export async function markTenantStepCompletedByWorkflowLibraryId(
  supabase: SupabaseClient,
  input: {
    workerId: string;
    tenantId: string;
    workflowStepId: string;
    applicationId?: string | null;
    jobToken?: string | null;
    data?: Record<string, unknown>;
  }
): Promise<void> {
  let config = await loadTenantOnboardingConfig(supabase, input.tenantId, {
    workerFacing: true,
  });

  if (input.jobToken) {
    try {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("slug")
        .eq("id", input.tenantId)
        .maybeSingle();
      const { loadApplicantConfigForJobToken } = await import(
        "@/lib/onboarding/load-config-for-job-workflow"
      );
      const jobConfig = await loadApplicantConfigForJobToken(
        supabase,
        tenant?.slug ?? null,
        input.jobToken
      );
      if (jobConfig.config?.steps?.length) {
        config = jobConfig.config;
      }
    } catch {
      // Keep tenant config
    }
  }

  if (!config) return;

  const enabled = getEnabledTenantSteps(config);
  const normalizedTarget = input.workflowStepId.trim().toLowerCase().replaceAll("_", "-");

  const step =
    enabled.find((s) => {
      const id = s.metadata?.workflow_step_id;
      if (typeof id === "string" && id.trim().toLowerCase().replaceAll("_", "-") === normalizedTarget) {
        return true;
      }
      const key = s.step_key?.toLowerCase().replaceAll("_", "-");
      if (key === normalizedTarget || key?.replace(/-\d+$/, "") === normalizedTarget) {
        return true;
      }
      if (s.id === input.workflowStepId) return true;
      if (
        normalizedTarget === "parameterized-job-application" &&
        (s.metadata?.workflow_step_id === "parameterized-job-application" ||
          s.step_key === "parameterized_job_application" ||
          (s.step_type === "profile_information" &&
            readStepLifecyclePhase(s) === "pre_hire" &&
            s.metadata?.workflow_step_id !== "direct-deposit-setup" &&
            !s.step_key?.includes("direct_deposit")))
      ) {
        return true;
      }
      return false;
    }) ?? null;

  if (!step) return;

  const completedAt = new Date().toISOString();
  await markEnabledStepCompleted(supabase, {
    workerId: input.workerId,
    tenantId: input.tenantId,
    applicationId: input.applicationId,
    step,
    configSteps: enabled,
    data: {
      ...NON_NAVIGABLE_SYSTEM_COMPLETE_DATA,
      ...(input.data ?? {}),
    },
  });

  await syncApplicantWorkflowStepRecordForLibraryId(supabase, {
    tenantId: input.tenantId,
    workerId: input.workerId,
    applicationId: input.applicationId ?? null,
    workflowStepId: input.workflowStepId,
    completedAt,
  });
}

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

async function syncApplicantWorkflowStepRecordForLibraryId(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    workerId: string;
    applicationId: string | null;
    workflowStepId: string;
    completedAt: string;
  }
): Promise<void> {
  const normalized = input.workflowStepId.trim().toLowerCase().replaceAll("_", "-");
  if (
    normalized !== PARAMETERIZED_JOB_APPLICATION_WORKFLOW_STEP_ID &&
    !isParameterizedJobApplicationStepType(normalized)
  ) {
    return;
  }

  const { data: instances, error: instanceError } = await supabase
    .from("applicant_workflow_instances")
    .select("id, application_id, status, assignment_state, created_at")
    .eq("tenant_id", input.tenantId)
    .eq("worker_id", input.workerId)
    .order("created_at", { ascending: false });
  if (instanceError) throw instanceError;
  const rows = (instances ?? []) as Array<Record<string, unknown>>;
  if (!rows.length) return;

  let instance =
    (input.applicationId
      ? rows.find((row) => asText(row.application_id) === input.applicationId)
      : null) ?? null;
  if (!instance && input.applicationId) {
    const { data: app } = await supabase
      .from("job_applications")
      .select("applicant_workflow_instance_id")
      .eq("tenant_id", input.tenantId)
      .eq("id", input.applicationId)
      .maybeSingle();
    const linkedId = asText(
      (app as { applicant_workflow_instance_id?: string } | null)?.applicant_workflow_instance_id
    );
    instance = rows.find((row) => asText(row.id) === linkedId) ?? null;
  }
  instance ??=
    rows.find((row) => asText(row.assignment_state ?? row.status) === "active") ?? rows[0];
  const instanceId = asText(instance?.id);
  if (!instanceId) return;

  const { data: records, error: recordsError } = await supabase
    .from("applicant_workflow_step_records")
    .select("id, step_type, status")
    .eq("tenant_id", input.tenantId)
    .eq("workflow_instance_id", instanceId)
    .order("position", { ascending: true });
  if (recordsError) throw recordsError;

  const target = ((records ?? []) as Array<{ id?: string; step_type?: string; status?: string }>).find(
    (row) => isParameterizedJobApplicationStepType(asText(row.step_type))
  );
  if (!target?.id || asText(target.status) === "completed") return;

  const { error: updateError } = await supabase
    .from("applicant_workflow_step_records")
    .update({
      status: "completed",
      completed_at: input.completedAt,
      updated_at: input.completedAt,
    })
    .eq("id", String(target.id))
    .eq("tenant_id", input.tenantId);
  if (updateError) throw updateError;
}

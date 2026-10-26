import type { SupabaseClient } from "@supabase/supabase-js";
import { isAuthoritativelyHired } from "@/lib/onboarding/lock-post-hire";
import { requiredPreHireStepsComplete } from "@/lib/onboarding/required-pre-hire-gate";
import { isTerminalApplicationStatus, parseApplicantLifecyclePhase, type ApplicantLifecyclePhase } from "@/lib/onboarding/workflow-phase";

export type CandidateApplicationPhaseRow = {
  status?: string | null;
  workflow_phase?: string | null;
  post_hire_activated_at?: string | null;
  post_hire_suspended_at?: string | null;
  hired_at?: string | null;
  hired_by?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

/**
 * Phase, suspend, and activation flags come from the hired application when
 * one exists. A newer application for another job must not overwrite them.
 */
export function resolveCandidateHireGate(applications: CandidateApplicationPhaseRow[]): {
  isHired: boolean;
  workflowPhase: ApplicantLifecyclePhase;
  postHireUnlockedAt: string | null;
  postHireSuspended: boolean;
  postHireUnlocked: boolean;
  postHireActivationFailed: boolean;
  hiredAt: string | null;
  hiredBy: string | null;
} {
  const primaryApp = applications[0] ?? null;
  const hiredApp = applications.find((row) => isAuthoritativelyHired(asText(row.status))) ?? null;
  const phaseSource = hiredApp ?? primaryApp;
  const isHired = Boolean(hiredApp);
  const workflowPhase = parseApplicantLifecyclePhase(phaseSource?.workflow_phase);
  const postHireUnlockedAt = asText(phaseSource?.post_hire_activated_at);
  const postHireSuspended = Boolean(asText(phaseSource?.post_hire_suspended_at));
  const postHireUnlocked =
    isHired && Boolean(postHireUnlockedAt) && !postHireSuspended && workflowPhase !== "pre_hire";
  const postHireActivationFailed = isHired && !postHireUnlockedAt && workflowPhase === "pre_hire";

  return {
    isHired,
    workflowPhase,
    postHireUnlockedAt,
    postHireSuspended,
    postHireUnlocked,
    postHireActivationFailed,
    hiredAt: asText(hiredApp?.hired_at) ?? (isHired ? asText(hiredApp?.updated_at) : null),
    hiredBy: asText(hiredApp?.hired_by),
  };
}

/**
 * Staff can open Post-Hire step records only after every required Pre-Hire
 * step in that application's dynamic workflow is finished.
 */
export async function canStaffAccessPostHireSteps(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    workerId: string;
    worker: {
      status?: unknown;
      converted_at?: unknown;
      converted_worker_id?: unknown;
      conversion_status?: unknown;
    };
  }
): Promise<boolean> {
  const { data } = await supabase
    .from("job_applications")
    .select("id, status, post_hire_suspended_at, applicant_workflow_instance_id, created_at")
    .eq("tenant_id", params.tenantId)
    .eq("worker_id", params.workerId)
    .order("created_at", { ascending: false });

  const applications = (data ?? []) as Array<{
    id?: string;
    status?: string | null;
    post_hire_suspended_at?: string | null;
    applicant_workflow_instance_id?: string | null;
  }>;

  for (const application of applications) {
    const applicationId = asText(application.id);
    if (!applicationId) continue;
    if (isTerminalApplicationStatus(application.status)) continue;
    if (asText(application.post_hire_suspended_at)) continue;
    const ready = await requiredPreHireStepsComplete(supabase, {
      tenantId: params.tenantId,
      workerId: params.workerId,
      applicationId,
      workflowInstanceId: asText(application.applicant_workflow_instance_id),
    });
    if (ready) return true;
  }

  return false;
}

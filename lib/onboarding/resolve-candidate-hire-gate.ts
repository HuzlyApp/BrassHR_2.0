import type { SupabaseClient } from "@supabase/supabase-js";
import { canRevealPostHire, isAgreementEsignStep, isAuthoritativelyHired } from "@/lib/onboarding/lock-post-hire";
import { parseApplicantLifecyclePhase, type ApplicantLifecyclePhase } from "@/lib/onboarding/workflow-phase";

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
 * Staff access to individual Post-Hire step records: after conversion, or once
 * an application is hired (Post-Hire activated) and not suspended.
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
  if (
    canRevealPostHire({
      workerStatus: asText(params.worker.status),
      convertedAt: asText(params.worker.converted_at),
      convertedWorkerId: asText(params.worker.converted_worker_id),
      conversionStatus: asText(params.worker.conversion_status),
    })
  ) {
    return true;
  }
  const { data } = await supabase
    .from("job_applications")
    .select("status, workflow_phase, post_hire_activated_at, post_hire_suspended_at, created_at")
    .eq("tenant_id", params.tenantId)
    .eq("worker_id", params.workerId)
    .order("created_at", { ascending: false });
  const gate = resolveCandidateHireGate((data ?? []) as CandidateApplicationPhaseRow[]);
  if (gate.isHired && !gate.postHireSuspended) {
    return true;
  }

  // Post-Hire opens after the recruiter marks Agreement e-sign complete, not when the candidate signs.
  try {
    const { data: instances } = await supabase
      .from("applicant_workflow_instances")
      .select("id")
      .eq("tenant_id", params.tenantId)
      .eq("worker_id", params.workerId);
    const instanceIds = (instances ?? []).map((row) => row.id).filter(Boolean);
    if (!instanceIds.length) return false;

    const { data: stepRecords } = await supabase
      .from("applicant_workflow_step_records")
      .select("step_type, title, phase, settings, snapshot_step_id, review_decision")
      .eq("tenant_id", params.tenantId)
      .in("workflow_instance_id", instanceIds)
      .eq("review_decision", "complete")
      .in("status", ["completed", "approved"]);
    const recruiterCompletedAgreement = (stepRecords ?? []).some((record) => {
      if (record.phase === "post_hire") return false;
      const settings =
        record.settings && typeof record.settings === "object" && !Array.isArray(record.settings)
          ? (record.settings as Record<string, unknown>)
          : null;
      return isAgreementEsignStep({
        snapshotStepId: String(settings?.workflow_step_id ?? record.snapshot_step_id ?? ""),
        stepKey: record.step_type,
        stepType: record.step_type,
        title: record.title,
      });
    });
    if (recruiterCompletedAgreement) return true;
  } catch {
    /* ignore fallback query error */
  }

  return false;
}

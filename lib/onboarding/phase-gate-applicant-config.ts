import type { SupabaseClient } from "@supabase/supabase-js";
import { applyApplicantConfigFilters } from "@/lib/onboarding/filter-applicant-steps";
import { resolveApplicationWorkflowPhase } from "@/lib/onboarding/resolve-application-workflow-phase";
import type { TenantOnboardingConfig } from "@/lib/onboarding/types";
import type { ApplicantLifecyclePhase } from "@/lib/onboarding/workflow-phase";

export type PhaseGatedApplicantConfig = {
  config: TenantOnboardingConfig;
  workflowPhase: ApplicantLifecyclePhase;
  applicationId: string | null;
  postHireActivatedAt: string | null;
  allWorkflowSteps?: TenantOnboardingStep[];
};

export async function phaseGateApplicantConfig(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    config: TenantOnboardingConfig;
    workerId?: string | null;
    applicationId?: string | null;
    jobToken?: string | null;
  }
): Promise<PhaseGatedApplicantConfig> {
  const record = await resolveApplicationWorkflowPhase(supabase, {
    tenantId: params.tenantId,
    workerId: params.workerId,
    applicationId: params.applicationId,
    jobToken: params.jobToken,
  });
  const workflowPhase: ApplicantLifecyclePhase = record?.phase ?? "pre_hire";
  const { filterApplicantVisibleSteps } = await import("@/lib/onboarding/filter-applicant-steps");
  return {
    config: applyApplicantConfigFilters(params.config, { activePhase: workflowPhase }),
    workflowPhase,
    applicationId: record?.applicationId ?? null,
    postHireActivatedAt: record?.postHireActivatedAt ?? null,
    allWorkflowSteps: filterApplicantVisibleSteps(params.config.steps),
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { matchWorkspaceIsAnalyzed } from "@/lib/jobs/match-analysis/match-stage";
import type { WorkflowStepDisplayStatus } from "@/lib/onboarding/assigned-workflow-steps";

export const RECRUITER_SCREENING_STEP_TYPE = "recruiter-screening";

/**
 * The hire-journey AI Analysis embed belongs on the Recruiter Screening step.
 * A renamed step (for example Contact History) can still be stored as
 * `recruiter-screening` and must not show that response.
 */
export function isNamedRecruiterScreeningStep(step: {
  stepType?: string | null;
  title?: string | null;
}): boolean {
  if (String(step.stepType ?? "").trim().toLowerCase() !== RECRUITER_SCREENING_STEP_TYPE) return false;
  return String(step.title ?? "").trim().toLowerCase() === "recruiter screening";
}

/**
 * Recruiter Screening is under way once AI Quick Match has analyzed the application.
 * Only the displayed status moves; the stored progress row stays pending until staff completes it.
 */
export function applyQuickMatchScreeningProgress<
  T extends { stepType: string; displayStatus: WorkflowStepDisplayStatus },
>(steps: T[], quickMatchRan: boolean): T[] {
  if (!quickMatchRan) return steps;
  return steps.map((step) =>
    step.stepType === RECRUITER_SCREENING_STEP_TYPE && step.displayStatus === "not_started"
      ? { ...step, displayStatus: "in_progress" }
      : step
  );
}

export async function applicationQuickMatchRan(
  supabase: SupabaseClient,
  params: { tenantId: string; applicationId: string | null | undefined }
): Promise<boolean> {
  const applicationId = params.applicationId?.trim();
  if (!applicationId) return false;
  const { data, error } = await supabase
    .from("job_applications")
    .select("ai_match_status, ai_match_stage")
    .eq("tenant_id", params.tenantId)
    .eq("id", applicationId)
    .maybeSingle();
  if (error || !data) return false;
  return matchWorkspaceIsAnalyzed({
    status: data.ai_match_status as string | null,
    stage: data.ai_match_stage as string | null,
  });
}

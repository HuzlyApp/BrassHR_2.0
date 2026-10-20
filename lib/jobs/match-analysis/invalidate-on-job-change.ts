import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * After a job description (or related matching fields) changes:
 * - Clear structured_requirements so the next analysis rebuilds from live JD text
 * - Mark prior ANALYZED applications as READY so UI/API cannot treat the old
 *   snapshot as the current match for the updated job
 * - Return those application ids so the caller can re-run Quick Match
 *
 * Version history rows are left intact for audit.
 */
export async function invalidateMatchCachesForJobDescriptionChange(args: {
  supabase: SupabaseClient;
  tenantId: string;
  jobRequisitionId: string;
}): Promise<{ applicationsReset: number; applicationIds: string[] }> {
  const { supabase, tenantId, jobRequisitionId } = args;
  const now = new Date().toISOString();

  const { error: clearError } = await supabase
    .from("job_requisitions")
    .update({
      structured_requirements: null,
      updated_at: now,
    })
    .eq("id", jobRequisitionId)
    .eq("tenant_id", tenantId);
  if (clearError) {
    console.warn(
      "[match-analysis] failed to clear structured_requirements after JD edit",
      clearError.message
    );
  }

  const { data: resetRows, error: resetError } = await supabase
    .from("job_applications")
    .update({
      ai_match_status: "READY",
      ai_match_score: null,
      ai_match_category: null,
      ai_match_action: null,
      ai_match_readiness: null,
      ai_match_display_category: null,
      ai_match_stage: null,
      ai_analysis: null,
      ai_analysis_raw: null,
      ai_analyzed_at: null,
      ai_analysis_error:
        "Job description changed since this analysis. Re-run match analysis.",
      ai_analysis_progress: null,
      updated_at: now,
    })
    .eq("tenant_id", tenantId)
    .eq("job_requisition_id", jobRequisitionId)
    .eq("ai_match_status", "ANALYZED")
    .select("id");

  if (resetError) {
    console.warn(
      "[match-analysis] failed to reset stale analyses after JD edit",
      resetError.message
    );
    return { applicationsReset: 0, applicationIds: [] };
  }

  const applicationIds = (resetRows ?? [])
    .map((row) => String(row?.id ?? "").trim())
    .filter(Boolean);
  return { applicationsReset: applicationIds.length, applicationIds };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { matchWorkspaceIsAnalyzed } from "./match-stage";
import type { MatchAnalysisResponse } from "./schema";

export type AnalysisVersionRow = {
  id: string;
  version: number;
  score: number | null;
  category: string | null;
  recommended_action: string | null;
  display_category: string | null;
  model: string | null;
  analyzed_by: string | null;
  analyzed_at: string;
  /** Quick Match route only. The history list does not need the full analysis document. */
  quick_route?: string | null;
  analysis?: MatchAnalysisResponse | null;
};

type AnalysisHistoryLoadOptions = {
  includeAnalysis?: boolean;
  includeQuickRoute?: boolean;
};

export async function snapshotCurrentAnalysisVersion(args: {
  supabase: SupabaseClient;
  tenantId: string;
  applicationId: string;
  analyzedBy?: string | null;
}): Promise<number> {
  const { supabase, tenantId, applicationId } = args;
  const { data: current, error } = await supabase
    .from("job_applications")
    .select(
      "ai_analysis, ai_match_score, ai_match_category, ai_match_action, ai_match_display_category, ai_analysis_model, ai_analysis_version, ai_analyzed_at, ai_analyzed_by, ai_match_status, ai_match_stage"
    )
    .eq("id", applicationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (
    !current ||
    !matchWorkspaceIsAnalyzed({
      status: current.ai_match_status,
      stage: current.ai_match_stage,
      hasAnalysis: Boolean(current.ai_analysis),
    })
  ) {
    return Number(current?.ai_analysis_version ?? 0);
  }

  const version = Number(current.ai_analysis_version ?? 0);
  const nextVersion = version > 0 ? version : 1;

  const { error: insertError } = await supabase.from("job_application_analysis_versions").upsert(
    {
      tenant_id: tenantId,
      application_id: applicationId,
      version: nextVersion,
      analysis: current.ai_analysis,
      score: current.ai_match_score,
      category: current.ai_match_category,
      recommended_action: current.ai_match_action,
      display_category: current.ai_match_display_category,
      model: current.ai_analysis_model,
      analyzed_by: current.ai_analyzed_by ?? args.analyzedBy ?? null,
      analyzed_at: current.ai_analyzed_at ?? new Date().toISOString(),
    },
    { onConflict: "application_id,version" }
  );
  if (insertError) throw insertError;
  return nextVersion;
}

export async function loadAnalysisHistory(
  supabase: SupabaseClient,
  tenantId: string,
  applicationId: string,
  includeAnalysis: boolean | AnalysisHistoryLoadOptions = false
): Promise<AnalysisVersionRow[]> {
  const options: AnalysisHistoryLoadOptions =
    typeof includeAnalysis === "boolean" ? { includeAnalysis } : includeAnalysis;
  const includeBody = options.includeAnalysis === true;
  const includeQuickRoute = options.includeQuickRoute === true && !includeBody;
  const base =
    "id, version, score, category, recommended_action, display_category, model, analyzed_by, analyzed_at";
  const select = includeBody
    ? `${base}, analysis`
    : includeQuickRoute
      ? `${base}, quick_route:analysis->quick_match->>quick_route`
      : base;

  const query = () =>
    supabase
      .from("job_application_analysis_versions")
      .select(select)
      .eq("tenant_id", tenantId)
      .eq("application_id", applicationId)
      .order("version", { ascending: false });

  let { data, error } = await query();
  let quickRouteSelected = includeQuickRoute;
  if (error && includeQuickRoute) {
    quickRouteSelected = false;
    const fallback = await supabase
      .from("job_application_analysis_versions")
      .select(base)
      .eq("tenant_id", tenantId)
      .eq("application_id", applicationId)
      .order("version", { ascending: false });
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{
    id: string | number;
    version: string | number;
    score: string | number | null;
    category: string | null;
    recommended_action: string | null;
    display_category: string | null;
    model: string | null;
    analyzed_by: string | null;
    analyzed_at: string;
    quick_route?: string | null;
    analysis?: MatchAnalysisResponse | null;
  }>;
  return rows.map((row) => ({
    id: String(row.id),
    version: Number(row.version),
    score: row.score == null ? null : Number(row.score),
    category: row.category ? String(row.category) : null,
    recommended_action: row.recommended_action ? String(row.recommended_action) : null,
    display_category: row.display_category ? String(row.display_category) : null,
    model: row.model ? String(row.model) : null,
    analyzed_by: row.analyzed_by ? String(row.analyzed_by) : null,
    analyzed_at: String(row.analyzed_at),
    quick_route: quickRouteSelected && typeof row.quick_route === "string" ? row.quick_route : null,
    analysis: includeBody ? (row.analysis ?? null) : undefined,
  }));
}

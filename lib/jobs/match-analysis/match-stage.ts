import type { AnalysisMode, MatchAnalysisResponse } from "./schema";

export const MATCH_STAGES = ["quick", "call_pack", "follow_up", "deep", "submission"] as const;
export type MatchStage = (typeof MATCH_STAGES)[number];

export function parseMatchStage(value: unknown): MatchStage | null {
  return MATCH_STAGES.includes(value as MatchStage) ? (value as MatchStage) : null;
}

export function matchStageFromMode(mode: AnalysisMode): MatchStage {
  if (mode === "deep") return "deep";
  if (mode === "call_pack") return "call_pack";
  if (mode === "follow_up") return "follow_up";
  return "quick";
}

export function isDeepMatchStage(stage: unknown): boolean {
  const parsed = parseMatchStage(stage);
  return parsed === "deep" || parsed === "submission";
}

/**
 * Contact and extracted-text corrections used to set ai_match_status to NEEDS_REVIEW
 * without clearing ai_match_stage. A saved stage plus analysis still means the
 * recruiter can continue; only an explicit reset to READY should send them back
 * to Quick Match.
 *
 * FAILED and ANALYZING must not collapse the stepper to step 0 when Quick Match
 * (and later stages) already produced an analysis — Deep Match fails before a
 * score exists, so requiring ANALYZED alone caused a false stage-0 revert.
 */
export function matchWorkspaceIsAnalyzed(args: {
  status?: string | null;
  stage?: string | null;
  hasAnalysis?: boolean;
}): boolean {
  const status = String(args.status ?? "").trim().toUpperCase();
  if (status === "ANALYZED") return true;
  // READY means never analyzed, or an intentional invalidation/reset.
  if (status === "READY") return false;
  return Boolean(args.hasAnalysis && parseMatchStage(args.stage));
}

/** Listing / header match % — only after Deep Match. */
export function publicMatchScore(
  stage: unknown,
  score: number | null | undefined
): number | null {
  if (!isDeepMatchStage(stage)) return null;
  if (score == null || !Number.isFinite(Number(score))) return null;
  return Number(score);
}

export function applicationMatchScorePatch(args: {
  stage: MatchStage;
  analysis: MatchAnalysisResponse;
}): Record<string, unknown> {
  if (args.stage !== "deep" && args.stage !== "submission") {
    return {
      ai_match_stage: args.stage,
      ai_match_score: null,
      ai_match_category: null,
      ai_match_action: null,
      ai_match_readiness: null,
      ai_match_display_category: null,
    };
  }
  const match = args.analysis.candidate_match;
  return {
    ai_match_stage: args.stage,
    ai_match_score: match.recommended_overall_match_score,
    ai_match_category: match.match_category,
    ai_match_action: match.recommended_action,
    ai_match_readiness: args.analysis.submission_readiness.readiness_status,
    ai_match_display_category: match.display_category || match.match_category,
  };
}

export type DeepMatchSubmitBanner = {
  kind: "submit" | "do_not_submit" | "verify";
  label: string;
};

export function deepMatchSubmitBanner(args: {
  action?: string | null;
  readiness?: string | null;
}): DeepMatchSubmitBanner {
  const action = String(args.action ?? "").trim();
  const readiness = String(args.readiness ?? "").trim();
  if (action === "STOP_FOR_THIS_JOB" || readiness === "NOT_CURRENTLY_SUBMITTABLE") {
    return { kind: "do_not_submit", label: "Do not submit" };
  }
  if (readiness === "READY_TO_SUBMIT" || action === "PRIORITIZE_AND_CALL") {
    return { kind: "submit", label: "Submit" };
  }
  return { kind: "verify", label: "Verify before submission" };
}

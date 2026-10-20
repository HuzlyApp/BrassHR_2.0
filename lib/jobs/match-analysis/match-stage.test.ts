import { describe, expect, it } from "vitest";
import type { MatchAnalysisResponse } from "./schema";
import {
  applicationMatchScorePatch,
  deepMatchSubmitBanner,
  isDeepMatchStage,
  matchStageFromMode,
  matchWorkspaceIsAnalyzed,
  publicMatchScore,
} from "./match-stage";

const analysis = {
  candidate_match: {
    recommended_overall_match_score: 92,
    match_category: "GOOD_MATCH",
    recommended_action: "CALL_AND_VERIFY",
    display_category: "Good Match",
  },
  submission_readiness: { readiness_status: "VERIFY_BEFORE_SUBMISSION" },
} as MatchAnalysisResponse;

describe("match stage", () => {
  it("keeps a saved stage analyzable after a contact correction flipped status", () => {
    expect(
      matchWorkspaceIsAnalyzed({ status: "NEEDS_REVIEW", stage: "follow_up", hasAnalysis: true })
    ).toBe(true);
    expect(matchWorkspaceIsAnalyzed({ status: "READY", stage: "follow_up", hasAnalysis: true })).toBe(
      false
    );
  });

  it("keeps progression during Deep Match run and after a failed Deep Match", () => {
    expect(
      matchWorkspaceIsAnalyzed({ status: "ANALYZING", stage: "follow_up", hasAnalysis: true })
    ).toBe(true);
    expect(
      matchWorkspaceIsAnalyzed({ status: "FAILED", stage: "follow_up", hasAnalysis: true })
    ).toBe(true);
    expect(matchWorkspaceIsAnalyzed({ status: "FAILED", stage: null, hasAnalysis: true })).toBe(
      false
    );
    expect(
      matchWorkspaceIsAnalyzed({ status: "FAILED", stage: "follow_up", hasAnalysis: false })
    ).toBe(false);
  });

  it("maps analyze to quick, call_pack to call_pack, follow_up to follow_up, and deep to deep", () => {
    expect(matchStageFromMode("analyze")).toBe("quick");
    expect(matchStageFromMode("call_pack")).toBe("call_pack");
    expect(matchStageFromMode("follow_up")).toBe("follow_up");
    expect(matchStageFromMode("deep")).toBe("deep");
  });

  it("does not expose match % until Deep Match", () => {
    expect(publicMatchScore("quick", 41)).toBeNull();
    expect(publicMatchScore("follow_up", 61)).toBeNull();
    expect(publicMatchScore(null, 92)).toBeNull();
    expect(publicMatchScore("deep", 92)).toBe(92);
    expect(publicMatchScore("submission", 61)).toBe(61);
    expect(isDeepMatchStage("quick")).toBe(false);
    expect(isDeepMatchStage("submission")).toBe(true);
  });

  it("clears listing score columns on the cheap path", () => {
    expect(applicationMatchScorePatch({ stage: "quick", analysis })).toEqual({
      ai_match_stage: "quick",
      ai_match_score: null,
      ai_match_category: null,
      ai_match_action: null,
      ai_match_readiness: null,
      ai_match_display_category: null,
    });
  });

  it("writes score fields only for Deep Match", () => {
    expect(applicationMatchScorePatch({ stage: "deep", analysis })).toMatchObject({
      ai_match_stage: "deep",
      ai_match_score: 92,
      ai_match_category: "GOOD_MATCH",
      ai_match_action: "CALL_AND_VERIFY",
      ai_match_display_category: "Good Match",
    });
  });

  it("maps readiness to Submit / Do not submit banners", () => {
    expect(deepMatchSubmitBanner({ action: "STOP_FOR_THIS_JOB" }).label).toBe("Do not submit");
    expect(
      deepMatchSubmitBanner({ readiness: "READY_TO_SUBMIT", action: "PRIORITIZE_AND_CALL" }).label
    ).toBe("Submit");
    expect(deepMatchSubmitBanner({ action: "CALL_AND_VERIFY" }).label).toBe(
      "Verify before submission"
    );
  });
});

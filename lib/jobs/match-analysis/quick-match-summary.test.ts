import { describe, expect, it } from "vitest";
import { summarizeQuickMatch } from "@/lib/jobs/match-analysis/quick-match-summary";

const confirmedMandatory = {
  requirement_type: "MANDATORY",
  status: "CONFIRMED",
  requirement_outcome: "MET",
  verification_required: false,
  recruiter_verified: false,
};

function app(overrides: Record<string, unknown> = {}) {
  return {
    ai_match_status: "ANALYZED",
    ai_match_stage: "quick",
    ai_analysis: { quick_match: { step: "quick_match", quick_route: "STRONG" } },
    ai_analysis_error: null,
    ai_analysis_model: "gemini-2.5-flash",
    ai_analyzed_at: "2026-10-05T10:00:00.000Z",
    ...overrides,
  };
}

describe("summarizeQuickMatch", () => {
  it("reports a not-analyzed application without a fit or time", () => {
    const summary = summarizeQuickMatch({
      application: app({ ai_match_status: "READY", ai_match_stage: null, ai_analysis: null }),
      requirements: [],
    });
    expect(summary.analyzed).toBe(false);
    expect(summary.statusLabel).toBe("Not analyzed");
    expect(summary.fitBand).toBeNull();
    expect(summary.quickMatchAt).toBeNull();
    expect(summary.currentStepLabel).toBe("Not started");
  });

  it("uses the stored Quick Match route and analyzed time on Step 1", () => {
    const summary = summarizeQuickMatch({
      application: app(),
      requirements: [confirmedMandatory as never],
    });
    expect(summary.statusLabel).toBe("Completed");
    expect(summary.fitLabel).toBe("Strong");
    expect(summary.quickMatchAt).toBe("2026-10-05T10:00:00.000Z");
    expect(summary.currentStepLabel).toBe("Step 1 · Quick Match");
    expect(summary.counts.mandatoryConfirmed).toBe(1);
  });

  it("keeps the Quick Match run time after the application moves on", () => {
    const summary = summarizeQuickMatch({
      application: app({ ai_match_stage: "call_pack", ai_analyzed_at: "2026-10-05T12:00:00.000Z" }),
      requirements: [],
      analysisHistory: [
        {
          analyzed_at: "2026-10-05T12:00:00.000Z",
          model: "claude",
          analysis: {
            quick_match: { quick_route: "REVIEW" },
            candidate_match: { recruiter_decision_summary: "Deep summary" },
          },
        },
        {
          analyzed_at: "2026-10-05T09:30:00.000Z",
          model: "gemini-2.5-flash",
          analysis: { quick_match: { quick_route: "REVIEW" } },
        },
      ],
    });
    expect(summary.quickMatchAt).toBe("2026-10-05T09:30:00.000Z");
    expect(summary.model).toBe("gemini-2.5-flash");
    expect(summary.currentStepLabel).toBe("Step 2 · Verifications");
  });

  it("flags failed runs", () => {
    const summary = summarizeQuickMatch({
      application: app({ ai_match_status: "FAILED", ai_analysis_error: "Model timed out" }),
      requirements: [],
    });
    expect(summary.statusLabel).toBe("Failed");
    expect(summary.statusTone).toBe("danger");
    expect(summary.error).toBe("Model timed out");
  });
});

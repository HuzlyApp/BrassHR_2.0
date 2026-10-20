import { describe, expect, it } from "vitest";
import { recomputeQuickMatchMetrics } from "./quick-route";
import {
  DEEP_MATCH_BLOCKED_NOT_READY,
  DEEP_MATCH_BLOCKED_TALENT_POOL,
  MATCH_PROGRESSION_STEPS,
  canAdvanceMatchProgression,
  canRunDeepMatch,
  canSelectMatchProgressionStep,
  deepMatchBlockReason,
  matchProgressionFurthestIndex,
  matchProgressionPrimaryAction,
  matchProgressionFollowUpNeedsConfirm,
  matchProgressionStepRequiresDeepConfirm,
  quickMatchFitBand,
  fitBandForMatchGate,
  displayFitBand,
  listingDisplayFitBand,
  fitBandFromDeepMatchResult,
  fitBandLabel,
} from "./progression";

describe("match progression steps", () => {
  it("keeps recruiter order Quick Match → Verifications → Follow-Up → Deep Match → Submission", () => {
    expect(MATCH_PROGRESSION_STEPS.map((step) => step.label)).toEqual([
      "Quick Match",
      "Verifications",
      "Follow-Up",
      "Deep Match",
      "Submission",
    ]);
  });

  it("does not collapse to step 0 when prior analysis exists but Deep Match failed", () => {
    // UI should pass isAnalyzed=true when status is FAILED but stage+analysis remain.
    expect(
      matchProgressionFurthestIndex({
        isAnalyzed: true,
        stage: "follow_up",
        hasDeepMatch: false,
      })
    ).toBe(2);
    expect(
      matchProgressionFurthestIndex({
        isAnalyzed: false,
        stage: "follow_up",
        hasDeepMatch: false,
      })
    ).toBe(0);
  });

  it("does not skip ahead from Screening status — only saved stage counts", () => {
    expect(
      matchProgressionFurthestIndex({
        isAnalyzed: true,
        stage: "quick",
        hasDeepMatch: false,
      })
    ).toBe(0);
    expect(
      matchProgressionFurthestIndex({
        isAnalyzed: true,
        stage: "call_pack",
        hasDeepMatch: false,
      })
    ).toBe(1);
    expect(
      matchProgressionFurthestIndex({
        isAnalyzed: true,
        stage: "follow_up",
        hasDeepMatch: false,
      })
    ).toBe(2);
    expect(
      matchProgressionFurthestIndex({
        isAnalyzed: true,
        stage: "deep",
        hasDeepMatch: true,
      })
    ).toBe(3);
  });

  it("classifies strong / review / low from checklist counts without a match %", () => {
    expect(
      quickMatchFitBand({ mandatory: 7, confirmed: 6, notMet: 0, blocking: 0 })
    ).toBe("strong");
    expect(
      quickMatchFitBand({ mandatory: 7, confirmed: 3, notMet: 0, blocking: 0 })
    ).toBe("review");
    expect(
      quickMatchFitBand({ mandatory: 7, confirmed: 3, notMet: 2, blocking: 0 })
    ).toBe("low");
    expect(
      quickMatchFitBand({ mandatory: 7, confirmed: 5, notMet: 0, blocking: 1 })
    ).toBe("low");
  });

  it("keeps Review at Deep Match unless the scored result is Strong", () => {
    expect(displayFitBand({ fitBand: "review", stage: "follow_up" })).toBe("review");
    expect(displayFitBand({ fitBand: "review", stage: "deep" })).toBe("review");
    expect(displayFitBand({ fitBand: "review", stage: "submission" })).toBe("review");
    expect(displayFitBand({ fitBand: "review", hasDeepMatch: true })).toBe("review");
    expect(displayFitBand({ fitBand: "review", stage: "deep", score: 66 })).toBe("review");
    expect(displayFitBand({ fitBand: "review", stage: "deep", score: 91 })).toBe("strong");
    expect(displayFitBand({ fitBand: "review", stage: "deep", category: "WEAK_MATCH" })).toBe("low");
    expect(displayFitBand({ fitBand: "low", stage: "deep" })).toBe("low");
    expect(displayFitBand({ fitBand: "strong", stage: "quick" })).toBe("strong");
    expect(fitBandLabel("review")).toBe("Review");
  });

  it("maps Deep Match category / label / score onto Strong Review Low", () => {
    expect(fitBandFromDeepMatchResult({ category: "WEAK_MATCH" })).toBe("low");
    expect(fitBandFromDeepMatchResult({ category: "NOT_A_MATCH" })).toBe("low");
    expect(fitBandFromDeepMatchResult({ category: "STRONG_MATCH" })).toBe("strong");
    expect(fitBandFromDeepMatchResult({ category: "GOOD_MATCH" })).toBe("strong");
    expect(fitBandFromDeepMatchResult({ category: "POSSIBLE_MATCH" })).toBe("review");
    expect(fitBandFromDeepMatchResult({ displayCategory: "Weak Match" })).toBe("low");
    expect(fitBandFromDeepMatchResult({ displayCategory: "59% Weak Match" })).toBe("low");
    expect(fitBandFromDeepMatchResult({ score: 59 })).toBe("low");
    expect(fitBandFromDeepMatchResult({ score: 82 })).toBe("strong");
    expect(fitBandFromDeepMatchResult({ score: 65 })).toBe("review");
  });

  it("lists Fit from checklist counts and uses the Deep Match score when one exists", () => {
    expect(
      listingDisplayFitBand({
        analyzed: true,
        stage: "follow_up",
        counts: { confirmed: 3, verify: 3, notMet: 0 },
      })
    ).toBe("review");
    expect(
      listingDisplayFitBand({
        analyzed: true,
        stage: "follow_up",
        // John Carter–style: Conf 2 / Verify 3 / Not Met 0 → Review (not Low)
        counts: { confirmed: 2, verify: 3, notMet: 0, mandatory: 5, blocking: 0 },
      })
    ).toBe("review");
    expect(
      listingDisplayFitBand({
        analyzed: true,
        stage: "deep",
        counts: { confirmed: 3, verify: 3, notMet: 0 },
      })
    ).toBe("review");
    expect(
      listingDisplayFitBand({
        analyzed: true,
        stage: "deep",
        score: 92,
        category: "STRONG_MATCH",
        counts: { confirmed: 3, verify: 3, notMet: 0 },
      })
    ).toBe("strong");
    expect(
      listingDisplayFitBand({
        analyzed: true,
        stage: "quick",
        counts: { confirmed: 6, verify: 0, notMet: 0, mandatory: 5, blocking: 0 },
      })
    ).toBe("strong");
    expect(
      listingDisplayFitBand({
        analyzed: true,
        stage: "follow_up",
        counts: { confirmed: 4, verify: 4, notMet: 0, mandatory: 5, blocking: 0 },
      })
    ).toBe("strong");
    expect(
      listingDisplayFitBand({
        analyzed: true,
        stage: "deep",
        counts: { confirmed: 1, verify: 1, notMet: 2 },
      })
    ).toBe("low");
    expect(listingDisplayFitBand({ analyzed: false, stage: "quick", counts: { confirmed: 6 } })).toBe(
      null
    );
  });

  it("shows Low for a stored Quick Match LOW_MATCH when the checklist reads Review", () => {
    const reviewCounts = { confirmed: 2, verify: 3, notMet: 0, mandatory: 5, blocking: 0 };
    expect(
      listingDisplayFitBand({
        analyzed: true,
        stage: "quick",
        counts: { ...reviewCounts, quickRoute: "LOW_MATCH" },
      })
    ).toBe("low");
    expect(
      listingDisplayFitBand({
        analyzed: true,
        stage: "follow_up",
        counts: { ...reviewCounts, quickRoute: "LOW_MATCH" },
      })
    ).toBe("low");
    expect(
      listingDisplayFitBand({
        analyzed: true,
        stage: "quick",
        counts: { ...reviewCounts, quickRoute: "REVIEW" },
      })
    ).toBe("review");
    // Deep Match score governs after step 4. Review is not promoted to Strong.
    expect(
      listingDisplayFitBand({
        analyzed: true,
        stage: "deep",
        counts: { ...reviewCounts, quickRoute: "LOW_MATCH" },
      })
    ).toBe("review");
    expect(
      listingDisplayFitBand({
        analyzed: true,
        stage: "deep",
        score: 42,
        category: "WEAK_MATCH",
        counts: { ...reviewCounts, quickRoute: "LOW_MATCH" },
      })
    ).toBe("low");
    // Every mandatory row confirmed still wins over a stored Low route.
    expect(
      listingDisplayFitBand({
        analyzed: true,
        stage: "follow_up",
        counts: {
          confirmed: 5,
          verify: 0,
          notMet: 0,
          mandatory: 5,
          mandatoryConfirmed: 5,
          blocking: 0,
          quickRoute: "LOW_MATCH",
        },
      })
    ).toBe("strong");
  });

  it("follows the stored Quick Match route over the checklist before Deep Match", () => {
    // Checklist 4 conf / 6 mandatory reads Review; stored route is STRONG.
    expect(
      listingDisplayFitBand({
        analyzed: true,
        stage: "quick",
        counts: { confirmed: 4, verify: 4, notMet: 0, mandatory: 6, blocking: 0, quickRoute: "STRONG" },
      })
    ).toBe("strong");
    // Checklist 6 conf (4 preferred) / 5 mandatory reads Strong; stored route is REVIEW.
    expect(
      listingDisplayFitBand({
        analyzed: true,
        stage: "quick",
        counts: { confirmed: 6, verify: 5, notMet: 0, mandatory: 5, blocking: 0, quickRoute: "REVIEW" },
      })
    ).toBe("review");
    expect(
      listingDisplayFitBand({
        analyzed: true,
        stage: "follow_up",
        counts: { confirmed: 6, verify: 5, notMet: 0, mandatory: 5, blocking: 0, quickRoute: "REVIEW" },
      })
    ).toBe("review");
  });

  it("blocks Deep Match for a stored LOW_MATCH when the checklist reads Review", () => {
    expect(
      fitBandForMatchGate({
        counts: { mandatory: 5, confirmed: 2, notMet: 0, blocking: 0 },
        storedRoute: "LOW_MATCH",
      })
    ).toBe("low");
    expect(
      fitBandForMatchGate({
        counts: { mandatory: 5, confirmed: 2, notMet: 0, blocking: 0 },
        storedRoute: "REVIEW",
      })
    ).toBe("review");
  });

  it("uses the stored route, lets a fully confirmed checklist override Low, and falls back to the checklist", () => {
    expect(
      fitBandForMatchGate({
        counts: {
          mandatory: 8,
          confirmed: 13,
          mandatoryConfirmed: 8,
          verify: 0,
          notMet: 0,
          blocking: 0,
        },
        storedRoute: "LOW_MATCH",
      })
    ).toBe("strong");
    expect(
      fitBandForMatchGate({
        counts: { mandatory: 6, confirmed: 4, notMet: 0, blocking: 0 },
        storedRoute: "STRONG",
      })
    ).toBe("strong");
    expect(
      fitBandForMatchGate({
        counts: { mandatory: 8, confirmed: 13, notMet: 0, blocking: 0 },
      })
    ).toBe("strong");
    expect(
      fitBandForMatchGate({
        counts: {
          mandatory: 8,
          confirmed: 13,
          mandatoryConfirmed: 5,
          verify: 3,
          notMet: 0,
          blocking: 0,
        },
        storedRoute: "LOW_MATCH",
      })
    ).toBe("low");
    expect(
      fitBandForMatchGate({
        counts: { mandatory: 0, confirmed: 0, notMet: 0, blocking: 0 },
        storedRoute: "LOW_MATCH",
      })
    ).toBe("low");
  });

  it("allows Verifications and Deep Match for low fit but blocks Talent Pool", () => {
    expect(
      canAdvanceMatchProgression({ isAnalyzed: true, fitBand: "review" })
    ).toBe(true);
    expect(
      canAdvanceMatchProgression({ isAnalyzed: true, fitBand: "low" })
    ).toBe(true);
    expect(
      canAdvanceMatchProgression({
        isAnalyzed: true,
        fitBand: "strong",
        parkedInTalentPool: true,
      })
    ).toBe(false);
    expect(canRunDeepMatch({ isAnalyzed: true, unlockedIndex: 1 })).toBe(false);
    expect(canRunDeepMatch({ isAnalyzed: true, unlockedIndex: 2 })).toBe(true);
    expect(
      canRunDeepMatch({ isAnalyzed: true, unlockedIndex: 2, parkedInTalentPool: true })
    ).toBe(false);
    expect(deepMatchBlockReason({ isAnalyzed: true, unlockedIndex: 2 })).toBeNull();
    expect(
      deepMatchBlockReason({ isAnalyzed: true, unlockedIndex: 2, parkedInTalentPool: true })
    ).toBe(DEEP_MATCH_BLOCKED_TALENT_POOL);
    expect(deepMatchBlockReason({ isAnalyzed: true, unlockedIndex: 0 })).toBe(
      DEEP_MATCH_BLOCKED_NOT_READY
    );
  });

  it("lets the recruiter open the next step only when they can advance", () => {
    expect(
      canSelectMatchProgressionStep({ index: 1, unlockedIndex: 0, canAdvance: true })
    ).toBe(true);
    expect(
      canSelectMatchProgressionStep({ index: 1, unlockedIndex: 0, canAdvance: false })
    ).toBe(false);
    expect(
      canSelectMatchProgressionStep({ index: 2, unlockedIndex: 0, canAdvance: true })
    ).toBe(false);
    expect(
      canSelectMatchProgressionStep({ index: 0, unlockedIndex: 2, canAdvance: false })
    ).toBe(true);
  });

  it("requires Deep Match confirm instead of previewing step 4 from follow-up", () => {
    expect(
      matchProgressionStepRequiresDeepConfirm({ index: 3, unlockedIndex: 2 })
    ).toBe(true);
    expect(
      matchProgressionStepRequiresDeepConfirm({ index: 3, unlockedIndex: 3 })
    ).toBe(false);
    expect(
      matchProgressionStepRequiresDeepConfirm({ index: 2, unlockedIndex: 1 })
    ).toBe(false);
  });

  it("asks before Follow-up when the Qualification Checklist still needs confirmation", () => {
    expect(matchProgressionFollowUpNeedsConfirm(3)).toBe(true);
    expect(matchProgressionFollowUpNeedsConfirm(1)).toBe(true);
    expect(matchProgressionFollowUpNeedsConfirm(0)).toBe(false);
    expect(matchProgressionFollowUpNeedsConfirm(Number.NaN)).toBe(false);
  });

  it("labels Continue with the next recruiter action", () => {
    expect(matchProgressionPrimaryAction(0)?.label).toBe("Continue to Verifications");
    expect(matchProgressionPrimaryAction(1)?.label).toBe("Continue to Follow-up");
    expect(matchProgressionPrimaryAction(2)).toBeNull();
    expect(matchProgressionPrimaryAction(3)).toBeNull();
    expect(matchProgressionPrimaryAction(4)).toBeNull();
    expect(matchProgressionPrimaryAction(4, { hasSubmissionResume: true })?.label).toBe(
      "Email MSP / upload portal"
    );
  });
});

describe("representative match bands", () => {
  function bandFor(route: ReturnType<typeof recomputeQuickMatchMetrics>, mandatoryConfirmed: number) {
    return listingDisplayFitBand({
      analyzed: true,
      stage: "quick",
      counts: {
        confirmed: route.counts.confirmed + route.counts.preferred_confirmed,
        verify: route.counts.partial,
        notMet: route.counts.not_found + route.counts.conflicting,
        mandatory: route.counts.confirmed + route.counts.partial + route.counts.not_found + route.counts.conflicting,
        mandatoryConfirmed,
        blocking: 0,
        quickRoute: route.quick_route,
      },
    });
  }

  it("keeps a clear miss Low, a mixed checklist Review, and a covered checklist Strong", () => {
    const low = recomputeQuickMatchMetrics({
      mandatory_requirements: [
        { requirement: "ICU RN, 3+ years", status: "NOT_FOUND", evidence: "" },
        { requirement: "Active RN license", status: "NOT_FOUND", evidence: "" },
        { requirement: "BLS", status: "PARTIAL", evidence: "skills list" },
      ],
      preferred_requirements: [],
      blocking_requirements: [],
    });
    expect(low.quick_route).toBe("LOW_MATCH");
    expect(bandFor(low, 0)).toBe("low");

    const moderate = recomputeQuickMatchMetrics({
      mandatory_requirements: [
        { requirement: "Java", status: "CONFIRMED", evidence: "Acme 2022" },
        { requirement: "SQL", status: "CONFIRMED", evidence: "Acme 2023" },
        { requirement: "Spring", status: "PARTIAL", evidence: "skills list" },
        { requirement: "Kafka", status: "NOT_FOUND", evidence: "" },
      ],
      preferred_requirements: [],
      blocking_requirements: [],
    });
    expect(moderate.quick_route).toBe("REVIEW");
    expect(bandFor(moderate, 2)).toBe("review");

    const strong = recomputeQuickMatchMetrics({
      mandatory_requirements: [
        { requirement: "Java", status: "CONFIRMED", evidence: "Acme 2022" },
        { requirement: "SQL", status: "CONFIRMED", evidence: "Acme 2023" },
        { requirement: "Spring", status: "CONFIRMED", evidence: "Acme 2024" },
        { requirement: "Kafka", status: "PARTIAL", evidence: "skills list" },
      ],
      preferred_requirements: [{ requirement: "AWS", status: "CONFIRMED", evidence: "Acme 2024" }],
      blocking_requirements: [],
    });
    expect(strong.quick_route).toBe("STRONG");
    expect(bandFor(strong, 3)).toBe("strong");
  });

  it("does not show Strong when the model marked a partial core seat LOW_MATCH", () => {
    const coreSeat = recomputeQuickMatchMetrics({
      quick_route: "LOW_MATCH",
      mandatory_requirements: [
        { requirement: "Java", status: "CONFIRMED", evidence: "Acme 2022" },
        { requirement: "SQL", status: "CONFIRMED", evidence: "Acme 2023" },
        { requirement: "Technical PM of SDKs, 5+ years", status: "PARTIAL", evidence: "PMO 2021" },
      ],
      preferred_requirements: [{ requirement: "Writing", status: "CONFIRMED", evidence: "docs" }],
      blocking_requirements: [],
    });
    expect(coreSeat.quick_route).toBe("LOW_MATCH");
    expect(coreSeat.weighted).toBeGreaterThan(0.7);
    expect(
      listingDisplayFitBand({
        analyzed: true,
        stage: "quick",
        counts: {
          confirmed: 6,
          verify: 1,
          notMet: 0,
          mandatory: 6,
          mandatoryConfirmed: 5,
          blocking: 0,
          quickRoute: coreSeat.quick_route,
        },
      })
    ).toBe("low");
  });

  it("does not treat a label of Verify as Strong", () => {
    expect(fitBandFromDeepMatchResult({ displayCategory: "Verify" })).toBe("review");
    expect(fitBandFromDeepMatchResult({ score: 42 })).toBe("low");
    expect(fitBandFromDeepMatchResult({ score: 66 })).toBe("review");
    expect(fitBandFromDeepMatchResult({ score: 91 })).toBe("strong");
  });
});

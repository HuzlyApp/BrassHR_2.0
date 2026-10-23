import { describe, expect, it } from "vitest";
import { fitBandFromQuickRoute, recomputeQuickMatchMetrics, resolveHistoryQuickRoute } from "./quick-route";

describe("recomputeQuickMatchMetrics", () => {
  it("marks STRONG when weighted, mand_met, and confirmed share clear the bar", () => {
    const result = recomputeQuickMatchMetrics({
      mandatory_requirements: [
        { requirement: "Java", status: "CONFIRMED", evidence: "Acme 2022" },
        { requirement: "SQL", status: "CONFIRMED", evidence: "Acme 2023" },
        { requirement: "Spring", status: "PARTIAL", evidence: "skills list" },
      ],
      preferred_requirements: [{ requirement: "AWS", status: "CONFIRMED", evidence: "Acme 2024" }],
      blocking_requirements: [],
    });
    expect(result.mand_met).toBe(0.8333);
    expect(result.pref_met).toBe(1);
    expect(result.weighted).toBe(0.8666);
    expect(result.quick_route).toBe("STRONG");
    expect(result.counts.confirmed).toBe(2);
  });

  it("uses mand_met as weighted when there are no preferred rows", () => {
    const result = recomputeQuickMatchMetrics({
      mandatory_requirements: [
        { requirement: "Java", status: "CONFIRMED", evidence: "Acme 2022" },
        { requirement: "SQL", status: "NOT_FOUND", evidence: "" },
      ],
      preferred_requirements: [],
      blocking_requirements: [],
    });
    expect(result.mand_met).toBe(0.5);
    expect(result.pref_met).toBe(0);
    expect(result.weighted).toBe(0.5);
    expect(result.quick_route).toBe("LOW_MATCH");
  });

  it("marks REVIEW when weighted is above 0.50 but below the STRONG bar", () => {
    const result = recomputeQuickMatchMetrics({
      mandatory_requirements: [
        { requirement: "Java", status: "CONFIRMED", evidence: "Acme 2022" },
        { requirement: "SQL", status: "CONFIRMED", evidence: "Acme 2023" },
        { requirement: "Spring", status: "PARTIAL", evidence: "skills list" },
        { requirement: "Kafka", status: "NOT_FOUND", evidence: "" },
      ],
      preferred_requirements: [],
      blocking_requirements: [],
    });
    expect(result.weighted).toBe(0.625);
    expect(result.quick_route).toBe("REVIEW");
    expect(fitBandFromQuickRoute(result.quick_route)).toBe("review");
  });

  it("forces LOW_MATCH when nothing mandatory is confirmed", () => {
    const result = recomputeQuickMatchMetrics({
      mandatory_requirements: [
        { requirement: "Java", status: "PARTIAL", evidence: "skills list" },
        { requirement: "SQL", status: "PARTIAL", evidence: "skills list" },
      ],
      preferred_requirements: [{ requirement: "AWS", status: "CONFIRMED", evidence: "Acme 2024" }],
      blocking_requirements: [],
    });
    expect(result.weighted).toBe(0.6);
    expect(result.quick_route).toBe("LOW_MATCH");
  });

  it("forces LOW_MATCH when two or more mandatory rows are NOT_FOUND", () => {
    const result = recomputeQuickMatchMetrics({
      mandatory_requirements: [
        { requirement: "Java", status: "CONFIRMED", evidence: "Acme 2022" },
        { requirement: "SQL", status: "CONFIRMED", evidence: "Acme 2023" },
        { requirement: "Spring", status: "CONFIRMED", evidence: "Acme 2023" },
        { requirement: "AWS", status: "CONFIRMED", evidence: "Acme 2024" },
        { requirement: "Kafka", status: "NOT_FOUND", evidence: "" },
        { requirement: "Redis", status: "NOT_FOUND", evidence: "" },
      ],
      preferred_requirements: [],
      blocking_requirements: [],
    });
    expect(result.weighted).toBeGreaterThan(0.5);
    expect(result.quick_route).toBe("LOW_MATCH");
  });

  it("keeps a model LOW_MATCH (e.g. core seat not confirmed) even when the math says STRONG", () => {
    const result = recomputeQuickMatchMetrics({
      quick_route: "LOW_MATCH",
      mandatory_requirements: [
        { requirement: "Java", status: "CONFIRMED", evidence: "Acme 2022" },
        { requirement: "SQL", status: "CONFIRMED", evidence: "Acme 2023" },
        { requirement: "Technical PM of SDKs, 5+ years", status: "PARTIAL", evidence: "PMO 2021" },
      ],
      preferred_requirements: [],
      blocking_requirements: [],
    });
    expect(result.weighted).toBe(0.8333);
    expect(result.quick_route).toBe("LOW_MATCH");
  });

  it("forces LOW_MATCH for a skill blocker even when the average is high", () => {
    const result = recomputeQuickMatchMetrics({
      mandatory_requirements: [
        { requirement: "Java", status: "CONFIRMED", evidence: "Acme 2022" },
        { requirement: "RN license", status: "NOT_FOUND", evidence: "" },
      ],
      preferred_requirements: [],
      blocking_requirements: ["Required RN license missing"],
    });
    expect(result.weighted).toBe(0.5);
    expect(result.quick_route).toBe("LOW_MATCH");
    expect(fitBandFromQuickRoute(result.quick_route)).toBe("low");
  });

  it("forces LOW_MATCH when weighted is under 0.40", () => {
    const result = recomputeQuickMatchMetrics({
      mandatory_requirements: [
        { requirement: "Java", status: "PARTIAL", evidence: "skills list" },
        { requirement: "SQL", status: "NOT_FOUND", evidence: "" },
        { requirement: "AWS", status: "NOT_FOUND", evidence: "" },
      ],
      preferred_requirements: [],
      blocking_requirements: [],
    });
    expect(result.weighted).toBeLessThan(0.4);
    expect(result.quick_route).toBe("LOW_MATCH");
  });

  it("ignores NOT_APPLICABLE in averages and counts", () => {
    const result = recomputeQuickMatchMetrics({
      mandatory_requirements: [
        { requirement: "Java", status: "CONFIRMED", evidence: "Acme 2022" },
        { requirement: "Onsite", status: "NOT_APPLICABLE", evidence: "" },
      ],
      preferred_requirements: [{ requirement: "Travel", status: "NOT_APPLICABLE", evidence: "" }],
      blocking_requirements: [],
    });
    expect(result.counts.confirmed).toBe(1);
    expect(result.counts.preferred_total).toBe(0);
    expect(result.weighted).toBe(1);
    expect(result.quick_route).toBe("STRONG");
  });

  it("does not invent STRONG from the model label", () => {
    const result = recomputeQuickMatchMetrics({
      quick_route: "STRONG",
      mandatory_requirements: [
        { requirement: "Java", status: "CONFIRMED", evidence: "Acme 2022" },
        { requirement: "SQL", status: "CONFIRMED", evidence: "Acme 2023" },
        { requirement: "Spring", status: "PARTIAL", evidence: "related" },
        { requirement: "Kafka", status: "NOT_FOUND", evidence: "" },
      ],
      preferred_requirements: [],
      blocking_requirements: [],
    });
    expect(result.weighted).toBe(0.625);
    expect(result.quick_route).toBe("REVIEW");
  });
});

describe("resolveHistoryQuickRoute", () => {
  it("uses the stored route without the analysis document", () => {
    expect(resolveHistoryQuickRoute({ quick_route: "STRONG" })).toBe("STRONG");
    expect(resolveHistoryQuickRoute({ quick_route: "not-a-route" })).toBeNull();
  });

  it("falls back to the analysis blob when the route column is absent", () => {
    expect(
      resolveHistoryQuickRoute({
        analysis: { quick_match: { quick_route: "LOW_MATCH" } },
      })
    ).toBe("LOW_MATCH");
  });
});

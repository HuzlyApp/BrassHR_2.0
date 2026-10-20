import { describe, expect, it } from "vitest";
import { buildSkillAssessmentResults } from "@/lib/skill-assessment/admin-results";
import { createDefaultSkillAssessmentCatalog } from "@/lib/skill-assessment/defaults";

const catalog = createDefaultSkillAssessmentCatalog();
const [basicCare, mobility] = catalog.categories;

describe("buildSkillAssessmentResults", () => {
  it("groups answers under every published category in catalog order", () => {
    const { categories, summary } = buildSkillAssessmentResults(catalog, [], []);
    expect(categories.map((category) => category.name)).toEqual([
      "Basic Patient Care & Hygiene",
      "Mobility, Positioning & Patient Handling",
      "Clinical Skills & Procedures",
      "Assessment, Monitoring & Emergency Response",
      "Professional Practices & Documentation",
    ]);
    expect(categories.every((category) => category.status === "not_started")).toBe(true);
    expect(summary).toMatchObject({ completedCategories: 0, totalCategories: 5, answeredQuestions: 0 });
  });

  it("uses the latest row per category and lets rating rows override JSON answers", () => {
    const [q1, q2] = basicCare.questions;
    const { categories, summary } = buildSkillAssessmentResults(
      catalog,
      [
        { category: "basic-care", answers: { [q1.id]: 1 }, completed: false, created_at: "2026-01-01T00:00:00Z" },
        { category: "basic-care", answers: { [q1.id]: 2, [q2.id]: 3 }, completed: true, created_at: "2026-01-02T00:00:00Z" },
        { category: "mobility", answers: {}, completed: false, created_at: "2026-01-02T00:00:00Z" },
      ],
      [{ category_id: basicCare.id, skill_id: q1.id, answer_value: 4, created_at: "2026-01-03T00:00:00Z" }]
    );

    const care = categories.find((category) => category.slug === "basic-care")!;
    expect(care.status).toBe("completed");
    expect(care.answeredCount).toBe(2);
    expect(care.totalCount).toBe(basicCare.questions.length);
    expect(care.questions[0]).toMatchObject({ rating: 4, answerLabel: "Highly Skilled" });
    expect(care.questions[1]).toMatchObject({ rating: 3, answerLabel: "Experienced" });
    expect(care.questions[2]).toMatchObject({ rating: null, answerLabel: null });
    expect(care.averageRating).toBe(3.5);

    const mob = categories.find((category) => category.slug === mobility.slug)!;
    expect(mob.status).toBe("in_progress");
    expect(summary.completedCategories).toBe(1);
    expect(summary.answeredQuestions).toBe(2);
  });
});

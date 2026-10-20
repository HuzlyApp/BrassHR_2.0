import { describe, expect, it } from "vitest";
import {
  applyQuestionSetRefresh,
  followUpEnrichmentFromVerifications,
  formatQuickMatchForFollowUp,
  questionsForProgressionStep,
  retainQuestionSetsForAnalysisMode,
  stagesAffectedByInputChange,
  stampQuestionSetsStale,
} from "./stage-questions";
import type { MatchAnalysisResponse } from "./schema";

const callPack = [
  {
    priority: 1,
    question: "Can you confirm your compact license?",
    reason: "Needs verification",
    related_requirement: "Compact license",
  },
];
const followUp = [
  {
    priority: 1,
    question: "What date can you start nights?",
    reason: "Still open after the call",
    related_requirement: "Availability",
  },
];
const deep = [
  {
    priority: 1,
    question: "Which EHR did you chart in during the last travel assignment?",
    reason: "Deep match gap",
    related_requirement: "EHR",
  },
];

const saved = {
  quick_match: { quick_route: "REVIEW" },
  screening_questions: callPack,
  follow_up_questions: followUp,
  deep_screening_questions: deep,
};

describe("stage question sets", () => {
  it("stores and displays stage 2 and stage 3 questions independently", () => {
    expect(questionsForProgressionStep("call_pack", saved).map((item) => item.question)).toEqual([
      "Can you confirm your compact license?",
    ]);
    expect(questionsForProgressionStep("follow_up", saved).map((item) => item.question)).toEqual([
      "What date can you start nights?",
    ]);
    expect(questionsForProgressionStep("follow_up", saved)).not.toEqual(
      questionsForProgressionStep("call_pack", saved)
    );
  });

  it("keeps stage 4 questions on the deep set when deep analysis is saved", () => {
    const next = {
      screening_questions: [
        {
          priority: 1,
          question: "Walk through a recent ICU float shift.",
          reason: "Deeper probe",
          related_requirement: "ICU",
        },
      ],
    } as MatchAnalysisResponse;
    const retained = retainQuestionSetsForAnalysisMode(saved, next, "deep");
    expect(retained.screening_questions.map((item) => item.question)).toEqual([
      "Can you confirm your compact license?",
    ]);
    expect(retained.follow_up_questions?.map((item) => item.question)).toEqual([
      "What date can you start nights?",
    ]);
    expect(retained.deep_screening_questions?.map((item) => item.question)).toEqual([
      "Walk through a recent ICU float shift.",
    ]);
    expect(questionsForProgressionStep("deep", retained).map((item) => item.question)).toEqual([
      "Walk through a recent ICU float shift.",
    ]);
  });

  it("refreshes only the question sets owned by the changed input", () => {
    expect(stagesAffectedByInputChange("candidate")).toEqual(["deep"]);
    expect(stagesAffectedByInputChange("resume")).toEqual(["deep"]);
    expect(stagesAffectedByInputChange("analysis")).toEqual(["follow_up", "deep"]);
    expect(stagesAffectedByInputChange("job")).toEqual(["call_pack", "follow_up", "deep"]);

    const stamped = stampQuestionSetsStale(saved, "resume");
    expect(stamped.screening_questions).toEqual(callPack);
    expect(stamped.follow_up_questions).toEqual(followUp);
    expect(stamped.deep_screening_questions).toEqual(deep);
    expect(stamped.question_sets_stale).toEqual({
      call_pack: false,
      follow_up: false,
      deep: true,
    });

    const refreshedDeep = [
      {
        priority: 1,
        question: "Which unit used the new email's facility?",
        reason: "Updated résumé",
        relatedRequirement: "Facility",
      },
    ];
    const refreshedCallPack = [
      {
        priority: 1,
        question: "This call-pack question must not replace stage 2.",
        reason: "unrelated",
        relatedRequirement: "Ignored",
      },
    ];
    const applied = applyQuestionSetRefresh({
      analysis: stamped,
      change: "candidate",
      refreshed: { deep: refreshedDeep, call_pack: refreshedCallPack },
    });
    expect(applied.screening_questions).toEqual(callPack);
    expect(applied.follow_up_questions).toEqual(followUp);
    expect(
      (applied.deep_screening_questions as Array<{ question: string }>).map((item) => item.question)
    ).toEqual(["Which unit used the new email's facility?"]);
    expect((applied.question_sets_stale as { deep: boolean }).deep).toBe(false);
    expect((applied.question_sets_stale as { call_pack: boolean }).call_pack).toBe(false);
  });

  it("tells follow-up generation which verifications questions not to repeat", () => {
    const notes = followUpEnrichmentFromVerifications({
      callPackQuestions: [{ question: callPack[0]!.question, answer: "Yes, compact." }],
      callContext: "Available in two weeks.",
    });
    expect(notes).toContain("Never repeat or rephrase");
    expect(notes).toContain(callPack[0]!.question);
    expect(notes).toContain("Yes, compact.");
    expect(notes).toContain("Available in two weeks.");
    expect(notes).not.toContain(followUp[0]!.question);
  });

  it("keeps unanswered Step 2 questions and the Quick Match summary", () => {
    const notes = followUpEnrichmentFromVerifications({
      callPackQuestions: [{ question: "Send your BLS card.", answer: "" }],
      callContext: "",
    });
    expect(notes).toContain("(no answer yet)");
    expect(notes).toContain("Call context:\n(none)");
    const summary = formatQuickMatchForFollowUp({
      quick_match: {
        quick_route: "REVIEW",
        extracted_resume: { headline: "RN", recent_titles: ["ICU Nurse"] },
      },
      gaps_and_risks: ["No ACLS listed"],
    });
    expect(summary).toContain("Route: REVIEW");
    expect(summary).toContain("RN");
    expect(summary).toContain("ICU Nurse");
    expect(summary).toContain("No ACLS listed");
  });
});

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiScreeningQuestionKey } from "./workspace";
import {
  FOLLOW_UP_QA_HEADING,
  INTERVIEW_NOTES_HEADING,
  SCREENING_RESPONSES_HEADING,
  buildSubmissionEnrichmentFromRows,
  loadSubmissionEnrichment,
} from "./submission-enrichment";

const screeningQuestion = "Which tools did you use on the EHR program?";
const followUpQuestion = "What did the weekly production work include?";
const screeningAnswer = "Used Azure DevOps Boards daily for the EHR program at Acme Health.";
const followUpAnswer = "Led weekly Python production deployments on the market-risk data pipeline.";

describe("submission enrichment rows", () => {
  it("keeps follow-up answers separate from screening responses and ignores deep-match rows", () => {
    const pack = buildSubmissionEnrichmentFromRows({
      analysis: {
        screening_questions: [
          { priority: 1, question: screeningQuestion, reason: "", related_requirement: "" },
        ],
        follow_up_questions: [
          { priority: 1, question: followUpQuestion, reason: "", related_requirement: "" },
        ],
      },
      aiAnswers: [
        {
          question_key: aiScreeningQuestionKey(1, screeningQuestion),
          question_text: screeningQuestion,
          answer_text: screeningAnswer,
        },
        {
          question_key: `follow_up:${aiScreeningQuestionKey(1, followUpQuestion)}`,
          question_text: followUpQuestion,
          answer_text: followUpAnswer,
        },
        {
          question_key: "deep:1:ignore this deep question",
          question_text: "Ignore this deep question",
          answer_text: "This deep-match answer must not be treated as a follow-up.",
        },
      ],
      jobScreeningAnswers: [
        { question_text: "Degree completed?", answer: { value: "B.S. Computer Science" } },
      ],
    });

    const screeningAt = pack.promptNotes.indexOf(SCREENING_RESPONSES_HEADING);
    const followAt = pack.promptNotes.indexOf(FOLLOW_UP_QA_HEADING);
    expect(screeningAt).toBeGreaterThanOrEqual(0);
    expect(followAt).toBeGreaterThan(screeningAt);
    expect(pack.promptNotes).toContain("B.S. Computer Science");
    expect(pack.promptNotes).toContain(screeningAnswer);
    expect(pack.promptNotes).toContain(followUpAnswer);
    expect(pack.promptNotes).not.toContain("deep-match answer");
    expect(pack.evidenceNotes).toContain(followUpAnswer);
    expect(pack.evidenceNotes).not.toContain(followUpQuestion);
  });

  it("includes hire-stage interview notes beside screening and follow-up answers", () => {
    const pack = buildSubmissionEnrichmentFromRows({
      analysis: null,
      aiAnswers: [
        {
          question_key: aiScreeningQuestionKey(1, screeningQuestion),
          question_text: screeningQuestion,
          answer_text: screeningAnswer,
        },
      ],
      interviewNotes: [
        {
          label: "Interview",
          body: "Direct matches: Snowflake masking and named dataset owners. Partial: Redshift retention policies still need examples.",
        },
      ],
    });

    expect(pack.promptNotes).toContain(SCREENING_RESPONSES_HEADING);
    expect(pack.promptNotes).toContain(screeningAnswer);
    expect(pack.promptNotes).toContain(INTERVIEW_NOTES_HEADING);
    expect(pack.promptNotes).toContain("Snowflake masking");
    expect(pack.evidenceNotes).toContain("Snowflake masking");
  });

  it("includes a follow-up answer even when the saved question text no longer matches the analysis", () => {
    const pack = buildSubmissionEnrichmentFromRows({
      analysis: {
        follow_up_questions: [
          {
            priority: 1,
            question: "Rewritten follow-up that no longer matches the saved key",
            reason: "",
            related_requirement: "",
          },
        ],
      },
      aiAnswers: [
        {
          question_key: "follow_up:1:original wording of the follow-up",
          question_text: "Original wording of the follow-up",
          answer_text: followUpAnswer,
        },
      ],
    });

    expect(pack.promptNotes).toContain(FOLLOW_UP_QA_HEADING);
    expect(pack.promptNotes).toContain(followUpAnswer);
    expect(pack.promptNotes).toContain("Original wording of the follow-up");
  });

  it("loads screening responses and follow-up answers from the application tables", async () => {
    const tables: Record<string, unknown[]> = {
      job_application_ai_screening_answers: [
        {
          question_key: aiScreeningQuestionKey(1, screeningQuestion),
          question_text: screeningQuestion,
          answer_text: screeningAnswer,
        },
        {
          question_key: `follow_up:${aiScreeningQuestionKey(1, followUpQuestion)}`,
          question_text: followUpQuestion,
          answer_text: followUpAnswer,
        },
      ],
      application_screening_answers: [
        { question_text: "Degree completed?", answer: { value: "B.S. Computer Science" } },
      ],
      job_application_verified_information: [],
      worker_notes: [],
      interview_schedules: [
        {
          notes:
            "Direct matches: 11. Partial matches: 6. Confirmed Snowflake masking on 15 critical datasets.",
        },
      ],
      stage_context_notes: [],
      applicant_workflow_instances: [{ id: "inst-1" }],
      applicant_workflow_step_records: [
        {
          title: "Interview",
          step_type: "interview",
          phase: "interview",
          review_note: "Strong on ownership rules; payments dataset example was concrete.",
        },
      ],
    };
    const supabase = {
      from(table: string) {
        const result = { data: tables[table] ?? [], error: null };
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          not: () => chain,
          order: () => chain,
          limit: () => chain,
          then: (
            resolve: (value: typeof result) => unknown,
            reject?: (reason: unknown) => unknown
          ) => Promise.resolve(result).then(resolve, reject),
        };
        return chain;
      },
    } as unknown as SupabaseClient;

    const pack = await loadSubmissionEnrichment({
      supabase,
      tenantId: "tenant-1",
      applicationId: "app-1",
      workerId: null,
      analysis: {
        analysis_version: "1.0",
        screening_questions: [
          { priority: 1, question: screeningQuestion, reason: "", related_requirement: "" },
        ],
        follow_up_questions: [
          { priority: 1, question: followUpQuestion, reason: "", related_requirement: "" },
        ],
      } as never,
    });

    expect(pack.promptNotes).toContain("B.S. Computer Science");
    expect(pack.promptNotes).toContain(screeningAnswer);
    expect(pack.promptNotes).toContain(followUpAnswer);
    expect(pack.promptNotes).toContain(INTERVIEW_NOTES_HEADING);
    expect(pack.promptNotes).toContain("Direct matches: 11");
    expect(pack.promptNotes).toContain("payments dataset example");
    expect(pack.evidenceNotes).toContain(screeningAnswer);
    expect(pack.evidenceNotes).toContain(followUpAnswer);
    expect(pack.evidenceNotes).toContain("Direct matches: 11");
  });
});

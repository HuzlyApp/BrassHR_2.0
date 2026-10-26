import type { AnalysisMode, MatchAnalysisResponse } from "./schema";
import {
  mergeStageQuestions,
  storedScreeningQuestions,
  type StageQuestionKey,
} from "./follow-up-questions";
import {
  normalizeAnalysisScreeningQuestions,
  type AnalysisScreeningQuestion,
} from "./workspace";

export type QuestionInputChange = "candidate" | "resume" | "job" | "analysis";

/**
 * Which stored question sets a given input change should refresh.
 * Checklist questions (Steps 2–3) do not depend on the candidate email or résumé body.
 * Deep Match does. A job-description change touches every set. Checklist or note
 * changes refresh Follow-Up and Deep Match and leave the Verifications call pack.
 */
export function stagesAffectedByInputChange(change: QuestionInputChange): StageQuestionKey[] {
  if (change === "candidate" || change === "resume") return ["deep"];
  if (change === "analysis") return ["follow_up", "deep"];
  return ["call_pack", "follow_up", "deep"];
}

function readStale(analysis: Record<string, unknown>): Record<string, boolean> {
  const raw = analysis.question_sets_stale;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  return {
    call_pack: record.call_pack === true,
    follow_up: record.follow_up === true,
    deep: record.deep === true,
  };
}

/** Mark affected sets stale without deleting their questions or other stages. */
export function stampQuestionSetsStale(
  analysis: Record<string, unknown>,
  change: QuestionInputChange
): Record<string, unknown> {
  const previous = readStale(analysis);
  const affected = new Set(stagesAffectedByInputChange(change));
  return {
    ...analysis,
    question_sets_stale: {
      call_pack: affected.has("call_pack") ? true : previous.call_pack === true,
      follow_up: affected.has("follow_up") ? true : previous.follow_up === true,
      deep: affected.has("deep") ? true : previous.deep === true,
    },
  };
}

/**
 * Replace only the question sets that this input change owns.
 * A refresh payload for an unrelated stage is ignored.
 */
export function applyQuestionSetRefresh(args: {
  analysis: Record<string, unknown>;
  change: QuestionInputChange;
  refreshed: Partial<Record<StageQuestionKey, AnalysisScreeningQuestion[]>>;
}): Record<string, unknown> {
  const affected = new Set(stagesAffectedByInputChange(args.change));
  let next = { ...args.analysis };
  for (const stage of affected) {
    const questions = args.refreshed[stage];
    if (!questions) continue;
    next = mergeStageQuestions(next, stage, questions);
  }
  return next;
}

export function questionsForProgressionStep(
  step: StageQuestionKey,
  analysis: Record<string, unknown> | null | undefined
): AnalysisScreeningQuestion[] {
  if (!analysis) return [];
  if (step === "follow_up") return normalizeAnalysisScreeningQuestions(analysis.follow_up_questions);
  if (step === "deep") return normalizeAnalysisScreeningQuestions(analysis.deep_screening_questions);
  return normalizeAnalysisScreeningQuestions(analysis.screening_questions);
}

export function followUpEnrichmentFromVerifications(args: {
  callPackQuestions: Array<{
    question: string;
    answer?: string | null;
    reason?: string | null;
    relatedRequirement?: string | null;
  }>;
  callContext?: string | null;
}): string {
  const questions = args.callPackQuestions
    .map((item) => ({
      question: String(item.question ?? "").trim(),
      answer: String(item.answer ?? "").trim(),
      reason: String(item.reason ?? "").trim(),
      relatedRequirement: String(item.relatedRequirement ?? "").trim(),
    }))
    .filter((item) => item.question);
  const blocks: string[] = [];
  if (questions.length) {
    blocks.push(
      [
        "Step 2 Verifications questions and answers. Never repeat or rephrase any of these questions — answered or unanswered. Dig into content gaps (skills, tools, scope, credentials) instead of logistics.",
        ...questions.map((item, index) => {
          const parts = [
            `${index + 1}. ${item.question}`,
            `   Answer: ${item.answer || "(no answer yet)"}`,
          ];
          if (item.reason) parts.push(`   Why Step 2 asked: ${item.reason}`);
          if (item.relatedRequirement) parts.push(`   Related: ${item.relatedRequirement}`);
          return parts.join("\n");
        }),
      ].join("\n")
    );
  } else {
    blocks.push("Step 2 Verifications questions and answers:\n(none saved)");
  }
  const context = String(args.callContext ?? "").trim();
  blocks.push(`Call context:\n${context || "(none)"}`);
  return blocks.join("\n\n");
}

function bulletList(label: string, value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const items = value.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (!items.length) return null;
  return `${label}\n${items.map((item) => `- ${item}`).join("\n")}`;
}

/** Step 1 fields that are not already on the live checklist rows. */
export function formatQuickMatchForFollowUp(analysis: Record<string, unknown> | null): string {
  if (!analysis) return "(no Quick Match saved)";
  const quick = asRecord(analysis.quick_match);
  const extracted = asRecord(quick.extracted_resume);
  const readiness = asRecord(analysis.submission_readiness);
  const blocks: string[] = [];
  const route = String(quick.quick_route ?? "").trim();
  if (route) blocks.push(`Route: ${route}`);
  const headline = String(extracted.headline ?? "").trim();
  if (headline) blocks.push(`Headline: ${headline}`);
  const years = extracted.years_estimated;
  if (years != null && String(years).trim()) blocks.push(`Years estimated: ${String(years)}`);
  const titles = bulletList("Recent titles", extracted.recent_titles);
  if (titles) blocks.push(titles);
  const education = String(extracted.education ?? "").trim();
  if (education) blocks.push(`Education: ${education}`);
  const products = bulletList("Named products", extracted.named_products_in_jobs);
  if (products) blocks.push(products);
  const strengths = bulletList("Strengths", analysis.strengths);
  if (strengths) blocks.push(strengths);
  const gaps = bulletList("Gaps and risks", analysis.gaps_and_risks);
  if (gaps) blocks.push(gaps);
  const verify = bulletList(
    "Items to verify",
    Array.isArray(quick.items_to_verify)
      ? quick.items_to_verify
      : readiness.items_to_verify_before_submission
  );
  if (verify) blocks.push(verify);
  const blocking = bulletList(
    "Blocking requirements",
    Array.isArray(quick.blocking_requirements)
      ? quick.blocking_requirements
      : readiness.blocking_requirements
  );
  if (blocking) blocks.push(blocking);
  return blocks.length ? blocks.join("\n") : "(no Quick Match summary saved)";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/**
 * Deep Match's model `screening_questions` are Step 4 questions.
 * Keep Step 2 and Step 3 arrays from the saved analysis.
 * Quick Match keeps later sets so a checklist re-run does not drop them.
 */
export function retainQuestionSetsForAnalysisMode(
  previous: unknown,
  next: MatchAnalysisResponse,
  mode: AnalysisMode
): MatchAnalysisResponse {
  const prev = asRecord(previous);
  const priorFollowUp = storedScreeningQuestions(
    normalizeAnalysisScreeningQuestions(prev.follow_up_questions)
  );
  const priorDeep = storedScreeningQuestions(
    normalizeAnalysisScreeningQuestions(prev.deep_screening_questions)
  );
  const priorCallPack = storedScreeningQuestions(
    normalizeAnalysisScreeningQuestions(prev.screening_questions)
  );
  const stale = readStale(prev);

  if (mode === "deep") {
    return {
      ...next,
      screening_questions: priorCallPack.length ? priorCallPack : next.screening_questions,
      follow_up_questions: priorFollowUp,
      deep_screening_questions: next.screening_questions,
      question_sets_stale: { ...stale, deep: false },
    };
  }

  if (mode === "analyze") {
    return {
      ...next,
      follow_up_questions: priorFollowUp.length ? priorFollowUp : next.follow_up_questions,
      deep_screening_questions: priorDeep.length ? priorDeep : next.deep_screening_questions,
    };
  }

  return next;
}

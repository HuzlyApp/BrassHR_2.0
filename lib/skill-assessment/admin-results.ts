import { activeSkillCategories } from "@/lib/skill-assessment/catalog";
import { isQuestionAnswered, isValidRatingAnswer } from "@/lib/skill-assessment/score";
import type {
  SkillAssessmentCatalog,
  SkillQuestionDraft,
  SkillQuizAnswerValue,
  SkillQuizAnswers,
} from "@/lib/skill-assessment/types";

export const SKILL_RATING_LABELS: Record<number, string> = {
  1: "No Experience",
  2: "Limited Experience",
  3: "Experienced",
  4: "Highly Skilled",
};

const BOOLEAN_ANSWER_LABELS: Record<string, string> = {
  yes: "Yes",
  no: "No",
  true: "True",
  false: "False",
};

export type SkillCategoryResultStatus = "completed" | "in_progress" | "not_started";

export type SkillQuestionResult = {
  id: string;
  question: string;
  detail: string | null;
  type: SkillQuestionDraft["type"];
  required: boolean;
  /** 1–4 for rating questions, otherwise null. */
  rating: number | null;
  answerLabel: string | null;
};

export type SkillCategoryResult = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: SkillCategoryResultStatus;
  answeredCount: number;
  totalCount: number;
  averageRating: number | null;
  questions: SkillQuestionResult[];
};

export type SkillAssessmentResultsSummary = {
  completedCategories: number;
  totalCategories: number;
  answeredQuestions: number;
  totalQuestions: number;
  averageRating: number | null;
};

export type SkillAssessmentRowInput = {
  category: string | null;
  answers: unknown;
  completed: boolean | null;
  created_at: string | null;
};

export type SkillAnswerRowInput = {
  category_id: string | null;
  skill_id: string | null;
  answer_value: unknown;
  created_at?: string | null;
};

function coerceAnswers(raw: unknown): SkillQuizAnswers {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: SkillQuizAnswers = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" || typeof value === "string") out[key] = value;
    else if (Array.isArray(value)) out[key] = value.map(String);
  }
  return out;
}

function roundRating(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return roundRating(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function answerLabel(question: SkillQuestionDraft, answer: SkillQuizAnswerValue | undefined): string | null {
  if (!isQuestionAnswered(question, answer) || answer == null) return null;
  if (question.type === "rating") {
    const value = Number(answer);
    return SKILL_RATING_LABELS[value] ?? String(answer);
  }
  const ids = Array.isArray(answer) ? answer : [String(answer)];
  return ids
    .map((id) => {
      const option = question.options.find((row) => row.id === id);
      return option?.label || BOOLEAN_ANSWER_LABELS[id] || id;
    })
    .join(", ");
}

/** Latest row wins; duplicate `skill_assessments` rows per category are common. */
function latestRowsByCategory(rows: SkillAssessmentRowInput[]): Map<string, SkillAssessmentRowInput> {
  const sorted = rows
    .slice()
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  const out = new Map<string, SkillAssessmentRowInput>();
  for (const row of sorted) {
    const slug = row.category?.trim();
    if (slug && !out.has(slug)) out.set(slug, row);
  }
  return out;
}

/**
 * Groups a candidate's answers by the tenant's published catalog. Mirrors the applicant quiz:
 * JSON answers from the latest `skill_assessments` row, overridden by normalized rating rows.
 */
export function buildSkillAssessmentResults(
  catalog: SkillAssessmentCatalog,
  assessmentRows: SkillAssessmentRowInput[],
  answerRows: SkillAnswerRowInput[]
): { categories: SkillCategoryResult[]; summary: SkillAssessmentResultsSummary } {
  const latestBySlug = latestRowsByCategory(assessmentRows);
  const ratingsByCategory = new Map<string, Map<string, number>>();
  const orderedAnswerRows = answerRows
    .slice()
    .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  for (const row of orderedAnswerRows) {
    const categoryId = row.category_id?.trim();
    const skillId = row.skill_id?.trim();
    const value = Number(row.answer_value);
    if (!categoryId || !skillId || !isValidRatingAnswer(value)) continue;
    const map = ratingsByCategory.get(categoryId) ?? new Map<string, number>();
    map.set(skillId, value);
    ratingsByCategory.set(categoryId, map);
  }

  const categories = activeSkillCategories(catalog).map((category): SkillCategoryResult => {
    const row = latestBySlug.get(category.slug) ?? null;
    const answers: SkillQuizAnswers = {
      ...coerceAnswers(row?.answers),
      ...Object.fromEntries(ratingsByCategory.get(category.id) ?? []),
    };
    const questions = category.questions
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((question): SkillQuestionResult => {
        const answer = answers[question.id];
        const rating =
          question.type === "rating" && isValidRatingAnswer(Number(answer)) ? Number(answer) : null;
        return {
          id: question.id,
          question: question.text,
          detail: question.description,
          type: question.type,
          required: question.required,
          rating,
          answerLabel: answerLabel(question, answer),
        };
      });
    const answeredCount = questions.filter((question) => question.answerLabel != null).length;
    const allAnswered = questions.length > 0 && answeredCount === questions.length;
    const status: SkillCategoryResultStatus =
      row?.completed === true || allAnswered
        ? "completed"
        : answeredCount > 0 || row
          ? "in_progress"
          : "not_started";
    return {
      id: category.id,
      slug: category.slug,
      name: category.name,
      description: category.description,
      status,
      answeredCount,
      totalCount: questions.length,
      averageRating: average(questions.flatMap((question) => (question.rating != null ? [question.rating] : []))),
      questions,
    };
  });

  const allRatings = categories.flatMap((category) =>
    category.questions.flatMap((question) => (question.rating != null ? [question.rating] : []))
  );
  return {
    categories,
    summary: {
      completedCategories: categories.filter((category) => category.status === "completed").length,
      totalCategories: categories.length,
      answeredQuestions: categories.reduce((sum, category) => sum + category.answeredCount, 0),
      totalQuestions: categories.reduce((sum, category) => sum + category.totalCount, 0),
      averageRating: average(allRatings),
    },
  };
}

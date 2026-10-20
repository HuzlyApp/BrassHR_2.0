"use client";

import type { ReactNode } from "react";

import {
  QUIZ_ROW_GRID,
  RATING_TRACK_GRID,
} from "@/app/application/skill-quiz/skill-quiz-responsive";
import { splitSkillQuestionDetail } from "@/lib/skill-assessment/question-display";
import { isQuestionAnswered } from "@/lib/skill-assessment/score";
import type {
  SkillCategoryDraft,
  SkillQuestionDraft,
  SkillQuizAnswerValue,
  SkillQuizAnswers,
} from "@/lib/skill-assessment/types";
import { ChevronRight } from "lucide-react";

type Props = {
  category: SkillCategoryDraft;
  pageQuestions: SkillQuestionDraft[];
  startIndex: number;
  answers: SkillQuizAnswers;
  onAnswer: (questionId: string, value: SkillQuizAnswerValue) => void;
  pageLabel: string;
  allowSkip?: boolean;
  onSkip?: () => void;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  saving?: boolean;
  autosaveSlot?: ReactNode;
  readOnly?: boolean;
};

function RatingInput({
  question,
  value,
  onChange,
  disabled,
}: {
  question: SkillQuestionDraft;
  value: SkillQuizAnswerValue | undefined;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const selected = typeof value === "number" ? value : Number(value);
  return (
    <div className={RATING_TRACK_GRID}>
      {[1, 2, 3, 4].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          className={`flex h-5 w-5 cursor-pointer items-center justify-center rounded-[5px] border-2 transition disabled:cursor-default ${
            selected === n
              ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]"
              : "border-slate-300 bg-white hover:border-[color:var(--brand-primary)]"
          }`}
          aria-label={`Rate ${question.text} as ${n}`}
        >
          {selected === n ? <span className="h-2 w-2 rounded-[2px] bg-white" /> : null}
        </button>
      ))}
    </div>
  );
}

function ChoiceInput({
  question,
  value,
  onChange,
  disabled,
}: {
  question: SkillQuestionDraft;
  value: SkillQuizAnswerValue | undefined;
  onChange: (value: SkillQuizAnswerValue) => void;
  disabled?: boolean;
}) {
  const selected = new Set(
    question.type === "multiple_select"
      ? Array.isArray(value)
        ? value.map(String)
        : value
          ? [String(value)]
          : []
      : value
        ? [String(value)]
        : []
  );

  return (
    <div className="mt-2 flex flex-col gap-1.5 sm:mt-0">
      {question.options.map((option) => {
        const checked = selected.has(option.id);
        return (
          <label
            key={option.id}
            className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-[12px] ${
              checked
                ? question.type === "multiple_select"
                  ? "border-[color:var(--brand-secondary)] bg-[color:var(--brand-secondary)]/5 text-slate-800"
                  : "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/5 text-slate-800"
                : "border-slate-200 bg-white text-slate-700"
            } ${disabled ? "cursor-default opacity-80" : ""}`}
          >
            <input
              type={question.type === "multiple_select" ? "checkbox" : "radio"}
              name={question.id}
              checked={checked}
              disabled={disabled}
              onChange={() => {
                if (question.type === "multiple_select") {
                  const next = new Set(selected);
                  if (checked) next.delete(option.id);
                  else next.add(option.id);
                  onChange(Array.from(next));
                } else {
                  onChange(option.id);
                }
              }}
              style={
                question.type === "multiple_select"
                  ? { accentColor: "var(--brand-secondary)" }
                  : undefined
              }
              className={
                question.type === "multiple_select"
                  ? "h-[18px] w-[18px] shrink-0 cursor-pointer rounded-[6px] accent-[color:var(--brand-secondary)]"
                  : "accent-[color:var(--brand-primary)]"
              }
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

export default function SkillQuizForm({
  category,
  pageQuestions,
  startIndex,
  answers,
  onAnswer,
  pageLabel,
  allowSkip = true,
  onSkip,
  onBack,
  onNext,
  nextLabel = "Save & Next",
  saving = false,
  autosaveSlot,
  readOnly = false,
}: Props) {
  const pageHasRating = pageQuestions.some((question) => question.type === "rating");
  const pageOnlyRating = pageQuestions.length > 0 && pageQuestions.every((question) => question.type === "rating");

  return (
    <div className="flex flex-1 flex-col pt-6 sm:pt-8">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-7 text-slate-800 sm:text-[24px] sm:leading-8">
            {category.name}
          </h2>
          {category.description ? (
            <p className="mt-1 text-xs text-slate-500 sm:mt-2 sm:text-[13px]">{category.description}</p>
          ) : null}
          {category.instructions ? (
            <p className="mt-2 text-xs leading-5 text-slate-600 sm:text-[13px]">{category.instructions}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {autosaveSlot}
          {allowSkip && onSkip ? (
            <button
              type="button"
              onClick={onSkip}
              className="cursor-pointer text-[12px] font-medium leading-5 text-[color:var(--brand-primary)]"
            >
              Skip for Now →
            </button>
          ) : null}
        </div>
      </div>

      {pageOnlyRating ? (
        <div className={`mb-1 mt-4 border-b border-slate-200 pb-2 ${QUIZ_ROW_GRID}`}>
          <p className="min-w-0 text-[12px] font-bold text-slate-800 sm:text-[13px]">Skills</p>
          <div className={RATING_TRACK_GRID}>
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className="w-5 text-center text-[12px] font-semibold text-slate-600 sm:text-[13px]">
                {n}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="mb-1 mt-4 border-b border-slate-200 pb-2 text-[12px] font-bold text-slate-800 sm:text-[13px]">
          Questions
        </p>
      )}

      <div>
        {pageQuestions.map((question, i) => {
          const index = startIndex + i;
          const display = splitSkillQuestionDetail(question.text, question.description);
          const answered = isQuestionAnswered(question, answers[question.id]);
          const rowClass = pageOnlyRating
            ? `border-b border-slate-100 py-3 sm:py-4 ${QUIZ_ROW_GRID}`
            : "border-b border-slate-100 py-3 sm:py-4";
          return (
            <div key={question.id} className={rowClass}>
              <div className="flex min-w-0 items-start gap-2 sm:gap-3">
                <div
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                    answered
                      ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)] text-white"
                      : "border-[color:var(--brand-primary)] text-[color:var(--brand-primary)]"
                  }`}
                >
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1 break-words">
                  <p className="text-[12px] font-medium leading-5 text-slate-800 sm:text-[13px]">
                    {display.title}
                    {question.required ? <span className="ml-1 text-rose-500">*</span> : null}
                  </p>
                  {display.detail ? (
                    <p className="text-[11px] leading-4 text-slate-400">{display.detail}</p>
                  ) : null}
                  {question.type !== "rating" ? (
                    <ChoiceInput
                      question={question}
                      value={answers[question.id]}
                      disabled={readOnly}
                      onChange={(value) => onAnswer(question.id, value)}
                    />
                  ) : null}
                </div>
              </div>
              {question.type === "rating" ? (
                <RatingInput
                  question={question}
                  value={answers[question.id]}
                  disabled={readOnly}
                  onChange={(value) => onAnswer(question.id, value)}
                />
              ) : pageHasRating && pageOnlyRating ? (
                <div />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[12px] font-medium text-slate-600 sm:text-[13px]">{pageLabel}</span>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-full cursor-pointer rounded-md border border-[color:var(--brand-primary)] bg-white px-3 py-2.5 text-[11px] font-medium leading-5 text-[color:var(--brand-primary)] transition hover:bg-[color:var(--brand-primary)]/5 max-[399px]:px-3 sm:w-auto sm:px-5 sm:py-2 sm:text-[12px]"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={saving || pageQuestions.length === 0}
            className="group inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-[color:var(--brand-primary)] px-3 py-2.5 text-[11px] font-medium leading-5 text-white transition hover:brightness-90 disabled:opacity-50 max-[399px]:px-3 sm:w-auto sm:gap-2 sm:px-6 sm:py-2 sm:text-[12px]"
          >
            {saving ? "Saving..." : nextLabel}
            {!saving ? <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /> : null}
          </button>
        </div>
      </div>
    </div>
  );
}

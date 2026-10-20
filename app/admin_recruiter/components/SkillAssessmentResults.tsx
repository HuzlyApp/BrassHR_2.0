"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  SKILL_RATING_LABELS,
  type SkillAssessmentResultsSummary,
  type SkillCategoryResult,
  type SkillCategoryResultStatus,
} from "@/lib/skill-assessment/admin-results";

const CATEGORY_STATUS: Record<SkillCategoryResultStatus, { label: string; tone: string }> = {
  completed: { label: "Completed", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  in_progress: { label: "In progress", tone: "bg-blue-50 text-blue-700 ring-blue-200" },
  not_started: { label: "Not started", tone: "bg-slate-100 text-slate-600 ring-slate-200" },
};

const RATING_TONE: Record<number, string> = {
  1: "bg-rose-50 text-rose-700 ring-rose-200",
  2: "bg-amber-50 text-amber-800 ring-amber-200",
  3: "bg-sky-50 text-sky-700 ring-sky-200",
  4: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

function ratingSummary(value: number | null): string {
  if (value == null) return "—";
  const label = SKILL_RATING_LABELS[Math.round(value)];
  return label ? `${value.toFixed(1)} / 4 · ${label}` : `${value.toFixed(1)} / 4`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-slate-900">{value}</p>
      {hint ? <p className="text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${percent}%`, backgroundColor: "var(--brand-primary)" }}
      />
    </div>
  );
}

function CategoryCard({ index, category }: { index: number; category: SkillCategoryResult }) {
  const [open, setOpen] = useState(category.status !== "not_started");
  const status = CATEGORY_STATUS[category.status];
  const panelId = `skill-category-${category.id}`;

  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
      >
        <span
          aria-hidden
          className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          style={{
            backgroundColor: "color-mix(in srgb, var(--brand-primary) 14%, white)",
            color: "var(--brand-secondary)",
          }}
        >
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{category.name}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${status.tone}`}>
              {status.label}
            </span>
          </span>
          {category.description ? (
            <span className="mt-0.5 block text-xs text-slate-500">{category.description}</span>
          ) : null}
          <span className="mt-2 flex items-center gap-3">
            <span className="w-full max-w-[14rem]">
              <ProgressBar value={category.answeredCount} max={category.totalCount} />
            </span>
            <span className="shrink-0 text-xs text-slate-600">
              {category.answeredCount} / {category.totalCount} answered
            </span>
            <span className="hidden shrink-0 text-xs text-slate-600 sm:inline">
              Avg {ratingSummary(category.averageRating)}
            </span>
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={`mt-1 h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div id={panelId} className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
          {category.questions.length ? (
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {category.questions.map((question) => (
                <li
                  key={question.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-slate-800">{question.question}</p>
                    {question.detail ? (
                      <p className="mt-0.5 text-xs text-slate-500">{question.detail}</p>
                    ) : null}
                  </div>
                  {question.answerLabel == null ? (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
                      Not answered
                    </span>
                  ) : question.rating != null ? (
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                        RATING_TONE[question.rating] ?? RATING_TONE[1]
                      }`}
                    >
                      <span className="inline-flex size-4 items-center justify-center rounded-full bg-white/80 text-[10px]">
                        {question.rating}
                      </span>
                      {question.answerLabel}
                    </span>
                  ) : (
                    <span className="max-w-[45%] shrink-0 break-words rounded-full bg-slate-100 px-2 py-0.5 text-right text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                      {question.answerLabel}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">No questions in this category.</p>
          )}
        </div>
      ) : null}
    </li>
  );
}

export default function SkillAssessmentResults({
  startedAt,
  completedAt,
  summary,
  categories,
}: {
  startedAt: string;
  completedAt: string;
  summary: SkillAssessmentResultsSummary;
  categories: SkillCategoryResult[];
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Started {startedAt} · Completed {completedAt}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Categories completed"
          value={`${summary.completedCategories} / ${summary.totalCategories}`}
        />
        <Stat
          label="Questions answered"
          value={`${summary.answeredQuestions} / ${summary.totalQuestions}`}
        />
        <Stat label="Average rating" value={ratingSummary(summary.averageRating)} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span className="font-medium uppercase tracking-wide">Rating scale</span>
        {Object.entries(SKILL_RATING_LABELS).map(([value, label]) => (
          <span
            key={value}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ring-1 ${RATING_TONE[Number(value)]}`}
          >
            {value} · {label}
          </span>
        ))}
      </div>

      {categories.length ? (
        <ul className="space-y-3">
          {categories.map((category, index) => (
            <CategoryCard key={category.id} index={index} category={category} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-600">No skill assessment categories are published.</p>
      )}
    </div>
  );
}

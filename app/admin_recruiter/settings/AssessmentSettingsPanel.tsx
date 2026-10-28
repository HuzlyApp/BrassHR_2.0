"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Copy,
  Eye,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import AssessmentPreviewModal from "@/app/admin_recruiter/settings/AssessmentPreviewModal";
import {
  catalogsAreEqual,
  cloneSkillAssessmentCatalog,
  createEmptySkillCategory,
  createEmptySkillQuestion,
  duplicateSkillQuestion,
  normalizeSkillAssessmentCatalog,
  reorderItems,
  slugifySkillCategoryName,
} from "@/lib/skill-assessment/catalog";
import type {
  SkillAssessmentCatalog,
  SkillCategoryDraft,
  SkillQuestionDraft,
  SkillQuestionType,
} from "@/lib/skill-assessment/types";
import { SKILL_QUESTION_TYPES } from "@/lib/skill-assessment/types";

const QUESTION_TYPE_LABELS: Record<SkillQuestionType, string> = {
  multiple_choice: "Multiple choice",
  multiple_select: "Multiple select",
  yes_no: "Yes / No",
  true_false: "True / False",
  rating: "Rating / proficiency scale",
};

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
        checked ? "bg-[color:var(--brand-primary)]" : "bg-[#CBD5E1]"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-[#0F172A]">{title}</h3>
        <p className="mt-2 text-sm text-[#64748B]">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-sm font-medium text-[#012352]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestionEditor({
  question,
  onChange,
  disabled,
}: {
  question: SkillQuestionDraft;
  onChange: (next: SkillQuestionDraft) => void;
  disabled?: boolean;
}) {
  const choiceType = question.type === "multiple_choice" || question.type === "multiple_select";

  function setType(type: SkillQuestionType) {
    const next: SkillQuestionDraft = { ...question, type };
    if (type === "yes_no") {
      next.options = [
        { id: "yes", label: "Yes" },
        { id: "no", label: "No" },
      ];
      next.correctAnswer = null;
    } else if (type === "true_false") {
      next.options = [
        { id: "true", label: "True" },
        { id: "false", label: "False" },
      ];
      next.correctAnswer = null;
    } else if (type === "rating") {
      next.options = [];
      next.correctAnswer = null;
    } else if (question.options.length === 0) {
      next.options = [
        { id: crypto.randomUUID(), label: "Option 1" },
        { id: crypto.randomUUID(), label: "Option 2" },
      ];
      next.correctAnswer = type === "multiple_select" ? [] : null;
    }
    onChange(next);
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-[#E2E8F0] bg-white p-3">
      <label className="block space-y-1">
        <span className="text-xs font-semibold text-[#0F172A]">Question</span>
        <textarea
          value={question.text}
          disabled={disabled}
          onChange={(e) => onChange({ ...question, text: e.target.value })}
          className="min-h-16 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-semibold text-[#0F172A]">Help text (optional)</span>
        <input
          value={question.description ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ ...question, description: e.target.value || null })}
          className="h-9 w-full rounded-lg border border-[#CBD5E1] px-3 text-sm"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-[#0F172A]">Type</span>
          <select
            value={question.type}
            disabled={disabled}
            onChange={(e) => setType(e.target.value as SkillQuestionType)}
            className="h-9 w-full rounded-lg border border-[#CBD5E1] bg-white px-2 text-sm"
          >
            {SKILL_QUESTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {QUESTION_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-[#0F172A]">Points</span>
          <input
            type="number"
            min={0}
            value={question.points}
            disabled={disabled}
            onChange={(e) => onChange({ ...question, points: Number(e.target.value) || 0 })}
            className="h-9 w-full rounded-lg border border-[#CBD5E1] px-3 text-sm"
          />
        </label>
        <label className="flex items-end gap-2 pb-1 text-sm text-[#0F172A]">
          <input
            type="checkbox"
            checked={question.required}
            disabled={disabled}
            onChange={(e) => onChange({ ...question, required: e.target.checked })}
          />
          Required
        </label>
      </div>

      {choiceType || question.type === "yes_no" || question.type === "true_false" ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#0F172A]">Answer choices</p>
          {question.options.map((option) => {
            const isCorrect = Array.isArray(question.correctAnswer)
              ? question.correctAnswer.includes(option.id)
              : question.correctAnswer === option.id;
            return (
              <div key={option.id} className="flex flex-wrap items-center gap-2">
                <input
                  value={option.label}
                  disabled={disabled || question.type === "yes_no" || question.type === "true_false"}
                  onChange={(e) =>
                    onChange({
                      ...question,
                      options: question.options.map((row) =>
                        row.id === option.id ? { ...row, label: e.target.value } : row
                      ),
                    })
                  }
                  className="h-9 min-w-0 flex-1 rounded-lg border border-[#CBD5E1] px-3 text-sm"
                />
                {choiceType ? (
                  <input
                    type="number"
                    placeholder="Pts"
                    value={option.points ?? ""}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange({
                        ...question,
                        options: question.options.map((row) =>
                          row.id === option.id
                            ? { ...row, points: e.target.value === "" ? null : Number(e.target.value) }
                            : row
                        ),
                      })
                    }
                    className="h-9 w-20 rounded-lg border border-[#CBD5E1] px-2 text-sm"
                  />
                ) : null}
                <label className="flex items-center gap-1 text-xs text-[#334155]">
                  <input
                    type={question.type === "multiple_select" ? "checkbox" : "radio"}
                    name={`correct-${question.id}`}
                    checked={isCorrect}
                    disabled={disabled}
                    onChange={() => {
                      if (question.type === "multiple_select") {
                        const current = Array.isArray(question.correctAnswer) ? question.correctAnswer : [];
                        const next = isCorrect
                          ? current.filter((id) => id !== option.id)
                          : [...current, option.id];
                        onChange({
                          ...question,
                          correctAnswer: next,
                          options: question.options.map((row) => ({
                            ...row,
                            isCorrect: next.includes(row.id),
                          })),
                        });
                      } else {
                        onChange({
                          ...question,
                          correctAnswer: option.id,
                          options: question.options.map((row) => ({
                            ...row,
                            isCorrect: row.id === option.id,
                          })),
                        });
                      }
                    }}
                  />
                  Correct
                </label>
                {choiceType && !disabled ? (
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...question,
                        options: question.options.filter((row) => row.id !== option.id),
                        correctAnswer: Array.isArray(question.correctAnswer)
                          ? question.correctAnswer.filter((id) => id !== option.id)
                          : question.correctAnswer === option.id
                            ? null
                            : question.correctAnswer,
                      })
                    }
                    className="text-[#B91C1C]"
                    aria-label="Remove choice"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            );
          })}
          {choiceType && !disabled ? (
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...question,
                  options: [
                    ...question.options,
                    { id: crypto.randomUUID(), label: `Option ${question.options.length + 1}` },
                  ],
                })
              }
              className="text-xs font-medium text-[#012352]"
            >
              + Add choice
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-[#64748B]">Applicants rate this skill from 1 to 4 on the proficiency scale.</p>
      )}
    </div>
  );
}

export default function AssessmentSettingsPanel() {
  const [catalog, setCatalog] = useState<SkillAssessmentCatalog | null>(null);
  const [savedCatalog, setSavedCatalog] = useState<SkillAssessmentCatalog | null>(null);
  const [publishedCatalog, setPublishedCatalog] = useState<SkillAssessmentCatalog | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(
    null
  );
  const dragCategoryId = useRef<string | null>(null);
  const dragQuestionId = useRef<string | null>(null);

  const dirty = Boolean(catalog && savedCatalog && !catalogsAreEqual(catalog, savedCatalog));
  const unpublished = Boolean(catalog && (!publishedCatalog || !catalogsAreEqual(catalog, publishedCatalog)));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/assessment-settings");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to load assessment settings");
      const draft = normalizeSkillAssessmentCatalog(payload.settings?.draft);
      setCatalog(draft);
      setSavedCatalog(cloneSkillAssessmentCatalog(draft));
      setPublishedCatalog(payload.settings?.published ? normalizeSkillAssessmentCatalog(payload.settings.published) : null);
      setCanManage(Boolean(payload.canManage));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load assessment settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function updateCatalog(updater: (current: SkillAssessmentCatalog) => SkillAssessmentCatalog) {
    setCatalog((current) => (current ? normalizeSkillAssessmentCatalog(updater(current)) : current));
  }

  async function saveDraft() {
    if (!catalog) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/assessment-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalog }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to save draft");
      const draft = normalizeSkillAssessmentCatalog(payload.settings?.draft);
      setCatalog(draft);
      setSavedCatalog(cloneSkillAssessmentCatalog(draft));
      setPublishedCatalog(payload.settings?.published ? normalizeSkillAssessmentCatalog(payload.settings.published) : null);
      toast.success("Draft saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save draft");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!catalog) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/assessment-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", catalog }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to publish");
      const draft = normalizeSkillAssessmentCatalog(payload.settings?.draft);
      setCatalog(draft);
      setSavedCatalog(cloneSkillAssessmentCatalog(draft));
      setPublishedCatalog(cloneSkillAssessmentCatalog(draft));
      toast.success("Assessment published for new applicants");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to publish");
    } finally {
      setSaving(false);
    }
  }

  function cancelEdits() {
    if (!savedCatalog) return;
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    setCatalog(cloneSkillAssessmentCatalog(savedCatalog));
    setEditingQuestionId(null);
  }

  function updateCategory(categoryId: string, patch: Partial<SkillCategoryDraft>) {
    updateCatalog((current) => ({
      ...current,
      categories: current.categories.map((category) => {
        if (category.id !== categoryId) return category;
        const next = { ...category, ...patch };
        if (patch.name && !patch.slug) next.slug = slugifySkillCategoryName(patch.name, category.slug);
        return next;
      }),
    }));
  }

  function updateQuestion(categoryId: string, question: SkillQuestionDraft) {
    updateCatalog((current) => ({
      ...current,
      categories: current.categories.map((category) =>
        category.id === categoryId
          ? {
              ...category,
              questions: category.questions.map((row) => (row.id === question.id ? question : row)),
            }
          : category
      ),
    }));
  }

  if (loading || !catalog) {
    return (
      <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm text-[#64748B]">Loading assessment settings…</p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {dirty ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
            Unsaved
          </span>
        ) : unpublished ? (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
            Unpublished draft
          </span>
        ) : (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
            Published
          </span>
        )}
      </div>

      <div className="space-y-4 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#0F172A]">Enable Skill Assessment</p>
            <p className="text-xs text-[#64748B]">When off, the step is hidden from applicants.</p>
          </div>
          <Toggle
            checked={catalog.enabled}
            disabled={!canManage}
            label="Enable Skill Assessment"
            onChange={(enabled) => updateCatalog((current) => ({ ...current, enabled }))}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#0F172A]">Allow Skip for Now</p>
            <p className="text-xs text-[#64748B]">Let applicants skip the quiz and continue later.</p>
          </div>
          <Toggle
            checked={catalog.allowSkip}
            disabled={!canManage}
            label="Allow Skip for Now"
            onChange={(allowSkip) => updateCatalog((current) => ({ ...current, allowSkip }))}
          />
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <h4 className="text-sm font-semibold text-[#0F172A]">Scoring</h4>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-[#64748B]">Points per question</span>
            <input
              type="number"
              min={0}
              disabled={!canManage}
              value={catalog.scoring.pointsPerQuestion}
              onChange={(e) =>
                updateCatalog((current) => ({
                  ...current,
                  scoring: { ...current.scoring, pointsPerQuestion: Number(e.target.value) || 0 },
                }))
              }
              className="h-10 w-full rounded-lg border border-[#CBD5E1] px-3 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-[#64748B]">Passing score (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              disabled={!canManage}
              value={catalog.scoring.passingScore}
              onChange={(e) =>
                updateCatalog((current) => ({
                  ...current,
                  scoring: { ...current.scoring, passingScore: Number(e.target.value) || 0 },
                }))
              }
              className="h-10 w-full rounded-lg border border-[#CBD5E1] px-3 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 pt-6 text-sm text-[#0F172A]">
            <input
              type="checkbox"
              disabled={!canManage}
              checked={catalog.scoring.scoreByCategory}
              onChange={(e) =>
                updateCatalog((current) => ({
                  ...current,
                  scoring: { ...current.scoring, scoreByCategory: e.target.checked },
                }))
              }
            />
            Score by category
          </label>
          <label className="flex items-center gap-2 text-sm text-[#0F172A]">
            <input
              type="checkbox"
              disabled={!canManage}
              checked={catalog.scoring.showOverallScore}
              onChange={(e) =>
                updateCatalog((current) => ({
                  ...current,
                  scoring: { ...current.scoring, showOverallScore: e.target.checked },
                }))
              }
            />
            Overall assessment score
          </label>
          <label className="flex items-center gap-2 text-sm text-[#0F172A]">
            <input
              type="checkbox"
              disabled={!canManage}
              checked={catalog.scoring.showResultsToApplicant}
              onChange={(e) =>
                updateCatalog((current) => ({
                  ...current,
                  scoring: { ...current.scoring, showResultsToApplicant: e.target.checked },
                }))
              }
            />
            Display results to applicants
          </label>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-[#0F172A]">Categories</h4>
          {canManage ? (
            <button
              type="button"
              onClick={() =>
                updateCatalog((current) => ({
                  ...current,
                  categories: [
                    ...current.categories,
                    createEmptySkillCategory(current.categories.length + 1),
                  ],
                }))
              }
              className="inline-flex h-9 items-center gap-1 rounded-lg bg-[color:var(--brand-primary)] px-3 text-xs font-medium text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              Add category
            </button>
          ) : null}
        </div>

        <ul className="space-y-2">
          {catalog.categories.map((category, index) => {
            const expanded = expandedCategoryId === category.id;
            return (
              <li
                key={category.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  const fromId = dragCategoryId.current;
                  if (!fromId || fromId === category.id) return;
                  updateCatalog((current) => ({
                    ...current,
                    categories: reorderItems(current.categories, fromId, category.id).map((row, order) => ({
                      ...row,
                      sortOrder: order + 1,
                    })),
                  }));
                  dragCategoryId.current = null;
                }}
                className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]"
              >
                <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    {canManage ? (
                      <button
                        type="button"
                        draggable
                        onDragStart={() => {
                          dragCategoryId.current = category.id;
                        }}
                        className="cursor-grab text-[#94A3B8]"
                        aria-label="Drag to reorder category"
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                    ) : (
                      <GripVertical className="h-4 w-4 text-[#94A3B8]" />
                    )}
                    <button
                      type="button"
                      onClick={() => setExpandedCategoryId(expanded ? null : category.id)}
                      className="flex min-w-0 items-center gap-2 text-left"
                    >
                      <ChevronDown className={`h-4 w-4 shrink-0 text-[#64748B] transition ${expanded ? "" : "-rotate-90"}`} />
                      <span className="text-sm font-semibold text-[#0F172A]">
                        {index + 1}. {category.name}
                      </span>
                    </button>
                    {!category.isActive ? (
                      <span className="rounded-full bg-[#FEE2E2] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#B91C1C]">
                        Inactive
                      </span>
                    ) : null}
                    <span className="text-xs text-[#94A3B8]">{category.questions.length} questions</span>
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Toggle
                        checked={category.isActive}
                        label={`Active ${category.name}`}
                        onChange={(isActive) => updateCategory(category.id, { isActive })}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setConfirm({
                            title: "Delete category?",
                            message: `Delete “${category.name}” and its questions from this draft? Published applicant records are not deleted.`,
                            onConfirm: () => {
                              updateCatalog((current) => ({
                                ...current,
                                categories: current.categories.filter((row) => row.id !== category.id),
                              }));
                              if (expandedCategoryId === category.id) setExpandedCategoryId(null);
                              setConfirm(null);
                            },
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-[#FECACA] bg-white px-2 py-1 text-xs text-[#B91C1C]"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>

                {expanded ? (
                  <div className="space-y-3 border-t border-[#E2E8F0] bg-white px-3 py-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-1">
                        <span className="text-xs font-semibold text-[#64748B]">Category name</span>
                        <input
                          value={category.name}
                          disabled={!canManage}
                          onChange={(e) => updateCategory(category.id, { name: e.target.value })}
                          className="h-9 w-full rounded-lg border border-[#CBD5E1] px-3 text-sm"
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs font-semibold text-[#64748B]">Display order</span>
                        <input
                          type="number"
                          min={1}
                          value={category.sortOrder}
                          disabled={!canManage}
                          onChange={(e) => updateCategory(category.id, { sortOrder: Number(e.target.value) || 1 })}
                          className="h-9 w-full rounded-lg border border-[#CBD5E1] px-3 text-sm"
                        />
                      </label>
                      <label className="block space-y-1 sm:col-span-2">
                        <span className="text-xs font-semibold text-[#64748B]">Short description</span>
                        <input
                          value={category.description ?? ""}
                          disabled={!canManage}
                          onChange={(e) => updateCategory(category.id, { description: e.target.value })}
                          className="h-9 w-full rounded-lg border border-[#CBD5E1] px-3 text-sm"
                        />
                      </label>
                      <label className="block space-y-1 sm:col-span-2">
                        <span className="text-xs font-semibold text-[#64748B]">Optional instructions</span>
                        <textarea
                          value={category.instructions ?? ""}
                          disabled={!canManage}
                          onChange={(e) => updateCategory(category.id, { instructions: e.target.value || null })}
                          className="min-h-16 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm"
                        />
                      </label>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-[#0F172A]">Questions</p>
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => {
                            const created = createEmptySkillQuestion(category.questions.length + 1);
                            updateCatalog((current) => ({
                              ...current,
                              categories: current.categories.map((row) =>
                                row.id === category.id
                                  ? { ...row, questions: [...row.questions, created] }
                                  : row
                              ),
                            }));
                            setEditingQuestionId(created.id);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-[#CBD5E1] bg-white px-2 py-1 text-xs text-[#012352]"
                        >
                          <Plus className="h-3 w-3" />
                          Add question
                        </button>
                      ) : null}
                    </div>

                    <ul className="space-y-2">
                      {category.questions.map((question, questionIndex) => (
                        <li
                          key={question.id}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => {
                            const fromId = dragQuestionId.current;
                            if (!fromId || fromId === question.id) return;
                            updateCatalog((current) => ({
                              ...current,
                              categories: current.categories.map((row) =>
                                row.id === category.id
                                  ? {
                                      ...row,
                                      questions: reorderItems(row.questions, fromId, question.id).map(
                                        (item, order) => ({ ...item, sortOrder: order + 1 })
                                      ),
                                    }
                                  : row
                              ),
                            }));
                            dragQuestionId.current = null;
                          }}
                          className="rounded-md border border-[#E2E8F0] px-2 py-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-start gap-2">
                              {canManage ? (
                                <button
                                  type="button"
                                  draggable
                                  onDragStart={() => {
                                    dragQuestionId.current = question.id;
                                  }}
                                  className="mt-0.5 cursor-grab text-[#94A3B8]"
                                  aria-label="Drag to reorder question"
                                >
                                  <GripVertical className="h-4 w-4" />
                                </button>
                              ) : null}
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-[#0F172A]">
                                  {questionIndex + 1}. {question.text}
                                </p>
                                <p className="text-xs text-[#64748B]">
                                  {QUESTION_TYPE_LABELS[question.type]} · {question.required ? "Required" : "Optional"} · {question.points} pts
                                </p>
                              </div>
                            </div>
                            {canManage ? (
                              <div className="flex shrink-0 gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingQuestionId(editingQuestionId === question.id ? null : question.id)
                                  }
                                  className="rounded-md border border-[#CBD5E1] bg-white px-2 py-1 text-xs text-[#334155]"
                                >
                                  <Pencil className="mr-1 inline h-3 w-3" />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const copy = duplicateSkillQuestion(question, category.questions.length + 1);
                                    updateCatalog((current) => ({
                                      ...current,
                                      categories: current.categories.map((row) =>
                                        row.id === category.id
                                          ? { ...row, questions: [...row.questions, copy] }
                                          : row
                                      ),
                                    }));
                                    setEditingQuestionId(copy.id);
                                  }}
                                  className="rounded-md border border-[#CBD5E1] bg-white px-2 py-1 text-xs text-[#334155]"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirm({
                                      title: "Delete question?",
                                      message: `Delete “${question.text}” from this draft? Previously completed answers are kept.`,
                                      onConfirm: () => {
                                        updateCatalog((current) => ({
                                          ...current,
                                          categories: current.categories.map((row) =>
                                            row.id === category.id
                                              ? {
                                                  ...row,
                                                  questions: row.questions.filter((item) => item.id !== question.id),
                                                }
                                              : row
                                          ),
                                        }));
                                        setConfirm(null);
                                      },
                                    })
                                  }
                                  className="rounded-md border border-[#FECACA] bg-white px-2 py-1 text-xs text-[#B91C1C]"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ) : null}
                          </div>
                          {editingQuestionId === question.id ? (
                            <QuestionEditor
                              question={question}
                              disabled={!canManage}
                              onChange={(next) => updateQuestion(category.id, next)}
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-6 flex flex-col gap-2 border-t border-[#E2E8F0] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#CBD5E1] bg-white px-4 text-sm font-medium text-[#012352]"
        >
          <Eye className="h-4 w-4" />
          Preview Applicant Experience
        </button>
        {canManage ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={saving}
              onClick={cancelEdits}
              className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-4 text-sm font-medium text-[#012352] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveDraft()}
              className="h-10 rounded-lg border border-[#012352] bg-white px-4 text-sm font-medium text-[#012352] disabled:opacity-50"
            >
              Save Draft
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void publish()}
              className="h-10 rounded-lg bg-[color:var(--brand-primary)] px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              Publish Changes
            </button>
          </div>
        ) : (
          <p className="text-xs text-[#64748B]">Only administrators can edit assessment settings.</p>
        )}
      </div>

      {previewOpen ? <AssessmentPreviewModal catalog={catalog} onClose={() => setPreviewOpen(false)} /> : null}
      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel="Delete"
          onCancel={() => setConfirm(null)}
          onConfirm={confirm.onConfirm}
        />
      ) : null}
    </section>
  );
}

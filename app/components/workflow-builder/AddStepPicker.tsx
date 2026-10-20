"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { CARD_BORDER, GOLD, TEXT_MUTED, TEXT_PRIMARY, TEXT_SECONDARY } from "./constants";
import { filterStepLibrary, findCustomStepDefinition } from "./filter-step-library";
import type { StepCategory, StepDefinition } from "./types";

type AddStepPickerProps = {
  open: boolean;
  categories: StepCategory[];
  slotStage?: string | null;
  onSelect: (step: StepDefinition) => void;
  onClose: () => void;
};

export default function AddStepPicker({
  open,
  categories,
  slotStage = null,
  onSelect,
  onClose,
}: AddStepPickerProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const filtered = useMemo(
    () => filterStepLibrary(categories, query),
    [categories, query]
  );
  const customStep = useMemo(
    () => findCustomStepDefinition(categories),
    [categories]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 px-4 py-8"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-workflow-step-title"
        className="flex max-h-[min(720px,calc(100vh-64px))] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl"
        style={{ borderColor: CARD_BORDER }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-center justify-between border-b px-5 py-4"
          style={{ borderColor: CARD_BORDER }}
        >
          <div className="min-w-0">
            <h2
              id="add-workflow-step-title"
              className="text-sm font-semibold"
              style={{ color: TEXT_PRIMARY }}
            >
              Add Workflow Step
            </h2>
            {slotStage ? (
              <p className="mt-1 text-[11px] leading-4" style={{ color: TEXT_SECONDARY }}>
                Only {slotStage} steps can be added between these steps.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-[#F9FAFB]"
            aria-label="Close"
          >
            <X size={16} color={TEXT_SECONDARY} />
          </button>
        </div>

        <div className="border-b px-5 py-3" style={{ borderColor: CARD_BORDER }}>
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
              color="#98a2b3"
            />
            <input
              type="text"
              role="searchbox"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search steps..."
              autoFocus
              className="h-10 w-full rounded-lg border bg-[#f9fafb] pl-8 pr-3 text-sm outline-none transition focus:border-[#BC8B41] focus:bg-white focus:ring-2 focus:ring-[#BC8B41]/20"
              style={{ borderColor: CARD_BORDER, color: TEXT_PRIMARY }}
              aria-label="Search workflow steps"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm" style={{ color: TEXT_SECONDARY }}>
                No steps found for &ldquo;{query.trim()}&rdquo;.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold transition hover:bg-[#fafafa]"
                  style={{ borderColor: CARD_BORDER, color: TEXT_PRIMARY }}
                >
                  Clear search
                </button>
                {customStep ? (
                  <button
                    type="button"
                    onClick={() => onSelect(customStep)}
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-white"
                    style={{ backgroundColor: GOLD }}
                  >
                    Create Custom Step
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            filtered.map((category) => (
              <section key={category.id} className="mb-5 last:mb-0">
                <h3
                  className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: TEXT_MUTED }}
                >
                  {category.label}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {category.steps.map((step) => (
                    <li key={step.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(step)}
                        className="flex w-full items-center gap-2 rounded-lg border bg-white px-3 py-2.5 text-left transition hover:border-[#BC8B41] hover:bg-[#faf6ef]"
                        style={{ borderColor: CARD_BORDER }}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
                          {step.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className="block truncate text-xs font-semibold"
                            style={{ color: TEXT_PRIMARY }}
                          >
                            {step.label}
                          </span>
                          {step.description ? (
                            <span
                              className="mt-0.5 block truncate text-[11px]"
                              style={{ color: TEXT_SECONDARY }}
                            >
                              {step.description}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        <div
          className="flex shrink-0 justify-end border-t px-5 py-3"
          style={{ borderColor: CARD_BORDER }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border bg-white px-4 py-2 text-xs font-semibold transition hover:bg-[#fafafa]"
            style={{ borderColor: CARD_BORDER, color: TEXT_PRIMARY }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

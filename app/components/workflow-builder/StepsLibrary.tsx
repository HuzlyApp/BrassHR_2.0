"use client";

import { useMemo, useState } from "react";
import { ChevronDown, FileText, PanelLeftClose, Plus, Search, X } from "lucide-react";
import { CARD_BORDER, GOLD, TEXT_PRIMARY, TEXT_SECONDARY } from "./constants";
import { filterStepLibrary } from "./filter-step-library";
import { resolveHireLibraryIconPath } from "./hire-library-icons";
import {
  filterStepLibraryByPhase,
  isCustomStepsCategory,
  LIBRARY_THEME_COLORS,
  resolveCategoryDisplayLabel,
  resolveCategoryThemeColor,
  resolveStepThemeColor,
  sortLibraryCategoriesForDisplay,
  withAlpha,
  type LibraryHirePhase,
} from "./library-category-theme";
import type { StepCategory, StepDefinition } from "./types";
import { writeWorkflowStepDragData } from "./workflow-step-drag";

type StepsLibraryProps = {
  categories: StepCategory[];
  title?: string;
  searchTerm?: string;
  onSearchTermChange?: (value: string) => void;
  readOnly?: boolean;
  /** Tablet/phone drawer mode — desktop leaves panels in normal flex layout. */
  compactMode?: boolean;
  panelOpen?: boolean;
  onPanelClose?: () => void;
};

const LIBRARY_TABS: Array<{ id: LibraryHirePhase; label: string }> = [
  { id: "pre_hire", label: "Pre-hire" },
  { id: "post_hire", label: "Post-hire" },
];

export default function StepsLibrary({
  categories,
  title = "Steps Library",
  searchTerm = "",
  onSearchTermChange,
  readOnly = false,
  compactMode = false,
  panelOpen = true,
  onPanelClose,
}: StepsLibraryProps) {
  const [localSearch, setLocalSearch] = useState(searchTerm);
  const [activePhase, setActivePhase] = useState<LibraryHirePhase>("pre_hire");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const controlled = typeof onSearchTermChange === "function";
  const query = controlled ? searchTerm : localSearch;
  const setQuery = (value: string) => {
    if (controlled) onSearchTermChange(value);
    else setLocalSearch(value);
  };

  const filtered = useMemo(() => {
    const byPhase = filterStepLibraryByPhase(categories, activePhase);
    const searched = filterStepLibrary(byPhase, query);
    return sortLibraryCategoriesForDisplay(searched, activePhase);
  }, [activePhase, categories, query]);

  const otherPhase: LibraryHirePhase = activePhase === "pre_hire" ? "post_hire" : "pre_hire";
  const otherMatchCount = useMemo(() => {
    if (!query.trim()) return 0;
    const byPhase = filterStepLibraryByPhase(categories, otherPhase);
    return filterStepLibrary(byPhase, query).reduce(
      (count, category) => count + category.steps.length,
      0
    );
  }, [categories, otherPhase, query]);

  const phaseName = activePhase === "pre_hire" ? "pre-hire" : "post-hire";
  const otherPhaseName = otherPhase === "pre_hire" ? "pre-hire" : "post-hire";
  const searching = query.trim().length > 0;

  if (!compactMode && !panelOpen) {
    return null;
  }

  return (
    <aside
      className={
        compactMode
          ? `flex h-full min-h-0 w-[340px] shrink-0 flex-col border-r bg-[#ECF1F9] fixed inset-y-0 left-0 z-50 shadow-xl transition-transform duration-200 ${
              panelOpen ? "translate-x-0" : "pointer-events-none -translate-x-full"
            }`
          : "flex h-full min-h-0 w-[340px] shrink-0 flex-col border-r bg-[#ECF1F9]"
      }
      style={{ borderColor: CARD_BORDER }}
      aria-hidden={!panelOpen ? true : undefined}
    >
      <div className="shrink-0 border-b px-4 pt-3" style={{ borderColor: CARD_BORDER }}>
        <div className="flex items-center gap-5">
          {LIBRARY_TABS.map((tab) => {
            const active = activePhase === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActivePhase(tab.id)}
                className={`relative pb-2.5 text-sm font-semibold transition ${
                  active ? "text-[#BC8B41]" : "text-[#667085] hover:text-[#344054]"
                }`}
                aria-pressed={active}
              >
                {tab.label}
                {active ? (
                  <span
                    className="absolute inset-x-0 bottom-0 h-0.5 rounded-full"
                    style={{ backgroundColor: GOLD }}
                    aria-hidden
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="flex shrink-0 items-center justify-between border-b px-4 py-3"
        style={{ borderColor: CARD_BORDER }}
      >
        <h2 className="text-[16.8px] font-bold leading-5 text-black">
          {title}
        </h2>
        {onPanelClose ? (
          <button
            type="button"
            onClick={onPanelClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white transition hover:bg-[#F9FAFB]"
            style={{ borderColor: CARD_BORDER }}
            aria-label="Close steps library"
          >
            <PanelLeftClose size={16} color={TEXT_SECONDARY} />
          </button>
        ) : null}
      </div>

      <div className="border-b px-4 py-3" style={{ borderColor: CARD_BORDER }}>
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
            placeholder="Search steps"
            aria-label="Search steps"
            className="h-9 w-full rounded-lg border bg-[#f9fafb] pl-8 pr-8 text-xs outline-none transition focus:border-[#BC8B41] focus:bg-white focus:ring-2 focus:ring-[#BC8B41]/20"
            style={{ borderColor: CARD_BORDER, color: TEXT_PRIMARY }}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-[#98a2b3] transition hover:text-[#344054]"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-2 py-8 text-center">
            <p className="text-xs" style={{ color: TEXT_SECONDARY }}>
              No {phaseName} steps found
              {searching ? ` for "${query.trim()}"` : ""}
            </p>
            {otherMatchCount > 0 ? (
              <button
                type="button"
                onClick={() => setActivePhase(otherPhase)}
                className="text-xs font-semibold"
                style={{ color: GOLD }}
              >
                Show {otherMatchCount} {otherPhaseName}{" "}
                {otherMatchCount === 1 ? "match" : "matches"}
              </button>
            ) : null}
          </div>
        ) : (
          filtered.map((cat) => {
            const isCollapsed = searching ? false : (collapsed[cat.id] ?? false);
            const customStepsCategory = isCustomStepsCategory(cat.id);
            const categoryColor = resolveCategoryThemeColor(cat.id, cat.label);
            const categoryLabel = resolveCategoryDisplayLabel(cat.id, cat.label);

            return (
              <section
                key={cat.id}
                className="mb-3 overflow-hidden rounded-lg border last:mb-0"
                style={
                  customStepsCategory
                    ? { borderColor: CARD_BORDER, backgroundColor: "#FFFFFF" }
                    : {
                        borderColor: withAlpha(categoryColor, 0.35),
                        backgroundColor: withAlpha(categoryColor, 0.06),
                      }
                }
              >
                <header
                  className="flex items-center justify-between border-b px-2.5 py-2"
                  style={
                    customStepsCategory
                      ? { borderColor: CARD_BORDER, backgroundColor: "#FFFFFF" }
                      : {
                          borderColor: withAlpha(categoryColor, 0.2),
                          backgroundColor: withAlpha(categoryColor, 0.1),
                        }
                  }
                >
                  <button
                    type="button"
                    onClick={() => setCollapsed((c) => ({ ...c, [cat.id]: !isCollapsed }))}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-[Inter,sans-serif] text-[12px] font-semibold leading-4"
                    style={{ color: "#000000" }}
                  >
                    <ChevronDown
                      size={14}
                      className="shrink-0"
                      style={{
                        transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                        transition: "transform 0.15s",
                      }}
                    />
                    <span className="truncate">{categoryLabel}</span>
                  </button>
                </header>

                {!isCollapsed ? (
                  <ul
                    className={`flex flex-col gap-1.5 p-2 ${customStepsCategory ? "bg-white" : ""}`}
                  >
                    {cat.steps.map((step) => (
                      <li key={step.id}>
                        <StepLibraryItem
                          step={step}
                          categoryId={cat.id}
                          categoryLabel={cat.label}
                          readOnly={readOnly}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            );
          })
        )}
      </div>
    </aside>
  );
}

function StepLibraryItem({
  step,
  categoryId,
  categoryLabel,
  readOnly = false,
}: {
  step: StepDefinition;
  categoryId: string;
  categoryLabel: string;
  readOnly?: boolean;
}) {
  const customStep = isCustomStepsCategory(categoryId);
  const themeColor = customStep
    ? LIBRARY_THEME_COLORS.slate
    : resolveStepThemeColor(step, categoryId, categoryLabel);
  const iconPath = resolveHireLibraryIconPath(step.id, step.iconKey);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (readOnly) {
      e.preventDefault();
      return;
    }
    writeWorkflowStepDragData(e.dataTransfer, step);
  };

  return (
    <div
      draggable={!readOnly}
      onDragStart={handleDragStart}
      className={`group flex items-center gap-2 rounded-lg border bg-white px-2 py-2 transition ${
        readOnly
          ? "cursor-default opacity-70"
          : "cursor-grab hover:shadow-sm active:cursor-grabbing"
      }`}
      style={{ borderColor: customStep ? CARD_BORDER : withAlpha(themeColor, 0.35) }}
    >
      <span
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-md"
        style={{ backgroundColor: customStep ? LIBRARY_THEME_COLORS.slate : themeColor }}
      >
        {iconPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconPath} alt="" className="h-5 w-5 object-contain brightness-0 invert" />
        ) : (
          <FileText size={20} className="text-white" strokeWidth={2} />
        )}
      </span>
      <span
        className="min-w-0 flex-1 whitespace-normal break-words font-[Inter,sans-serif] text-[12px] font-semibold leading-4"
        style={{ color: "#374151" }}
      >
        {step.label}
      </span>
      <span
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full opacity-100 transition group-hover:scale-105"
        style={{ backgroundColor: themeColor }}
        aria-hidden
      >
        <Plus size={12} className="text-white" strokeWidth={2.5} />
      </span>
    </div>
  );
}

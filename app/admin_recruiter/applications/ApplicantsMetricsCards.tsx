"use client";

/* eslint-disable @next/next/no-img-element -- Figma SVGs keep their own width and height. */

import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type MetricCardKey = "total" | "shortlisted" | "review" | "hired";

export type TimeframeKey =
  | "15_days"
  | "30_days"
  | "3_months"
  | "6_months"
  | "1_year"
  | "all_time";

export const TIMEFRAME_OPTIONS: Array<{ key: TimeframeKey; label: string; display: string }> = [
  { key: "15_days", label: "Last 15 days", display: "from last 15 days" },
  { key: "30_days", label: "Last 30 days", display: "from last 30 days" },
  { key: "3_months", label: "Last 3 months", display: "from last 3 months" },
  { key: "6_months", label: "Last 6 months", display: "from last 6 months" },
  { key: "1_year", label: "Last 1 year", display: "from last 1 year" },
  { key: "all_time", label: "All time", display: "all time" },
];

export type ApplicantsMetricsCardsProps = {
  counts?: {
    total?: number;
    shortlisted?: number;
    review?: number;
    hired?: number;
  };
  timeframes?: {
    total?: TimeframeKey;
    shortlisted?: TimeframeKey;
    review?: TimeframeKey;
    hired?: TimeframeKey;
  };
  onTimeframeChange?: (cardId: MetricCardKey, timeframe: TimeframeKey) => void;
  // Legacy fallback props
  totalApplicants?: number;
  shortlistedCount?: number;
  underReviewCount?: number;
  hiredCount?: number;
  timeframe?: string;
};

const CARDS: Array<{
  id: MetricCardKey;
  label: string;
  icon: string;
  iconBg: string;
}> = [
  {
    id: "total",
    label: "Total Applicants",
    icon: "/icons/applicants/metric-applicants.svg",
    iconBg: "bg-[rgba(99,53,255,0.15)]",
  },
  {
    id: "shortlisted",
    label: "Shortlisted",
    icon: "/icons/applicants/metric-shortlisted.svg",
    iconBg: "bg-[rgba(0,78,255,0.15)]",
  },
  {
    id: "review",
    label: "Under Review",
    icon: "/icons/applicants/metric-review.svg",
    iconBg: "bg-[rgba(144,0,177,0.15)]",
  },
  {
    id: "hired",
    label: "Hired",
    icon: "/icons/applicants/metric-hired.svg",
    iconBg: "bg-[rgba(14,97,87,0.15)]",
  },
];

export function ApplicantsMetricsCards({
  counts,
  timeframes,
  onTimeframeChange,
  totalApplicants = 0,
  shortlistedCount = 0,
  underReviewCount = 0,
  hiredCount = 0,
  timeframe = "from last 30 days",
}: ApplicantsMetricsCardsProps) {
  const [openCardId, setOpenCardId] = useState<MetricCardKey | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenCardId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const cardValues: Record<MetricCardKey, number> = {
    total: counts?.total ?? totalApplicants,
    shortlisted: counts?.shortlisted ?? shortlistedCount,
    review: counts?.review ?? underReviewCount,
    hired: counts?.hired ?? hiredCount,
  };

  const getDisplayTimeframe = (cardId: MetricCardKey): string => {
    const key = timeframes?.[cardId];
    if (key) {
      const match = TIMEFRAME_OPTIONS.find((opt) => opt.key === key);
      if (match) return match.display;
    }
    return timeframe;
  };

  return (
    <div ref={containerRef} className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {CARDS.map((card) => {
        const val = cardValues[card.id] ?? 0;
        const currentDisplay = getDisplayTimeframe(card.id);
        const isOpen = openCardId === card.id;
        const activeKey = timeframes?.[card.id] ?? "30_days";

        return (
          <div
            key={card.id}
            className="relative flex items-center gap-3.5 overflow-visible rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-3 shadow-xs"
          >
            <div
              className={`flex size-[50px] shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}
            >
              <img src={card.icon} alt="" className="size-6" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold leading-4 text-[#374151]">{card.label}</p>
              <p className="text-2xl font-semibold leading-8 text-black">{val.toLocaleString()}</p>

              {/* Timeframe dropdown trigger */}
              <div className="relative mt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => setOpenCardId(isOpen ? null : card.id)}
                  className="inline-flex cursor-pointer items-center gap-1 text-[10px] leading-[15px] text-[#6B7280] transition hover:text-[#111827] focus:outline-none"
                  title="Change timeframe"
                >
                  <span>{currentDisplay}</span>
                  <ChevronDown
                    className={`size-3 text-[#94A3B8] transition-transform duration-150 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* Dropdown Menu */}
                {isOpen && (
                  <div className="absolute right-0 top-full z-40 mt-1 w-36 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-lg animate-in fade-in zoom-in-95 duration-100">
                    {TIMEFRAME_OPTIONS.map((opt) => {
                      const isSelected = activeKey === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            onTimeframeChange?.(card.id, opt.key);
                            setOpenCardId(null);
                          }}
                          className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs font-medium text-[#334155] transition hover:bg-[#F8FAFC]"
                        >
                          <span className={isSelected ? "font-semibold text-indigo-600" : ""}>
                            {opt.label}
                          </span>
                          {isSelected && <Check className="size-3.5 text-indigo-600" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

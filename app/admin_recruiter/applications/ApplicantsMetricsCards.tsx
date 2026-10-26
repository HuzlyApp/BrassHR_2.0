"use client";

/* eslint-disable @next/next/no-img-element -- Figma SVGs keep their own width and height. */

import React from "react";

export type ApplicantsMetricsCardsProps = {
  totalApplicants?: number;
  shortlistedCount?: number;
  underReviewCount?: number;
  hiredCount?: number;
  timeframe?: string;
};

const CARDS = [
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
] as const;

export function ApplicantsMetricsCards({
  totalApplicants = 0,
  shortlistedCount = 0,
  underReviewCount = 0,
  hiredCount = 0,
  timeframe = "from last 30 days",
}: ApplicantsMetricsCardsProps) {
  const values = [totalApplicants, shortlistedCount, underReviewCount, hiredCount];

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {CARDS.map((card, index) => (
        <div
          key={card.id}
          className="flex items-center gap-3.5 overflow-hidden rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-3"
        >
          <div
            className={`flex size-[50px] shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}
          >
            <img src={card.icon} alt="" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold leading-4 text-[#374151]">{card.label}</p>
            <p className="text-2xl font-semibold leading-8 text-black">{values[index].toLocaleString()}</p>
            <div className="mt-1 flex items-center justify-end gap-1 text-[10px] leading-[15px] text-[#6B7280]">
              <span>{timeframe}</span>
              <img src="/icons/applicants/metric-chevron-down.svg" alt="" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

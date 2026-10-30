"use client";

import React from "react";
import { Users, UserX, Sparkles, UserCheck, ArrowUp } from "lucide-react";

export type WorkersMetricsCardsProps = {
  counts?: {
    active?: number;
    inactive?: number;
    assigned?: number;
    newlyOnboarded?: number;
  };
};

export function WorkersMetricsCards({ counts }: WorkersMetricsCardsProps) {
  const activeCount = counts?.active ?? 128;
  const inactiveCount = counts?.inactive ?? 79;
  const assignedCount = counts?.assigned ?? 18;
  const newlyOnboardedCount = counts?.newlyOnboarded ?? 25;

  const cards = [
    {
      id: "active",
      label: "Active Workers",
      value: activeCount,
      trend: "12% from last 30 days",
      icon: Users,
      iconBg: "bg-[rgba(99,53,255,0.12)]",
      iconColor: "#6335FF",
    },
    {
      id: "inactive",
      label: "Inactive Workers",
      value: inactiveCount,
      trend: "8% from last 30 days",
      icon: UserX,
      iconBg: "bg-[rgba(0,78,255,0.12)]",
      iconColor: "#004EFF",
    },
    {
      id: "assigned",
      label: "Assigned to Client",
      value: assignedCount,
      trend: "15% from last 30 days",
      icon: Sparkles,
      iconBg: "bg-[rgba(144,0,177,0.12)]",
      iconColor: "#9000B1",
    },
    {
      id: "newlyOnboarded",
      label: "Newly Onboarded",
      value: newlyOnboardedCount,
      trend: "15% from last 30 days",
      icon: UserCheck,
      iconBg: "bg-[rgba(14,97,87,0.12)]",
      iconColor: "#0E6157",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const IconComponent = card.icon;
        return (
          <div
            key={card.id}
            className="flex items-center gap-3.5 rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-3 shadow-xs"
          >
            <div
              className={`flex size-[50px] shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}
            >
              <IconComponent className="size-6" style={{ color: card.iconColor }} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold leading-4 text-[#374151]">{card.label}</p>
              <p className="text-2xl font-semibold leading-8 text-black">
                {card.value.toLocaleString()}
              </p>
              <div className="flex items-center gap-1 text-[11px] font-medium text-[#16A34A] mt-0.5">
                <ArrowUp className="size-3 stroke-[2.5]" />
                <span>{card.trend}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}


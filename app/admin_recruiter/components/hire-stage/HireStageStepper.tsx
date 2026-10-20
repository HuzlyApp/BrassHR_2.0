"use client";

import type { HireStageGroup } from "@/lib/onboarding/hire-stage-groups";
import { HireFigmaIcon, PRE_HIRE_UI_ICONS } from "./hire-figma-assets";

export function HireStageStepper({ stages }: { stages: HireStageGroup[] }) {
  if (!stages.length) return null;

  const ICON_PX = 20;
  const LINE_W = stages.length > 5 ? 72 : 124;
  const LINE_H = 2;

  return (
    <nav aria-label="Hire stage progress" className="w-full overflow-x-auto pb-8">
      <div className="mx-auto flex w-max items-start justify-center px-4">
        {stages.map((stage, index) => {
          const isLast = index === stages.length - 1;
          const done = stage.status === "completed";
          const current = stage.status === "current" || stage.status === "in_progress";
          const upcoming = !done && !current;
          const connectorFilled = done;

          return (
            <div key={stage.id} className="flex items-start">
              <div className="relative shrink-0" style={{ width: ICON_PX, height: ICON_PX }}>
                {done ? (
                  <HireFigmaIcon
                    src={PRE_HIRE_UI_ICONS.stageCheckFilled}
                    width={ICON_PX}
                    height={ICON_PX}
                    className="relative z-10 block"
                  />
                ) : current ? (
                  <HireFigmaIcon
                    src={PRE_HIRE_UI_ICONS.stepperCurrent}
                    width={ICON_PX}
                    height={ICON_PX}
                    className="relative z-10 block"
                  />
                ) : (
                  <span
                    className="relative z-10 block rounded-full border-2 border-[#D1D5DB] bg-white"
                    style={{ width: ICON_PX, height: ICON_PX }}
                    aria-hidden
                  />
                )}
                <span
                  className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap text-center text-[11px] font-medium leading-tight sm:text-xs"
                  style={{ color: upcoming ? "#9CA3AF" : "var(--brand-primary)" }}
                >
                  {stage.name}
                </span>
              </div>

              {!isLast ? (
                <div
                  className="shrink-0"
                  style={{
                    width: LINE_W,
                    height: LINE_H,
                    marginTop: (ICON_PX - LINE_H) / 2,
                    backgroundColor: connectorFilled ? "var(--brand-primary)" : "#E5E7EB",
                  }}
                  aria-hidden
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

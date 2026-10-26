"use client";

import {
  resolveHireLibraryIconPath,
} from "@/app/components/workflow-builder/hire-library-icons";
import type { CandidateWorkflowStepView } from "@/lib/onboarding/candidate-workflow-phase-view";
import { HireFigmaIcon, PRE_HIRE_UI_ICONS } from "./hire-figma-assets";

const FALLBACK_ICON = "/icons/Hire-icons/pre-hire-icons/clipboard-task-list.svg";

function resolveStepIcon(step: CandidateWorkflowStepView): string {
  return (
    resolveHireLibraryIconPath(step.stepKey) ||
    resolveHireLibraryIconPath(step.stepType) ||
    resolveHireLibraryIconPath(step.onboardingType) ||
    FALLBACK_ICON
  );
}

export function HireStepTypeIcon({
  step,
  done = false,
}: {
  step: CandidateWorkflowStepView;
  done?: boolean;
}) {
  const src = resolveStepIcon(step);

  return (
    <span
      className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border-2"
      style={
        done
          ? {
              backgroundColor: "color-mix(in srgb, var(--hj-icon, var(--brand-secondary)) 12%, white)",
              borderColor: "var(--hj-icon-border, var(--brand-secondary))",
            }
          : {
              backgroundColor: "var(--hj-icon, var(--brand-secondary))",
              borderColor: "var(--hj-icon-border, var(--brand-secondary))",
            }
      }
    >
      <HireFigmaIcon
        src={src}
        width={20}
        height={20}
        className={done ? undefined : "brightness-0 invert"}
      />
    </span>
  );
}

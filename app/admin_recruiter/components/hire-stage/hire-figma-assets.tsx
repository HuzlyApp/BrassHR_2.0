"use client";

import { BrandColoredSvg } from "./BrandColoredSvg";

/** Shared Figma Pre-hire / Post-hire visual assets for hire-journey. */

export const PRE_HIRE_UI_ICONS = {
  stageCheckFilled: "/icons/Hire-icons/pre-hire-icons/stage-check-filled.svg",
  stageCheckFilledGreen: "/icons/Hire-icons/pre-hire-icons/stage-check-filled-green.svg",
  stageCheckOutlineGreen: "/icons/Hire-icons/pre-hire-icons/stage-check-outline-green.svg",
  stageCollapseMinus: "/icons/Hire-icons/pre-hire-icons/stage-collapse-minus.svg",
  doubleCheck: "/icons/Hire-icons/pre-hire-icons/double-check.svg",
  stepperCurrent: "/icons/Hire-icons/pre-hire-icons/stepper-current.svg",
  phasePeople: "/icons/Hire-icons/pre-hire-icons/phase-people.svg",
  templateSearch: "/icons/Hire-icons/pre-hire-icons/template-search.svg",
  calendarDate: "/icons/Hire-icons/pre-hire-icons/calendar-date.svg",
  taskIncomplete: "/icons/Hire-icons/pre-hire-icons/task-incomplete.svg",
  pendingClock: "/icons/Hire-icons/pre-hire-icons/pending-clock.svg",
  inProgressClock: "/iconoven_pending-clock.svg",
  stageLocked: "/icons/Hire-icons/pre-hire-icons/stage-locked.svg",
} as const;

/** Stage hero illustrations (Figma numbered stage cards). */
export const PRE_HIRE_STAGE_HERO: Record<string, string> = {
  Intake: "/icons/Hire-icons/ic5.png",
  Screening: "/icons/Hire-icons/ic6.png",
  Interview: "/icons/Hire-icons/ic7.png",
  Submission: "/icons/Hire-icons/ic8.png",
  Compliance: "/icons/Hire-icons/ic9.png",
  "Offer & Agreement": "/icons/Hire-icons/ic11.png",
  Approvals: "/icons/Hire-icons/ic12.png",
};

export const POST_HIRE_STAGE_HERO: Record<string, string> = {
  "Payroll & Tax": "/icons/Hire-icons/ic1.png",
  "Access & Systems": "/icons/Hire-icons/ic2.png",
  "Training & Policy": "/icons/Hire-icons/ic3.png",
  "Welcome & Complete": "/icons/Hire-icons/ic4.png",
};

export const PRE_HIRE_TITLE_STYLE = {
  color: "#000000",
  fontFamily: "var(--font-tenant-branding-inter), Inter, sans-serif",
  fontSize: 21.12,
  fontWeight: 600,
  lineHeight: "30px",
} as const;

export function HireFigmaIcon({
  src,
  width,
  height,
  alt = "",
  className,
}: {
  src: string;
  width: number;
  height: number;
  alt?: string;
  className?: string;
}) {
  if (src.endsWith(".svg")) {
    return (
      <BrandColoredSvg src={src} width={width} height={height} alt={alt} className={className} />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Figma PNG stage art needs exact pixel sizes
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      draggable={false}
    />
  );
}

export function resolveStageHeroIcon(stageName: string, lifecycle: "pre_hire" | "post_hire"): string {
  const [own, other] =
    lifecycle === "pre_hire"
      ? [PRE_HIRE_STAGE_HERO, POST_HIRE_STAGE_HERO]
      : [POST_HIRE_STAGE_HERO, PRE_HIRE_STAGE_HERO];
  return (
    own[stageName] ??
    other[stageName] ??
    (lifecycle === "pre_hire" ? PRE_HIRE_STAGE_HERO.Intake! : POST_HIRE_STAGE_HERO["Payroll & Tax"]!)
  );
}

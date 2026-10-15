"use client"

import type { CSSProperties, ReactNode } from "react"
import { cn } from "@/lib/utils"

const box =
  "relative inline-grid h-[18px] w-[18px] shrink-0 place-items-center overflow-hidden rounded-[6px] border-2 box-border transition-colors leading-none"

type Props = {
  checked: boolean
  onChange: (next: boolean) => void
  children?: ReactNode
  /** When true, renders a native checkbox for form labels (e.g. login) */
  native?: boolean
  id?: string
  className?: string
  disabled?: boolean
  /** Align the box with the first line of a multi-line label (label should use a 20px line height). */
  alignFirstLine?: boolean
}

export default function OnboardingCheckbox({
  checked,
  onChange,
  children,
  native,
  id,
  className,
  disabled,
  alignFirstLine,
}: Props) {
  const checkboxColor = "var(--brand-secondary)";
  const checkboxStyle = { accentColor: checkboxColor } as CSSProperties;
  const checkedStyle = checked
    ? ({ borderColor: checkboxColor, backgroundColor: checkboxColor } as CSSProperties)
    : undefined;

  if (native && id) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          style={checkboxStyle}
          className="h-[18px] w-[18px] shrink-0 cursor-pointer rounded-[6px] border-2 border-slate-300 accent-[color:var(--brand-secondary)] focus:ring-2 focus:ring-[color:var(--brand-secondary)]/30 disabled:cursor-not-allowed disabled:opacity-50"
        />
        {children}
      </div>
    )
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={cn(
        "inline-flex gap-3 text-left",
        alignFirstLine ? "items-start" : "items-center",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <span
        className={cn(box, checked ? "text-white" : "border-slate-300 bg-white", alignFirstLine && "mt-px")}
        style={checkedStyle}
        aria-hidden
      >
        {checked ? (
          <svg
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2"
          >
            <path
              d="M2.5 6.2L4.8 8.5L9.5 3.5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
      {children ? (
        <span className={cn("flex min-w-0 flex-1 leading-none", alignFirstLine ? "items-start" : "items-center")}>
          {children}
        </span>
      ) : null}
    </button>
  )
}

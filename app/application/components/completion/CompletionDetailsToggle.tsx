"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";

type Props = {
  expanded: boolean;
  onToggle: () => void;
  expandedLabel?: string;
  collapsedLabel?: string;
};

/** View / Hide toggle with tenant primary (fallback secondary) background. */
export function CompletionDetailsToggle({
  expanded,
  onToggle,
  expandedLabel = "Hide details",
  collapsedLabel = "View steps",
}: Props) {
  const branding = useTenantBranding();
  const bg = branding.primaryHex || branding.secondaryHex || "#C4A35A";

  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:brightness-95"
      style={{ backgroundColor: bg }}
      aria-expanded={expanded}
    >
      <span>{expanded ? expandedLabel : collapsedLabel}</span>
      {expanded ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
    </button>
  );
}

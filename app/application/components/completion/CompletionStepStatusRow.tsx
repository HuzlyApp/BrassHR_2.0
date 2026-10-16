"use client";

import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import type { StepCompletionItem } from "@/lib/onboarding/workflow-completion-check";
import { stepStatusLabel } from "@/app/application/components/completion/step-status-label";

/** BrassHR / tenant brand gold for skipped step icon + label. */
export function CompletionStepStatusRow({ item }: { item: StepCompletionItem }) {
  const branding = useTenantBranding();
  const skippedColor = branding.primaryHex || "#C4A35A";

  if (item.isSkipped) {
    return (
      <div className="flex items-center justify-between text-xs text-slate-700">
        <span className="flex min-w-0 items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: skippedColor }} aria-hidden />
          <span className="font-medium truncate">{item.title}</span>
        </span>
        <span className="shrink-0 text-[11px] font-semibold" style={{ color: skippedColor }}>
          {stepStatusLabel(item.status)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between text-xs text-slate-700">
      <span className="flex min-w-0 items-center gap-2">
        {item.isComplete ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
        ) : (
          <Circle className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
        )}
        <span className="font-medium truncate">{item.title}</span>
      </span>
      <span
        className={`shrink-0 text-[11px] font-semibold ${
          item.isComplete ? "text-emerald-700" : "text-slate-500"
        }`}
      >
        {stepStatusLabel(item.status)}
      </span>
    </div>
  );
}

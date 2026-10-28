"use client";

import { useEffect, useMemo, useState } from "react";
import BrandingColorField from "@/app/tenant-onboarding/BrandingColorField";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import {
  EMPTY_HIRE_JOURNEY_THEME,
  parseHireJourneyTheme,
  resolveHireJourneyTheme,
  type HireJourneyThemeOverrides,
} from "@/lib/tenant/hire-journey-theme";

const COMPLETION_GREEN = "#12AA00";

const FIELDS: Array<{
  key: keyof HireJourneyThemeOverrides;
  label: string;
  help: string;
  fallback: "primary" | "secondary" | "white" | "green" | "border";
}> = [
  {
    key: "progressBackgroundColor",
    label: "Progress background",
    help: "Light background of the current stage card. Starts as branding primary.",
    fallback: "primary",
  },
  {
    key: "stepperIconColor",
    label: "Stepper icon color",
    help: "Icons, labels, and lines in the top progress stepper. Starts as branding primary.",
    fallback: "primary",
  },
  {
    key: "stepIconColor",
    label: "Step icon color",
    help: "Fill of the icons inside a stage. Starts as branding secondary.",
    fallback: "secondary",
  },
  {
    key: "stepIconBorderColor",
    label: "Step icon border",
    help: "Border around the icons inside a stage. Starts as branding secondary.",
    fallback: "secondary",
  },
  {
    key: "completionIconColor",
    label: "Completion icon color",
    help: "Completed stage number and completion check. Starts as green.",
    fallback: "green",
  },
  {
    key: "completedStepBackground",
    label: "Completed step background",
    help: "Background of a finished stage and the finished step rows inside it. Starts as white.",
    fallback: "white",
  },
  {
    key: "stepBorderColor",
    label: "Step border color",
    help: "Border around each step row. Starts as light gray.",
    fallback: "border",
  },
  {
    key: "modalButtonColor",
    label: "Step modal buttons",
    help: "Buttons in the step window, including Add note. Starts as branding primary.",
    fallback: "primary",
  },
];

export default function HireJourneyThemePanel() {
  const branding = useTenantBranding();
  const [overrides, setOverrides] = useState<HireJourneyThemeOverrides>(EMPTY_HIRE_JOURNEY_THEME);
  const [draft, setDraft] = useState<Record<keyof HireJourneyThemeOverrides, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const defaults = useMemo(
    () => ({
      primary: branding.primaryHex,
      secondary: branding.secondaryHex,
      white: "#FFFFFF",
      green: COMPLETION_GREEN,
      border: "#E8ECF0",
    }),
    [branding.primaryHex, branding.secondaryHex]
  );

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/hire-journey-theme")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { theme?: unknown } | null) => {
        if (cancelled || !payload) return;
        const theme = parseHireJourneyTheme(payload.theme);
        setOverrides(theme);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const resolved = resolveHireJourneyTheme(overrides, {
      primaryHex: defaults.primary,
      secondaryHex: defaults.secondary,
    });
    setDraft({
      progressBackgroundColor: resolved.progressBackgroundColor,
      stepperIconColor: resolved.stepperIconColor,
      stepIconColor: resolved.stepIconColor,
      stepIconBorderColor: resolved.stepIconBorderColor,
      completionIconColor: resolved.completionIconColor,
      completedStepBackground: resolved.completedStepBackground,
      stepBorderColor: resolved.stepBorderColor,
      modalButtonColor: resolved.modalButtonColor,
    });
  }, [defaults.primary, defaults.secondary, overrides]);

  async function save(reset = false) {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/hire-journey-theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          reset
            ? { reset: true }
            : {
                ...draft,
                defaults: { primaryHex: defaults.primary, secondaryHex: defaults.secondary },
              }
        ),
      });
      const payload = (await response.json()) as { error?: string; theme?: unknown };
      if (!response.ok) throw new Error(payload.error || "Could not save hiring journey colors.");
      setOverrides(parseHireJourneyTheme(payload.theme));
      setMessage(reset ? "Hiring journey colors now follow branding again." : "Hiring journey colors saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save hiring journey colors.");
    } finally {
      setSaving(false);
    }
  }

  if (!draft) return null;

  return (
    <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-[Inter,sans-serif] text-lg font-semibold text-[#012352]">Hiring journey</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#64748B]">
            Colors for the pre-hire and post-hire journey, including icons, progress, completed steps, and the step
            window. Defaults match branding. Saving here does not change branding.
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save(true)}
          className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-xs font-semibold text-[#334155] disabled:opacity-60"
        >
          Use branding colors
        </button>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field.key}>
            <BrandingColorField
              label={field.label}
              value={draft[field.key]}
              defaultValue={defaults[field.fallback]}
              onChange={(value) => setDraft((current) => (current ? { ...current, [field.key]: value } : current))}
            />
            <p className="mt-1 text-xs leading-5 text-[#64748B]">{field.help}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save(false)}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--brand-primary)" }}
        >
          {saving ? "Saving…" : "Save hiring journey colors"}
        </button>
        {message ? <p className="text-sm text-[#0F766E]">{message}</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>
    </section>
  );
}

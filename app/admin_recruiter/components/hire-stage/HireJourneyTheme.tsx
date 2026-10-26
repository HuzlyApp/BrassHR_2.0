"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import {
  EMPTY_HIRE_JOURNEY_THEME,
  hireJourneyThemeCssVars,
  parseHireJourneyTheme,
  resolveHireJourneyTheme,
  type HireJourneyThemeOverrides,
  type ResolvedHireJourneyTheme,
} from "@/lib/tenant/hire-journey-theme";

const HireJourneyThemeContext = createContext<ResolvedHireJourneyTheme | null>(null);

export function useHireJourneyTheme(): ResolvedHireJourneyTheme | null {
  return useContext(HireJourneyThemeContext);
}

export function HireJourneyThemeProvider({ children }: { children: React.ReactNode }) {
  const branding = useTenantBranding();
  const [overrides, setOverrides] = useState<HireJourneyThemeOverrides>(EMPTY_HIRE_JOURNEY_THEME);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/hire-journey-theme")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { theme?: unknown } | null) => {
        if (!cancelled && payload) setOverrides(parseHireJourneyTheme(payload.theme));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const theme = useMemo(
    () =>
      resolveHireJourneyTheme(overrides, {
        primaryHex: branding.primaryHex,
        secondaryHex: branding.secondaryHex,
      }),
    [branding.primaryHex, branding.secondaryHex, overrides]
  );
  const style = hireJourneyThemeCssVars(theme) as React.CSSProperties;

  return (
    <HireJourneyThemeContext.Provider value={theme}>
      <div style={style}>{children}</div>
    </HireJourneyThemeContext.Provider>
  );
}

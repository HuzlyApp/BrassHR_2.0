import { describe, expect, it } from "vitest";
import {
  hireJourneyOverrideForSave,
  hireStageSummaryPartColor,
  parseHireJourneyTheme,
  resolveHireJourneyTheme,
} from "./hire-journey-theme";

const branding = { primaryHex: "#104B83", secondaryHex: "#0F766E" };

describe("hire journey theme", () => {
  it("keeps stepper, progress background, and step icons on separate defaults", () => {
    const theme = resolveHireJourneyTheme(parseHireJourneyTheme(null), branding);
    expect(theme.progressBackgroundColor).toBe("#104B83");
    expect(theme.stepperIconColor).toBe("#104B83");
    expect(theme.stepIconColor).toBe("#0F766E");
    expect(theme.stepIconBorderColor).toBe("#0F766E");
    expect(theme.completionIconColor).toBe("#12AA00");
    expect(theme.completedStepBackground).toBe("#FFFFFF");
    expect(theme.stepBorderColor).toBe("#E8ECF0");
  });

  it("treats a saved icon color as the progress background and leaves the stepper alone", () => {
    const theme = resolveHireJourneyTheme(
      parseHireJourneyTheme({ iconColor: "#BE3B14" }),
      branding
    );
    expect(theme.progressBackgroundColor).toBe("#BE3B14");
    expect(theme.stepperIconColor).toBe("#104B83");
    expect(theme.stepIconColor).toBe("#0F766E");
  });

  it("colors stage summary words from branding and journey settings", () => {
    expect(hireStageSummaryPartColor("4 Submitted")).toBe("var(--brand-primary)");
    expect(hireStageSummaryPartColor("2 Completed")).toBe("var(--hj-complete, #12AA00)");
    expect(hireStageSummaryPartColor(" Current Step")).toBe("var(--brand-primary)");
    expect(hireStageSummaryPartColor("1 In Progress ")).toBe(
      "var(--hj-progress-bg, var(--brand-primary))"
    );
  });

  it("stores nothing when the chosen color is still the default", () => {
    expect(hireJourneyOverrideForSave("#104b83", "#104B83")).toBeNull();
    expect(hireJourneyOverrideForSave("#112233", "#104B83")).toBe("#112233");
  });
});

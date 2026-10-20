import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/jobs/application-statuses/service", () => ({
  changeApplicationStatus: vi.fn(),
  getStatusBySystemKey: vi.fn(),
}));

import { shouldAdvanceToScreeningComplete } from "@/lib/onboarding/recruiter-screening-status";

const SCREENING_SORT = 4;

describe("shouldAdvanceToScreeningComplete", () => {
  it("advances from statuses before Screening Complete in the tenant order", () => {
    expect(
      shouldAdvanceToScreeningComplete({ systemKey: "new", sortOrder: 0, legacyStatus: "new" }, SCREENING_SORT)
    ).toBe(true);
    expect(
      shouldAdvanceToScreeningComplete(
        { systemKey: null, sortOrder: 2, legacyStatus: "new" },
        SCREENING_SORT
      )
    ).toBe(true);
  });

  it("never moves a candidate backwards or re-applies the same status", () => {
    expect(
      shouldAdvanceToScreeningComplete(
        { systemKey: "reviewing", sortOrder: 4, legacyStatus: "reviewing" },
        SCREENING_SORT
      )
    ).toBe(false);
    expect(
      shouldAdvanceToScreeningComplete({ systemKey: "hired", sortOrder: 12, legacyStatus: "hired" }, SCREENING_SORT)
    ).toBe(false);
    expect(
      shouldAdvanceToScreeningComplete(
        { systemKey: "rejected", sortOrder: 15, legacyStatus: "rejected" },
        SCREENING_SORT
      )
    ).toBe(false);
  });

  it("falls back to the legacy status when the application has no catalog status", () => {
    expect(shouldAdvanceToScreeningComplete(null, SCREENING_SORT)).toBe(true);
    expect(
      shouldAdvanceToScreeningComplete({ systemKey: null, sortOrder: null, legacyStatus: "submitted" }, SCREENING_SORT)
    ).toBe(true);
    expect(
      shouldAdvanceToScreeningComplete(
        { systemKey: null, sortOrder: null, legacyStatus: "interviewing" },
        SCREENING_SORT
      )
    ).toBe(false);
  });
});

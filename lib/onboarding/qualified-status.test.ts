import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/jobs/application-statuses/service", () => ({
  changeApplicationStatus: vi.fn(),
  getStatusBySystemKey: vi.fn(),
}));

import { shouldAdvanceToQualified } from "@/lib/onboarding/qualified-status";

const QUALIFIED_SORT = 6;

describe("shouldAdvanceToQualified", () => {
  it("advances from statuses before Qualified in the tenant order", () => {
    expect(
      shouldAdvanceToQualified({ systemKey: "new", name: "New", sortOrder: 0, legacyStatus: "new" }, QUALIFIED_SORT)
    ).toBe(true);
    expect(
      shouldAdvanceToQualified(
        { systemKey: "interviewing", name: "Interview Scheduled", sortOrder: 5, legacyStatus: "interviewing" },
        QUALIFIED_SORT
      )
    ).toBe(true);
    expect(
      shouldAdvanceToQualified(
        { systemKey: null, name: "Under Review", sortOrder: 3, legacyStatus: "reviewing" },
        QUALIFIED_SORT
      )
    ).toBe(true);
  });

  it("never moves backwards or re-applies if already qualified or beyond", () => {
    expect(
      shouldAdvanceToQualified(
        { systemKey: "shortlisted", name: "Qualified", sortOrder: 6, legacyStatus: "shortlisted" },
        QUALIFIED_SORT
      )
    ).toBe(false);
    expect(
      shouldAdvanceToQualified(
        { systemKey: null, name: "Qualified", sortOrder: 6, legacyStatus: null },
        QUALIFIED_SORT
      )
    ).toBe(false);
    expect(
      shouldAdvanceToQualified(
        { systemKey: "hired", name: "Selected by Client", sortOrder: 11, legacyStatus: "hired" },
        QUALIFIED_SORT
      )
    ).toBe(false);
    expect(
      shouldAdvanceToQualified(
        { systemKey: "rejected", name: "Not a Fit", sortOrder: 13, legacyStatus: "rejected" },
        QUALIFIED_SORT
      )
    ).toBe(false);
  });

  it("falls back to legacy status when the application has no catalog status", () => {
    expect(shouldAdvanceToQualified(null, QUALIFIED_SORT)).toBe(true);
    expect(
      shouldAdvanceToQualified({ systemKey: null, name: null, sortOrder: null, legacyStatus: "submitted" }, QUALIFIED_SORT)
    ).toBe(true);
    expect(
      shouldAdvanceToQualified(
        { systemKey: null, name: null, sortOrder: null, legacyStatus: "interviewing" },
        QUALIFIED_SORT
      )
    ).toBe(true);
  });
});

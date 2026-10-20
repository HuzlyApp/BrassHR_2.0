import { describe, expect, it } from "vitest";
import { stepCheckKind, toStepCheckResult } from "@/lib/onboarding/step-check-results";

describe("step check results", () => {
  it("links background, drug and OIG nodes to compliance checks and facility approval to facility approvals", () => {
    expect(stepCheckKind("background-check")).toBe("compliance");
    expect(stepCheckKind("drug_test_screening")).toBe("compliance");
    expect(stepCheckKind("oig-exclusion-check")).toBe("compliance");
    expect(stepCheckKind("manager-facility-approval")).toBe("facility");
    expect(stepCheckKind("recruiter-screening")).toBeNull();
    expect(stepCheckKind(null)).toBeNull();
  });

  it("labels compliance results as Passed / Failed", () => {
    const passed = toStepCheckResult("compliance", {
      check_type: "drug",
      status: "passed",
      completed_at: "2026-10-01T10:00:00.000Z",
      completed_by_name: "Test User",
    });
    expect(passed).toMatchObject({
      typeLabel: "Drug test / screening",
      statusLabel: "Passed",
      tone: "success",
      completedByName: "Test User",
    });
    expect(toStepCheckResult("compliance", { check_type: "oig", status: "failed" })).toMatchObject({
      typeLabel: "OIG / exclusion check",
      statusLabel: "Failed",
      tone: "danger",
    });
    expect(toStepCheckResult("compliance", { check_type: "background" }).statusLabel).toBe("Not Started");
  });

  it("labels facility approvals as Approved / Rejected with the facility name", () => {
    expect(
      toStepCheckResult("facility", { status: "approved", facility_name: "Houston, Texas" })
    ).toMatchObject({
      typeLabel: "Facility approval",
      statusLabel: "Approved",
      tone: "success",
      facilityName: "Houston, Texas",
    });
    expect(toStepCheckResult("facility", { status: "rejected" }).statusLabel).toBe("Rejected");
    expect(toStepCheckResult("facility", {}).statusLabel).toBe("Pending");
  });
});

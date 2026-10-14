import { describe, expect, it } from "vitest";
import {
  COMPLETION_OWNER_OPTIONS,
  isApplicantCompletionOwner,
  resolveCompletionOwner,
} from "@/lib/onboarding/workflow-settings";

describe("resolveCompletionOwner", () => {
  it("offers only Candidate and Recruiter", () => {
    expect(COMPLETION_OWNER_OPTIONS.map((option) => option.label)).toEqual(["Candidate", "Recruiter"]);
  });

  it.each(["applicant", "worker", "contractor", "applicant_or_hr", "", null, undefined, " Applicant "])(
    "maps %s to Candidate",
    (owner) => {
      expect(resolveCompletionOwner(owner, "tax-forms")).toBe("applicant");
    }
  );

  it.each([
    "recruiter_or_hr",
    "hr",
    "hr_admin",
    "hr_or_payroll",
    "manager",
    "manager_or_facility",
    "operations",
    "recruiter_or_operations",
    "system",
    "authorized_internal",
  ])("maps %s to Recruiter", (owner) => {
    expect(resolveCompletionOwner(owner, "custom-step")).toBe("recruiter_or_hr");
  });

  it("keeps steps that are always staff work on Recruiter", () => {
    expect(resolveCompletionOwner("applicant", "recruiter-screening")).toBe("recruiter_or_hr");
    expect(resolveCompletionOwner("applicant", "reference-verification")).toBe("recruiter_or_hr");
  });

  it("leaves the applicant's review step on Candidate", () => {
    expect(resolveCompletionOwner("applicant", "completion-milestone")).toBe("applicant");
  });

  it("keeps runtime ownership unchanged for the canonical values", () => {
    expect(isApplicantCompletionOwner("applicant")).toBe(true);
    expect(isApplicantCompletionOwner("recruiter_or_hr")).toBe(false);
  });
});

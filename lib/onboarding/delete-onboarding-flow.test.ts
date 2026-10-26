import { describe, expect, it } from "vitest";
import { workflowDeleteBlockedMessage } from "@/lib/onboarding/onboarding-flows";

describe("workflowDeleteBlockedMessage", () => {
  it("allows delete when nothing references the workflow", () => {
    expect(
      workflowDeleteBlockedMessage({
        jobs: 0,
        applications: 0,
        mappings: 0,
        applicants: 0,
      })
    ).toBeNull();
  });

  it("names the records that still use the workflow", () => {
    expect(
      workflowDeleteBlockedMessage({
        jobs: 1,
        applications: 2,
        mappings: 1,
        applicants: 0,
      })
    ).toBe(
      "This workflow is still used by 1 job, 2 applications, 1 mapping. Reassign those before deleting it."
    );
  });
});

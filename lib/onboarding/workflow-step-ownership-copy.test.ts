import { describe, expect, it } from "vitest";
import { workflowStepOwnershipCopy } from "@/lib/onboarding/workflow-step-ownership-copy";

describe("workflowStepOwnershipCopy", () => {
  it("says candidate or recruiter can upload for resume steps", () => {
    const copy = workflowStepOwnershipCopy({ kind: "resume", staffCanAct: false });
    expect(copy.stepFor).toBe("Candidate or recruiter can upload resume");
    expect(copy.badge).toBe("Candidate or recruiter step");
  });

  it("keeps candidate wording for other candidate steps", () => {
    const copy = workflowStepOwnershipCopy({ kind: "upload", staffCanAct: false });
    expect(copy.stepFor).toBe("Candidate step");
    expect(copy.note).toBe("Read-only submission from the candidate.");
  });

  it("tells staff they can upload on candidate steps with upload fields", () => {
    const copy = workflowStepOwnershipCopy({ kind: "upload", staffCanAct: false, staffCanUpload: true });
    expect(copy.badge).toBe("Candidate step");
    expect(copy.note).toMatch(/upload them for the candidate/);
  });

  it("uses recruiter wording when staff can act", () => {
    const copy = workflowStepOwnershipCopy({ kind: "resume", staffCanAct: true });
    expect(copy.stepFor).toBe("Recruiter step");
  });
});

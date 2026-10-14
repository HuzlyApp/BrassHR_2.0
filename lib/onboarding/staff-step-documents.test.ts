import { describe, expect, it } from "vitest";
import {
  buildStepDocumentUploads,
  staffUploaderIdFromPath,
  stepUploadRequirements,
} from "@/lib/onboarding/staff-step-documents";
import type { TenantRequiredDocument } from "@/lib/onboarding/types";

function requirement(id: string, title: string, isRequired = true, stepId = "step-1"): TenantRequiredDocument {
  return {
    id,
    onboarding_step_id: stepId,
    title,
    description: null,
    is_required: isRequired,
    sort_order: 0,
    accepted_file_types: ["pdf"],
    max_file_size_mb: 10,
  };
}

const license = requirement("req-license", "Nursing License");
const cpr = requirement("req-cpr", "CPR Certification", false);

describe("stepUploadRequirements", () => {
  it("returns only this step's tenant requirements", () => {
    const config = {
      requiredDocuments: [
        license,
        requirement("req-other", "Other", true, "step-2"),
        { ...requirement("req-wf", "Workflow doc"), source: "workflow" as const },
      ],
    };
    expect(stepUploadRequirements(config, "step-1").map((doc) => doc.id)).toEqual(["req-license"]);
    expect(stepUploadRequirements(config, null)).toEqual([]);
  });
});

describe("buildStepDocumentUploads", () => {
  const base = {
    workerId: "worker-1",
    stepType: "credential-license-verification",
    requirements: [license, cpr],
    identityRow: null,
    candidateOwned: true,
    stepStatus: "pending",
  };

  it("lists missing required documents and blocks completing for the candidate", () => {
    const result = buildStepDocumentUploads({ ...base, submittedRows: [] });
    expect(result.slots.map((slot) => slot.title)).toEqual(["Nursing License", "CPR Certification"]);
    expect(result.missingRequired).toEqual(["Nursing License"]);
    expect(result.canUpload).toBe(true);
    expect(result.canCompleteForCandidate).toBe(false);
  });

  it("allows completing once every required document is in, using the newest file per requirement", () => {
    const result = buildStepDocumentUploads({
      ...base,
      submittedRows: [
        { id: "doc-new", required_document_id: "req-license", status: "uploaded" },
        { id: "doc-old", required_document_id: "req-license", status: "rejected" },
      ],
    });
    expect(result.slots[0].documentId).toBe("doc-new");
    expect(result.missingRequired).toEqual([]);
    expect(result.canCompleteForCandidate).toBe(true);
  });

  it("treats a rejected required document as missing", () => {
    const result = buildStepDocumentUploads({
      ...base,
      submittedRows: [{ id: "doc-1", required_document_id: "req-license", status: "rejected" }],
    });
    expect(result.missingRequired).toEqual(["Nursing License"]);
    expect(result.canCompleteForCandidate).toBe(false);
  });

  it("never offers candidate completion on staff steps or closed steps", () => {
    const rows = [{ id: "doc-1", required_document_id: "req-license", status: "uploaded" }];
    expect(
      buildStepDocumentUploads({ ...base, submittedRows: rows, candidateOwned: false }).canCompleteForCandidate
    ).toBe(false);
    const completed = buildStepDocumentUploads({ ...base, submittedRows: rows, stepStatus: "completed" });
    expect(completed.canCompleteForCandidate).toBe(false);
    expect(completed.canUpload).toBe(false);
  });

  it("needs at least one file when every document is optional", () => {
    const result = buildStepDocumentUploads({ ...base, requirements: [cpr], submittedRows: [] });
    expect(result.missingRequired).toEqual([]);
    expect(result.canCompleteForCandidate).toBe(false);
  });

  it("adds SSN and driver's license fields on the identity step", () => {
    const result = buildStepDocumentUploads({
      ...base,
      stepType: "ssn-identity-verification",
      requirements: [],
      submittedRows: [],
      identityRow: { id: "wd-1", ssn_url: "t/w/ssn.pdf" },
    });
    expect(result.slots.map((slot) => slot.key)).toEqual(["ssn_front", "ssn_back", "dl_front", "dl_back"]);
    expect(result.slots[0].documentId).toBe("wd-1:ssn_url");
    expect(result.missingRequired).toEqual(["Driver's license (front)"]);
    expect(result.canCompleteForCandidate).toBe(false);
  });
});

describe("staffUploaderIdFromPath", () => {
  it("reads the staff user id from admin upload paths only", () => {
    expect(
      staffUploaderIdFromPath("t1/w1/admin/0f8fad5b-d9cb-469f-a165-70867728950e/ssn_url/x.pdf")
    ).toBe("0f8fad5b-d9cb-469f-a165-70867728950e");
    expect(staffUploaderIdFromPath("t1/w1/req-1/x.pdf")).toBeNull();
    expect(staffUploaderIdFromPath(null)).toBeNull();
  });
});

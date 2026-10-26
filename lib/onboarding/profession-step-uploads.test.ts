import { describe, expect, it } from "vitest";
import { buildStepDocumentUploads } from "@/lib/onboarding/staff-step-documents";
import {
  applyProfessionDocumentsToStepUploads,
  isProfessionDocumentExpired,
  stepShowsProfessionDocuments,
} from "@/lib/onboarding/profession-step-uploads";
import type { ProfessionUploadDocument } from "@/lib/professions/profession-documents";

const java: ProfessionUploadDocument = {
  id: "doc-java",
  name: "Java",
  documentKind: "license",
  isRequired: true,
  hasExpiration: true,
  sortOrder: 1,
};

const cpp: ProfessionUploadDocument = {
  id: "doc-cpp",
  name: "C++",
  documentKind: "certificate",
  isRequired: false,
  hasExpiration: false,
  sortOrder: 2,
};

function baseUploads(stepStatus = "submitted") {
  return buildStepDocumentUploads({
    workerId: "worker-1",
    stepType: "collect-extra-files",
    requirements: [
      {
        id: "req-extra",
        onboarding_step_id: "step-1",
        title: "Extra File",
        description: null,
        is_required: true,
        sort_order: 10,
        accepted_file_types: [],
        max_file_size_mb: 10,
      },
    ],
    submittedRows: [],
    identityRow: null,
    candidateOwned: true,
    stepStatus,
  });
}

describe("isProfessionDocumentExpired", () => {
  it("is expired only when the expiry date is before today", () => {
    expect(isProfessionDocumentExpired("2026-10-19", "2026-10-20")).toBe(true);
    expect(isProfessionDocumentExpired("2026-10-20", "2026-10-20")).toBe(false);
    expect(isProfessionDocumentExpired("2027-01-01", "2026-10-20")).toBe(false);
    expect(isProfessionDocumentExpired(null, "2026-10-20")).toBe(false);
  });
});

describe("stepShowsProfessionDocuments", () => {
  it("matches the collect documents step", () => {
    expect(stepShowsProfessionDocuments({ stepType: "collect-extra-files" })).toBe(true);
    expect(stepShowsProfessionDocuments({ workflowStepId: "collect-extra-files" })).toBe(true);
    expect(stepShowsProfessionDocuments({ stepType: "recruiter-screening" })).toBe(false);
  });
});

describe("applyProfessionDocumentsToStepUploads", () => {
  it("replaces Extra File with the profession documents and the candidate's files", () => {
    const result = applyProfessionDocumentsToStepUploads({
      uploads: baseUploads(),
      documents: [cpp, java],
      files: [
        {
          id: "file-java",
          professionDocumentId: "doc-java",
          fileName: "Test Data Company Logo.png",
          fileUrl: "t/w/java.png",
          fileType: "image/png",
          fileSize: 1200,
          status: "uploaded",
          uploadedAt: "2026-10-20T05:00:00.000Z",
          issuedDate: "2026-01-01",
          expiryDate: "2027-01-01",
        },
      ],
      stepStatus: "submitted",
      candidateOwned: true,
    });

    expect(result.slots.map((slot) => slot.title)).toEqual(["Java", "C++"]);
    expect(result.slots[0]).toMatchObject({
      documentId: "file-java",
      required: true,
      detail: "License",
      professionDocumentId: "doc-java",
      collectDates: true,
      issuedDate: "2026-01-01",
      expiryDate: "2027-01-01",
    });
    expect(result.slots[1]).toMatchObject({
      documentId: null,
      required: false,
      detail: "Certificate",
    });
    expect(result.missingRequired).toEqual([]);
    expect(result.canUpload).toBe(true);
  });

  it("keeps an upload action when the candidate skipped a required document", () => {
    const result = applyProfessionDocumentsToStepUploads({
      uploads: baseUploads("skipped"),
      documents: [java],
      files: [],
      stepStatus: "skipped",
      candidateOwned: true,
    });

    expect(result.slots[0].documentId).toBeNull();
    expect(result.missingRequired).toEqual(["Java"]);
    expect(result.canUpload).toBe(true);
  });

  it("closes uploads after the recruiter marks the step complete", () => {
    const result = applyProfessionDocumentsToStepUploads({
      uploads: baseUploads("completed"),
      documents: [java],
      files: [],
      stepStatus: "completed",
      candidateOwned: true,
    });
    expect(result.canUpload).toBe(false);
  });

  it("stays open after the candidate submits, until the recruiter verifies", () => {
    const result = applyProfessionDocumentsToStepUploads({
      uploads: baseUploads("completed"),
      documents: [java],
      files: [],
      stepStatus: "completed",
      uploadsClosed: false,
      candidateOwned: true,
    });
    expect(result.canUpload).toBe(true);
    expect(result.missingRequired).toEqual(["Java"]);
  });

  it("flags an uploaded document whose expiry date has passed", () => {
    const result = applyProfessionDocumentsToStepUploads({
      uploads: baseUploads(),
      documents: [java],
      files: [
        {
          id: "file-java",
          professionDocumentId: "doc-java",
          fileName: "license.png",
          fileUrl: "t/w/java.png",
          fileType: "image/png",
          fileSize: 1200,
          status: "uploaded",
          uploadedAt: "2026-01-02T00:00:00.000Z",
          issuedDate: "2024-01-01",
          expiryDate: "2025-01-01",
        },
      ],
      stepStatus: "submitted",
      today: "2026-10-20",
      candidateOwned: true,
    });
    expect(result.slots[0].expired).toBe(true);

    const current = applyProfessionDocumentsToStepUploads({
      uploads: baseUploads(),
      documents: [java],
      files: [
        {
          id: "file-java",
          professionDocumentId: "doc-java",
          fileName: "license.png",
          fileUrl: "t/w/java.png",
          fileType: "image/png",
          fileSize: 1200,
          status: "uploaded",
          uploadedAt: "2026-01-02T00:00:00.000Z",
          issuedDate: "2026-01-01",
          expiryDate: "2027-01-01",
        },
      ],
      stepStatus: "submitted",
      today: "2026-10-20",
      candidateOwned: true,
    });
    expect(current.slots[0].expired).toBe(false);
  });
});

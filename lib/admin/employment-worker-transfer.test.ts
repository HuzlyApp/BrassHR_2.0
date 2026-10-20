import { describe, expect, it } from "vitest";
import {
  buildApplicationSnapshotFromRow,
  pushLegacyDocumentFields,
  type EmploymentDocumentManifestItem,
} from "./employment-worker-transfer";

describe("employment-worker-transfer", () => {
  it("builds application snapshot from job_applications row", () => {
    expect(
      buildApplicationSnapshotFromRow({
        id: "app-1",
        status: "hired",
        job_requisition_id: "job-1",
        submitted_at: "2026-01-01T00:00:00.000Z",
        hired_at: "2026-02-01T00:00:00.000Z",
        workflow_phase: "post_hire",
        source: "portal",
        ai_match_score: 88,
      })
    ).toEqual({
      id: "app-1",
      status: "hired",
      jobRequisitionId: "job-1",
      submittedAt: "2026-01-01T00:00:00.000Z",
      hiredAt: "2026-02-01T00:00:00.000Z",
      workflowPhase: "post_hire",
      source: "portal",
      aiMatchScore: 88,
    });
  });

  it("returns null when application id missing", () => {
    expect(buildApplicationSnapshotFromRow(null)).toBeNull();
    expect(buildApplicationSnapshotFromRow({ id: null })).toBeNull();
  });

  it("pushes non-empty legacy document url fields into manifest", () => {
    const items: EmploymentDocumentManifestItem[] = [];
    pushLegacyDocumentFields(items, {
      id: "doc-1",
      application_id: "app-1",
      ssn_url: "tenant/worker/ssn.pdf",
      drivers_license_url: "  ",
      nursing_license_url: null,
    });
    expect(items).toEqual([
      {
        source: "worker_documents",
        id: "doc-1",
        title: "ssn_url",
        path: "tenant/worker/ssn.pdf",
        bucket: "worker_required_files",
        applicationId: "app-1",
        field: "ssn_url",
      },
    ]);
  });
});

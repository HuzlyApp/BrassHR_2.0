import { describe, expect, it } from "vitest";
import {
  mapApplicationStatusUsageRow,
  statusDeleteBlockReason,
} from "./status-catalog-audit";

describe("status catalog edits", () => {
  it("keeps a status when candidates or jobs are still tied to it", () => {
    expect(statusDeleteBlockReason(0)).toBeNull();
    expect(statusDeleteBlockReason(1)).toMatch(/1 application/);
    expect(statusDeleteBlockReason(1)).toMatch(/not lost/);
    expect(statusDeleteBlockReason(4)).toMatch(/4 applications/);
  });

  it("maps a tied application to the candidate and job without changing ids", () => {
    const record = mapApplicationStatusUsageRow({
      id: "app-1",
      worker_id: "worker-1",
      job_requisition_id: "job-1",
      worker: { first_name: "Jamie", last_name: "Cole" },
      job_requisitions: { public_title: "ICU Nurse", source_job_title: "RN" },
    });
    expect(record).toEqual({
      applicationId: "app-1",
      candidateName: "Jamie Cole",
      workerId: "worker-1",
      jobId: "job-1",
      jobTitle: "ICU Nurse",
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  isAnalyzedJobApplication,
  tallyApplicationMetrics,
  tallyJobListApplicationMetrics,
} from "@/lib/jobs/job-list-application-metrics";

describe("tallyJobListApplicationMetrics", () => {
  it("counts every application for the job, including rejected and withdrawn", () => {
    const metrics = tallyJobListApplicationMetrics([
      { job_requisition_id: "job-1", status: "rejected" },
      { job_requisition_id: "job-1", status: "withdrawn" },
      { job_requisition_id: "job-1", status: "rejected" },
      { job_requisition_id: "job-1", status: "new" },
      { job_requisition_id: "job-1", status: "new" },
      { job_requisition_id: "job-1", status: "reviewing" },
    ]);

    expect(metrics.get("job-1")?.applicantCount).toBe(6);
  });

  it("counts nested job-card rows that have no job_requisition_id", () => {
    const metrics = tallyApplicationMetrics([
      { status: "rejected" },
      { status: "new" },
      { status: "new" },
      { status: "reviewing" },
    ]);
    expect(metrics.applicantCount).toBe(4);
  });

  it("includes archived, rejected, and withdrawn on All", () => {
    const metrics = tallyApplicationMetrics([
      { status: "rejected" },
      { status: "withdrawn" },
      { status: "new", application_statuses: { system_key: "archived" } },
      { status: "new" },
      { status: "new" },
      { status: "reviewing" },
    ]);
    expect(metrics.applicantCount).toBe(6);
  });

  it("includes rejected applications in analysis metrics", () => {
    const metrics = tallyJobListApplicationMetrics([
      {
        job_requisition_id: "job-1",
        status: "rejected",
        ai_match_status: "ANALYZED",
        ai_match_score: 92,
        ai_match_readiness: "READY_TO_SUBMIT",
      },
      {
        job_requisition_id: "job-1",
        status: "new",
        ai_match_status: "ANALYZED",
        ai_match_score: 45,
      },
    ]);

    expect(metrics.get("job-1")).toMatchObject({
      applicantCount: 2,
      analyzedCount: 2,
      strongCount: 1,
      readyCount: 1,
    });
  });

  it("counts a score or analyzed timestamp the same way as the dashboard ANALYSIS box", () => {
    expect(isAnalyzedJobApplication({ ai_match_score: 40 })).toBe(true);
    expect(isAnalyzedJobApplication({ ai_analyzed_at: "2026-01-01T00:00:00.000Z" })).toBe(true);
    expect(isAnalyzedJobApplication({ ai_match_status: "READY", ai_match_score: null })).toBe(false);

    const metrics = tallyApplicationMetrics([
      { status: "new", ai_match_score: 12 },
      { status: "new", ai_analyzed_at: "2026-01-01T00:00:00.000Z" },
      { status: "new" },
    ]);
    expect(metrics.analyzedCount).toBe(2);
  });

  it("picks the in-process status tab with the most candidates for redirect", () => {
    const metrics = tallyApplicationMetrics([
      {
        status: "reviewing",
        application_statuses: { system_key: "reviewing", name: "Screening Complete" },
      },
      {
        status: "interviewing",
        application_statuses: { system_key: "interviewing", name: "Interview Complete" },
      },
      {
        status: "interviewing",
        application_statuses: { system_key: "interviewing", name: "Interview Complete" },
      },
    ]);

    expect(metrics.inProcessCount).toBe(3);
    expect(metrics.inProcessRedirectTab).toBe("interviewing");
  });
});

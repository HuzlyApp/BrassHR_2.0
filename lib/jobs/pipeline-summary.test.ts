import { describe, expect, it } from "vitest";
import {
  jobDetailsStatsFromPipelineSummary,
  tallyJobPipelineSummary,
} from "@/lib/jobs/pipeline-summary";

describe("tallyJobPipelineSummary", () => {
  it("maps FSD buckets and card rollups", () => {
    const summary = tallyJobPipelineSummary(
      [
        { status: "new" },
        { status: "submitted" },
        { status: "reviewing" },
        { status: "shortlisted" },
        { status: "interviewing" },
        { status: "hired" },
        { status: "rejected" },
        {
          status: "reviewing",
          application_statuses: { system_key: "at_msp", name: "At MSP" },
        },
        {
          status: "hired",
          application_statuses: { system_key: "onboarding", name: "Onboarding" },
        },
      ],
      { showSubmission: true }
    );

    expect(summary).toEqual({
      all: 9,
      intake: 2,
      screening: 1,
      interview: 2,
      submission: 1,
      selected: 1,
      onboarding: 1,
      closed: 1,
      show_submission: true,
      closed_redirect_tab: "rejected",
      in_process_redirect_tab: "reviewing",
    });

    const stats = jobDetailsStatsFromPipelineSummary(summary);
    expect(stats.applicationsNew).toBe(2);
    expect(stats.applicationsInProcess).toBe(3);
    expect(stats.applicationsAtMsp).toBe(1);
    expect(stats.applicationsHired).toBe(2);
    expect(stats.showSubmission).toBe(true);
  });

  it("counts Submitted to MSP separately from later client and rejection stages", () => {
    const summary = tallyJobPipelineSummary(
      [
        {
          status: "custom",
          application_statuses: { system_key: null, name: "Submitted to MSP" },
        },
        {
          status: "custom",
          application_statuses: { system_key: null, name: "Presented to Client" },
        },
        {
          status: "custom",
          application_statuses: { system_key: null, name: "Profile Ready" },
        },
        {
          status: "rejected",
          application_statuses: { system_key: null, name: "Rejected by MSP" },
        },
      ],
      { showSubmission: true }
    );
    expect(summary.submission).toBe(1);
    expect(summary.closed).toBe(1);
  });

  it("keeps MSP submission at 0 when show_submission is false", () => {
    const summary = tallyJobPipelineSummary(
      [
        {
          status: "reviewing",
          application_statuses: { system_key: "at_msp", name: "At MSP" },
        },
      ],
      { showSubmission: false }
    );
    expect(summary.submission).toBe(0);
    expect(summary.screening).toBe(1);
    expect(summary.show_submission).toBe(false);
  });

  it("redirects Closed card to the status tab that owns the closed candidate", () => {
    const summary = tallyJobPipelineSummary(
      [
        {
          status: "rejected",
          application_statuses: {
            system_key: null,
            name: "Candidate Withdrew",
          },
        },
        {
          status: "rejected",
          application_statuses: { system_key: "rejected", name: "Not a Fit" },
        },
      ],
      { showSubmission: false }
    );

    expect(summary.closed).toBe(2);
    expect(summary.closed_redirect_tab).toBe("candidate-withdrew");
  });

  it("prefers the closed status with the most candidates for redirect", () => {
    const summary = tallyJobPipelineSummary(
      [
        {
          status: "rejected",
          application_statuses: { system_key: "rejected", name: "Not a Fit" },
        },
        {
          status: "rejected",
          application_statuses: { system_key: "rejected", name: "Not a Fit" },
        },
        {
          status: "archived",
          application_statuses: { system_key: "archived", name: "Position Closed" },
        },
      ],
      { showSubmission: false }
    );

    expect(summary.closed).toBe(3);
    expect(summary.closed_redirect_tab).toBe("rejected");
  });

  it("prefers the in-process status with the most candidates for redirect", () => {
    const summary = tallyJobPipelineSummary(
      [
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
      ],
      { showSubmission: false }
    );

    expect(summary.screening).toBe(1);
    expect(summary.interview).toBe(2);
    expect(summary.in_process_redirect_tab).toBe("interviewing");
  });
});

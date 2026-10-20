import { describe, expect, it } from "vitest";
import { toCandidateInterviews, type CandidateInterviewRow } from "@/lib/interviews/candidate-interview-history";
import { stepDisplayStatusLabel, stepStatusPill } from "@/lib/onboarding/assigned-workflow-steps";
import {
  interviewStepStatus,
  isInterviewStep,
  resolveCandidateInterviewStatus,
  summarizeInterviews,
  withInterviewSummary,
} from "@/lib/onboarding/interview-step";
import { allowedStaffActions, staffActionLabel, staffStepVariantForLibraryId } from "@/lib/onboarding/staff-step-review-shared";

const NOW = Date.parse("2026-10-07T12:00:00Z");

function row(partial: Partial<CandidateInterviewRow> & { id: string; scheduled_date: string }): CandidateInterviewRow {
  return {
    title: "Interview with Naveed Khan",
    status: "upcoming",
    start_time: "12:00:00",
    end_time: "12:30:00",
    meeting_type: "online",
    meeting_link: null,
    location: null,
    notes: null,
    created_at: "2026-10-01T07:55:51Z",
    ...partial,
  };
}

describe("interview step status", () => {
  it("treats a passed, still-upcoming interview as awaiting its outcome", () => {
    expect(resolveCandidateInterviewStatus("upcoming", "2026-10-08T16:00:00Z", NOW)).toBe("scheduled");
    expect(resolveCandidateInterviewStatus("rescheduled", "2026-10-08T16:00:00Z", NOW)).toBe("rescheduled");
    expect(resolveCandidateInterviewStatus("upcoming", "2026-10-06T16:30:00Z", NOW)).toBe("awaiting_outcome");
    expect(resolveCandidateInterviewStatus("cancelled", "2026-10-08T16:00:00Z", NOW)).toBe("cancelled");
    expect(resolveCandidateInterviewStatus("completed", "2026-10-06T16:30:00Z", NOW)).toBe("completed");
  });

  it("numbers interviews by start time and skips cancelled ones", () => {
    const interviews = toCandidateInterviews(
      [
        row({ id: "late", scheduled_date: "2026-10-08" }),
        row({ id: "cancelled", scheduled_date: "2026-10-05", status: "cancelled" }),
        row({ id: "early", scheduled_date: "2026-10-06", start_time: "12:30:00", end_time: "13:00:00" }),
      ],
      new Map([["late", [{ name: "Test User", email: "test@example.com" }]]]),
      NOW
    );
    expect(interviews.map((i) => [i.id, i.sequence, i.status])).toEqual([
      ["cancelled", null, "cancelled"],
      ["early", 1, "awaiting_outcome"],
      ["late", 2, "scheduled"],
    ]);
    expect(interviews[2]!.interviewers).toEqual([{ name: "Test User", email: "test@example.com" }]);

    const summary = summarizeInterviews(interviews);
    expect(summary.count).toBe(2);
    expect(summary.latest?.id).toBe("late");
  });

  it("shows the latest interview's state until staff record the outcome", () => {
    const interviews = toCandidateInterviews([row({ id: "a", scheduled_date: "2026-10-08" })], new Map(), NOW);
    const interview = summarizeInterviews(interviews);
    const empty = summarizeInterviews([]);

    expect(interviewStepStatus({ displayStatus: "not_started", interview: empty })?.key).toBe("not_scheduled");
    expect(stepDisplayStatusLabel({ displayStatus: "not_started", interview: empty })).toBe("Not Scheduled");
    expect(stepStatusPill({ displayStatus: "not_started", interview: empty })).toBeNull();

    expect(stepStatusPill({ displayStatus: "not_started", interview })).toEqual({ label: "Scheduled", tone: "info" });
    expect(stepStatusPill({ displayStatus: "completed", interview })).toEqual({ label: "Completed", tone: "success" });
    expect(stepStatusPill({ displayStatus: "blocked", interview })).toEqual({ label: "Rejected", tone: "danger" });

    const past = summarizeInterviews(
      toCandidateInterviews([row({ id: "b", scheduled_date: "2026-10-06" })], new Map(), NOW)
    );
    expect(stepDisplayStatusLabel({ displayStatus: "not_started", interview: past })).toBe("Awaiting Decision");
  });

  it("only attaches interview data to interview steps", () => {
    const summary = summarizeInterviews([]);
    const steps = withInterviewSummary(
      [
        { stepKey: "a", stepType: "interview-qualification", onboardingType: "custom", title: "Interview / Qualification" },
        { stepKey: "b", stepType: "internal-select", onboardingType: "custom", title: "Internal Select" },
      ],
      summary
    );
    expect(steps[0]!.interview).toBe(summary);
    expect(steps[1]!.interview).toBeUndefined();
    expect(isInterviewStep({ title: "Nexus Interview" })).toBe(true);
  });

  it("offers Mark Completed / Reject on interview steps and lets staff switch the outcome", () => {
    expect(staffStepVariantForLibraryId("interview-qualification")).toBe("interview");
    expect(allowedStaffActions("pending", "interview")).toEqual(["complete", "reject"]);
    expect(allowedStaffActions("completed", "interview")).toEqual(["reject"]);
    expect(allowedStaffActions("failed", "interview")).toEqual(["complete"]);
    expect(staffActionLabel("complete", "interview")).toBe("Mark Completed");
    expect(staffActionLabel("reject", "interview")).toBe("Reject");
  });

  it("labels rejected generic steps as Rejected", () => {
    expect(stepDisplayStatusLabel({ displayStatus: "blocked", stepType: "background-check" })).toBe("Rejected");
    expect(stepStatusPill({ displayStatus: "blocked", stepType: "background-check" })).toEqual({
      label: "Rejected",
      tone: "danger",
    });
  });
});

import type { WorkflowStepDisplayStatus } from "@/lib/onboarding/assigned-workflow-steps";

export type CandidateInterviewStatus =
  | "scheduled"
  | "rescheduled"
  | "awaiting_outcome"
  | "completed"
  | "cancelled";

export type CandidateInterviewer = { name: string; email: string };

export type CandidateInterview = {
  id: string;
  /** 1-based order among non-cancelled interviews, by start time. Null for cancelled ones. */
  sequence: number | null;
  title: string;
  status: CandidateInterviewStatus;
  startsAt: string;
  endsAt: string | null;
  meetingType: string | null;
  meetingLink: string | null;
  location: string | null;
  notes: string | null;
  interviewers: CandidateInterviewer[];
  createdAt: string;
};

export type InterviewStepSummary = {
  /** Non-cancelled interviews. */
  count: number;
  /** Most recent non-cancelled interview by start time. */
  latest: CandidateInterview | null;
};

export type InterviewStepStatusKey =
  | "not_scheduled"
  | "scheduled"
  | "awaiting_decision"
  | "completed"
  | "rejected";

export type StepPillTone = "success" | "warning" | "danger" | "info" | "neutral";

const INTERVIEW_STEP_STATUS: Record<InterviewStepStatusKey, { label: string; tone: StepPillTone }> = {
  not_scheduled: { label: "Not Scheduled", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "info" },
  awaiting_decision: { label: "Awaiting Decision", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

const INTERVIEW_STATUS_LABELS: Record<CandidateInterviewStatus, string> = {
  scheduled: "Scheduled",
  rescheduled: "Rescheduled",
  awaiting_outcome: "Awaiting Outcome",
  completed: "Completed",
  cancelled: "Cancelled",
};

const INTERVIEW_STATUS_TONES: Record<CandidateInterviewStatus, StepPillTone> = {
  scheduled: "info",
  rescheduled: "info",
  awaiting_outcome: "warning",
  completed: "success",
  cancelled: "neutral",
};

/** Steps that book time with the candidate (Internal Select etc. in the same stage don't qualify). */
export function isInterviewStep(step: {
  stepKey?: string | null;
  stepType?: string | null;
  onboardingType?: string | null;
  title?: string | null;
}): boolean {
  const hay = `${step.stepKey ?? ""} ${step.stepType ?? ""} ${step.onboardingType ?? ""} ${step.title ?? ""}`;
  return /interview/i.test(hay);
}

type InterviewStepLike = Parameters<typeof isInterviewStep>[0] & { interview?: InterviewStepSummary | null };

export function withInterviewSummary<T extends InterviewStepLike>(steps: T[], summary: InterviewStepSummary): T[] {
  return steps.map((step) => (isInterviewStep(step) ? { ...step, interview: summary } : step));
}

export function resolveCandidateInterviewStatus(
  rowStatus: string | null | undefined,
  startsAt: string,
  nowMs: number
): CandidateInterviewStatus {
  const value = String(rowStatus ?? "").trim().toLowerCase();
  if (value === "cancelled") return "cancelled";
  if (value === "completed") return "completed";
  const startMs = new Date(startsAt).getTime();
  if (Number.isFinite(startMs) && startMs < nowMs) return "awaiting_outcome";
  return value === "rescheduled" ? "rescheduled" : "scheduled";
}

export function summarizeInterviews(interviews: readonly CandidateInterview[]): InterviewStepSummary {
  const active = interviews.filter((interview) => interview.status !== "cancelled");
  const latest = active.reduce<CandidateInterview | null>((best, interview) => {
    if (!best) return interview;
    return new Date(interview.startsAt).getTime() >= new Date(best.startsAt).getTime() ? interview : best;
  }, null);
  return { count: active.length, latest };
}

/** Interview steps read their state from the staff decision first, then the latest booked interview. */
export function interviewStepStatus(step: {
  displayStatus: WorkflowStepDisplayStatus;
  interview?: InterviewStepSummary | null;
}): { key: InterviewStepStatusKey; label: string; tone: StepPillTone } | null {
  if (!step.interview) return null;
  let key: InterviewStepStatusKey;
  if (step.displayStatus === "completed" || step.displayStatus === "approved") key = "completed";
  else if (step.displayStatus === "rejected" || step.displayStatus === "blocked") key = "rejected";
  else if (!step.interview.latest) key = "not_scheduled";
  else if (
    step.interview.latest.status === "scheduled" ||
    step.interview.latest.status === "rescheduled"
  ) {
    key = "scheduled";
  } else key = "awaiting_decision";
  return { key, ...INTERVIEW_STEP_STATUS[key] };
}

export function candidateInterviewStatusLabel(status: CandidateInterviewStatus): string {
  return INTERVIEW_STATUS_LABELS[status];
}

export function candidateInterviewStatusTone(status: CandidateInterviewStatus): StepPillTone {
  return INTERVIEW_STATUS_TONES[status];
}

/** Rounded status pill classes shared by the hire journey rows and the step modal. */
export const STEP_PILL_TONE_CLASSES: Record<StepPillTone, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-orange-50 text-orange-800 ring-orange-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
  info: "bg-blue-50 text-blue-700 ring-blue-200",
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
};

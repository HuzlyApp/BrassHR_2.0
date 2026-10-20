import type { OnboardingStepStatus } from "@/lib/onboarding/types";

export const STAFF_STEP_ACTIONS = ["complete", "needs_review", "reject", "reopen"] as const;

export type StaffStepAction = (typeof STAFF_STEP_ACTIONS)[number];

/** Stored on `worker_onboarding_step_progress.data.staff_review`. */
export type StaffStepReview = {
  decision: StaffStepAction;
  note: string | null;
  reviewedByUserId: string | null;
  reviewedByName: string | null;
  reviewedAt: string;
};

export type StaffStepActionEligibility = {
  allowed: boolean;
  ownerLabel: string | null;
  actions: StaffStepAction[];
  variant: StaffStepVariant;
  reason: string | null;
};

export type StaffStepEmailResult = {
  sent: boolean;
  skipped: boolean;
  reason?: string;
  nextStepTitle?: string | null;
  /** Set when the requested step was still locked, so the email opened `nextStepTitle` instead. */
  lockedStepTitle?: string | null;
};

export const STAFF_REVIEW_NOTE_MAX_LENGTH = 2000;

const OWNER_LABELS: Record<string, string> = {
  recruiter: "Recruiter",
  recruiter_or_hr: "Recruiter / HR",
  hr: "HR",
  hr_admin: "HR Admin",
  admin: "Admin",
  manager: "Manager",
  hiring_manager: "Hiring Manager",
  facility: "Facility",
  facility_manager: "Facility Manager",
  system: "System",
  internal: "Internal team",
};

export function completionOwnerLabel(owner: string | null | undefined): string {
  const value = String(owner ?? "").trim().toLowerCase();
  if (!value) return "Internal team";
  const known = OWNER_LABELS[value];
  if (known) return known;
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => (part === "or" ? "/" : part === "hr" ? "HR" : part[0]!.toUpperCase() + part.slice(1)))
    .join(" ");
}

/**
 * Decision steps offer three outcomes at any time and never block the candidate:
 * reference verification (Verified / Need to Review / Rejected) and
 * internal select (Selected / On Hold / Not Selected).
 */
export type StaffDecisionVariant = "verification" | "selection";
/** Interview steps record the interview outcome: Mark Completed or Reject, switchable later. */
export type StaffStepVariant = "default" | "interview" | StaffDecisionVariant;
export type StaffDecisionAction = "complete" | "needs_review" | "reject";

export const STAFF_DECISION_ACTIONS: readonly StaffDecisionAction[] = ["complete", "needs_review", "reject"];

const DECISION_COPY: Record<
  StaffDecisionVariant,
  { pending: string; labels: Record<StaffDecisionAction, string>; results: Record<StaffDecisionAction, string> }
> = {
  verification: {
    pending: "Need to Verify",
    labels: { complete: "Verified", needs_review: "Need to Review", reject: "Rejected" },
    results: {
      complete: "References marked as verified.",
      needs_review: "References marked as needing review.",
      reject: "References rejected. This doesn't block the candidate's next stage.",
    },
  },
  selection: {
    pending: "Pending Decision",
    labels: { complete: "Qualified", needs_review: "On Hold", reject: "Not Selected" },
    results: {
      complete: "Candidate marked as qualified.",
      needs_review: "Candidate put on hold.",
      reject: "Candidate marked as not selected. This doesn't block the next stage.",
    },
  },
};

const DECISION_STEP_TYPES: Record<string, StaffDecisionVariant> = {
  "reference-verification": "verification",
  "internal-select": "selection",
};

/** Library id (record `step_type` or tenant `metadata.workflow_step_id`) → decision variant. */
export function staffStepVariantForLibraryId(libraryId: string | null | undefined): StaffStepVariant {
  const key = String(libraryId ?? "").trim().toLowerCase().replaceAll("_", "-");
  if (DECISION_STEP_TYPES[key]) return DECISION_STEP_TYPES[key];
  return key.includes("interview") ? "interview" : "default";
}

export function isDecisionVariant(variant: StaffStepVariant): variant is StaffDecisionVariant {
  return variant === "verification" || variant === "selection";
}

/** Label for a decision ("Qualified") or, with null, the pending state ("Pending Decision"). */
export function decisionLabel(variant: StaffDecisionVariant, action: StaffDecisionAction | null): string {
  return action ? DECISION_COPY[variant].labels[action] : DECISION_COPY[variant].pending;
}

/** Stored progress status → the decision that produced it. */
export function decisionFromStatus(status: string | null | undefined): StaffDecisionAction | null {
  const value = String(status ?? "").trim().toLowerCase();
  if (value === "completed") return "complete";
  if (value === "in_progress") return "needs_review";
  if (value === "failed") return "reject";
  return null;
}

export function staffActionTargetStatus(action: StaffStepAction): OnboardingStepStatus {
  if (action === "complete") return "completed";
  if (action === "needs_review") return "in_progress";
  if (action === "reject") return "failed";
  return "pending";
}

export function allowedStaffActions(
  status: OnboardingStepStatus | string | null | undefined,
  variant: StaffStepVariant = "default"
): StaffStepAction[] {
  const value = String(status ?? "pending").trim().toLowerCase();
  if (isDecisionVariant(variant)) {
    const current = decisionFromStatus(value);
    return STAFF_DECISION_ACTIONS.filter((action) => action !== current);
  }
  if (variant === "interview") {
    if (value === "completed") return ["reject"];
    if (value === "failed") return ["complete"];
    if (value === "skipped") return ["reopen"];
    return ["complete", "reject"];
  }
  if (value === "completed" || value === "skipped") return ["reopen"];
  if (value === "failed") return ["reopen"];
  return ["complete", "reject"];
}

export function staffActionLabel(action: StaffStepAction, variant: StaffStepVariant = "default"): string {
  if (variant === "selection" && action === "complete") return "Mark as Qualified";
  if (isDecisionVariant(variant) && action !== "reopen") {
    const label = decisionLabel(variant, action);
    return variant === "verification" && action === "reject" ? "Reject" : label;
  }
  if (variant === "interview" && action === "complete") return "Mark Completed";
  if (action === "complete") return "Mark as complete";
  if (action === "needs_review") return "Need to Review";
  if (action === "reject") return "Reject";
  return "Reopen";
}

export function staffActionResultMessage(
  action: StaffStepAction,
  email: StaffStepEmailResult | null,
  variant: StaffStepVariant = "default"
): { tone: "success" | "warning"; message: string } {
  if (isDecisionVariant(variant) && action !== "reopen") {
    const base = DECISION_COPY[variant].results[action];
    if (action === "complete" && email?.sent) {
      const emailNote = email.nextStepTitle
        ? ` The candidate was emailed a link to continue with "${email.nextStepTitle}".`
        : " The candidate was emailed a link to continue.";
      return { tone: "success", message: `${base}${emailNote}` };
    }
    return { tone: "success", message: base };
  }
  if (action === "needs_review") return { tone: "success", message: "Step marked as needing review." };
  if (variant === "interview" && action === "reject") {
    return { tone: "success", message: "Interview marked as rejected. The candidate stays at the Interview stage." };
  }
  if (action === "reject") return { tone: "success", message: "Step rejected. The candidate stays blocked at this step." };
  if (action === "reopen") return { tone: "success", message: "Step reopened. It must be completed again before the candidate can continue." };
  if (!email) return { tone: "success", message: "Step completed. No email was sent to the candidate." };
  if (email.sent) {
    return {
      tone: "success",
      message: email.nextStepTitle
        ? `Step completed. The candidate was emailed a link to continue with "${email.nextStepTitle}".`
        : "Step completed. The candidate was emailed a link to continue.",
    };
  }
  switch (email.reason) {
    case "WAITING_ON_INTERNAL_STEP":
      return {
        tone: "success",
        message: "Step completed. No email sent yet: another internal step must be completed before the candidate can continue.",
      };
    case "NO_NEW_CANDIDATE_STEP":
      return {
        tone: "success",
        message:
          "Step completed. No email sent: this didn't unlock a new step for the candidate to fill in (they may still be working on an earlier step, or have none left).",
      };
    case "APPLICATION_SUBMITTED":
      return {
        tone: "success",
        message: "Step completed. No email sent: the candidate has already submitted their application.",
      };
    case "NO_APPLICANT_EMAIL":
      return { tone: "warning", message: "Step completed, but the candidate has no valid email address, so no email was sent." };
    case "RESEND_NOT_CONFIGURED":
      return { tone: "warning", message: "Step completed, but email sending isn't configured, so no email was sent." };
    case "NO_APP_ORIGIN":
      return { tone: "warning", message: "Step completed, but the app URL couldn't be resolved, so no email was sent." };
    default:
      return {
        tone: "warning",
        message: `Step completed, but the email to the candidate failed${email.reason ? `: ${email.reason}` : "."}`,
      };
  }
}

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

/** Last staff decision stored on an `applicant_workflow_step_records` row. */
export function readRecordStaffReview(record: {
  review_decision?: unknown;
  review_note?: unknown;
  status_changed_at?: unknown;
  status_changed_by?: unknown;
  status_changed_by_name?: unknown;
}): StaffStepReview | null {
  return readStaffStepReview({
    staff_review: {
      decision: record.review_decision,
      note: record.review_note,
      reviewed_at: record.status_changed_at,
      reviewed_by_user_id: record.status_changed_by,
      reviewed_by_name: record.status_changed_by_name,
    },
  });
}

export function readStaffStepReview(data: unknown): StaffStepReview | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const raw = (data as Record<string, unknown>).staff_review;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const review = raw as Record<string, unknown>;
  const decision = asText(review.decision);
  const reviewedAt = asText(review.reviewed_at);
  if (!decision || !reviewedAt || !(STAFF_STEP_ACTIONS as readonly string[]).includes(decision)) {
    return null;
  }
  return {
    decision: decision as StaffStepAction,
    note: asText(review.note),
    reviewedByUserId: asText(review.reviewed_by_user_id),
    reviewedByName: asText(review.reviewed_by_name),
    reviewedAt,
  };
}

import { describe, expect, it } from "vitest";
import { applySavedStepToProgress } from "@/lib/onboarding/apply-saved-step-progress";
import type { WorkerOnboardingProgressPayload } from "@/lib/onboarding/types";

function progress(
  status: WorkerOnboardingProgressPayload["steps"][number]["status"],
  data: Record<string, unknown> = {}
): WorkerOnboardingProgressPayload {
  return {
    progressId: "p1",
    status: "in_progress",
    steps: [
      {
        onboarding_step_id: "step-1",
        step_key: "custom_question_17",
        status,
        completed_at: status === "completed" ? "2026-10-20T12:00:00.000Z" : null,
        data,
      },
    ],
  };
}

describe("applySavedStepToProgress", () => {
  it("keeps a checkbox completion when the returned payload is still in progress", () => {
    const saved = applySavedStepToProgress(progress("in_progress"), {
      stepId: "step-1",
      stepKey: "custom_question_17",
      status: "completed",
      data: {
        checkbox_confirmed: true,
        checkbox_label: "I confirm that I have completed I-9 Section 2.",
        post_hire_submission: {
          kind: "confirmation",
          fields: [{ label: "Confirmed", value: "Yes" }],
          submitted_at: "2026-10-20T12:01:00.000Z",
        },
      },
      completedAt: "2026-10-20T12:01:00.000Z",
    });

    expect(saved.steps[0]?.status).toBe("completed");
    expect(saved.steps[0]?.data.checkbox_confirmed).toBe(true);
    expect(saved.steps[0]?.completed_at).toBe("2026-10-20T12:01:00.000Z");
  });

  it("does not let a checkbox draft downgrade a completed step", () => {
    const saved = applySavedStepToProgress(
      progress("completed", { checkbox_confirmed: true, response: "I confirm that I have completed I-9 Section 2." }),
      {
        stepId: "step-1",
        status: "in_progress",
        data: { checkbox_confirmed: true },
      }
    );

    expect(saved.steps[0]?.status).toBe("completed");
    expect(saved.steps[0]?.data.response).toBe("I confirm that I have completed I-9 Section 2.");
    expect(saved.steps[0]?.data.checkbox_confirmed).toBe(true);
  });
});

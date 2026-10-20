import { describe, expect, it } from "vitest";
import {
  planReplacedStepCarryOver,
  REPLACED_STEP_DATA_KEY,
  type CarryOverRow,
  type CarryOverStep,
} from "@/lib/onboarding/replaced-step-progress";

function step(id: string, type: string, enabled: boolean, phase = "pre_hire"): CarryOverStep {
  return {
    id,
    is_enabled: enabled,
    metadata: { workflow_step_id: type, workflow_settings: { phase } },
  };
}

function row(stepId: string, overrides: Partial<CarryOverRow> = {}): CarryOverRow {
  return {
    id: `row-${stepId}`,
    worker_onboarding_progress_id: "progress-1",
    onboarding_step_id: stepId,
    status: "pending",
    completed_at: null,
    updated_at: null,
    application_id: null,
    data: {},
    ...overrides,
  };
}

const completedBackgroundCheck = row("bg-old", {
  status: "completed",
  completed_at: "2026-10-02T11:58:36Z",
  application_id: "app-1",
  data: { authorization_agreed: true, firma_status: "completed" },
});

describe("planReplacedStepCarryOver", () => {
  it("carries a completed replaced step onto the untouched current step", () => {
    const writes = planReplacedStepCarryOver({
      steps: [step("bg-old", "background-check", false), step("bg-new", "background-check", true)],
      rows: [completedBackgroundCheck, row("bg-new")],
    });
    expect(writes).toEqual([
      expect.objectContaining({
        targetStepId: "bg-new",
        targetRowId: "row-bg-new",
        donorStepId: "bg-old",
        completedAt: "2026-10-02T11:58:36Z",
        applicationId: "app-1",
        data: {
          authorization_agreed: true,
          firma_status: "completed",
          [REPLACED_STEP_DATA_KEY]: "bg-old",
        },
      }),
    ]);
  });

  it("picks the most recently completed donor and ignores pending donors", () => {
    const writes = planReplacedStepCarryOver({
      steps: [
        step("ssn-a", "ssn-identity-verification", false),
        step("ssn-b", "ssn-identity-verification", false),
        step("ssn-c", "ssn-identity-verification", false),
        step("ssn-new", "ssn-identity-verification", true),
      ],
      rows: [
        row("ssn-a", { status: "completed", completed_at: "2026-10-01T10:00:00Z", data: { v: "old" } }),
        row("ssn-b", { status: "completed", completed_at: "2026-10-02T11:40:00Z", data: { v: "new" } }),
        row("ssn-c"),
        row("ssn-new"),
      ],
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]?.donorStepId).toBe("ssn-b");
  });

  it("never overwrites a current step the candidate or staff already touched", () => {
    const steps = [step("bg-old", "background-check", false), step("bg-new", "background-check", true)];
    for (const target of [
      row("bg-new", { status: "completed" }),
      row("bg-new", { status: "in_progress", data: { staff_review: { decision: "reopen" } } }),
      row("bg-new", { status: "failed" }),
    ]) {
      expect(planReplacedStepCarryOver({ steps, rows: [completedBackgroundCheck, target] })).toEqual([]);
    }
  });

  it("carries into an in-progress step with no answers yet", () => {
    const writes = planReplacedStepCarryOver({
      steps: [step("bg-old", "background-check", false), step("bg-new", "background-check", true)],
      rows: [completedBackgroundCheck, row("bg-new", { status: "in_progress" })],
    });
    expect(writes).toHaveLength(1);
  });

  it("skips repeatable step types, other phases, and ambiguous current steps", () => {
    expect(
      planReplacedStepCarryOver({
        steps: [step("doc-old", "document-upload", false), step("doc-new", "document-upload", true)],
        rows: [row("doc-old", { status: "completed" }), row("doc-new")],
      })
    ).toEqual([]);
    expect(
      planReplacedStepCarryOver({
        steps: [
          step("bg-old", "background-check", false, "pre_hire"),
          step("bg-new", "background-check", true, "post_hire"),
        ],
        rows: [completedBackgroundCheck, row("bg-new")],
      })
    ).toEqual([]);
    expect(
      planReplacedStepCarryOver({
        steps: [
          step("bg-old", "background-check", false),
          step("bg-new-1", "background-check", true),
          step("bg-new-2", "background-check", true),
        ],
        rows: [completedBackgroundCheck, row("bg-new-1"), row("bg-new-2")],
      })
    ).toEqual([]);
  });

  it("only uses donors from the same progress record (application)", () => {
    const writes = planReplacedStepCarryOver({
      steps: [step("bg-old", "background-check", false), step("bg-new", "background-check", true)],
      rows: [
        { ...completedBackgroundCheck, worker_onboarding_progress_id: "progress-other-job" },
        row("bg-new"),
      ],
    });
    expect(writes).toEqual([]);
  });

  it("creates the current step's row only in a progress record used by the current workflow", () => {
    const steps = [
      step("bg-old", "background-check", false),
      step("bg-new", "background-check", true),
      step("resume", "resume-basic-profile", true),
    ];
    expect(
      planReplacedStepCarryOver({ steps, rows: [completedBackgroundCheck, row("resume")] })
    ).toEqual([
      expect.objectContaining({ targetStepId: "bg-new", targetRowId: null, progressId: "progress-1" }),
    ]);
    expect(planReplacedStepCarryOver({ steps, rows: [completedBackgroundCheck] })).toEqual([]);
  });
});

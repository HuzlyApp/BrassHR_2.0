import { describe, expect, it } from "vitest";
import { validateWorkflowPhaseLayout } from "@/lib/onboarding/validate-workflow-phases";
import { DEFAULT_STEP_SETTINGS } from "@/app/components/workflow-builder/types";
import type { SerializableWorkflowState } from "@/lib/onboarding/workflow-builder-serialization";

function draft(
  phases: Array<"pre_hire" | "transition" | "post_hire">
): SerializableWorkflowState {
  return {
    nodes: phases.map((phase, index) => ({
      id: `n${index}`,
      stepId: `step-${index}`,
      label: `Step ${index + 1}`,
      position: { x: 0, y: index * 130 },
      day: index + 1,
      required: true,
      settings: {
        ...DEFAULT_STEP_SETTINGS,
        phase,
        phaseOrder: phase === "post_hire" ? 3 : phase === "transition" ? 2 : 1,
      },
    })),
    edges: [],
  };
}

describe("validateWorkflowPhaseLayout", () => {
  it("requires at least one Pre-Hire step", () => {
    const errors = validateWorkflowPhaseLayout(draft(["post_hire"]));
    expect(errors.some((error) => error.code === "MISSING_PRE_HIRE")).toBe(true);
  });

  it("rejects Post-Hire steps that appear before Pre-Hire steps", () => {
    const errors = validateWorkflowPhaseLayout(draft(["post_hire", "pre_hire", "post_hire"]));
    expect(errors.some((error) => error.code === "PHASE_ORDER")).toBe(true);
  });

  it("accepts Pre-Hire then Post-Hire, treating approval as Pre-Hire", () => {
    expect(validateWorkflowPhaseLayout(draft(["pre_hire", "transition", "post_hire"]))).toEqual([]);
  });

  it("rejects steps that have no explicit phase", () => {
    const state = draft(["pre_hire"]);
    state.nodes[0]!.settings = { ...state.nodes[0]!.settings, phase: "" as never };
    expect(validateWorkflowPhaseLayout(state).some((error) => error.code === "MISSING_PHASE")).toBe(true);
  });

  it("rejects a task that belongs to the other hire stage", () => {
    const state = draft(["pre_hire", "post_hire"]);
    state.nodes[0]!.stepId = "orientation-video";
    state.nodes[0]!.label = "Orientation";
    const errors = validateWorkflowPhaseLayout(state);
    expect(errors.some((error) => error.code === "ALIEN_STAGE" && error.nodeId === "n0")).toBe(true);
    expect(errors.find((error) => error.nodeId === "n0")?.message).toContain(
      "This task does not belong in this stage."
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  resolvePreHireStageNameFromStatusLanes,
  resolvePreHireStatusStageForActions,
} from "./resolve-pre-hire-stage";

const lanes = [
  { stageName: "Intake", statusId: "new", lane: "happy_path" as const, sortOrder: 0, workflowId: null },
  { stageName: "Intake", statusId: "docs", lane: "happy_path" as const, sortOrder: 1, workflowId: null },
  { stageName: "Screening", statusId: "attempted", lane: "happy_path" as const, sortOrder: 0, workflowId: null },
  { stageName: "Screening", statusId: "screened", lane: "happy_path" as const, sortOrder: 1, workflowId: null },
  { stageName: "Screening", statusId: "follow", lane: "alternate" as const, sortOrder: 0, workflowId: null },
  { stageName: "Interview", statusId: "follow", lane: "alternate" as const, sortOrder: 0, workflowId: null },
  { stageName: "Screening", statusId: "closed", lane: "closed" as const, sortOrder: 0, workflowId: null },
  { stageName: "Interview", statusId: "closed", lane: "closed" as const, sortOrder: 0, workflowId: null },
];

describe("resolvePreHireStageNameFromStatusLanes", () => {
  it("maps a happy-path status to its Pre-Hire stage", () => {
    expect(
      resolvePreHireStageNameFromStatusLanes({ statusId: "attempted", lanes })
    ).toBe("Screening");
    expect(resolvePreHireStageNameFromStatusLanes({ statusId: "new", lanes })).toBe("Intake");
  });

  it("prefers the latest Pre-Hire stage when a status is shared as alternate", () => {
    expect(resolvePreHireStageNameFromStatusLanes({ statusId: "follow", lanes })).toBe("Interview");
  });
});

describe("resolvePreHireStatusStageForActions", () => {
  it("uses the hire-journey stage even when AI Analysis is on a later step", () => {
    expect(
      resolvePreHireStatusStageForActions({
        hireJourneyStageName: "Intake",
        statusId: "attempted",
        lanes,
      })
    ).toBe("Intake");
  });

  it("falls back to Pre-Hire lane membership when journey stage is unknown", () => {
    expect(
      resolvePreHireStatusStageForActions({
        hireJourneyStageName: null,
        statusId: "screened",
        lanes,
      })
    ).toBe("Screening");
  });

  it("defaults to Intake when nothing else resolves", () => {
    expect(resolvePreHireStatusStageForActions({})).toBe("Intake");
  });

  it("ignores AI Analysis step names as hire-journey input", () => {
    expect(
      resolvePreHireStatusStageForActions({
        hireJourneyStageName: "Step 2 · Verifications",
        statusId: "new",
        lanes,
      })
    ).toBe("Intake");
  });
});

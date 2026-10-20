import { describe, expect, it } from "vitest";
import { aiMatchStatusStageName, isAssignableStatusStageName } from "./stage-assignments";
import {
  filterStatusesForAssignedGroups,
  sequenceStatusesForStage,
  statusGroupIsOnStage,
} from "./stage-status-filter";

describe("AI analysis progression labels", () => {
  it("maps progression steps onto note/display labels only", () => {
    expect(aiMatchStatusStageName("quick")).toBe("Step 1 · Quick Match");
    expect(aiMatchStatusStageName("submission")).toBe("Step 5 · Submission");
    expect(aiMatchStatusStageName("unknown")).toBeNull();
  });

  it("does not treat AI steps as assignable status catalog stages", () => {
    expect(isAssignableStatusStageName("Submission")).toBe(true);
    expect(isAssignableStatusStageName("Step 5 · Submission")).toBe(false);
    expect(isAssignableStatusStageName("Kickoff")).toBe(false);
  });
});

describe("filterStatusesForAssignedGroups", () => {
  const statuses = [
    { id: "start", name: "New / Applied", groupId: "g-start", groupSystemKey: "start" },
    { id: "interview", name: "Qualified", groupId: "g-interview", groupSystemKey: "interview" },
    { id: "closed", name: "Not a Fit", groupId: "g-closed", groupSystemKey: "closed" },
    { id: "current", name: "Selected", groupId: "g-hire", groupSystemKey: "hire" },
  ];

  it("keeps assigned groups, Closed, and the current status", () => {
    const visible = filterStatusesForAssignedGroups(statuses, ["g-start"], "current").map(
      (status) => status.id
    );
    expect(visible).toEqual(["start", "closed", "current"]);
  });

  it("keeps a status on every stage its group is attached to", () => {
    const interview = statuses.find((status) => status.id === "interview");
    expect(
      statusGroupIsOnStage({
        groupId: interview?.groupId,
        groupSystemKey: interview?.groupSystemKey,
        assignedGroupIds: ["g-interview"],
      })
    ).toBe(true);
    expect(
      statusGroupIsOnStage({
        groupId: interview?.groupId,
        groupSystemKey: interview?.groupSystemKey,
        assignedGroupIds: ["g-start"],
      })
    ).toBe(false);
    expect(
      statusGroupIsOnStage({
        groupId: "g-closed",
        groupSystemKey: "closed",
        assignedGroupIds: [],
      })
    ).toBe(true);
  });
});

describe("sequenceStatusesForStage", () => {
  const statuses = [
    { id: "applied", name: "New / Applied", sortOrder: 0, groupId: "g-start", groupSortOrder: 0, groupSystemKey: "start" },
    { id: "attempted", name: "Attempted Contact", sortOrder: 1, groupId: "g-start", groupSortOrder: 0, groupSystemKey: "start" },
    { id: "followup", name: "Follow-up Needed", sortOrder: 2, groupId: "g-start", groupSortOrder: 0, groupSystemKey: "start" },
    { id: "screen", name: "Screening Complete", sortOrder: 0, groupId: "g-interview", groupSortOrder: 1, groupSystemKey: "interview" },
    { id: "closed", name: "Not a Fit", sortOrder: 0, groupId: "g-closed", groupSortOrder: 5, groupSystemKey: "closed" },
  ];

  it("offers the next attached status first, then the rest of those groups", () => {
    const sequence = sequenceStatusesForStage(statuses, ["g-start", "g-interview"], "attempted");
    expect(sequence.next?.id).toBe("followup");
    expect(sequence.actions.map((status) => status.name)).toEqual([
      "Follow-up Needed",
      "New / Applied",
      "Screening Complete",
    ]);
  });

  it("starts at the first status when the candidate is outside this stage", () => {
    const sequence = sequenceStatusesForStage(statuses, ["g-interview"], "attempted");
    expect(sequence.actions.map((status) => status.id)).toEqual(["screen"]);
  });
});

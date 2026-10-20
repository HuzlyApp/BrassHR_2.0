import { describe, expect, it } from "vitest";
import {
  closedGroupPickerLabel,
  defaultStatusGroupKey,
  formatGroupStatusSummary,
  groupStatuses,
  isSharedClosedGroupKey,
} from "./groups";

describe("defaultStatusGroupKey", () => {
  it("maps the six-group Pre-Hire catalog without changing workflow keys", () => {
    expect(defaultStatusGroupKey("New / Applied", "new")).toBe("start");
    expect(defaultStatusGroupKey("Attempted Contact", null)).toBe("start");
    expect(defaultStatusGroupKey("Follow-up Needed", null)).toBe("start");
    expect(defaultStatusGroupKey("Follow up", null)).toBe("start");
    expect(defaultStatusGroupKey("Unreachable", null)).toBe("start");

    expect(defaultStatusGroupKey("Screening Complete", "reviewing")).toBe("interview");
    expect(defaultStatusGroupKey("Interview Scheduled", null)).toBe("interview");
    expect(defaultStatusGroupKey("Qualified", "shortlisted")).toBe("interview");
    expect(defaultStatusGroupKey("Interviewing", "interviewing")).toBe("interview");

    expect(defaultStatusGroupKey("Profile Ready", null)).toBe("msp");
    expect(defaultStatusGroupKey("Submitted to MSP", null)).toBe("msp");
    expect(defaultStatusGroupKey("Approved by MSP", null)).toBe("msp");

    expect(defaultStatusGroupKey("Presented to Client", null)).toBe("client");
    expect(defaultStatusGroupKey("Selected by Client", "hired")).toBe("client");
    expect(defaultStatusGroupKey("Hired", "hired")).toBe("client");

    expect(defaultStatusGroupKey("Selected", null)).toBe("hire");

    expect(defaultStatusGroupKey("Not a Fit", "rejected")).toBe("closed");
    expect(defaultStatusGroupKey("Talent Pool", "undecided")).toBe("closed");
    expect(defaultStatusGroupKey("Withdraw", "withdrawn")).toBe("closed");
    expect(defaultStatusGroupKey("Rejected by MSP", null)).toBe("closed");
    expect(defaultStatusGroupKey("Rejected by Client", null)).toBe("closed");
    expect(defaultStatusGroupKey("Position Closed", "archived")).toBe("closed");
  });

  it("keeps unknown custom statuses ungrouped", () => {
    expect(defaultStatusGroupKey("Test Status", null)).toBeNull();
    expect(defaultStatusGroupKey("Approved -Upload to Portal", null)).toBeNull();
  });
});

describe("groupStatuses", () => {
  it("nests statuses under catalog groups and marks Closed as shared", () => {
    const sections = groupStatuses([
      {
        id: "s-hired",
        name: "Selected by Client",
        sortOrder: 11,
        groupId: "client",
        groupName: "Client",
        groupSortOrder: 3,
        groupSystemKey: "client",
      },
      {
        id: "s-new",
        name: "New / Applied",
        sortOrder: 0,
        groupId: "start",
        groupName: "Start",
        groupSortOrder: 0,
        groupSystemKey: "start",
      },
      {
        id: "s-closed",
        name: "Not a Fit",
        sortOrder: 13,
        groupId: "closed",
        groupName: "Closed",
        groupSortOrder: 5,
        groupSystemKey: "closed",
      },
    ]);
    expect(sections.map((section) => section.name)).toEqual(["Start", "Client", "Closed"]);
    expect(sections.find((section) => section.systemKey === "closed")?.shared).toBe(true);
    expect(isSharedClosedGroupKey("closed")).toBe(true);
    expect(closedGroupPickerLabel("Closed")).toBe("Closed (always available)");
  });
});

describe("formatGroupStatusSummary", () => {
  it("summarizes overflow for compact cards", () => {
    expect(formatGroupStatusSummary(["A", "B", "C", "D"])).toBe("A, B, C, D");
    expect(formatGroupStatusSummary(["A", "B", "C", "D", "E"])).toBe("A, B, C, D +1 more");
  });
});

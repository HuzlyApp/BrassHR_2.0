import { describe, expect, it } from "vitest";
import { candidateDetailTabs } from "@/lib/onboarding/candidate-detail-tabs";
import { clientPayloadContainsPostHireData, omitPostHireFromClientPayload } from "@/lib/onboarding/omit-post-hire-payload";
import { canRevealPostHire } from "@/lib/onboarding/lock-post-hire";
import { POST_HIRE_UNASSIGNED_MESSAGE } from "@/lib/onboarding/assigned-workflow-steps";

describe("candidate detail Post-Hire visibility", () => {
  it("does not render Post-Hire for a non-hired candidate", () => {
    expect(
      candidateDetailTabs({ postHireVisible: false, showOnboarded: false })
    ).not.toContain("Post-Hire");
  });

  it("shows AI Analysis beside Profile", () => {
    const tabs = candidateDetailTabs({ postHireVisible: false, showOnboarded: false });
    const profileIndex = tabs.indexOf("Profile");
    expect(tabs[profileIndex + 1]).toBe("AI Analysis");
  });

  it("does not render Post-Hire for Approved without a worker conversion", () => {
    expect(canRevealPostHire({ workerStatus: "approved" })).toBe(false);
    expect(
      candidateDetailTabs({ postHireVisible: false, showOnboarded: true })
    ).not.toContain("Post-Hire");
  });

  it("reveals Post-Hire after successful worker conversion", () => {
    expect(canRevealPostHire({ workerStatus: "converted", convertedWorkerId: "w1" })).toBe(true);
    expect(
      candidateDetailTabs({ postHireVisible: true, showOnboarded: true })
    ).toContain("Post-Hire");
  });

  it("uses the empty state copy when a hired worker has no Post-Hire assignment", () => {
    expect(POST_HIRE_UNASSIGNED_MESSAGE).toBe(
      "No Post-Hire workflow has been assigned to this worker."
    );
  });

  it("keeps Post-Hire data out of the non-hired page payload", () => {
    const payload = omitPostHireFromClientPayload({
      currentStage: "pre_hire",
      isHired: true,
      hiredAt: null,
      hiredBy: null,
      postHireVisible: false,
      workflowHasPostHireSteps: true,
      postHireUnlocked: false,
      postHireLocked: true,
      postHireSuspended: false,
      postHireActivationFailed: false,
      phaseStartedAt: null,
      workflowPhase: "pre_hire",
      currentWorkflowName: "CNA Pre-Hire",
      currentStepTitle: "Upload Resume",
      tags: [],
      preHire: {
        assigned: true,
        progress: { complete: 1, total: 2, percent: 50, label: "1 / 2 Pre-Hire completed" },
        steps: [],
        documents: [],
        assignment: null,
      },
      postHire: {
        assigned: true,
        progress: { complete: 0, total: 4, percent: 0, label: "0 / 4 Post-Hire completed" },
        steps: [],
        documents: [],
        assignment: {
          workflowName: "W2 Post-Hire",
          phase: "post_hire",
          version: "9",
          assignedAt: "2026-08-01T00:00:00Z",
          assignmentSource: "job_mapping",
          currentStepTitle: "I-9",
          completedCount: 0,
          totalCount: 4,
        },
      },
    });
    expect(payload.postHire).toBeNull();
    expect(clientPayloadContainsPostHireData(payload)).toBe(false);
  });
});

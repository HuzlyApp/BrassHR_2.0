import { describe, expect, it } from "vitest";
import { omitPostHireFromClientPayload, clientPayloadContainsPostHireData } from "@/lib/onboarding/omit-post-hire-payload";
import type { CandidateWorkflowPhaseView } from "@/lib/onboarding/candidate-workflow-phase-view";
import { countsForPhase } from "@/lib/onboarding/workflow-phase-groups";

function view(partial: Partial<CandidateWorkflowPhaseView> = {}): CandidateWorkflowPhaseView {
  return {
    currentStage: "pre_hire",
    isHired: false,
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
    tags: [
      {
        id: "tag-1",
        workflowName: "CNA Pre-Hire",
        workflowType: "w2",
        phase: "both",
        version: "1",
        assignedAt: "2026-08-01T00:00:00Z",
        assignmentState: "active",
        active: true,
      },
    ],
    preHire: {
      assigned: true,
      progress: countsForPhase(2, 1, "pre_hire"),
      steps: [],
      documents: [],
      assignment: {
        workflowName: "CNA Pre-Hire",
        phase: "pre_hire",
        version: "1",
        assignedAt: "2026-08-01T00:00:00Z",
        assignmentSource: "job_mapping",
        currentStepTitle: "Upload Resume",
        completedCount: 1,
        totalCount: 2,
      },
    },
    postHire: {
      assigned: true,
      progress: countsForPhase(3, 0, "post_hire"),
      steps: [
        {
          id: "ph-1",
          snapshotStepId: "w2-16",
          tenantStepId: null,
          title: "I-9",
          stepKey: "i9",
          stepType: "i9-right-to-work-verification",
          onboardingType: "document_upload",
          phase: "post_hire",
          required: true,
          status: "pending",
          displayStatus: "not_started",
          inspectable: true,
          unmatched: false,
          assignedAt: null,
          completedAt: null,
        },
      ],
      documents: [],
      assignment: {
        workflowName: "W2 Post-Hire",
        phase: "post_hire",
        version: "1",
        assignedAt: "2026-08-01T00:00:00Z",
        assignmentSource: "job_mapping",
        currentStepTitle: "I-9",
        completedCount: 0,
        totalCount: 3,
      },
    },
    ...partial,
  };
}

describe("omitPostHireFromClientPayload", () => {
  it("removes Post-Hire data for a non-converted candidate", () => {
    const stripped = omitPostHireFromClientPayload(view());
    expect(stripped.postHireVisible).toBe(false);
    expect(stripped.postHire).toBeNull();
    expect(stripped.tags.every((tag) => tag.phase !== "post_hire" && tag.phase !== "both")).toBe(true);
    expect(clientPayloadContainsPostHireData(stripped)).toBe(false);
  });

  it("keeps Post-Hire after conversion", () => {
    const converted = omitPostHireFromClientPayload(view({ postHireVisible: true }));
    expect(converted.postHireVisible).toBe(true);
    expect(converted.postHire?.assigned).toBe(true);
    expect(converted.postHire?.steps).toHaveLength(1);
  });

  it("does not treat Approved or hired application status as conversion", () => {
    const stripped = omitPostHireFromClientPayload(view({ isHired: true, currentStage: "hired" }));
    expect(stripped.postHire).toBeNull();
    expect(stripped.postHireVisible).toBe(false);
  });
});

// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CandidateWorkflowPhasePanel from "@/app/admin_recruiter/components/CandidateWorkflowPhasePanel";
import type { CandidateWorkflowStepView } from "@/lib/onboarding/candidate-workflow-phase-view";
import { POST_HIRE_UNASSIGNED_MESSAGE } from "@/lib/onboarding/assigned-workflow-steps";
import { countsForPhase } from "@/lib/onboarding/workflow-phase-groups";

vi.mock("@/app/admin_recruiter/components/CandidateWorkflowStepModal", () => ({
  default: () => null,
}));

function step(partial: Partial<CandidateWorkflowStepView> & Pick<CandidateWorkflowStepView, "id" | "title">): CandidateWorkflowStepView {
  return {
    snapshotStepId: partial.id,
    tenantStepId: partial.id,
    stepKey: partial.title.toLowerCase().replaceAll(" ", "_"),
    stepType: "custom-step",
    onboardingType: "custom_question",
    phase: "pre_hire",
    required: true,
    status: "completed",
    displayStatus: "completed",
    inspectable: true,
    unmatched: false,
    assignedAt: "2026-08-01T00:00:00Z",
    completedAt: "2026-08-02T00:00:00Z",
    ...partial,
  };
}

const PRE_HIRE_STEPS = [
  step({ id: "11111111-1111-4111-8111-111111111111", title: "Upload Resume", stepType: "resume-basic-profile", onboardingType: "resume_upload" }),
  step({ id: "22222222-2222-4222-8222-222222222222", title: "Professional License", stepType: "credential-license-verification", onboardingType: "professional_license" }),
  step({ id: "33333333-3333-4333-8333-333333333333", title: "Authorization e-sign", stepType: "employee-agreement", onboardingType: "authorizations" }),
  step({ id: "44444444-4444-4444-8444-444444444444", title: "Skill Assessment", stepType: "skill-qualification-assessment", onboardingType: "skill_assessment" }),
  step({ id: "55555555-5555-4555-8555-555555555555", title: "Authorization / Background Check", stepType: "background-check", onboardingType: "custom_question" }),
  step({ id: "66666666-6666-4666-8666-666666666666", title: "Add Reference", stepType: "references-collection", onboardingType: "references" }),
  step({ id: "77777777-7777-4777-8777-777777777777", title: "Final Review / Completion", stepType: "completion-milestone", onboardingType: "review_submit" }),
];

describe("CandidateWorkflowPhasePanel", () => {
  it("makes every Pre-Hire step row clickable", () => {
    render(
      <CandidateWorkflowPhasePanel
        workerId="worker-1"
        phase="pre_hire"
        assigned
        progress={countsForPhase(PRE_HIRE_STEPS.length, PRE_HIRE_STEPS.length, "pre_hire")}
        steps={PRE_HIRE_STEPS}
        documents={[]}
        emptyAssignedMessage="No Pre-Hire workflow is assigned to this applicant."
      />
    );

    for (const item of PRE_HIRE_STEPS) {
      const button = screen.getByRole("button", { name: `View ${item.title} submission` });
      expect(button).toBeTruthy();
      fireEvent.keyDown(button, { key: "Enter" });
    }
  });

  it("makes every Post-Hire step row clickable after hiring", () => {
    const postHireSteps = [
      step({
        id: "88888888-8888-4888-8888-888888888888",
        title: "I-9 / Right to Work Verification",
        phase: "post_hire",
        stepType: "i9-right-to-work-verification",
        onboardingType: "document_upload",
      }),
    ];
    render(
      <CandidateWorkflowPhasePanel
        workerId="worker-1"
        phase="post_hire"
        assigned
        progress={countsForPhase(1, 0, "post_hire")}
        steps={postHireSteps}
        documents={[]}
        emptyAssignedMessage={POST_HIRE_UNASSIGNED_MESSAGE}
      />
    );
    expect(
      screen.getByRole("button", { name: "View I-9 / Right to Work Verification submission" })
    ).toBeTruthy();
  });

  it("shows the assigned empty state when no Post-Hire workflow exists", () => {
    render(
      <CandidateWorkflowPhasePanel
        workerId="worker-1"
        phase="post_hire"
        assigned={false}
        progress={countsForPhase(0, 0, "post_hire")}
        steps={[]}
        documents={[]}
        emptyAssignedMessage={POST_HIRE_UNASSIGNED_MESSAGE}
      />
    );
    expect(screen.getByText(POST_HIRE_UNASSIGNED_MESSAGE)).toBeTruthy();
  });

  it("does not duplicate documents across steps", () => {
    const license = PRE_HIRE_STEPS[1];
    render(
      <CandidateWorkflowPhasePanel
        workerId="worker-1"
        phase="pre_hire"
        assigned
        progress={countsForPhase(PRE_HIRE_STEPS.length, 1, "pre_hire")}
        steps={PRE_HIRE_STEPS}
        documents={[
          {
            id: "doc-1",
            title: "Nursing License",
            step_key: license.stepKey,
            step_title: license.title,
            step_type: "professional_license",
            phase: "pre_hire",
            required_document_id: "req-1",
            submitted_document_id: "sub-1",
            legacy_document_key: null,
            status: "uploaded",
            url: "/signed/license",
            filename: "license.pdf",
            sort_order: 1,
            uploaded_at: "2026-08-02T00:00:00Z",
            uploaded_by: "Applicant",
            is_required: true,
            stepTitle: license.title,
          },
        ]}
        emptyAssignedMessage="No Pre-Hire workflow is assigned to this applicant."
      />
    );
    expect(screen.getAllByText("Nursing License")).toHaveLength(1);
  });
});

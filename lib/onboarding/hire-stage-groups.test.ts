import { describe, expect, it } from "vitest";
import type { CandidateWorkflowStepView } from "@/lib/onboarding/candidate-workflow-phase-view";
import {
  currentPreHireStatusStageName,
  groupStepsIntoHireStages,
  hireStageLabelForStep,
  hireStageProgressMeta,
  isInterviewScheduleStep,
  shouldShowInterviewScheduleAction,
} from "@/lib/onboarding/hire-stage-groups";

function step(
  partial: Partial<CandidateWorkflowStepView> & Pick<CandidateWorkflowStepView, "id" | "title">
): CandidateWorkflowStepView {
  return {
    snapshotStepId: partial.snapshotStepId ?? partial.id,
    tenantStepId: null,
    stepKey: partial.stepKey ?? partial.title.toLowerCase().replace(/\s+/g, "-"),
    stepType: partial.stepType ?? "form",
    onboardingType: partial.onboardingType ?? "custom",
    phase: "pre_hire",
    required: true,
    status: "not_started",
    displayStatus: partial.displayStatus ?? "not_started",
    inspectable: true,
    unmatched: false,
    assignedAt: null,
    completedAt: partial.completedAt ?? null,
    ...partial,
  };
}

describe("groupStepsIntoHireStages", () => {
  it("groups Figma W2 pre-hire steps into Intake → Interview → Compliance", () => {
    const groups = groupStepsIntoHireStages(
      [
        step({
          id: "1",
          title: "Collect Extra Files",
          stepKey: "collect-extra-files",
          displayStatus: "completed",
          completedAt: "2026-07-20T00:00:00Z",
        }),
        step({
          id: "2",
          title: "Collect References",
          stepKey: "legacy-references",
          displayStatus: "completed",
          completedAt: "2026-07-20T00:00:00Z",
        }),
        step({
          id: "3",
          title: "Extra form",
          stepKey: "custom-form",
          displayStatus: "completed",
          completedAt: "2026-07-20T00:00:00Z",
        }),
        step({
          id: "4",
          title: "Interview/Qualification",
          stepKey: "interview-qualification",
          displayStatus: "in_progress",
        }),
        step({
          id: "5",
          title: "Internal Select",
          stepKey: "internal-select",
          displayStatus: "not_started",
        }),
        step({
          id: "6",
          title: "Background Check",
          stepKey: "background-check",
          displayStatus: "not_started",
        }),
      ],
      "pre_hire"
    );

    expect(groups.map((g) => g.name)).toEqual(["Intake", "Interview", "Compliance"]);
    expect(groups[0]?.status).toBe("completed");
    expect(groups[1]?.status).toBe("current");
    expect(groups[2]?.status).toBe("locked");
    expect(isInterviewScheduleStep(groups[1]!.steps[0]!)).toBe(true);
    expect(shouldShowInterviewScheduleAction(groups[1]!, groups[1]!.steps[0]!)).toBe(true);
    expect(shouldShowInterviewScheduleAction(groups[2]!, groups[2]!.steps[0]!)).toBe(false);

    // Internal Select is a recruiter decision, not a meeting to book.
    expect(groups[1]!.steps[1]!.title).toBe("Internal Select");
    expect(isInterviewScheduleStep(groups[1]!.steps[1]!)).toBe(false);
    expect(shouldShowInterviewScheduleAction(groups[1]!, groups[1]!.steps[1]!)).toBe(false);

    const meta = hireStageProgressMeta(groups);
    expect(meta.percent).toBeGreaterThan(0);
    expect(meta.inProgress).toBe(1);
  });

  it("puts SSN in Compliance and Submission/Interview stages in Figma order", () => {
    const groups = groupStepsIntoHireStages(
      [
        step({ id: "i1", title: "Resume & Basic Profile", stepKey: "resume-basic-profile" }),
        step({ id: "s1", title: "Skill Assessment", stepKey: "skill-qualification-assessment" }),
        step({ id: "iv1", title: "Interview / Qualification", stepKey: "interview-qualification" }),
        step({ id: "sub1", title: "Sent to Client / MSP", stepKey: "release-to-client" }),
        step({ id: "c1", title: "SSN / Identity Verification", stepKey: "ssn-identity-verification" }),
        step({ id: "o1", title: "Offer Acceptance", stepKey: "offer-acceptance" }),
        step({ id: "a1", title: "HR Final Approval", stepKey: "hr-final-approval" }),
      ],
      "pre_hire"
    );

    expect(groups.map((g) => g.name)).toEqual([
      "Intake",
      "Screening",
      "Interview",
      "Submission",
      "Compliance",
      "Offer & Agreement",
      "Approvals",
    ]);
    expect(groups.find((g) => g.name === "Compliance")?.steps.map((s) => s.title)).toEqual([
      "SSN / Identity Verification",
    ]);
  });

  it("orders stage groups Intake → Screening and sorts steps inside each group by library sequence", () => {
    const groups = groupStepsIntoHireStages(
      [
        step({
          id: "rv",
          title: "Reference Verification",
          stepKey: "reference-verification",
        }),
        step({
          id: "refs",
          title: "Collect References",
          stepKey: "collect-references",
        }),
        step({
          id: "skill",
          title: "Skill / Qualification Assessment",
          stepKey: "skill-qualification-assessment",
        }),
        step({
          id: "files",
          title: "Collect Extra Files",
          stepKey: "collect-extra-files",
        }),
        step({
          id: "screen",
          title: "Recruiter Screening",
          stepKey: "recruiter-screening",
        }),
      ],
      "pre_hire"
    );

    expect(groups.map((g) => g.name)).toEqual(["Intake", "Screening"]);
    expect(groups[0]?.steps.map((s) => s.stepKey)).toEqual([
      "collect-extra-files",
      "collect-references",
    ]);
    expect(groups[1]?.steps.map((s) => s.stepKey)).toEqual([
      "recruiter-screening",
      "skill-qualification-assessment",
      "reference-verification",
    ]);
  });

  it("unlocks Interview once Screening's required steps are done, even if optional Reference Verification is rejected", () => {
    const groups = groupStepsIntoHireStages(
      [
        step({ id: "sc", title: "Recruiter Screening", stepKey: "recruiter-screening", displayStatus: "completed" }),
        step({
          id: "sk",
          title: "Skill / Qualification Assessment",
          stepKey: "skill-qualification-assessment",
          displayStatus: "completed",
        }),
        step({
          id: "rv",
          title: "Reference Verification",
          stepKey: "reference-verification",
          required: false,
          displayStatus: "blocked",
        }),
        step({ id: "iv", title: "Interview / Qualification", stepKey: "interview-qualification" }),
        step({ id: "bg", title: "Background Check", stepKey: "background-check" }),
      ],
      "pre_hire"
    );
    expect(groups.map((g) => [g.name, g.status])).toEqual([
      ["Screening", "completed"],
      ["Interview", "current"],
      ["Compliance", "locked"],
    ]);
    expect(groups[0]?.summaryLabel).toBe("2 Completed • 1 Optional");
  });

  it("unlocks Submission once Interview / Qualification is done and only optional Internal Select is left", () => {
    const groups = groupStepsIntoHireStages(
      [
        step({
          id: "iv",
          title: "Interview / Qualification",
          stepKey: "interview-qualification",
          displayStatus: "completed",
        }),
        step({ id: "is", title: "Internal Select", stepKey: "internal-select", required: false }),
        step({ id: "sub", title: "Sent to Client / MSP", stepKey: "release-to-client" }),
      ],
      "pre_hire"
    );
    expect(groups.map((g) => [g.name, g.status])).toEqual([
      ["Interview", "completed"],
      ["Submission", "current"],
    ]);
  });

  it("keeps an optional-only stage behind the current stage locked", () => {
    const groups = groupStepsIntoHireStages(
      [
        step({ id: "iv", title: "Interview / Qualification", stepKey: "interview-qualification" }),
        step({ id: "rc", title: "Released to Client", stepKey: "release-to-client", required: false }),
      ],
      "pre_hire"
    );
    expect(groups.map((g) => g.status)).toEqual(["current", "locked"]);
  });

  it("groups post-hire steps into Figma Payroll / Access / Training / Welcome buckets", () => {
    const groups = groupStepsIntoHireStages(
      [
        step({
          id: "p1",
          title: "Direct Deposit Setup",
          stepKey: "direct-deposit-setup",
          phase: "post_hire",
          displayStatus: "completed",
        }),
        step({
          id: "p2",
          title: "Badge / Equipment Issuance",
          stepKey: "badge-equipment-issuance",
          phase: "post_hire",
          displayStatus: "in_progress",
        }),
        step({
          id: "p3",
          title: "Safety Training",
          stepKey: "safety-training",
          phase: "post_hire",
          displayStatus: "not_started",
        }),
        step({
          id: "p4",
          title: "Final Onboarding Call",
          stepKey: "final-onboarding-call",
          phase: "post_hire",
          displayStatus: "not_started",
        }),
      ],
      "post_hire"
    );

    expect(groups.map((g) => g.name)).toEqual([
      "Payroll & Tax",
      "Access & Systems",
      "Training & Policy",
      "Welcome & Complete",
    ]);
  });

  it("uses the library stage instead of keyword guesses", () => {
    const groups = groupStepsIntoHireStages(
      [
        step({
          id: "1",
          title: "Collect Extra Files",
          stepKey: "collect-extra-files",
          stepType: "collect-extra-files",
          displayStatus: "completed",
        }),
        step({
          id: "2",
          title: "Drug Test / Screening",
          stepKey: "drug-test-screening",
          stepType: "drug-test-screening",
          displayStatus: "not_started",
        }),
        step({
          id: "3",
          title: "Pay and Start Date",
          stepKey: "pay-rate-hire-date",
          stepType: "pay-rate-hire-date",
          displayStatus: "not_started",
        }),
        step({
          id: "4",
          title: "I-9 section 1",
          stepKey: "i9-right-to-work-verification",
          stepType: "i9-right-to-work-verification",
          displayStatus: "not_started",
        }),
      ],
      "pre_hire"
    );
    expect(groups.map((group) => group.name)).toEqual([
      "Intake",
      "Compliance",
      "Offer & Agreement",
    ]);
    expect(groups[0]?.status).toBe("completed");
    expect(groups[1]?.status).toBe("current");
    expect(groups[2]?.status).toBe("locked");
  });

  it("never shows a Pre-Hire stage on the Post-Hire board, even when one is stamped on the step", () => {
    const post = (id: string, title: string, stepType: string, stageName: string) =>
      step({ id, title, stepType, stepKey: `w2-figma-${id}`, phase: "post_hire", settings: { stageName } });
    const groups = groupStepsIntoHireStages(
      [
        post("20", "I-9 / Right to Work Verification", "i9-right-to-work-verification", "Offer & Agreement"),
        post("21", "Tax Forms (W-4 / State)", "tax-forms", "Paperwork"),
        post("23", "Pay Rate & Hire Date Entry", "pay-rate-hire-date", "Offer & Agreement"),
        post("24", "W-9 Tax Form", "custom-form", "Intake"),
        post("27", "Policy Acknowledgment", "policy-acknowledgment", "Policies"),
        post("32", "Schedule Assignment", "schedule-assignment", "Access & Equipment"),
        post("36", "Welcome Email", "welcome-email", "Kickoff"),
      ],
      "post_hire"
    );

    expect(groups.map((g) => g.name)).toEqual([
      "Payroll & Tax",
      "Access & Systems",
      "Training & Policy",
      "Welcome & Complete",
    ]);
    expect(groups[0]?.steps.map((s) => s.title)).toEqual([
      "I-9 / Right to Work Verification",
      "Tax Forms (W-4 / State)",
      "Pay Rate & Hire Date Entry",
      "W-9 Tax Form",
    ]);
  });

  it("never shows a Post-Hire stage on the Pre-Hire board", () => {
    const groups = groupStepsIntoHireStages(
      [
        step({ id: "d", title: "Document Upload", stepType: "document-upload", settings: { stageName: "Paperwork" } }),
        step({
          id: "a",
          title: "Pre-Hire Approval",
          stepType: "completion-milestone",
          settings: { stageName: "Day One Ready", phase: "transition" },
        }),
      ],
      "pre_hire"
    );
    expect(groups.map((g) => g.name)).toEqual(["Intake", "Approvals"]);
  });

  it("puts the Complete milestone last and keeps payroll on its own stage", () => {
    const groups = groupStepsIntoHireStages(
      [
        step({
          id: "train",
          title: "Knowledge Transfer / Training",
          stepType: "training-modules-quiz",
          phase: "post_hire",
          settings: { stageName: "Training" },
          displayStatus: "submitted",
        }),
        step({
          id: "done",
          title: "Complete",
          stepType: "completion-milestone",
          phase: "post_hire",
          settings: { stageName: "Complete" },
          displayStatus: "not_started",
        }),
        step({
          id: "pay",
          title: "Payroll Setup",
          stepType: "direct-deposit-setup",
          phase: "post_hire",
          settings: { stageName: "Payroll & Compliance" },
          displayStatus: "submitted",
        }),
        step({
          id: "i9",
          title: "I-9",
          stepType: "i9-right-to-work-verification",
          phase: "post_hire",
          settings: { stageName: "Payroll & Compliance" },
          displayStatus: "submitted",
        }),
      ],
      "post_hire"
    );

    expect(groups.map((group) => group.name)).toEqual([
      "Payroll & Tax",
      "Training & Policy",
      "Welcome & Complete",
    ]);
    expect(groups[2]?.steps.map((item) => item.title)).toEqual(["Complete"]);

    const meta = hireStageProgressMeta(groups);
    expect(meta.totalStages).toBe(3);
    expect(meta.completedStages).toBe(2);
  });

  it("places an Application stage first as Intake", () => {
    const groups = groupStepsIntoHireStages(
      [
        step({
          id: "screen",
          title: "Screening",
          stepType: "recruiter-screening",
          settings: { stageName: "Screening" },
          displayStatus: "in_progress",
        }),
        step({
          id: "resume",
          title: "Resume & Basic Profile",
          stepType: "resume-basic-profile",
          settings: { stageName: "Application" },
          displayStatus: "submitted",
        }),
        step({
          id: "job",
          title: "Parameterized Job Application",
          stepType: "parameterized-job-application",
          settings: { stageName: "Application" },
          displayStatus: "submitted",
        }),
      ],
      "pre_hire"
    );

    expect(groups.map((group) => group.name)).toEqual(["Intake", "Screening"]);
    expect(groups[0]?.steps.map((item) => item.title)).toEqual([
      "Resume & Basic Profile",
      "Parameterized Job Application",
    ]);
  });

  it("lets an explicit stageName override the library map", () => {
    const groups = groupStepsIntoHireStages(
      [
        step({
          id: "1",
          title: "Collect Extra Files",
          stepType: "collect-extra-files",
          settings: { stageName: "Screening" },
        }),
      ],
      "pre_hire"
    );
    expect(groups[0]?.name).toBe("Screening");
  });
});

describe("currentPreHireStatusStageName", () => {
  it("returns the current Pre-Hire board stage for status actions", () => {
    const groups = groupStepsIntoHireStages(
      [
        step({
          id: "a",
          title: "Resume",
          stepType: "resume-basic-profile",
          settings: { stageName: "Intake" },
          displayStatus: "completed",
          completedAt: "2026-01-01T00:00:00Z",
        }),
        step({
          id: "b",
          title: "Screening",
          stepType: "recruiter-screening",
          settings: { stageName: "Screening" },
          displayStatus: "in_progress",
        }),
      ],
      "pre_hire"
    );
    expect(currentPreHireStatusStageName(groups)).toBe("Screening");
  });
});

describe("hireStageLabelForStep", () => {
  it("returns the Post-Hire board bucket for candidate screens", () => {
    expect(
      hireStageLabelForStep({ stageName: "Paperwork", libraryId: "tax-forms", stepKey: "document_upload_7", lifecycle: "post_hire" })
    ).toBe("Payroll & Tax");
    expect(
      hireStageLabelForStep({ stageName: null, libraryId: "safety-training", stepKey: "custom_question_4", lifecycle: "post_hire" })
    ).toBe("Training & Policy");
  });

  it("places Agreement e-sign and I-9 Section 1 in Offer & Agreement", () => {
    expect(
      hireStageLabelForStep({
        stageName: null,
        libraryId: "employee-agreement",
        stepKey: "agreement-esign",
        lifecycle: "pre_hire",
      })
    ).toBe("Offer & Agreement");
    expect(
      hireStageLabelForStep({
        stageName: null,
        libraryId: "i9-right-to-work-verification",
        stepKey: "i9-section-1",
        lifecycle: "pre_hire",
      })
    ).toBe("Offer & Agreement");
  });

  it("ignores a stage name that belongs to the other phase", () => {
    expect(
      hireStageLabelForStep({
        stageName: "Offer & Agreement",
        libraryId: "direct-deposit-setup",
        stepKey: "profile_information",
        lifecycle: "post_hire",
      })
    ).not.toBe("Offer & Agreement");
  });
});

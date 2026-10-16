import { describe, expect, it } from "vitest";
import { filterStepLibrary } from "./filter-step-library";
import {
  filterStepLibraryByPhase,
  LIBRARY_THEME_COLORS,
  mergeCustomStepCategories,
  resolveCanvasStepThemeColor,
  resolveCategoryDisplayLabel,
  resolveStepLibraryPhase,
  resolveStepThemeColor,
} from "./library-category-theme";
import type { StepCategory } from "./types";

const library: StepCategory[] = [
  {
    id: "application-profile",
    label: "Application & Profile",
    steps: [
      { id: "resume-basic-profile", label: "Resume & Basic Profile", icon: null },
      { id: "references-collection", label: "References Collection", icon: null },
      {
        id: "skill-qualification-assessment",
        label: "Skill / Qualification Assessment",
        icon: null,
      },
    ],
  },
  {
    id: "payroll-financial",
    label: "Payroll & Financial Steps",
    steps: [
      { id: "direct-deposit-setup", label: "Direct Deposit Setup", icon: null },
      { id: "benefits-enrollment", label: "Benefits Enrollment / Selection", icon: null },
      { id: "401k-enrollment", label: "401K / Retirement Enrollment", icon: null },
      { id: "payroll-profile-creation", label: "Payroll Profile Creation", icon: null },
      { id: "pay-rate-hire-date", label: "Pay Rate & Hire Date Entry", icon: null },
    ],
  },
  {
    id: "custom-steps",
    label: "Custom Steps",
    steps: [{ id: "custom-step", label: "Custom Step", icon: null }],
  },
  {
    id: "custom-flexible",
    label: "Custom & Flexible Steps",
    steps: [
      { id: "custom-form", label: "Custom Form", icon: null },
      { id: "manual-task-hr-action", label: "Manual Task / HR Action", icon: null },
      { id: "completion-milestone", label: "Completion / Milestone", icon: null },
    ],
  },
  {
    id: "approval-decision",
    label: "Approval & Decision Steps",
    steps: [
      { id: "recruiter-screening", label: "Recruiter Screening", icon: null },
      { id: "interview-qualification", label: "Interview / Qualification", icon: null },
      { id: "offer-acceptance", label: "Offer Acceptance", icon: null },
      { id: "adverse-action-process", label: "Adverse Action Process", icon: null },
      { id: "employee-agreement", label: "Authorization e-sign", icon: null },
    ],
  },
  {
    id: "document-esign",
    label: "Document & eSign",
    steps: [
      { id: "document-upload", label: "Document Upload", icon: null },
      { id: "tax-forms", label: "Tax Forms (W-4 / State)", icon: null },
      { id: "welcome-packet-esign", label: "Welcome Packet & eSign", icon: null },
      { id: "policy-acknowledgment", label: "Policy Acknowledgment", icon: null },
      { id: "equipment-badge-acknowledgment", label: "Equipment / Badge Acknowledgment", icon: null },
      { id: "i9-right-to-work-verification", label: "I-9 / Right to Work Verification", icon: null },
    ],
  },
  {
    id: "screening-compliance",
    label: "Screening & Compliance Steps",
    steps: [
      { id: "reference-verification", label: "Reference Verification", icon: null },
      { id: "background-check", label: "Background Check", icon: null },
      { id: "drug-test-screening", label: "Drug Test / Screening", icon: null },
      { id: "oig-exclusion-check", label: "OIG / Exclusion Check", icon: null },
      { id: "credential-license-verification", label: "Credential / License Verification", icon: null },
      { id: "ssn-identity-verification", label: "SSN / Identity Verification", icon: null },
    ],
  },
];

describe("library-category-theme", () => {
  it("maps intake category to Figma label and blue theme", () => {
    expect(resolveCategoryDisplayLabel("application-profile", "Application & Profile")).toBe(
      "Intake"
    );
    expect(resolveStepThemeColor({ id: "resume-basic-profile" }, "application-profile", "Intake")).toBe(
      "#2563EB"
    );
  });

  it("filters pre-hire and post-hire tabs independently", () => {
    const preHire = filterStepLibraryByPhase(library, "pre_hire");
    const postHire = filterStepLibraryByPhase(library, "post_hire");

    expect(preHire.map((category) => category.id)).toContain("custom-steps");
    expect(preHire.map((category) => category.id)).toContain("application-profile");
    expect(postHire.map((category) => category.id)).toEqual([
      "custom-steps",
      "payroll-financial",
      "team-operational",
      "training-development",
      "communication-notification",
    ]);
  });

  it("merges flexible custom steps into the first Custom Steps group", () => {
    const merged = mergeCustomStepCategories(library);
    expect(merged.find((category) => category.id === "custom-steps")?.steps.map((s) => s.id)).toEqual([
      "custom-step",
      "manual-task-hr-action",
      "completion-milestone",
    ]);
    expect(merged.some((category) => category.id === "custom-flexible")).toBe(false);
  });

  it("shows Welcome & Complete with Figma steps and labels", () => {
    const postHire = filterStepLibraryByPhase(
      [
        ...library,
        {
          id: "communication-notification",
          label: "Communication & Notification Steps",
          steps: [
            { id: "welcome-email", label: "Welcome Email", icon: null },
            { id: "status-update-notification", label: "Status Update Email / Notification", icon: null },
            { id: "manager-welcome-call", label: "Manager Welcome Call", icon: null },
            { id: "final-onboarding-call", label: "Final Onboarding Call", icon: null },
            { id: "reminder-follow-up-notification", label: "Reminder / Follow-up Notification", icon: null },
          ],
        },
        {
          id: "team-operational",
          label: "Team & Operational Steps",
          steps: [
            { id: "buddy-mentor-assignment", label: "Buddy / Mentor Assignment", icon: null },
            { id: "schedule-assignment", label: "Schedule Assignment", icon: null },
          ],
        },
      ],
      "post_hire"
    );

    const welcome = postHire.find((category) => category.id === "communication-notification");
    expect(welcome?.label).toBe("Welcome & Complete");
    expect(welcome?.steps.map((step) => ({ id: step.id, label: step.label }))).toEqual([
      { id: "welcome-email", label: "Send Message" },
      { id: "manager-welcome-call", label: "Welcome Call" },
      { id: "final-onboarding-call", label: "Final Onboarding Call" },
      { id: "buddy-mentor-assignment", label: "Buddy / Mentor Assignment" },
      { id: "completion-milestone", label: "Onboarding Complete" },
      { id: "post-hire-completion-milestone", label: "Post hire Completion / Milestone" },
    ]);
    expect(
      postHire
        .find((category) => category.id === "team-operational")
        ?.steps.some((step) => step.id === "buddy-mentor-assignment") ?? false
    ).toBe(false);
  });

  it("shows Screening and Interview groups with Figma steps", () => {
    const preHire = filterStepLibraryByPhase(library, "pre_hire");
    const ids = preHire.map((category) => category.id);

    expect(ids.indexOf("screening")).toBeGreaterThan(ids.indexOf("application-profile"));
    expect(ids.indexOf("interview")).toBeGreaterThan(ids.indexOf("screening"));

    const screening = preHire.find((category) => category.id === "screening");
    expect(screening?.steps.map((step) => ({ id: step.id, label: step.label }))).toEqual([
      { id: "recruiter-screening", label: "Recruiter Screening" },
      { id: "skill-qualification-assessment", label: "Skill / Qualification Assessment" },
      { id: "reference-verification", label: "Reference Verification" },
    ]);
    expect(resolveStepThemeColor({ id: "recruiter-screening" }, "screening", "Screening")).toBe(
      LIBRARY_THEME_COLORS.screening
    );

    const interview = preHire.find((category) => category.id === "interview");
    expect(interview?.steps.map((step) => ({ id: step.id, label: step.label }))).toEqual([
      { id: "interview-qualification", label: "Interview/Qualification" },
      { id: "internal-select", label: "Internal Select" },
    ]);
    expect(resolveStepThemeColor({ id: "internal-select" }, "interview", "Interview")).toBe(
      LIBRARY_THEME_COLORS.interview
    );

    // Moved out of legacy groups
    expect(
      preHire
        .find((category) => category.id === "approval-decision")
        ?.steps.some((step) => step.id === "recruiter-screening") ?? false
    ).toBe(false);
    expect(
      preHire
        .find((category) => category.id === "screening-compliance")
        ?.steps.some((step) => step.id === "reference-verification")
    ).toBe(false);
  });

  it("adds Figma Intake steps under Pre-hire Intake when missing", () => {
    const preHire = filterStepLibraryByPhase(library, "pre_hire");
    const intake = preHire.find((category) => category.id === "application-profile");
    expect(intake?.steps.map((step) => step.id)).toEqual([
      "collect-extra-files",
      "collect-references",
      "custom-form",
      "resume-basic-profile",
      "references-collection",
    ]);
    expect(intake?.steps.slice(0, 3).map((step) => step.label)).toEqual([
      "Collect Extra Files",
      "Collect References",
      "Custom Form",
    ]);
  });

  it("keeps non-figma steps searchable after regrouping, including once the query is cleared", () => {
    const originalIds = library.flatMap((category) => category.steps.map((step) => step.id));
    const preHire = filterStepLibraryByPhase(library, "pre_hire");
    const ids = preHire.flatMap((category) => category.steps.map((step) => step.id));

    expect(ids).toContain("resume-basic-profile");
    expect(ids).toContain("references-collection");
    expect(
      filterStepLibraryByPhase(library, "pre_hire").flatMap((category) =>
        category.steps.map((step) => step.id)
      )
    ).toEqual(ids);
    expect(library.flatMap((category) => category.steps.map((step) => step.id))).toEqual(originalIds);

    const narrowed = filterStepLibrary(preHire, "resume");
    expect(narrowed.flatMap((category) => category.steps.map((step) => step.id))).toEqual([
      "resume-basic-profile",
    ]);
    const restored = filterStepLibrary(preHire, "");
    expect(restored.flatMap((category) => category.steps.map((step) => step.id))).toContain(
      "references-collection"
    );
    expect(restored.flatMap((category) => category.steps.map((step) => step.id))).toContain(
      "resume-basic-profile"
    );
  });

  it("shows Offer & Agreement with Figma steps moved from Approvals", () => {
    const preHire = filterStepLibraryByPhase(library, "pre_hire");
    const offer = preHire.find((category) => category.id === "offer-agreement");
    expect(offer?.steps.map((step) => ({ id: step.id, label: step.label }))).toEqual([
      { id: "pay-rate-hire-date", label: "Pay and Start Date" },
      { id: "employee-agreement", label: "Authorization e-sign" },
      { id: "offer-acceptance", label: "Pay Rate Accepted" },
      { id: "i9-right-to-work-verification", label: "I-9 section 1" },
      { id: "pre-hire-completion-milestone", label: "Pre Hire Completion / Milestone" },
    ]);
    expect(
      resolveStepThemeColor({ id: "offer-acceptance" }, "offer-agreement", "Offer & Agreement")
    ).toBe(LIBRARY_THEME_COLORS.offerAgreement);
    expect(
      preHire
        .find((category) => category.id === "approval-decision")
        ?.steps.some((step) => step.id === "offer-acceptance") ?? false
    ).toBe(false);
  });

  it("shows Submission and Approvals with Figma steps", () => {
    const preHire = filterStepLibraryByPhase(library, "pre_hire");
    const ids = preHire.map((category) => category.id);

    expect(ids.indexOf("submission")).toBeGreaterThan(ids.indexOf("interview"));
    expect(ids.indexOf("screening-compliance")).toBeGreaterThan(ids.indexOf("submission"));
    expect(ids.indexOf("approval-decision")).toBeGreaterThan(ids.indexOf("offer-agreement"));

    const submission = preHire.find((category) => category.id === "submission");
    expect(submission?.label).toBe("Submission");
    expect(submission?.steps.map((step) => ({ id: step.id, label: step.label }))).toEqual([
      { id: "release-to-client", label: "Release to Client" },
      { id: "submit-to-msp", label: "Submit to MSP" },
    ]);

    const approvals = preHire.find((category) => category.id === "approval-decision");
    expect(approvals?.label).toBe("Approvals");
    expect(approvals?.steps.map((step) => ({ id: step.id, label: step.label }))).toEqual([
      { id: "manager-facility-approval", label: "Manager / Facility Approval" },
      { id: "hr-final-approval", label: "HR Final Approval" },
    ]);
  });

  it("shows Compliance with Adverse Action Process", () => {
    const preHire = filterStepLibraryByPhase(library, "pre_hire");
    const compliance = preHire.find((category) => category.id === "screening-compliance");
    expect(compliance?.steps.map((step) => step.id)).toEqual([
      "background-check",
      "drug-test-screening",
      "oig-exclusion-check",
      "credential-license-verification",
      "ssn-identity-verification",
      "adverse-action-process",
    ]);
    expect(compliance?.steps.at(-1)?.label).toBe("Adverse Action Process");
    expect(
      preHire
        .find((category) => category.id === "approval-decision")
        ?.steps.some((step) => step.id === "adverse-action-process") ?? false
    ).toBe(false);
  });

  it("shows Welcome & Complete last in Post-hire", () => {
    const postHire = filterStepLibraryByPhase(
      [
        ...library,
        {
          id: "communication-notification",
          label: "Communication & Notification Steps",
          steps: [
            { id: "status-update-notification", label: "Status Update Email / Notification", icon: null },
            { id: "welcome-email", label: "Welcome Email", icon: null },
          ],
        },
        {
          id: "team-operational",
          label: "Team & Operational Steps",
          steps: [{ id: "schedule-assignment", label: "Schedule Assignment", icon: null }],
        },
        {
          id: "training-development",
          label: "Training & Development Steps",
          steps: [{ id: "safety-training", label: "Safety Training", icon: null }],
        },
      ],
      "post_hire"
    );

    expect(postHire.at(-1)?.id).toBe("communication-notification");
    expect(resolveCategoryDisplayLabel("communication-notification", "Communication")).toBe(
      "Welcome & Complete"
    );
  });

  it("shows Welcome & Complete under Post-hire only", () => {
    const preHire = filterStepLibraryByPhase(library, "pre_hire");
    const postHire = filterStepLibraryByPhase(
      [
        ...library,
        {
          id: "communication-notification",
          label: "Communication & Notification Steps",
          steps: [
            { id: "status-update-notification", label: "Status Update Email / Notification", icon: null },
            { id: "welcome-email", label: "Welcome Email", icon: null },
          ],
        },
      ],
      "post_hire"
    );

    expect(preHire.some((category) => category.id === "communication-notification")).toBe(false);
    expect(postHire.some((category) => category.id === "communication-notification")).toBe(true);
    expect(resolveCategoryDisplayLabel("communication-notification", "Communication")).toBe(
      "Welcome & Complete"
    );
  });

  it("shows a single Post-hire Payroll & Tax group in Figma order", () => {
    const postHire = filterStepLibraryByPhase(library, "post_hire");
    const payrollGroups = postHire.filter(
      (category) =>
        category.id === "payroll-financial" ||
        category.id === "document-esign" ||
        /payroll/i.test(category.label)
    );
    expect(payrollGroups.map((category) => category.id)).toEqual(["payroll-financial"]);
    expect(payrollGroups[0]?.steps.map((step) => step.id)).toEqual([
      "tax-forms",
      "direct-deposit-setup",
      "benefits-enrollment",
      "401k-enrollment",
      "payroll-profile-creation",
      "i9-section-2",
    ]);
    expect(payrollGroups[0]?.steps.map((step) => step.label)).toEqual([
      "Tax Forms (W-4 / State)",
      "Direct Deposit Setup",
      "Benefits Enrollment / Selection",
      "401K / Retirement Enrollment",
      "Payroll Profile Creation",
      "I-9 (2)",
    ]);
  });

  it("shows Document Upload under Post-hire Payroll & Taxes only", () => {
    const preHire = filterStepLibraryByPhase(library, "pre_hire");
    const postHire = filterStepLibraryByPhase(library, "post_hire");

    expect(
      preHire.some((category) =>
        category.steps.some((step) => step.id === "document-upload")
      )
    ).toBe(false);

    const training = postHire.find((category) => category.id === "training-development");
    expect(training?.steps.some((step) => step.id === "document-upload")).toBe(true);
  });

  it("uses slate theme for custom step icon styling", () => {
    expect(
      resolveStepThemeColor({ id: "custom-step" }, "custom-steps", "Custom Steps")
    ).toBe(LIBRARY_THEME_COLORS.slate);
  });

  it("uses category color for steps inside a single-theme section", () => {
    expect(
      resolveStepThemeColor(
        { id: "skill-qualification-assessment" },
        "screening",
        "Screening"
      )
    ).toBe(LIBRARY_THEME_COLORS.screening);
    expect(
      resolveStepThemeColor({ id: "offer-acceptance" }, "offer-agreement", "Offer & Agreement")
    ).toBe(LIBRARY_THEME_COLORS.offerAgreement);
  });

  it("keeps mixed-category accents for legacy grouped steps", () => {
    expect(
      resolveStepThemeColor({ id: "release-to-client" }, "approval-decision", "Approval & Decision Steps")
    ).toBe(LIBRARY_THEME_COLORS.submission);
    expect(
      resolveStepThemeColor({ id: "background-check" }, "screening-compliance", "Screening & Compliance Steps")
    ).toBe(LIBRARY_THEME_COLORS.compliance);
  });

  it("resolves canvas node theme colors from stage / step id like the library", () => {
    expect(resolveCanvasStepThemeColor("collect-extra-files")).toBe(LIBRARY_THEME_COLORS.intake);
    expect(resolveCanvasStepThemeColor("references-collection")).toBe(LIBRARY_THEME_COLORS.intake);
    expect(resolveCanvasStepThemeColor("custom-form")).toBe(LIBRARY_THEME_COLORS.intake);
    expect(resolveCanvasStepThemeColor("recruiter-screening")).toBe(LIBRARY_THEME_COLORS.screening);
    expect(resolveCanvasStepThemeColor("background-check")).toBe(LIBRARY_THEME_COLORS.compliance);
    expect(resolveCanvasStepThemeColor("release-to-client")).toBe(LIBRARY_THEME_COLORS.submission);
    expect(resolveCanvasStepThemeColor("unknown-step", "Intake")).toBe(LIBRARY_THEME_COLORS.intake);
  });

  it("respects explicit defaultPhase on a step", () => {
    expect(
      resolveStepLibraryPhase(
        { id: "release-to-client", defaultPhase: "transition" },
        "approval-decision",
        "Approval & Decision Steps"
      )
    ).toBe("pre_hire");
    expect(
      resolveStepLibraryPhase(
        { id: "document-upload", defaultPhase: "post_hire" },
        "application-profile",
        "Application & Profile"
      )
    ).toBe("post_hire");
  });
});

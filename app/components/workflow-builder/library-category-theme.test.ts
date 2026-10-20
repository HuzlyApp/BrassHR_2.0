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
  it("uses the category label stored with the library row", () => {
    expect(resolveCategoryDisplayLabel("application-profile", "Intake")).toBe("Intake");
    expect(resolveCategoryDisplayLabel("communication-notification", "Welcome")).toBe("Welcome");
    expect(resolveStepThemeColor({ id: "resume-basic-profile" }, "application-profile", "Intake")).toBe(
      "#2563EB"
    );
  });

  it("filters tabs from the loaded rows and does not add missing steps", () => {
    const preHire = filterStepLibraryByPhase(library, "pre_hire");
    const postHire = filterStepLibraryByPhase(library, "post_hire");
    const loadedIds = library.flatMap((category) => category.steps.map((step) => step.id));

    expect(preHire.map((category) => category.id)).toEqual([
      "application-profile",
      "custom-steps",
      "approval-decision",
      "screening-compliance",
    ]);
    expect(postHire.map((category) => category.id)).toEqual([
      "payroll-financial",
      "custom-steps",
      "document-esign",
    ]);
    for (const id of [...preHire, ...postHire].flatMap((category) => category.steps.map((step) => step.id))) {
      expect(loadedIds).toContain(id);
    }
    expect(preHire.flatMap((category) => category.steps.map((step) => step.id))).not.toContain(
      "collect-extra-files"
    );
  });

  it("merges flexible custom steps into the first Custom Steps group", () => {
    const merged = mergeCustomStepCategories(library);
    expect(merged.find((category) => category.id === "custom-steps")?.steps.map((s) => s.id)).toEqual([
      "custom-step",
      "custom-form",
      "manual-task-hr-action",
      "completion-milestone",
    ]);
    expect(merged.some((category) => category.id === "custom-flexible")).toBe(false);
  });

  it("keeps the labels and steps that were loaded", () => {
    const preHire = filterStepLibraryByPhase(library, "pre_hire");
    const intake = preHire.find((category) => category.id === "application-profile");
    expect(intake?.label).toBe("Application & Profile");
    expect(intake?.steps.map((step) => step.label)).toEqual([
      "Resume & Basic Profile",
      "References Collection",
      "Skill / Qualification Assessment",
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
      resolveStepThemeColor({ id: "offer-acceptance" }, "offer-agreement", "Offer and agreement")
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

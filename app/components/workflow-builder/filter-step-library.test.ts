import { describe, expect, it } from "vitest";
import {
  collectUsedLibrarySteps,
  countLibraryMatches,
  excludeUsedLibrarySteps,
  filterStepLibrary,
  flattenStepLibrary,
  stepMatchesSearch,
} from "./filter-step-library";
import type { StepCategory } from "./types";

const library: StepCategory[] = [
  {
    id: "custom-steps",
    label: "Custom Steps",
    steps: [{ id: "custom-step", label: "Custom Step", icon: null, description: "Tenant checkpoint" }],
  },
  {
    id: "document-esign",
    label: "Document & eSign",
    steps: [
      { id: "document-upload", label: "Document Upload", icon: null, description: "Request documents" },
      {
        id: "tax-forms",
        label: "Tax Forms (W-4 / State)",
        icon: null,
        description: "Collect payroll tax forms.",
        keywords: ["w4", "w-4"],
      },
      {
        id: "policy-acknowledgment",
        label: "Policy Acknowledgment",
        icon: null,
        description: "Collect policy acknowledgments.",
      },
    ],
  },
  {
    id: "application-profile",
    label: "Application & Profile",
    steps: [
      {
        id: "references-collection",
        label: "References Collection",
        icon: null,
        description: "Ask applicants to provide professional references.",
      },
      {
        id: "reference-verification",
        label: "Reference Verification",
        icon: null,
        description: "Track reference verification.",
      },
    ],
  },
];

describe("filterStepLibrary", () => {
  it("matches tax search to Tax Forms by stable id, not index", () => {
    const filtered = filterStepLibrary(library, "tax");
    const ids = flattenStepLibrary(filtered).map((s) => s.id);
    expect(ids).toEqual(["tax-forms"]);
    expect(ids).not.toContain("references-collection");
  });

  it("matches reference search without returning by list index", () => {
    const filtered = filterStepLibrary(library, "reference");
    const ids = flattenStepLibrary(filtered).map((s) => s.id);
    expect(ids).toEqual(["references-collection", "reference-verification"]);
  });

  it("matches policy by name after filtering other categories", () => {
    const filtered = filterStepLibrary(library, "policy");
    const ids = flattenStepLibrary(filtered).map((s) => s.id);
    expect(ids).toEqual(["policy-acknowledgment"]);
  });

  it("matches category and description text", () => {
    expect(stepMatchesSearch(library[1].steps[0], "document", "Document & eSign")).toBe(true);
    expect(stepMatchesSearch(library[1].steps[1], "payroll", "Document & eSign")).toBe(true);
  });

  it("keeps original step definition ids after filtering", () => {
    const filtered = filterStepLibrary(library, "policy");
    const step = filtered[0].steps[0];
    expect(step.id).toBe("policy-acknowledgment");
    expect(step.label).toBe("Policy Acknowledgment");
  });
});

describe("excludeUsedLibrarySteps", () => {
  it("hides steps already on the canvas and restores empty categories", () => {
    const filtered = excludeUsedLibrarySteps(library, [
      "document-upload",
      "tax-forms",
      "policy-acknowledgment",
    ]);
    const ids = flattenStepLibrary(filtered).map((s) => s.id);
    expect(ids).toEqual([
      "custom-step",
      "references-collection",
      "reference-verification",
    ]);
    expect(filtered.some((c) => c.id === "document-esign")).toBe(false);
  });

  it("keeps Custom Step available even when already used", () => {
    const filtered = excludeUsedLibrarySteps(library, ["custom-step", "tax-forms"]);
    const ids = flattenStepLibrary(filtered).map((s) => s.id);
    expect(ids).toContain("custom-step");
    expect(ids).not.toContain("tax-forms");
  });

  it("returns the original library when nothing is used", () => {
    expect(excludeUsedLibrarySteps(library, [])).toBe(library);
  });

  it("hides library rows when the canvas uses a legacy alias id", () => {
    const offerLibrary: StepCategory[] = [
      {
        id: "offer-agreement",
        label: "Offer and agreement",
        steps: [
          { id: "pay-rate-hire-date", label: "Pay and start date", icon: null },
          { id: "offer-prep", label: "Offer prep", icon: null },
        ],
      },
    ];
    const filtered = excludeUsedLibrarySteps(offerLibrary, ["pay-and-start-date"]);
    expect(flattenStepLibrary(filtered).map((s) => s.id)).toEqual(["offer-prep"]);
  });

  it("keeps a stage visible and empty when every step in it is already used", () => {
    const filtered = excludeUsedLibrarySteps(
      library,
      ["document-upload", "tax-forms", "policy-acknowledgment"],
      { retainEmptyCategories: true }
    );
    const documentStage = filtered.find((category) => category.id === "document-esign");
    expect(documentStage?.steps).toEqual([]);
    expect(documentStage?.takenSteps?.map((step) => step.id)).toEqual([
      "document-upload",
      "tax-forms",
      "policy-acknowledgment",
    ]);
    expect(filtered.some((category) => category.id === "application-profile")).toBe(true);
    expect(flattenStepLibrary(filtered).map((step) => step.id)).not.toContain("tax-forms");
  });

  it("keeps an emptied stage in search results for a step that was already used", () => {
    const available = excludeUsedLibrarySteps(
      library,
      ["document-upload", "tax-forms", "policy-acknowledgment"],
      { retainEmptyCategories: true }
    );
    const filtered = filterStepLibrary(available, "tax");
    expect(filtered.map((category) => category.id)).toEqual(["document-esign"]);
    expect(filtered[0]?.steps).toEqual([]);
    expect(countLibraryMatches(filtered)).toBe(1);
  });

  it("hides library rows by matching canvas labels when ids diverge", () => {
    const offerLibrary: StepCategory[] = [
      {
        id: "offer-agreement",
        label: "Offer and agreement",
        steps: [
          { id: "offer-prep", label: "Offer prep", icon: null },
          {
            id: "i9-right-to-work-verification",
            label: "I-9 Section 1",
            icon: null,
          },
          { id: "manager-approval", label: "Manager approval", icon: null },
        ],
      },
    ];
    const filtered = excludeUsedLibrarySteps(offerLibrary, ["i9-section-1"], {
      usedLabels: ["Offer prep", "Manager approval"],
    });
    expect(flattenStepLibrary(filtered).map((s) => s.id)).toEqual([]);
    expect(filtered.some((category) => category.id === "offer-agreement")).toBe(false);
  });

  it("keeps an empty stage when the library should still show the heading", () => {
    const offerLibrary: StepCategory[] = [
      {
        id: "offer-agreement",
        label: "Offer and agreement",
        steps: [
          { id: "offer-prep", label: "Offer prep", icon: null },
          { id: "manager-approval", label: "Manager approval", icon: null },
        ],
      },
    ];
    const filtered = excludeUsedLibrarySteps(
      offerLibrary,
      ["offer-prep", "manager-approval"],
      { keepEmptyCategories: true }
    );
    expect(filtered.map((category) => category.id)).toEqual(["offer-agreement"]);
    expect(filtered[0]?.steps).toEqual([]);
  });
});

describe("collectUsedLibrarySteps", () => {
  it("reads stepId and label from step nodes and ignores drop zones", () => {
    const { stepIds, labels } = collectUsedLibrarySteps([
      {
        type: "step",
        data: { stepId: "offer-prep", label: "Offer prep" },
      },
      {
        type: "dropZone",
        data: { kind: "dropZone" },
      },
      {
        type: "step",
        data: { stepId: "i9-section-1", label: "I-9 Section 1" },
      },
    ]);
    expect(stepIds.has("offer-prep")).toBe(true);
    expect(stepIds.has("i9-section-1")).toBe(true);
    expect(stepIds.has("i9-right-to-work-verification")).toBe(true);
    expect(labels.has("offer prep")).toBe(true);
    expect(labels.has("i-9 section 1")).toBe(true);
  });
});

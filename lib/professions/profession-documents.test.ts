import { describe, expect, it } from "vitest";
import {
  attachProfessionDocuments,
  normalizeProfessionDocumentDrafts,
} from "@/lib/professions/profession-documents";
import type { TenantOnboardingConfig } from "@/lib/onboarding/types";

const config: TenantOnboardingConfig = {
  configId: "cfg",
  tenantId: "tenant",
  version: 1,
  steps: [
    {
      id: "license-step",
      step_key: "professional_license",
      title: "Licenses",
      description: null,
      step_type: "professional_license",
      sort_order: 20,
      is_required: true,
      is_enabled: true,
      metadata: {},
    },
  ],
  requiredDocuments: [
    {
      id: "old",
      onboarding_step_id: "license-step",
      title: "Old license",
      description: null,
      is_required: true,
      sort_order: 10,
      accepted_file_types: ["pdf"],
      max_file_size_mb: 10,
    },
  ],
  skillAssessments: [],
};

describe("normalizeProfessionDocumentDrafts", () => {
  it("keeps certificate and license rows and marks optional documents", () => {
    const result = normalizeProfessionDocumentDrafts([
      { id: "new-1", name: " CPR ", documentKind: "certificate", isRequired: true },
      { id: "11111111-1111-1111-1111-111111111111", name: "State license", documentKind: "license", isRequired: false },
    ]);
    expect(result).toEqual({
      documents: [
        { id: null, name: "CPR", documentKind: "certificate", isRequired: true },
        {
          id: "11111111-1111-1111-1111-111111111111",
          name: "State license",
          documentKind: "license",
          isRequired: false,
        },
      ],
    });
  });

  it("rejects a duplicate name and an unknown kind", () => {
    expect(normalizeProfessionDocumentDrafts([
      { name: "CPR", documentKind: "certificate", isRequired: true },
      { name: "cpr", documentKind: "certificate", isRequired: false },
    ])).toEqual({ error: "“cpr” is listed more than once." });
    expect(normalizeProfessionDocumentDrafts([
      { name: "Badge", documentKind: "id", isRequired: true },
    ])).toEqual({ error: "Each document must be a certificate or a license." });
  });
});

describe("attachProfessionDocuments", () => {
  it("replaces the license step list and keeps required versus optional", () => {
    const next = attachProfessionDocuments(config, [
      {
        id: "doc-cpr",
        name: "CPR",
        documentKind: "certificate",
        isRequired: false,
        sortOrder: 20,
      },
      {
        id: "doc-license",
        name: "Nursing license",
        documentKind: "license",
        isRequired: true,
        sortOrder: 10,
      },
    ]);

    expect(next.requiredDocuments.map((doc) => [doc.title, doc.is_required, doc.description, doc.source])).toEqual([
      ["Nursing license", true, "License", "profession"],
      ["CPR", false, "Certificate", "profession"],
    ]);
  });
});

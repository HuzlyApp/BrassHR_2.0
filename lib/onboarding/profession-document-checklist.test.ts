import { describe, expect, it } from "vitest";
import { buildProfessionDocumentChecklist } from "@/lib/onboarding/profession-document-checklist";

const documents = [
  {
    id: "dl",
    name: "Driver license",
    documentKind: "license" as const,
    isRequired: true,
    hasExpiration: true,
    sortOrder: 10,
  },
  {
    id: "ssn",
    name: "SSN card",
    documentKind: "certificate" as const,
    isRequired: true,
    hasExpiration: false,
    sortOrder: 20,
  },
  {
    id: "java",
    name: "IT JAVA certificate",
    documentKind: "certificate" as const,
    isRequired: true,
    hasExpiration: false,
    sortOrder: 30,
  },
  {
    id: "aws",
    name: "AWS certification",
    documentKind: "certificate" as const,
    isRequired: false,
    hasExpiration: false,
    sortOrder: 40,
  },
];

describe("buildProfessionDocumentChecklist", () => {
  it("checks off identity documents already collected and leaves the rest open", () => {
    const checklist = buildProfessionDocumentChecklist({
      professionId: "it",
      professionName: "IT",
      documents,
      uploads: [],
      identity: { ssnUrl: "tenant/worker/ssn.pdf", driversLicenseUrl: "tenant/worker/dl.pdf" },
    });

    expect(checklist.items.find((item) => item.id === "dl")).toMatchObject({
      collected: true,
      collectedOnIdentityStep: true,
    });
    expect(checklist.items.find((item) => item.id === "ssn")).toMatchObject({
      collected: true,
      collectedOnIdentityStep: true,
    });
    expect(checklist.missingRequired).toEqual(["IT JAVA certificate"]);
  });

  it("treats a profession upload as collected and ignores a rejected file", () => {
    const checklist = buildProfessionDocumentChecklist({
      professionId: "it",
      professionName: "IT",
      documents,
      uploads: [
        { id: "file-1", professionDocumentId: "java", fileName: "java.pdf", status: "uploaded" },
        { id: "file-2", professionDocumentId: "aws", fileName: "old.pdf", status: "rejected" },
      ],
      identity: {},
    });

    expect(checklist.items.find((item) => item.id === "java")?.files).toEqual([
      { id: "file-1", name: "java.pdf" },
    ]);
    expect(checklist.items.find((item) => item.id === "java")?.collected).toBe(true);
    expect(checklist.items.find((item) => item.id === "aws")?.collected).toBe(false);
    expect(checklist.missingRequired).toEqual(["Driver license", "SSN card"]);
  });
});

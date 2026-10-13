import { describe, expect, it } from "vitest";
import {
  NURSING_W2_DOCUMENTS,
  assertEmploymentFlowHasProfession,
  credentialBelongsToTenant,
  credentialUpsertKey,
  documentsForApply,
  nursingApplyShowsExpectedDocuments,
  professionVisibleToIndustry,
  startersForIndustry,
  validateCredentialDates,
} from "@/lib/professions/catalog";

describe("profession catalog", () => {
  it("shows Nursing to a healthcare tenant and hides it from IT", () => {
    const healthcare = startersForIndustry("healthcare").map((row) => row.name);
    const technology = startersForIndustry("technology").map((row) => row.name);
    expect(healthcare).toContain("Nursing");
    expect(technology).not.toContain("Nursing");
    expect(professionVisibleToIndustry("healthcare", "healthcare")).toBe(true);
    expect(professionVisibleToIndustry("healthcare", "technology")).toBe(false);
  });

  it("rejects a new W2 flow without a profession", () => {
    expect(() =>
      assertEmploymentFlowHasProfession({ employmentType: "W2", professionId: null })
    ).toThrow(/profession/i);
    expect(() =>
      assertEmploymentFlowHasProfession({
        employmentType: "W2",
        professionId: "11111111-1111-1111-1111-111111111111",
      })
    ).not.toThrow();
  });

  it("lists the nursing documents and leaves forklift off that flow", () => {
    const nursing = NURSING_W2_DOCUMENTS.map((doc) => ({
      code: doc.code,
      name: doc.name,
      isRequired: doc.isRequired,
      hasExpiration: doc.hasExpiration,
      isActive: true,
    }));
    expect(nursingApplyShowsExpectedDocuments(nursing)).toBe(true);
    const visible = documentsForApply([
      ...nursing,
      {
        code: "FORKLIFT_OPERATOR",
        name: "Forklift Operator Certification",
        isRequired: true,
        hasExpiration: true,
        isActive: false,
      },
    ]);
    expect(visible.map((doc) => doc.code)).not.toContain("FORKLIFT_OPERATOR");
  });

  it("requires an expiry date for CPR and accepts SSN without one", () => {
    expect(
      validateCredentialDates({ hasExpiration: true, issuedDate: "2024-01-01", expiryDate: null })
    ).toMatch(/expiry/i);
    expect(
      validateCredentialDates({ hasExpiration: false, issuedDate: null, expiryDate: null })
    ).toBeNull();
    expect(
      validateCredentialDates({
        hasExpiration: true,
        issuedDate: "2026-02-01",
        expiryDate: "2026-01-01",
      })
    ).toMatch(/on or after/i);
  });

  it("keeps one current credential key and hides another tenant", () => {
    const key = credentialUpsertKey({
      tenantId: "tenant-a",
      workerId: "worker-1",
      requiredDocumentId: "doc-1",
    });
    expect(
      credentialUpsertKey({
        tenantId: "tenant-a",
        workerId: "worker-1",
        requiredDocumentId: "doc-1",
      })
    ).toBe(key);
    expect(credentialBelongsToTenant("tenant-a", "tenant-b")).toBe(false);
    expect(credentialBelongsToTenant("tenant-a", "tenant-a")).toBe(true);
  });
});

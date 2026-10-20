import { describe, expect, it } from "vitest";
import {
  LICENSE_TYPE_LABELS,
  LICENSE_TYPES,
  licenseTypeDisplayLabel,
  normalizeOtherCertificationName,
} from "@/lib/applicant-portal/documents";

describe("applicant certification types", () => {
  it("includes BLS, ACLS, and Other Certification", () => {
    expect(LICENSE_TYPES).toEqual(
      expect.arrayContaining(["bls_certification", "acls_certification", "other_certification"])
    );
    expect(LICENSE_TYPE_LABELS.bls_certification).toBe("BLS");
    expect(LICENSE_TYPE_LABELS.acls_certification).toBe("ACLS");
    expect(LICENSE_TYPE_LABELS.other_certification).toBe("Other Certification");
  });

  it("shows the entered name for Other Certification", () => {
    expect(licenseTypeDisplayLabel("other_certification", "NIH Stroke Scale")).toBe(
      "Other Certification: NIH Stroke Scale"
    );
    expect(licenseTypeDisplayLabel("bls_certification")).toBe("BLS");
    expect(licenseTypeDisplayLabel("acls_certification", "ignored")).toBe("ACLS");
  });

  it("requires a certification name within 120 characters", () => {
    expect(normalizeOtherCertificationName("  PALS  ")).toEqual({ ok: true, value: "PALS" });
    expect(normalizeOtherCertificationName("   ")).toEqual({
      ok: false,
      error: "Enter the certification name.",
    });
    expect(normalizeOtherCertificationName("x".repeat(121)).ok).toBe(false);
  });
});

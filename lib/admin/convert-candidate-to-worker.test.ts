import { describe, expect, it } from "vitest";
import {
  buildEmploymentWorkerRow,
  isCandidateAlreadyConverted,
  isCandidateEligibleForConversion,
  parseConvertWorkerType,
  resolveCandidateConversionState,
  resolveConvertedWorkerTypeLabel,
  workerConversionFields,
  workerConversionLabel,
  workerConversionActiveLabel,
  workerConversionEmploymentTypeShort,
  formatWorkerDisplayId,
} from "./convert-candidate-to-worker";

describe("convert-candidate-to-worker", () => {
  const candidate = {
    id: "cand-1",
    tenant_id: "tenant-1",
    first_name: "Jane",
    last_name: "Doe",
    email: "jane@example.com",
    phone: "5551234567",
    job_role: "Server",
    city: "Austin",
    state: "TX",
  };

  it("parses worker type values", () => {
    expect(parseConvertWorkerType("w2")).toBe("w2");
    expect(parseConvertWorkerType("W-2")).toBe("w2");
    expect(parseConvertWorkerType("1099")).toBe("1099");
    expect(parseConvertWorkerType("contractor")).toBeNull();
  });

  it("maps W-2 conversion fields", () => {
    expect(workerConversionFields("w2")).toEqual({
      worker_type: "w2",
      employment_classification: "employee",
      tax_withholding_required: true,
      payroll_enabled: true,
      contractor_payment_enabled: false,
      conversion_status: "converted",
    });
  });

  it("maps 1099 conversion fields", () => {
    expect(workerConversionFields("1099")).toEqual({
      worker_type: "1099",
      employment_classification: "contractor",
      tax_withholding_required: false,
      payroll_enabled: false,
      contractor_payment_enabled: true,
      conversion_status: "converted",
    });
  });

  it("builds employment worker row from candidate snapshot", () => {
    const row = buildEmploymentWorkerRow(
      { ...candidate, profile_photo: "photos/jane.jpg" },
      "w2",
      "2026-06-23T12:00:00.000Z",
      {
        sourceJobApplicationId: "app-1",
        applicationSnapshot: { id: "app-1", status: "hired" },
        documentsManifest: [{ source: "worker_resumes", id: "r1", path: "a.pdf" }],
      }
    );
    expect(row).toMatchObject({
      tenant_id: "tenant-1",
      candidate_id: "cand-1",
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@example.com",
      phone: "5551234567",
      worker_type: "w2",
      employment_classification: "employee",
      job_role: "Server",
      location: "Austin, TX",
      profile_photo: "photos/jane.jpg",
      status: "active",
      conversion_status: "converted",
      converted_at: "2026-06-23T12:00:00.000Z",
      source_job_application_id: "app-1",
      application_snapshot: { id: "app-1", status: "hired" },
    });
    expect(row.documents_manifest).toHaveLength(1);
    expect(workerConversionLabel("1099")).toBe("1099 Contractor");
  });

  it("resolves converted candidate state from worker fields", () => {
    expect(
      resolveCandidateConversionState({
        status: "converted",
        converted_worker_type: "w2",
        converted_at: "2026-06-23T12:00:00.000Z",
      })
    ).toEqual({
      isConverted: true,
      convertedWorkerType: "w2",
      convertedAt: "2026-06-23T12:00:00.000Z",
    });

    expect(
      resolveCandidateConversionState({
        status: "approved",
        converted_worker_type: "w2",
      }).isConverted
    ).toBe(false);

    expect(isCandidateAlreadyConverted({ status: "converted" })).toBe(true);
    expect(isCandidateEligibleForConversion({ status: "approved" })).toBe(true);
    expect(isCandidateEligibleForConversion({ status: "for_approval" })).toBe(true);
    expect(isCandidateEligibleForConversion({ status: "pending" })).toBe(false);
    expect(resolveConvertedWorkerTypeLabel("w2")).toBe("W-2 Employee");
    expect(resolveConvertedWorkerTypeLabel("1099")).toBe("1099 Contractor");
    expect(workerConversionActiveLabel("w2")).toBe("W-2 Active Worker");
    expect(workerConversionActiveLabel("1099")).toBe("1099 Active Contractor");
    expect(workerConversionEmploymentTypeShort("w2")).toBe("W2-Employee");
    expect(workerConversionEmploymentTypeShort("1099")).toBe("1099-Contractor");
    expect(formatWorkerDisplayId("abcd-efgh-ijkl-mnop", "EMP-42")).toBe("EMP-42");
    expect(formatWorkerDisplayId("abcd-efgh-ijkl-mnop")).toBe("WRK-ABCD");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireStaffApiSession = vi.fn();
const resolveStaffTenantId = vi.fn();
const createServiceRoleClient = vi.fn();
const getMspSubmissionView = vi.fn();
const submitCandidateToMsp = vi.fn();

vi.mock("@/lib/auth/api-session", () => ({
  requireStaffApiSession: (...args: unknown[]) => requireStaffApiSession(...args),
}));
vi.mock("@/lib/jobs/tenant", () => ({
  resolveStaffTenantId: (...args: unknown[]) => resolveStaffTenantId(...args),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: (...args: unknown[]) => createServiceRoleClient(...args),
}));
vi.mock("@/lib/jobs/msp-submission-service", () => ({
  getMspSubmissionView: (...args: unknown[]) => getMspSubmissionView(...args),
  submitCandidateToMsp: (...args: unknown[]) => submitCandidateToMsp(...args),
}));
vi.mock("@/lib/resolve-app-origin", () => ({
  resolveApplicantEmailAppOrigin: () => "http://localhost",
}));

describe("MSP submission route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServiceRoleClient.mockReturnValue({ from: vi.fn() });
    resolveStaffTenantId.mockResolvedValue("tenant-1");
  });

  it("rejects an unauthorized caller", async () => {
    requireStaffApiSession.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("http://localhost/api"), {
      params: Promise.resolve({ id: "app-1" }),
    });
    expect(response.status).toBe(401);
    expect(submitCandidateToMsp).not.toHaveBeenCalled();
  });

  it("returns the saved submission for an authorized recruiter", async () => {
    requireStaffApiSession.mockResolvedValue({
      userId: "recruiter-1",
      role: "recruiter",
      godAdmin: false,
    });
    submitCandidateToMsp.mockResolvedValue({
      statusName: "Submitted to MSP",
      decision: { ready: true, nextStatusName: "Submitted to MSP", externalResponseAdvancesStage: false },
      submission: {
        id: "sub-1",
        status: "submitted",
        submittedAt: "2026-10-06T12:00:00.000Z",
        submittedByUserId: "recruiter-1",
        jobRequisitionId: "job-1",
      },
    });
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ notes: "Packet ready", mspReference: "REF-1" }),
      }),
      { params: Promise.resolve({ id: "app-1" }) }
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.statusName).toBe("Submitted to MSP");
    expect(payload.submission.id).toBe("sub-1");
    expect(submitCandidateToMsp).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "recruiter-1", role: "recruiter" }),
      expect.objectContaining({
        applicationId: "app-1",
        tenantId: "tenant-1",
        notes: "Packet ready",
        mspReference: "REF-1",
      })
    );
  });
});

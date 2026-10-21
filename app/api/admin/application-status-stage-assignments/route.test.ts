import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireStaffApiSession = vi.fn();
const resolveStaffTenantId = vi.fn();
const createServiceRoleClient = vi.fn();
const writeActivityLog = vi.fn();
const findOrCreateApplicationStatusStageNote = vi.fn();
const listApplicationStatusStageNotes = vi.fn();
const appendApplicationStatusStageReasonCode = vi.fn();
const replaceApplicationStatusStageLanes = vi.fn();

vi.mock("@/lib/auth/api-session", () => ({
  requireStaffApiSession: (...args: unknown[]) => requireStaffApiSession(...args),
}));

vi.mock("@/lib/jobs/tenant", () => ({
  resolveStaffTenantId: (...args: unknown[]) => resolveStaffTenantId(...args),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: (...args: unknown[]) => createServiceRoleClient(...args),
}));

vi.mock("@/lib/audit/activity-log", () => ({
  writeActivityLog: (...args: unknown[]) => writeActivityLog(...args),
}));

vi.mock("@/lib/jobs/application-statuses", () => ({
  ApplicationStatusError: class ApplicationStatusError extends Error {},
  STAGE_STATUS_LANES: ["happy_path", "alternate", "closed"],
  findOrCreateApplicationStatusStageNote: (...args: unknown[]) =>
    findOrCreateApplicationStatusStageNote(...args),
  listApplicationStatusStageNotes: (...args: unknown[]) => listApplicationStatusStageNotes(...args),
  appendApplicationStatusStageReasonCode: (...args: unknown[]) =>
    appendApplicationStatusStageReasonCode(...args),
  replaceApplicationStatusStageLanes: (...args: unknown[]) =>
    replaceApplicationStatusStageLanes(...args),
  assignGroupToPreHireStage: vi.fn(),
  unassignGroupFromPreHireStage: vi.fn(),
  listApplicationStatusGroupStageAssignments: vi.fn(),
  listApplicationStatusStageLanes: vi.fn(),
  listApplicationStatusStageReasonCodes: vi.fn(),
  listApplicationStatusStageButtons: vi.fn(),
  getApplicationStatusButtonLabels: vi.fn(),
  saveApplicationStatusButtonLabels: vi.fn(),
  replaceApplicationStatusStageReasonCodes: vi.fn(),
}));

const recruiter = {
  userId: "recruiter-1",
  email: "recruiter@example.com",
  role: "recruiter" as const,
  godAdmin: false,
  devBypass: false,
};

function put(body: unknown) {
  return new NextRequest("http://localhost/api/admin/application-status-stage-assignments", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("application status stage assignment writes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireStaffApiSession.mockResolvedValue(recruiter);
    resolveStaffTenantId.mockResolvedValue("tenant-1");
    createServiceRoleClient.mockReturnValue({ from: vi.fn() });
    writeActivityLog.mockResolvedValue(undefined);
  });

  it("lets a recruiter save a follow-up note for the current stage", async () => {
    findOrCreateApplicationStatusStageNote.mockResolvedValue({
      note: { id: "note-1", body: "cb later in the afternoon", stageName: "Intake" },
      created: true,
    });
    listApplicationStatusStageNotes.mockResolvedValue([
      { id: "note-1", body: "cb later in the afternoon", stageName: "Intake", workflowId: "flow-1" },
    ]);

    const { PUT } = await import("@/app/api/admin/application-status-stage-assignments/route");
    const response = await PUT(
      put({
        action: "findOrCreateNote",
        stageName: "Intake",
        workflowId: "flow-1",
        note: "cb later in the afternoon",
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.created).toBe(true);
    expect(payload.note.body).toBe("cb later in the afternoon");
    expect(findOrCreateApplicationStatusStageNote).toHaveBeenCalledWith(expect.anything(), {
      tenantId: "tenant-1",
      stageName: "Intake",
      body: "cb later in the afternoon",
      workflowId: "flow-1",
    });
  });

  it("lets a recruiter add a reason code while saving follow-up", async () => {
    appendApplicationStatusStageReasonCode.mockResolvedValue({
      reasonCodes: [{ stageName: "Intake", code: "Call Back Later", workflowId: "flow-1" }],
      created: false,
    });

    const { PUT } = await import("@/app/api/admin/application-status-stage-assignments/route");
    const response = await PUT(
      put({
        action: "addReasonCode",
        stageName: "Intake",
        workflowId: "flow-1",
        code: "Call Back Later",
      })
    );

    expect(response.status).toBe(200);
    expect(appendApplicationStatusStageReasonCode).toHaveBeenCalled();
  });

  it("still blocks a recruiter from changing stage lane configuration", async () => {
    const { PUT } = await import("@/app/api/admin/application-status-stage-assignments/route");
    const response = await PUT(
      put({
        action: "setLanes",
        stageName: "Intake",
        lanes: { happy_path: [], alternate: [], closed: [] },
      })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "Forbidden" });
    expect(replaceApplicationStatusStageLanes).not.toHaveBeenCalled();
  });
});

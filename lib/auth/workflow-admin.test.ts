import { describe, expect, it } from "vitest";
import { isStaffStageCatalogAction, requireWorkflowAdmin } from "@/lib/auth/workflow-admin";
import type { ApiAuthContext } from "@/lib/auth/api-session";

function auth(role: ApiAuthContext["role"], godAdmin = false): ApiAuthContext {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    email: "staff@example.com",
    role,
    godAdmin,
    devBypass: false,
  };
}

describe("workflow configuration authorization", () => {
  it("blocks recruiters from workflow writes", () => {
    const response = requireWorkflowAdmin(auth("recruiter"));
    expect(response?.status).toBe(403);
  });

  it("allows tenant admins and platform admins", () => {
    expect(requireWorkflowAdmin(auth("admin"))).toBeNull();
    expect(requireWorkflowAdmin(auth("recruiter", true))).toBeNull();
  });

  it("lets staff save follow-up notes and reason codes without opening workflow settings", () => {
    expect(isStaffStageCatalogAction("findOrCreateNote")).toBe(true);
    expect(isStaffStageCatalogAction("addReasonCode")).toBe(true);
    expect(isStaffStageCatalogAction("setLanes")).toBe(false);
    expect(isStaffStageCatalogAction("setReasonCodes")).toBe(false);
    expect(isStaffStageCatalogAction("assign")).toBe(false);
  });
});

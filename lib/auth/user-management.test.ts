import { describe, expect, it } from "vitest";
import { canManageStaffUsers } from "@/lib/auth/user-management";
import type { StaffApiAuthContext } from "@/lib/auth/api-session";

function auth(godAdmin = false): Pick<StaffApiAuthContext, "godAdmin" | "devBypass"> {
  return { godAdmin, devBypass: false };
}

describe("user management authorization", () => {
  it("does not treat a role name as permission to manage users", () => {
    expect(canManageStaffUsers(auth(false), null)).toBe(false);
    expect(canManageStaffUsers(auth(false), { canEdit: false })).toBe(false);
  });

  it("allows company-settings edit and platform admins", () => {
    expect(canManageStaffUsers(auth(false), { canEdit: true })).toBe(true);
    expect(canManageStaffUsers(auth(true), null)).toBe(true);
  });
});

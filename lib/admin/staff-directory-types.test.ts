import { describe, expect, it } from "vitest";
import { isLimitedStaffConsoleRole } from "@/lib/admin/staff-directory-types";

describe("isLimitedStaffConsoleRole", () => {
  it("limits every non-admin staff role, including roles that are not named in code", () => {
    expect(isLimitedStaffConsoleRole("client")).toBe(true);
    expect(isLimitedStaffConsoleRole("recruiter")).toBe(true);
    expect(isLimitedStaffConsoleRole("hr")).toBe(true);
    expect(isLimitedStaffConsoleRole("payroll")).toBe(true);
  });

  it("keeps admin, owner, and catalog admin flags on the full console", () => {
    expect(isLimitedStaffConsoleRole("admin")).toBe(false);
    expect(isLimitedStaffConsoleRole("owner")).toBe(false);
    expect(isLimitedStaffConsoleRole("god_admin")).toBe(false);
    expect(isLimitedStaffConsoleRole("payroll", true)).toBe(false);
  });

  it("does not treat a missing role or a worker as limited staff", () => {
    expect(isLimitedStaffConsoleRole(null)).toBe(false);
    expect(isLimitedStaffConsoleRole("worker")).toBe(false);
  });
});

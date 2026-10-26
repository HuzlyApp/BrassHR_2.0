import { describe, expect, it } from "vitest";
import { appRoleToConsoleRole } from "@/lib/admin/staff-directory-types";

describe("appRoleToConsoleRole", () => {
  it("maps tenant staff roles onto the recruiter console", () => {
    expect(appRoleToConsoleRole("recruiter")).toBe("recruiter");
    expect(appRoleToConsoleRole("client")).toBe("recruiter");
    expect(appRoleToConsoleRole(" Client ")).toBe("recruiter");
  });

  it("maps owners and admins onto the admin console", () => {
    expect(appRoleToConsoleRole("admin")).toBe("admin");
    expect(appRoleToConsoleRole("owner")).toBe("admin");
    expect(appRoleToConsoleRole("ADMIN")).toBe("admin");
  });

  it("does not treat workers or unknown roles as staff console roles", () => {
    expect(appRoleToConsoleRole("worker")).toBeNull();
    expect(appRoleToConsoleRole("support")).toBeNull();
    expect(appRoleToConsoleRole(null)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { SEEDED_STAFF_ROLES } from "@/lib/admin/staff-roles";
import { formatRoleLabel } from "@/lib/account/display-name";

describe("formatRoleLabel", () => {
  it("shows invited recruiters as Recruiter, not the stored client role", () => {
    expect(formatRoleLabel("client", SEEDED_STAFF_ROLES)).toBe("Recruiter");
    expect(formatRoleLabel("recruiter", SEEDED_STAFF_ROLES)).toBe("Recruiter");
  });

  it("shows tenant admins as Admin", () => {
    expect(formatRoleLabel("admin", SEEDED_STAFF_ROLES)).toBe("Admin");
    expect(formatRoleLabel("owner", SEEDED_STAFF_ROLES)).toBe("Admin");
  });

  it("keeps a fallback label when no role is stored", () => {
    expect(formatRoleLabel(null)).toBe("Account Owner");
    expect(formatRoleLabel("support", SEEDED_STAFF_ROLES)).toBe("Support");
  });
});

import { describe, expect, it } from "vitest";
import { formatRoleLabel } from "@/lib/account/display-name";

describe("formatRoleLabel", () => {
  it("shows invited recruiters as Recruiter, not the stored client role", () => {
    expect(formatRoleLabel("client")).toBe("Recruiter");
    expect(formatRoleLabel("recruiter")).toBe("Recruiter");
  });

  it("shows tenant admins as Admin", () => {
    expect(formatRoleLabel("admin")).toBe("Admin");
    expect(formatRoleLabel("owner")).toBe("Admin");
  });

  it("keeps a fallback label when no role is stored", () => {
    expect(formatRoleLabel(null)).toBe("Account Owner");
    expect(formatRoleLabel("support")).toBe("Support");
  });
});

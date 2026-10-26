import { describe, expect, it } from "vitest";
import {
  SEEDED_STAFF_ROLES,
  labelForRole,
  matchStaffRole,
  staffStorageKeys,
  storageKeyForRole,
} from "@/lib/admin/staff-roles";

describe("staff role catalog", () => {
  it("keeps recruiter stored as client and maps that value back to Recruiter", () => {
    expect(storageKeyForRole("recruiter", SEEDED_STAFF_ROLES)).toBe("client");
    expect(matchStaffRole("client", SEEDED_STAFF_ROLES)?.key).toBe("recruiter");
    expect(matchStaffRole(" Client ", SEEDED_STAFF_ROLES)?.key).toBe("recruiter");
    expect(labelForRole("client", SEEDED_STAFF_ROLES)).toBe("Recruiter");
  });

  it("treats owner as the admin alias and keeps the other roles distinct", () => {
    expect(matchStaffRole("owner", SEEDED_STAFF_ROLES)?.key).toBe("admin");
    expect(matchStaffRole("ADMIN", SEEDED_STAFF_ROLES)?.isAdmin).toBe(true);
    expect(storageKeyForRole("hr", SEEDED_STAFF_ROLES)).toBe("hr");
    expect(storageKeyForRole("manager", SEEDED_STAFF_ROLES)).toBe("manager");
    expect(storageKeyForRole("finance", SEEDED_STAFF_ROLES)).toBe("finance");
    expect(storageKeyForRole("support", SEEDED_STAFF_ROLES)).toBe("support");
    expect(labelForRole("hr", SEEDED_STAFF_ROLES)).toBe("HR");
  });

  it("does not treat workers or unknown roles as catalog staff", () => {
    expect(matchStaffRole("worker", SEEDED_STAFF_ROLES)).toBeNull();
    expect(matchStaffRole("candidate", SEEDED_STAFF_ROLES)).toBeNull();
    expect(matchStaffRole(null, SEEDED_STAFF_ROLES)).toBeNull();
  });

  it("includes storage keys and aliases when listing who counts as staff", () => {
    const keys = staffStorageKeys(SEEDED_STAFF_ROLES);
    expect(keys).toContain("client");
    expect(keys).toContain("owner");
    expect(keys).toContain("hr");
    expect(keys).not.toContain("worker");
  });
});

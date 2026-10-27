import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LIMITED_STAFF_RESOURCE_KEYS,
  PERMISSION_RESOURCES,
  actionForMethod,
  classifyProtectedPath,
  editorPermissionResources,
  grantAllows,
  seededGrantForRole,
} from "@/lib/auth/permission-catalog";

const ROOT = path.resolve(__dirname, "../..");
const NON_PAGE_DIRS = new Set(["components", "hooks"]);

describe("permission catalog", () => {
  it("keeps dashboard out of the role editor and always granted", () => {
    expect(editorPermissionResources().some((resource) => resource.key === "dashboard")).toBe(false);
    expect(PERMISSION_RESOURCES.find((resource) => resource.key === "dashboard")?.alwaysGranted).toBe(true);
    expect(seededGrantForRole(true, "dashboard")).toBeNull();
  });

  it("maps legacy admin access to view, edit, and delete, and withholds settings from limited staff", () => {
    expect(seededGrantForRole(true, "settings_company")).toEqual({
      canView: true,
      canEdit: true,
      canDelete: true,
    });
    expect(seededGrantForRole(false, "hiring")).toEqual({
      canView: true,
      canEdit: true,
      canDelete: true,
    });
    expect(seededGrantForRole(false, "settings_company")).toBeNull();
    expect(seededGrantForRole(false, "settings_automation")).toBeNull();
    expect(seededGrantForRole(false, "settings_templates")).toBeNull();
    expect(LIMITED_STAFF_RESOURCE_KEYS).not.toContain("dashboard");
  });

  it("does not let edit grant delete or delete grant edit", () => {
    const grant = { canView: true, canEdit: true, canDelete: false };
    expect(grantAllows(grant, "view")).toBe(true);
    expect(grantAllows(grant, "edit")).toBe(true);
    expect(grantAllows(grant, "delete")).toBe(false);
    expect(grantAllows({ canView: true, canEdit: false, canDelete: true }, "edit")).toBe(false);
    expect(grantAllows(null, "view")).toBe(false);
  });

  it("classifies methods into the three supported actions", () => {
    expect(actionForMethod("GET")).toBe("view");
    expect(actionForMethod("HEAD")).toBe("view");
    expect(actionForMethod("POST")).toBe("edit");
    expect(actionForMethod("PUT")).toBe("edit");
    expect(actionForMethod("PATCH")).toBe("edit");
    expect(actionForMethod("DELETE")).toBe("delete");
  });

  it("lets the longer scheduling prefix win over interviews", () => {
    expect(classifyProtectedPath("/admin_recruiter/calendar")).toMatchObject({ resourceKey: "hiring" });
    expect(classifyProtectedPath("/admin_recruiter/calendar/shifts")).toMatchObject({
      resourceKey: "scheduling",
    });
    expect(classifyProtectedPath("/admin_recruiter/dashboard/overview")).toMatchObject({
      resourceKey: "dashboard",
      alwaysGranted: true,
    });
    expect(classifyProtectedPath("/admin_recruiter/dashboard/onboarding-flows")).toMatchObject({
      resourceKey: "settings_automation",
    });
    expect(classifyProtectedPath("/api/admin/header-data")).toEqual({ kind: "shell" });
    expect(classifyProtectedPath("/api/admin/view-as-tenant")).toEqual({ kind: "god_only" });
    expect(classifyProtectedPath("/api/admin/not-a-module")).toEqual({ kind: "unmapped" });
  });

  it("classifies every admin API directory", () => {
    const dirs = readdirSync(path.join(ROOT, "app/api/admin"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(dirs.length).toBeGreaterThan(40);
    for (const dir of dirs) {
      const classified = classifyProtectedPath(`/api/admin/${dir}`);
      expect(classified.kind, dir).not.toBe("unmapped");
    }
  });

  it("classifies every admin page directory", () => {
    const dirs = readdirSync(path.join(ROOT, "app/admin_recruiter"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !NON_PAGE_DIRS.has(entry.name))
      .map((entry) => entry.name);
    for (const dir of dirs) {
      const classified = classifyProtectedPath(`/admin_recruiter/${dir}`);
      expect(classified.kind, dir).toBe("resource");
    }
  });

  it("seeds the same resource keys the migration inserts", () => {
    const sql = require("node:fs").readFileSync(
      path.join(ROOT, "supabase/migrations/20261028010000_role_module_permissions.sql"),
      "utf8"
    );
    for (const resource of PERMISSION_RESOURCES) {
      expect(sql).toContain(`'${resource.key}'`);
    }
    for (const key of LIMITED_STAFF_RESOURCE_KEYS) {
      expect(sql).toContain(`'${key}'`);
    }
    expect(sql).not.toContain("'create'");
    expect(sql).not.toContain("'approve'");
    expect(sql).not.toContain("'manage'");
  });
});

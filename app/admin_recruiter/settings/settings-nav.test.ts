import { describe, expect, it } from "vitest";
import {
  isSettingsMiniSidebarPath,
  isSettingsNavItemActive,
  SETTINGS_NAV_GROUPS,
  visibleSettingsNavGroups,
} from "./settings-nav";

describe("Settings Navigation & Mini-Sidebar Persistence", () => {
  it("keeps mini-sidebar active for all registered settings and account tabs", () => {
    const testPaths = [
      // Personal Settings
      "/admin_recruiter/account",
      "/admin_recruiter/account/personal",
      "/admin_recruiter/account/account-settings",
      "/admin_recruiter/account/business-info",
      "/admin_recruiter/account/security",

      // App Settings
      "/admin_recruiter/settings",
      "/admin_recruiter/settings/branding",
      "/admin_recruiter/settings/hiring-theme",
      "/admin_recruiter/notifications",

      // Workflow / Automation
      "/admin_recruiter/dashboard/onboarding-flows",
      "/admin_recruiter/dashboard/workflow-mappings",
      "/admin_recruiter/dashboard/workflowlibrary",
      "/admin_recruiter/dashboard/workflow-builder",
      "/admin_recruiter/dashboard/workflows",
      "/admin_recruiter/dashboard/templates",
      "/admin_recruiter/dashboard/onboarding-builder",

      // Recruitment
      "/admin_recruiter/settings/profession",
      "/admin_recruiter/settings/assessment",
      "/admin_recruiter/settings/statuses",
      "/admin_recruiter/settings/templates",
      "/admin_recruiter/template-builder",
      "/admin_recruiter/email-templates",

      // Administration
      "/admin_recruiter/settings/admin-console",
      "/admin_recruiter/settings/roles",

      // Help & Support
      "/admin_recruiter/help-support",

      // Reports
      "/admin_recruiter/reports",
    ];

    for (const path of testPaths) {
      expect(
        isSettingsMiniSidebarPath(path),
        `Mini sidebar should not close for route: ${path}`
      ).toBe(true);
    }
  });

  it("does not trigger mini-sidebar on unrelated main app routes", () => {
    const nonSettingsPaths = [
      "/admin_recruiter/dashboard/overview",
      "/admin_recruiter/dashboard/home",
      "/admin_recruiter/jobs",
      "/admin_recruiter/applications",
      "/admin_recruiter/workers",
      "/admin_recruiter/managers",
      "/admin_recruiter/calendar/shifts",
    ];

    for (const path of nonSettingsPaths) {
      expect(isSettingsMiniSidebarPath(path)).toBe(false);
    }
  });

  it("correctly identifies active settings nav items", () => {
    const brandingItem = SETTINGS_NAV_GROUPS.flatMap((g) => g.items).find(
      (item) => item.id === "branding"
    );
    expect(brandingItem).toBeDefined();
    expect(
      isSettingsNavItemActive(brandingItem!, "/admin_recruiter/settings/branding")
    ).toBe(true);

    const securityItem = SETTINGS_NAV_GROUPS.flatMap((g) => g.items).find(
      (item) => item.id === "security"
    );
    expect(securityItem).toBeDefined();
    expect(
      isSettingsNavItemActive(securityItem!, "/admin_recruiter/account/security")
    ).toBe(true);

    const profileItem = SETTINGS_NAV_GROUPS.flatMap((g) => g.items).find(
      (item) => item.id === "profile"
    );
    expect(profileItem).toBeDefined();
    expect(
      isSettingsNavItemActive(profileItem!, "/admin_recruiter/account/personal")
    ).toBe(true);

    const templatesItem = SETTINGS_NAV_GROUPS.flatMap((g) => g.items).find(
      (item) => item.id === "templates"
    );
    expect(templatesItem).toBeDefined();
    expect(
      isSettingsNavItemActive(templatesItem!, "/admin_recruiter/settings/templates")
    ).toBe(true);
    expect(
      isSettingsNavItemActive(templatesItem!, "/admin_recruiter/template-builder")
    ).toBe(true);
    expect(
      isSettingsNavItemActive(templatesItem!, "/admin_recruiter/email-templates")
    ).toBe(true);
    expect(
      isSettingsNavItemActive(templatesItem!, "/admin_recruiter/dashboard/templates")
    ).toBe(true);
  });

  it("recognizes settings routes where settings icon acts as a main sidebar toggle", () => {
    // When inside settings (roles, branding, security, etc.), clicking settings icon toggles the main rail
    expect(isSettingsMiniSidebarPath("/admin_recruiter/settings/roles")).toBe(true);
    expect(isSettingsMiniSidebarPath("/admin_recruiter/settings/branding")).toBe(true);
    expect(isSettingsMiniSidebarPath("/admin_recruiter/account/security")).toBe(true);
  });

  it("hides Reports in the mini-sidebar when settings_reports view is missing", () => {
    const withoutReports = visibleSettingsNavGroups(
      SETTINGS_NAV_GROUPS,
      new Set(["settings_company", "settings_profile", "settings_help"])
    );
    const ids = withoutReports.flatMap((group) => group.items.map((item) => item.id));
    expect(ids).not.toContain("reports");
    expect(ids).toContain("branding");

    const withReports = visibleSettingsNavGroups(
      SETTINGS_NAV_GROUPS,
      new Set(["settings_reports", "settings_profile"])
    );
    expect(withReports.flatMap((group) => group.items.map((item) => item.id))).toContain("reports");
  });
});

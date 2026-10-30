// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
  notFound: vi.fn(),
}));

import SettingsReportsRedirectPage from "./reports/page";
import SettingsReportsSubpathRedirectPage from "./reports/[...slug]/page";
import SettingsSectionPage from "./[section]/page";

describe("Settings Reports Redirection", () => {
  it("redirects /admin_recruiter/settings/reports to /admin_recruiter/reports", () => {
    mockRedirect.mockClear();
    SettingsReportsRedirectPage();
    expect(mockRedirect).toHaveBeenCalledWith("/admin_recruiter/reports");
  });

  it("redirects subpaths under /admin_recruiter/settings/reports to /admin_recruiter/reports subpaths", async () => {
    mockRedirect.mockClear();
    await SettingsReportsSubpathRedirectPage({
      params: Promise.resolve({ slug: ["team-productivity"] }),
    });
    expect(mockRedirect).toHaveBeenCalledWith("/admin_recruiter/reports/team-productivity");
  });

  it("redirects section=reports in SettingsSectionPage to /admin_recruiter/reports", async () => {
    mockRedirect.mockClear();
    await SettingsSectionPage({
      params: Promise.resolve({ section: "reports" }),
    });
    expect(mockRedirect).toHaveBeenCalledWith("/admin_recruiter/reports");
  });

  it("redirects section=report in SettingsSectionPage to /admin_recruiter/reports", async () => {
    mockRedirect.mockClear();
    await SettingsSectionPage({
      params: Promise.resolve({ section: "report" }),
    });
    expect(mockRedirect).toHaveBeenCalledWith("/admin_recruiter/reports");
  });

  it("redirects section=template-builder to /admin_recruiter/template-builder", async () => {
    mockRedirect.mockClear();
    await SettingsSectionPage({
      params: Promise.resolve({ section: "template-builder" }),
    });
    expect(mockRedirect).toHaveBeenCalledWith("/admin_recruiter/template-builder");
  });

  it("redirects section=email-templates to /admin_recruiter/email-templates", async () => {
    mockRedirect.mockClear();
    await SettingsSectionPage({
      params: Promise.resolve({ section: "email-templates" }),
    });
    expect(mockRedirect).toHaveBeenCalledWith("/admin_recruiter/email-templates");
  });

  it("does not redirect section=templates, rendering TemplatesSettingsPanel instead", async () => {
    mockRedirect.mockClear();
    const result = await SettingsSectionPage({
      params: Promise.resolve({ section: "templates" }),
    });
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });
});

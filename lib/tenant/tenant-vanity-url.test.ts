import { describe, expect, it } from "vitest";
import {
  buildTenantVanityUrl,
  isAppRouterFlightRequest,
  pickTenantVanityLabel,
  resolveRecruiterDashboardUrl,
} from "@/lib/tenant/tenant-vanity-url";

describe("pickTenantVanityLabel", () => {
  it("prefers subdomain over slug", () => {
    expect(pickTenantVanityLabel({ subdomain: "huzly", slug: "other" })).toBe("huzly");
  });

  it("falls back to slug", () => {
    expect(pickTenantVanityLabel({ subdomain: null, slug: "zipstaff" })).toBe("zipstaff");
  });
});

describe("resolveRecruiterDashboardUrl", () => {
  it("redirects recruiter dashboard from www apex to tenant vanity host", () => {
    const url = resolveRecruiterDashboardUrl({
      path: "/admin_recruiter/home",
      tenantSubdomain: "huzly",
      currentHostname: "www.brasshr.com",
      protocol: "https",
      rootDomain: "brasshr.com",
    });
    expect(url).toBe("https://huzly.brasshr.com/admin_recruiter/home");
  });

  it("keeps relative path when already on tenant vanity host", () => {
    const url = resolveRecruiterDashboardUrl({
      path: "/admin_recruiter/home",
      tenantSubdomain: "huzly",
      currentHostname: "huzly.brasshr.com",
      rootDomain: "brasshr.com",
    });
    expect(url).toBe("/admin_recruiter/home");
  });

  it("keeps staging preview hosts on the same origin", () => {
    const url = resolveRecruiterDashboardUrl({
      path: "/admin_recruiter/jobs",
      tenantSubdomain: "0kjsu1",
      currentHostname: "brasshr-devmode.vercel.app",
      protocol: "https",
      rootDomain: "brasshr.com",
    });
    expect(url).toBe("/admin_recruiter/jobs");
  });

  it("does not build a vanity host when the root domain is a Vercel preview host", () => {
    const url = resolveRecruiterDashboardUrl({
      path: "/admin_recruiter/jobs",
      tenantSubdomain: "0kjsu1",
      currentHostname: "brasshr-devmode.vercel.app",
      protocol: "https",
      rootDomain: "brasshr-devmode.vercel.app",
    });
    expect(url).toBe("/admin_recruiter/jobs");
  });

  it("keeps localhost relative for local development", () => {
    const url = resolveRecruiterDashboardUrl({
      path: "/admin_recruiter/home",
      tenantSubdomain: "huzly",
      currentHostname: "localhost",
      rootDomain: "brasshr.com",
    });
    expect(url).toBe("/admin_recruiter/home");
  });

  it("does not rewrite platform onboarding paths", () => {
    const url = resolveRecruiterDashboardUrl({
      path: "/tenant-onboarding",
      tenantSubdomain: "huzly",
      currentHostname: "www.brasshr.com",
      rootDomain: "brasshr.com",
    });
    expect(url).toBe("/tenant-onboarding");
  });
});

describe("isAppRouterFlightRequest", () => {
  function headers(values: Record<string, string>) {
    return {
      get(name: string) {
        return values[name.toLowerCase()] ?? null;
      },
    };
  }

  it("recognizes client navigations that must stay on the current origin", () => {
    expect(isAppRouterFlightRequest(headers({ rsc: "1" }))).toBe(true);
    expect(isAppRouterFlightRequest(headers({ "next-router-prefetch": "1" }))).toBe(true);
    expect(isAppRouterFlightRequest(headers({ accept: "text/x-component" }))).toBe(true);
    expect(isAppRouterFlightRequest(headers({}), { has: (name) => name === "_rsc" })).toBe(true);
  });

  it("lets a full document load change host", () => {
    expect(isAppRouterFlightRequest(headers({ accept: "text/html" }))).toBe(false);
  });
});

describe("buildTenantVanityUrl", () => {
  it("builds tenant login URL used after onboarding", () => {
    expect(
      buildTenantVanityUrl("huzly", "/login?tenant=huzly&role=admin_recruiter", {
        protocol: "https",
        rootDomain: "brasshr.com",
      })
    ).toBe("https://huzly.brasshr.com/login?tenant=huzly&role=admin_recruiter");
  });
});

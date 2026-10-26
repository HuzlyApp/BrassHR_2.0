import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase-env";
import { isGodAdminUser } from "@/lib/auth/god-admin";
import { isStaffRole, parseAppRole } from "@/lib/auth/app-role";
import { resolveAuthenticatedRecruiterRedirectUrl } from "@/lib/auth/recruiter-dashboard-redirect";
import {
  getUserPlatform,
  isNexusPlatformUser,
  isPlatformEnforcementEnabled,
  logAuthDebug,
} from "@/lib/auth/platform-shared";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ONBOARDING_TENANT_SLUG_COOKIE, OWNER_ONBOARDING_CONTINUATION_SESSION_COOKIE } from "@/lib/tenant/constants";
import { hasOwnerTrialPreparationCookie } from "@/lib/auth/owner-trial-preparation-middleware";
import { lookupTenantSlugBySubdomain } from "@/lib/tenant/lookup-tenant-subdomain";
import {
  extractTenantSubdomainLabel,
  forwardedHostFromHeaders,
  getEffectiveRootDomain,
  isRootDomainHost,
} from "@/lib/tenant/tenant-host-resolution";
import { ensureApplicationTenantQuery, clearTenantSlugCookieOnRootHost } from "@/lib/tenant/ensure-application-tenant-query";
import {
  fetchOwnerOnboardingStatus,
  resolvePostAuthRedirect,
  shouldBlockAdminDashboardAccess,
  shouldBlockTenantOnboardingAccess,
} from "@/lib/auth/owner-onboarding-status";
import {
  IDLE_SESSION_COOKIE,
  idleLogoutRedirectPath,
  idleSessionCookieOptions,
  isIdleSessionExpired,
  parseLastActivityMs,
} from "@/lib/auth/idle-session";

function resolveRequestTenantSlug(request: NextRequest, hostTenantLabel: string | null): string | null {
  const fromQuery = request.nextUrl.searchParams.get("tenant")?.trim().toLowerCase();
  if (fromQuery && fromQuery.length >= 2) return fromQuery;

  const fromCookie = request.cookies.get(ONBOARDING_TENANT_SLUG_COOKIE)?.value?.trim().toLowerCase();
  if (fromCookie && fromCookie.length >= 2) return fromCookie;

  if (hostTenantLabel && hostTenantLabel.length >= 2) return hostTenantLabel;
  return null;
}

function withTenantSlugHeader(request: NextRequest, tenantSlug: string | null): Headers {
  const requestHeaders = new Headers(request.headers);
  if (tenantSlug) requestHeaders.set("x-tenant-slug", tenantSlug);
  return requestHeaders;
}

function withSessionCookies(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value, cookie);
  });
  return to;
}

async function redirectAuthenticatedUser(
  request: NextRequest,
  sessionResponse: NextResponse,
  user: User,
  destination: string
): Promise<NextResponse> {
  const svc = createServiceRoleClient();
  const host = forwardedHostFromHeaders(request.headers);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const protocol = proto === "http" ? "http" : "https";

  const send = (url: string | URL) =>
    withSessionCookies(
      sessionResponse,
      typeof url === "string" && /^https?:\/\//i.test(url)
        ? NextResponse.redirect(url)
        : NextResponse.redirect(typeof url === "string" ? new URL(url, request.url) : url)
    );

  if (!svc) {
    return send(destination);
  }

  try {
    const redirectUrl = await resolveAuthenticatedRecruiterRedirectUrl(svc, user, {
      path: destination,
      currentHostname: host,
      protocol,
    });
    return send(redirectUrl);
  } catch (error) {
    console.error("[middleware] recruiter vanity redirect failed", error);
    return send(destination);
  }
}

function isPublicUiPath(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname === "/signin" || pathname.startsWith("/signin/")) return true;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  if (pathname === "/forgot" || pathname.startsWith("/forgot/")) return true;
  if (pathname === "/reset-password" || pathname.startsWith("/reset-password/")) return true;
  if (pathname === "/auth/callback" || pathname.startsWith("/auth/callback/")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/favicon")) return true;
  if (pathname.startsWith("/auth/v1/")) return true;
  if (pathname.startsWith("/icons/") || pathname.startsWith("/images/")) return true;
  return false;
}

function requestHasBearerToken(request: NextRequest): boolean {
  return /^Bearer\s+\S+/i.test(request.headers.get("authorization") ?? "");
}

/** Supabase session cookie, or a bearer the route handler will verify itself. */
function requestHasAuthCredential(request: NextRequest): boolean {
  if (requestHasBearerToken(request)) return true;
  return request.cookies.getAll().some((cookie) => {
    const name = cookie.name;
    return name.includes("auth-token") || name.startsWith("sb-");
  });
}

function isAnonymousAuthUser(user: { is_anonymous?: boolean } | null | undefined): boolean {
  return user?.is_anonymous === true;
}

/** Public APIs used by marketing / applicant landing pages (no session required). */
function isOwnerTrialPreparationApi(pathname: string): boolean {
  return (
    pathname === "/api/auth/signup/prepare-trial" ||
    pathname === "/api/auth/signup/resend-onboarding-link" ||
    pathname === "/api/auth/signup/trial-status" ||
    pathname === "/api/auth/signup/begin-trial-session"
  );
}
/** Public APIs used by marketing / applicant landing pages (no session required). */
function isPublicApiPath(pathname: string): boolean {
  if (pathname === "/api/tenant-branding") return true;
  if (pathname === "/api/tenant-favicon") return true;
  if (pathname === "/api/worker-onboarding/entry") return true;
  if (pathname === "/api/auth/login-otp/send") return true;
  if (pathname === "/api/auth/login-otp/verify") return true;
  if (pathname === "/api/auth/login-otp/assert-verified") return true;
  if (pathname === "/api/auth/signup") return true;
  if (pathname === "/api/auth/signup/check-email") return true;
  if (pathname === "/api/auth/signup/options") return true;
  if (pathname === "/api/auth/forgot-password/check-email") return true;
  if (pathname === "/api/auth/forgot-password/send") return true;
  if (pathname === "/api/tenants/logo") return true;
  if (pathname === "/api/tenants/favicon") return true;
  if (pathname === "/api/tenants/background") return true;
  if (pathname.startsWith("/api/tenant-onboarding/")) return true;
  return false;
}

/**
 * Refreshes Supabase Auth cookies; enforces login + `app_metadata.platform === nexus` for protected UI/APIs.
 */
export async function proxy(request: NextRequest) {
  const url = getSupabaseUrl();
  const anon = getSupabaseAnonKey();
  const response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;

  if (!url || !anon) {
    return response;
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const hasAuthCredential = requestHasAuthCredential(request);
  const {
    data: { user },
  } = hasAuthCredential
    ? await supabase.auth.getUser()
    : { data: { user: null } };
  const isAnonymousUser = isAnonymousAuthUser(user);

  /** Idle timeout: end non-anonymous sessions after 2h without activity cookie updates. */
  if (user && !isAnonymousUser) {
    const lastActivity = parseLastActivityMs(request.cookies.get(IDLE_SESSION_COOKIE)?.value);
    if (lastActivity == null) {
      response.cookies.set(IDLE_SESSION_COOKIE, String(Date.now()), idleSessionCookieOptions());
    } else if (isIdleSessionExpired(lastActivity)) {
      await supabase.auth.signOut();
      response.cookies.set(IDLE_SESSION_COOKIE, "", { path: "/", maxAge: 0 });

      if (pathname.startsWith("/api/")) {
        const idleJson = NextResponse.json(
          { error: "Session expired due to inactivity" },
          { status: 401 }
        );
        response.cookies.getAll().forEach((cookie) => {
          idleJson.cookies.set(cookie.name, cookie.value, cookie);
        });
        idleJson.cookies.set(IDLE_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
        return idleJson;
      }

      const dest = idleLogoutRedirectPath(pathname);
      const redirectUrl = new URL(dest, request.url);
      const tenant =
        request.nextUrl.searchParams.get("tenant")?.trim().toLowerCase() ||
        request.cookies.get(ONBOARDING_TENANT_SLUG_COOKIE)?.value?.trim().toLowerCase();
      if (tenant && tenant.length >= 2 && !redirectUrl.searchParams.get("tenant")) {
        redirectUrl.searchParams.set("tenant", tenant);
      }
      const idleRedirect = NextResponse.redirect(redirectUrl);
      response.cookies.getAll().forEach((cookie) => {
        idleRedirect.cookies.set(cookie.name, cookie.value, cookie);
      });
      idleRedirect.cookies.set(IDLE_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
      return idleRedirect;
    }
  }


  /** `{sub}.{ROOT_DOMAIN}` → onboarding cookie + fallback rewrite for applicant surfaces */
  const rootDomain = getEffectiveRootDomain();
  const hostNorm = forwardedHostFromHeaders(request.headers);
  const tenantLabel = hostNorm ? extractTenantSubdomainLabel(hostNorm, rootDomain) : null;
  const subdomainRoutingPaths =
    pathname === "/" ||
    pathname.startsWith("/application") ||
    pathname === "/worker-onboarding" ||
    pathname === "/worker-signin" ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/login" ||
    pathname.startsWith("/login/");

  if (
    tenantLabel &&
    subdomainRoutingPaths &&
    pathname !== "/tenant-host-not-found"
  ) {
    const slugResolved = await lookupTenantSlugBySubdomain(supabase, tenantLabel);
    if (slugResolved) {
      response.cookies.set(ONBOARDING_TENANT_SLUG_COOKIE, slugResolved, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    } else {
      const u = request.nextUrl.clone();
      u.pathname = "/tenant-host-not-found";
      u.searchParams.set("subdomain", tenantLabel);
      const rew = NextResponse.rewrite(u);
      response.cookies.getAll().forEach((cookie) => {
        rew.cookies.set(cookie.name, cookie.value);
      });
      return rew;
    }
  }

  if (!tenantLabel && hostNorm) {
    clearTenantSlugCookieOnRootHost(request, response);
  }

  /** `/admin` → login page (URL stays `/admin`, adds recruiter role). */
  if (pathname === "/admin" || pathname === "/admin/" || pathname.startsWith("/admin/")) {
    const rewriteUrl = request.nextUrl.clone();
    if (pathname !== "/admin" && pathname !== "/admin/") {
      const nextPath = `${pathname}${request.nextUrl.search}`;
      if (!rewriteUrl.searchParams.get("next")) {
        rewriteUrl.searchParams.set("next", nextPath);
      }
    }
    rewriteUrl.pathname = "/login";
    if (!rewriteUrl.searchParams.get("role")) {
      rewriteUrl.searchParams.set("role", "admin_recruiter");
    }
    const tenantSlug = resolveRequestTenantSlug(request, tenantLabel);
    const rewriteResponse = NextResponse.rewrite(rewriteUrl, {
      request: { headers: withTenantSlugHeader(request, tenantSlug) },
    });
    response.cookies.getAll().forEach((cookie) => {
      rewriteResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return rewriteResponse;
  }

  if (pathname === "/") {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Host");
    if (user && !isAnonymousUser) {
      const role = parseAppRole((user.app_metadata as { role?: unknown } | undefined)?.role);
      if (isGodAdminUser(user) || (role && isStaffRole(role))) {
        const onboardingStatus = await fetchOwnerOnboardingStatus(supabase, user);
        // Incomplete owners may open BrassHR marketing home while waiting for the
        // setup email. Keep them signed in so the email continuation link can open
        // /tenant-onboarding directly. Only redirect completed / god-admin users.
        if (onboardingStatus.godAdmin || onboardingStatus.tenantOnboardingCompleted) {
          const destination = resolvePostAuthRedirect(
            onboardingStatus,
            request.nextUrl.searchParams.get("next")
          );
          return redirectAuthenticatedUser(request, response, user, destination);
        }
        return response;
      }

      const tenant =
        request.nextUrl.searchParams.get("tenant")?.trim().toLowerCase() ||
        request.cookies.get(ONBOARDING_TENANT_SLUG_COOKIE)?.value?.trim().toLowerCase() ||
        tenantLabel;
      const applicationUrl = new URL("/application/home", request.url);
      if (tenant && tenant.length >= 2) {
        applicationUrl.searchParams.set("tenant", tenant);
      }
      return NextResponse.redirect(applicationUrl);
    }
  }

  const platformOn = isPlatformEnforcementEnabled();
  const isApi = pathname.startsWith("/api/");
  /** In development, rely on route handlers (incl. dev bypass); in production, gate APIs here so session always matches UI. */
  const gateApiInMiddleware = process.env.NODE_ENV === "production";

  logAuthDebug("middleware", {
    userId: user?.id ?? null,
    platform: user ? getUserPlatform(user) : null,
  });

  if (isApi && gateApiInMiddleware && !isPublicApiPath(pathname)) {
    if (!user) {
      const trialPrepUserId = hasOwnerTrialPreparationCookie(request);
      if (isOwnerTrialPreparationApi(pathname) && trialPrepUserId) {
        return response;
      }
      // Bearer-only callers are verified in the route (requireStaffApiSession),
      // which reads Authorization. Cookie getUser() does not see that token.
      if (requestHasBearerToken(request)) {
        return response;
      }
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (platformOn && !isNexusPlatformUser(user) && !isGodAdminUser(user)) {
      logAuthDebug("middleware:api:block-platform", {
        userId: user.id,
        platform: getUserPlatform(user),
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    return response;
  }

  const isSignupPath = pathname === "/signup";
  const isYourTrialPath = pathname === "/your-trial";
  const isTenantOnboardingContinuePath = pathname === "/tenant-onboarding/continue";
  const isTenantOnboardingLinkErrorPath =
    pathname === "/tenant-onboarding/link-error" ||
    pathname.startsWith("/tenant-onboarding/link-error/");
  const isTenantOnboardingPath =
    pathname === "/tenant-onboarding" || pathname.startsWith("/tenant-onboarding/");
  const isAdminRecruiterPath = pathname.startsWith("/admin_recruiter");
  const isGodAdminPath = pathname.startsWith("/godadmin");
  const isGodAdminApiPath = pathname.startsWith("/api/godadmin");
  const ownerFlowPath =
    isSignupPath || isYourTrialPath || isTenantOnboardingPath || isAdminRecruiterPath;

  async function requireGodAdminSession(): Promise<NextResponse | null> {
    if (!user || isAnonymousUser) {
      const signin = new URL("/admin", request.url);
      signin.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(signin);
    }
    const onboardingStatus = await fetchOwnerOnboardingStatus(supabase, user);
    if (!onboardingStatus.godAdmin) {
      if (isGodAdminApiPath) {
        return NextResponse.json({ error: "Forbidden", detail: "God Admin role required." }, { status: 403 });
      }
      const signin = new URL("/admin", request.url);
      signin.searchParams.set("error", "forbidden");
      return NextResponse.redirect(signin);
    }
    return null;
  }

  if (isGodAdminPath || isGodAdminApiPath) {
    const gate = await requireGodAdminSession();
    if (gate) return gate;
    if (isGodAdminApiPath) return response;
  }

  if (ownerFlowPath && user && !isAnonymousUser) {
    const onboardingStatus = await fetchOwnerOnboardingStatus(supabase, user);

    if (isSignupPath) {
      if (!onboardingStatus.signupCompleted) {
        return response;
      }
      const destination = resolvePostAuthRedirect(
        onboardingStatus,
        request.nextUrl.searchParams.get("next")
      );
      if (destination !== "/signup") {
        return redirectAuthenticatedUser(request, response, user, destination);
      }
    }

    if (isTenantOnboardingPath && shouldBlockTenantOnboardingAccess(onboardingStatus)) {
      const destination = resolvePostAuthRedirect(
        onboardingStatus,
        request.nextUrl.searchParams.get("next")
      );
      return redirectAuthenticatedUser(request, response, user, destination);
    }

    if (
      isYourTrialPath &&
      (onboardingStatus.waitlistPending ||
        (!onboardingStatus.signupCompleted && !onboardingStatus.tenantOnboardingCompleted))
    ) {
      if (onboardingStatus.waitlistPending) {
        return NextResponse.redirect(new URL("/signup/waitlist", request.url));
      }
      return NextResponse.redirect(new URL("/signup", request.url));
    }

    if (isAdminRecruiterPath && shouldBlockAdminDashboardAccess(onboardingStatus)) {
      const destination = resolvePostAuthRedirect(
        onboardingStatus,
        request.nextUrl.searchParams.get("next")
      );
      return redirectAuthenticatedUser(request, response, user, destination);
    }
  }

  const tenantOnboardingSetupPath =
    isTenantOnboardingPath &&
    !isTenantOnboardingContinuePath &&
    !isTenantOnboardingLinkErrorPath;

  if (isYourTrialPath && (!user || isAnonymousUser)) {
    const trialPrepUserId = hasOwnerTrialPreparationCookie(request);
    if (trialPrepUserId) {
      console.info("[middleware] your-trial:allow-trial-prep-cookie");
      return response;
    }
    console.info("[middleware] your-trial:redirect-no-session", {
      pathname,
      hasTrialPrepCookie: false,
    });
    return NextResponse.redirect(new URL("/signup", request.url));
  }

  if (tenantOnboardingSetupPath) {
    const continuationCookie = request.cookies.get(
      OWNER_ONBOARDING_CONTINUATION_SESSION_COOKIE
    )?.value;
    if (!continuationCookie?.trim()) {
      if (user && !isAnonymousUser) {
        return NextResponse.redirect(new URL("/your-trial?account-ready=true", request.url));
      }
    }
  }

  if (
    tenantOnboardingSetupPath &&
    (!user || isAnonymousUser)
  ) {
    const signin = new URL("/admin", request.url);
    signin.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    const tenant = request.nextUrl.searchParams.get("tenant")?.trim().toLowerCase();
    if (tenant && tenant.length >= 2) {
      signin.searchParams.set("tenant", tenant);
    }
    return NextResponse.redirect(signin);
  }

  const isLoginPath =
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/signin" ||
    pathname.startsWith("/signin/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/");

  if (isLoginPath && user && !isAnonymousUser) {
    const onboardingStatus = await fetchOwnerOnboardingStatus(supabase, user);
    const destination = resolvePostAuthRedirect(
      onboardingStatus,
      request.nextUrl.searchParams.get("next")
    );
    const destPath = destination.split("?")[0];
    if (destPath !== pathname) {
      return redirectAuthenticatedUser(request, response, user, destination);
    }
  }

  if (isPublicUiPath(pathname)) {
    const tenantSlug = resolveRequestTenantSlug(request, tenantLabel);
    if (tenantSlug) {
      const outgoing = NextResponse.next({
        request: { headers: withTenantSlugHeader(request, tenantSlug) },
      });
      response.cookies.getAll().forEach((cookie) => {
        outgoing.cookies.set(cookie.name, cookie.value, cookie);
      });
      return outgoing;
    }
    return response;
  }

  if (isAdminRecruiterPath) {
    if (!user || isAnonymousAuthUser(user)) {
      const login = new URL("/admin", request.url);
      login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
      if (user && isAnonymousAuthUser(user)) {
        login.searchParams.set("error", "session");
      }
      const tenant =
        request.nextUrl.searchParams.get("tenant")?.trim().toLowerCase() ||
        request.cookies.get(ONBOARDING_TENANT_SLUG_COOKIE)?.value?.trim().toLowerCase();
      if (tenant && tenant.length >= 2) {
        login.searchParams.set("tenant", tenant);
      }
      return NextResponse.redirect(login);
    }
    if (platformOn && !isNexusPlatformUser(user) && !isGodAdminUser(user)) {
      const login = new URL("/admin", request.url);
      login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
      login.searchParams.set("error", "platform");
      const tenant =
        request.nextUrl.searchParams.get("tenant")?.trim().toLowerCase() ||
        request.cookies.get(ONBOARDING_TENANT_SLUG_COOKIE)?.value?.trim().toLowerCase();
      if (tenant && tenant.length >= 2) {
        login.searchParams.set("tenant", tenant);
      }
      return NextResponse.redirect(login);
    }

    if (!isGodAdminUser(user)) {
      const host = forwardedHostFromHeaders(request.headers);
      const root = getEffectiveRootDomain();
      if (host && isRootDomainHost(host, root)) {
        const svc = createServiceRoleClient();
        if (svc) {
          try {
            const currentPath = `${pathname}${request.nextUrl.search}`;
            const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
            const redirectUrl = await resolveAuthenticatedRecruiterRedirectUrl(svc, user, {
              path: currentPath,
              currentHostname: host,
              protocol: proto === "http" ? "http" : "https",
            });
            if (/^https?:\/\//i.test(redirectUrl)) {
              return withSessionCookies(response, NextResponse.redirect(redirectUrl));
            }
          } catch (error) {
            console.error("[middleware] admin_recruiter vanity redirect", error);
          }
        }
      }
    }

    const tenantSlug = resolveRequestTenantSlug(request, tenantLabel);
    if (tenantSlug) {
      const outgoing = NextResponse.next({
        request: { headers: withTenantSlugHeader(request, tenantSlug) },
      });
      response.cookies.getAll().forEach((cookie) => {
        outgoing.cookies.set(cookie.name, cookie.value, cookie);
      });
      return outgoing;
    }
  }

  /**
   * Applicant onboarding is public (anonymous sign-in happens client-side).
   * Do not apply recruiter platform/auth gates here — that sent applicants to /login.
   */
  if (pathname.startsWith("/application") || pathname === "/worker-onboarding") {
    const tenantSlug = resolveRequestTenantSlug(request, tenantLabel);

    let outgoing = response;
    if (tenantSlug) {
      outgoing = NextResponse.next({
        request: { headers: withTenantSlugHeader(request, tenantSlug) },
      });
      response.cookies.getAll().forEach((cookie) => {
        outgoing.cookies.set(cookie.name, cookie.value, cookie);
      });
    }

    return ensureApplicationTenantQuery(request, outgoing, tenantLabel);
  }

  if (
    pathname === "/worker-signin" ||
    pathname.startsWith("/worker-signin/")
  ) {
    const tenantSlug = resolveRequestTenantSlug(request, tenantLabel);
    if (tenantSlug) {
      const outgoing = NextResponse.next({
        request: { headers: withTenantSlugHeader(request, tenantSlug) },
      });
      response.cookies.getAll().forEach((cookie) => {
        outgoing.cookies.set(cookie.name, cookie.value, cookie);
      });
      return outgoing;
    }
  }

  /** Public jobs board / job posts — stamp tenant for SSR branding + public APIs. */
  if (pathname === "/jobs" || pathname.startsWith("/jobs/")) {
    const tenantSlug = resolveRequestTenantSlug(request, tenantLabel);
    if (tenantSlug) {
      const outgoing = NextResponse.next({
        request: { headers: withTenantSlugHeader(request, tenantSlug) },
      });
      response.cookies.getAll().forEach((cookie) => {
        outgoing.cookies.set(cookie.name, cookie.value, cookie);
      });
      return outgoing;
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/login/:path*",
    "/signin",
    "/signin/:path*",
    "/admin",
    "/admin/:path*",
    "/signup",
    "/signup/:path*",
    "/your-trial",
    "/tenant-onboarding",
    "/tenant-onboarding/:path*",
    "/tenant-host-not-found",
    "/admin_recruiter/:path*",
    "/application",
    "/application/:path*",
    "/worker-onboarding",
    "/worker-signin",
    "/api/workers",
    "/api/workers/:path*",
    "/api/search-workers",
    "/api/search-workers/:path*",
    "/api/admin/:path*",
    "/godadmin",
    "/godadmin/:path*",
    "/api/godadmin",
    "/api/godadmin/:path*",
  ],
};

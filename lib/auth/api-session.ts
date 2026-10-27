import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { loadStaffUserProfileCached } from "@/lib/auth/staff-user-profile";
import { isGodAdminUser } from "@/lib/auth/god-admin";
import { isStaffRole, parseAppRole, type AppRole } from "@/lib/auth/app-role";
import { resolveAppRoleForUser } from "@/lib/auth/resolve-role";
import { clientIpFromHeaders, noteAuthFailure } from "@/lib/auth/auth-failure-guard";
import { authorizeStaffHttpAccess } from "@/lib/auth/module-access.server";
import { ONBOARDING_TENANT_SLUG_COOKIE } from "@/lib/tenant/constants";
import {
  getUserPlatform,
  isNexusPlatformUser,
  isPlatformEnforcementEnabled,
  jsonUnauthorized,
  logAuthDebug,
} from "@/lib/auth/platform";

const DEV_BYPASS_USER = "00000000-0000-0000-0000-000000000001";

export type ApiAuthContext = {
  userId: string;
  email: string | null;
  role: AppRole;
  godAdmin: boolean;
  /** True only when DEV_ADMIN_AUTH_BYPASS is used (local testing). */
  devBypass: boolean;
};

function isAdminRbacEnforced() {
  return (
    process.env.ADMIN_RBAC_ENFORCE === "true" ||
    process.env.NEXT_PUBLIC_ADMIN_AUTH_REQUIRED === "true"
  );
}

function devBypassAuth(): ApiAuthContext | null {
  if (process.env.NODE_ENV === "production") return null;
  /**
   * Local DX default:
   * - If RBAC is not explicitly enforced, allow recruiter/admin pages and APIs
   *   to function without wiring a full auth+role seed.
   * - You can still force strict behavior by setting ADMIN_RBAC_ENFORCE=true.
   * - Explicit DEV_ADMIN_AUTH_BYPASS=false disables this fallback.
   */
  const bypassFlag = process.env.DEV_ADMIN_AUTH_BYPASS;
  const allowByDefault = !isAdminRbacEnforced();
  const enabled =
    bypassFlag === "true" || (bypassFlag !== "false" && allowByDefault);
  if (!enabled) return null;
  return {
    userId: DEV_BYPASS_USER,
    email: null,
    role: parseAppRole(process.env.DEV_IMPERSONATE_ROLE) ?? "admin",
    godAdmin: false,
    devBypass: true,
  };
}

export type StaffApiAuthContext = ApiAuthContext & {
  authUser: User;
};

async function hasGodAdminDbFlag(userId: string): Promise<boolean> {
  const profile = await loadStaffUserProfileCached(userId);
  return profile?.god_admin === true;
}

async function extractBearerToken(): Promise<string | null> {
  const hdrs = await headers();
  const auth = hdrs.get("authorization")?.trim() ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  return token.length > 0 ? token : null;
}

function isAnonymousAuthUser(user: User | null | undefined): boolean {
  return user?.is_anonymous === true;
}

async function rejectAuth(
  status: 401 | 403,
  reason: string,
  userId?: string | null,
  detail?: string,
  count = true,
  code?: string
): Promise<NextResponse> {
  try {
    const requestHeaders = await headers();
    const limited = await noteAuthFailure({
      ip: clientIpFromHeaders(requestHeaders),
      method: requestHeaders.get("x-brass-method") ?? "GET",
      path: requestHeaders.get("x-brass-pathname") ?? "/",
      status,
      reason,
      userId,
      count,
    });
    if (limited) return limited;
  } catch (error) {
    console.error("[security-auth] failure log skipped", error instanceof Error ? error.message : "unknown");
  }
  return NextResponse.json(
    {
      error: status === 401 ? "Unauthorized" : "Forbidden",
      ...(detail ? { detail } : {}),
      ...(code ? { code } : {}),
    },
    { status }
  );
}

async function getSessionUser(): Promise<{ user: User | null; error: unknown }> {
  const supabase = await createClient();
  const bearer = await extractBearerToken();

  if (bearer) {
    const bearerResult = await supabase.auth.getUser(bearer);
    const bearerUser = bearerResult.data.user ?? null;
    if (bearerUser?.id && !isAnonymousAuthUser(bearerUser)) {
      return { user: bearerUser, error: bearerResult.error };
    }
  }

  const cookieResult = await supabase.auth.getUser();
  const cookieUser = cookieResult.data.user ?? null;
  if (cookieUser?.id) {
    return { user: cookieUser, error: cookieResult.error };
  }

  if (bearer) {
    const bearerResult = await supabase.auth.getUser(bearer);
    return { user: bearerResult.data.user ?? null, error: bearerResult.error ?? cookieResult.error };
  }

  return { user: null, error: cookieResult.error };
}

/**
 * Cookie session user with Nexus platform (no RBAC). Use in onboarding APIs that only need identity + platform.
 */
export async function requireNexusSessionUser(): Promise<User | NextResponse> {
  const bypass = devBypassAuth();
  if (bypass) {
    console.warn("[auth] DEV_ADMIN_AUTH_BYPASS active — not for production");
    return jsonUnauthorized(401);
  }
  try {
    const { user, error } = await getSessionUser();
    if (error || !user?.id) {
      logAuthDebug("requireNexusSessionUser:no-user", {});
      return rejectAuth(401, "no_session");
    }
    if (isPlatformEnforcementEnabled() && !isNexusPlatformUser(user) && !isGodAdminUser(user)) {
      logAuthDebug("requireNexusSessionUser:wrong-platform", {
        userId: user.id,
        platform: getUserPlatform(user),
      });
      return rejectAuth(403, "wrong_platform", user.id);
    }
    logAuthDebug("requireNexusSessionUser:ok", {
      userId: user.id,
      platform: getUserPlatform(user),
    });
    return user;
  } catch (e) {
    console.error("[auth] requireNexusSessionUser", e);
    return rejectAuth(401, "auth_check_failed");
  }
}

/**
 * Authenticated Supabase user for Route Handlers. Returns 401/403 JSON if unauthenticated or wrong platform.
 * In development, optional `DEV_ADMIN_AUTH_BYPASS=true` yields a synthetic admin (see `.env.example`).
 */
export async function requireApiSession(): Promise<ApiAuthContext | NextResponse> {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user?.id) {
      const bypass = devBypassAuth();
      if (bypass) {
        console.warn("[auth] DEV_ADMIN_AUTH_BYPASS active — not for production");
        return bypass;
      }
      logAuthDebug("requireApiSession:no-user", {});
      return rejectAuth(401, "no_session");
    }
    if (isPlatformEnforcementEnabled() && !isNexusPlatformUser(user) && !isGodAdminUser(user)) {
      logAuthDebug("requireApiSession:wrong-platform", {
        userId: user.id,
        platform: getUserPlatform(user),
      });
      return rejectAuth(403, "wrong_platform", user.id);
    }
    const role = await resolveAppRoleForUser(user);
    const godAdmin = isGodAdminUser(user) || (await hasGodAdminDbFlag(user.id));
    logAuthDebug("requireApiSession:ok", {
      userId: user.id,
      platform: getUserPlatform(user),
      role,
    });
    return {
      userId: user.id,
      email: typeof user.email === "string" ? user.email : null,
      role,
      godAdmin,
      devBypass: false,
    };
  } catch (e) {
    console.error("[auth] requireApiSession", e);
    return rejectAuth(401, "auth_check_failed");
  }
}

export function requireRole(ctx: ApiAuthContext, allowed: AppRole[]): NextResponse | null {
  if (allowed.includes(ctx.role)) return null;
  return NextResponse.json({ error: "Forbidden", detail: "Insufficient role" }, { status: 403 });
}

/** Recruiter, support, or admin — pipeline / roster APIs. */
export async function requireStaffApiSession(): Promise<StaffApiAuthContext | NextResponse> {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user?.id) {
      const bypass = devBypassAuth();
      if (bypass) {
        console.warn("[auth] DEV_ADMIN_AUTH_BYPASS active — not for production");
        return {
          ...bypass,
          authUser: {
            id: bypass.userId,
            email: bypass.email ?? undefined,
            app_metadata: {},
          } as unknown as User,
        };
      }
      logAuthDebug("requireStaffApiSession:no-user", {});
      return rejectAuth(401, "no_session");
    }
    if (isPlatformEnforcementEnabled() && !isNexusPlatformUser(user) && !isGodAdminUser(user)) {
      logAuthDebug("requireStaffApiSession:wrong-platform", {
        userId: user.id,
        platform: getUserPlatform(user),
      });
      return rejectAuth(403, "wrong_platform", user.id);
    }

    if (isAnonymousAuthUser(user)) {
      return rejectAuth(
        403,
        "anonymous_session",
        user.id,
        "Staff role required. Sign in again as a recruiter or admin (applicant preview may have replaced your session)."
      );
    }

    const role = await resolveAppRoleForUser(user);
    const godAdmin = isGodAdminUser(user) || (await hasGodAdminDbFlag(user.id));
    const ctx: ApiAuthContext = {
      userId: user.id,
      email: typeof user.email === "string" ? user.email : null,
      role,
      godAdmin,
      devBypass: false,
    };

    if (!isStaffRole(role) && !godAdmin) {
      return rejectAuth(403, "not_staff", user.id, "Staff role required");
    }

    if (!godAdmin) {
      const profile = await loadStaffUserProfileCached(user.id);
      if (profile?.must_change_password) {
        return rejectAuth(
          403,
          "password_setup_required",
          user.id,
          "Set your password using the invitation email before using the application.",
          false,
          "PASSWORD_SETUP_REQUIRED"
        );
      }
      if (profile && profile.is_active === false) {
        return rejectAuth(
          403,
          "account_disabled",
          user.id,
          "This account has been disabled.",
          false,
          "ACCOUNT_DISABLED"
        );
      }
    }

    if (!godAdmin && !ctx.devBypass) {
      let pathname = "";
      let method = "GET";
      try {
        const requestHeaders = await headers();
        pathname = requestHeaders.get("x-brass-pathname") ?? "";
        method = requestHeaders.get("x-brass-method") ?? "GET";
      } catch {
        return rejectAuth(403, "unavailable", user.id, "Permission data unavailable", false);
      }
      if (pathname.startsWith("/api/admin")) {
        const jar = await cookies();
        const decision = await authorizeStaffHttpAccess({
          user,
          pathname,
          method,
          tenantSlug: jar.get(ONBOARDING_TENANT_SLUG_COOKIE)?.value ?? null,
        });
        if (!decision.ok) {
          return rejectAuth(
            decision.status,
            decision.code,
            user.id,
            decision.detail,
            decision.code !== "unavailable"
          );
        }
      }
    }

    logAuthDebug("requireStaffApiSession:ok", {
      userId: user.id,
      platform: getUserPlatform(user),
      role,
      godAdmin,
    });

    return { ...ctx, authUser: user };
  } catch (e) {
    console.error("[auth] requireStaffApiSession", e);
    return rejectAuth(401, "auth_check_failed");
  }
}

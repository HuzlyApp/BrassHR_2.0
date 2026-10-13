import { NextRequest, NextResponse } from "next/server";
import { isStaffRole } from "@/lib/auth/app-role";
import {
  classifyAuthMessage,
  loginAuthErrorResponse,
} from "@/lib/auth/login-api-errors";
import { resolveGodAdminServer } from "@/lib/auth/resolve-god-admin-server";
import { resolveAppRoleForUser } from "@/lib/auth/resolve-role";
import { resolveRecruiterOnboardingStatus } from "@/lib/auth/recruiter-onboarding-status.server";
import { sendSupabaseLoginOtp } from "@/lib/auth/send-login-otp-email";
import { loadStaffAccessFlags, staffAccessDeniedMessage } from "@/lib/admin/staff-access";
import { createEphemeralAuthClient } from "@/lib/supabase/ephemeral-auth-client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { enforceRateLimit, getClientIp } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const STAFF_ACCESS_DENIED_MESSAGE =
  "This account does not have admin access. Use a recruiter or admin account.";

/**
 * Step 1 of recruiter login: validate email/password, then email app-managed OTP via Resend.
 * God admin skips OTP; all other accounts must verify a code.
 * Staff role (and optional tenant access) are checked before OTP is sent.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
      tenant?: string;
      purpose?: string;
    };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const tenantSlug =
      typeof body.tenant === "string" ? body.tenant.trim().toLowerCase() : "";
    // Admin/recruiter OTP send requires staff. Client should pass purpose: "staff".
    const forStaffLogin = body.purpose !== "worker";
    const limited = await enforceRateLimit(req, {
      namespace: "auth-login-otp",
      key: `${getClientIp(req)}:${email || "missing"}`,
      limit: Number(process.env.RATE_LIMIT_AUTH_PER_15_MIN ?? 10),
      windowMs: 15 * 60 * 1000,
      failClosed: true,
    });
    if (limited) return limited;

    if (!email && !password) {
      return loginAuthErrorResponse("Email and password are required.", "VALIDATION_ERROR", 400);
    }
    if (!email) {
      return loginAuthErrorResponse("Email is required.", "VALIDATION_ERROR", 400, "email");
    }
    if (!password) {
      return loginAuthErrorResponse("Password is required.", "VALIDATION_ERROR", 400, "password");
    }

    const auth = createEphemeralAuthClient();
    if (!auth) {
      return loginAuthErrorResponse(
        "Login is not configured. Contact support.",
        "AUTH_NOT_CONFIGURED",
        503
      );
    }

    const { data: signInData, error: signInError } = await auth.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !signInData.user) {
      const classified = classifyAuthMessage(signInError?.message);
      return loginAuthErrorResponse(classified.error, classified.code, 401, classified.field);
    }

    const godAdmin = await resolveGodAdminServer(signInData.user);

    if (forStaffLogin && !godAdmin) {
      try {
        const role = await resolveAppRoleForUser(signInData.user);
        if (!isStaffRole(role)) {
          await auth.auth.signOut();
          return loginAuthErrorResponse(STAFF_ACCESS_DENIED_MESSAGE, "STAFF_ROLE_REQUIRED", 403);
        }
        const svc = createServiceRoleClient();
        if (svc) {
          const flags = await loadStaffAccessFlags(svc, signInData.user.id);
          const denied = staffAccessDeniedMessage(flags);
          if (denied) {
            await auth.auth.signOut();
            return loginAuthErrorResponse(
              denied,
              flags.mustChangePassword ? "PASSWORD_SETUP_REQUIRED" : "ACCOUNT_DISABLED",
              403
            );
          }
        }
      } catch (roleErr) {
        console.error("[auth/login-otp/send] staff role check", roleErr);
        await auth.auth.signOut();
        return loginAuthErrorResponse(
          "Could not verify account access. Try again.",
          "UNKNOWN",
          500
        );
      }
    }

    if (tenantSlug.length >= 2) {
      try {
        const status = await resolveRecruiterOnboardingStatus(signInData.user, {
          tenantSlug,
        });
        if (!status.validTenantAccess) {
          await auth.auth.signOut();
          return loginAuthErrorResponse(
            "This account does not have access to the selected tenant.",
            "TENANT_ACCESS_DENIED",
            403
          );
        }
      } catch (tenantErr) {
        console.error("[auth/login-otp/send] tenant access check", tenantErr);
        await auth.auth.signOut();
        return loginAuthErrorResponse(
          "Could not verify tenant access. Try again.",
          "UNKNOWN",
          500
        );
      }
    }

    if (godAdmin) {
      await auth.auth.signOut();
      return NextResponse.json({
        ok: true,
        godAdmin: true,
        requiresOtp: false,
        email,
      });
    }

    await auth.auth.signOut();

    const sent = await sendSupabaseLoginOtp(email, signInData.user.id);
    if (!sent.ok) {
      if (sent.code === "RATE_LIMIT") {
        return loginAuthErrorResponse(sent.message, "RATE_LIMIT", 429, null, {
          headers: {
            "Retry-After": String(sent.retryAfterSec ?? 30),
          },
          retryAfterSec: sent.retryAfterSec,
        });
      }
      const classified = classifyAuthMessage(sent.message);
      return loginAuthErrorResponse(
        classified.error,
        classified.code === "UNKNOWN" ? "OTP_SEND_FAILED" : classified.code,
        classified.code === "RATE_LIMIT" ? 429 : 400,
        classified.field,
        {
          ...(typeof sent.retryAfterSec === "number" ? { retryAfterSec: sent.retryAfterSec } : {}),
        }
      );
    }

    return NextResponse.json({
      ok: true,
      godAdmin: false,
      requiresOtp: true,
      email,
      otpDelivery: "resend",
      resendCount: sent.resendCount,
      maxResends: sent.maxResends,
      expiresInSeconds: sent.expiresInSeconds,
      resendAvailableInSeconds: sent.resendAvailableInSeconds,
    });
  } catch (err: unknown) {
    console.error("[auth/login-otp/send]", err);
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return loginAuthErrorResponse(msg, "UNKNOWN", 500);
  }
}

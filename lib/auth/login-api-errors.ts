import { NextResponse } from "next/server";
import {
  formatLoginOtpCooldownMessage,
  LOGIN_OTP_RESEND_COOLDOWN_MESSAGE,
  LOGIN_OTP_RESEND_LIMIT_MESSAGE,
  parseLoginOtpCooldownSeconds,
} from "@/lib/auth/login-otp-constants";

export type LoginAuthErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_CREDENTIALS"
  | "EMAIL_NOT_CONFIRMED"
  | "RATE_LIMIT"
  | "OTP_SEND_FAILED"
  | "OTP_INVALID"
  | "OTP_EXPIRED"
  | "AUTH_NOT_CONFIGURED"
  | "TENANT_ACCESS_DENIED"
  | "STAFF_ROLE_REQUIRED"
  | "PASSWORD_SETUP_REQUIRED"
  | "ACCOUNT_DISABLED"
  | "UNKNOWN";

export const LOGIN_OTP_INVALID_MESSAGE = "Check the code and try again.";
export const LOGIN_OTP_EXPIRED_MESSAGE = "Request a new code and try again.";
export {
  LOGIN_OTP_RESEND_LIMIT_MESSAGE,
  LOGIN_OTP_RESEND_COOLDOWN_MESSAGE,
  formatLoginOtpCooldownMessage,
  parseLoginOtpCooldownSeconds,
};

export type LoginAuthErrorField = "email" | "password" | null;

export type LoginAuthErrorPayload = {
  error: string;
  code: LoginAuthErrorCode;
  field: LoginAuthErrorField;
  retryAfterSec?: number;
};

export function loginAuthErrorResponse(
  message: string,
  code: LoginAuthErrorCode,
  status: number,
  field: LoginAuthErrorField = null,
  init?: { headers?: HeadersInit; retryAfterSec?: number }
): NextResponse {
  return NextResponse.json(
    {
      error: message,
      code,
      field,
      ...(typeof init?.retryAfterSec === "number" ? { retryAfterSec: init.retryAfterSec } : {}),
    } satisfies LoginAuthErrorPayload,
    { status, headers: init?.headers }
  );
}

export function classifyAuthMessage(message: string | undefined): Pick<LoginAuthErrorPayload, "error" | "code" | "field"> {
  const raw = message?.trim() ?? "";
  const m = raw.toLowerCase();

  if (!raw) {
    return { error: "Something went wrong. Try again.", code: "UNKNOWN", field: null };
  }
  if (m.includes("invalid login credentials") || m.includes("invalid credentials")) {
    return { error: "Wrong email or password.", code: "INVALID_CREDENTIALS", field: null };
  }
  if (m.includes("email not confirmed")) {
    return { error: "Please confirm your email first.", code: "EMAIL_NOT_CONFIRMED", field: "email" };
  }
  if (m === LOGIN_OTP_RESEND_LIMIT_MESSAGE.toLowerCase() || m.includes("too many requests")) {
    return { error: LOGIN_OTP_RESEND_LIMIT_MESSAGE, code: "RATE_LIMIT", field: null };
  }
  if (m === LOGIN_OTP_RESEND_COOLDOWN_MESSAGE.toLowerCase() || m.includes("wait for the timer")) {
    const sec = parseLoginOtpCooldownSeconds(raw);
    return {
      error: raw || LOGIN_OTP_RESEND_COOLDOWN_MESSAGE,
      code: "RATE_LIMIT",
      field: null,
      ...(sec != null ? { retryAfterSec: sec } : {}),
    };
  }
  if (m.includes("rate limit") || m.includes("too many") || m.includes("over_email_send_rate_limit")) {
    return { error: LOGIN_OTP_RESEND_LIMIT_MESSAGE, code: "RATE_LIMIT", field: null };
  }
  if (m.includes("user not found")) {
    return { error: "No account found with this email.", code: "INVALID_CREDENTIALS", field: "email" };
  }
  if (m.includes("email") && m.includes("invalid")) {
    return { error: "Enter a valid email address.", code: "VALIDATION_ERROR", field: "email" };
  }

  return { error: raw, code: "UNKNOWN", field: null };
}

export function classifyVerifyMessage(message: string | undefined): Pick<LoginAuthErrorPayload, "error" | "code" | "field"> {
  const raw = message?.trim() ?? "";
  const m = raw.toLowerCase();

  if (!raw) {
    return { error: "Could not verify code. Try again.", code: "UNKNOWN", field: null };
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return { error: LOGIN_OTP_RESEND_LIMIT_MESSAGE, code: "RATE_LIMIT", field: null };
  }
  if (m.includes("expired")) {
    return { error: LOGIN_OTP_EXPIRED_MESSAGE, code: "OTP_EXPIRED", field: null };
  }
  if (m.includes("invalid") || m.includes("otp") || m.includes("token")) {
    return { error: LOGIN_OTP_INVALID_MESSAGE, code: "OTP_INVALID", field: null };
  }

  return { error: raw, code: "UNKNOWN", field: null };
}

/** Parse JSON error body from login API routes. */
export async function parseLoginApiError(res: Response): Promise<LoginAuthErrorPayload> {
  try {
    const data = (await res.json()) as Partial<LoginAuthErrorPayload> & { message?: string };
    const retryAfterHeader = res.headers.get("retry-after");
    const parsedHeaderSec =
      retryAfterHeader && Number.isFinite(Number(retryAfterHeader))
        ? Number(retryAfterHeader)
        : undefined;
    const retryAfterSec =
      typeof data.retryAfterSec === "number"
        ? data.retryAfterSec
        : (parsedHeaderSec ?? parseLoginOtpCooldownSeconds(data.error ?? data.message) ?? undefined);

    if (typeof data.error === "string" && data.error.trim()) {
      const code =
        data.code && isLoginAuthErrorCode(data.code) ? data.code : classifyAuthMessage(data.error).code;
      return {
        error: data.error.trim(),
        code,
        field: data.field === "email" || data.field === "password" ? data.field : null,
        ...(typeof retryAfterSec === "number" ? { retryAfterSec } : {}),
      };
    }
    if (typeof data.message === "string") {
      return {
        ...classifyAuthMessage(data.message),
        field: null,
        ...(typeof retryAfterSec === "number" ? { retryAfterSec } : {}),
      };
    }
  } catch {
    /* ignore */
  }

  if (res.status === 401) {
    return { error: "Wrong email or password.", code: "INVALID_CREDENTIALS", field: null };
  }
  if (res.status === 403) {
    return {
      error: "This account does not have admin access. Use a recruiter or admin account.",
      code: "STAFF_ROLE_REQUIRED",
      field: null,
    };
  }
  if (res.status === 429) {
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfterSec =
      retryAfterHeader && Number.isFinite(Number(retryAfterHeader))
        ? Number(retryAfterHeader)
        : undefined;
    return {
      error: retryAfterSec
        ? formatLoginOtpCooldownMessage(retryAfterSec)
        : LOGIN_OTP_RESEND_LIMIT_MESSAGE,
      code: "RATE_LIMIT",
      field: null,
      ...(typeof retryAfterSec === "number" ? { retryAfterSec } : {}),
    };
  }
  if (res.status >= 500) {
    return { error: "Server error. Try again in a moment.", code: "UNKNOWN", field: null };
  }

  return { error: "Login failed. Try again.", code: "UNKNOWN", field: null };
}

function isLoginAuthErrorCode(value: string): value is LoginAuthErrorCode {
  return [
    "VALIDATION_ERROR",
    "INVALID_CREDENTIALS",
    "EMAIL_NOT_CONFIRMED",
    "RATE_LIMIT",
    "OTP_SEND_FAILED",
    "OTP_INVALID",
    "OTP_EXPIRED",
    "AUTH_NOT_CONFIGURED",
    "TENANT_ACCESS_DENIED",
    "STAFF_ROLE_REQUIRED",
    "PASSWORD_SETUP_REQUIRED",
    "ACCOUNT_DISABLED",
    "UNKNOWN",
  ].includes(value);
}

export function titleForLoginError(code: LoginAuthErrorCode): string | null {
  switch (code) {
    case "INVALID_CREDENTIALS":
      return "Login failed";
    case "RATE_LIMIT":
      return "Please wait";
    case "EMAIL_NOT_CONFIRMED":
      return "Email not verified";
    case "VALIDATION_ERROR":
      return "Check your details";
    case "TENANT_ACCESS_DENIED":
    case "STAFF_ROLE_REQUIRED":
    case "PASSWORD_SETUP_REQUIRED":
    case "ACCOUNT_DISABLED":
      return "No access";
    case "OTP_SEND_FAILED":
    case "OTP_INVALID":
      return "Code problem";
    case "OTP_EXPIRED":
      return "Code expired";
    case "AUTH_NOT_CONFIGURED":
      return "Setup error";
    default:
      return null;
  }
}

import { createHash, randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatLoginOtpCooldownMessage,
  LOGIN_OTP_MAX_RESENDS,
  LOGIN_OTP_RESEND_COOLDOWN_MESSAGE,
  LOGIN_OTP_RESEND_COOLDOWN_SECONDS,
  LOGIN_OTP_RESEND_LIMIT_MESSAGE,
  LOGIN_OTP_RESEND_WINDOW_SECONDS,
  LOGIN_OTP_TTL_SECONDS as DEFAULT_TTL_SECONDS,
} from "@/lib/auth/login-otp-constants";
import { LOGIN_OTP_LENGTH } from "@/lib/auth/supabase-magic-link-otp-template";

export const LOGIN_OTP_PURPOSE = "login" as const;

export type LoginOtpPurpose = typeof LOGIN_OTP_PURPOSE | string;

export function loginOtpTtlSeconds(): number {
  const raw = Number(process.env.LOGIN_OTP_TTL_SECONDS ?? DEFAULT_TTL_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 3600) : DEFAULT_TTL_SECONDS;
}

export function loginOtpResendCooldownSeconds(): number {
  const raw = Number(process.env.LOGIN_OTP_RESEND_COOLDOWN_SECONDS ?? LOGIN_OTP_RESEND_COOLDOWN_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 3600) : LOGIN_OTP_RESEND_COOLDOWN_SECONDS;
}

export function loginOtpMaxResends(): number {
  const raw = Number(process.env.LOGIN_OTP_MAX_RESENDS ?? LOGIN_OTP_MAX_RESENDS);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 50) : LOGIN_OTP_MAX_RESENDS;
}

export function loginOtpExpiryIso(now = new Date()): string {
  return new Date(now.getTime() + loginOtpTtlSeconds() * 1000).toISOString();
}

export function generateOtpCode(length = LOGIN_OTP_LENGTH): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += randomInt(0, 10).toString();
  }
  return code;
}

function loginOtpPepper(): string {
  return (
    process.env.LOGIN_OTP_PEPPER?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "brasshr-login-otp"
  );
}

export function hashLoginOtp(params: { email: string; purpose: string; code: string }): string {
  const email = params.email.trim().toLowerCase();
  const purpose = params.purpose.trim();
  const code = params.code.trim();
  return createHash("sha256")
    .update(`${loginOtpPepper()}:${email}:${purpose}:${code}`, "utf8")
    .digest("hex");
}

export function normalizeLoginOtpEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidOtpCodeFormat(code: string): boolean {
  return new RegExp(`^\\d{${LOGIN_OTP_LENGTH}}$`).test(code.trim());
}

export async function invalidatePreviousLoginOtps(
  supabase: SupabaseClient,
  params: { email: string; purpose: string; now?: string }
): Promise<void> {
  const email = normalizeLoginOtpEmail(params.email);
  const now = params.now ?? new Date().toISOString();
  const { error } = await supabase
    .from("auth_login_otps")
    .update({ invalidated_at: now })
    .eq("email", email)
    .eq("purpose", params.purpose)
    .is("used_at", null)
    .is("invalidated_at", null);

  if (error) throw error;
}

async function issueLoginOtpRow(
  supabase: SupabaseClient,
  params: {
    email: string;
    purpose: string;
    userId?: string | null;
    otpHash: string;
    createdAtIso: string;
    expiresAt: string;
  }
): Promise<void> {
  const { error } = await supabase.rpc("issue_auth_login_otp", {
    p_email: params.email,
    p_purpose: params.purpose,
    p_otp_hash: params.otpHash,
    p_user_id: params.userId ?? null,
    p_expires_at: params.expiresAt,
    p_now: params.createdAtIso,
  });

  if (error) throw error;
}

export type CreateLoginOtpParams = {
  email: string;
  userId?: string | null;
  purpose?: string;
  now?: Date;
  code?: string;
  /** Skip cooldown / resend-cap checks (tests only). */
  skipIssueGuards?: boolean;
};

export type CreateLoginOtpResult = {
  code: string;
  expiresAt: string;
  resendCount: number;
  maxResends: number;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
};

export type LoginOtpIssueGateDenied = {
  ok: false;
  reason: "cooldown" | "resend_limit";
  message: string;
  retryAfterSec: number;
  resendCount: number;
  maxResends: number;
};

export type LoginOtpIssueGateAllowed = {
  ok: true;
  priorIssueCount: number;
  resendCount: number;
  maxResends: number;
};

export type LoginOtpIssueGateResult = LoginOtpIssueGateAllowed | LoginOtpIssueGateDenied;

export class LoginOtpIssueDeniedError extends Error {
  readonly reason: LoginOtpIssueGateDenied["reason"];
  readonly retryAfterSec: number;
  readonly resendCount: number;
  readonly maxResends: number;

  constructor(denied: LoginOtpIssueGateDenied) {
    super(denied.message);
    this.name = "LoginOtpIssueDeniedError";
    this.reason = denied.reason;
    this.retryAfterSec = denied.retryAfterSec;
    this.resendCount = denied.resendCount;
    this.maxResends = denied.maxResends;
  }
}

type LoginOtpIssueMetaRow = {
  created_at: string;
};

export function evaluateLoginOtpIssueGate(
  rows: LoginOtpIssueMetaRow[],
  params?: { now?: Date; cooldownSeconds?: number; maxResends?: number; windowSeconds?: number }
): LoginOtpIssueGateResult {
  const now = params?.now ?? new Date();
  const cooldownSeconds = params?.cooldownSeconds ?? loginOtpResendCooldownSeconds();
  const maxResends = params?.maxResends ?? loginOtpMaxResends();
  const windowSeconds = params?.windowSeconds ?? LOGIN_OTP_RESEND_WINDOW_SECONDS;
  const windowStartMs = now.getTime() - windowSeconds * 1000;

  const recent = rows
    .filter((row) => new Date(row.created_at).getTime() >= windowStartMs)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const priorIssueCount = recent.length;
  const resendCount = Math.max(0, priorIssueCount - 1);

  if (priorIssueCount >= 1 + maxResends) {
    const oldestInCap = recent[Math.min(recent.length, 1 + maxResends) - 1];
    const unlockAt =
      new Date(oldestInCap.created_at).getTime() + windowSeconds * 1000;
    const retryAfterSec = Math.max(
      cooldownSeconds,
      Math.ceil((unlockAt - now.getTime()) / 1000)
    );
    return {
      ok: false,
      reason: "resend_limit",
      message: LOGIN_OTP_RESEND_LIMIT_MESSAGE,
      retryAfterSec,
      resendCount: Math.min(resendCount, maxResends),
      maxResends,
    };
  }

  const latest = recent[0];
  if (latest) {
    const elapsedSec = (now.getTime() - new Date(latest.created_at).getTime()) / 1000;
    if (elapsedSec < cooldownSeconds) {
      const retryAfterSec = Math.max(1, Math.ceil(cooldownSeconds - elapsedSec));
      return {
        ok: false,
        reason: "cooldown",
        message: formatLoginOtpCooldownMessage(retryAfterSec),
        retryAfterSec,
        resendCount,
        maxResends,
      };
    }
  }

  return {
    ok: true,
    priorIssueCount,
    resendCount,
    maxResends,
  };
}

export async function assertCanIssueLoginOtp(
  supabase: SupabaseClient,
  params: { email: string; purpose?: string; now?: Date }
): Promise<LoginOtpIssueGateResult> {
  const email = normalizeLoginOtpEmail(params.email);
  const purpose = (params.purpose ?? LOGIN_OTP_PURPOSE).trim();
  const now = params.now ?? new Date();
  const windowStart = new Date(
    now.getTime() - LOGIN_OTP_RESEND_WINDOW_SECONDS * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from("auth_login_otps")
    .select("created_at")
    .eq("email", email)
    .eq("purpose", purpose)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false })
    .limit(1 + loginOtpMaxResends() + 1);

  if (error) {
    throw error;
  }

  return evaluateLoginOtpIssueGate((data ?? []) as LoginOtpIssueMetaRow[], { now });
}

export async function createLoginOtp(
  supabase: SupabaseClient,
  params: CreateLoginOtpParams
): Promise<CreateLoginOtpResult> {
  const email = normalizeLoginOtpEmail(params.email);
  const purpose = params.purpose ?? LOGIN_OTP_PURPOSE;
  const now = params.now ?? new Date();
  const nowIso = now.toISOString();
  const maxResends = loginOtpMaxResends();
  const expiresInSeconds = loginOtpTtlSeconds();

  let gate: LoginOtpIssueGateAllowed = {
    ok: true,
    priorIssueCount: 0,
    resendCount: 0,
    maxResends,
  };

  if (!params.skipIssueGuards) {
    const checked = await assertCanIssueLoginOtp(supabase, { email, purpose, now });
    if (!checked.ok) {
      throw new LoginOtpIssueDeniedError(checked);
    }
    gate = checked;
  }

  const code = params.code ?? generateOtpCode();
  const otpHash = hashLoginOtp({ email, purpose, code });
  const expiresAt = loginOtpExpiryIso(now);

  await issueLoginOtpRow(supabase, {
    email,
    purpose,
    userId: params.userId,
    otpHash,
    createdAtIso: nowIso,
    expiresAt,
  });

  const resendCount = gate.priorIssueCount > 0 ? gate.resendCount + 1 : 0;

  return {
    code,
    expiresAt,
    resendCount,
    maxResends,
    expiresInSeconds,
    resendAvailableInSeconds: loginOtpResendCooldownSeconds(),
  };
}

export type VerifyLoginOtpResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" | "error" };

type LoginOtpStatusRow = {
  email: string;
  purpose: string;
  expires_at: string;
  used_at: string | null;
  invalidated_at: string | null;
  created_at: string;
};

export function classifyLoginOtpFailureFromRows(
  rows: LoginOtpStatusRow[],
  params: { email: string; purpose: string; now?: Date }
): "expired" | "invalid" {
  const email = normalizeLoginOtpEmail(params.email);
  const purpose = params.purpose.trim();
  const nowMs = (params.now ?? new Date()).getTime();

  const relevant = rows.filter((row) => row.email === email && row.purpose === purpose);
  const hasActiveOtp = relevant.some(
    (row) =>
      row.used_at == null &&
      row.invalidated_at == null &&
      new Date(row.expires_at).getTime() > nowMs
  );
  if (hasActiveOtp) {
    return "invalid";
  }

  const latest = relevant
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  if (!latest) {
    return "invalid";
  }
  if (
    latest.used_at == null &&
    latest.invalidated_at == null &&
    new Date(latest.expires_at).getTime() <= nowMs
  ) {
    return "expired";
  }

  return "invalid";
}

async function classifyLoginOtpFailure(
  supabase: SupabaseClient,
  params: { email: string; purpose: string }
): Promise<"expired" | "invalid"> {
  const email = normalizeLoginOtpEmail(params.email);
  const purpose = params.purpose.trim();
  const now = new Date().toISOString();

  const { data: activeRows, error: activeError } = await supabase
    .from("auth_login_otps")
    .select("id")
    .eq("email", email)
    .eq("purpose", purpose)
    .is("used_at", null)
    .is("invalidated_at", null)
    .gt("expires_at", now)
    .limit(1);

  if (activeError) {
    return "invalid";
  }
  if (activeRows && activeRows.length > 0) {
    return "invalid";
  }

  const { data: latestRows, error: latestError } = await supabase
    .from("auth_login_otps")
    .select("expires_at, used_at, invalidated_at, created_at, email, purpose")
    .eq("email", email)
    .eq("purpose", purpose)
    .order("created_at", { ascending: false })
    .limit(1);

  if (latestError || !latestRows?.length) {
    return "invalid";
  }

  return classifyLoginOtpFailureFromRows(latestRows as LoginOtpStatusRow[], {
    email,
    purpose,
  });
}

export async function verifyLoginOtp(
  supabase: SupabaseClient,
  params: { email: string; code: string; purpose?: string }
): Promise<VerifyLoginOtpResult> {
  const email = normalizeLoginOtpEmail(params.email);
  const purpose = params.purpose ?? LOGIN_OTP_PURPOSE;
  const code = params.code.trim();

  if (!isValidOtpCodeFormat(code)) {
    return { ok: false, reason: "invalid" };
  }

  const otpHash = hashLoginOtp({ email, purpose, code });
  const { data, error } = await supabase.rpc("consume_auth_login_otp", {
    p_email: email,
    p_purpose: purpose,
    p_otp_hash: otpHash,
  });

  if (error) {
    return { ok: false, reason: "error" };
  }

  if (data === true) {
    return { ok: true };
  }

  const failureReason = await classifyLoginOtpFailure(supabase, { email, purpose });
  return { ok: false, reason: failureReason };
}

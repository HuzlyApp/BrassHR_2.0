import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifyAuthMessage,
  LOGIN_OTP_EXPIRED_MESSAGE,
  LOGIN_OTP_INVALID_MESSAGE,
  LOGIN_OTP_RESEND_LIMIT_MESSAGE,
  parseLoginApiError,
} from "@/lib/auth/login-api-errors";
import {
  classifyLoginOtpFailureFromRows,
  createLoginOtp,
  evaluateLoginOtpIssueGate,
  hashLoginOtp,
  LOGIN_OTP_PURPOSE,
  verifyLoginOtp,
} from "@/lib/auth/login-otp-store";
import {
  formatLoginOtpCooldownMessage,
  LOGIN_OTP_MAX_RESENDS,
  LOGIN_OTP_RESEND_COOLDOWN_SECONDS,
  LOGIN_OTP_TTL_SECONDS,
  parseLoginOtpCooldownSeconds,
} from "@/lib/auth/login-otp-constants";

type OtpRow = {
  id: string;
  email: string;
  user_id: string | null;
  purpose: string;
  otp_hash: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  invalidated_at: string | null;
};

function consumeAuthLoginOtp(rows: OtpRow[], email: string, purpose: string, otpHash: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  const now = Date.now();
  const candidates = rows
    .filter(
      (row) =>
        row.email === normalizedEmail &&
        row.purpose === purpose &&
        row.used_at === null &&
        row.invalidated_at == null &&
        new Date(row.expires_at).getTime() > now
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const latest = candidates[0];
  if (!latest || latest.otp_hash !== otpHash) {
    return false;
  }

  latest.used_at = new Date().toISOString();
  return true;
}

function createInMemoryOtpSupabase(initialRows: OtpRow[] = []) {
  const rows = [...initialRows];
  let nextId = 1;

  const invalidateActive = (email: string, purpose: string, now: string) => {
    for (const row of rows) {
      if (
        row.email === email &&
        row.purpose === purpose &&
        row.used_at === null &&
        row.invalidated_at == null
      ) {
        row.invalidated_at = now;
      }
    }
  };

  const from = vi.fn((table: string) => {
    if (table !== "auth_login_otps") {
      throw new Error(`Unexpected table: ${table}`);
    }

    const filters: Array<{ type: "eq" | "is" | "gt" | "gte"; column: string; value: unknown }> = [];
    let orderColumn: string | null = null;
    let orderAscending = true;
    let limitCount: number | null = null;
    let selectedColumns: string[] | null = null;

    const matchesFilters = (row: OtpRow) =>
      filters.every((filter) => {
        const cell = (row as Record<string, unknown>)[filter.column];
        if (filter.type === "eq") return cell === filter.value;
        if (filter.type === "is") return cell == filter.value;
        if (filter.type === "gt") {
          return new Date(String(cell)).getTime() > new Date(String(filter.value)).getTime();
        }
        if (filter.type === "gte") {
          return new Date(String(cell)).getTime() >= new Date(String(filter.value)).getTime();
        }
        return false;
      });

    const runSelect = () => {
      let result = rows.filter(matchesFilters);
      if (orderColumn) {
        result = result
          .slice()
          .sort((a, b) => {
            const left = new Date(String((a as Record<string, unknown>)[orderColumn!])).getTime();
            const right = new Date(String((b as Record<string, unknown>)[orderColumn!])).getTime();
            return orderAscending ? left - right : right - left;
          });
      }
      if (limitCount != null) {
        result = result.slice(0, limitCount);
      }
      if (selectedColumns) {
        result = result.map((row) => {
          const picked: Record<string, unknown> = {};
          for (const column of selectedColumns!) {
            picked[column] = (row as Record<string, unknown>)[column];
          }
          return picked as OtpRow;
        });
      }
      return Promise.resolve({ data: result, error: null });
    };

    const builder = {
      select(columns: string) {
        selectedColumns = columns.split(",").map((column) => column.trim());
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push({ type: "eq", column, value });
        return builder;
      },
      is(column: string, value: unknown) {
        filters.push({ type: "is", column, value });
        return builder;
      },
      gt(column: string, value: unknown) {
        filters.push({ type: "gt", column, value });
        return builder;
      },
      gte(column: string, value: unknown) {
        filters.push({ type: "gte", column, value });
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        orderColumn = column;
        orderAscending = options?.ascending !== false;
        return builder;
      },
      limit(count: number) {
        limitCount = count;
        return runSelect();
      },
      update(payload: Partial<OtpRow>) {
        return {
          eq(column: string, value: unknown) {
            filters.push({ type: "eq", column, value });
            return {
              eq(column2: string, value2: unknown) {
                filters.push({ type: "eq", column: column2, value: value2 });
                return {
                  is(column3: string, value3: unknown) {
                    filters.push({ type: "is", column: column3, value: value3 });
                    return {
                      is(column4: string, value4: unknown) {
                        filters.push({ type: "is", column: column4, value: value4 });
                        const now = payload.invalidated_at;
                        for (const row of rows) {
                          const matches = filters.every((filter) => {
                            if (filter.type === "eq") {
                              return (row as Record<string, unknown>)[filter.column] === filter.value;
                            }
                            return (row as Record<string, unknown>)[filter.column] == filter.value;
                          });
                          if (matches && now) {
                            row.invalidated_at = now;
                          }
                        }
                        return Promise.resolve({ error: null });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
      insert(payload: Omit<OtpRow, "id">) {
        rows.push({
          id: `otp-${nextId++}`,
          used_at: null,
          invalidated_at: null,
          ...payload,
        });
        return Promise.resolve({ error: null });
      },
    };

    return builder;
  });

  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    if (fn === "consume_auth_login_otp") {
      const email = String(args.p_email ?? "");
      const purpose = String(args.p_purpose ?? "");
      const otpHash = String(args.p_otp_hash ?? "");
      return {
        data: consumeAuthLoginOtp(rows, email, purpose, otpHash),
        error: null,
      };
    }

    if (fn === "issue_auth_login_otp") {
      const email = String(args.p_email ?? "").trim().toLowerCase();
      const purpose = String(args.p_purpose ?? "");
      const now = String(args.p_now ?? new Date().toISOString());
      const expiresAt = String(args.p_expires_at ?? "");
      invalidateActive(email, purpose, now);
      rows.push({
        id: `otp-${nextId++}`,
        email,
        user_id: (args.p_user_id as string | null) ?? null,
        purpose,
        otp_hash: String(args.p_otp_hash ?? ""),
        created_at: now,
        expires_at: expiresAt,
        used_at: null,
        invalidated_at: null,
      });
      return { data: null, error: null };
    }

    throw new Error(`Unexpected rpc: ${fn}`);
  });

  return {
    supabase: { from, rpc } as unknown as SupabaseClient,
    rows,
  };
}

describe("login OTP store", () => {
  const email = "user@example.com";
  const otherEmail = "other@example.com";
  const baseTime = new Date(Date.now() - 30_000);

  beforeEach(() => {
    process.env.LOGIN_OTP_PEPPER = "test-pepper";
    process.env.LOGIN_OTP_TTL_SECONDS = String(LOGIN_OTP_TTL_SECONDS);
  });

  it("invalidates an old OTP after a new OTP is generated", async () => {
    const { supabase, rows } = createInMemoryOtpSupabase();
    const first = await createLoginOtp(supabase, {
      email,
      now: baseTime,
      code: "111111",
      skipIssueGuards: true,
    });
    await createLoginOtp(supabase, {
      email,
      now: new Date(baseTime.getTime() + 1000),
      code: "222222",
      skipIssueGuards: true,
    });

    expect(rows.filter((row) => row.invalidated_at !== null)).toHaveLength(1);
    expect(rows.find((row) => row.otp_hash === hashLoginOtp({ email, purpose: LOGIN_OTP_PURPOSE, code: first.code }))?.invalidated_at).not.toBeNull();

    const oldResult = await verifyLoginOtp(supabase, { email, code: first.code });
    expect(oldResult).toEqual({ ok: false, reason: "invalid" });
  });

  it("verifies the latest OTP successfully", async () => {
    const { supabase } = createInMemoryOtpSupabase();
    await createLoginOtp(supabase, { email, now: baseTime, code: "111111", skipIssueGuards: true });
    const latest = await createLoginOtp(supabase, {
      email,
      now: new Date(baseTime.getTime() + 1000),
      code: "222222",
      skipIssueGuards: true,
    });

    await expect(verifyLoginOtp(supabase, { email, code: latest.code })).resolves.toEqual({ ok: true });
  });

  it("rejects an old OTP even when it has not expired", async () => {
    const { supabase } = createInMemoryOtpSupabase();
    const oldCode = "333333";
    await createLoginOtp(supabase, { email, now: baseTime, code: oldCode, skipIssueGuards: true });
    await createLoginOtp(supabase, {
      email,
      now: new Date(baseTime.getTime() + 2000),
      code: "444444",
      skipIssueGuards: true,
    });

    await expect(verifyLoginOtp(supabase, { email, code: oldCode })).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("rejects an expired latest OTP", async () => {
    const { supabase, rows } = createInMemoryOtpSupabase();
    const created = await createLoginOtp(supabase, {
      email,
      now: baseTime,
      code: "555555",
      skipIssueGuards: true,
    });
    const row = rows[0];
    row.expires_at = new Date(Date.now() - 60_000).toISOString();

    await expect(verifyLoginOtp(supabase, { email, code: created.code })).resolves.toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("does not allow reusing a consumed OTP", async () => {
    const { supabase } = createInMemoryOtpSupabase();
    const created = await createLoginOtp(supabase, {
      email,
      now: baseTime,
      code: "666666",
      skipIssueGuards: true,
    });

    await expect(verifyLoginOtp(supabase, { email, code: created.code })).resolves.toEqual({ ok: true });
    await expect(verifyLoginOtp(supabase, { email, code: created.code })).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("leaves only the newest OTP valid after multiple resends", async () => {
    const { supabase } = createInMemoryOtpSupabase();
    const first = await createLoginOtp(supabase, {
      email,
      now: baseTime,
      code: "111111",
      skipIssueGuards: true,
    });
    await createLoginOtp(supabase, {
      email,
      now: new Date(baseTime.getTime() + 1000),
      code: "222222",
      skipIssueGuards: true,
    });
    const third = await createLoginOtp(supabase, {
      email,
      now: new Date(baseTime.getTime() + 2000),
      code: "333333",
      skipIssueGuards: true,
    });

    await expect(verifyLoginOtp(supabase, { email, code: first.code })).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
    await expect(verifyLoginOtp(supabase, { email, code: "222222" })).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
    await expect(verifyLoginOtp(supabase, { email, code: third.code })).resolves.toEqual({ ok: true });
  });

  it("rejects an OTP when purpose does not match", async () => {
    const { supabase } = createInMemoryOtpSupabase();
    const created = await createLoginOtp(supabase, {
      email,
      now: baseTime,
      code: "777777",
      purpose: "login",
      skipIssueGuards: true,
    });

    await expect(
      verifyLoginOtp(supabase, { email, code: created.code, purpose: "password_reset" })
    ).resolves.toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects an OTP for a different user email", async () => {
    const { supabase } = createInMemoryOtpSupabase();
    const created = await createLoginOtp(supabase, {
      email,
      now: baseTime,
      code: "888888",
      skipIssueGuards: true,
    });

    await expect(verifyLoginOtp(supabase, { email: otherEmail, code: created.code })).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("blocks OTP issue during the cooldown window", () => {
    const now = new Date("2026-07-02T12:01:00.000Z");
    const gate = evaluateLoginOtpIssueGate(
      [{ created_at: "2026-07-02T12:00:30.000Z" }],
      { now, cooldownSeconds: 60, maxResends: LOGIN_OTP_MAX_RESENDS }
    );
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.reason).toBe("cooldown");
      expect(gate.retryAfterSec).toBe(30);
      expect(gate.message).toBe("Please wait for the timer (30s) before requesting a new code.");
    }
  });

  it("defaults to 30-second cooldown and dynamic timer format", () => {
    expect(LOGIN_OTP_RESEND_COOLDOWN_SECONDS).toBe(30);
    expect(formatLoginOtpCooldownMessage(30)).toBe(
      "Please wait for the timer (30s) before requesting a new code."
    );
    expect(formatLoginOtpCooldownMessage(1)).toBe(
      "Please wait for the timer (1s) before requesting a new code."
    );
    expect(
      parseLoginOtpCooldownSeconds("Please wait for the timer (25s) before requesting a new code.")
    ).toBe(25);
  });

  it("blocks OTP issue after the max resend count", () => {
    const now = new Date("2026-07-02T12:20:00.000Z");
    const rows = Array.from({ length: 1 + LOGIN_OTP_MAX_RESENDS }, (_, index) => ({
      created_at: new Date(now.getTime() - (index + 1) * 60_000).toISOString(),
    }));
    const gate = evaluateLoginOtpIssueGate(rows, {
      now,
      cooldownSeconds: 60,
      maxResends: LOGIN_OTP_MAX_RESENDS,
      windowSeconds: 15 * 60,
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.reason).toBe("resend_limit");
      expect(gate.message).toBe(LOGIN_OTP_RESEND_LIMIT_MESSAGE);
    }
  });

  it("uses the expected OTP error message constants", () => {
    expect(LOGIN_OTP_INVALID_MESSAGE).toBe("Check the code and try again.");
    expect(LOGIN_OTP_EXPIRED_MESSAGE).toBe("Request a new code and try again.");
  });

  it("classifies expired OTPs from row data", () => {
    const now = new Date("2026-07-02T12:10:00.000Z");
    expect(
      classifyLoginOtpFailureFromRows(
        [
          {
            email,
            purpose: LOGIN_OTP_PURPOSE,
            created_at: "2026-07-02T12:00:00.000Z",
            expires_at: "2026-07-02T12:05:00.000Z",
            used_at: null,
            invalidated_at: null,
          },
        ],
        { email, purpose: LOGIN_OTP_PURPOSE, now }
      )
    ).toBe("expired");
  });

  it("classifies wrong OTP when an active code still exists", () => {
    const now = new Date("2026-07-02T12:03:00.000Z");
    expect(
      classifyLoginOtpFailureFromRows(
        [
          {
            email,
            purpose: LOGIN_OTP_PURPOSE,
            created_at: "2026-07-02T12:00:00.000Z",
            expires_at: "2026-07-02T12:10:00.000Z",
            used_at: null,
            invalidated_at: null,
          },
        ],
        { email, purpose: LOGIN_OTP_PURPOSE, now }
      )
    ).toBe("invalid");
  });

  it("classifies cooldown error messages with dynamic seconds", () => {
    const classified = classifyAuthMessage(
      "Please wait for the timer (24s) before requesting a new code."
    );
    expect(classified.code).toBe("RATE_LIMIT");
    expect(classified.error).toBe(
      "Please wait for the timer (24s) before requesting a new code."
    );
    expect((classified as any).retryAfterSec).toBe(24);
  });

  it("parses login API error responses for cooldown rate limits", async () => {
    const res = new Response(
      JSON.stringify({
        error: "Please wait for the timer (15s) before requesting a new code.",
        code: "RATE_LIMIT",
        retryAfterSec: 15,
      }),
      { status: 429, headers: { "Retry-After": "15" } }
    );
    const parsed = await parseLoginApiError(res);
    expect(parsed.code).toBe("RATE_LIMIT");
    expect(parsed.error).toBe(
      "Please wait for the timer (15s) before requesting a new code."
    );
    expect(parsed.retryAfterSec).toBe(15);
  });
});

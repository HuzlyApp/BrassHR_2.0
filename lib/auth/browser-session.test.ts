import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/supabase-browser", () => ({
  supabaseBrowser: { auth: { getSession: () => getSession() } },
}));

import { getBrowserSession, isAuthLockContentionError } from "./browser-session";

const stolen = Object.assign(
  new Error('Lock "lock:sb-qowirmiicsrglehiaoil-auth-token" was released because another request stole it'),
  { name: "AbortError" }
);

describe("getBrowserSession", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it("recognises Supabase lock contention errors only", () => {
    expect(isAuthLockContentionError(stolen)).toBe(true);
    expect(isAuthLockContentionError({ name: "NavigatorLockAcquireTimeoutError", message: "timeout" })).toBe(true);
    expect(isAuthLockContentionError(new Error("network down"))).toBe(false);
    expect(isAuthLockContentionError(null)).toBe(false);
  });

  it("retries when another request steals the lock", async () => {
    const session = { user: { id: "u1" } };
    getSession.mockRejectedValueOnce(stolen).mockResolvedValueOnce({ data: { session }, error: null });
    await expect(getBrowserSession()).resolves.toBe(session);
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("shares one read between concurrent callers", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const [a, b, c] = await Promise.all([getBrowserSession(), getBrowserSession(), getBrowserSession()]);
    expect([a, b, c]).toEqual([null, null, null]);
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("does not retry other errors", async () => {
    getSession.mockRejectedValue(new Error("network down"));
    await expect(getBrowserSession()).rejects.toThrow("network down");
    expect(getSession).toHaveBeenCalledTimes(1);
  });
});

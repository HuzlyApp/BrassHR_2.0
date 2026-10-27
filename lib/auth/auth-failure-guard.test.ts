import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetAuthFailureGuardForTests, noteAuthFailure } from "@/lib/auth/auth-failure-guard";

describe("noteAuthFailure", () => {
  afterEach(() => {
    __resetAuthFailureGuardForTests();
    vi.unstubAllEnvs();
  });

  it("logs a 401 without a token and allows the request under the limit", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const blocked = await noteAuthFailure({
      ip: "203.0.113.8",
      method: "GET",
      path: "/api/admin/users?token=secret",
      status: 401,
      reason: "no_session",
      userId: "not-a-user",
    });
    expect(blocked).toBeNull();
    const line = String(warn.mock.calls[0]?.[0] ?? "");
    expect(line).toContain("\"event\":\"unauthenticated\"");
    expect(line).toContain("\"path\":\"/api/admin/users\"");
    expect(line).not.toContain("secret");
    expect(line).not.toContain("not-a-user");
    expect(line).not.toContain("203.0.113.8");
  });

  it("returns 429 after repeated failures from the same client", async () => {
    vi.stubEnv("AUTH_FAILURE_LIMIT", "2");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = await noteAuthFailure({
      ip: "198.51.100.4",
      method: "POST",
      path: "/api/admin/roles",
      status: 403,
      reason: "denied",
      userId: "11111111-1111-4111-8111-111111111111",
    });
    const second = await noteAuthFailure({
      ip: "198.51.100.4",
      method: "POST",
      path: "/api/admin/roles",
      status: 403,
      reason: "denied",
    });
    const third = await noteAuthFailure({
      ip: "198.51.100.4",
      method: "DELETE",
      path: "/api/admin/roles",
      status: 403,
      reason: "denied",
    });
    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(third?.status).toBe(429);
    expect(third?.headers.get("Retry-After")).toBeTruthy();
  });

  it("does not throttle failures that are marked uncounted", async () => {
    vi.stubEnv("AUTH_FAILURE_LIMIT", "1");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = await noteAuthFailure({
      ip: "198.51.100.9",
      method: "GET",
      path: "/api/admin/home",
      status: 403,
      reason: "password_setup_required",
      count: false,
    });
    const second = await noteAuthFailure({
      ip: "198.51.100.9",
      method: "GET",
      path: "/api/admin/home",
      status: 403,
      reason: "password_setup_required",
      count: false,
    });
    expect(first).toBeNull();
    expect(second).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { supabaseAuthCookieOptions } from "@/lib/auth/session-cookie";

describe("supabaseAuthCookieOptions", () => {
  it("uses Secure and SameSite=Lax in production and stays readable by the Supabase browser client", () => {
    expect(supabaseAuthCookieOptions("production")).toEqual({
      path: "/",
      sameSite: "lax",
      secure: true,
      httpOnly: false,
    });
  });

  it("omits Secure outside production so local http can keep the session", () => {
    expect(supabaseAuthCookieOptions("development").secure).toBe(false);
    expect(supabaseAuthCookieOptions("test").httpOnly).toBe(false);
  });
});

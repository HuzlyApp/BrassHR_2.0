import { describe, expect, it } from "vitest";
import { assertResumeObjectPath } from "@/lib/resume/resume-object-path";
import { hashResumeBytes } from "@/lib/resume/resume-file-hash";
import {
  isAutoQuickMatchFailed,
  isAutoQuickMatchPending,
} from "@/lib/jobs/match-analysis/auto-quick-match-status";

describe("resume upload guards", () => {
  it("hashes file bytes stably", () => {
    const bytes = Buffer.from("same-resume");
    expect(hashResumeBytes(bytes)).toBe(hashResumeBytes(Uint8Array.from(bytes)));
    expect(hashResumeBytes(Buffer.from("other"))).not.toBe(hashResumeBytes(bytes));
  });

  it("rejects resume paths outside the caller's folder", () => {
    expect(assertResumeObjectPath("applicant-1/file.pdf", ["applicant-1"])).toBe(
      "applicant-1/file.pdf"
    );
    expect(() => assertResumeObjectPath("../secrets.pdf", ["applicant-1"])).toThrow(/Invalid resume path/);
    expect(() => assertResumeObjectPath("other-user/file.pdf", ["applicant-1"])).toThrow(
      /Invalid resume path/
    );
  });

  it("does not treat a queued Quick Match as a failure", () => {
    expect(isAutoQuickMatchPending("ANALYZING")).toBe(true);
    expect(isAutoQuickMatchFailed("ANALYZING")).toBe(false);
    expect(isAutoQuickMatchFailed("FAILED")).toBe(true);
    expect(isAutoQuickMatchFailed("ANALYZED")).toBe(false);
  });
});

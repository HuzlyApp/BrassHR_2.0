import { describe, expect, it } from "vitest";
import {
  buildPostHireSubmissionData,
  effectivePostHireProgressStatus,
  hasCandidatePostHireEvidence,
  isValidRoutingNumber,
  maskAccountNumber,
  postHireScreenKindForStep,
  readPostHireScreenContent,
  readPostHireSubmission,
  validateDirectDepositInput,
  videoEmbedForUrl,
  w4DependentsAmount,
} from "@/lib/onboarding/post-hire-step-screens";

function stepWith(stepId: string | null, settings: Record<string, unknown> = {}) {
  return {
    metadata: {
      ...(stepId ? { workflow_step_id: stepId } : {}),
      workflow_settings: { phase: "post_hire", ...settings },
    },
  };
}

describe("postHireScreenKindForStep", () => {
  it("maps candidate post-hire library steps to screen kinds", () => {
    expect(postHireScreenKindForStep(stepWith("direct-deposit-setup"))).toBe("direct_deposit");
    expect(postHireScreenKindForStep(stepWith("tax-forms"))).toBe("tax_withholding");
    expect(postHireScreenKindForStep(stepWith("i9-right-to-work-verification"))).toBe("i9_attestation");
    expect(postHireScreenKindForStep(stepWith("policy-acknowledgment"))).toBe("acknowledgment");
    expect(postHireScreenKindForStep(stepWith("orientation-video"))).toBe("training");
  });

  it("ignores steps without a post-hire screen", () => {
    expect(postHireScreenKindForStep(stepWith("employee-agreement"))).toBeNull();
    expect(postHireScreenKindForStep(stepWith("upload-resume"))).toBeNull();
    expect(postHireScreenKindForStep(stepWith(null))).toBeNull();
  });

  it("leaves Pre-Hire and unphased copies on their existing screens", () => {
    expect(postHireScreenKindForStep(stepWith("policy-acknowledgment", { phase: "pre_hire" }))).toBeNull();
    expect(postHireScreenKindForStep(stepWith("tax-forms", { phase: "" }))).toBeNull();
  });
});

describe("readPostHireScreenContent", () => {
  it("reads admin-configured content and drops non-http links", () => {
    const content = readPostHireScreenContent(
      stepWith("policy-acknowledgment", {
        applicantInstructions: "  Read the handbook  ",
        documentUrl: "javascript:alert(1)",
        contentUrl: "https://example.com/video.mp4",
        acknowledgmentText: "I agree",
      })
    );
    expect(content).toEqual({
      instructions: "Read the handbook",
      documentUrl: null,
      contentUrl: "https://example.com/video.mp4",
      acknowledgmentText: "I agree",
    });
  });

  it("falls back to per-step acknowledgment copy", () => {
    expect(readPostHireScreenContent(stepWith("orientation-video")).acknowledgmentText).toMatch(
      /orientation video/
    );
  });
});

describe("videoEmbedForUrl", () => {
  it("builds embed urls for common hosts", () => {
    expect(videoEmbedForUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      type: "iframe",
      src: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    });
    expect(videoEmbedForUrl("https://youtu.be/dQw4w9WgXcQ")?.src).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(videoEmbedForUrl("https://vimeo.com/123456")?.src).toBe("https://player.vimeo.com/video/123456");
    expect(videoEmbedForUrl("https://www.loom.com/share/abc123")?.src).toBe("https://www.loom.com/embed/abc123");
    expect(videoEmbedForUrl("https://cdn.example.com/intro.mp4")).toEqual({
      type: "video",
      src: "https://cdn.example.com/intro.mp4",
    });
  });

  it("returns null for pages that cannot be embedded", () => {
    expect(videoEmbedForUrl("https://example.com/training")).toBeNull();
    expect(videoEmbedForUrl("ftp://example.com/a.mp4")).toBeNull();
  });
});

describe("direct deposit validation", () => {
  it("checks ABA routing checksums", () => {
    expect(isValidRoutingNumber("021000021")).toBe(true);
    expect(isValidRoutingNumber("021000022")).toBe(false);
    expect(isValidRoutingNumber("12345")).toBe(false);
  });

  it("validates and normalizes input", () => {
    const input = {
      accountHolderName: " Jane Doe ",
      bankName: "Chase",
      accountType: "checking",
      routingNumber: "021 000 021",
      accountNumber: "000123456789",
    };
    const result = validateDirectDepositInput(input);
    expect(result).toEqual({
      ok: true,
      value: {
        accountHolderName: "Jane Doe",
        bankName: "Chase",
        accountType: "checking",
        routingNumber: "021000021",
        accountNumber: "000123456789",
      },
    });
    expect(validateDirectDepositInput({ ...input, accountType: "brokerage" }).ok).toBe(false);
    expect(validateDirectDepositInput({ ...input, routingNumber: "123456789" }).ok).toBe(false);
  });

  it("masks account numbers", () => {
    expect(maskAccountNumber("000123456789")).toBe("••••6789");
  });
});

describe("post-hire submission data", () => {
  it("round-trips labeled answers and drops empty values", () => {
    const data = buildPostHireSubmissionData(
      "tax_withholding",
      [
        { label: "Filing status", value: "Single" },
        { label: "Extra withholding", value: " " },
      ],
      "2026-01-01T00:00:00.000Z"
    );
    expect(readPostHireSubmission(data)).toEqual({
      kind: "tax_withholding",
      fields: [{ label: "Filing status", value: "Single" }],
      submittedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(readPostHireSubmission({ post_hire_submission: { kind: "nope" } })).toBeNull();
  });

  it("computes W-4 dependent credits", () => {
    expect(w4DependentsAmount(2, 1)).toBe(4500);
    expect(w4DependentsAmount(-1, Number.NaN)).toBe(0);
  });

  it("does not treat training steps as completed without candidate checkbox evidence", () => {
    expect(hasCandidatePostHireEvidence("training", { step_type: "custom_question" })).toBe(false);
    expect(effectivePostHireProgressStatus("training", "completed", {})).toBe("pending");
    expect(
      effectivePostHireProgressStatus("training", "completed", { checkbox_confirmed: true })
    ).toBe("completed");
    expect(
      effectivePostHireProgressStatus(
        "training",
        "completed",
        buildPostHireSubmissionData("training", [{ label: "Confirmation", value: "I completed training." }])
      )
    ).toBe("completed");
  });
});

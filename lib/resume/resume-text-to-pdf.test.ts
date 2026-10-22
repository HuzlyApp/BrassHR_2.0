import { describe, expect, it } from "vitest";
import { resumeTextToPdfBuffer, sanitizeTextForPdfDrawing } from "@/lib/resume/resume-text-to-pdf";

describe("sanitizeTextForPdfDrawing", () => {
  it("removes null bytes that break WinAnsi encoding", () => {
    expect(sanitizeTextForPdfDrawing("Almog\u0000 Arazi")).toBe("Almog Arazi");
  });

  it("preserves WinAnsi bullets, smart quotes, and dashes", () => {
    expect(sanitizeTextForPdfDrawing("• Bachelor’s degree — 3–5 years")).toBe(
      "• Bachelor’s degree — 3–5 years"
    );
  });

  it("folds alternate bullet glyphs to a WinAnsi bullet", () => {
    expect(sanitizeTextForPdfDrawing("● Led team\n▪ Shipped product")).toBe(
      "• Led team\n• Shipped product"
    );
  });

  it("folds Word symbol-font bullets instead of printing a question mark", () => {
    expect(sanitizeTextForPdfDrawing("\uF0B7 Led team\n\u25A1 Shipped product")).toBe(
      "• Led team\n• Shipped product"
    );
  });

  it("still replaces unsupported glyphs with ?", () => {
    expect(sanitizeTextForPdfDrawing("smile 🙂")).toBe("smile ?");
  });
});

describe("resumeTextToPdfBuffer", () => {
  it("builds a PDF from pasted resume text with null bytes", async () => {
    const buffer = await resumeTextToPdfBuffer("Jordan Lee\u0000\nRN at Memorial Hospital");
    expect(buffer.byteLength).toBeGreaterThan(100);
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  });
});

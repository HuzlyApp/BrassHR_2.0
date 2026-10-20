import { describe, expect, it } from "vitest";
import {
  adminWorkerResumePreviewHref,
  buildWorkerResumeFileName,
  contentDispositionInline,
  resumeFileExtension,
  sanitizeResumeNamePart,
  splitFullName,
} from "@/lib/resume/worker-resume-file-name";

describe("buildWorkerResumeFileName", () => {
  it("uses first_last_resume plus the original extension", () => {
    expect(
      buildWorkerResumeFileName({
        firstName: "Joe",
        lastName: "Bloe",
        originalFileName: "Resume (8).pdf",
      })
    ).toBe("Joe_Bloe_resume.pdf");
  });

  it("keeps docx uploads as docx", () => {
    expect(
      buildWorkerResumeFileName({
        firstName: "Jane",
        lastName: "Doe",
        originalFileName: "resume2.docx",
      })
    ).toBe("Jane_Doe_resume.docx");
  });

  it("sanitizes spaces and punctuation in names", () => {
    expect(
      buildWorkerResumeFileName({
        firstName: "Mary Jane",
        lastName: "O'Brien",
        originalFileName: "Resume.pdf",
      })
    ).toBe("Mary_Jane_O_Brien_resume.pdf");
  });

  it("falls back to the original filename when names are missing", () => {
    expect(
      buildWorkerResumeFileName({
        firstName: "",
        lastName: "  ",
        originalFileName: "Resume (39).pdf",
      })
    ).toBe("Resume (39).pdf");
  });

  it("keeps the uploaded filename while the worker still has the placeholder name", () => {
    expect(
      buildWorkerResumeFileName({
        firstName: "Applicant",
        lastName: "User",
        originalFileName: "Sujith Resume.pdf",
      })
    ).toBe("Sujith Resume.pdf");
  });

  it("defaults to resume.pdf when nothing usable is provided", () => {
    expect(buildWorkerResumeFileName({})).toBe("resume.pdf");
  });

  it("keeps the Stage 5 optimized suffix instead of rewriting to _resume", () => {
    expect(
      buildWorkerResumeFileName({
        firstName: "Jordan",
        lastName: "Hale",
        originalFileName: "Jordan_Hale_submission_resume.pdf",
      })
    ).toBe("Jordan_Hale_submission_resume.pdf");
  });
});

describe("splitFullName", () => {
  it("splits the first token as first name", () => {
    expect(splitFullName("Joe Bloe")).toEqual({ firstName: "Joe", lastName: "Bloe" });
    expect(splitFullName("Mary Jane Watson")).toEqual({
      firstName: "Mary",
      lastName: "Jane Watson",
    });
  });
});

describe("sanitizeResumeNamePart / extension helpers", () => {
  it("strips diacritics", () => {
    expect(sanitizeResumeNamePart("José")).toBe("Jose");
  });

  it("reads the file extension", () => {
    expect(resumeFileExtension("Resume (8).PDF")).toBe(".pdf");
    expect(resumeFileExtension("file")).toBe(".pdf");
  });

  it("builds a quoted Content-Disposition value", () => {
    expect(contentDispositionInline('Joe_Bloe_resume.pdf')).toBe(
      'inline; filename="Joe_Bloe_resume.pdf"'
    );
  });
});

describe("adminWorkerResumePreviewHref", () => {
  it("targets a specific resume so View PDF can display that file", () => {
    expect(
      adminWorkerResumePreviewHref({
        workerId: "worker-1",
        resumeId: "resume-9",
        applicationId: "app-3",
      })
    ).toBe(
      "/api/admin/worker-resume-preview?workerId=worker-1&resumeId=resume-9&applicationId=app-3"
    );
  });
});

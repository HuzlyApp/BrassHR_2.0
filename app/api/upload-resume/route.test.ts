import { beforeEach, describe, expect, it, vi } from "vitest"

const afterMock = vi.hoisted(() => vi.fn((_fn: () => void | Promise<void>) => undefined))
const runResumeParseJobMock = vi.hoisted(() => vi.fn(async () => undefined))
const persistRecordMock = vi.hoisted(() => vi.fn(async () => "resume-uuid-1"))
const extractPdfTextMock = vi.hoisted(() => vi.fn(async () => "Jane Doe\njane@example.com"))
const mammothExtractRawTextMock = vi.hoisted(() => vi.fn(async () => ({ value: "Docx Person\ndocx@example.com" })))

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>()
  return { ...actual, after: afterMock }
})

vi.mock("@/lib/resume/extract-pdf-text", () => ({
  extractPdfText: (...args: unknown[]) => extractPdfTextMock(...args),
}))
vi.mock("mammoth", () => ({ default: { extractRawText: mammothExtractRawTextMock } }))
vi.mock("@/lib/resume/run-resume-parse-job", () => ({
  runResumeParseJob: (...args: unknown[]) => runResumeParseJobMock(...args),
}))
const resolveOrEnsureWorkerForApplicantMock = vi.hoisted(() =>
  vi.fn(async () => ({
    workerId: "worker-1",
    tenantId: "tenant-1",
    userId: "applicant-1",
  }))
)
vi.mock("@/lib/onboarding/resolve-worker-context", () => ({
  resolveWorkerByApplicantId: vi.fn(async () => null),
  resolveOrEnsureWorkerForApplicant: (...args: unknown[]) =>
    resolveOrEnsureWorkerForApplicantMock(...args),
}))
vi.mock("@/lib/onboarding/persist-worker-resume-path", () => ({
  persistWorkerResumePath: vi.fn(async () => undefined),
}))
vi.mock("@/lib/onboarding/sync-worker-primary-resume-path", () => ({
  syncWorkerPrimaryResumePath: vi.fn(async () => undefined),
}))
vi.mock("@/lib/onboarding/persist-worker-resume-record", () => ({
  persistWorkerResumeRecord: (...args: unknown[]) => persistRecordMock(...args),
}))
const sendResumeContinuationEmailMock = vi.hoisted(() => vi.fn(async () => ({ outcome: "skipped" })))
vi.mock("@/lib/onboarding/send-resume-continuation-email", () => ({
  sendResumeContinuationEmail: (...args: unknown[]) => sendResumeContinuationEmailMock(...args),
}))
vi.mock("@/lib/resolve-app-origin", () => ({
  resolveAppOrigin: () => "http://localhost:3000",
  resolveApplicantEmailAppOrigin: () => "http://localhost:3000",
}))
vi.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => null),
  getClientIp: vi.fn(() => "127.0.0.1"),
}))
vi.mock("@/lib/supabase-env", () => ({
  getSupabaseUrl: () => "https://example.supabase.co",
}))

const storageUploadMock = vi.hoisted(() => vi.fn(async () => ({ error: null })))
const startOrResumeJobApplicationMock = vi.hoisted(() => vi.fn())
const deletedApplicationIds = vi.hoisted(() => [] as string[])

vi.mock("@/lib/jobs/service", () => ({
  startOrResumeJobApplication: (...args: unknown[]) => startOrResumeJobApplicationMock(...args),
}))
vi.mock("@/lib/jobs/match-analysis/auto-quick-match", () => ({
  scheduleAutoQuickMatchForApplication: vi.fn(),
}))

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { first_name: "Jane", last_name: "Doe" },
            error: null,
          }),
        }),
      }),
      delete: () => ({
        eq: (_column: string, id: string) => ({
          eq: async () => {
            if (table === "job_applications") deletedApplicationIds.push(id)
            return { error: null }
          },
        }),
      }),
    }),
    storage: {
      from: () => ({
        upload: storageUploadMock,
      }),
    },
  })),
}))

import { POST } from "@/app/api/upload-resume/route"
import { DRAFT_PREVIEW_APPLICANT_ID } from "@/lib/onboarding/is-draft-preview"

function makePdfFile() {
  return new File([new Uint8Array([1, 2, 3])], "resume.pdf", { type: "application/pdf" })
}

function makeDocxFile() {
  return new File([new Uint8Array([1, 2, 3])], "resume.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  })
}

describe("POST /api/upload-resume", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deletedApplicationIds.length = 0
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key"
    runResumeParseJobMock.mockResolvedValue(undefined)
    persistRecordMock.mockResolvedValue("resume-uuid-1")
    extractPdfTextMock.mockResolvedValue("Jane Doe\njane@example.com")
    mammothExtractRawTextMock.mockResolvedValue({ value: "Docx Person\ndocx@example.com" })
  })

  it("uploads a PDF, extracts text, and returns a resumeId without waiting for Grok", async () => {
    const grokStarted = vi.fn()
    runResumeParseJobMock.mockImplementation(async () => {
      grokStarted()
      await new Promise((r) => setTimeout(r, 500))
    })

    const fd = new FormData()
    fd.append("file", makePdfFile())
    fd.append("applicantId", "applicant-1")

    const started = Date.now()
    const res = await POST(new Request("http://localhost/api/upload-resume", { method: "POST", body: fd }))
    const elapsed = Date.now() - started

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.parseStatus).toBe("processing")
    expect(json.resumeId).toBe("resume-uuid-1")
    expect(json.storagePath).toBeTruthy()
    expect(json.text).toBeUndefined()
    expect(json.textLength).toBeGreaterThan(0)
    expect(json.extractionMs).toBeGreaterThanOrEqual(0)
    expect(elapsed).toBeLessThan(1000)
    expect(extractPdfTextMock).toHaveBeenCalled()
    expect(persistRecordMock).toHaveBeenCalledWith(
      expect.anything(),
      "applicant-1",
      expect.objectContaining({
        extractedText: "Jane Doe\njane@example.com",
        textLength: "Jane Doe\njane@example.com".length,
        fileType: "pdf",
        fileSizeBytes: 3,
      }),
    )
    expect(afterMock).toHaveBeenCalled()
    expect(grokStarted).not.toHaveBeenCalled()

    const afterCallback = afterMock.mock.calls[0]?.[0] as () => Promise<void>
    await afterCallback()
    expect(sendResumeContinuationEmailMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workerId: "worker-1",
        tenantId: "tenant-1",
        resumeId: "resume-uuid-1",
        trigger: "resume_upload",
        extractedText: "Jane Doe\njane@example.com",
      }),
    )
    expect(grokStarted).toHaveBeenCalled()
  })

  it("uploads a DOCX, extracts text, and returns a resumeId", async () => {
    const fd = new FormData()
    fd.append("file", makeDocxFile())
    fd.append("applicantId", "applicant-1")
    fd.append("tenantSlug", "subdomaintest")

    const res = await POST(new Request("http://localhost/api/upload-resume", { method: "POST", body: fd }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.resumeId).toBe("resume-uuid-1")
    expect(json.parseStatus).toBe("processing")
    expect(mammothExtractRawTextMock).toHaveBeenCalled()
    expect(persistRecordMock).toHaveBeenCalledWith(
      expect.anything(),
      "applicant-1",
      expect.objectContaining({
        extractedText: "Docx Person\ndocx@example.com",
        fileType: "docx",
      }),
    )
  })

  it("returns a clear error when resume DB persistence fails", async () => {
    persistRecordMock.mockRejectedValueOnce(new Error("worker_resumes insert failed"))
    const fd = new FormData()
    fd.append("file", makePdfFile())
    fd.append("applicantId", "applicant-1")

    const res = await POST(new Request("http://localhost/api/upload-resume", { method: "POST", body: fd }))

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toContain("worker_resumes insert failed")
  })

  it("returns an error instead of resumeId null when DB persistence returns null", async () => {
    persistRecordMock.mockResolvedValueOnce(null)
    const fd = new FormData()
    fd.append("file", makePdfFile())
    fd.append("applicantId", "applicant-1")

    const res = await POST(new Request("http://localhost/api/upload-resume", { method: "POST", body: fd }))

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toContain("resume database record was not created")
  })

  it("removes a newly created job application when the resume cannot be saved", async () => {
    startOrResumeJobApplicationMock.mockResolvedValueOnce({
      application: { id: "app-new", status: "new" },
      resumed: false,
    })
    persistRecordMock.mockRejectedValueOnce(new Error("worker_resumes insert failed"))
    const fd = new FormData()
    fd.append("file", makePdfFile())
    fd.append("applicantId", "applicant-1")
    fd.append("jobToken", "job-token-1")

    const res = await POST(new Request("http://localhost/api/upload-resume", { method: "POST", body: fd }))

    expect(res.status).toBe(500)
    expect(deletedApplicationIds).toEqual(["app-new"])
  })

  it("keeps a resumed job application when the resume cannot be saved", async () => {
    startOrResumeJobApplicationMock.mockResolvedValueOnce({
      application: { id: "app-existing", status: "new" },
      resumed: true,
    })
    persistRecordMock.mockRejectedValueOnce(new Error("worker_resumes insert failed"))
    const fd = new FormData()
    fd.append("file", makePdfFile())
    fd.append("applicantId", "applicant-1")
    fd.append("jobToken", "job-token-1")

    const res = await POST(new Request("http://localhost/api/upload-resume", { method: "POST", body: fd }))

    expect(res.status).toBe(500)
    expect(deletedApplicationIds).toEqual([])
  })

  it("supports Test workflow / draft preview without creating a production worker", async () => {
    const fd = new FormData()
    fd.append("file", makePdfFile())
    fd.append("applicantId", DRAFT_PREVIEW_APPLICANT_ID)
    fd.append("tenantSlug", "zipstaff")
    fd.append("jobToken", "should-be-ignored")

    const res = await POST(new Request("http://localhost/api/upload-resume", { method: "POST", body: fd }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.workflowTest).toBe(true)
    expect(json.draftPreview).toBe(true)
    expect(json.resumeId).toMatch(/^draft-preview-/)
    expect(json.applicationId).toBeNull()
    expect(json.storagePath).toBeNull()
    expect(resolveOrEnsureWorkerForApplicantMock).not.toHaveBeenCalled()
    expect(persistRecordMock).not.toHaveBeenCalled()
    expect(storageUploadMock).not.toHaveBeenCalled()
    expect(afterMock).not.toHaveBeenCalled()
  })

  it("still validates file type for Test workflow uploads", async () => {
    const fd = new FormData()
    fd.append("file", new File([new Uint8Array([1])], "resume.txt", { type: "text/plain" }))
    fd.append("applicantId", DRAFT_PREVIEW_APPLICANT_ID)

    const res = await POST(new Request("http://localhost/api/upload-resume", { method: "POST", body: fd }))

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain("PDF, DOC, and DOCX")
  })
})

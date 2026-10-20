import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const grokParseResumeCachedMock = vi.hoisted(() => vi.fn());
const extractResumeTextFromUploadMock = vi.hoisted(() => vi.fn());
const createAdminJobApplicationMock = vi.hoisted(() => vi.fn());
const findActiveApplicationForJobMock = vi.hoisted(() => vi.fn());
const runAutoQuickMatchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/resume/grok-parse-resume-cached", () => ({
  grokParseResumeCached: (...args: unknown[]) => grokParseResumeCachedMock(...args),
}));

vi.mock("@/lib/jobs/match-analysis/extract-resume-text", () => ({
  extractResumeTextFromUpload: (...args: unknown[]) => extractResumeTextFromUploadMock(...args),
}));

vi.mock("@/lib/jobs/service", () => ({
  createAdminJobApplication: (...args: unknown[]) => createAdminJobApplicationMock(...args),
  findActiveApplicationForJob: (...args: unknown[]) => findActiveApplicationForJobMock(...args),
}));

vi.mock("@/lib/jobs/match-analysis/auto-quick-match", () => ({
  runAutoQuickMatchForApplication: (...args: unknown[]) => runAutoQuickMatchMock(...args),
}));

vi.mock("@/lib/onboarding/sync-worker-primary-resume-path", () => ({
  syncWorkerPrimaryResumePath: vi.fn(async () => undefined),
}));

import { adminAddCandidateFromResume } from "@/lib/jobs/admin-add-candidate-from-resume";
import { JobValidationError } from "@/lib/jobs/types";

const PARSED = {
  first_name: "Jordan",
  last_name: "Lee",
  email: "jordan.lee@clinic.org",
  phone: "(404) 555-0100",
  address1: "",
  address2: "",
  city: "Atlanta",
  state: "GA",
  zip: "30301",
  job_role: "RN",
};

const TIMEOUT = { code: "57014", message: "canceling statement due to statement timeout" };

function resumeFile() {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "Jordan_Lee_resume.pdf", {
    type: "application/pdf",
  });
}

function chain(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "or", "order", "limit", "update"]) {
    builder[method] = () => builder;
  }
  const payload = {
    data: result.data ?? null,
    error: result.error ?? null,
  };
  builder.maybeSingle = async () => payload;
  builder.single = async () => payload;
  builder.then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise.resolve(payload).then(resolve, reject);
  return builder;
}

function createSupabase(options: {
  boundResumes?: Array<{ id: string }>;
  insertErrors?: Array<{ code: string; message: string } | null>;
  existingResumeAfterFailure?: boolean;
}) {
  const inserts: Array<Record<string, unknown>> = [];
  const profileUpdates: Array<Record<string, unknown>> = [];
  let insertCount = 0;

  const supabase = {
    storage: {
      from() {
        return {
          upload: async () => ({ error: null }),
        };
      },
    },
    from(table: string) {
      if (table === "applicant_profiles") {
        return {
          select: () =>
            chain({
              data: { id: "profile-1", worker_id: "worker-1" },
            }),
          update: (payload: Record<string, unknown>) => {
            profileUpdates.push(payload);
            return chain({ data: null });
          },
        };
      }
      if (table === "job_requisitions") {
        return { select: () => chain({ data: { public_title: "RN - Atlanta" } }) };
      }
      if (table === "worker_resumes") {
        return {
          select: () =>
            chain({
              data:
                options.existingResumeAfterFailure || (options.boundResumes?.length ?? 0) > 0
                  ? [{ id: "resume-existing" }]
                  : [],
            }),
          insert: (row: Record<string, unknown>) => {
            inserts.push(row);
            insertCount += 1;
            const error = options.insertErrors?.[insertCount - 1] ?? null;
            return chain({ data: null, error });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  return { supabase, inserts, profileUpdates };
}

describe("adminAddCandidateFromResume resume save", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    grokParseResumeCachedMock.mockReset();
    extractResumeTextFromUploadMock.mockReset();
    createAdminJobApplicationMock.mockReset();
    findActiveApplicationForJobMock.mockReset();
    runAutoQuickMatchMock.mockReset();
    grokParseResumeCachedMock.mockResolvedValue(PARSED);
    extractResumeTextFromUploadMock.mockResolvedValue("Jordan Lee RN jordan.lee@clinic.org");
    runAutoQuickMatchMock.mockResolvedValue(null);
    vi.useFakeTimers();
  });

  it("retries a statement timeout and saves the resume on the third attempt", async () => {
    const { supabase, inserts, profileUpdates } = createSupabase({
      insertErrors: [TIMEOUT, TIMEOUT, null],
    });
    createAdminJobApplicationMock.mockResolvedValue({
      application: { id: "app-1" },
      applicantProfileId: "profile-1",
      jobTitle: "RN - Atlanta",
    });

    const pending = adminAddCandidateFromResume(supabase as never, {
      tenantId: "tenant-1",
      jobRequisitionId: "job-1",
      resumeFile: resumeFile(),
      workCity: "Atlanta",
      workState: "GA",
    });
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(inserts).toHaveLength(3);
    expect(inserts[0]?.job_application_id).toBe("app-1");
    expect(profileUpdates).toHaveLength(0);
    expect(result.applicationId).toBe("app-1");
  });

  it("stops retrying when the timed-out insert actually landed", async () => {
    const { supabase, inserts } = createSupabase({
      insertErrors: [TIMEOUT],
      existingResumeAfterFailure: true,
    });
    createAdminJobApplicationMock.mockResolvedValue({
      application: { id: "app-1" },
      applicantProfileId: "profile-1",
      jobTitle: "RN - Atlanta",
    });

    const pending = adminAddCandidateFromResume(supabase as never, {
      tenantId: "tenant-1",
      jobRequisitionId: "job-1",
      resumeFile: resumeFile(),
      workCity: "Atlanta",
      workState: "GA",
    });
    await vi.runAllTimersAsync();
    await pending;

    expect(inserts).toHaveLength(1);
  });

  it("attaches the new resume when the recruiter retries an application that has none", async () => {
    const { supabase, inserts, profileUpdates } = createSupabase({
      boundResumes: [],
      insertErrors: [null],
    });
    createAdminJobApplicationMock.mockRejectedValue(
      new JobValidationError(
        "This candidate already has an application for this job.",
        { email: "A candidate with this email already applied for this job." },
        "DUPLICATE_APPLICATION"
      )
    );
    findActiveApplicationForJobMock.mockResolvedValue({
      id: "app-existing",
      worker_id: "worker-1",
    });

    const pending = adminAddCandidateFromResume(supabase as never, {
      tenantId: "tenant-1",
      jobRequisitionId: "job-1",
      resumeFile: resumeFile(),
      workCity: "Atlanta",
      workState: "GA",
    });
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.applicationId).toBe("app-existing");
    expect(inserts[0]?.job_application_id).toBe("app-existing");
    expect(profileUpdates[0]).toMatchObject({
      resume_file_name: expect.any(String),
    });
    expect(String(profileUpdates[0]?.resume_path)).toContain("admin-candidates/tenant-1/");
  });

  it("does not change the profile when the existing application already has a resume", async () => {
    const { supabase, inserts, profileUpdates } = createSupabase({
      boundResumes: [{ id: "resume-existing" }],
    });
    createAdminJobApplicationMock.mockRejectedValue(
      new JobValidationError(
        "This candidate already has an application for this job.",
        {},
        "DUPLICATE_APPLICATION"
      )
    );
    findActiveApplicationForJobMock.mockResolvedValue({
      id: "app-existing",
      worker_id: "worker-1",
    });

    await expect(
      adminAddCandidateFromResume(supabase as never, {
        tenantId: "tenant-1",
        jobRequisitionId: "job-1",
        resumeFile: resumeFile(),
        workCity: "Atlanta",
        workState: "GA",
      })
    ).rejects.toMatchObject({ code: "DUPLICATE_APPLICATION" });
    expect(inserts).toHaveLength(0);
    expect(profileUpdates).toHaveLength(0);
  });

  it("does not point the profile at a new file when every resume save times out", async () => {
    const { supabase, inserts, profileUpdates } = createSupabase({
      boundResumes: [],
      insertErrors: [TIMEOUT, TIMEOUT, TIMEOUT],
    });
    createAdminJobApplicationMock.mockRejectedValue(
      new JobValidationError(
        "This candidate already has an application for this job.",
        {},
        "DUPLICATE_APPLICATION"
      )
    );
    findActiveApplicationForJobMock.mockResolvedValue({
      id: "app-existing",
      worker_id: "worker-1",
    });

    const pending = adminAddCandidateFromResume(supabase as never, {
      tenantId: "tenant-1",
      jobRequisitionId: "job-1",
      resumeFile: resumeFile(),
      workCity: "Atlanta",
      workState: "GA",
    });
    const assertion = expect(pending).rejects.toMatchObject({ code: "57014" });
    await vi.runAllTimersAsync();
    await assertion;

    expect(inserts).toHaveLength(3);
    expect(profileUpdates).toHaveLength(0);
  });
});

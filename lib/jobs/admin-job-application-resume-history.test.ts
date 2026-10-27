import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/jobs/match-analysis/ensure-application-resume", () => ({
  ensureApplicationResumeFromWorker: vi.fn(async () => null),
}));

import {
  loadAdminJobApplicationResumeHistory,
  selectResumesForJobHistory,
} from "@/lib/jobs/admin-job-application-resume-history";

describe("loadAdminJobApplicationResumeHistory", () => {
  it("returns resumes oldest-first with uploader names", async () => {
    const applicationId = "app-1";
    const workerId = "worker-1";
    const workerUserId = "user-worker";
    const staffUserId = "user-staff";

    const supabase = {
      from(table: string) {
        const state: { table: string } = { table };
        const api = {
          select() {
            return api;
          },
          eq() {
            return api;
          },
          or() {
            return api;
          },
          limit() {
            if (state.table === "worker_requirements") {
              return Promise.resolve({
                data: [{ resume_path: "worker-1/2025 Resume.pdf" }],
                error: null,
              });
            }
            return api;
          },
          is() {
            return api;
          },
          in() {
            return api;
          },
          order() {
            return api;
          },
          maybeSingle: async () => {
            if (state.table === "job_applications") {
              return {
                data: {
                  id: applicationId,
                  worker_id: workerId,
                  applicant_profile_id: "profile-1",
                  job_requisitions: {
                    public_title: "Certified Nursing Assistant (CNA)",
                    source_job_title: null,
                    source_type: null,
                    employment_type: null,
                    location: null,
                  },
                },
                error: null,
              };
            }
            if (state.table === "applicant_profiles") {
              return {
                data: {
                  worker_id: workerId,
                  resume_path: "worker-1/2025 Resume.pdf",
                },
                error: null,
              };
            }
            if (state.table === "worker") {
              return {
                data: {
                  id: workerId,
                  user_id: workerUserId,
                  first_name: "Shawnda",
                  last_name: "Watkins",
                  profile_photo: null,
                },
                error: null,
              };
            }
            return { data: null, error: null };
          },
          then(onFulfilled: (value: unknown) => unknown) {
            if (state.table === "worker_resumes") {
              return Promise.resolve(
                onFulfilled({
                  data: [
                    {
                      id: "resume-1",
                      original_file_name: "2025 Resume.pdf",
                      file_name: null,
                      file_type: "application/pdf",
                      uploaded_at: "2026-08-13T10:00:00.000Z",
                      uploaded_by_user_id: workerUserId,
                      storage_path: "worker-1/2025 Resume.pdf",
                      file_url: "worker-1/2025 Resume.pdf",
                      job_application_id: applicationId,
                    },
                    {
                      id: "resume-2",
                      original_file_name: "ResumeHaileySparks.pdf",
                      file_name: null,
                      file_type: "application/pdf",
                      uploaded_at: "2026-08-13T11:00:00.000Z",
                      uploaded_by_user_id: staffUserId,
                      storage_path: "worker-1/ResumeHaileySparks.pdf",
                      file_url: "worker-1/ResumeHaileySparks.pdf",
                      job_application_id: applicationId,
                    },
                    {
                      id: "resume-3",
                      original_file_name: "Shawnda_Watkins_submission_resume.pdf",
                      file_name: "Shawnda_Watkins_submission_resume.pdf",
                      file_type: "application/pdf",
                      uploaded_at: "2026-08-13T12:00:00.000Z",
                      uploaded_by_user_id: staffUserId,
                      storage_path: "submission-resumes/tenant-1/app-1/pack.pdf",
                      file_url: "submission-resumes/tenant-1/app-1/pack.pdf",
                      job_application_id: applicationId,
                    },
                    {
                      id: "resume-4",
                      original_file_name: "Shawnda_Watkins_submission_resume.docx",
                      file_name: "Shawnda_Watkins_submission_resume.docx",
                      file_type:
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                      uploaded_at: "2026-08-13T12:01:00.000Z",
                      uploaded_by_user_id: staffUserId,
                      storage_path: "submission-resumes/tenant-1/app-1/pack.docx",
                      file_url: "submission-resumes/tenant-1/app-1/pack.docx",
                      job_application_id: applicationId,
                    },
                  ],
                  error: null,
                })
              );
            }
            if (state.table === "users") {
              return Promise.resolve(
                onFulfilled({
                  data: [{ id: staffUserId, first_name: "Test", last_name: "User", profile_photo: null }],
                  error: null,
                })
              );
            }
            return Promise.resolve(onFulfilled({ data: [], error: null }));
          },
        };
        return api;
      },
    };

    const result = await loadAdminJobApplicationResumeHistory(
      supabase as never,
      "tenant-1",
      applicationId
    );

    expect(result?.jobTitle).toBe("Certified Nursing Assistant (CNA)");
    expect(result?.resumes).toHaveLength(4);
    expect(result?.resumes[0]?.fileName).toBe("Shawnda_Watkins_resume.pdf");
    expect(result?.resumes[0]?.fileIconType).toBe("pdf");
    expect(result?.resumes[0]?.uploadedByName).toBe("Shawnda Watkins");
    expect(result?.resumes[0]?.uploadedByType).toBe("worker");
    expect(result?.resumes[1]?.uploadedByName).toBe("Test User");
    expect(result?.resumes[1]?.uploadedByType).toBe("staff");
    expect(result?.resumes[2]?.fileName).toBe("Shawnda_Watkins_submission_resume.pdf");
    expect(result?.resumes[2]?.fileIconType).toBe("pdf");
    expect(result?.resumes[3]?.fileName).toBe("Shawnda_Watkins_submission_resume.docx");
    expect(result?.resumes[3]?.fileIconType).toBe("docx");
  });
});

describe("selectResumesForJobHistory", () => {
  it("includes the currently displayed unscoped apply resume", () => {
    const rows = [
      {
        id: "resume-applied",
        original_file_name: "ResumeHaileySparks.pdf",
        file_name: null,
        file_type: "application/pdf",
        uploaded_at: "2026-08-12T10:00:00.000Z",
        uploaded_by_user_id: "user-worker",
        storage_path: "user-worker/ResumeHaileySparks.pdf",
        file_url: "user-worker/ResumeHaileySparks.pdf",
        job_application_id: null,
      },
    ];
    const selected = selectResumesForJobHistory(rows, "app-1", [
      "user-worker/ResumeHaileySparks.pdf",
    ]);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.id).toBe("resume-applied");
  });

  it("does not include another job's scoped resume", () => {
    const rows = [
      {
        id: "resume-other-job",
        original_file_name: "other.pdf",
        file_name: null,
        file_type: "application/pdf",
        uploaded_at: "2026-08-12T10:00:00.000Z",
        uploaded_by_user_id: "user-worker",
        storage_path: "other.pdf",
        file_url: "other.pdf",
        job_application_id: "app-b",
      },
    ];
    expect(selectResumesForJobHistory(rows, "app-a", ["other.pdf"])).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { adminWorkerResumePreviewHref } from "@/lib/resume/worker-resume-file-name";
import { listWorkerJobApplications } from "@/lib/applicant-portal/list-worker-job-applications";

const WORKER_ID = "worker-1";
const TENANT_ID = "tenant-1";
const THIS_APPLICATION = "app-this";
const OTHER_APPLICATION = "app-other";

function chain(data: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order", "is"]) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = async () => ({
    data: { first_name: "Jordan", last_name: "Lee" },
    error: null,
  });
  builder.then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise.resolve({ data, error: null }).then(resolve, reject);
  return builder;
}

function supabaseFor(resumes: Array<Record<string, unknown>>) {
  return {
    from(table: string) {
      if (table === "job_applications") {
        return chain([
          {
            id: THIS_APPLICATION,
            job_requisition_id: "job-1",
            status: "new",
            created_at: "2026-10-01T00:00:00.000Z",
            job_requisitions: { public_title: "RN - Atlanta", facility_name: "Clinic" },
            tenants: { name: "Zipstaff" },
          },
        ]);
      }
      if (table === "worker_resumes") return chain(resumes);
      if (table === "worker") return chain(null);
      if (table === "application_status_history") return chain([]);
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("candidate profile resume button", () => {
  it("shows a resume from another application and opens that resume's own application", async () => {
    const rows = await listWorkerJobApplications(supabaseFor([
      {
        id: "resume-9",
        original_file_name: "Jordan_Lee_resume.pdf",
        file_name: "Jordan_Lee_resume.pdf",
        file_type: "pdf",
        file_size_bytes: 1200,
        job_application_id: OTHER_APPLICATION,
      },
    ]) as never, { workerId: WORKER_ID, tenantId: TENANT_ID });

    const resume = rows[0]?.resume;
    expect(resume?.id).toBe("resume-9");
    expect(resume?.jobApplicationId).toBe(OTHER_APPLICATION);

    const href = adminWorkerResumePreviewHref({
      workerId: WORKER_ID,
      resumeId: resume?.id,
      applicationId: resume?.jobApplicationId?.trim() || THIS_APPLICATION,
    });

    expect(href).toContain("resumeId=resume-9");
    expect(href).toContain(`applicationId=${OTHER_APPLICATION}`);
    expect(href).not.toContain(`applicationId=${THIS_APPLICATION}`);
  });
});

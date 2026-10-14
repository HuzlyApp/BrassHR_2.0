import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/service-area/db", () => ({
  assertTenantCanOperate: vi.fn(async () => undefined),
  evaluateServiceAreaWithDb: vi.fn(async () => ({
    allowed: true,
    reasonCode: "ok",
  })),
  recordWorkLocationConfirmation: vi.fn(async () => undefined),
}));

vi.mock("@/lib/onboarding/onboarding-flows", () => ({
  getOnboardingFlowById: vi.fn(async () => ({
    id: "flow-1",
    name: "Nursing",
    status: "published",
    builderDraft: { nodes: [{ id: "step-1" }], edges: [] },
    updatedAt: "2026-10-01T00:00:00.000Z",
  })),
}));

import { createAdminJobApplication } from "@/lib/jobs/service";
import { JobValidationError } from "@/lib/jobs/types";

function chain(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "not", "is", "order", "limit"]) {
    builder[method] = () => builder;
  }
  const payload = { data: result.data ?? null, error: result.error ?? null };
  builder.maybeSingle = async () => payload;
  builder.then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise.resolve(payload).then(resolve, reject);
  return builder;
}

describe("createAdminJobApplication duplicate retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an existing application before it rewrites the candidate profile", async () => {
    const profileUpdates: Array<Record<string, unknown>> = [];
    const supabase = {
      from(table: string) {
        if (table === "job_requisitions") {
          return chain({
            data: {
              id: "job-1",
              tenant_id: "tenant-1",
              workflow_id: "flow-1",
              status: "open",
              public_title: "RN - Atlanta",
            },
          });
        }
        if (table === "applicant_profiles") {
          return {
            select: () => chain({ data: { id: "profile-1", worker_id: "worker-1" } }),
            update: (payload: Record<string, unknown>) => {
              profileUpdates.push(payload);
              return chain({ data: null });
            },
          };
        }
        if (table === "job_applications") {
          return chain({ data: { id: "app-existing", worker_id: "worker-1" } });
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    await expect(
      createAdminJobApplication(supabase as never, {
        tenantId: "tenant-1",
        jobRequisitionId: "job-1",
        name: "Jordan Lee",
        email: "jordan.lee@clinic.org",
        resumePath: "admin-candidates/tenant-1/new-resume.pdf",
        resumeFileName: "Jordan_Lee_resume.pdf",
        workLocation: {
          country: "US",
          city: "Atlanta",
          state: "GA",
          postalCode: "30301",
          locationType: "onsite",
          relocateToJobSite: false,
        },
      })
    ).rejects.toBeInstanceOf(JobValidationError);

    expect(profileUpdates).toEqual([]);
  });
});

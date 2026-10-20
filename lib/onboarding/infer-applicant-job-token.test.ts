import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inferApplicantJobToken } from "@/lib/onboarding/infer-applicant-job-token";

function mockSupabase(tables: Record<string, Array<Record<string, unknown>>>) {
  const filtersSeen: Array<[string, string, unknown]> = [];
  const from = (table: string) => {
    let rows = tables[table] ?? [];
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filtersSeen.push([table, column, value]);
        rows = rows.filter((row) => row[column] === value);
        return builder;
      },
      or: () => builder,
      not: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: rows, error: null })),
    };
    return builder;
  };
  return { client: { from } as unknown as SupabaseClient, filtersSeen };
}

const job = { id: "job-1", tenant_id: "t1", public_job_token: "token-1" };

describe("inferApplicantJobToken", () => {
  it("returns the job token of the applicant's only active application", async () => {
    const { client } = mockSupabase({
      job_applications: [{ id: "app-1", tenant_id: "t1", job_requisition_id: "job-1" }],
      job_requisitions: [job],
    });
    await expect(
      inferApplicantJobToken(client, { tenantId: "t1", workerId: "w1", userId: "u1" })
    ).resolves.toEqual({ jobToken: "token-1", applicationId: "app-1" });
  });

  it("does not guess between several active applications", async () => {
    const { client } = mockSupabase({
      job_applications: [
        { id: "app-1", tenant_id: "t1", job_requisition_id: "job-1" },
        { id: "app-2", tenant_id: "t1", job_requisition_id: "job-1" },
      ],
      job_requisitions: [job],
    });
    await expect(inferApplicantJobToken(client, { tenantId: "t1", workerId: "w1" })).resolves.toBeNull();
  });

  it("narrows to the requested application", async () => {
    const { client, filtersSeen } = mockSupabase({
      job_applications: [
        { id: "app-1", tenant_id: "t1", job_requisition_id: "job-1" },
        { id: "app-2", tenant_id: "t1", job_requisition_id: "job-1" },
      ],
      job_requisitions: [job],
    });
    await expect(
      inferApplicantJobToken(client, { tenantId: "t1", workerId: "w1", applicationId: "app-2" })
    ).resolves.toEqual({ jobToken: "token-1", applicationId: "app-2" });
    expect(filtersSeen).toContainEqual(["job_applications", "id", "app-2"]);
  });
});

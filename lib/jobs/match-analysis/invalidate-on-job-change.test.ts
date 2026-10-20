import { describe, expect, it, vi } from "vitest";
import { invalidateMatchCachesForJobDescriptionChange } from "./invalidate-on-job-change";

function createMockSupabase(opts?: {
  clearError?: { message: string } | null;
  resetError?: { message: string } | null;
  resetIds?: string[];
}) {
  const clearUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: opts?.clearError ?? null }),
    }),
  });

  const resetSelect = vi.fn().mockResolvedValue({
    data: (opts?.resetIds ?? ["app-1"]).map((id) => ({ id })),
    error: opts?.resetError ?? null,
  });
  const resetEq3 = vi.fn().mockReturnValue({ select: resetSelect });
  const resetEq2 = vi.fn().mockReturnValue({ eq: resetEq3 });
  const resetEq1 = vi.fn().mockReturnValue({ eq: resetEq2 });
  const resetUpdate = vi.fn().mockReturnValue({ eq: resetEq1 });

  const from = vi.fn((table: string) => {
    if (table === "job_requisitions") {
      return { update: clearUpdate };
    }
    if (table === "job_applications") {
      return { update: resetUpdate };
    }
    throw new Error(`Unexpected table ${table}`);
  });

  return {
    supabase: { from } as never,
    clearUpdate,
    resetUpdate,
    resetSelect,
  };
}

describe("invalidateMatchCachesForJobDescriptionChange", () => {
  it("clears structured_requirements and resets ANALYZED applications to READY", async () => {
    const { supabase, clearUpdate, resetUpdate } = createMockSupabase({
      resetIds: ["app-1", "app-2"],
    });

    const result = await invalidateMatchCachesForJobDescriptionChange({
      supabase,
      tenantId: "tenant-1",
      jobRequisitionId: "job-1",
    });

    expect(clearUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        structured_requirements: null,
      })
    );
    expect(resetUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        ai_match_status: "READY",
        ai_analysis: null,
        ai_analysis_raw: null,
        ai_match_score: null,
        ai_analysis_error: expect.stringMatching(/Job description changed/i),
      })
    );
    expect(result.applicationsReset).toBe(2);
    expect(result.applicationIds).toEqual(["app-1", "app-2"]);
  });
});

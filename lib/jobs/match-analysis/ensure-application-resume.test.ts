import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureApplicationResumeFromWorker } from "./ensure-application-resume";

describe("ensureApplicationResumeFromWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the application-scoped résumé when one already exists", async () => {
    const supabase = {
      from(table: string) {
        expect(table).toBe("worker_resumes");
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  order: () => ({
                    limit: async () => ({
                      data: [
                        {
                          id: "r-app",
                          extracted_text: "Scoped text",
                          file_name: "scoped.pdf",
                          original_file_name: "scoped.pdf",
                          storage_path: "path/scoped.pdf",
                          job_application_id: "app-1",
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      },
    };

    const result = await ensureApplicationResumeFromWorker({
      supabase: supabase as never,
      tenantId: "tenant-1",
      applicationId: "app-1",
      workerId: "worker-1",
    });

    expect(result).toEqual({
      text: "Scoped text",
      fileName: "scoped.pdf",
      storagePath: "path/scoped.pdf",
    });
  });

  it("binds an unbound worker résumé to the application", async () => {
    let updated = false;
    let phase: "scoped" | "source" = "scoped";
    const supabase = {
      from() {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  order: () => ({
                    limit: () => {
                      if (phase === "scoped") {
                        phase = "source";
                        return Promise.resolve({ data: [], error: null });
                      }
                      return {
                        maybeSingle: async () => ({
                          data: {
                            id: "r-unbound",
                            extracted_text: "Pool text",
                            file_name: "pool.pdf",
                            original_file_name: "pool.pdf",
                            storage_path: "path/pool.pdf",
                            file_url: "path/pool.pdf",
                            job_application_id: null,
                          },
                          error: null,
                        }),
                      };
                    },
                  }),
                }),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => ({
                is: async () => {
                  updated = true;
                  return { error: null };
                },
              }),
            }),
          }),
        };
      },
    };

    const result = await ensureApplicationResumeFromWorker({
      supabase: supabase as never,
      tenantId: "tenant-1",
      applicationId: "app-new",
      workerId: "worker-1",
    });

    expect(updated).toBe(true);
    expect(result?.fileName).toBe("pool.pdf");
    expect(result?.text).toBe("Pool text");
  });

  it("clones a résumé already tagged to another job", async () => {
    let inserted: Record<string, unknown> | null = null;
    let phase: "scoped" | "source" = "scoped";
    const supabase = {
      from() {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  order: () => ({
                    limit: () => {
                      if (phase === "scoped") {
                        phase = "source";
                        return Promise.resolve({ data: [], error: null });
                      }
                      return {
                        maybeSingle: async () => ({
                          data: {
                            id: "r-other",
                            extracted_text: "Other job text",
                            file_name: "other.pdf",
                            original_file_name: "other.pdf",
                            storage_path: "path/other.pdf",
                            file_url: "path/other.pdf",
                            file_type: "application/pdf",
                            file_size_bytes: 12,
                            text_length: 14,
                            job_application_id: "app-old",
                            parsing_status: "completed",
                            parse_status: "completed",
                            parsed_data: {},
                            parsed_json: {},
                            uploaded_by_user_id: "staff-1",
                          },
                          error: null,
                        }),
                      };
                    },
                  }),
                }),
              }),
            }),
          }),
          insert: async (row: Record<string, unknown>) => {
            inserted = row;
            return { error: null };
          },
        };
      },
    };

    const result = await ensureApplicationResumeFromWorker({
      supabase: supabase as never,
      tenantId: "tenant-1",
      applicationId: "app-new",
      workerId: "worker-1",
    });

    expect(inserted).toMatchObject({
      worker_id: "worker-1",
      tenant_id: "tenant-1",
      job_application_id: "app-new",
      storage_path: "path/other.pdf",
      extracted_text: "Other job text",
      uploaded_by_user_id: "staff-1",
    });
    expect(result?.fileName).toBe("other.pdf");
  });
});

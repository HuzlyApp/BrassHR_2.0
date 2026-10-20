import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  resumeApplicationId: "22222222-2222-4222-8222-222222222222",
  downloads: [] as string[],
}));

vi.mock("@/lib/auth/api-session", () => ({
  requireApiSession: vi.fn(async () => ({
    userId: "staff-1",
    email: "recruiter@example.com",
    role: "admin",
    godAdmin: false,
    devBypass: false,
  })),
}));

vi.mock("@/lib/supabase-env", () => ({
  getSupabaseUrl: () => "https://example.supabase.co",
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from(table: string) {
      const filters: Record<string, string> = {};
      const builder: Record<string, unknown> = {};
      const self = () => builder;
      builder.select = self;
      builder.eq = (column: string, value: string) => {
        filters[column] = value;
        return builder;
      };
      builder.is = self;
      builder.or = self;
      builder.order = self;
      builder.limit = self;
      builder.maybeSingle = async () => resolve(table, filters);
      builder.then = (
        resolvePromise: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(resolve(table, filters)).then(resolvePromise, reject);
      return builder;
    },
    storage: {
      from() {
        return {
          download: async (path: string) => {
            state.downloads.push(path);
            const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
            return {
              data: {
                type: "application/pdf",
                arrayBuffer: async () => bytes.buffer,
              },
              error: null,
            };
          },
        };
      },
    },
  }),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/admin/worker-resume-preview/route";

const WORKER_ID = "11111111-1111-4111-8111-111111111111";
const APPLICATION_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_APPLICATION_ID = "33333333-3333-4333-8333-333333333333";
const RESUME_ID = "44444444-4444-4444-8444-444444444444";

function resolve(table: string, filters: Record<string, string>) {
  if (table === "worker") {
    return {
      data: {
        id: WORKER_ID,
        user_id: null,
        first_name: "Jordan",
        last_name: "Lee",
      },
      error: null,
    };
  }
  if (table === "worker_requirements") {
    return { data: [], error: null };
  }
  if (table === "worker_resumes" && filters.id) {
    return {
      data: {
        storage_path: "workers/jordan-lee.pdf",
        file_url: null,
        original_file_name: "Jordan_Lee_resume.pdf",
        file_name: "Jordan_Lee_resume.pdf",
        job_application_id: state.resumeApplicationId,
      },
      error: null,
    };
  }
  if (table === "worker_resumes" && filters.job_application_id) {
    return { data: null, error: null };
  }
  if (table === "worker_resumes") {
    return {
      data: { storage_path: "workers/latest.pdf", file_url: null },
      error: null,
    };
  }
  return { data: null, error: null };
}

function previewUrl(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return new NextRequest(`http://localhost/api/admin/worker-resume-preview?${search.toString()}`);
}

describe("GET /api/admin/worker-resume-preview", () => {
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    state.downloads = [];
    state.resumeApplicationId = APPLICATION_ID;
  });

  it("rejects a resume that belongs to a different application", async () => {
    state.resumeApplicationId = OTHER_APPLICATION_ID;

    const response = await GET(
      previewUrl({
        workerId: WORKER_ID,
        resumeId: RESUME_ID,
        applicationId: APPLICATION_ID,
      })
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Resume not found" });
    expect(state.downloads).toEqual([]);
  });

  it("opens the resume when the request uses the resume's own application", async () => {
    state.resumeApplicationId = OTHER_APPLICATION_ID;

    const response = await GET(
      previewUrl({
        workerId: WORKER_ID,
        resumeId: RESUME_ID,
        applicationId: OTHER_APPLICATION_ID,
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(state.downloads).toEqual(["workers/jordan-lee.pdf"]);
  });

  it("falls back to the worker's latest resume when this application has none of its own", async () => {
    const response = await GET(
      previewUrl({
        workerId: WORKER_ID,
        applicationId: APPLICATION_ID,
      })
    );

    expect(response.status).toBe(200);
    expect(state.downloads).toEqual(["workers/latest.pdf"]);
  });
});

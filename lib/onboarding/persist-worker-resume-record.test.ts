import { describe, expect, it } from "vitest"
import { persistWorkerResumeRecord } from "@/lib/onboarding/persist-worker-resume-record"

describe("persistWorkerResumeRecord", () => {
  it("strips NUL bytes so Postgres does not reject the row with 22P05", async () => {
    let inserted: Record<string, unknown> | null = null
    const supabase = {
      from: (table: string) => {
        if (table === "worker") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "w1",
                    tenant_id: "t1",
                    user_id: "u1",
                    first_name: "Almog",
                    last_name: "Arazi",
                  },
                  error: null,
                }),
                limit: async () => ({
                  data: [
                    {
                      id: "w1",
                      tenant_id: "t1",
                      user_id: "u1",
                      first_name: "Almog",
                      last_name: "Arazi",
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }
        }
        return {
          insert: (row: Record<string, unknown>) => {
            inserted = row
            return {
              select: () => ({
                single: async () => ({ data: { id: "r1" }, error: null }),
              }),
            }
          },
        }
      },
    }

    const resumeId = await persistWorkerResumeRecord(supabase as never, "u1", {
      fileUrl: "path/resume.pdf",
      originalFileName: "Almog\u0000.pdf",
      extractedText: "Almog\u0000 Arazi\nEngineer",
      parsedData: { text: "Almog\u0000 Arazi" },
      enforceUploadLimit: false,
    })

    expect(resumeId).toBe("r1")
    expect(inserted?.extracted_text).toBe("Almog Arazi\nEngineer")
    expect(inserted?.parsed_data).toEqual({ text: "Almog Arazi" })
    expect(inserted?.original_file_name).toBe("Almog_Arazi_resume.pdf")
    expect(inserted?.file_name).toBe("Almog_Arazi_resume.pdf")
  })

  it("saves against the tenant worker when the auth user has profiles in multiple tenants", async () => {
    let insertedWorkerId: unknown = null
    const workers = [
      {
        id: "worker-testcompany",
        tenant_id: "tenant-testcompany",
        user_id: "auth-user",
        first_name: "Applicant",
        last_name: "User",
      },
      {
        id: "worker-zippycorp",
        tenant_id: "tenant-zippycorp",
        user_id: "auth-user",
        first_name: "Applicant",
        last_name: "User",
      },
    ]
    const supabase = {
      from: (table: string) => {
        if (table === "worker") {
          const filters: Record<string, string> = {}
          const query = {
            eq(column: string, value: string) {
              filters[column] = value
              return query
            },
            async maybeSingle() {
              const match = workers.filter((row) =>
                Object.entries(filters).every(
                  ([column, value]) => String(row[column as keyof typeof row]) === value
                )
              )
              if (match.length > 1) {
                return {
                  data: null,
                  error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
                }
              }
              return { data: match[0] ?? null, error: null }
            },
          }
          return { select: () => query }
        }
        return {
          insert: (row: Record<string, unknown>) => {
            insertedWorkerId = row.worker_id
            return {
              select: () => ({
                single: async () => ({ data: { id: "resume-1" }, error: null }),
              }),
            }
          },
        }
      },
    }

    const resumeId = await persistWorkerResumeRecord(supabase as never, "auth-user", {
      fileUrl: "auth-user/resume.pdf",
      enforceUploadLimit: false,
      workerId: "worker-zippycorp",
      tenantId: "tenant-zippycorp",
    })

    expect(resumeId).toBe("resume-1")
    expect(insertedWorkerId).toBe("worker-zippycorp")
  })
})

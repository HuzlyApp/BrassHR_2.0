import { describe, expect, it } from "vitest";
import { resolvePublicTenant } from "@/lib/jobs/tenant";

describe("resolvePublicTenant", () => {
  it("reads the stored category for the matched tenant", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "tenants") {
          return {
            select: () => ({
              or: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "tenant-acme",
                      slug: "acme",
                      subdomain: "acme",
                      name: "Acme",
                      is_active: true,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "tenant_categories") {
          return {
            select: () => ({
              eq: (_column: string, tenantId: string) => ({
                maybeSingle: async () => {
                  expect(tenantId).toBe("tenant-acme");
                  return { data: { category: "SMB" }, error: null };
                },
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    };

    await expect(resolvePublicTenant(supabase as never, "acme")).resolves.toEqual({
      id: "tenant-acme",
      slug: "acme",
      name: "Acme",
      category: "SMB",
    });
  });

  it("treats a tenant without a category row as Staffing", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "tenants") {
          return {
            select: () => ({
              or: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: "tenant-new", slug: "newco", subdomain: "newco", name: "Newco" },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      },
    };

    const tenant = await resolvePublicTenant(supabase as never, "newco");
    expect(tenant?.category).toBe("Staffing");
  });
});

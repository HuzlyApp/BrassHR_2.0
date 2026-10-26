import { describe, expect, it } from "vitest";
import {
  assignTenantCategory,
  DEFAULT_TENANT_CATEGORY,
  getTenantCategory,
  parseTenantCategory,
} from "@/lib/tenant/tenant-category";

describe("parseTenantCategory", () => {
  it("accepts Staffing and SMB", () => {
    expect(parseTenantCategory("Staffing")).toBe("Staffing");
    expect(parseTenantCategory(" smb ")).toBe("SMB");
  });

  it("rejects anything else", () => {
    expect(parseTenantCategory("Enterprise")).toBeNull();
    expect(parseTenantCategory("")).toBeNull();
    expect(parseTenantCategory(null)).toBeNull();
  });
});

describe("tenant category reads and writes", () => {
  it("defaults a missing category to Staffing", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: (_column: string, tenantId: string) => ({
            maybeSingle: async () => {
              expect(tenantId).toBe("tenant-existing");
              return { data: null, error: null };
            },
          }),
        }),
      }),
    };

    await expect(getTenantCategory(supabase as never, "tenant-existing")).resolves.toBe(
      DEFAULT_TENANT_CATEGORY
    );
  });

  it("sets SMB on one tenant and leaves the other as Staffing", async () => {
    const rows = new Map<string, string>([
      ["tenant-a", "Staffing"],
      ["tenant-b", "Staffing"],
    ]);
    const supabase = {
      from: (table: string) => {
        expect(table).toBe("tenant_categories");
        return {
          upsert: (row: { tenant_id: string; category: string }) => {
            rows.set(row.tenant_id, row.category);
            return {
              select: () => ({
                single: async () => ({ data: { category: row.category }, error: null }),
              }),
            };
          },
          select: () => ({
            eq: (_column: string, tenantId: string) => ({
              maybeSingle: async () => ({
                data: { category: rows.get(tenantId) ?? null },
                error: null,
              }),
            }),
          }),
        };
      },
    };

    await expect(assignTenantCategory(supabase as never, "tenant-b", "SMB")).resolves.toBe("SMB");
    await expect(getTenantCategory(supabase as never, "tenant-a")).resolves.toBe("Staffing");
    await expect(getTenantCategory(supabase as never, "tenant-b")).resolves.toBe("SMB");
  });
});

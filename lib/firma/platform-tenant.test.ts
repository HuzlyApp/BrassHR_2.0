import { beforeEach, describe, expect, it, vi } from "vitest";

const provisionFirmaWorkspaceForTenant = vi.fn();

vi.mock("@/lib/firma/provision-tenant-workspace", () => ({
  provisionFirmaWorkspaceForTenant: (...args: unknown[]) =>
    provisionFirmaWorkspaceForTenant(...args),
}));

describe("ensurePlatformTenantWithFirmaWorkspace", () => {
  beforeEach(() => {
    provisionFirmaWorkspaceForTenant.mockReset();
    provisionFirmaWorkspaceForTenant.mockResolvedValue({
      status: "created",
      workspaceId: "workspace_platform",
    });
  });

  it("creates the Braas HR tenant when missing and provisions its workspace", async () => {
    const inserted: Record<string, unknown>[] = [];
    const categories: Record<string, unknown>[] = [];
    const client = {
      from: vi.fn((table: string) => {
        if (table === "tenant_categories") {
          return {
            upsert: (row: Record<string, unknown>) => {
              categories.push(row);
              return {
                select: () => ({
                  single: async () => ({ data: { category: row.category }, error: null }),
                }),
              };
            },
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            inserted.push(row);
            return {
              select: () => ({
                single: async () => ({
                  data: {
                    id: "tenant-braas-hr",
                    name: row.name,
                    slug: row.slug,
                    subdomain: row.subdomain,
                  },
                  error: null,
                }),
              }),
            };
          },
        };
      }),
      rpc: vi.fn(async () => ({ error: null })),
    };

    const { ensurePlatformTenantWithFirmaWorkspace, PLATFORM_TENANT_SEED } = await import(
      "@/lib/firma/platform-tenant"
    );
    const result = await ensurePlatformTenantWithFirmaWorkspace(client as never);

    expect(result.created).toBe(true);
    expect(result.tenantId).toBe("tenant-braas-hr");
    expect(inserted[0]).toMatchObject({
      slug: PLATFORM_TENANT_SEED.slug,
      name: PLATFORM_TENANT_SEED.name,
      plan: "platform",
    });
    expect(categories).toEqual([
      expect.objectContaining({ tenant_id: "tenant-braas-hr", category: "Staffing" }),
    ]);
    expect(provisionFirmaWorkspaceForTenant).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-braas-hr",
        tenantName: PLATFORM_TENANT_SEED.name,
        tenantSlug: PLATFORM_TENANT_SEED.slug,
      })
    );
    expect(result.firmaProvisioning.workspaceId).toBe("workspace_platform");
  });

  it("does not duplicate the platform tenant when it already exists", async () => {
    const client = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "tenant-braas-hr",
                name: "Brass HR",
                slug: "braas-hr",
                subdomain: "braas-hr",
              },
              error: null,
            }),
          }),
        }),
        insert: () => {
          throw new Error("insert should not run");
        },
      })),
      rpc: vi.fn(),
    };

    provisionFirmaWorkspaceForTenant.mockResolvedValue({
      status: "already_configured",
      workspaceId: "workspace_platform",
    });

    const { ensurePlatformTenantWithFirmaWorkspace } = await import(
      "@/lib/firma/platform-tenant"
    );
    const first = await ensurePlatformTenantWithFirmaWorkspace(client as never);
    const second = await ensurePlatformTenantWithFirmaWorkspace(client as never);

    expect(first.created).toBe(false);
    expect(second.created).toBe(false);
    expect(first.tenantId).toBe("tenant-braas-hr");
    expect(second.tenantId).toBe("tenant-braas-hr");
    expect(provisionFirmaWorkspaceForTenant).toHaveBeenCalledTimes(2);
    expect(client.rpc).not.toHaveBeenCalled();
  });
});

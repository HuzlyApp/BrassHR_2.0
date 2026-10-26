import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  userId: "user-new",
  email: "admin@newco.example",
}));

const insertPayload = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
const categoryWrites = vi.hoisted(() => ({ current: [] as Record<string, unknown>[] }));

const provisionMock = vi.hoisted(() =>
  vi.fn(async () => ({
    status: "created" as const,
    workspaceId: "3b9e2ce8-22f1-4a48-9564-80245d73a21b",
    message: undefined,
  }))
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: { id: authState.userId, email: authState.email },
        },
      }),
    },
  })),
}));

vi.mock("@/lib/vercel", () => ({
  registerTenantDomain: vi.fn(async () => ({ skipped: true })),
}));

vi.mock("@/lib/firma/provision-tenant-workspace", () => ({
  provisionFirmaWorkspaceForTenant: (...args: unknown[]) => provisionMock(...args),
}));

vi.mock("@/lib/tenant/resolve-business-info-context", () => ({
  resolveBusinessInfoValidationContext: vi.fn(async () => ({
    stateCode: "CA",
    allowedStateNames: ["California"],
    allowedCityNames: ["Los Angeles"],
  })),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "tenants") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            insertPayload.current = row;
            return {
              select: () => ({
                single: async () => ({
                  data: {
                    id: "tenant-new-1",
                    name: row.name,
                    slug: row.slug,
                    subdomain: row.subdomain,
                    domain: row.domain,
                  },
                  error: null,
                }),
              }),
            };
          },
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
              ilike: () => ({
                neq: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
          upsert: async () => ({ error: null }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }
      if (table === "tenant_categories") {
        return {
          upsert: (row: Record<string, unknown>) => {
            categoryWrites.current.push(row);
            return {
              select: () => ({
                single: async () => ({ data: { category: row.category }, error: null }),
              }),
            };
          },
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { category: "Staffing" }, error: null }),
            }),
          }),
        };
      }
      if (table === "tenant_hiring_areas") {
        return { upsert: async () => ({ error: null }) };
      }
      if (table === "user_roles") {
        return { upsert: async () => ({ error: null }) };
      }
      throw new Error(`Unexpected table ${table}`);
    },
    rpc: async () => ({ error: null }),
    auth: {
      admin: {
        listUsers: async () => ({
          data: { users: [{ id: authState.userId, email: authState.email }] },
          error: null,
        }),
        updateUserById: async () => ({ error: null }),
        createUser: async () => ({
          data: { user: { id: authState.userId } },
          error: null,
        }),
      },
    },
  })),
}));

async function completeTenant(body: Record<string, unknown> = {}) {
  const { POST } = await import("@/app/api/tenant-onboarding/complete/route");
  return POST(
    new Request("http://localhost/api/tenant-onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationName: "Testy",
        subdomain: "workspacetesty",
        adminEmail: authState.email,
        industry: "Healthcare",
        companySize: "1-10",
        state: "California",
        city: "Los Angeles",
        address: "123 Main St",
        phone: "2135550198",
        email: authState.email,
        zipCode: "90012",
        ...body,
      }),
    })
  );
}

describe("tenant-onboarding complete route", () => {
  const originalRootDomain = process.env.ROOT_DOMAIN;
  const originalApiKey = process.env.FIRMA_API_KEY;

  beforeEach(() => {
    insertPayload.current = null;
    categoryWrites.current = [];
    process.env.ROOT_DOMAIN = "braashr.test";
    process.env.FIRMA_API_KEY = "firma_test_key";
    provisionMock.mockReset();
    provisionMock.mockResolvedValue({
      status: "created",
      workspaceId: "3b9e2ce8-22f1-4a48-9564-80245d73a21b",
    });
  });

  afterEach(() => {
    process.env.ROOT_DOMAIN = originalRootDomain;
    process.env.FIRMA_API_KEY = originalApiKey;
    vi.clearAllMocks();
  });

  it("creates tenant and returns created Firma workspace provisioning result", async () => {
    const response = await completeTenant();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(provisionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-new-1",
        tenantName: "Testy",
        tenantSlug: "workspacetesty",
      })
    );
    expect(body.firmaProvisioning).toEqual({
      status: "created",
      workspaceId: "3b9e2ce8-22f1-4a48-9564-80245d73a21b",
      message: null,
    });
    expect(body.category).toBe("Staffing");
    expect(categoryWrites.current).toEqual([
      expect.objectContaining({ tenant_id: "tenant-new-1", category: "Staffing" }),
    ]);
    expect(JSON.stringify(body)).not.toMatch(/api_key/);
    expect(JSON.stringify(body)).not.toMatch(/firma_test_key/);
  });

  it("still succeeds when Firma provisioning fails", async () => {
    provisionMock.mockResolvedValue({
      status: "failed",
      workspaceId: null,
      message: "Tenant was created, but e-signature workspace creation failed. You can retry in Account Settings.",
    });

    const response = await completeTenant();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.firmaProvisioning.status).toBe("failed");
    expect(body.firmaProvisioning.workspaceId).toBeNull();
  });

  it("creates tenant when business info was skipped", async () => {
    const response = await completeTenant({
      organizationName: "",
      businessInfoSkipped: true,
      industry: "",
      companySize: "",
      state: "",
      city: "",
      address: "",
      phone: "",
      email: "",
      zipCode: "",
      ein: "",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(insertPayload.current?.name).toBe("Workspacetesty");
  });

  it("creates tenant when business step was skipped with leftover invalid phone", async () => {
    const response = await completeTenant({
      organizationName: "",
      businessInfoSkipped: true,
      industry: "",
      companySize: "",
      state: "",
      city: "",
      address: "",
      phone: "1111111111",
      email: "",
      zipCode: "90210",
      ein: "",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(insertPayload.current?.phone).toBe("");
    expect(insertPayload.current?.postal_code).toBe("");
  });

  it("assigns SMB only for the tenant being created", async () => {
    const response = await completeTenant({ category: "SMB" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.category).toBe("SMB");
    expect(categoryWrites.current).toHaveLength(1);
    expect(categoryWrites.current[0]).toMatchObject({
      tenant_id: "tenant-new-1",
      category: "SMB",
    });
  });

  it("rejects an unknown category before creating a tenant", async () => {
    const response = await completeTenant({ category: "Enterprise" });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Staffing or SMB/);
    expect(insertPayload.current).toBeNull();
    expect(categoryWrites.current).toEqual([]);
  });
});

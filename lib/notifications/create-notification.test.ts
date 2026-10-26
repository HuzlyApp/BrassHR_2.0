import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/cache", () => ({
  invalidateUserCache: vi.fn(async () => undefined),
}));

vi.mock("@/lib/supabase-env", () => ({
  getSupabaseUrl: () => "",
}));

vi.mock("@/lib/auth/app-role", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/app-role")>("@/lib/auth/app-role");
  return actual;
});

import {
  createNotification,
  listTenantStaffUserIds,
  supportTicketApplicantLink,
  supportTicketStaffLink,
} from "@/lib/notifications/create-notification";

describe("create-notification", () => {
  beforeEach(() => {
    insertMock.mockReset();
    fromMock.mockReset();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  });

  it("builds staff and applicant ticket deep links", () => {
    expect(supportTicketStaffLink("abc-123")).toBe(
      "/admin_recruiter/messages?tab=support&ticket=abc-123"
    );
    expect(supportTicketApplicantLink("abc-123")).toBe(
      "/application/applicant-dashboard/tickets?ticket=abc-123"
    );
  });

  it("skips create when title or ids are missing", async () => {
    const supabase = { from: fromMock } as never;
    const result = await createNotification(supabase, {
      tenantId: "",
      userId: "u1",
      type: "support_ticket_created",
      title: "New support ticket",
    });
    expect(result).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("inserts a notification with is_read false and link", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "n1",
        tenant_id: "t1",
        user_id: "u1",
        type: "support_ticket_created",
        title: "New support ticket",
        body: "Subject",
        link: "/admin_recruiter/messages?tab=support&ticket=tix",
        is_read: false,
        sent_at: "2026-08-25T00:00:00.000Z",
      },
      error: null,
    });
    const select = vi.fn(() => ({ maybeSingle }));
    insertMock.mockReturnValue({ select });
    fromMock.mockReturnValue({ insert: insertMock });

    const result = await createNotification({ from: fromMock } as never, {
      tenantId: "t1",
      userId: "u1",
      type: "support_ticket_created",
      title: "New support ticket",
      body: "Subject",
      link: "/admin_recruiter/messages?tab=support&ticket=tix",
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "t1",
        user_id: "u1",
        is_read: false,
        link: "/admin_recruiter/messages?tab=support&ticket=tix",
      })
    );
    expect(result?.id).toBe("n1");
  });

  it("lists tenant staff ids excluding provided users", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "staff_roles") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [
                  {
                    key: "recruiter",
                    label: "Recruiter",
                    storage_key: "client",
                    aliases: [],
                    is_admin: false,
                    is_staff: true,
                    is_assignable: true,
                    sort_order: 20,
                  },
                  {
                    key: "admin",
                    label: "Admin",
                    storage_key: "admin",
                    aliases: ["owner"],
                    is_admin: true,
                    is_staff: true,
                    is_assignable: true,
                    sort_order: 60,
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({
                data: [
                  { id: "admin-1", role: "admin" },
                  { id: "client-1", role: "client" },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            in: async () => ({
              data: [{ user_id: "admin-2", role: "admin" }],
              error: null,
            }),
          }),
        }),
      };
    });

    const ids = await listTenantStaffUserIds({ from: fromMock } as never, "t1", ["admin-1"]);
    expect(ids).toContain("client-1");
    expect(ids).toContain("admin-2");
    expect(ids).not.toContain("admin-1");
    expect(ids).not.toContain("worker-1");
  });
});

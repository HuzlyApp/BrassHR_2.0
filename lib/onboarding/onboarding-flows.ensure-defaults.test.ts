import { beforeEach, describe, expect, it, vi } from "vitest";

const workflowTemplateDraft = vi.fn();
const replaceFlowStepsFromDraft = vi.fn();
const loadFlowBuilderDraft = vi.fn();

vi.mock("@/lib/onboarding/workflow-templates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/onboarding/workflow-templates")>();
  return {
    ...actual,
    workflowTemplateDraft: (...args: unknown[]) => workflowTemplateDraft(...args),
  };
});

vi.mock("@/lib/onboarding/flow-steps-sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/onboarding/flow-steps-sync")>();
  return {
    ...actual,
    replaceFlowStepsFromDraft: (...args: unknown[]) => replaceFlowStepsFromDraft(...args),
    loadFlowBuilderDraft: (...args: unknown[]) => loadFlowBuilderDraft(...args),
  };
});

vi.mock("@/lib/onboarding/onboarding-libraries", () => ({
  resolveOnboardingLibraryForFlows: vi.fn(async () => ({
    id: "library-1",
    name: "Onboarding",
    slug: "onboarding",
  })),
}));

import {
  DEFAULT_1099_FLOW_NAME,
  DEFAULT_1099_PRESET_NAME,
  DEFAULT_ONBOARDING_FLOW_NAME,
  DEFAULT_RNR_FLOW_NAME,
  DEFAULT_RNR_PRESET_NAME,
  DEFAULT_W2_FLOW_NAME,
  DEFAULT_W2_PRESET_NAME,
  ensureDefaultTenantOnboardingFlows,
} from "@/lib/onboarding/onboarding-flows";

type InsertCall = { table: string; payload: Record<string, unknown> };

type FlowRow = {
  id: string;
  name: string;
  status: string;
  tenant_id?: string;
  library_id?: string;
  template_id?: string | null;
  created_as_blank?: boolean;
  builder_draft?: { nodes: unknown[]; edges: unknown[] };
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

function fullFlowRow(partial: FlowRow): FlowRow {
  return {
    tenant_id: "tenant-1",
    library_id: "library-1",
    template_id: null,
    created_as_blank: false,
    builder_draft: { nodes: [{ id: "n1" }], edges: [] },
    created_by: null,
    updated_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

function createEmptyLibrarySupabase(options?: {
  existingFlowCount?: number;
  existingFlows?: FlowRow[];
  presets?: Record<string, { id: string; name: string; employment_type: string }>;
}) {
  const existingFlowCount = options?.existingFlowCount ?? 0;
  const flows: FlowRow[] = (options?.existingFlows ?? []).map(fullFlowRow);
  const presets = options?.presets ?? {
    [DEFAULT_W2_PRESET_NAME]: {
      id: "preset-w2",
      name: DEFAULT_W2_PRESET_NAME,
      employment_type: "W2",
    },
    [DEFAULT_1099_PRESET_NAME]: {
      id: "preset-1099",
      name: DEFAULT_1099_PRESET_NAME,
      employment_type: "1099",
    },
  };
  const inserts: InsertCall[] = [];
  let flowInsertSeq = 0;

  const from = vi.fn((table: string) => {
    if (table === "onboarding_flows") {
      return {
        select: vi.fn((cols: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.count === "exact" || opts?.head === true) {
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ count: existingFlowCount, error: null })),
              })),
            };
          }

          const filters: Record<string, string> = {};
          const api = {
            eq: vi.fn((col: string, value: string) => {
              filters[col] = value;
              return api;
            }),
            maybeSingle: vi.fn(async () => {
              let rows = [...flows];
              if (filters.tenant_id) {
                rows = rows.filter((f) => f.tenant_id === filters.tenant_id);
              }
              if (filters.id) {
                rows = rows.filter((f) => f.id === filters.id);
              }
              return { data: rows[0] ?? null, error: null };
            }),
            then: undefined as unknown,
          };
          // Bare .eq("tenant_id") used by findOnboardingFlowRowByName (awaits the chain)
          const listApi = {
            eq: vi.fn(async (_col: string, _value: string) => ({
              data: flows,
              error: null,
            })),
          };

          // Prefer list-style when no id filter will be applied: both patterns start with .eq
          // Support both by making eq return an object that is thenable AND has eq/maybeSingle.
          const dual: {
            eq: ReturnType<typeof vi.fn>;
            maybeSingle: ReturnType<typeof vi.fn>;
            then?: (
              resolve: (value: { data: FlowRow[]; error: null }) => unknown
            ) => unknown;
          } = {
            eq: vi.fn((col: string, value: string) => {
              filters[col] = value;
              return dual;
            }),
            maybeSingle: vi.fn(async () => {
              let rows = [...flows];
              if (filters.tenant_id) {
                rows = rows.filter((f) => f.tenant_id === filters.tenant_id);
              }
              if (filters.id) {
                rows = rows.filter((f) => f.id === filters.id);
              }
              return { data: rows[0] ?? null, error: null };
            }),
            then: (resolve) => resolve({ data: flows, error: null }),
          };
          // When awaited directly after one .eq (find by tenant), return all flows.
          // Override then to only apply when maybeSingle wasn't the intent — Vitest awaits
          // thenable. findOnboardingFlowRowByName does: await supabase.from().select().eq()
          void listApi;
          return dual;
        }),
        insert: vi.fn((payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          flowInsertSeq += 1;
          const id = `flow-${flowInsertSeq}`;
          const row = fullFlowRow({
            id,
            name: String(payload.name),
            status: String(payload.status),
            builder_draft: payload.builder_draft as FlowRow["builder_draft"],
          });
          flows.push(row);
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id }, error: null })),
            })),
          };
        }),
      };
    }

    if (table === "onboarding_templates") {
      const filters: Record<string, string> = {};
      const api = {
        select: vi.fn(() => api),
        eq: vi.fn((col: string, value: string) => {
          filters[col] = value;
          return api;
        }),
        maybeSingle: vi.fn(async () => {
          const name = filters.name;
          const row = name ? presets[name] : null;
          if (!row) return { data: null, error: null };
          return {
            data: {
              ...row,
              tenant_id: null,
              type: "preset",
              status: "published",
              builder_draft: { nodes: [{ id: "n1", data: { label: row.name } }], edges: [] },
              description: null,
              template_type: "default",
              is_system_preset: true,
              is_editable: false,
              version: 1,
              flow_name: row.name,
              created_by: null,
              updated_by: null,
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
            error: null,
          };
        }),
        then: (
          resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown
        ) =>
          resolve({
            data: Object.values(presets)
              .filter((row) => !filters.employment_type || row.employment_type === filters.employment_type)
              .map((row) => ({
                ...row,
                industry_key: null,
                tenant_id: null,
                type: "preset",
                status: "published",
                builder_draft: { nodes: [{ id: "n1", data: { label: row.name } }], edges: [] },
                description: null,
                template_type: "default",
                is_system_preset: true,
                is_editable: false,
                version: 1,
                flow_name: row.name,
                created_by: null,
                updated_by: null,
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
              })),
            error: null,
          }),
      };
      return api;
    }

    if (table === "tenants") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { primary_industry_key: null }, error: null }),
          }),
        }),
      };
    }

    throw new Error(`Unexpected table ${table}`);
  });

  return { from, inserts };
}

describe("ensureDefaultTenantOnboardingFlows", () => {
  beforeEach(() => {
    workflowTemplateDraft.mockReset();
    replaceFlowStepsFromDraft.mockReset();
    loadFlowBuilderDraft.mockReset();
    workflowTemplateDraft.mockImplementation(async (_sb: unknown, row: { name: string }) => ({
      nodes: [{ id: `node-${row.name}`, data: { label: row.name } }],
      edges: [],
    }));
    replaceFlowStepsFromDraft.mockResolvedValue(undefined);
    loadFlowBuilderDraft.mockImplementation(
      async (_sb: unknown, _id: string, draft: unknown) => draft
    );
  });

  it("seeds Worker Onboarding plus W2 and 1099 when the library is empty", async () => {
    const supabase = createEmptyLibrarySupabase();
    await ensureDefaultTenantOnboardingFlows(supabase as never, "tenant-1", "library-1", "user-1");

    expect(supabase.inserts).toHaveLength(3);
    expect(supabase.inserts.map((row) => row.payload.name)).toEqual([
      DEFAULT_ONBOARDING_FLOW_NAME,
      DEFAULT_W2_FLOW_NAME,
      DEFAULT_1099_FLOW_NAME,
    ]);
    expect(supabase.inserts[0]?.payload).toEqual(
      expect.objectContaining({
        tenant_id: "tenant-1",
        library_id: "library-1",
        name: DEFAULT_ONBOARDING_FLOW_NAME,
        status: "published",
        sort_order: 1,
        created_by: "user-1",
      })
    );
    expect(replaceFlowStepsFromDraft).toHaveBeenCalled();
  });

  it("seeds the RNR flow when the RNR preset exists on an empty library", async () => {
    const supabase = createEmptyLibrarySupabase({
      presets: {
        [DEFAULT_W2_PRESET_NAME]: {
          id: "preset-w2",
          name: DEFAULT_W2_PRESET_NAME,
          employment_type: "W2",
        },
        [DEFAULT_1099_PRESET_NAME]: {
          id: "preset-1099",
          name: DEFAULT_1099_PRESET_NAME,
          employment_type: "1099",
        },
        [DEFAULT_RNR_PRESET_NAME]: {
          id: "preset-rnr",
          name: DEFAULT_RNR_PRESET_NAME,
          employment_type: "RNR",
        },
      },
    });
    await ensureDefaultTenantOnboardingFlows(supabase as never, "tenant-1", "library-1", "user-1");

    expect(supabase.inserts.map((row) => row.payload.name)).toEqual([
      DEFAULT_ONBOARDING_FLOW_NAME,
      DEFAULT_W2_FLOW_NAME,
      DEFAULT_1099_FLOW_NAME,
      DEFAULT_RNR_FLOW_NAME,
    ]);
    expect(supabase.inserts[3]?.payload).toEqual(
      expect.objectContaining({
        name: DEFAULT_RNR_FLOW_NAME,
        employment_type: "RNR",
        status: "published",
      })
    );
  });

  it("adds a missing RNR flow when other employment flows already exist", async () => {
    const supabase = createEmptyLibrarySupabase({
      existingFlowCount: 3,
      existingFlows: [
        { id: "flow-worker", name: DEFAULT_ONBOARDING_FLOW_NAME, status: "published" },
        { id: "flow-w2", name: DEFAULT_W2_FLOW_NAME, status: "published" },
        { id: "flow-1099", name: DEFAULT_1099_FLOW_NAME, status: "published" },
      ],
      presets: {
        [DEFAULT_W2_PRESET_NAME]: {
          id: "preset-w2",
          name: DEFAULT_W2_PRESET_NAME,
          employment_type: "W2",
        },
        [DEFAULT_1099_PRESET_NAME]: {
          id: "preset-1099",
          name: DEFAULT_1099_PRESET_NAME,
          employment_type: "1099",
        },
        [DEFAULT_RNR_PRESET_NAME]: {
          id: "preset-rnr",
          name: DEFAULT_RNR_PRESET_NAME,
          employment_type: "RNR",
        },
      },
    });
    await ensureDefaultTenantOnboardingFlows(supabase as never, "tenant-1", "library-1");

    expect(supabase.inserts.map((row) => row.payload.name)).toEqual([DEFAULT_RNR_FLOW_NAME]);
  });

  it("ensures Worker Onboarding when the library already has other flows", async () => {
    const supabase = createEmptyLibrarySupabase({
      existingFlowCount: 2,
      existingFlows: [
        { id: "flow-w2", name: DEFAULT_W2_FLOW_NAME, status: "published" },
        { id: "flow-1099", name: DEFAULT_1099_FLOW_NAME, status: "published" },
      ],
    });
    await ensureDefaultTenantOnboardingFlows(supabase as never, "tenant-1", "library-1");

    expect(supabase.inserts).toHaveLength(1);
    expect(supabase.inserts[0]?.payload.name).toBe(DEFAULT_ONBOARDING_FLOW_NAME);
  });

  it("no-ops create when Worker Onboarding already exists among other flows", async () => {
    const supabase = createEmptyLibrarySupabase({
      existingFlowCount: 3,
      existingFlows: [
        { id: "flow-worker", name: DEFAULT_ONBOARDING_FLOW_NAME, status: "published" },
        { id: "flow-w2", name: DEFAULT_W2_FLOW_NAME, status: "published" },
        { id: "flow-1099", name: DEFAULT_1099_FLOW_NAME, status: "published" },
      ],
    });
    await ensureDefaultTenantOnboardingFlows(supabase as never, "tenant-1", "library-1");
    expect(supabase.inserts).toHaveLength(0);
  });

  it("throws when a required system preset is missing on empty library", async () => {
    const supabase = createEmptyLibrarySupabase({
      presets: {
        [DEFAULT_W2_PRESET_NAME]: {
          id: "preset-w2",
          name: DEFAULT_W2_PRESET_NAME,
          employment_type: "W2",
        },
      },
    });

    await expect(
      ensureDefaultTenantOnboardingFlows(supabase as never, "tenant-1", "library-1")
    ).rejects.toThrow(/Default 1099 Contractor Workflow/);
  });
});

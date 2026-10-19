import { describe, expect, it } from "vitest";
import {
  listCatalogProfessionChoices,
  resolveFlowProfessionId,
} from "@/lib/professions/service";

type Row = Record<string, unknown>;

function supabaseMock(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const filters: Array<[string, unknown]> = [];
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return query;
        },
        ilike(column: string, value: unknown) {
          filters.push([column, String(value).toLowerCase()]);
          return query;
        },
        order() {
          return query;
        },
        maybeSingle: async () => {
          const match = rows.find((row) =>
            filters.every(([column, value]) => {
              const cell = row[column];
              return String(cell ?? "").toLowerCase() === String(value ?? "").toLowerCase();
            })
          );
          return { data: match ?? null, error: null };
        },
        then(resolve: (value: { data: Row[]; error: null }) => void) {
          const match = rows.filter((row) =>
            filters.every(([column, value]) => String(row[column] ?? "") === String(value ?? ""))
          );
          resolve({ data: match, error: null });
        },
      };
      return query;
    },
  };
}

const catalog = [
  { key: "nursing", name: "Nursing", industry_key: "healthcare", is_active: true },
  { key: "it_support", name: "IT Support", industry_key: "technology", is_active: true },
];

describe("flow profession choices", () => {
  it("lists the catalog and keeps the tenant id for professions already added", async () => {
    const supabase = supabaseMock({
      profession_catalog: catalog,
      tenant_professions: [
        {
          id: "tenant-nursing",
          tenant_id: "tenant-1",
          name: "Nursing",
          catalog_key: "nursing",
          is_active: true,
        },
      ],
    });

    const choices = await listCatalogProfessionChoices(supabase as never, "tenant-1");
    expect(choices.map((choice) => [choice.key, choice.professionId])).toEqual([
      ["nursing", "tenant-nursing"],
      ["it_support", null],
    ]);
  });

  it("reuses an existing tenant profession when the flow picker sends its catalog key", async () => {
    const supabase = supabaseMock({
      profession_catalog: catalog,
      tenant_professions: [
        {
          id: "tenant-nursing",
          tenant_id: "tenant-1",
          name: "Nursing",
          catalog_key: "nursing",
          is_active: true,
        },
      ],
    });

    await expect(resolveFlowProfessionId(supabase as never, "tenant-1", "nursing")).resolves.toBe(
      "tenant-nursing"
    );
  });
});

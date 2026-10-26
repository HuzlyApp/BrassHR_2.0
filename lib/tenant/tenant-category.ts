import type { SupabaseClient } from "@supabase/supabase-js";

export const TENANT_CATEGORIES = ["Staffing", "SMB"] as const;

export type TenantCategory = (typeof TENANT_CATEGORIES)[number];

export const DEFAULT_TENANT_CATEGORY: TenantCategory = "Staffing";

/** Accepts the canonical labels, ignoring surrounding space and letter case. */
export function parseTenantCategory(value: unknown): TenantCategory | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return TENANT_CATEGORIES.find((category) => category.toLowerCase() === normalized) ?? null;
}

export async function getTenantCategory(
  supabase: SupabaseClient,
  tenantId: string
): Promise<TenantCategory> {
  const { data, error } = await supabase
    .from("tenant_categories")
    .select("category")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw error;
  return parseTenantCategory(data?.category) ?? DEFAULT_TENANT_CATEGORY;
}

/**
 * Writes this tenant's category. Omitted category stays Staffing.
 * The upsert is scoped to the given tenant id.
 */
export async function assignTenantCategory(
  supabase: SupabaseClient,
  tenantId: string,
  category: TenantCategory = DEFAULT_TENANT_CATEGORY
): Promise<TenantCategory> {
  const { data, error } = await supabase
    .from("tenant_categories")
    .upsert(
      {
        tenant_id: tenantId,
        category,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" }
    )
    .select("category")
    .single();

  if (error) throw error;
  return parseTenantCategory(data?.category) ?? category;
}

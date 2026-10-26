import type { OnboardingDbClient } from "@/lib/onboarding/load-tenant-config";
import type { WorkflowStepLibraryCategory, WorkflowStepLibraryItem } from "@/lib/onboarding/workflow-step-library-data";

export type OnboardingStepLibraryRow = {
  id: string;
  tenant_id: string | null;
  category_id: string;
  category_label: string;
  step_key: string;
  step_type: string;
  title: string;
  description: string | null;
  icon_key: string;
  color: string | null;
  default_settings: Record<string, unknown> | null;
  is_active: boolean;
  sort_order: number;
};

export async function loadOnboardingStepLibrary(
  supabase: OnboardingDbClient,
  tenantId: string
): Promise<WorkflowStepLibraryCategory[]> {
  const { data, error } = await supabase
    .from("onboarding_step_library")
    .select(
      "id, tenant_id, category_id, category_label, step_key, step_type, title, description, icon_key, color, default_settings, is_active, sort_order"
    )
    .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
    .eq("is_active", true)
    .order("category_id", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as OnboardingStepLibraryRow[];
  const byCategory = new Map<string, WorkflowStepLibraryCategory>();

  for (const row of rows) {
    const tenantScoped = row.tenant_id === tenantId;
    const global = row.tenant_id === null;
    if (!tenantScoped && !global) continue;

    let category = byCategory.get(row.category_id);
    if (!category) {
      category = { id: row.category_id, label: row.category_label, steps: [] };
      byCategory.set(row.category_id, category);
    }

    const existingIndex = category.steps.findIndex((s) => s.id === row.step_key);
    const rawPhase = row.default_settings?.phase;
    const defaultPhase: WorkflowStepLibraryItem["defaultPhase"] =
      rawPhase === "pre_hire" || rawPhase === "transition" || rawPhase === "post_hire"
        ? rawPhase
        : undefined;
    const item = {
      id: row.step_key,
      label: row.title,
      iconKey: row.icon_key,
      description: row.description ?? undefined,
      stepType: row.step_type as WorkflowStepLibraryCategory["steps"][number]["stepType"],
      defaultPhase,
    };

    if (existingIndex >= 0) {
      if (tenantScoped) category.steps[existingIndex] = item;
    } else {
      category.steps.push(item);
    }
  }

  const categoryOrder = (category: WorkflowStepLibraryCategory) => {
    const values = rows
      .filter(
        (entry) =>
          entry.category_id === category.id &&
          (entry.tenant_id === null || entry.tenant_id === tenantId)
      )
      .map((entry) => Number(entry.default_settings?.categoryOrder))
      .filter((value) => Number.isFinite(value));
    return values.length > 0 ? Math.min(...values) : 1000;
  };

  return Array.from(byCategory.values())
    .map((category) => ({
      ...category,
      steps: [...category.steps].sort((a, b) => {
        const aOrder = rows.find((entry) => entry.step_key === a.id)?.sort_order ?? 0;
        const bOrder = rows.find((entry) => entry.step_key === b.id)?.sort_order ?? 0;
        return aOrder - bOrder;
      }),
    }))
    .sort((a, b) => categoryOrder(a) - categoryOrder(b) || a.label.localeCompare(b.label));
}

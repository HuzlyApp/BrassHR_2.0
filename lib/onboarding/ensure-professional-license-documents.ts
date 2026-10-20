import type { OnboardingDbClient } from "@/lib/onboarding/load-tenant-config";
import type { TenantOnboardingStep } from "@/lib/onboarding/types";

export const DEFAULT_PROFESSIONAL_LICENSE_DOCUMENTS = [
  {
    title: "Nursing License",
    description: "Front and back if applicable",
    sort_order: 10,
  },
  {
    title: "TB Test",
    description: "Within the last 12 months",
    sort_order: 20,
  },
  {
    title: "CPR Certifications",
    description: null as string | null,
    sort_order: 30,
  },
] as const;

function isProfessionalLicenseStep(step: TenantOnboardingStep): boolean {
  return step.step_type === "professional_license" || step.step_type === "document_upload";
}

function defaultDocumentsForStep(step: TenantOnboardingStep) {
  if (step.step_type === "document_upload") {
    return [
      {
        title: "Extra File",
        description: "Upload any additional intake document required for this job.",
        sort_order: 10,
      },
    ] as const;
  }
  return DEFAULT_PROFESSIONAL_LICENSE_DOCUMENTS;
}

/**
 * Ensures default upload slots exist for professional-license steps that have none yet.
 * Returns true when any rows were inserted.
 */
export async function ensureProfessionalLicenseRequiredDocuments(
  supabase: OnboardingDbClient,
  tenantId: string,
  steps: TenantOnboardingStep[]
): Promise<boolean> {
  const licenseSteps = steps.filter(isProfessionalLicenseStep);
  if (!licenseSteps.length) return false;

  let changed = false;

  for (const step of licenseSteps) {
    const { count, error: countErr } = await supabase
      .from("tenant_required_documents")
      .select("id", { count: "exact", head: true })
      .eq("onboarding_step_id", step.id);

    if (countErr) throw countErr;
    if ((count ?? 0) > 0) continue;

    const defaults = defaultDocumentsForStep(step);
    const { error: insertErr } = await supabase.from("tenant_required_documents").insert(
      defaults.map((doc) => ({
        tenant_id: tenantId,
        onboarding_step_id: step.id,
        title: doc.title,
        description: doc.description,
        is_required: true,
        sort_order: doc.sort_order,
      }))
    );

    if (insertErr) throw insertErr;
    changed = true;
  }

  return changed;
}

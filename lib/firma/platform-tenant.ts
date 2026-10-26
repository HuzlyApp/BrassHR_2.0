import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assignTenantCategory, DEFAULT_TENANT_CATEGORY } from "@/lib/tenant/tenant-category";
import { PLATFORM_DEFAULT_TENANT_SLUG } from "@/lib/tenant/tenant-branding";
import {
  provisionFirmaWorkspaceForTenant,
  type FirmaWorkspaceProvisioningResult,
} from "@/lib/firma/provision-tenant-workspace";

export const PLATFORM_TENANT_SEED = {
  name: "Brass HR",
  slug: PLATFORM_DEFAULT_TENANT_SLUG,
  plan: "platform",
  is_active: true,
  logo_url: "/icons/braas-HR/BrassHR-logo.svg",
  primary_color: "#BC8B41",
  secondary_color: "#104b83",
  accent_color: "#E9B771",
  welcome_headline: "Welcome to Brass HR",
  welcome_subtitle: "HR Simplified for growing teams",
  auth_background_image_url: "/images/singup-bg-image.jpg",
} as const;

export type EnsuredPlatformTenant = {
  tenantId: string;
  created: boolean;
  firmaProvisioning: FirmaWorkspaceProvisioningResult;
};

type PlatformTenantRow = {
  id: string;
  name: string | null;
  slug: string | null;
  subdomain: string | null;
};

async function loadPlatformTenant(
  supabase: SupabaseClient
): Promise<PlatformTenantRow | null> {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, slug, subdomain")
    .eq("slug", PLATFORM_TENANT_SEED.slug)
    .maybeSingle();
  if (error) throw error;
  return (data as PlatformTenantRow | null) ?? null;
}

/**
 * Ensures the Brass HR platform tenant exists and has a live Firma workspace.
 * SQL seed/bootstrap never called Firma; this closes that gap and is idempotent.
 */
export async function ensurePlatformTenantWithFirmaWorkspace(
  supabase: SupabaseClient,
  options?: { knownExistingWorkspaceIds?: ReadonlySet<string> }
): Promise<EnsuredPlatformTenant> {
  let tenant = await loadPlatformTenant(supabase);
  let created = false;

  if (!tenant?.id) {
    const { data, error } = await supabase
      .from("tenants")
      .insert({
        ...PLATFORM_TENANT_SEED,
        subdomain: PLATFORM_TENANT_SEED.slug,
        updated_at: new Date().toISOString(),
      })
      .select("id, name, slug, subdomain")
      .single();

    if (error?.code === "23505") {
      tenant = await loadPlatformTenant(supabase);
    } else if (error || !data?.id) {
      throw new Error(error?.message || "Could not create the Brass HR platform tenant");
    } else {
      tenant = data as PlatformTenantRow;
      created = true;
      await assignTenantCategory(supabase, tenant.id, DEFAULT_TENANT_CATEGORY);
      const { error: seedErr } = await supabase.rpc("seed_default_tenant_onboarding", {
        p_tenant_id: tenant.id,
      });
      if (seedErr) {
        console.error("[firma-provision] platform tenant onboarding seed failed", {
          tenantId: tenant.id,
          error: seedErr.message,
        });
      }
    }
  }

  if (!tenant?.id) {
    throw new Error("Brass HR platform tenant was not found after upsert");
  }

  console.info("[firma-provision] platform tenant ready", {
    tenantId: tenant.id,
    created,
  });

  const firmaProvisioning = await provisionFirmaWorkspaceForTenant({
    supabase,
    tenantId: tenant.id,
    tenantName: tenant.name || PLATFORM_TENANT_SEED.name,
    tenantSlug: tenant.subdomain ?? tenant.slug ?? PLATFORM_TENANT_SEED.slug,
    knownExistingWorkspaceIds: options?.knownExistingWorkspaceIds,
  });

  return {
    tenantId: tenant.id,
    created,
    firmaProvisioning,
  };
}

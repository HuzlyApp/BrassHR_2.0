import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { provisionFirmaWorkspaceForTenant } from "@/lib/firma/provision-tenant-workspace";
import type { FirmaWorkspaceProvisioningStatus } from "@/lib/firma/provision-tenant-workspace";
import {
  firstBusinessInfoError,
  isBusinessInfoValid,
  normalizeBusinessInfoBody,
  resolveTenantDisplayName,
  validateBusinessInfoForm,
} from "@/lib/tenant/business-info-validation";
import { validateTenantSubdomainInput, subdomainErrorMessage } from "@/lib/tenant/subdomain-validation";
import { registerTenantDomain } from "@/lib/vercel";
import { resolveBusinessInfoValidationContext } from "@/lib/tenant/resolve-business-info-context";
import {
  findStaffTenantEmailConflict,
  normalizeTenantEmail,
  TENANT_EMAIL_TAKEN_MESSAGE,
} from "@/lib/tenant/tenant-email-uniqueness";
import { normalizeBrandingFontId } from "@/lib/tenant/tenant-branding";
import {
  assignTenantCategory,
  DEFAULT_TENANT_CATEGORY,
  getTenantCategory,
  parseTenantCategory,
  type TenantCategory,
} from "@/lib/tenant/tenant-category";

type Body = {
  organizationName?: string;
  subdomain?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  welcomeHeadline?: string | null;
  welcomeSubtitle?: string | null;
  authBackgroundImageUrl?: string | null;
  primaryFont?: string | null;
  headingFont?: string | null;
  bodyFont?: string | null;
  fontColor?: string | null;
  headingColor?: string | null;
  mutedTextColor?: string | null;
  adminEmail?: string;
  adminPassword?: string;
  industry?: string;
  companySize?: string;
  city?: string;
  state?: string;
  address?: string;
  phone?: string;
  email?: string;
  zipCode?: string;
  ein?: string;
  industryKeys?: string[];
  /** When true, business information step was skipped — fields are optional. */
  businessInfoSkipped?: boolean;
  /** Omitted values stay Staffing. SMB must be sent explicitly. */
  category?: string | null;
};

/**
 * Registers a tenant + creates the initial admin recruiter (requires service role server-side).
 */
export async function POST(req: Request) {
  const svc = createServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server not configured" }, { status: 503 });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const org = String(body.organizationName ?? "").trim();
  const adminEmail = String(body.adminEmail ?? "").trim().toLowerCase();
  const adminPassword = String(body.adminPassword ?? "");
  const rootDomain = process.env.ROOT_DOMAIN?.trim().toLowerCase();
  if (!rootDomain) {
    return NextResponse.json({ error: "ROOT_DOMAIN is not configured on the server." }, { status: 503 });
  }

  const subRaw = String(body.subdomain ?? "").trim().toLowerCase();
  const subParsed = validateTenantSubdomainInput(subRaw);
  if ("failure" in subParsed) {
    return NextResponse.json(
      { error: subdomainErrorMessage(subParsed.failure), code: subParsed.failure },
      { status: 400 }
    );
  }

  const subdomainFinal = subParsed.subdomain;
  const domainFinal = `${subdomainFinal}.${rootDomain}`;
  const slugFinal = subdomainFinal;

  const authClient = await createClient();
  const {
    data: { user: sessionUser },
  } = await authClient.auth.getUser();
  const sessionUserId = sessionUser?.id;
  const sessionEmail = sessionUser?.email?.trim().toLowerCase() ?? "";

  if (sessionUserId && sessionEmail && adminEmail && adminEmail !== sessionEmail) {
    return NextResponse.json(
      { error: "Admin email must match your signed-in account." },
      { status: 403 }
    );
  }

  const effectiveAdminEmail = normalizeTenantEmail(sessionEmail || adminEmail);

  if (!effectiveAdminEmail.includes("@")) {
    return NextResponse.json({ error: "A valid admin email is required." }, { status: 400 });
  }

  const businessInput = normalizeBusinessInfoBody({
    ...body,
    companyName: org,
    organizationName: org,
  });
  const businessInfoSkipped = body.businessInfoSkipped === true;
  const businessContext = {
    ...(await resolveBusinessInfoValidationContext(svc, businessInput.state)),
    requireEin: false,
    requireAllFields: !businessInfoSkipped,
  };
  const resolvedCompanyName = resolveTenantDisplayName({
    organizationName: businessInput.companyName,
    subdomain: subdomainFinal,
    adminEmail: effectiveAdminEmail,
  });
  // Skip means ignore business fields entirely (partial ZIP/phone leftovers must not block).
  let businessInputForValidation = businessInfoSkipped
    ? {
        companyName: resolvedCompanyName,
        industry: "",
        companySize: "",
        state: "",
        city: "",
        address: "",
        phone: "",
        email: "",
        zipCode: "",
        ein: "",
      }
    : businessInput;

  const businessErrors = validateBusinessInfoForm(businessInputForValidation, businessContext);
  if (!isBusinessInfoValid(businessInputForValidation, businessContext)) {
    return NextResponse.json(
      {
        error: firstBusinessInfoError(businessErrors) ?? "Business information is invalid.",
        errors: businessErrors,
        code: "INVALID_BUSINESS_INFO",
      },
      { status: 400 }
    );
  }

  if (!sessionUserId && adminPassword.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const rawCategory = body.category;
  const parsedCategory = parseTenantCategory(rawCategory);
  if (rawCategory != null && String(rawCategory).trim() !== "" && !parsedCategory) {
    return NextResponse.json(
      { error: "Tenant category must be Staffing or SMB." },
      { status: 400 }
    );
  }
  const categoryToAssign: TenantCategory = parsedCategory ?? DEFAULT_TENANT_CATEGORY;

  const { data: bySubdomain, error: bsErr } = await svc
    .from("tenants")
    .select("id, subdomain, slug")
    .eq("subdomain", subdomainFinal)
    .maybeSingle();

  const { data: bySlug, error: bslugErr } = await svc
    .from("tenants")
    .select("id, subdomain, slug")
    .eq("slug", slugFinal)
    .maybeSingle();

  if (bsErr || bslugErr) {
    return NextResponse.json({ error: (bsErr || bslugErr)?.message ?? "Lookup failed." }, { status: 500 });
  }

  if (bySlug && bySubdomain && bySlug.id !== bySubdomain.id) {
    return NextResponse.json({ error: "Subdomain already taken" }, { status: 409 });
  }

  if (bySlug?.subdomain && bySlug.subdomain !== subdomainFinal) {
    return NextResponse.json({ error: "Subdomain already taken" }, { status: 409 });
  }

  let tenantId: string | null = null;
  let createdNewTenant = false;

  if (bySubdomain?.id) {
    tenantId = String(bySubdomain.id);
  } else if (bySlug?.id) {
    tenantId = String(bySlug.id);
  }

  const tenantDisplayName =
    businessInputForValidation.companyName.trim() || resolvedCompanyName;

  const primaryFont = body.primaryFont?.trim()
    ? normalizeBrandingFontId(body.primaryFont)
    : null;
  const headingFont = body.headingFont?.trim()
    ? normalizeBrandingFontId(body.headingFont)
    : primaryFont;
  const bodyFont = body.bodyFont?.trim()
    ? normalizeBrandingFontId(body.bodyFont)
    : primaryFont;

  const brandingRow = {
    name: tenantDisplayName,
    slug: slugFinal,
    subdomain: subdomainFinal,
    domain: domainFinal,
    logo_url: body.logoUrl?.trim() || null,
    primary_color: body.primaryColor?.trim() || "#0d9488",
    secondary_color: body.secondaryColor?.trim() || "#0f766e",
    accent_color: body.accentColor?.trim() || "#99f6e4",
    welcome_headline: body.welcomeHeadline?.trim() || `Welcome to ${tenantDisplayName}`,
    welcome_subtitle: body.welcomeSubtitle?.trim() || "Your applicant experience starts here.",
    auth_background_image_url: body.authBackgroundImageUrl?.trim() || null,
    primary_font: primaryFont,
    heading_font: headingFont,
    body_font: bodyFont,
    font_color: body.fontColor?.trim() || null,
    heading_color: body.headingColor?.trim() || null,
    muted_text_color: body.mutedTextColor?.trim() || null,
    industry: businessInputForValidation.industry,
    company_size: businessInputForValidation.companySize,
    city: businessInputForValidation.city,
    state: businessInputForValidation.state,
    address_line_1: businessInputForValidation.address,
    phone: businessInputForValidation.phone,
    email: businessInputForValidation.email,
    postal_code: businessInputForValidation.zipCode,
    ein: businessInputForValidation.ein || null,
    is_active: true,
    primary_city: businessInputForValidation.city,
    primary_state: businessInputForValidation.state,
    primary_postal_code: businessInputForValidation.zipCode,
    hq_state: businessInputForValidation.state,
  };

  if (tenantId) {
    const { data: existingAdminRoles, error: rolesErr } = await svc
      .from("user_roles")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("role", "admin")
      .limit(1);
    if (rolesErr) {
      return NextResponse.json({ error: rolesErr.message }, { status: 500 });
    }

    if ((existingAdminRoles?.length ?? 0) > 0) {
      return NextResponse.json({ error: "Subdomain already taken", subdomain: subdomainFinal }, { status: 409 });
    }

    const { error: upErr } = await svc.from("tenants").update(brandingRow).eq("id", tenantId);
    if (upErr?.code === "23505") {
      return NextResponse.json({ error: "Subdomain already taken" }, { status: 409 });
    }
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  } else {
    const { data: tenant, error: tErr } = await svc
      .from("tenants")
      .insert({ ...brandingRow, plan: "starter" })
      .select(
        "id, name, slug, subdomain, domain, logo_url, primary_color, secondary_color, accent_color, welcome_headline, welcome_subtitle, auth_background_image_url"
      )
      .single();

    if (tErr?.code === "23505") {
      return NextResponse.json({ error: "Subdomain already taken" }, { status: 409 });
    }
    if (tErr || !tenant?.id) {
      console.error("[tenant-onboarding]", tErr?.message ?? tErr);
      return NextResponse.json({ error: tErr?.message || "Could not save tenant." }, { status: 500 });
    }

    tenantId = String((tenant as { id: string }).id);
    createdNewTenant = true;

    try {
      await assignTenantCategory(svc, tenantId, categoryToAssign);
    } catch (categoryError) {
      console.error(
        "[tenant-onboarding] category",
        categoryError instanceof Error ? categoryError.message : categoryError
      );
      await svc.from("tenants").delete().eq("id", tenantId);
      return NextResponse.json({ error: "Could not save tenant category." }, { status: 500 });
    }

    const { error: seedErr } = await svc.rpc("seed_default_tenant_onboarding", {
      p_tenant_id: tenantId,
    });
    if (seedErr) {
      console.error("[tenant-onboarding] seed onboarding", seedErr.message);
    }
  }

  let userId: string | undefined = sessionUserId;

  try {
    const { evaluateSignupPrimaryLocation } = await import("@/lib/service-area/signup");
    const { data: owner } = userId
      ? await svc
          .from("users")
          .select("primary_city, primary_state, primary_postal_code, hq_state, email")
          .eq("id", userId)
          .maybeSingle()
      : { data: null };
    const primaryCity = String(owner?.primary_city ?? businessInputForValidation.city ?? "");
    const primaryState = String(owner?.primary_state ?? businessInputForValidation.state ?? "");
    const result = await evaluateSignupPrimaryLocation(svc, {
      city: primaryCity,
      state: primaryState,
      postalCode: owner?.primary_postal_code ?? businessInputForValidation.zipCode,
      hqState: owner?.hq_state ?? businessInputForValidation.state,
      email: owner?.email ?? adminEmail,
    });
    await svc
      .from("tenants")
      .update({
        primary_city: primaryCity,
        primary_state: primaryState,
        primary_postal_code: owner?.primary_postal_code ?? businessInputForValidation.zipCode,
        hq_state: owner?.hq_state ?? businessInputForValidation.state,
        account_access: result.accountAccess,
        hq_in_hold: result.hqInHold,
      })
      .eq("id", tenantId);
    if (userId) {
      await svc
        .from("users")
        .update({
          signup_waitlist_pending: result.accountAccess === "waitlist_pending",
        })
        .eq("id", userId);
    }
    await svc.from("tenant_hiring_areas").upsert({
      tenant_id: tenantId,
      mode: "all_allowed_platform",
      extra_allowed_states: [],
    });
  } catch (areaError) {
    console.error(
      "[tenant-onboarding] service area",
      areaError instanceof Error ? areaError.message : areaError
    );
    const { ACCOUNT_ACCESS_WAITLIST } = await import("@/lib/service-area/types");
    try {
      await svc
        .from("tenants")
        .update({ account_access: ACCOUNT_ACCESS_WAITLIST })
        .eq("id", tenantId);
      if (userId) {
        await svc.from("users").update({ signup_waitlist_pending: true }).eq("id", userId);
      }
    } catch (lockError) {
      console.error(
        "[tenant-onboarding] service area fail-closed",
        lockError instanceof Error ? lockError.message : lockError
      );
    }
  }

  try {
    const { syncTenantIndustryFromLabels } = await import("@/lib/ai-catalog/sync-tenant-industry");
    await syncTenantIndustryFromLabels(svc, {
      tenantId,
      primaryLabel: businessInputForValidation.industry,
      additionalKeys: Array.isArray(body.industryKeys) ? body.industryKeys.map((value) => String(value)) : [],
    });
  } catch (bindError) {
    console.error("[tenant-onboarding] industry binding", bindError);
  }

  const { data: list, error: listErr } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  if (!userId) {
    const found = list?.users?.find((u) => (u.email || "").toLowerCase() === effectiveAdminEmail);
    userId = found?.id;
  }

  const appMd = {
    platform: "nexus",
    tenant_id: tenantId,
    role: "admin",
    signup_completed: true,
    tenant_onboarding_completed: true,
  };

  if (!userId) {
    if (adminPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }
    const { data: created, error: cuErr } = await svc.auth.admin.createUser({
      email: effectiveAdminEmail,
      password: adminPassword,
      email_confirm: true,
      app_metadata: appMd,
    });
    if (cuErr || !created.user?.id) {
      console.error("[tenant-onboarding] createUser", cuErr?.message);
      if (createdNewTenant && tenantId) {
        await svc.from("tenants").delete().eq("id", tenantId);
      }
      return NextResponse.json({ error: cuErr?.message || "Could not create admin user." }, { status: 500 });
    }
    userId = created.user.id;
  } else {
    const updatePayload: {
      email_confirm: boolean;
      app_metadata: typeof appMd;
      password?: string;
    } = {
      email_confirm: true,
      app_metadata: appMd,
    };
    if (adminPassword.length >= 6) {
      updatePayload.password = adminPassword;
    }
    const { error: updErr } = await svc.auth.admin.updateUserById(userId, updatePayload);
    if (updErr) {
      console.error("[tenant-onboarding] updateUser", updErr.message);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  }

  const completedAt = new Date().toISOString();

  if (tenantId) {
    const staffEmailConflict = await findStaffTenantEmailConflict(svc, {
      tenantId,
      email: effectiveAdminEmail,
      excludeUserId: userId,
    });
    if (staffEmailConflict) {
      if (createdNewTenant) {
        await svc.from("tenants").delete().eq("id", tenantId);
      }
      return NextResponse.json({ error: TENANT_EMAIL_TAKEN_MESSAGE, code: "DUPLICATE_EMAIL" }, { status: 409 });
    }
  }

  const { error: uErr } = await svc.from("users").upsert(
    {
      id: userId,
      tenant_id: tenantId,
      email: effectiveAdminEmail,
      role: "admin",
      email_verified: true,
      signup_completed_at: completedAt,
      tenant_onboarding_completed_at: completedAt,
      phone: businessInputForValidation.phone?.trim() || null,
      address_line1: businessInputForValidation.address?.trim() || null,
      city: businessInputForValidation.city?.trim() || null,
      state: businessInputForValidation.state?.trim() || null,
      zip_code: businessInputForValidation.zipCode?.trim() || null,
    },
    { onConflict: "id" }
  );
  if (uErr) {
    console.error("[tenant-onboarding] users", uErr.message);
    return NextResponse.json({ error: "Could not link admin profile.", detail: uErr.message }, { status: 500 });
  }

  const { error: rErr } = await svc
    .from("user_roles")
    .upsert({ user_id: userId, tenant_id: tenantId, role: "admin" }, { onConflict: "user_id,tenant_id" });
  if (rErr) {
    console.error("[tenant-onboarding] user_roles", rErr.message);
    return NextResponse.json({ error: "Could not save admin role.", detail: rErr.message }, { status: 500 });
  }

  if (tenantId && !createdNewTenant) {
    const { error: seedErr } = await svc.rpc("seed_default_tenant_onboarding", {
      p_tenant_id: tenantId,
    });
    if (seedErr) {
      console.error("[tenant-onboarding] seed onboarding (existing tenant)", seedErr.message);
    }
  }

  let vercelDomainRegistered = false;
  let vercelDomainSkipped = false;
  try {
    const vercel = await registerTenantDomain(subdomainFinal);
    vercelDomainSkipped = vercel.skipped;
    vercelDomainRegistered = !vercel.skipped;
  } catch (err) {
    console.error(
      "[tenant-onboarding] Vercel domain",
      err instanceof Error ? err.message : err
    );
  }

  let firmaProvisioning: {
    status: FirmaWorkspaceProvisioningStatus;
    workspaceId: string | null;
    message: string | null;
  } = {
    status: "failed",
    workspaceId: null,
    message: null,
  };

  if (tenantId) {
    try {
      console.info("[tenant-onboarding] Firma workspace provisioning starting", {
        tenantId,
        createdNewTenant,
      });
      const result = await provisionFirmaWorkspaceForTenant({
        supabase: svc,
        tenantId,
        tenantName: org,
        tenantSlug: subdomainFinal,
      });
      firmaProvisioning = {
        status: result.status,
        workspaceId: result.workspaceId,
        message: result.message ?? null,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Firma workspace provisioning failed unexpectedly";
      console.error("[tenant-onboarding] Firma provisioning", { tenantId, error: message });
      firmaProvisioning = {
        status: "failed",
        workspaceId: null,
        message:
          "Tenant was created, but e-signature workspace creation failed. You can retry in Account Settings.",
      };
    }
  }

  const tenantCategory = tenantId
    ? createdNewTenant
      ? categoryToAssign
      : await getTenantCategory(svc, tenantId)
    : DEFAULT_TENANT_CATEGORY;

  return NextResponse.json({
    ok: true,
    tenantId,
    category: tenantCategory,
    subdomain: subdomainFinal,
    slug: slugFinal,
    domain: domainFinal,
    vercelDomainRegistered,
    vercelDomainSkipped,
    firmaProvisioning,
  });
}

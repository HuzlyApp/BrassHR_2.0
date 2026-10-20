import type { SupabaseClient } from "@supabase/supabase-js";
import { buildApplicationStatusUrl } from "@/lib/email/application-status-url";
import { buildApplicantPortalUrl } from "@/lib/email/dynamic-template-urls";
import type { OnboardingEmailTemplateKey } from "@/lib/email-templates/template-keys";
import {
  createApplicantContinuationLink,
  type ContinuationReason,
} from "@/lib/onboarding/applicant-continuation-link";
import { isValidStep1Email } from "@/lib/onboardingStep1Validation";
import { pickTenantVanityLabel } from "@/lib/tenant/tenant-vanity-url";

export type ApplicantEmailContext = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  applicantName: string;
  applicantEmail: string;
  applicationStatusUrl: string;
  applicantPortalUrl: string;
  applicantContinuationLink: string;
  continuationLinkId?: string;
  supportEmail: string;
  reason?: string;
};

export type BuildApplicantContextParams = {
  tenantId: string;
  workerId: string;
  origin: string;
  reason?: string;
  continuationReason?: ContinuationReason;
  /** When false, preview flows do not persist continuation links as sent. */
  markContinuationSent?: boolean;
  /** Use when worker.email is not set yet (e.g. resume upload before profile review). */
  recipientEmailOverride?: string | null;
  /** Stored on applicant_continuation_links.metadata for auditing/dedup. */
  continuationMetadata?: Record<string, unknown>;
  applicationId?: string | null;
  jobToken?: string | null;
  /** Open this step from the continuation link instead of the candidate's first open step. */
  continuationTargetStepKey?: string | null;
};

function formatApplicantName(first: string | null, last: string | null): string {
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name || "Applicant";
}

function resolveSupportEmail(tenantSlug: string): string {
  const configured = process.env.DEFAULT_SUPPORT_EMAIL?.trim();
  if (configured) return configured;
  const fromDomain = process.env.RESEND_FROM_EMAIL?.trim().split("@")[1];
  if (fromDomain) return `support@${fromDomain}`;
  return `support@${tenantSlug || "brasshr"}.com`;
}

export async function buildApplicantEmailContext(
  supabase: SupabaseClient,
  params: BuildApplicantContextParams
): Promise<ApplicantEmailContext | null> {
  const { data: worker, error: wErr } = await supabase
    .from("worker")
    .select("id, tenant_id, first_name, last_name, email")
    .eq("id", params.workerId)
    .maybeSingle();

  if (wErr) throw wErr;
  if (!worker?.id) return null;

  const overrideEmail = params.recipientEmailOverride?.trim().toLowerCase();
  const workerEmail = worker.email != null ? String(worker.email).trim().toLowerCase() : "";
  const applicantEmail =
    overrideEmail && isValidStep1Email(overrideEmail)
      ? overrideEmail
      : workerEmail && isValidStep1Email(workerEmail)
        ? workerEmail
        : null;
  if (!applicantEmail) return null;

  const tenantId = String(worker.tenant_id ?? params.tenantId);
  const { data: tenant, error: tErr } = await supabase
    .from("tenants")
    .select("id, name, slug, subdomain")
    .eq("id", tenantId)
    .maybeSingle();

  if (tErr) throw tErr;

  const tenantRow = tenant as {
    id: string;
    name: string | null;
    slug: string | null;
    subdomain?: string | null;
  } | null;

  const slug = pickTenantVanityLabel({
    subdomain: tenantRow?.subdomain,
    slug: tenantRow?.slug,
  });
  if (!slug) return null;
  const applicationStatusUrl = buildApplicationStatusUrl({
    origin: params.origin,
    tenantSlug: slug,
  });
  const applicantPortalUrl = buildApplicantPortalUrl(params.origin, slug);
  const continuation = await createApplicantContinuationLink(supabase, {
    tenantId,
    workerId: String(worker.id),
    origin: params.origin,
    tenantSlug: slug,
    reason: params.continuationReason ?? "onboarding_reminder",
    markSent: params.markContinuationSent !== false,
    metadata: params.continuationMetadata,
    applicationId: params.applicationId,
    jobToken: params.jobToken,
    targetStepKey: params.continuationTargetStepKey,
  });

  return {
    tenantId,
    tenantName: String(tenantRow?.name ?? slug),
    tenantSlug: slug,
    applicantName: formatApplicantName(
      worker.first_name as string | null,
      worker.last_name as string | null
    ),
    applicantEmail,
    applicationStatusUrl,
    applicantPortalUrl,
    applicantContinuationLink: continuation?.url ?? applicationStatusUrl,
    continuationLinkId: continuation?.id,
    supportEmail: resolveSupportEmail(slug),
    reason: params.reason?.trim() || undefined,
  };
}

export function contextToTemplateVariables(
  ctx: ApplicantEmailContext
): Record<string, string> {
  return {
    applicantName: ctx.applicantName,
    tenantName: ctx.tenantName,
    applicationStatusUrl: ctx.applicationStatusUrl,
    applicantPortalUrl: ctx.applicantPortalUrl,
    applicantContinuationLink: ctx.applicantContinuationLink,
    statusLink: ctx.applicantContinuationLink,
    supportEmail: ctx.supportEmail,
    ...(ctx.reason ? { reason: ctx.reason } : {}),
  };
}

export type SendOnboardingEmailParams = {
  tenantId: string;
  workerId: string;
  templateKey: OnboardingEmailTemplateKey;
  origin: string;
  locale?: string;
  reason?: string;
  continuationReason?: ContinuationReason;
};

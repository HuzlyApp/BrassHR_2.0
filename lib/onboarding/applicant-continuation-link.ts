import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureWorkerOnboardingProgress } from "@/lib/onboarding/ensure-worker-progress";
import { resolveApplicantNavBoundaries } from "@/lib/onboarding/farthest-reached-step";
import { computeMaxAllowedStepIndexFromProgress } from "@/lib/onboarding/compute-max-allowed-from-progress";
import { loadTenantOnboardingConfig } from "@/lib/onboarding/load-tenant-config";
import { routeForApplicantStep } from "@/lib/onboarding/step-routes";
import { getEnabledTenantSteps } from "@/lib/onboarding/tenant-step-navigation";
import type { OnboardingStepType } from "@/lib/onboarding/types";
import { resolveApplicantEmailOrigin } from "@/lib/email/applicant-public-origin";
import { withTenant } from "@/lib/tenant/with-tenant";
import { pickTenantVanityLabel } from "@/lib/tenant/tenant-vanity-url";

const DEFAULT_EXPIRY_HOURS = 72;
const TOKEN_BYTES = 32;

export type ContinuationReason =
  | "onboarding_reminder"
  | "application_status"
  | "resume_continuation"
  | "welcome"
  | "manual_notification"
  | "placement_accepted"
  | "step_ready";

type WorkerContinuationRow = {
  id: string;
  tenant_id: string;
  user_id: string | null;
};

type TenantSlugRow = {
  slug: string | null;
  subdomain?: string | null;
};

export type ApplicantContinuationTarget = {
  path: string;
  stepKey: string | null;
  stepType: OnboardingStepType | null;
};

export type ApplicantContinuationLinkResult = {
  id: string;
  url: string;
  target: ApplicantContinuationTarget;
  expiresAt: string;
};

export function hashContinuationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function expiryHours(): number {
  const raw = Number(process.env.APPLICANT_CONTINUATION_LINK_TTL_HOURS);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 24 * 14) : DEFAULT_EXPIRY_HOURS;
}

function pickTenantSlug(row: TenantSlugRow | null, fallback?: string | null): string | null {
  return pickTenantVanityLabel({
    subdomain: row?.subdomain,
    slug: row?.slug ?? fallback,
  });
}

function withApplicationQuery(
  path: string,
  params: { applicationId?: string | null; jobToken?: string | null }
): string {
  const [pathname, existing] = path.split("?");
  const search = new URLSearchParams(existing ?? "");
  if (params.applicationId) search.set("applicationId", params.applicationId);
  if (params.jobToken) search.set("job_token", params.jobToken);
  const qs = search.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

async function loadPublicJobToken(
  supabase: SupabaseClient,
  tenantId: string,
  jobRequisitionId: string | null | undefined
): Promise<string | null> {
  if (!jobRequisitionId) return null;
  const { data } = await supabase
    .from("job_requisitions")
    .select("public_job_token")
    .eq("id", jobRequisitionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const token = (data as { public_job_token?: string | null } | null)?.public_job_token;
  return typeof token === "string" && token.trim() ? token.trim() : null;
}

export async function resolveApplicantContinuationTarget(
  supabase: SupabaseClient,
  params: {
    workerId: string;
    tenantId: string;
    tenantSlug?: string | null;
    applicationId?: string | null;
    jobToken?: string | null;
    targetStepKey?: string | null;
  }
): Promise<ApplicantContinuationTarget> {
  const { resolveApplicationWorkflowPhase } = await import(
    "@/lib/onboarding/resolve-application-workflow-phase"
  );
  const { applyApplicantConfigFilters } = await import("@/lib/onboarding/filter-applicant-steps");
  const { loadApplicantConfigForJobToken } = await import(
    "@/lib/onboarding/load-config-for-job-workflow"
  );

  const phaseRecord = await resolveApplicationWorkflowPhase(supabase, {
    tenantId: params.tenantId,
    workerId: params.workerId,
    applicationId: params.applicationId,
    jobToken: params.jobToken,
  });
  const activePhase = phaseRecord?.phase ?? "pre_hire";
  // Without job_token the portal loads the wrong workflow and live applicants
  // are redirected to the public jobs board.
  const jobToken =
    params.jobToken?.trim() ||
    (await loadPublicJobToken(supabase, params.tenantId, phaseRecord?.jobRequisitionId));

  let config = await loadTenantOnboardingConfig(supabase, params.tenantId, {
    workerFacing: true,
  });
  if (jobToken) {
    try {
      const jobConfig = await loadApplicantConfigForJobToken(
        supabase,
        params.tenantSlug ?? null,
        jobToken
      );
      config = jobConfig.config;
    } catch {
      // Keep tenant published config when the job token is stale.
    }
  }
  config = config ? applyApplicantConfigFilters(config, { activePhase }) : config;
  const enabled = getEnabledTenantSteps(config);
  const progress = await ensureWorkerOnboardingProgress(
    supabase,
    params.workerId,
    params.tenantId,
    params.applicationId ?? phaseRecord?.applicationId ?? null
  );
  const byStep = new Map(progress.steps.map((step) => [step.onboarding_step_id, step]));
  const naturalFrontier = computeMaxAllowedStepIndexFromProgress(enabled, progress);
  const { farthestReachedIndex } = resolveApplicantNavBoundaries(
    enabled,
    progress,
    naturalFrontier
  );

  const requestedKey = params.targetStepKey?.trim();
  const target =
    (requestedKey ? enabled.find((step) => step.step_key === requestedKey) : undefined) ??
    enabled.find((step, index) => {
      const status = byStep.get(step.id)?.status ?? "pending";
      return index + 1 <= farthestReachedIndex && status !== "completed" && status !== "skipped";
    }) ??
    enabled.find(
      (step, index) =>
        index + 1 <= farthestReachedIndex &&
        (step.step_key === "review_submit" || step.step_type === "review_submit")
    ) ??
    enabled[Math.min(Math.max(farthestReachedIndex, 1), enabled.length) - 1] ??
    enabled[0] ??
    null;

  const applicationQuery = {
    applicationId: params.applicationId ?? phaseRecord?.applicationId ?? null,
    jobToken: jobToken || null,
  };

  if (!target) {
    const fallbackPath =
      activePhase === "post_hire" || activePhase === "completed"
        ? "/application/onboarding"
        : "/application/add-resume";
    return {
      path: withApplicationQuery(withTenant(fallbackPath, params.tenantSlug), applicationQuery),
      stepKey: null,
      stepType: null,
    };
  }

  return {
    path: withApplicationQuery(routeForApplicantStep(target, params.tenantSlug), applicationQuery),
    stepKey: target.step_key,
    stepType: target.step_type,
  };
}

export async function createApplicantContinuationLink(
  supabase: SupabaseClient,
  params: {
    workerId: string;
    tenantId: string;
    origin: string;
    reason?: ContinuationReason;
    markSent?: boolean;
    tenantSlug?: string | null;
    metadata?: Record<string, unknown>;
    applicationId?: string | null;
    jobToken?: string | null;
    targetStepKey?: string | null;
  }
): Promise<ApplicantContinuationLinkResult | null> {
  const { data: worker, error: workerError } = await supabase
    .from("worker")
    .select("id, tenant_id, user_id")
    .eq("id", params.workerId)
    .maybeSingle();

  if (workerError) throw workerError;
  const workerRow = worker as WorkerContinuationRow | null;
  if (!workerRow?.id || String(workerRow.tenant_id) !== params.tenantId) return null;

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("slug, subdomain")
    .eq("id", params.tenantId)
    .maybeSingle();

  if (tenantError) throw tenantError;
  const tenantSlug = pickTenantSlug((tenant as TenantSlugRow | null) ?? null, params.tenantSlug);
  const applicationId =
    params.applicationId?.trim() ||
    (typeof params.metadata?.applicationId === "string" ? params.metadata.applicationId.trim() : "") ||
    null;
  const target = await resolveApplicantContinuationTarget(supabase, {
    workerId: params.workerId,
    tenantId: params.tenantId,
    tenantSlug,
    applicationId,
    jobToken: params.jobToken,
    targetStepKey: params.targetStepKey,
  });

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = hashContinuationToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiryHours() * 60 * 60 * 1000).toISOString();

  const { data: inserted, error: insertError } = await supabase
    .from("applicant_continuation_links")
    .insert({
      tenant_id: params.tenantId,
      worker_id: params.workerId,
      applicant_user_id: workerRow.user_id,
      ...(applicationId ? { application_id: applicationId } : {}),
      token_hash: tokenHash,
      target_path: target.path,
      target_step_key: target.stepKey,
      target_step_type: target.stepType,
      reason: params.reason ?? "onboarding_reminder",
      sent_at: params.markSent ? now.toISOString() : null,
      expires_at: expiresAt,
      metadata: {
        ...(params.metadata ?? {}),
        ...(applicationId ? { applicationId } : {}),
      },
    })
    .select("id")
    .single();

  if (insertError) throw insertError;
  const insertedRow = inserted as { id: string };

  const publicOrigin = resolveApplicantEmailOrigin(
    params.origin,
    tenantSlug ?? params.tenantSlug ?? ""
  );
  const url = new URL("/application/continue", publicOrigin);
  url.searchParams.set("token", token);

  return {
    id: insertedRow.id,
    url: url.toString(),
    target,
    expiresAt,
  };
}

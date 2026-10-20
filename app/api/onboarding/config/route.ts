import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase-env";
import { loadTenantOnboardingConfig } from "@/lib/onboarding/load-tenant-config";
import { loadOnboardingBuilderMeta } from "@/lib/onboarding/load-onboarding-builder-meta";
import { resolveTenantIdBySlug } from "@/lib/onboarding/resolve-worker-context";
import { getEnabledTenantSteps } from "@/lib/onboarding/tenant-step-navigation";
import { loadApplicantConfigForJobToken, loadApplicantConfigForTenantDefault } from "@/lib/onboarding/load-config-for-job-workflow";
import { JobApplicationGateError } from "@/lib/jobs/validate-job-application";
import { normalizeJobToken } from "@/lib/jobs/public-application-routing";
import { phaseGateApplicantConfig } from "@/lib/onboarding/phase-gate-applicant-config";
import { resolveOnboardingWorker } from "@/lib/onboarding/resolve-onboarding-worker";
import { inferApplicantJobToken } from "@/lib/onboarding/infer-applicant-job-token";

export const runtime = "nodejs";

/** Public/worker-safe onboarding config (no correct_answer on questions). */
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug")?.trim() || "";
    const tenantIdParam = req.nextUrl.searchParams.get("tenantId")?.trim() || "";
    const jobToken = normalizeJobToken(req.nextUrl.searchParams.get("job_token"));
    const applicantId = req.nextUrl.searchParams.get("applicantId")?.trim() || "";
    const applicationId = req.nextUrl.searchParams.get("applicationId")?.trim() || "";

    const url = getSupabaseUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
    }

    const supabase = createClient(url, key);
    const workerCtx = applicantId
      ? await resolveOnboardingWorker(supabase, applicantId, slug)
      : null;

    // Navigation can drop job_token; an applicant with one live application still belongs on its workflow.
    const inferred =
      !jobToken && workerCtx && req.nextUrl.searchParams.get("infer_application") === "1"
        ? await inferApplicantJobToken(supabase, {
            tenantId: workerCtx.tenantId,
            workerId: workerCtx.workerId,
            userId: workerCtx.userId,
            applicationId,
          })
        : null;
    const effectiveJobToken = jobToken || inferred?.jobToken || "";
    const effectiveApplicationId = applicationId || inferred?.applicationId || "";

    if (effectiveJobToken) {
      try {
        const jobConfig = await loadApplicantConfigForJobToken(supabase, slug || null, effectiveJobToken);
        const gated = await phaseGateApplicantConfig(supabase, {
          tenantId: jobConfig.tenantId,
          config: jobConfig.config,
          workerId: workerCtx?.workerId,
          applicationId: effectiveApplicationId || null,
          jobToken: effectiveJobToken,
        });
        return NextResponse.json({
          config: gated.config,
          tenantSlug: jobConfig.tenantSlug,
          publishStatus: "published",
          source: "job-workflow",
          workflowId: jobConfig.workflowId,
          workflowName: jobConfig.workflowName,
          jobToken: jobConfig.jobToken,
          workflowPhase: gated.workflowPhase,
          applicationId: gated.applicationId,
          postHireActivatedAt: gated.postHireActivatedAt,
          allWorkflowSteps: gated.allWorkflowSteps,
        });
      } catch (err: unknown) {
        if (!(err instanceof JobApplicationGateError)) throw err;
        if (jobToken) {
          const status =
            err.code === "TENANT_NOT_FOUND" || err.code === "JOB_NOT_FOUND" ? 404 : 403;
          return NextResponse.json({ error: err.message, code: err.code }, { status });
        }
        // An inferred job that no longer accepts applicants falls back to the tenant workflow.
      }
    }

    // No job token: Worker Onboarding for direct Start Application (new tenants / no open jobs).
    if (slug) {
      try {
        const defaultConfig = await loadApplicantConfigForTenantDefault(supabase, slug);
        const gated = await phaseGateApplicantConfig(supabase, {
          tenantId: defaultConfig.tenantId,
          config: defaultConfig.config,
          workerId: workerCtx?.workerId,
          applicationId: applicationId || null,
        });
        return NextResponse.json({
          config: gated.config,
          tenantSlug: defaultConfig.tenantSlug,
          publishStatus: "published",
          source: "worker-onboarding",
          workflowId: defaultConfig.workflowId,
          workflowName: defaultConfig.workflowName,
          workflowPhase: gated.workflowPhase,
          applicationId: gated.applicationId,
          postHireActivatedAt: gated.postHireActivatedAt,
          allWorkflowSteps: gated.allWorkflowSteps,
        });
      } catch (err: unknown) {
        if (err instanceof JobApplicationGateError) {
          if (err.code === "TENANT_NOT_FOUND") {
            return NextResponse.json({ error: err.message, code: err.code }, { status: 404 });
          }
          // Fall through to legacy tenant published config when Worker Onboarding is missing.
        } else {
          throw err;
        }
      }
    }

    let tenantId = tenantIdParam;
    if (!tenantId && slug) {
      tenantId = (await resolveTenantIdBySlug(supabase, slug)) ?? "";
    }

    if (!tenantId) {
      return NextResponse.json({ error: "Missing tenant slug or tenantId" }, { status: 400 });
    }

    const { data: tenantRow } = await supabase
      .from("tenants")
      .select("id, slug, subdomain, is_active")
      .eq("id", tenantId)
      .maybeSingle();

    if (!tenantRow?.id || tenantRow.is_active === false) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    if (slug) {
      const canonicalSlug = String(tenantRow.slug ?? "").toLowerCase();
      const subdomain = String(tenantRow.subdomain ?? "").toLowerCase();
      if (slug !== canonicalSlug && slug !== subdomain) {
        return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
      }
    }

    const config = await loadTenantOnboardingConfig(supabase, tenantId, { workerFacing: true });
    if (!config) {
      return NextResponse.json({ error: "Configuration not found" }, { status: 404 });
    }

    const gated = await phaseGateApplicantConfig(supabase, {
      tenantId,
      config,
      workerId: workerCtx?.workerId,
      applicationId: applicationId || null,
      jobToken,
    });

    if (!getEnabledTenantSteps(gated.config).length) {
      return NextResponse.json(
        {
          error: "This tenant has not published an onboarding flow yet.",
          code: "NOT_PUBLISHED",
        },
        { status: 403 }
      );
    }

    const builder = await loadOnboardingBuilderMeta(supabase, tenantId);
    const publishStatus = builder.publishStatus;

    if (publishStatus === "draft") {
      console.info("[onboarding/config] serving published steps; builder draft not applied to applicants", {
        tenantId,
        tenantSlug: tenantRow.slug ?? slug,
        enabledSteps: getEnabledTenantSteps(gated.config).length,
        workflowPhase: gated.workflowPhase,
      });
    }

    return NextResponse.json({
      config: gated.config,
      tenantSlug: tenantRow.slug ?? slug,
      publishStatus,
      source: "published",
      workflowPhase: gated.workflowPhase,
      applicationId: gated.applicationId,
      postHireActivatedAt: gated.postHireActivatedAt,
      allWorkflowSteps: gated.allWorkflowSteps,
    });
  } catch (err: unknown) {
    console.error("[onboarding/config]", err);
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

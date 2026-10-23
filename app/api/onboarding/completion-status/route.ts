import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase-env";
import { formatApiError } from "@/lib/api/format-api-error";
import { resolveOnboardingWorker } from "@/lib/onboarding/resolve-onboarding-worker";
import { resolveApplicationWorkflowPhase } from "@/lib/onboarding/resolve-application-workflow-phase";
import { ensureWorkerOnboardingProgress } from "@/lib/onboarding/ensure-worker-progress";
import {
  loadApplicantConfigForJobToken,
  loadApplicantConfigForTenantDefault,
} from "@/lib/onboarding/load-config-for-job-workflow";
import { loadTenantOnboardingConfig } from "@/lib/onboarding/load-tenant-config";
import { resolveTenantIdBySlug } from "@/lib/onboarding/resolve-worker-context";
import { normalizeJobToken } from "@/lib/jobs/public-application-routing";
import { evaluateWorkflowCompletion } from "@/lib/onboarding/workflow-completion-check";
import { requiredPreHireStepsComplete } from "@/lib/onboarding/required-pre-hire-gate";
import { unlockPostHireWhenRequiredComplete } from "@/lib/onboarding/unlock-post-hire-when-ready";
import { filterApplicantVisibleSteps } from "@/lib/onboarding/filter-applicant-steps";
import { routeForApplicantStep } from "@/lib/onboarding/resolve-applicant-step-route";
import { readStepLifecyclePhase } from "@/lib/onboarding/workflow-phase";
import type { TenantOnboardingConfig } from "@/lib/onboarding/types";

export const runtime = "nodejs";

async function loadFullConfigForContext(
  supabase: SupabaseClient,
  slug: string,
  jobToken: string | null
): Promise<TenantOnboardingConfig | null> {
  if (jobToken) {
    try {
      const jobConfig = await loadApplicantConfigForJobToken(supabase, slug || null, jobToken);
      if (jobConfig?.config) return jobConfig.config;
    } catch {
      /* fallback to tenant default */
    }
  }

  if (slug) {
    try {
      const defaultConfig = await loadApplicantConfigForTenantDefault(supabase, slug);
      if (defaultConfig?.config) return defaultConfig.config;
    } catch {
      /* fallback */
    }

    const tenantId = await resolveTenantIdBySlug(supabase, slug);
    if (tenantId) {
      const tenantConfig = await loadTenantOnboardingConfig(supabase, tenantId, {
        workerFacing: true,
      });
      if (tenantConfig) return tenantConfig;
    }
  }

  return null;
}

/**
 * Without a job token the tenant default workflow would be evaluated, which can list steps
 * (e.g. post-hire) that the applicant's job workflow does not have.
 */
async function resolveJobTokenForApplicant(
  supabase: SupabaseClient,
  params: { tenantId: string; workerId: string; jobRequisitionId: string | null }
): Promise<string | null> {
  let jobRequisitionId = params.jobRequisitionId;
  if (!jobRequisitionId) {
    const { data } = await supabase
      .from("job_applications")
      .select("job_requisition_id")
      .eq("tenant_id", params.tenantId)
      .eq("worker_id", params.workerId)
      .not("job_requisition_id", "is", null)
      .not("status", "in", '("rejected","withdrawn","archived")')
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    jobRequisitionId = (data as { job_requisition_id?: string | null } | null)?.job_requisition_id ?? null;
  }
  if (!jobRequisitionId) return null;

  const { data: job } = await supabase
    .from("job_requisitions")
    .select("public_job_token")
    .eq("tenant_id", params.tenantId)
    .eq("id", jobRequisitionId)
    .maybeSingle();
  return normalizeJobToken((job as { public_job_token?: string | null } | null)?.public_job_token ?? null);
}

export async function GET(req: NextRequest) {
  try {
    const applicantId = req.nextUrl.searchParams.get("applicantId")?.trim() || "";
    const tenantSlug =
      req.nextUrl.searchParams.get("tenant")?.trim().toLowerCase() ||
      req.nextUrl.searchParams.get("slug")?.trim().toLowerCase() ||
      "";
    const jobToken = normalizeJobToken(req.nextUrl.searchParams.get("job_token"));
    const applicationId = req.nextUrl.searchParams.get("applicationId")?.trim() || "";

    if (!applicantId) {
      return NextResponse.json({ error: "Missing applicantId" }, { status: 400 });
    }

    const url = getSupabaseUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
    }

    const supabase = createClient(url, key);
    const workerCtx = await resolveOnboardingWorker(supabase, applicantId, tenantSlug);
    if (!workerCtx) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    }

    const phaseRecord = await resolveApplicationWorkflowPhase(supabase, {
      tenantId: workerCtx.tenantId,
      workerId: workerCtx.workerId,
      applicationId: applicationId || null,
      jobToken: jobToken || null,
    });

    const scopedApplicationId = applicationId || phaseRecord?.applicationId || null;
    const workflowJobToken =
      jobToken ||
      (await resolveJobTokenForApplicant(supabase, {
        tenantId: workerCtx.tenantId,
        workerId: workerCtx.workerId,
        jobRequisitionId: phaseRecord?.jobRequisitionId ?? null,
      }));

    const [fullConfig, progress] = await Promise.all([
      loadFullConfigForContext(supabase, tenantSlug, workflowJobToken),
      ensureWorkerOnboardingProgress(
        supabase,
        workerCtx.workerId,
        workerCtx.tenantId,
        scopedApplicationId,
        Boolean(jobToken) && !scopedApplicationId
      ),
    ]);

    if (!fullConfig) {
      return NextResponse.json({ error: "Configuration not found" }, { status: 404 });
    }

    const visibleSteps = filterApplicantVisibleSteps(fullConfig.steps);
    const completion = evaluateWorkflowCompletion({
      allSteps: visibleSteps,
      progress,
      tenantSlug,
    });
    const postHireReady = await requiredPreHireStepsComplete(supabase, {
      tenantId: workerCtx.tenantId,
      workerId: workerCtx.workerId,
      applicationId: scopedApplicationId,
    });

    return NextResponse.json({
      workflowPhase: phaseRecord?.phase ?? "pre_hire",
      applicationId: scopedApplicationId,
      ...completion,
      postHireReady,
    });
  } catch (err: unknown) {
    console.error("[onboarding/completion-status:GET]", err);
    return NextResponse.json({ error: formatApiError(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      applicantId?: string;
      tenantSlug?: string;
      jobToken?: string;
      applicationId?: string;
      action?: string;
    };

    const applicantId = String(body.applicantId ?? "").trim();
    const tenantSlug = String(body.tenantSlug ?? "").trim().toLowerCase();
    const jobToken = normalizeJobToken(body.jobToken);
    const applicationId = String(body.applicationId ?? "").trim();
    const action = String(body.action ?? "").trim();

    if (!applicantId) {
      return NextResponse.json({ error: "Missing applicantId" }, { status: 400 });
    }

    const url = getSupabaseUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
    }

    const supabase = createClient(url, key);
    const workerCtx = await resolveOnboardingWorker(supabase, applicantId, tenantSlug);
    if (!workerCtx) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    }

    const phaseRecord = await resolveApplicationWorkflowPhase(supabase, {
      tenantId: workerCtx.tenantId,
      workerId: workerCtx.workerId,
      applicationId: applicationId || null,
      jobToken: jobToken || null,
    });

    const scopedApplicationId = applicationId || phaseRecord?.applicationId || null;

    if (action === "continue_to_post_hire") {
      const ready = await requiredPreHireStepsComplete(supabase, {
        tenantId: workerCtx.tenantId,
        workerId: workerCtx.workerId,
        applicationId: scopedApplicationId,
      });
      if (!ready) {
        return NextResponse.json(
          { error: "Post-Hire stays locked until every required Pre-Hire step is complete." },
          { status: 409 }
        );
      }

      if (scopedApplicationId) {
        await unlockPostHireWhenRequiredComplete(supabase, {
          tenantId: workerCtx.tenantId,
          workerId: workerCtx.workerId,
          applicationId: scopedApplicationId,
          origin: req.nextUrl.origin,
        });
      }

      await ensureWorkerOnboardingProgress(
        supabase,
        workerCtx.workerId,
        workerCtx.tenantId,
        scopedApplicationId
      );

      const workflowJobToken =
        jobToken ||
        (await resolveJobTokenForApplicant(supabase, {
          tenantId: workerCtx.tenantId,
          workerId: workerCtx.workerId,
          jobRequisitionId: phaseRecord?.jobRequisitionId ?? null,
        }));
      const fullConfig = await loadFullConfigForContext(supabase, tenantSlug, workflowJobToken);
      let nextRoute: string | null = null;

      if (fullConfig) {
        const visibleSteps = filterApplicantVisibleSteps(fullConfig.steps);
        const postHireSteps = visibleSteps.filter(
          (s) => readStepLifecyclePhase(s) === "post_hire"
        );
        if (postHireSteps.length > 0) {
          nextRoute = routeForApplicantStep(postHireSteps[0]!, tenantSlug);
        }
      }

      return NextResponse.json({
        ok: true,
        workflowPhase: "post_hire",
        nextRoute: nextRoute ?? `/application/custom-step/post-hire?tenant=${encodeURIComponent(tenantSlug)}`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[onboarding/completion-status:POST]", err);
    return NextResponse.json({ error: formatApiError(err) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase-env";
import { formatApiError } from "@/lib/api/format-api-error";
import { ensureWorkerOnboardingProgress } from "@/lib/onboarding/ensure-worker-progress";
import { resolveApplicationWorkflowPhase } from "@/lib/onboarding/resolve-application-workflow-phase";
import { resolveOnboardingWorker, readOnboardingTenantSlugFromRequest } from "@/lib/onboarding/resolve-onboarding-worker";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const applicantId = req.nextUrl.searchParams.get("applicantId")?.trim() || "";
    const tenantSlug =
      req.nextUrl.searchParams.get("tenant")?.trim().toLowerCase() ||
      readOnboardingTenantSlugFromRequest(req);
    const applicationId =
      req.nextUrl.searchParams.get("applicationId")?.trim() || "";
    const jobToken = req.nextUrl.searchParams.get("job_token")?.trim() || "";
    if (!applicantId) {
      return NextResponse.json({ error: "Missing applicantId" }, { status: 400 });
    }

    const url = getSupabaseUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
    }

    const supabase = createClient(url, key);
    const ctx = await resolveOnboardingWorker(supabase, applicantId, tenantSlug);
    if (!ctx) {
      return NextResponse.json({ progress: null });
    }

    const phaseRecord = await resolveApplicationWorkflowPhase(supabase, {
      tenantId: ctx.tenantId,
      workerId: ctx.workerId,
      applicationId: applicationId || null,
      jobToken: jobToken || null,
    });

    const scopedApplicationId = applicationId || phaseRecord?.applicationId || null;
    const progress = await ensureWorkerOnboardingProgress(
      supabase,
      ctx.workerId,
      ctx.tenantId,
      scopedApplicationId,
      Boolean(jobToken) && !scopedApplicationId
    );
    if (progress && phaseRecord?.phase) {
      progress.workflowPhase = phaseRecord.phase;
    }
    return NextResponse.json({ progress, workerId: ctx.workerId, tenantId: ctx.tenantId });
  } catch (err: unknown) {
    console.error("[onboarding/progress]", err);
    return NextResponse.json({ error: formatApiError(err) }, { status: 500 });
  }
}

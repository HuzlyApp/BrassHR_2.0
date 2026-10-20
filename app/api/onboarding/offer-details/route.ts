import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase-env";
import { normalizeJobToken } from "@/lib/jobs/public-application-routing";
import {
  readOnboardingTenantSlugFromRequest,
  resolveOnboardingWorker,
} from "@/lib/onboarding/resolve-onboarding-worker";
import { resolveApplicationWorkflowPhase } from "@/lib/onboarding/resolve-application-workflow-phase";
import { loadOfferDetailsForApplication } from "@/lib/onboarding/offer-acceptance";
import { formatApiError } from "@/lib/api/format-api-error";

export const runtime = "nodejs";

/** Offer details (position, pay, start date) for the applicant's job application. */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const applicantId = params.get("applicantId")?.trim() || "";
    if (!applicantId) {
      return NextResponse.json({ error: "applicantId is required" }, { status: 400 });
    }

    const url = getSupabaseUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
    }
    const supabase = createClient(url, key);

    const tenantSlug =
      params.get("tenant")?.trim().toLowerCase() || readOnboardingTenantSlugFromRequest(req);
    const ctx = await resolveOnboardingWorker(supabase, applicantId, tenantSlug);
    if (!ctx) return NextResponse.json({ error: "Worker not found" }, { status: 404 });

    let applicationId = params.get("applicationId")?.trim() || "";
    if (!applicationId) {
      const phase = await resolveApplicationWorkflowPhase(supabase, {
        tenantId: ctx.tenantId,
        workerId: ctx.workerId,
        applicationId: null,
        jobToken: normalizeJobToken(params.get("job_token")),
      });
      applicationId = phase?.applicationId ?? "";
    }
    if (!applicationId) {
      return NextResponse.json({ offer: null });
    }

    const offer = await loadOfferDetailsForApplication(supabase, {
      tenantId: ctx.tenantId,
      applicationId,
      workerId: ctx.workerId,
    });
    return NextResponse.json({ offer });
  } catch (err: unknown) {
    console.error("[onboarding/offer-details]", err);
    return NextResponse.json({ error: formatApiError(err) }, { status: 500 });
  }
}

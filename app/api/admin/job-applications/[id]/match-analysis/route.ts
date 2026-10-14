import { NextRequest, NextResponse } from "next/server";
import { writeActivityLog } from "@/lib/audit/activity-log";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import {
  getMatchAnalysisModelName,
  MATCH_ANALYSIS_ERROR,
  MatchAnalysisGenerationError,
  matchAnalysisErrorCode,
  parseAnalysisMode,
  parseAnalysisProvider,
  isAnalysisProvider,
  runMatchAnalysisForApplication,
  FOLLOW_UP_BLOCKED_NOT_READY,
} from "@/lib/jobs/match-analysis";
import { isDeepMatchStage, parseMatchStage } from "@/lib/jobs/match-analysis/match-stage";
import {
  DEEP_MATCH_BLOCKED_TALENT_POOL,
  DEEP_MATCH_BLOCKED_NOT_READY,
  canAdvanceMatchProgression,
  matchProgressionIndexFromStage,
  quickMatchFitBand,
} from "@/lib/jobs/match-analysis/progression";
import { countQualificationOutcomes } from "@/lib/jobs/match-analysis/workspace";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import { loadMatchAnalysisWorkspace } from "@/lib/jobs/match-analysis/load-workspace";
import { enforceMatchAnalysisRateLimits } from "@/lib/jobs/match-analysis/rate-limit";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
// 120s Grok Deep Match + 120s Gemini fallback, plus load and persist.
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const tenantId = await resolveStaffTenantId(supabase, auth).catch(() => null);
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant selected" }, { status: 400 });
  }

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Application id required" }, { status: 400 });
  }

  try {
    const workspace = await loadMatchAnalysisWorkspace(supabase, tenantId, id);
    if (!workspace) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }
    return NextResponse.json(workspace);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load match analysis" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const tenantId = await resolveStaffTenantId(supabase, auth).catch(() => null);
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant selected" }, { status: 400 });
  }

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Application id required" }, { status: 400 });
  }

  const limited = await enforceMatchAnalysisRateLimits(req, tenantId, auth.userId);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const recruiterNotes =
    typeof body?.recruiterNotes === "string" ? body.recruiterNotes : null;
  const verifiedRecruiterInfo =
    body?.verifiedRecruiterInfo && typeof body.verifiedRecruiterInfo === "object"
      ? (body.verifiedRecruiterInfo as Record<string, unknown>)
      : null;
  const analysisMode = parseAnalysisMode(body?.analysisMode);
  if (
    body?.analysisProvider != null &&
    body.analysisProvider !== "" &&
    !isAnalysisProvider(body.analysisProvider)
  ) {
    return NextResponse.json({ error: "Invalid analysis provider" }, { status: 400 });
  }
  const analysisProvider = parseAnalysisProvider(body?.analysisProvider);

  try {
    const result = await runMatchAnalysisForApplication({
      supabase,
      tenantId,
      jobApplicationId: id,
      recruiterNotes,
      verifiedRecruiterInfo,
      analyzedByUserId: auth.devBypass ? null : auth.userId,
      analysisMode,
      analysisProvider,
    });

    void writeActivityLog({
      actorUserId: auth.userId,
      action: "job_application.match_analyzed",
      entityType: "job_application",
      entityId: id,
      tenantId,
      request: req,
      metadata: {
        model: result.model ?? getMatchAnalysisModelName(analysisProvider),
        status: result.status,
        score: result.score,
        category: result.category,
        repaired: result.repaired,
        analysisMode,
        analysisProvider,
      },
    });

    if (result.error === "PROMPT_NOT_CONFIGURED") {
      return NextResponse.json(
        {
          error: "PROMPT_NOT_CONFIGURED",
          message: "No published AI prompt is configured for this feature, variant, and industry.",
        },
        { status: 422 }
      );
    }

    if (
      result.status === "FAILED" &&
      (result.error === DEEP_MATCH_BLOCKED_TALENT_POOL ||
        result.error === DEEP_MATCH_BLOCKED_NOT_READY ||
        result.error === FOLLOW_UP_BLOCKED_NOT_READY)
    ) {
      return NextResponse.json({ error: result.error, status: result.status }, { status: 409 });
    }

    const { data: requirements } = await supabase
      .from("job_application_match_requirements")
      .select(
        "id, requirement_text, requirement_type, status, requirement_outcome, candidate_evidence, evidence_source, impact, verification_required, confidence, sort_order, recruiter_verified, recruiter_note, recruiter_verified_at"
      )
      .eq("job_application_id", id)
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true });

    return NextResponse.json({
      ...result,
      requirements: requirements ?? [],
    });
  } catch (error) {
    const code = matchAnalysisErrorCode(error);

    console.error("[job-applications/match-analysis]", {
      code,
      tenantId,
      userId: auth.userId,
      applicationId: id,
      message: error instanceof Error ? error.message : "unknown",
    });

    const status =
      code === "AUTH"
        ? 502
        : code === "RATE_LIMIT"
          ? 429
          : code === "TIMEOUT" || code === "NETWORK"
            ? 504
            : code === "MISSING_CONFIG"
              ? 503
              : code === "PROMPT_NOT_CONFIGURED"
                ? 422
              : 502;

    if (code === "PROMPT_NOT_CONFIGURED") {
      return NextResponse.json(
        {
          error: "PROMPT_NOT_CONFIGURED",
          message: "No published AI prompt is configured for this feature, variant, and industry.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ error: MATCH_ANALYSIS_ERROR, code }, { status });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const tenantId = await resolveStaffTenantId(supabase, auth).catch(() => null);
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant selected" }, { status: 400 });
  }

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Application id required" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { progressStage?: unknown };
  const requested = parseMatchStage(body.progressStage);
  if (!requested || requested === "quick" || requested === "deep") {
    return NextResponse.json(
      { error: "progressStage must be call_pack, follow_up, or submission." },
      { status: 400 }
    );
  }

  const { data: application, error: appError } = await supabase
    .from("job_applications")
    .select("id, ai_match_status, ai_match_stage, recruiter_decision")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (appError) return NextResponse.json({ error: appError.message }, { status: 500 });
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  if (application.ai_match_status !== "ANALYZED") {
    return NextResponse.json({ error: "Run Quick Match before advancing." }, { status: 409 });
  }

  const { data: existingReqs } = await supabase
    .from("job_application_match_requirements")
    .select("requirement_type, status, requirement_outcome, verification_required, recruiter_verified")
    .eq("tenant_id", tenantId)
    .eq("job_application_id", id);
  const counts = countQualificationOutcomes(existingReqs ?? []);
  const fitBand = quickMatchFitBand({
    mandatory: counts.mandatory,
    confirmed: counts.confirmed,
    notMet: counts.notMet,
    blocking: counts.blocking,
  });
  const parked = application.recruiter_decision === "do_not_pursue";
  if (
    !canAdvanceMatchProgression({
      isAnalyzed: true,
      fitBand,
      parkedInTalentPool: parked,
    })
  ) {
    return NextResponse.json(
      { error: DEEP_MATCH_BLOCKED_TALENT_POOL },
      { status: 409 }
    );
  }

  const currentIndex = matchProgressionIndexFromStage(application.ai_match_stage);
  const requestedIndex = matchProgressionIndexFromStage(requested);
  if (requested === "submission" && !isDeepMatchStage(application.ai_match_stage)) {
    return NextResponse.json(
      { error: "Run Deep Match before the submission pack." },
      { status: 409 }
    );
  }
  if (requestedIndex > currentIndex + 1) {
    return NextResponse.json(
      { error: "Push through each stage. Do not skip ahead." },
      { status: 409 }
    );
  }
  if (requestedIndex < currentIndex) {
    return NextResponse.json({ ok: true, stage: application.ai_match_stage });
  }

  if (requested === "call_pack" || requested === "follow_up") {
    const rawProvider = (body as { analysisProvider?: unknown }).analysisProvider;
    if (rawProvider != null && rawProvider !== "" && !isAnalysisProvider(rawProvider)) {
      return NextResponse.json({ error: "Invalid analysis provider" }, { status: 400 });
    }
    const analysisProvider = parseAnalysisProvider(rawProvider);
    const result = await runMatchAnalysisForApplication({
      supabase,
      tenantId,
      jobApplicationId: id,
      analyzedByUserId: auth.devBypass ? null : auth.userId,
      analysisMode: requested,
      analysisProvider,
    });
    if (result.status !== "ANALYZED") {
      const status =
        result.error === DEEP_MATCH_BLOCKED_TALENT_POOL ||
        result.error === FOLLOW_UP_BLOCKED_NOT_READY
          ? 409
          : 502;
      const label = requested === "follow_up" ? "Follow-up" : "Verifications";
      return NextResponse.json(
        {
          error: result.error || `Could not write ${label} questions.`,
          status: result.status,
        },
        { status }
      );
    }
    void writeActivityLog({
      actorUserId: auth.devBypass ? null : auth.userId,
      action: "job_application.match_progress_advanced",
      entityType: "job_application",
      entityId: id,
      tenantId,
      request: req,
      metadata: {
        from: application.ai_match_stage,
        to: result.stage ?? requested,
        analysisMode: requested,
        model: result.model,
      },
    });
    return NextResponse.json({ ok: true, stage: result.stage ?? requested, model: result.model });
  }

  const { error: updateError } = await supabase
    .from("job_applications")
    .update({
      ai_match_stage: requested,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  void writeActivityLog({
    actorUserId: auth.devBypass ? null : auth.userId,
    action: "job_application.match_progress_advanced",
    entityType: "job_application",
    entityId: id,
    tenantId,
    request: req,
    metadata: { from: application.ai_match_stage, to: requested },
  });

  return NextResponse.json({ ok: true, stage: requested });
}

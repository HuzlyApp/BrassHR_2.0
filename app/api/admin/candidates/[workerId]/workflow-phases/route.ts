import { NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { canAccessWorkerRecord } from "@/lib/auth/worker-record-access";
import { loadCandidateWorkflowPhaseView } from "@/lib/onboarding/candidate-workflow-phase-view";
import { loadCandidateInterviews } from "@/lib/interviews/candidate-interview-history";
import { summarizeInterviews, withInterviewSummary } from "@/lib/onboarding/interview-step";
import {
  POST_HIRE_NOT_AVAILABLE_CODE,
  POST_HIRE_NOT_AVAILABLE_MESSAGE,
} from "@/lib/onboarding/assigned-workflow-steps";
import { ensureCandidateConvertedIfAgreementCompleted } from "@/lib/onboarding/auto-convert-after-agreement";
import { shouldRejectPostHirePhaseRequest } from "@/lib/onboarding/lock-post-hire";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { parseRequiredUuid } from "@/lib/validation/uuid";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ workerId: string }> };

export async function GET(req: Request, context: RouteContext) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  try {
    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) {
      return NextResponse.json({ error: "No tenant selected" }, { status: 400 });
    }

    const { workerId: workerIdRaw } = await context.params;
    const idCheck = parseRequiredUuid(workerIdRaw, "workerId");
    if (!idCheck.ok) {
      return NextResponse.json({ error: idCheck.error }, { status: 400 });
    }

    const { data: worker, error: workerError } = await supabase
      .from("worker")
      .select("id, user_id")
      .eq("id", idCheck.value)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (workerError) throw workerError;
    if (!worker) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }
    if (!canAccessWorkerRecord(auth, { id: String(worker.id), user_id: worker.user_id })) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
      await ensureCandidateConvertedIfAgreementCompleted(supabase, {
        tenantId,
        workerId: idCheck.value,
      });
    } catch (conversionErr) {
      console.warn("[workflow-phases] auto conversion check error", conversionErr);
    }

    const [baseView, interviews] = await Promise.all([
      loadCandidateWorkflowPhaseView(supabase, { workerId: idCheck.value, tenantId }),
      loadCandidateInterviews(supabase, { tenantId, workerId: idCheck.value }),
    ]);
    const interviewSummary = summarizeInterviews(interviews);
    const view = {
      ...baseView,
      preHire: {
        ...baseView.preHire,
        steps: withInterviewSummary(baseView.preHire.steps, interviewSummary),
      },
    };

    const phase = new URL(req.url).searchParams.get("phase")?.trim().toLowerCase();
    if (shouldRejectPostHirePhaseRequest(phase, view.postHireVisible)) {
      return NextResponse.json(
        { error: POST_HIRE_NOT_AVAILABLE_MESSAGE, code: POST_HIRE_NOT_AVAILABLE_CODE },
        { status: 403 }
      );
    }

    return NextResponse.json(view);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load candidate workflow phases",
      },
      { status: 500 }
    );
  }
}

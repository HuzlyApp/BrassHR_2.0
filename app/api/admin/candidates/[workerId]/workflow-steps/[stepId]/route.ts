import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireStaffApiSession, type StaffApiAuthContext } from "@/lib/auth/api-session";
import { canAccessWorkerRecord } from "@/lib/auth/worker-record-access";
import { sendCandidateStepEmail } from "@/lib/onboarding/candidate-step-email";
import { loadCandidateWorkflowStepInspection } from "@/lib/onboarding/candidate-workflow-step-inspection";
import {
  STAFF_REVIEW_NOTE_MAX_LENGTH,
  STAFF_STEP_ACTIONS,
} from "@/lib/onboarding/staff-step-review-shared";
import { applyStaffWorkflowStepAction } from "@/lib/onboarding/staff-workflow-step-review";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import { resolveApplicantEmailAppOrigin } from "@/lib/resolve-app-origin";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { parseRequiredUuid } from "@/lib/validation/uuid";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ workerId: string; stepId: string }> };

const actionBodySchema = z.object({
  action: z.enum(STAFF_STEP_ACTIONS),
  note: z.string().trim().max(STAFF_REVIEW_NOTE_MAX_LENGTH).optional().nullable(),
  notifyCandidate: z.boolean().optional(),
  clientOrigin: z.string().trim().optional(),
});

/** Staff email asking the candidate to complete one of their own steps. */
const sendEmailBodySchema = z.object({
  action: z.literal("send_email"),
  clientOrigin: z.string().trim().optional(),
});

type ResolvedStepRequest =
  | {
      ok: true;
      auth: StaffApiAuthContext;
      supabase: SupabaseClient;
      tenantId: string;
      workerId: string;
      stepId: string;
    }
  | { ok: false; response: NextResponse };

async function resolveStepRequest(context: RouteContext): Promise<ResolvedStepRequest> {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return { ok: false, response: auth };

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Supabase not configured" }, { status: 503 }),
    };
  }

  const tenantId = await resolveStaffTenantId(supabase, auth);
  if (!tenantId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No tenant selected" }, { status: 400 }),
    };
  }

  const { workerId: workerIdRaw, stepId: stepIdRaw } = await context.params;
  const workerCheck = parseRequiredUuid(workerIdRaw, "workerId");
  const stepCheck = parseRequiredUuid(stepIdRaw, "stepId");
  if (!workerCheck.ok) {
    return { ok: false, response: NextResponse.json({ error: workerCheck.error }, { status: 400 }) };
  }
  if (!stepCheck.ok) {
    return { ok: false, response: NextResponse.json({ error: stepCheck.error }, { status: 400 }) };
  }

  const { data: worker, error: workerError } = await supabase
    .from("worker")
    .select("id, user_id")
    .eq("id", workerCheck.value)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (workerError) throw workerError;
  if (!worker) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Candidate not found" }, { status: 404 }),
    };
  }
  if (!canAccessWorkerRecord(auth, { id: String(worker.id), user_id: worker.user_id })) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return {
    ok: true,
    auth,
    supabase,
    tenantId,
    workerId: workerCheck.value,
    stepId: stepCheck.value,
  };
}

export async function GET(_req: Request, context: RouteContext) {
  try {
    const resolved = await resolveStepRequest(context);
    if (!resolved.ok) return resolved.response;

    const result = await loadCandidateWorkflowStepInspection(resolved.supabase, {
      workerId: resolved.workerId,
      tenantId: resolved.tenantId,
      stepId: resolved.stepId,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code ?? null },
        { status: result.status }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load workflow step inspection",
      },
      { status: 500 }
    );
  }
}

/**
 * POST — staff complete / reject / reopen an internal (recruiter, HR, manager) workflow step,
 * or `send_email` to ask the candidate to complete one of their own steps.
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    const resolved = await resolveStepRequest(context);
    if (!resolved.ok) return resolved.response;

    const raw = await req.json().catch(() => null);
    const emailRequest = sendEmailBodySchema.safeParse(raw);
    if (emailRequest.success) {
      const result = await sendCandidateStepEmail(resolved.supabase, {
        workerId: resolved.workerId,
        tenantId: resolved.tenantId,
        stepRecordId: resolved.stepId,
        origin: resolveApplicantEmailAppOrigin(req, emailRequest.data.clientOrigin),
        actor: { userId: resolved.auth.userId, email: resolved.auth.email },
        request: req,
      });
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error, code: result.code ?? null },
          { status: result.status }
        );
      }
      return NextResponse.json(result);
    }

    const parsed = actionBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    const body = parsed.data;

    const result = await applyStaffWorkflowStepAction(resolved.supabase, {
      workerId: resolved.workerId,
      tenantId: resolved.tenantId,
      stepRecordId: resolved.stepId,
      action: body.action,
      note: body.note ?? null,
      actor: { userId: resolved.auth.userId, email: resolved.auth.email },
      notifyCandidate: body.action === "complete" && body.notifyCandidate === true,
      origin: resolveApplicantEmailAppOrigin(req, body.clientOrigin),
      request: req,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code ?? null },
        { status: result.status }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("[admin/workflow-steps] staff action failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update workflow step" },
      { status: 500 }
    );
  }
}

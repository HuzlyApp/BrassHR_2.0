import { NextResponse } from "next/server";
import { z } from "zod";
import {
  resolveCandidateStepRequest,
  type CandidateStepRouteContext,
} from "@/lib/admin/candidate-step-request";
import { sendCandidateStepEmail } from "@/lib/onboarding/candidate-step-email";
import { verifyCandidateStepSubmission } from "@/lib/onboarding/candidate-step-verification";
import { loadCandidateWorkflowStepInspection } from "@/lib/onboarding/candidate-workflow-step-inspection";
import {
  STAFF_REVIEW_NOTE_MAX_LENGTH,
  STAFF_STEP_ACTIONS,
} from "@/lib/onboarding/staff-step-review-shared";
import { applyStaffWorkflowStepAction } from "@/lib/onboarding/staff-workflow-step-review";
import { resolveApplicantEmailAppOrigin } from "@/lib/resolve-app-origin";

export const runtime = "nodejs";

const actionBodySchema = z.object({
  action: z.enum(STAFF_STEP_ACTIONS),
  note: z.string().trim().max(STAFF_REVIEW_NOTE_MAX_LENGTH).optional().nullable(),
  notifyCandidate: z.boolean().optional(),
  clientOrigin: z.string().trim().optional(),
  onBehalfOfCandidate: z.boolean().optional(),
  /** Recruiter verifying a candidate step the candidate already submitted. */
  verifyCandidateSubmission: z.boolean().optional(),
});

/** Staff email asking the candidate to complete one of their own steps. */
const sendEmailBodySchema = z.object({
  action: z.literal("send_email"),
  clientOrigin: z.string().trim().optional(),
});

export async function GET(_req: Request, context: CandidateStepRouteContext) {
  try {
    const resolved = await resolveCandidateStepRequest(context);
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
 * complete a candidate upload step on the candidate's behalf (`onBehalfOfCandidate`),
 * verify a candidate step the candidate submitted (`verifyCandidateSubmission`),
 * or `send_email` to ask the candidate to complete one of their own steps.
 */
export async function POST(req: Request, context: CandidateStepRouteContext) {
  try {
    const resolved = await resolveCandidateStepRequest(context);
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

    if (body.verifyCandidateSubmission === true) {
      if (body.action !== "complete") {
        return NextResponse.json(
          { error: "Candidate submissions can only be marked complete.", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }
      const verified = await verifyCandidateStepSubmission(resolved.supabase, {
        workerId: resolved.workerId,
        tenantId: resolved.tenantId,
        stepRecordId: resolved.stepId,
        note: body.note ?? null,
        actor: { userId: resolved.auth.userId, email: resolved.auth.email },
        origin: resolveApplicantEmailAppOrigin(req, body.clientOrigin),
        request: req,
      });
      if (!verified.ok) {
        return NextResponse.json(
          { error: verified.error, code: verified.code ?? null },
          { status: verified.status }
        );
      }
      return NextResponse.json(verified);
    }

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
      onBehalfOfCandidate: body.onBehalfOfCandidate === true,
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

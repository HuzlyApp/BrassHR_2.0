import { NextRequest, NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { MspSubmissionError } from "@/lib/jobs/msp-submission";
import { getMspSubmissionView, submitCandidateToMsp } from "@/lib/jobs/msp-submission-service";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import { resolveApplicantEmailAppOrigin } from "@/lib/resolve-app-origin";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * GET /api/admin/job-applications/[id]/msp-submission
 * POST records one MSP submission. Later MSP/client stages are not advanced from an external feed.
 */
async function authorize(applicationId: string) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const tenantId = await resolveStaffTenantId(supabase, auth);
  if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });
  if (!applicationId) return NextResponse.json({ error: "Application id is required" }, { status: 400 });
  return { auth, supabase, tenantId, applicationId };
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const gate = await authorize(id?.trim() ?? "");
  if (gate instanceof NextResponse) return gate;

  try {
    const view = await getMspSubmissionView(gate.supabase, gate.auth, gate.tenantId, gate.applicationId);
    return NextResponse.json(view);
  } catch (error) {
    if (error instanceof MspSubmissionError) {
      return NextResponse.json(
        { error: error.message, code: error.code, blockers: error.blockers },
        { status: error.status }
      );
    }
    console.error("[msp-submission] GET", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load MSP submission" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const gate = await authorize(id?.trim() ?? "");
  if (gate instanceof NextResponse) return gate;

  try {
    const body = (await req.json().catch(() => null)) as {
      mspReference?: unknown;
      notes?: unknown;
    } | null;
    const result = await submitCandidateToMsp(gate.supabase, gate.auth, {
      tenantId: gate.tenantId,
      applicationId: gate.applicationId,
      mspReference: body?.mspReference,
      notes: body?.notes,
      origin: resolveApplicantEmailAppOrigin(req),
    });
    return NextResponse.json({
      submission: result.submission,
      decision: result.decision,
      statusName: result.statusName,
    });
  } catch (error) {
    if (error instanceof MspSubmissionError) {
      return NextResponse.json(
        { error: error.message, code: error.code, blockers: error.blockers },
        { status: error.status }
      );
    }
    console.error("[msp-submission] POST", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit candidate to the MSP" },
      { status: 500 }
    );
  }
}

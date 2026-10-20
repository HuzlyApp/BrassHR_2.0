import { NextRequest, NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { getApplicationStatusSummaryForWorker } from "@/lib/jobs/application-statuses/attach-worker-application-status";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/** GET — resolve primary job application status for a candidate (worker). */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ workerId: string }> }
) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });

    const { workerId: raw } = await context.params;
    const workerId = raw?.trim();
    if (!workerId) {
      return NextResponse.json({ error: "Worker id is required" }, { status: 400 });
    }

    const { data: worker, error: workerError } = await supabase
      .from("worker")
      .select("id")
      .eq("id", workerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (workerError) throw workerError;
    if (!worker) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

    const summary = await getApplicationStatusSummaryForWorker(supabase, {
      tenantId,
      workerId,
    });

    return NextResponse.json({
      applicationId: summary?.applicationId ?? null,
      ambiguous: summary?.ambiguous ?? false,
      jobTitle: summary?.jobTitle ?? null,
      sourceType: summary?.sourceType ?? null,
      status: summary
        ? {
            id: summary.statusId,
            name: summary.statusName,
            systemKey: summary.systemKey,
          }
        : null,
    });
  } catch (error) {
    console.error("[workers/:workerId/application-status]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load application status" },
      { status: 500 }
    );
  }
}

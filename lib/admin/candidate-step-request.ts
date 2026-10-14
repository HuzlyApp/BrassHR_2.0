import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireStaffApiSession, type StaffApiAuthContext } from "@/lib/auth/api-session";
import { canAccessWorkerRecord } from "@/lib/auth/worker-record-access";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { parseRequiredUuid } from "@/lib/validation/uuid";

export type CandidateStepRouteContext = { params: Promise<{ workerId: string; stepId: string }> };

export type ResolvedCandidateStepRequest =
  | {
      ok: true;
      auth: StaffApiAuthContext;
      supabase: SupabaseClient;
      tenantId: string;
      workerId: string;
      stepId: string;
    }
  | { ok: false; response: NextResponse };

/** Staff session + tenant + candidate access checks shared by the candidate workflow-step routes. */
export async function resolveCandidateStepRequest(
  context: CandidateStepRouteContext
): Promise<ResolvedCandidateStepRequest> {
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

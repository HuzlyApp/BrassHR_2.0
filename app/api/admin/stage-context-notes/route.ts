import { NextRequest, NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { resolveStaffTenantScope } from "@/lib/auth/staff-tenant-scope";
import { canAccessWorkerRecord } from "@/lib/auth/worker-record-access";
import { isAiMatchStatusStageName } from "@/lib/jobs/application-statuses/stage-assignments";
import { resolveApplicationContextForWorker } from "@/lib/jobs/resolve-application-context";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  isStageNoteContextKind,
  loadStageContextNotes,
  type StageNoteContextKind,
} from "@/lib/stage-context-notes";
import { parseRequiredUuid } from "@/lib/validation/uuid";

export const runtime = "nodejs";

async function resolveWorkerAccess(workerIdRaw: string) {
  const idCheck = parseRequiredUuid(workerIdRaw, "workerId");
  if (!idCheck.ok) {
    return { error: NextResponse.json({ error: idCheck.error }, { status: 400 }) };
  }

  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return { error: auth };

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return {
      error: NextResponse.json({ error: "Supabase service role not configured" }, { status: 503 }),
    };
  }

  const { data: worker, error } = await supabase
    .from("worker")
    .select("id, user_id, tenant_id")
    .eq("id", idCheck.value)
    .maybeSingle();

  if (error) throw error;
  if (!worker?.id || !worker.tenant_id) {
    return { error: NextResponse.json({ error: "Worker not found" }, { status: 404 }) };
  }

  if (!canAccessWorkerRecord(auth, { id: String(worker.id), user_id: worker.user_id })) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const tenantId = String(worker.tenant_id);
  const scope = await resolveStaffTenantScope(auth.authUser);
  if (scope.mode === "scoped" && scope.tenantId !== tenantId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return {
    supabase,
    workerId: String(worker.id),
    tenantId,
    userId: auth.devBypass ? null : auth.userId,
  };
}

async function assertWorkflowStep(
  supabase: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  input: { tenantId: string; workerId: string; stepId: string }
) {
  const stepCheck = parseRequiredUuid(input.stepId, "step");
  if (!stepCheck.ok) return stepCheck.error;

  const { data: record, error } = await supabase
    .from("applicant_workflow_step_records")
    .select("id, workflow_instance_id")
    .eq("id", stepCheck.value)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!record?.workflow_instance_id) return "Workflow step not found";

  const { data: instance, error: instanceError } = await supabase
    .from("applicant_workflow_instances")
    .select("id, worker_id")
    .eq("id", record.workflow_instance_id)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (instanceError) throw instanceError;
  if (!instance || String(instance.worker_id) !== input.workerId) return "Workflow step not found";
  return null;
}

function parseContext(kindRaw: string, keyRaw: string): {
  contextKind: StageNoteContextKind;
  contextKey: string;
} | { error: string } {
  if (!isStageNoteContextKind(kindRaw)) {
    return { error: "Unknown note context" };
  }
  const contextKey = keyRaw.trim();
  if (!contextKey || contextKey.length > 200) {
    return { error: "Missing note context" };
  }
  if (kindRaw === "ai_match_step" && !isAiMatchStatusStageName(contextKey)) {
    return { error: "Unknown AI analysis step" };
  }
  return { contextKind: kindRaw, contextKey };
}

export async function GET(req: NextRequest) {
  try {
    const workerIdRaw = req.nextUrl.searchParams.get("workerId")?.trim() || "";
    const contextKindRaw = req.nextUrl.searchParams.get("contextKind")?.trim() || "";
    const contextKeyRaw = req.nextUrl.searchParams.get("contextKey")?.trim() || "";
    const applicationId = req.nextUrl.searchParams.get("applicationId")?.trim() || null;
    if (!workerIdRaw) {
      return NextResponse.json({ error: "Missing workerId" }, { status: 400 });
    }
    const context = parseContext(contextKindRaw, contextKeyRaw);
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: 400 });
    }

    const resolved = await resolveWorkerAccess(workerIdRaw);
    if ("error" in resolved && resolved.error) return resolved.error;
    const { supabase, workerId, tenantId } = resolved;

    if (context.contextKind === "workflow_step") {
      const stepError = await assertWorkflowStep(supabase, {
        tenantId,
        workerId,
        stepId: context.contextKey,
      });
      if (stepError) return NextResponse.json({ error: stepError }, { status: 404 });
    }

    const notes = await loadStageContextNotes(supabase, {
      tenantId,
      workerId,
      contextKind: context.contextKind,
      contextKey: context.contextKey,
      applicationId,
    });
    return NextResponse.json({ notes });
  } catch (err) {
    console.error("[admin/stage-context-notes GET]", err);
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      workerId?: string;
      body?: string;
      applicationId?: string;
      contextKind?: string;
      contextKey?: string;
    };
    const workerIdRaw = body.workerId?.trim() || "";
    const noteBody = body.body?.trim() || "";
    const applicationIdRaw = body.applicationId?.trim() || null;
    const context = parseContext(body.contextKind?.trim() || "", body.contextKey?.trim() || "");

    if (!workerIdRaw) {
      return NextResponse.json({ error: "Missing workerId" }, { status: 400 });
    }
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: 400 });
    }
    if (!noteBody) {
      return NextResponse.json({ error: "Note cannot be empty" }, { status: 400 });
    }
    if (noteBody.length > 8000) {
      return NextResponse.json({ error: "Note is too long" }, { status: 400 });
    }

    const resolved = await resolveWorkerAccess(workerIdRaw);
    if ("error" in resolved && resolved.error) return resolved.error;
    const { supabase, workerId, tenantId, userId } = resolved;

    if (context.contextKind === "workflow_step") {
      const stepError = await assertWorkflowStep(supabase, {
        tenantId,
        workerId,
        stepId: context.contextKey,
      });
      if (stepError) return NextResponse.json({ error: stepError }, { status: 404 });
    }

    const ctx = await resolveApplicationContextForWorker({
      supabase,
      tenantId,
      workerId,
      applicationId: applicationIdRaw,
    });
    if (applicationIdRaw && !ctx.applicationId) {
      return NextResponse.json({ error: "Application not found for this worker" }, { status: 404 });
    }
    if (context.contextKind === "ai_match_step" && !ctx.applicationId) {
      return NextResponse.json(
        { error: "applicationId is required for AI analysis notes" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("stage_context_notes")
      .insert({
        tenant_id: tenantId,
        worker_id: workerId,
        application_id: ctx.applicationId,
        context_kind: context.contextKind,
        context_key: context.contextKey,
        body: noteBody,
        created_by_user_id: userId,
      })
      .select("id")
      .single();
    if (error) throw error;

    const notes = await loadStageContextNotes(supabase, {
      tenantId,
      workerId,
      contextKind: context.contextKind,
      contextKey: context.contextKey,
      applicationId: ctx.applicationId,
    });
    const saved = notes.find((note) => note.id === String(data.id)) ?? notes[0] ?? null;
    return NextResponse.json({ note: saved });
  } catch (err) {
    console.error("[admin/stage-context-notes POST]", err);
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

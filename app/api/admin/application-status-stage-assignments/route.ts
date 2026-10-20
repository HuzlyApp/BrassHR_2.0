import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { requireWorkflowAdmin } from "@/lib/auth/workflow-admin";
import { writeActivityLog } from "@/lib/audit/activity-log";
import {
  ApplicationStatusError,
  STAGE_STATUS_LANES,
  assignGroupToPreHireStage,
  listApplicationStatusGroupStageAssignments,
  appendApplicationStatusStageReasonCode,
  findOrCreateApplicationStatusStageNote,
  getApplicationStatusButtonLabels,
  listApplicationStatusStageButtons,
  saveApplicationStatusButtonLabels,
  listApplicationStatusStageLanes,
  listApplicationStatusStageNotes,
  listApplicationStatusStageReasonCodes,
  replaceApplicationStatusStageLanes,
  replaceApplicationStatusStageReasonCodes,
  unassignGroupFromPreHireStage,
  type StageStatusLane,
} from "@/lib/jobs/application-statuses";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

function handleError(error: unknown) {
  if (error instanceof ApplicationStatusError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }
  console.error("[admin/application-status-stage-assignments]", error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Failed to manage stage assignments" },
    { status: 500 }
  );
}

function parseLanePlacement(value: unknown): { statusId: string; noteId?: string | null; note?: string | null } | null {
  if (typeof value === "string" && value.trim()) return { statusId: value.trim() };
  if (!value || typeof value !== "object") return null;
  const record = value as { statusId?: unknown; noteId?: unknown; note?: unknown };
  const statusId = typeof record.statusId === "string" ? record.statusId.trim() : "";
  if (!statusId) return null;
  const placement: { statusId: string; noteId?: string | null; note?: string | null } = { statusId };
  if (record.noteId === null) placement.noteId = null;
  else if (typeof record.noteId === "string" && record.noteId.trim()) placement.noteId = record.noteId.trim();
  if ("note" in record) placement.note = typeof record.note === "string" ? record.note : null;
  return placement;
}

/** GET — list Pre-Hire stage ↔ status group assignments. */
export async function GET() {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });
    const [assignments, lanes, reasonCodes, buttonPrefs, buttonLabels, notes, flowsResult] = await Promise.all([
      listApplicationStatusGroupStageAssignments(supabase, tenantId),
      listApplicationStatusStageLanes(supabase, tenantId),
      listApplicationStatusStageReasonCodes(supabase, tenantId),
      listApplicationStatusStageButtons(supabase, tenantId),
      getApplicationStatusButtonLabels(supabase, tenantId),
      listApplicationStatusStageNotes(supabase, tenantId),
      supabase
        .from("onboarding_flows")
        .select("id, name, status")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true }),
    ]);
    const workflows = ((flowsResult.data ?? []) as Array<{ id?: string; name?: string; status?: string }>)
      .filter((row) => row.id && row.name)
      .map((row) => ({
        id: String(row.id),
        name: String(row.name),
        status: String(row.status ?? ""),
      }));
    return NextResponse.json(
      {
        assignments,
        lanes,
        reasonCodes,
        buttonPrefs,
        buttonLabels,
        notes,
        workflows,
        canManage: auth.role === "admin" || auth.godAdmin,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PUT — assign or unassign a status GROUP on a Pre-Hire stage.
 * One group may be available on many stages.
 * Body:
 * - { action: "assign", stageName, groupId }
 * - { action: "unassign", stageName, groupId }
 * - { action: "setLanes", stageName, workflowId?, lanes: { happy_path, alternate, closed } }
 * - { action: "setButtonLabels", alternateLabel, closedLabel }
 * - { action: "setReasonCodes", stageName, workflowId?, codes: string[] }
 * - { action: "addReasonCode", stageName, workflowId?, code }
 * - { action: "findOrCreateNote", stageName, workflowId?, note }
 */
export async function PUT(req: NextRequest) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const forbidden = requireWorkflowAdmin(auth);
  if (forbidden) return forbidden;

  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });

    const body = (await req.json().catch(() => null)) as {
      action?: unknown;
      stageName?: unknown;
      groupId?: unknown;
      lanes?: unknown;
      workflowId?: unknown;
      codes?: unknown;
      code?: unknown;
      note?: unknown;
      alternateLabel?: unknown;
      closedLabel?: unknown;
    } | null;

    const action = typeof body?.action === "string" ? body.action : "";
    const stageName = typeof body?.stageName === "string" ? body.stageName : "";
    const groupId = typeof body?.groupId === "string" ? body.groupId : "";
    const workflowId = typeof body?.workflowId === "string" ? body.workflowId.trim() : "";

    if (action === "setReasonCodes") {
      if (!stageName) {
        return NextResponse.json({ error: "stageName is required" }, { status: 400 });
      }
      const codes = Array.isArray(body?.codes)
        ? body.codes.filter((code): code is string => typeof code === "string")
        : [];
      const saved = await replaceApplicationStatusStageReasonCodes(supabase, {
        tenantId,
        stageName,
        codes,
        workflowId: workflowId || null,
      });
      await writeActivityLog({
        actorUserId: auth.userId,
        action: "application_status_stage_reason_codes.updated",
        entityType: "application_status_stage",
        entityId: stageName,
        tenantId,
        metadata: { stageName, workflowId: workflowId || null, codes },
        request: req,
      });
      return NextResponse.json({ reasonCodes: saved });
    }

    if (action === "addReasonCode") {
      if (!stageName) {
        return NextResponse.json({ error: "stageName is required" }, { status: 400 });
      }
      const code = typeof body?.code === "string" ? body.code : "";
      const saved = await appendApplicationStatusStageReasonCode(supabase, {
        tenantId,
        stageName,
        code,
        workflowId: workflowId || null,
      });
      await writeActivityLog({
        actorUserId: auth.userId,
        action: "application_status_stage_reason_codes.updated",
        entityType: "application_status_stage",
        entityId: stageName,
        tenantId,
        metadata: { stageName, workflowId: workflowId || null, code, created: saved.created },
        request: req,
      });
      return NextResponse.json({ reasonCodes: saved.reasonCodes, created: saved.created });
    }

    if (action === "findOrCreateNote") {
      if (!stageName) {
        return NextResponse.json({ error: "stageName is required" }, { status: 400 });
      }
      const note = typeof body?.note === "string" ? body.note : "";
      const saved = await findOrCreateApplicationStatusStageNote(supabase, {
        tenantId,
        stageName,
        body: note,
        workflowId: workflowId || null,
      });
      const notes = await listApplicationStatusStageNotes(supabase, tenantId);
      await writeActivityLog({
        actorUserId: auth.userId,
        action: "application_status_stage_notes.saved",
        entityType: "application_status_stage",
        entityId: stageName,
        tenantId,
        metadata: { stageName, workflowId: workflowId || null, created: saved.created },
        request: req,
      });
      return NextResponse.json({ note: saved.note, created: saved.created, notes });
    }

    if (action === "setButtonLabels") {
      const alternateLabel = typeof body?.alternateLabel === "string" ? body.alternateLabel : null;
      const closedLabel = typeof body?.closedLabel === "string" ? body.closedLabel : null;
      const buttonLabels = await saveApplicationStatusButtonLabels(supabase, {
        tenantId,
        alternateLabel,
        closedLabel,
      });
      await writeActivityLog({
        actorUserId: auth.userId,
        action: "application_status_button_labels.updated",
        entityType: "tenant",
        entityId: tenantId,
        tenantId,
        metadata: { alternateLabel, closedLabel },
        request: req,
      });
      return NextResponse.json({ buttonLabels });
    }

    if (action === "setLanes") {
      if (!stageName) {
        return NextResponse.json({ error: "stageName is required" }, { status: 400 });
      }
      const source =
        body?.lanes && typeof body.lanes === "object" ? (body.lanes as Record<string, unknown>) : {};
      const lanes = {} as Record<StageStatusLane, { statusId: string; noteId?: string | null; note?: string | null }[]>;
      for (const lane of STAGE_STATUS_LANES) {
        const ids = source[lane];
        lanes[lane] = Array.isArray(ids)
          ? ids.flatMap((id) => {
              const placement = parseLanePlacement(id);
              return placement ? [placement] : [];
            })
          : [];
      }
      const saved = await replaceApplicationStatusStageLanes(supabase, {
        tenantId,
        stageName,
        lanes,
        workflowId: workflowId || null,
      });
      const buttonPrefs = await listApplicationStatusStageButtons(supabase, tenantId);
      await writeActivityLog({
        actorUserId: auth.userId,
        action: "application_status_stage_lanes.updated",
        entityType: "application_status_stage",
        entityId: stageName,
        tenantId,
        metadata: { stageName, workflowId: workflowId || null, lanes },
        request: req,
      });
      return NextResponse.json({ lanes: saved, buttonPrefs });
    }

    if (!stageName || !groupId) {
      return NextResponse.json(
        { error: "stageName and groupId are required" },
        { status: 400 }
      );
    }

    let assignments;
    if (action === "unassign") {
      assignments = await unassignGroupFromPreHireStage(supabase, {
        tenantId,
        stageName,
        groupId,
      });
      await writeActivityLog({
        actorUserId: auth.userId,
        action: "application_status_group_stage_assignment.unassigned",
        entityType: "application_status_group",
        entityId: groupId,
        tenantId,
        metadata: { stageName, groupId },
        request: req,
      });
    } else if (action === "assign") {
      assignments = await assignGroupToPreHireStage(supabase, {
        tenantId,
        stageName,
        groupId,
        actorUserId: auth.userId,
      });
      await writeActivityLog({
        actorUserId: auth.userId,
        action: "application_status_group_stage_assignment.assigned",
        entityType: "application_status_group",
        entityId: groupId,
        tenantId,
        metadata: { stageName, groupId },
        request: req,
      });
    } else {
      return NextResponse.json(
        { error: 'action must be "assign" or "unassign"' },
        { status: 400 }
      );
    }

    return NextResponse.json({ assignments });
  } catch (error) {
    return handleError(error);
  }
}

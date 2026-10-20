import { NextRequest, NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { requireWorkflowAdmin } from "@/lib/auth/workflow-admin";
import { writeActivityLog } from "@/lib/audit/activity-log";
import {
  ApplicationStatusError,
  createApplicationStatus,
  countApplicationsByStatus,
  listApplicationStatusGroups,
  listApplicationStatuses,
  replaceGroupButtonLanes,
  STAGE_STATUS_LANES,
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
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error &&
          "message" in error &&
          typeof (error as { message: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Failed to manage statuses";
  console.error("[admin/application-statuses]", message, error);
  return NextResponse.json({ error: message }, { status: 500 });
}

/** GET — list statuses for the current tenant (staff). ?activeOnly=1 for recruiter dropdowns. */
export async function GET(req: NextRequest) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });

    const activeOnly = req.nextUrl.searchParams.get("activeOnly") === "1";
    const includeCounts = req.nextUrl.searchParams.get("includeCounts") === "1";
    const statuses = await listApplicationStatuses(supabase, tenantId, { activeOnly });
    const groups = await listApplicationStatusGroups(supabase, tenantId);
    const canManage = auth.role === "admin" || auth.godAdmin;
    if (!includeCounts) {
      return NextResponse.json({ statuses, groups, canManage });
    }
    const counts = await countApplicationsByStatus(supabase, tenantId, statuses);
    return NextResponse.json({
      statuses: statuses.map((status) => ({
        ...status,
        applicationCount: counts[status.id] ?? 0,
      })),
      groups,
      canManage,
    });
  } catch (error) {
    return handleError(error);
  }
}

/** POST — create status (admin only). */
export async function POST(req: NextRequest) {
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
      name?: unknown;
      description?: unknown;
      color?: unknown;
      sortOrder?: unknown;
      isActive?: unknown;
      isDefault?: unknown;
      groupId?: unknown;
    } | null;

    const name = typeof body?.name === "string" ? body.name : "";
    const status = await createApplicationStatus(supabase, {
      tenantId,
      name,
      description: typeof body?.description === "string" ? body.description : null,
      color: typeof body?.color === "string" ? body.color : null,
      sortOrder: typeof body?.sortOrder === "number" ? body.sortOrder : undefined,
      isActive: typeof body?.isActive === "boolean" ? body.isActive : undefined,
      isDefault: typeof body?.isDefault === "boolean" ? body.isDefault : undefined,
      groupId: typeof body?.groupId === "string" ? body.groupId : null,
      createdBy: auth.userId,
    });

    await writeActivityLog({
      actorUserId: auth.userId,
      action: "application_status_catalog.created",
      entityType: "application_status",
      entityId: status.id,
      tenantId,
      metadata: {
        name: status.name,
        groupId: status.groupId,
        groupSystemKey: status.groupSystemKey,
      },
      request: req,
    });

    return NextResponse.json({ status }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

function readLaneIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

/** PATCH — save the three button categories on one status group (admin only). */
export async function PATCH(req: NextRequest) {
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
      groupId?: unknown;
      lanes?: unknown;
    } | null;
    if (body?.action !== "setGroupLanes" || typeof body.groupId !== "string" || !body.groupId) {
      return NextResponse.json({ error: "Unknown status update" }, { status: 400 });
    }
    const rawLanes =
      body.lanes && typeof body.lanes === "object" ? (body.lanes as Record<string, unknown>) : {};
    const lanes = Object.fromEntries(
      STAGE_STATUS_LANES.map((lane) => [lane, readLaneIds(rawLanes[lane])])
    ) as Record<StageStatusLane, string[]>;

    await replaceGroupButtonLanes(supabase, { tenantId, groupId: body.groupId, lanes });
    await writeActivityLog({
      actorUserId: auth.userId,
      action: "application_status_catalog.group_lanes_updated",
      entityType: "application_status_group",
      entityId: body.groupId,
      tenantId,
      metadata: {
        happyPath: lanes.happy_path.length,
        alternate: lanes.alternate.length,
        closed: lanes.closed.length,
      },
      request: req,
    });

    const statuses = await listApplicationStatuses(supabase, tenantId, { ensureDefaults: false });
    return NextResponse.json({ statuses });
  } catch (error) {
    return handleError(error);
  }
}

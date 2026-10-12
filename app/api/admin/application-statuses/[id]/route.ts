import { NextRequest, NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { requireWorkflowAdmin } from "@/lib/auth/workflow-admin";
import { writeActivityLog } from "@/lib/audit/activity-log";
import {
  ApplicationStatusError,
  deleteApplicationStatus,
  listApplicationStatuses,
  updateApplicationStatus,
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
  console.error("[admin/application-statuses/:id]", error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Failed to update status" },
    { status: 500 }
  );
}

/** PATCH — update / activate / deactivate status (admin only). */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const forbidden = requireWorkflowAdmin(auth);
  if (forbidden) return forbidden;

  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });

    const { id } = await context.params;
    const statusId = id?.trim();
    if (!statusId) {
      return NextResponse.json({ error: "Status id is required" }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as {
      name?: unknown;
      description?: unknown;
      color?: unknown;
      sortOrder?: unknown;
      isActive?: unknown;
      isDefault?: unknown;
      groupId?: unknown;
    } | null;

    const before = (await listApplicationStatuses(supabase, tenantId, { ensureDefaults: false })).find(
      (row) => row.id === statusId
    );

    const status = await updateApplicationStatus(supabase, {
      tenantId,
      statusId,
      name: typeof body?.name === "string" ? body.name : undefined,
      description:
        body?.description === null
          ? null
          : typeof body?.description === "string"
            ? body.description
            : undefined,
      color:
        body?.color === null
          ? null
          : typeof body?.color === "string"
            ? body.color
            : undefined,
      sortOrder: typeof body?.sortOrder === "number" ? body.sortOrder : undefined,
      isActive: typeof body?.isActive === "boolean" ? body.isActive : undefined,
      isDefault: typeof body?.isDefault === "boolean" ? body.isDefault : undefined,
      groupId:
        body?.groupId === null
          ? null
          : typeof body?.groupId === "string"
            ? body.groupId
            : undefined,
    });

    await writeActivityLog({
      actorUserId: auth.userId,
      action: "application_status_catalog.updated",
      entityType: "application_status",
      entityId: status.id,
      tenantId,
      metadata: {
        before: before
          ? {
              name: before.name,
              description: before.description,
              isActive: before.isActive,
              groupId: before.groupId,
              groupSystemKey: before.groupSystemKey,
            }
          : null,
        after: {
          name: status.name,
          description: status.description,
          isActive: status.isActive,
          groupId: status.groupId,
          groupSystemKey: status.groupSystemKey,
        },
      },
      request: req,
    });

    return NextResponse.json({ status });
  } catch (error) {
    return handleError(error);
  }
}

/** DELETE — remove one status from its group (admin only). */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const forbidden = requireWorkflowAdmin(auth);
  if (forbidden) return forbidden;

  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });

    const { id } = await context.params;
    const statusId = id?.trim();
    if (!statusId) {
      return NextResponse.json({ error: "Status id is required" }, { status: 400 });
    }

    const before = (await listApplicationStatuses(supabase, tenantId, { ensureDefaults: false })).find(
      (row) => row.id === statusId
    );

    await deleteApplicationStatus(supabase, { tenantId, statusId });

    await writeActivityLog({
      actorUserId: auth.userId,
      action: "application_status_catalog.deleted",
      entityType: "application_status",
      entityId: statusId,
      tenantId,
      metadata: before
        ? { name: before.name, groupId: before.groupId, groupSystemKey: before.groupSystemKey }
        : undefined,
      request: req,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}

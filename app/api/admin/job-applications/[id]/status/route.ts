import { NextRequest, NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import {
  ApplicationStatusError,
  changeApplicationStatus,
  changeApplicationStatusBySystemKey,
} from "@/lib/jobs/application-statuses";
import { isApplicationPipelineStatus } from "@/lib/jobs/application-status";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import { guardJobApplicationStatusChange } from "@/lib/jobs/msp-submission-service";
import { resolveApplicantEmailAppOrigin } from "@/lib/resolve-app-origin";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * PATCH /api/admin/job-applications/[id]/status
 * Body: { statusId: string, note?: string } OR legacy { status: pipelineKey, note?: string }
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });

    const { id } = await context.params;
    const applicationId = id?.trim();
    if (!applicationId) {
      return NextResponse.json({ error: "Application id is required" }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as {
      statusId?: unknown;
      status?: unknown;
      note?: unknown;
      stageName?: unknown;
    } | null;

    const note =
      typeof body?.note === "string"
        ? body.note
        : body?.note === null
          ? null
          : undefined;

    const statusId = typeof body?.statusId === "string" ? body.statusId.trim() : "";
    const legacyStatus =
      typeof body?.status === "string" ? body.status.trim().toLowerCase() : "";
    const stageName = typeof body?.stageName === "string" ? body.stageName.trim() : "";
    const origin = resolveApplicantEmailAppOrigin(req);

    if (statusId || isApplicationPipelineStatus(legacyStatus)) {
      await guardJobApplicationStatusChange(supabase, {
        tenantId,
        applicationId,
        statusId: statusId || undefined,
        systemKey: statusId ? undefined : legacyStatus,
        stageName: stageName || undefined,
      });
    }

    let result;
    if (statusId) {
      result = await changeApplicationStatus(supabase, {
        tenantId,
        applicationId,
        statusId,
        changedByUserId: auth.userId,
        note,
        origin,
      });
    } else if (isApplicationPipelineStatus(legacyStatus)) {
      result = await changeApplicationStatusBySystemKey(supabase, {
        tenantId,
        applicationId,
        systemKey: legacyStatus,
        changedByUserId: auth.userId,
        note,
        origin,
      });
    } else {
      return NextResponse.json(
        { error: "statusId (or legacy status) is required" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      unchanged: result.unchanged,
      application: {
        id: result.application.id,
        status: result.application.status,
        statusId: result.application.statusId,
        statusName: result.application.statusName,
      },
      history: result.history
        ? {
            id: result.history.id,
            fromStatus: result.history.fromStatus,
            toStatus: result.history.toStatus,
            note: result.history.note,
            changedBy: {
              id: result.history.changedByUserId,
            },
            changedAt: result.history.changedAt,
          }
        : null,
      postHire: result.postHire,
    });
  } catch (error) {
    if (error instanceof ApplicationStatusError) {
      return NextResponse.json(
        { 
          error: error.message, 
          code: error.code,
          ...(error.metadata && { metadata: error.metadata })
        },
        { status: error.status }
      );
    }
    console.error("[job-applications/:id/status]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to change status" },
      { status: 500 }
    );
  }
}

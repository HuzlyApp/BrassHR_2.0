import { NextRequest, NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { requireWorkflowAdmin } from "@/lib/auth/workflow-admin";
import {
  ApplicationStatusError,
  updateApplicationStatusGroup,
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
  console.error("[admin/application-status-groups/:id]", error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Failed to update status group" },
    { status: 500 }
  );
}

/** PATCH — rename a group or update its notes (admin only). */
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
    const groupId = id?.trim();
    if (!groupId) {
      return NextResponse.json({ error: "Group id is required" }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as {
      name?: unknown;
      description?: unknown;
    } | null;

    const group = await updateApplicationStatusGroup(supabase, {
      tenantId,
      groupId,
      name: typeof body?.name === "string" ? body.name : undefined,
      description:
        body?.description === null
          ? null
          : typeof body?.description === "string"
            ? body.description
            : undefined,
    });

    return NextResponse.json({ group });
  } catch (error) {
    return handleError(error);
  }
}

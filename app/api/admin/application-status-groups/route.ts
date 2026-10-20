import { NextRequest, NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { requireWorkflowAdmin } from "@/lib/auth/workflow-admin";
import {
  ApplicationStatusError,
  createApplicationStatusGroup,
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
  console.error("[admin/application-status-groups]", error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Failed to manage status groups" },
    { status: 500 }
  );
}

/** POST — create a status group (admin only). */
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
    } | null;

    const group = await createApplicationStatusGroup(supabase, {
      tenantId,
      name: typeof body?.name === "string" ? body.name : "",
      description:
        body?.description === null
          ? null
          : typeof body?.description === "string"
            ? body.description
            : null,
    });

    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

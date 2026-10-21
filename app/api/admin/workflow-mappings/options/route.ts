import { NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { EMPLOYMENT_TYPES } from "@/lib/jobs/types";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { listPublishedWorkflowOptions } from "@/lib/workflow-mappings/service";

function forbidden() {
  return NextResponse.json({ error: "Administrator role required" }, { status: 403 });
}

const LOCATION_TYPES = ["On-site", "Remote", "Hybrid"];

export async function GET(req: Request) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "admin" && !auth.godAdmin) return forbidden();
  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });

    const url = new URL(req.url);
    const employmentType = url.searchParams.get("employmentType") || undefined;

    const [professions, specialties, workflows] = await Promise.all([
      supabase
        .from("tenant_professions")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("specialties")
        .select("id, profession_id, name, code")
        .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
        .eq("is_active", true)
        .order("name"),
      listPublishedWorkflowOptions(supabase, tenantId, { employmentType }),
    ]);

    if (professions.error) throw professions.error;
    if (specialties.error) throw specialties.error;

    return NextResponse.json({
      professions: professions.data ?? [],
      specialties: specialties.data ?? [],
      employmentTypes: EMPLOYMENT_TYPES,
      locationTypes: LOCATION_TYPES,
      workflows,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load mapping options" },
      { status: 500 }
    );
  }
}

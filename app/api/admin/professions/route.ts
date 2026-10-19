import { NextRequest, NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { requireWorkflowAdmin } from "@/lib/auth/workflow-admin";
import { resolveEffectiveAdminTenantId } from "@/lib/email-templates/resolve-effective-tenant";
import { industryLabelForKey } from "@/lib/ai-catalog/industry-catalog";
import {
  addTenantProfessionFromCatalog,
  listCatalogProfessionChoices,
  listTenantProfessions,
} from "@/lib/professions/service";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const tenantId = await resolveEffectiveAdminTenantId(supabase, {
    userId: auth.userId,
    authUser: auth.authUser,
    godAdmin: auth.godAdmin,
  });
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant selected" }, { status: 400 });
  }

  try {
    const [result, catalogChoices] = await Promise.all([
      listTenantProfessions(supabase, tenantId),
      listCatalogProfessionChoices(supabase, tenantId),
    ]);
    return NextResponse.json({
      ...result,
      catalogProfessions: catalogChoices.map((choice) => ({
        ...choice,
        industryLabel: industryLabelForKey(choice.industryKey),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load professions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const forbidden = requireWorkflowAdmin(auth);
  if (forbidden) return forbidden;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const tenantId = await resolveEffectiveAdminTenantId(supabase, {
    userId: auth.userId,
    authUser: auth.authUser,
    godAdmin: auth.godAdmin,
  });
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant selected" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { catalogKey?: string };
  try {
    const profession = await addTenantProfessionFromCatalog(supabase, tenantId, body.catalogKey ?? "");
    return NextResponse.json({ profession });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not add profession";
    const status = /already|duplicate|unique/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

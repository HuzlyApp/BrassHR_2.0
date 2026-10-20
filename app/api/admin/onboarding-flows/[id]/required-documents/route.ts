import { NextRequest, NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { requireWorkflowAdmin } from "@/lib/auth/workflow-admin";
import { resolveEffectiveAdminTenantId } from "@/lib/email-templates/resolve-effective-tenant";
import { addFlowDocument, listFlowDocuments } from "@/lib/professions/service";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

async function tenantIdForRequest() {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return { auth, tenantId: null, supabase: null };
  const supabase = createServiceRoleClient();
  if (!supabase) return { auth, tenantId: null, supabase: null };
  const tenantId = await resolveEffectiveAdminTenantId(supabase, {
    userId: auth.userId,
    authUser: auth.authUser,
    godAdmin: auth.godAdmin,
  });
  return { auth, tenantId, supabase };
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const { auth, tenantId, supabase } = await tenantIdForRequest();
  if (auth instanceof NextResponse) return auth;
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });

  const { id } = await context.params;
  try {
    const documents = await listFlowDocuments(supabase, tenantId, id);
    return NextResponse.json({ documents });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load documents";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { auth, tenantId, supabase } = await tenantIdForRequest();
  if (auth instanceof NextResponse) return auth;
  const forbidden = requireWorkflowAdmin(auth);
  if (forbidden) return forbidden;
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });

  const { id } = await context.params;
  const body = (await req.json().catch(() => ({}))) as {
    code?: string;
    name?: string;
    isRequired?: boolean;
    hasExpiration?: boolean;
    collectIssuingOrganization?: boolean;
    collectScope?: boolean;
    collectValidity?: boolean;
    sortOrder?: number;
  };

  try {
    const document = await addFlowDocument(supabase, tenantId, id, {
      code: body.code ?? "",
      name: body.name ?? "",
      isRequired: body.isRequired,
      hasExpiration: body.hasExpiration,
      collectIssuingOrganization: body.collectIssuingOrganization,
      collectScope: body.collectScope,
      collectValidity: body.collectValidity,
      sortOrder: body.sortOrder,
    });
    return NextResponse.json({ document });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not add document";
    const status = /duplicate|unique/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

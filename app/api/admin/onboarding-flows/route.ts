import { NextRequest, NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveEffectiveAdminTenantId } from "@/lib/email-templates/resolve-effective-tenant";
import type { OnboardingDbClient } from "@/lib/onboarding/load-tenant-config";
import {
  createOnboardingFlow,
  listOnboardingFlows,
  type OnboardingFlowStatus,
} from "@/lib/onboarding/onboarding-flows";
import { requireWorkflowAdmin } from "@/lib/auth/workflow-admin";
import { resolveFlowProfessionId } from "@/lib/professions/service";

export const runtime = "nodejs";

async function resolveTenantId(
  supabase: OnboardingDbClient,
  auth: Awaited<ReturnType<typeof requireStaffApiSession>>
): Promise<string | null> {
  if (auth instanceof NextResponse) return null;
  return resolveEffectiveAdminTenantId(supabase, {
    userId: auth.userId,
    authUser: auth.authUser,
    godAdmin: auth.godAdmin,
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const forbidden = requireWorkflowAdmin(auth);
  if (forbidden) return forbidden;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  try {
    const tenantId = await resolveTenantId(supabase as OnboardingDbClient, auth);
    if (!tenantId) {
      return NextResponse.json(
        { error: "No tenant selected", code: "TENANT_REQUIRED" },
        { status: 400 }
      );
    }

    const libraryId = req.nextUrl.searchParams.get("libraryId")?.trim() || undefined;
    const librarySlug = req.nextUrl.searchParams.get("librarySlug")?.trim() || undefined;
    const statusParam = req.nextUrl.searchParams.get("status")?.trim();
    const status =
      statusParam === "published" || statusParam === "unpublished"
        ? statusParam
        : undefined;

    const result = await listOnboardingFlows(supabase as OnboardingDbClient, tenantId, {
      libraryId,
      librarySlug: libraryId ? undefined : librarySlug ?? "onboarding",
      status,
    });

    return NextResponse.json({ ...result, tenantId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load flows";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type CreateBody = {
  name?: string;
  libraryId?: string | null;
  templateId?: string | null;
  createAsBlank?: boolean;
  status?: OnboardingFlowStatus;
  employmentType?: string | null;
  professionId?: string | null;
};

export async function POST(req: NextRequest) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const forbidden = requireWorkflowAdmin(auth);
  if (forbidden) return forbidden;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  let body: CreateBody = {};
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const tenantId = await resolveTenantId(supabase as OnboardingDbClient, auth);
    if (!tenantId) {
      return NextResponse.json(
        { error: "No tenant selected", code: "TENANT_REQUIRED" },
        { status: 400 }
      );
    }

    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Flow name is required" }, { status: 400 });
    }

    const professionRef = body.professionId?.trim() || "";
    const professionId = professionRef
      ? await resolveFlowProfessionId(supabase, tenantId, professionRef)
      : null;

    const flow = await createOnboardingFlow(supabase as OnboardingDbClient, tenantId, {
      name,
      libraryId: body.libraryId ?? null,
      templateId: body.createAsBlank ? null : body.templateId ?? null,
      createAsBlank: body.createAsBlank === true,
      status: body.status,
      createdBy: auth.userId,
      employmentType: body.employmentType ?? null,
      professionId,
    });

    return NextResponse.json({ flow });
  } catch (err: unknown) {
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to create flow";
    const status = msg.includes("already exists")
      ? 409
      : msg.toLowerCase().includes("profession")
        ? 400
        : 500;
    console.error("[onboarding-flows POST]", err);
    return NextResponse.json({ error: msg }, { status });
  }
}

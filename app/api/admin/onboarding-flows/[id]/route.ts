import { NextRequest, NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveEffectiveAdminTenantId } from "@/lib/email-templates/resolve-effective-tenant";
import type { OnboardingDbClient } from "@/lib/onboarding/load-tenant-config";
import {
  deleteOnboardingFlow,
  getOnboardingFlowById,
  OnboardingFlowDeleteError,
  saveOnboardingFlowAsTemplate,
  updateOnboardingFlow,
  type OnboardingFlowStatus,
} from "@/lib/onboarding/onboarding-flows";
import { publishOnboardingFromWorkflow } from "@/lib/onboarding/publish-onboarding-from-workflow";
import { syncActiveWorkflowInstancesSafely } from "@/lib/onboarding/sync-workflow-instances";
import {
  isSerializableWorkflowState,
  type SerializableWorkflowState,
} from "@/lib/onboarding/workflow-builder-serialization";
import { requireWorkflowAdmin } from "@/lib/auth/workflow-admin";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

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

export async function GET(_req: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const forbidden = requireWorkflowAdmin(auth);
  if (forbidden) return forbidden;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { id } = await context.params;

  try {
    const tenantId = await resolveTenantId(supabase as OnboardingDbClient, auth);
    if (!tenantId) {
      return NextResponse.json(
        { error: "No tenant selected", code: "TENANT_REQUIRED" },
        { status: 400 }
      );
    }

    const flow = await getOnboardingFlowById(supabase as OnboardingDbClient, tenantId, id);
    if (!flow) {
      return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    }

    return NextResponse.json({ flow });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load flow";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type PatchBody = {
  name?: string;
  status?: OnboardingFlowStatus;
  libraryId?: string | null;
  builderDraft?: SerializableWorkflowState;
  publish?: boolean;
  saveTemplate?: boolean;
  templateName?: string;
};

export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const forbidden = requireWorkflowAdmin(auth);
  if (forbidden) return forbidden;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { id } = await context.params;

  let body: PatchBody = {};
  try {
    body = (await req.json()) as PatchBody;
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

    const builderDraft =
      body.builderDraft && isSerializableWorkflowState(body.builderDraft)
        ? body.builderDraft
        : undefined;

    let status = body.status;
    if (body.publish === true) {
      status = "published";
    }
    // Do not demote to draft when the client omits publish or sends publish:false on autosave.

    const flow = await updateOnboardingFlow(supabase as OnboardingDbClient, tenantId, id, {
      name: body.name,
      status,
      libraryId: body.libraryId,
      builderDraft,
      updatedBy: auth.userId,
    });

    if (body.publish === true) {
      const draftToPublish = builderDraft ?? flow.builderDraft;
      if (!isSerializableWorkflowState(draftToPublish)) {
        return NextResponse.json({ error: "Invalid builder draft" }, { status: 400 });
      }
      await publishOnboardingFromWorkflow(
        supabase as OnboardingDbClient,
        tenantId,
        draftToPublish,
        auth.userId,
        body.name?.trim() || flow.name
      );
      await syncActiveWorkflowInstancesSafely(supabase as OnboardingDbClient, {
        tenantId,
        flowId: id,
        draft: draftToPublish,
        flowName: body.name?.trim() || flow.name,
      });
    }

    let savedTemplate: { templateId: string } | null = null;
    if (body.saveTemplate && builderDraft) {
      savedTemplate = await saveOnboardingFlowAsTemplate(
        supabase as OnboardingDbClient,
        tenantId,
        id,
        {
          templateName: body.templateName?.trim() || flow.name,
          createdBy: auth.userId,
        }
      );
    }

    return NextResponse.json({ flow, savedTemplate });
  } catch (err: unknown) {
    console.error("[onboarding-flows PATCH]", err);
    const msg = err instanceof Error ? err.message : "Failed to update flow";
    const status = msg.includes("already exists") ? 409 : msg === "Flow not found" ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const forbidden = requireWorkflowAdmin(auth);
  if (forbidden) return forbidden;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { id } = await context.params;

  try {
    const tenantId = await resolveTenantId(supabase as OnboardingDbClient, auth);
    if (!tenantId) {
      return NextResponse.json(
        { error: "No tenant selected", code: "TENANT_REQUIRED" },
        { status: 400 }
      );
    }

    await deleteOnboardingFlow(supabase as OnboardingDbClient, tenantId, id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to delete workflow";
    const status = err instanceof OnboardingFlowDeleteError ? err.status : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

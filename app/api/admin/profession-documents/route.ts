import { NextRequest, NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { requireWorkflowAdmin } from "@/lib/auth/workflow-admin";
import { industryLabelForKey } from "@/lib/ai-catalog/industry-catalog";
import { resolveEffectiveAdminTenantId } from "@/lib/email-templates/resolve-effective-tenant";
import { resolveWorkerTenantProfessionId } from "@/lib/onboarding/profession-attachment-requirements";
import {
  linkWorkerProfession,
  listProfessionDocuments,
  savedWorkerProfessionId,
  normalizeProfessionDocumentDrafts,
  renameWorkerDocumentFile,
  saveProfessionDocuments,
} from "@/lib/professions/profession-documents";
import { listTenantProfessions } from "@/lib/professions/service";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

function duplicateMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : "";
  if (/tenant_profession_documents_name_uidx|duplicate key/i.test(message)) {
    return "This profession already has a document with that name.";
  }
  return null;
}

export async function GET(req: NextRequest) {
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
    const workerId = req.nextUrl.searchParams.get("workerId")?.trim() || "";
    const [catalog, documents, workerProfessionId, savedProfessionId] = await Promise.all([
      listTenantProfessions(supabase, tenantId),
      listProfessionDocuments(supabase, tenantId),
      workerId ? resolveWorkerTenantProfessionId(supabase, tenantId, workerId) : Promise.resolve(null),
      workerId ? savedWorkerProfessionId(supabase, tenantId, workerId) : Promise.resolve(null),
    ]);
    return NextResponse.json({
      canManage: auth.role === "admin" || auth.godAdmin,
      industryKey: catalog.industryKey,
      industryLabel: industryLabelForKey(catalog.industryKey),
      workerProfessionId,
      savedProfessionId,
      professions: catalog.professions.map((profession) => ({
        id: profession.id,
        name: profession.name,
        documents: documents.get(profession.id) ?? [],
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load profession documents";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
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

  const body = (await req.json().catch(() => null)) as {
    professionId?: string;
    documents?: unknown;
    workerId?: string;
  } | null;
  const professionId = body?.professionId?.trim() ?? "";
  if (!professionId) {
    return NextResponse.json({ error: "Choose a profession." }, { status: 400 });
  }

  const normalized = normalizeProfessionDocumentDrafts(body?.documents);
  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  try {
    const documents = await saveProfessionDocuments(
      supabase,
      tenantId,
      professionId,
      normalized.documents
    );
    const workerId = body?.workerId?.trim() || "";
    if (workerId) await linkWorkerProfession(supabase, tenantId, workerId, professionId);
    return NextResponse.json({ professionId, documents });
  } catch (err) {
    const duplicate = duplicateMessage(err);
    const message = duplicate ?? (err instanceof Error ? err.message : "Could not save documents");
    return NextResponse.json({ error: message }, { status: duplicate ? 409 : 400 });
  }
}

export async function PATCH(req: NextRequest) {
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

  const body = (await req.json().catch(() => null)) as {
    workerId?: string;
    fileName?: string;
    professionDocumentId?: string;
    submittedDocumentId?: string;
  } | null;

  try {
    await renameWorkerDocumentFile(supabase, tenantId, body?.workerId?.trim() || "", {
      professionDocumentId: body?.professionDocumentId,
      submittedDocumentId: body?.submittedDocumentId,
      fileName: body?.fileName ?? "",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not rename file";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

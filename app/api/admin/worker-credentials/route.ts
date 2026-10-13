import { NextRequest, NextResponse } from "next/server";
import { isStaffRole } from "@/lib/auth/app-role";
import { requireApiSession } from "@/lib/auth/api-session";
import { canAccessWorkerRecord } from "@/lib/auth/worker-record-access";
import { uploadApplicantPortalFile } from "@/lib/applicant-portal/upload";
import { listWorkerCredentials, saveWorkerCredential } from "@/lib/professions/service";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { parseRequiredUuid } from "@/lib/validation/uuid";

export const runtime = "nodejs";

function textField(form: FormData, key: string): string | null {
  const value = String(form.get(key) ?? "").trim();
  return value || null;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiSession();
  if (auth instanceof NextResponse) return auth;

  const workerIdRaw = req.nextUrl.searchParams.get("workerId")?.trim() || "";
  const idCheck = parseRequiredUuid(workerIdRaw, "workerId");
  if (!idCheck.ok) return NextResponse.json({ error: idCheck.error }, { status: 400 });

  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: worker, error: workerError } = await supabase
    .from("worker")
    .select("id, tenant_id, user_id")
    .eq("id", idCheck.value)
    .maybeSingle();
  if (workerError) {
    return NextResponse.json({ error: workerError.message }, { status: 500 });
  }
  if (!worker?.id || worker.tenant_id == null) {
    return NextResponse.json({ error: "Worker not found" }, { status: 404 });
  }
  if (
    !canAccessWorkerRecord(auth, {
      id: String(worker.id),
      user_id: (worker as { user_id?: unknown }).user_id,
    })
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = String(worker.tenant_id);
  const credentials = await listWorkerCredentials(supabase, tenantId, idCheck.value);
  const { data: targets, error: targetError } = await supabase
    .from("workflow_required_documents")
    .select("id, code, name, has_expiration, collect_issuing_organization, collect_scope, collect_validity, sort_order, flow_id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });

  return NextResponse.json({
    credentials,
    documents: targets ?? [],
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiSession();
  if (auth instanceof NextResponse) return auth;
  if (!isStaffRole(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const workerId = parseRequiredUuid(String(form.get("workerId") ?? ""), "workerId");
  const documentId = parseRequiredUuid(String(form.get("requiredDocumentId") ?? ""), "requiredDocumentId");
  if (!workerId.ok) return NextResponse.json({ error: workerId.error }, { status: 400 });
  if (!documentId.ok) return NextResponse.json({ error: documentId.error }, { status: 400 });

  const file = form.get("file");
  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: worker, error: workerError } = await supabase
    .from("worker")
    .select("id, tenant_id, user_id")
    .eq("id", workerId.value)
    .maybeSingle();
  if (workerError) return NextResponse.json({ error: workerError.message }, { status: 500 });
  if (!worker?.id || worker.tenant_id == null) {
    return NextResponse.json({ error: "Worker not found" }, { status: 404 });
  }
  if (
    !canAccessWorkerRecord(auth, {
      id: String(worker.id),
      user_id: (worker as { user_id?: unknown }).user_id,
    })
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let storagePath: string | null = null;
  let documentUrl: string | null = null;
  let originalFileName: string | null = null;
  let fileType: string | null = null;
  let fileSize: number | null = null;
  if (file instanceof File && file.size > 0) {
    const uploaded = await uploadApplicantPortalFile(supabase, file, workerId.value, "credentials");
    storagePath = uploaded.storagePath;
    documentUrl = uploaded.publicUrl;
    originalFileName = file.name;
    fileType = file.type || null;
    fileSize = file.size;
  }

  try {
    const credential = await saveWorkerCredential(supabase, {
      tenantId: String(worker.tenant_id),
      workerId: workerId.value,
      requiredDocumentId: documentId.value,
      issuingOrganization: textField(form, "issuingOrganization"),
      scope: textField(form, "scope"),
      validity: textField(form, "validity"),
      issuedDate: textField(form, "issuedDate"),
      expiryDate: textField(form, "expiryDate"),
      documentUrl,
      storagePath,
      originalFileName,
      fileType,
      fileSize,
      status: textField(form, "status") ?? "under_review",
      reviewNotes: textField(form, "reviewNotes"),
      updatedBy: auth.userId,
      allowReviewStatus: true,
    });
    return NextResponse.json({ credential });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save credential";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

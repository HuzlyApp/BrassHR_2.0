import { NextRequest, NextResponse } from "next/server";
import { requireApprovedApplicant } from "@/lib/applicant-portal/request";
import { uploadApplicantPortalFile } from "@/lib/applicant-portal/upload";
import { listWorkerCredentials, listWorkerUploadTargets, saveWorkerCredential } from "@/lib/professions/service";

export const runtime = "nodejs";

function textField(form: FormData, key: string): string | null {
  const value = String(form.get(key) ?? "").trim();
  return value || null;
}

export async function GET(req: NextRequest) {
  const auth = await requireApprovedApplicant(req);
  if (auth instanceof NextResponse) return auth;

  const credentials = await listWorkerCredentials(
    auth.supabase,
    auth.applicant.tenant_id,
    auth.applicant.id
  );
  const documents = await listWorkerUploadTargets(
    auth.supabase,
    auth.applicant.tenant_id,
    auth.applicant.id
  );
  return NextResponse.json({ credentials, documents });
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedApplicant(req);
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const requiredDocumentId = String(form.get("requiredDocumentId") ?? "").trim();
  const file = form.get("file");
  if (!requiredDocumentId) {
    return NextResponse.json({ error: "Document type is required." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required." }, { status: 400 });
  }

  try {
    const uploaded = await uploadApplicantPortalFile(
      auth.supabase,
      file,
      auth.applicant.id,
      "credentials"
    );
    const credential = await saveWorkerCredential(auth.supabase, {
      tenantId: auth.applicant.tenant_id,
      workerId: auth.applicant.id,
      requiredDocumentId,
      issuingOrganization: textField(form, "issuingOrganization"),
      scope: textField(form, "scope"),
      validity: textField(form, "validity"),
      issuedDate: textField(form, "issuedDate"),
      expiryDate: textField(form, "expiryDate"),
      documentUrl: uploaded.publicUrl,
      storagePath: uploaded.storagePath,
      originalFileName: file.name,
      fileType: file.type || null,
      fileSize: file.size,
      status: "under_review",
      updatedBy: auth.user.id,
      allowReviewStatus: false,
    });
    return NextResponse.json({ credential });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save credential";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

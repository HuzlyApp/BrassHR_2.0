import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  documentStatusLabel,
  formatDateOnly,
  licenseTypeDisplayLabel,
  licenseUrgency,
  normalizeOtherCertificationName,
  type LicenseType,
} from "@/lib/applicant-portal/documents";
import { uploadApplicantPortalFile } from "@/lib/applicant-portal/upload";
import { isStaffRole } from "@/lib/auth/app-role";
import { requireApiSession } from "@/lib/auth/api-session";
import { canAccessWorkerRecord } from "@/lib/auth/worker-record-access";
import { getSupabaseUrl } from "@/lib/supabase-env";
import { parseRequiredUuid } from "@/lib/validation/uuid";

export const runtime = "nodejs";

const PREIDENTIFIED_LICENSE_TYPES = [
  "bls_certification",
  "acls_certification",
  "other_certification",
] as const;

type PreidentifiedLicenseType = (typeof PREIDENTIFIED_LICENSE_TYPES)[number];

type LicenseRow = {
  id: string;
  license_type: LicenseType;
  certification_name: string | null;
  license_number: string | null;
  expires_at: string | null;
  storage_path: string | null;
  file_url: string | null;
  original_file_name: string | null;
  status: string;
  review_notes: string | null;
  uploaded_at: string;
};

function effectiveStatus(row: LicenseRow): string {
  const urgency = licenseUrgency(row.expires_at, row.status);
  if (urgency === "expired" && row.status === "approved") return "expired";
  return row.status;
}

function serializeLicense(row: LicenseRow) {
  const status = effectiveStatus(row);
  return {
    id: row.id,
    licenseType: row.license_type,
    certificationName: row.certification_name,
    licenseTypeLabel: licenseTypeDisplayLabel(row.license_type, row.certification_name),
    licenseNumber: row.license_number,
    expiresAt: row.expires_at,
    expiresAtLabel: row.expires_at ? formatDateOnly(row.expires_at) : null,
    status,
    statusLabel: documentStatusLabel(status),
    urgency: licenseUrgency(row.expires_at, status),
    reviewNotes: row.review_notes,
    originalFileName: row.original_file_name,
    uploadedAt: row.uploaded_at,
    hasFile: Boolean(row.storage_path || row.file_url),
  };
}

export async function GET(req: NextRequest) {
  try {
    const workerIdRaw = req.nextUrl.searchParams.get("workerId")?.trim() || "";
    if (!workerIdRaw) {
      return NextResponse.json({ error: "Missing workerId" }, { status: 400 });
    }
    const idCheck = parseRequiredUuid(workerIdRaw, "workerId");
    if (!idCheck.ok) {
      return NextResponse.json({ error: idCheck.error }, { status: 400 });
    }
    const workerId = idCheck.value;

    const auth = await requireApiSession();
    if (auth instanceof NextResponse) return auth;

    const url = getSupabaseUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase service role not configured" }, { status: 503 });
    }

    const supabase = createClient(url, key);

    const { data: worker, error: workerErr } = await supabase
      .from("worker")
      .select("id, user_id")
      .eq("id", workerId)
      .maybeSingle();

    if (workerErr) throw workerErr;
    if (!worker?.id) {
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

    const licensesRes = await supabase
      .from("worker_license_records")
      .select(
        "id, license_type, certification_name, license_number, expires_at, storage_path, file_url, original_file_name, status, review_notes, uploaded_at"
      )
      .eq("worker_id", workerId)
      .order("uploaded_at", { ascending: false });

    if (licensesRes.error) throw licensesRes.error;

    const licenses = ((licensesRes.data ?? []) as LicenseRow[]).map(serializeLicense);

    return NextResponse.json({ licenses });
  } catch (err) {
    console.error("[admin/worker-account-licenses:get]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load licenses" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiSession();
    if (auth instanceof NextResponse) return auth;
    if (!isStaffRole(auth.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const form = await req.formData();
    const workerIdRaw = String(form.get("workerId") ?? "").trim();
    const licenseTypeRaw = String(form.get("licenseType") ?? "").trim();
    const file = form.get("file");

    const idCheck = parseRequiredUuid(workerIdRaw, "workerId");
    if (!idCheck.ok) {
      return NextResponse.json({ error: idCheck.error }, { status: 400 });
    }

    if (!PREIDENTIFIED_LICENSE_TYPES.includes(licenseTypeRaw as PreidentifiedLicenseType)) {
      return NextResponse.json({ error: "Invalid certification type." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Certification file is required." }, { status: 400 });
    }

    const licenseType = licenseTypeRaw as PreidentifiedLicenseType;
    let certificationName: string | null = null;
    if (licenseType === "other_certification") {
      const parsedName = normalizeOtherCertificationName(form.get("certificationName"));
      if (!parsedName.ok) {
        return NextResponse.json({ error: parsedName.error }, { status: 400 });
      }
      certificationName = parsedName.value;
    }

    const url = getSupabaseUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase service role not configured" }, { status: 503 });
    }

    const supabase = createClient(url, key);
    const { data: worker, error: workerErr } = await supabase
      .from("worker")
      .select("id, tenant_id, user_id")
      .eq("id", idCheck.value)
      .maybeSingle();
    if (workerErr) throw workerErr;
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

    const { storagePath, publicUrl } = await uploadApplicantPortalFile(
      supabase,
      file,
      idCheck.value,
      `licenses/${licenseType}`
    );

    const insertRes = await supabase
      .from("worker_license_records")
      .insert({
        worker_id: idCheck.value,
        tenant_id: String(worker.tenant_id),
        license_type: licenseType,
        certification_name: certificationName,
        file_url: publicUrl,
        storage_path: storagePath,
        original_file_name: file.name,
        file_type: file.type || null,
        file_size: file.size,
        status: "under_review",
      })
      .select(
        "id, license_type, certification_name, license_number, expires_at, storage_path, file_url, original_file_name, status, review_notes, uploaded_at"
      )
      .single();
    if (insertRes.error) throw insertRes.error;

    return NextResponse.json({
      ok: true,
      license: serializeLicense(insertRes.data as LicenseRow),
    });
  } catch (err) {
    console.error("[admin/worker-account-licenses:post]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not upload certification" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  documentStatusLabel,
  formatDateOnly,
  licenseTypeDisplayLabel,
  licenseUrgency,
  type LicenseType,
} from "@/lib/applicant-portal/documents";
import { requireApprovedApplicant } from "@/lib/applicant-portal/request";

export const runtime = "nodejs";

type LicenseRow = {
  id: string;
  worker_id: string;
  tenant_id: string;
  license_type: LicenseType;
  certification_name: string | null;
  license_number: string | null;
  expires_at: string | null;
  file_url: string | null;
  storage_path: string | null;
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
    const auth = await requireApprovedApplicant(req);
    if (auth instanceof NextResponse) return auth;

    const licensesRes = await auth.supabase
      .from("worker_license_records")
      .select(
        "id, worker_id, tenant_id, license_type, certification_name, license_number, expires_at, file_url, storage_path, original_file_name, status, review_notes, uploaded_at"
      )
      .eq("worker_id", auth.applicant.id)
      .order("uploaded_at", { ascending: false });
    if (licensesRes.error) throw licensesRes.error;

    const licenses = ((licensesRes.data ?? []) as LicenseRow[]).map(serializeLicense);
    const expired = licenses.filter((item) => item.urgency === "expired");
    const expiringSoon = licenses.filter((item) => item.urgency === "expiring_soon");

    return NextResponse.json({
      licenses,
      summary: {
        total: licenses.length,
        expiredCount: expired.length,
        expiringSoonCount: expiringSoon.length,
        pendingReviewCount: licenses.filter((item) =>
          ["pending", "under_review", "needs_revision"].includes(item.status)
        ).length,
      },
    });
  } catch (err) {
    console.error("[applicant-portal/licenses:get]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load licenses" },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json(
    { error: "New licenses are saved on the worker credential for that document." },
    { status: 409 }
  );
}

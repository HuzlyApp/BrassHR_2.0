import { NextRequest, NextResponse } from "next/server";
import { resolveWorkerProfilePhotoUrl } from "@/lib/applicant-portal/worker-profile-photo";
import {
  employmentWorkerTabLabel,
  parseEmploymentWorkerTab,
  type EmploymentWorkerRecord,
} from "@/lib/admin/employment-workers";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { resolveStaffTenantScope } from "@/lib/auth/staff-tenant-scope";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/** Workers list reads public.workers only — no join to candidate (public.worker). */
const SELECT_COLUMNS =
  "id, candidate_id, tenant_id, first_name, last_name, email, phone, worker_type, employment_classification, created_at, converted_at, job_role, location, status, profile_photo, source_job_application_id, application_snapshot, documents_manifest";

const SELECT_COLUMNS_LEGACY =
  "id, candidate_id, tenant_id, first_name, last_name, email, phone, worker_type, employment_classification, created_at, converted_at, job_role, location, status, profile_photo";

const SELECT_COLUMNS_MIN =
  "id, candidate_id, tenant_id, first_name, last_name, email, phone, worker_type, employment_classification, created_at, converted_at";

type WorkerListRow = {
  id: string;
  candidate_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_role?: string | null;
  location?: string | null;
  status?: string | null;
  worker_type: string | null;
  employment_classification: string | null;
  created_at: string | null;
  converted_at: string | null;
  profile_photo?: string | null;
  source_job_application_id?: string | null;
  application_snapshot?: Record<string, unknown> | null;
  documents_manifest?: unknown[] | null;
};

function isMissingColumnError(err: unknown, columns: string[]): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code?: string }).code) : "";
  const message = "message" in err ? String((err as { message?: string }).message) : "";
  if (code !== "42703") return false;
  return columns.some((col) => new RegExp(`workers\\.${col}`, "i").test(message));
}

function normalizeWorkerRow(row: WorkerListRow): EmploymentWorkerRecord {
  const manifest = Array.isArray(row.documents_manifest) ? row.documents_manifest : [];
  return {
    id: row.id,
    candidate_id: row.candidate_id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    job_role: row.job_role ?? null,
    location: row.location?.trim() || null,
    status: row.status ?? "active",
    worker_type: row.worker_type,
    employment_classification: row.employment_classification,
    created_at: row.created_at,
    converted_at: row.converted_at,
    source_job_application_id: row.source_job_application_id ?? null,
    documents_count: manifest.length,
    application_snapshot: row.application_snapshot ?? null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireStaffApiSession();
    if (auth instanceof NextResponse) return auth;

    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase service role not configured" }, { status: 503 });
    }

    const tab = parseEmploymentWorkerTab(req.nextUrl.searchParams.get("tab"));
    const tenantScope = await resolveStaffTenantScope(auth.authUser);
    const tenantId = tenantScope.mode === "scoped" ? tenantScope.tenantId : null;

    const buildQuery = (select: string) => {
      let query = supabase.from("workers").select(select).order("created_at", { ascending: false });
      if (tenantId) query = query.eq("tenant_id", tenantId);
      switch (tab) {
        case "new":
          query = query.eq("status", "new");
          break;
        case "w2":
          query = query.eq("worker_type", "w2");
          break;
        case "1099":
          query = query.eq("worker_type", "1099");
          break;
        default:
          break;
      }
      return query;
    };

    let raw = await buildQuery(SELECT_COLUMNS);
    if (
      raw.error &&
      isMissingColumnError(raw.error, [
        "profile_photo",
        "application_snapshot",
        "documents_manifest",
        "source_job_application_id",
      ])
    ) {
      raw = await buildQuery(SELECT_COLUMNS_LEGACY);
    }
    if (
      raw.error &&
      isMissingColumnError(raw.error, ["job_role", "location", "status", "profile_photo"])
    ) {
      raw = await buildQuery(SELECT_COLUMNS_MIN);
    }
    if (raw.error) throw raw.error;

    const rows = (raw.data ?? []) as unknown as WorkerListRow[];
    const workers = await Promise.all(
      rows.map(async (row) => {
        const normalized = normalizeWorkerRow(row);
        return {
          ...normalized,
          profile_photo_url: await resolveWorkerProfilePhotoUrl(supabase, row.profile_photo ?? null),
        };
      })
    );

    return NextResponse.json({
      tab,
      tabLabel: employmentWorkerTabLabel(tab),
      total: workers.length,
      workers,
    });
  } catch (err: unknown) {
    console.error("[admin/employment-workers]", err);
    const message = err instanceof Error ? err.message : "Failed to load workers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

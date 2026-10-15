import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase-env";
import {
  readOnboardingTenantSlugFromRequest,
  resolveOnboardingWorker,
} from "@/lib/onboarding/resolve-onboarding-worker";

export const runtime = "nodejs";

/** Lists worker uploads keyed by tenant_required_documents.id */
export async function GET(req: NextRequest) {
  try {
    const applicantId = req.nextUrl.searchParams.get("applicantId")?.trim() || "";
    const tenantSlug =
      req.nextUrl.searchParams.get("tenant")?.trim().toLowerCase() ||
      readOnboardingTenantSlugFromRequest(req);
    if (!applicantId) {
      return NextResponse.json({ documents: [] });
    }

    const url = getSupabaseUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ documents: [] });
    }

    const supabase = createClient(url, key);
    const ctx = await resolveOnboardingWorker(supabase, applicantId, tenantSlug);
    if (!ctx) {
      return NextResponse.json({ documents: [] });
    }

    const [{ data, error }, { data: professionUploads, error: professionError }] = await Promise.all([
      supabase
        .from("worker_submitted_documents")
        .select("required_document_id, original_file_name, status, uploaded_at")
        .eq("worker_id", ctx.workerId),
      supabase
        .from("worker_profession_document_uploads")
        .select("id, profession_document_id, original_file_name, status, uploaded_at, issued_date, expiry_date")
        .eq("worker_id", ctx.workerId)
        .order("uploaded_at", { ascending: true }),
    ]);

    if (error) throw error;
    if (professionError) throw professionError;

    const professionMapped = (professionUploads ?? []).map((row) => ({
      id: row.id ? String(row.id) : null,
      required_document_id: String(row.profession_document_id),
      original_file_name: row.original_file_name,
      status: row.status,
      uploaded_at: row.uploaded_at,
      issued_date: row.issued_date ?? null,
      expiry_date: row.expiry_date ?? null,
    }));

    return NextResponse.json({
      documents: [...(data ?? []), ...professionMapped],
    });
  } catch (err: unknown) {
    console.error("[onboarding/submitted-documents]", err);
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

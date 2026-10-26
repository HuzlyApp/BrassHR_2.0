import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSignedPortalFileUrl } from "@/lib/applicant-portal/upload";
import { requireApiSession } from "@/lib/auth/api-session";
import { canAccessWorkerRecord } from "@/lib/auth/worker-record-access";
import { getSupabaseUrl } from "@/lib/supabase-env";
import { resolveStorageAccessibleUrl } from "@/lib/supabase/resolve-storage-accessible-url";
import { parseRequiredUuid } from "@/lib/validation/uuid";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const workerIdRaw = req.nextUrl.searchParams.get("workerId")?.trim() || "";
    const source = req.nextUrl.searchParams.get("source")?.trim() ?? "";
    const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";

    if (!workerIdRaw) {
      return NextResponse.json({ error: "Missing workerId" }, { status: 400 });
    }
    if (!id) {
      return NextResponse.json({ error: "Missing document id." }, { status: 400 });
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

    let storagePath: string | null = null;

    if (source === "credential") {
      const { data, error } = await supabase
        .from("worker_credentials")
        .select("storage_path, document_url")
        .eq("id", id)
        .eq("worker_id", workerId)
        .maybeSingle();
      if (error) throw error;
      storagePath =
        (data?.storage_path as string | null)?.trim() ||
        (data?.document_url as string | null)?.trim() ||
        null;
    } else if (source === "license") {
      const { data, error } = await supabase
        .from("worker_license_records")
        .select("storage_path, file_url")
        .eq("id", id)
        .eq("worker_id", workerId)
        .maybeSingle();
      if (error) throw error;
      storagePath =
        (data?.storage_path as string | null)?.trim() ||
        (data?.file_url as string | null)?.trim() ||
        null;
    } else if (source === "portal") {
      const { data, error } = await supabase
        .from("worker_portal_documents")
        .select("storage_path, file_url")
        .eq("id", id)
        .eq("worker_id", workerId)
        .maybeSingle();
      if (error) throw error;
      storagePath =
        (data?.storage_path as string | null)?.trim() ||
        (data?.file_url as string | null)?.trim() ||
        null;
    } else if (source === "required") {
      const { data, error } = await supabase
        .from("worker_submitted_documents")
        .select("file_url")
        .eq("id", id)
        .eq("worker_id", workerId)
        .maybeSingle();
      if (error) throw error;
      const fileUrl = (data?.file_url as string | null)?.trim() || null;
      if (!fileUrl) {
        return NextResponse.json({ error: "Document file not found." }, { status: 404 });
      }
      const accessibleUrl = await resolveStorageAccessibleUrl(supabase, fileUrl);
      if (!accessibleUrl) {
        return NextResponse.json({ error: "Could not create download link." }, { status: 500 });
      }
      return NextResponse.json({ url: accessibleUrl });
    } else {
      return NextResponse.json({ error: "Invalid document source." }, { status: 400 });
    }

    if (!storagePath) {
      return NextResponse.json({ error: "Document file not found." }, { status: 404 });
    }

    const accessibleUrl =
      (await resolveStorageAccessibleUrl(supabase, storagePath)) ??
      (await createSignedPortalFileUrl(supabase, storagePath));

    if (!accessibleUrl) {
      return NextResponse.json({ error: "Could not create download link." }, { status: 500 });
    }

    return NextResponse.json({ url: accessibleUrl });
  } catch (err) {
    console.error("[admin/worker-account-files:get]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load file" },
      { status: 500 }
    );
  }
}

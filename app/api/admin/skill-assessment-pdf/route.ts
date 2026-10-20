import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { uploadApplicantPortalFile } from "@/lib/applicant-portal/upload";
import { isStaffRole } from "@/lib/auth/app-role";
import { requireApiSession } from "@/lib/auth/api-session";
import { canAccessWorkerRecord } from "@/lib/auth/worker-record-access";
import { getSupabaseUrl } from "@/lib/supabase-env";
import { parseRequiredUuid } from "@/lib/validation/uuid";

export const runtime = "nodejs";

const SKILL_ASSESSMENT_PDF_TYPE = "skill_assessment";

type PdfRow = {
  id: string;
  title: string | null;
  original_file_name: string | null;
  uploaded_at: string | null;
  storage_path: string | null;
  file_url: string | null;
};

function isPdfUpload(file: File): boolean {
  const name = file.name.toLowerCase();
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/") || name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return false;
  }
  return mime === "application/pdf" || name.endsWith(".pdf");
}

type WorkerRow = { id: string; tenant_id: string | null; user_id: unknown };

async function loadWorker(
  workerId: string
): Promise<{ supabase: SupabaseClient; worker: WorkerRow | null } | { error: NextResponse }> {
  const url = getSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return { error: NextResponse.json({ error: "Supabase service role not configured" }, { status: 503 }) };
  }

  const supabase = createClient(url, key);
  const { data: worker, error: workerErr } = await supabase
    .from("worker")
    .select("id, tenant_id, user_id")
    .eq("id", workerId)
    .maybeSingle();
  if (workerErr) throw workerErr;
  return { supabase, worker: (worker as WorkerRow | null) ?? null };
}

export async function GET(req: NextRequest) {
  try {
    const workerIdRaw = req.nextUrl.searchParams.get("workerId")?.trim() || "";
    const idCheck = parseRequiredUuid(workerIdRaw, "workerId");
    if (!idCheck.ok) return NextResponse.json({ error: idCheck.error }, { status: 400 });

    const auth = await requireApiSession();
    if (auth instanceof NextResponse) return auth;

    const loaded = await loadWorker(idCheck.value);
    if ("error" in loaded) return loaded.error;
    const { supabase, worker } = loaded;
    if (!worker?.id) return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    if (
      !canAccessWorkerRecord(auth, {
        id: String(worker.id),
        user_id: (worker as { user_id?: unknown }).user_id,
      })
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("worker_portal_documents")
      .select("id, title, original_file_name, uploaded_at, storage_path, file_url")
      .eq("worker_id", idCheck.value)
      .eq("document_type", SKILL_ASSESSMENT_PDF_TYPE)
      .order("uploaded_at", { ascending: false });
    if (error) throw error;

    const files = ((data ?? []) as PdfRow[]).map((row) => ({
      id: row.id,
      fileName: row.original_file_name?.trim() || row.title?.trim() || "Skill assessment.pdf",
      uploadedAt: row.uploaded_at,
      hasFile: Boolean(row.storage_path || row.file_url),
    }));

    return NextResponse.json({ files });
  } catch (err) {
    console.error("[admin/skill-assessment-pdf:get]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load skill assessment PDFs" },
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
    const file = form.get("file");
    const idCheck = parseRequiredUuid(workerIdRaw, "workerId");
    if (!idCheck.ok) return NextResponse.json({ error: idCheck.error }, { status: 400 });
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "PDF file is required." }, { status: 400 });
    }
    if (!isPdfUpload(file)) {
      return NextResponse.json({ error: "Upload a PDF file." }, { status: 400 });
    }

    const loaded = await loadWorker(idCheck.value);
    if ("error" in loaded) return loaded.error;
    const { supabase, worker } = loaded;
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
      "skill-assessments"
    );

    const insertRes = await supabase
      .from("worker_portal_documents")
      .insert({
        worker_id: idCheck.value,
        tenant_id: String(worker.tenant_id),
        title: "Skill assessment PDF",
        document_type: SKILL_ASSESSMENT_PDF_TYPE,
        file_url: publicUrl,
        storage_path: storagePath,
        original_file_name: file.name,
        file_type: file.type || "application/pdf",
        file_size: file.size,
        status: "under_review",
      })
      .select("id, original_file_name, uploaded_at")
      .single();
    if (insertRes.error) throw insertRes.error;

    return NextResponse.json({
      ok: true,
      file: {
        id: insertRes.data.id,
        fileName: insertRes.data.original_file_name || file.name,
        uploadedAt: insertRes.data.uploaded_at,
        hasFile: true,
      },
    });
  } catch (err) {
    console.error("[admin/skill-assessment-pdf:post]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not upload skill assessment PDF" },
      { status: 500 }
    );
  }
}

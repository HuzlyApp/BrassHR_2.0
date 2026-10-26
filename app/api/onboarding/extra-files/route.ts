import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase-env";
import { loadProfessionDocumentChecklist } from "@/lib/onboarding/profession-document-checklist";
import { resolveOnboardingWorker } from "@/lib/onboarding/resolve-onboarding-worker";
import { readOnboardingTenantSlugFromRequest } from "@/lib/onboarding/resolve-onboarding-worker";

export const runtime = "nodejs";

type ExtraFileRow = {
  id: string;
  tenant_id: string;
  worker_id: string;
  original_file_name: string;
  file_size_bytes: number | null;
  storage_path: string;
  created_at: string;
};

function isMissingExtraFilesTable(error: unknown): boolean {
  const value = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const text = [value?.code, value?.message, value?.details, value?.hint]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
  return (
    /42P01/i.test(text) ||
    /PGRST205/i.test(text) ||
    /worker_extra_files/i.test(text) && /does not exist|schema cache|could not find/i.test(text)
  );
}

export async function GET(req: NextRequest) {
  try {
    const applicantId = req.nextUrl.searchParams.get("applicantId")?.trim() ?? "";
    if (!applicantId) {
      return NextResponse.json({ error: "applicantId is required" }, { status: 400 });
    }

    const url = getSupabaseUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
    }

    const supabase = createClient(url, key);
    const tenantSlug = readOnboardingTenantSlugFromRequest(req);
    const ctx = await resolveOnboardingWorker(supabase, applicantId, tenantSlug);
    if (!ctx) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("worker_extra_files")
      .select("*")
      .eq("tenant_id", ctx.tenantId)
      .eq("worker_id", ctx.workerId)
      .order("created_at", { ascending: false });

    if (error) {
      if (isMissingExtraFilesTable(error)) {
        console.warn("[extra-files GET] worker_extra_files table is not available yet", error);
        const checklist = await loadProfessionDocumentChecklist(supabase, ctx.tenantId, ctx.workerId);
        return NextResponse.json({ files: [], checklist });
      }
      throw error;
    }

    const files = (data ?? []).map((row) => ({
      id: row.id,
      original_file_name: row.original_file_name,
      file_size_bytes: row.file_size_bytes,
      storage_path: row.storage_path,
      created_at: row.created_at,
    }));

    const checklist = await loadProfessionDocumentChecklist(supabase, ctx.tenantId, ctx.workerId);
    return NextResponse.json({ files, checklist });
  } catch (error) {
    console.error("[extra-files GET]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load extra files" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const applicantId = formData.get("applicantId")?.toString().trim() ?? "";
    const fileName = formData.get("fileName")?.toString().trim() ?? "";
    const fileSizeBytes = Number(formData.get("fileSizeBytes")) || null;
    const storagePath = formData.get("storagePath")?.toString().trim() ?? "";
    const tenantSlug = formData.get("tenantSlug")?.toString().trim() ?? "";

    if (!applicantId || !fileName || !storagePath) {
      return NextResponse.json(
        { error: "applicantId, fileName, and storagePath are required" },
        { status: 400 }
      );
    }

    const url = getSupabaseUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
    }

    const supabase = createClient(url, key);
    const ctx = await resolveOnboardingWorker(supabase, applicantId, tenantSlug);
    if (!ctx) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("worker_extra_files")
      .insert({
        tenant_id: ctx.tenantId,
        worker_id: ctx.workerId,
        original_file_name: fileName,
        file_size_bytes: fileSizeBytes,
        storage_path: storagePath,
      })
      .select()
      .single();

    if (error) {
      if (isMissingExtraFilesTable(error)) {
        console.warn("[extra-files POST] worker_extra_files table is not available yet", error);
        return NextResponse.json({
          success: true,
          pendingPersistence: true,
          file: {
            id: storagePath,
            original_file_name: fileName,
            storage_path: storagePath,
          },
        });
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      file: {
        id: data.id,
        original_file_name: data.original_file_name,
        storage_path: data.storage_path,
      },
    });
  } catch (error) {
    console.error("[extra-files POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : ((error as any)?.message ? `${(error as any).message} [${(error as any).code || ""}]` : "Failed to save extra file") },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      applicantId?: string;
      storagePath?: string;
      tenantSlug?: string;
    };
    const applicantId = body.applicantId?.trim() ?? "";
    const storagePath = body.storagePath?.trim() ?? "";
    const tenantSlug = body.tenantSlug?.trim() ?? "";

    if (!applicantId || !storagePath) {
      return NextResponse.json(
        { error: "applicantId and storagePath are required" },
        { status: 400 }
      );
    }

    const url = getSupabaseUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
    }

    const supabase = createClient(url, key);
    const ctx = await resolveOnboardingWorker(supabase, applicantId, tenantSlug);
    if (!ctx) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("worker_extra_files")
      .delete()
      .eq("tenant_id", ctx.tenantId)
      .eq("worker_id", ctx.workerId)
      .eq("storage_path", storagePath);

    if (error) {
      if (isMissingExtraFilesTable(error)) {
        console.warn("[extra-files DELETE] worker_extra_files table is not available yet", error);
        return NextResponse.json({ success: true, pendingPersistence: true });
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[extra-files DELETE]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete extra file" },
      { status: 500 }
    );
  }
}

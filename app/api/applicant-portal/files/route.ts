import { NextRequest, NextResponse } from "next/server";
import { requireApprovedApplicant } from "@/lib/applicant-portal/request";
import { createSignedPortalFileUrl } from "@/lib/applicant-portal/upload";
import { resolveStorageAccessibleUrl } from "@/lib/supabase/resolve-storage-accessible-url";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApprovedApplicant(req);
    if (auth instanceof NextResponse) return auth;

    const source = req.nextUrl.searchParams.get("source")?.trim() ?? "";
    const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
    if (!id) return NextResponse.json({ error: "Missing document id." }, { status: 400 });

    let storagePath: string | null = null;

    if (source === "credential") {
      const { data, error } = await auth.supabase
        .from("worker_credentials")
        .select("storage_path, document_url")
        .eq("id", id)
        .eq("worker_id", auth.applicant.id)
        .maybeSingle();
      if (error) throw error;
      storagePath =
        (data?.storage_path as string | null)?.trim() ||
        (data?.document_url as string | null)?.trim() ||
        null;
    } else if (source === "license") {
      const { data, error } = await auth.supabase
        .from("worker_license_records")
        .select("storage_path, file_url")
        .eq("id", id)
        .eq("worker_id", auth.applicant.id)
        .maybeSingle();
      if (error) throw error;
      storagePath =
        (data?.storage_path as string | null)?.trim() ||
        (data?.file_url as string | null)?.trim() ||
        null;
    } else if (source === "portal") {
      const { data, error } = await auth.supabase
        .from("worker_portal_documents")
        .select("storage_path, file_url")
        .eq("id", id)
        .eq("worker_id", auth.applicant.id)
        .maybeSingle();
      if (error) throw error;
      storagePath =
        (data?.storage_path as string | null)?.trim() ||
        (data?.file_url as string | null)?.trim() ||
        null;
    } else if (source === "required") {
      const { data, error } = await auth.supabase
        .from("worker_submitted_documents")
        .select("file_url")
        .eq("id", id)
        .eq("worker_id", auth.applicant.id)
        .maybeSingle();
      if (error) throw error;
      const fileUrl = (data?.file_url as string | null)?.trim() || null;
      if (!fileUrl) {
        return NextResponse.json({ error: "Document file not found." }, { status: 404 });
      }

      const accessibleUrl = await resolveStorageAccessibleUrl(auth.supabase, fileUrl);
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
      (await resolveStorageAccessibleUrl(auth.supabase, storagePath)) ??
      (await createSignedPortalFileUrl(auth.supabase, storagePath));

    if (!accessibleUrl) {
      return NextResponse.json({ error: "Could not create download link." }, { status: 500 });
    }

    return NextResponse.json({ url: accessibleUrl });
  } catch (err) {
    console.error("[applicant-portal/files:get]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load file" },
      { status: 500 }
    );
  }
}

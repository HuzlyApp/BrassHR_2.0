import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase-env";
import { getFirmaSigningRequestDownload } from "@/lib/firma/client";
import { resolveTenantFirmaWorkspaceId } from "@/lib/firma/resolve-tenant-workspace";
import { resolveFirmaOnboardingContext } from "@/lib/onboarding/resolve-firma-onboarding-context";

export const runtime = "nodejs";

function sanitizeFilename(filename: string): string {
  const base = filename.replace(/[/\\?%*:|"<>]/g, "_").trim();
  const withExt = base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
  return withExt.replace(/^_+/, "") || "Signed_Agreement.pdf";
}

function isValidStorageUrl(urlStr: string, supabaseUrl?: string | null): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    if (supabaseUrl) {
      const parsedSupabase = new URL(supabaseUrl);
      if (parsed.hostname === parsedSupabase.hostname) return true;
    }
    if (parsed.hostname.endsWith(".supabase.co") && parsed.pathname.includes("/storage/v1/object/")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    const signingRequestId = req.nextUrl.searchParams.get("signingRequestId")?.trim() || "";
    const applicantId = req.nextUrl.searchParams.get("applicantId")?.trim() || "";
    const workerId = req.nextUrl.searchParams.get("workerId")?.trim() || "";
    const stepKey = req.nextUrl.searchParams.get("stepKey")?.trim() || "";
    const stepId = req.nextUrl.searchParams.get("stepId")?.trim() || "";
    const tenantSlug = req.nextUrl.searchParams.get("tenantSlug")?.trim() || "";
    const rawFileUrl = req.nextUrl.searchParams.get("url")?.trim() || req.nextUrl.searchParams.get("fileUrl")?.trim() || "";
    const isDownload = req.nextUrl.searchParams.get("download") === "true";
    const filenameParam = req.nextUrl.searchParams.get("filename")?.trim();
    const safeFilename = sanitizeFilename(filenameParam || "Signed_Agreement.pdf");

    // Only return JSON if explicitly asked for JSON format or redirect=false
    const wantsJson =
      req.nextUrl.searchParams.get("format") === "json" ||
      req.nextUrl.searchParams.get("json") === "true" ||
      req.nextUrl.searchParams.get("redirect") === "false";

    const url = getSupabaseUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Fast-path: if a valid direct storage URL is supplied
    if (rawFileUrl && isValidStorageUrl(rawFileUrl, url)) {
      if (isDownload) {
        try {
          const fileRes = await fetch(rawFileUrl);
          if (fileRes.ok && fileRes.body) {
            const contentType = fileRes.headers.get("content-type") || "application/pdf";
            return new Response(fileRes.body, {
              status: 200,
              headers: {
                "Content-Type": contentType,
                "Content-Disposition": `attachment; filename="${safeFilename}"`,
                "Cache-Control": "private, no-cache, no-store, must-revalidate",
              },
            });
          }
        } catch (fetchErr) {
          console.warn("[onboarding/firma-sign/download] streaming direct URL failed, redirecting:", fetchErr);
        }
      }
      return NextResponse.redirect(rawFileUrl, { status: 302 });
    }

    if (!url || !key) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
    }
    const supabase = createClient(url, key);

    let effectiveSigningRequestId = signingRequestId;
    let tenantId = "";

    // 1. If applicantId and stepKey/stepId are provided, resolve context
    if (applicantId && (stepKey || stepId)) {
      const resolved = await resolveFirmaOnboardingContext({
        supabase,
        applicantId,
        stepKey: stepKey || "authorizations",
        stepId: stepId || null,
        tenantSlug: tenantSlug || null,
      });

      if (resolved.ok) {
        tenantId = resolved.tenantId;
        if (!effectiveSigningRequestId && resolved.workerId) {
          const { data: session } = await supabase
            .from("worker_firma_signing_sessions")
            .select("signing_request_id, firma_workspace_id")
            .eq("tenant_id", resolved.tenantId)
            .eq("worker_id", resolved.workerId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (session?.signing_request_id) {
            effectiveSigningRequestId = session.signing_request_id;
          }
        }
      }
    }

    // 2. If workerId is provided (recruiter / staff context)
    if (!effectiveSigningRequestId && workerId) {
      let query = supabase
        .from("worker_firma_signing_sessions")
        .select("signing_request_id, tenant_id, firma_workspace_id")
        .eq("worker_id", workerId);

      if (stepId) {
        query = query.eq("onboarding_step_id", stepId);
      }

      const { data: session } = await query
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (session?.signing_request_id) {
        effectiveSigningRequestId = session.signing_request_id;
        tenantId = tenantId || session.tenant_id;
      }
    }

    // 3. Fallback: find session by signing_request_id if tenantId is not known
    if (effectiveSigningRequestId && !tenantId) {
      const { data: session } = await supabase
        .from("worker_firma_signing_sessions")
        .select("tenant_id, firma_workspace_id")
        .eq("signing_request_id", effectiveSigningRequestId)
        .maybeSingle();

      if (session?.tenant_id) {
        tenantId = session.tenant_id;
      }
    }

    if (!effectiveSigningRequestId) {
      return NextResponse.json(
        { error: "No signed document found for this request.", code: "DOCUMENT_NOT_FOUND" },
        { status: 404 }
      );
    }

    const workspaceId = tenantId
      ? await resolveTenantFirmaWorkspaceId(supabase, tenantId).catch(() => null)
      : null;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "E-signature workspace not found.", code: "WORKSPACE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const download = await getFirmaSigningRequestDownload(effectiveSigningRequestId, workspaceId);

    if (!download?.download_url) {
      return NextResponse.json(
        { error: "Signed document download URL is not ready yet.", code: "NOT_READY" },
        { status: 404 }
      );
    }

    if (wantsJson) {
      return NextResponse.json({
        ok: true,
        download_url: download.download_url,
        status: download.status,
        is_partial: download.is_partial ?? false,
        expires_at: download.expires_at ?? null,
      });
    }

    if (isDownload) {
      try {
        const fileRes = await fetch(download.download_url);
        if (fileRes.ok && fileRes.body) {
          const contentType = fileRes.headers.get("content-type") || "application/pdf";
          return new Response(fileRes.body, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Content-Disposition": `attachment; filename="${safeFilename}"`,
              "Cache-Control": "private, no-cache, no-store, must-revalidate",
            },
          });
        }
      } catch (streamErr) {
        console.warn("[onboarding/firma-sign/download] failed to stream attachment, falling back to redirect:", streamErr);
      }
    }

    return NextResponse.redirect(download.download_url, { status: 302 });
  } catch (err: unknown) {
    console.error("[onboarding/firma-sign/download]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to retrieve signed document download URL",
      },
      { status: 500 }
    );
  }
}

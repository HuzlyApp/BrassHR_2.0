import { NextResponse } from "next/server";
import {
  loadLatestExpiredProfessionUploads,
  notifyExpiredProfessionDocuments,
} from "@/lib/onboarding/notify-expired-profession-documents";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization")?.trim() ?? "";
  return header === `Bearer ${secret}`;
}

/** Hourly check so recruiters are notified when a profession document's expiry date has passed. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  try {
    const expired = await loadLatestExpiredProfessionUploads(supabase);
    const created = await notifyExpiredProfessionDocuments(supabase, expired);
    return NextResponse.json({ ok: true, expired: expired.length, created });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to notify expired documents";
    console.error("[cron] notify-expired-profession-documents", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

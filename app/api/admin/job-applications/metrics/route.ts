import { NextRequest, NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { resolveStaffTenantId } from "@/lib/jobs/tenant";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isUuid } from "@/lib/validation/uuid";

export const runtime = "nodejs";

export type MetricsTimeframeKey =
  | "15_days"
  | "30_days"
  | "3_months"
  | "6_months"
  | "1_year"
  | "all_time";

export type ApplicationMetricsCounts = {
  total: number;
  shortlisted: number;
  review: number;
  hired: number;
};

export async function GET(req: NextRequest) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;
  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const tenantId = await resolveStaffTenantId(supabase, auth);
    if (!tenantId) return NextResponse.json({ error: "No tenant selected" }, { status: 400 });

    const jobId = req.nextUrl.searchParams.get("jobId")?.trim();

    let query = supabase
      .from("job_applications")
      .select("id, status, status_id, workflow_phase, created_at, submitted_at, post_hire_activated_at, application_statuses(system_key, name)")
      .eq("tenant_id", tenantId);

    if (jobId && isUuid(jobId)) {
      query = query.eq("job_requisition_id", jobId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const now = Date.now();
    const cutoffs: Record<MetricsTimeframeKey, number | null> = {
      "15_days": now - 15 * 86400000,
      "30_days": now - 30 * 86400000,
      "3_months": now - 90 * 86400000,
      "6_months": now - 180 * 86400000,
      "1_year": now - 365 * 86400000,
      "all_time": null,
    };

    const timeframes: Record<MetricsTimeframeKey, ApplicationMetricsCounts> = {
      "15_days": { total: 0, shortlisted: 0, review: 0, hired: 0 },
      "30_days": { total: 0, shortlisted: 0, review: 0, hired: 0 },
      "3_months": { total: 0, shortlisted: 0, review: 0, hired: 0 },
      "6_months": { total: 0, shortlisted: 0, review: 0, hired: 0 },
      "1_year": { total: 0, shortlisted: 0, review: 0, hired: 0 },
      "all_time": { total: 0, shortlisted: 0, review: 0, hired: 0 },
    };

    for (const row of data ?? []) {
      const statusStr = String(row.status ?? "").toLowerCase().trim();
      if (statusStr === "archived" || statusStr === "withdrawn") continue;

      const appStatusJoin = Array.isArray(row.application_statuses)
        ? row.application_statuses[0]
        : row.application_statuses;
      const sysKey = String(appStatusJoin?.system_key ?? statusStr).toLowerCase().trim();
      const phase = String(row.workflow_phase ?? "").toLowerCase().trim();

      const isShortlisted = sysKey === "shortlisted" || statusStr === "shortlisted";
      const isHired =
        sysKey === "hired" ||
        statusStr === "hired" ||
        phase === "post_hire" ||
        phase === "completed";
      const isReview =
        !isShortlisted &&
        !isHired &&
        (sysKey === "reviewing" ||
          sysKey === "new" ||
          sysKey === "interviewing" ||
          statusStr === "reviewing" ||
          statusStr === "new" ||
          statusStr === "submitted" ||
          statusStr === "in_progress" ||
          statusStr === "interviewing");

      const rawDate = row.submitted_at || row.created_at;
      const createdAtMs = rawDate ? new Date(rawDate).getTime() : now;

      for (const [key, cutoff] of Object.entries(cutoffs) as Array<[MetricsTimeframeKey, number | null]>) {
        if (cutoff === null || createdAtMs >= cutoff) {
          timeframes[key].total += 1;
          if (isShortlisted) timeframes[key].shortlisted += 1;
          if (isReview) timeframes[key].review += 1;
          if (isHired) timeframes[key].hired += 1;
        }
      }
    }

    return NextResponse.json({ timeframes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load metrics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

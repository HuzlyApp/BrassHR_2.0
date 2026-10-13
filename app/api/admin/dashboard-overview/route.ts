import { NextRequest, NextResponse } from "next/server";
import { getCachedStaffApiSession, getCachedStaffTenantScope } from "@/lib/auth/cached-staff-auth";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadFacilitiesForTenant } from "@/lib/facilities/facility-management-service";
import { buildCacheKey, CACHE_TTL_SECONDS, getOrSetCache } from "@/lib/cache";
import { countWorkersCreatedBetween } from "@/lib/dashboard/analytics-counts";
import { fetchWorkerStatusMetrics } from "@/lib/dashboard/worker-status-metrics";
import { resolveWorkforceBuckets } from "@/lib/dashboard/workforce-analytics";
import { createPerfTimer, logPerf } from "@/lib/perf";
import {
  applicantDisplayName,
  interviewOrdinalTitle,
} from "@/lib/interviews/format";
import { addEasternDays, easternDateString, easternHour, formatEastern } from "@/lib/datetime/eastern";
import { localDateString, localTimeString, scheduleRowToIso } from "@/lib/interviews/schedule-fields";

export const runtime = "nodejs";

type InterviewScheduleRow = {
  id: string;
  applicant_id: string;
  worker_id: string | null;
  title: string | null;
  description: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string | null;
  status: string;
};

type ShiftRow = {
  id: string;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  facility_id: string | null;
};

type WorkerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  job_role: string | null;
  status: string | null;
  created_at: string | null;
};

function parseDateParam(value: string | null): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return localDateString(new Date());
}

function formatTime12h(time: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return time;
  let hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${suffix}`;
}

function formatShiftTimeRange(title: string | null): string {
  const t = (title ?? "").toLowerCase();
  if (t.includes("night")) return "7pm - 11pm";
  if (t.includes("morning")) return "7am - 3pm";
  if (t.includes("mid")) return "11am - 7pm";
  return "8am - 5pm";
}

function formatHumanDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("en-US", { timeZone: "America/New_York",  month: "long", day: "numeric", year: "numeric" });
}

function formatWeekdayDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("en-US", { timeZone: "America/New_York",  weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function relativeTimeLabel(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function calendarDayDiff(fromKey: string, toKey: string): number {
  const [fromYear, fromMonth, fromDay] = fromKey.split("-").map(Number);
  const [toYear, toMonth, toDay] = toKey.split("-").map(Number);
  const from = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const to = Date.UTC(toYear, toMonth - 1, toDay);
  return Math.round((to - from) / 86400000);
}

function daysUntilLabel(iso: string | null): string {
  if (!iso) return "—";
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return "—";
  const diff = calendarDayDiff(easternDateString(new Date()), easternDateString(target));
  const formatted = formatEastern(target, { day: "2-digit", month: "short", year: "numeric" });
  if (diff > 0) return `${formatted} (In ${diff} day${diff === 1 ? "" : "s"})`;
  if (diff === 0) return `${formatted} (Today)`;
  return formatted;
}

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

type AttentionTone = "orange" | "red" | "green";

type AttentionItem = {
  id: string;
  name: string;
  title: string;
  subtitle: string;
  tag: string;
  tone: AttentionTone;
  agoLabel: string;
  href: string;
};

type RankedAttentionItem = {
  item: AttentionItem;
  priority: number;
  sortAt: number;
};

type JobRequisitionRow = {
  id: string;
  title: string | null;
  public_title: string | null;
  job_role: string | null;
  msp_name: string | null;
  msp_client_name: string | null;
  msp_client: string | null;
  facility_name: string | null;
  facility: string | null;
  created_at: string | null;
};

type LicenseRecordRow = {
  id: string;
  worker_id: string;
  license_type: string | null;
  expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function agoLabel(iso: string | null): string {
  const label = relativeTimeLabel(iso);
  return label === "—" ? label : `${label} ago`;
}

function timestampOf(iso: string | null): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function jobClientName(row: JobRequisitionRow): string {
  return (
    row.msp_client_name?.trim() ||
    row.msp_client?.trim() ||
    row.msp_name?.trim() ||
    row.facility_name?.trim() ||
    row.facility?.trim() ||
    "Direct hire"
  );
}

function jobRoleName(row: JobRequisitionRow): string {
  return row.public_title?.trim() || row.title?.trim() || row.job_role?.trim() || "Open role";
}

function onboardingAttentionCopy(status: string): { subtitle: string; tone: AttentionTone } {
  if (status === "approved") return { subtitle: "Approved · ready to start onboarding", tone: "green" };
  if (status === "pending") return { subtitle: "Onboarding pending review", tone: "orange" };
  return { subtitle: "New hire awaiting onboarding", tone: "orange" };
}

export async function GET(req: NextRequest) {
  const routeTimer = createPerfTimer();
  try {
    const auth = await getCachedStaffApiSession();
    if (auth instanceof NextResponse) return auth;

    const scope = await getCachedStaffTenantScope(auth.authUser);
    if (scope.mode !== "scoped") {
      return NextResponse.json({ error: "Select a tenant before viewing the dashboard." }, { status: 400 });
    }

    const selectedDate = parseDateParam(req.nextUrl.searchParams.get("date"));
    const cacheKey = buildCacheKey("dashboard_overview_v2", ["tenant", scope.tenantId], {
      date: selectedDate,
      user: auth.userId,
    });

    const payload = await getOrSetCache(
      cacheKey,
      async () => buildDashboardOverviewPayload(scope.tenantId, selectedDate, auth.userId),
      CACHE_TTL_SECONDS.dashboards,
    );

    logPerf("GET /api/admin/dashboard-overview", {
      totalMs: routeTimer.elapsedMs(),
      tenantId: scope.tenantId,
      date: selectedDate,
    });
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[admin/dashboard-overview:get]", err);
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function shiftActiveOnDate(
  row: { start_date: string | null; end_date: string | null },
  isoDate: string
): boolean {
  if (!row.start_date) return false;
  const end = row.end_date ?? row.start_date;
  return row.start_date <= isoDate && isoDate <= end;
}

async function buildDashboardOverviewPayload(tenantId: string, selectedDate: string, userId: string) {
    const supabase = createServiceRoleClient();
    if (!supabase) {
      throw new Error("Supabase service role not configured");
    }

    const now = new Date();
    const todayKey = localDateString(now);
    const currentWindowStart = addEasternDays(now, -6);
    const previousWindowStart = addEasternDays(now, -13);
    const previousWindowEnd = new Date(currentWindowStart.getTime() - 1);
    const credentialCutoff = easternDateString(addEasternDays(now, 30));

    const [
      profileRes,
      scheduleRes,
      notificationsRes,
      shiftsRes,
      workersRes,
      facilityShiftsRes,
      facilitiesData,
      workerStatusMetrics,
      newCandidatesCurrent,
      newCandidatesPrevious,
      jobsRes,
      licensesRes,
    ] = await Promise.all([
      supabase
        .from("users")
        .select("first_name, last_name")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("interview_schedules")
        .select(
          "id, applicant_id, worker_id, title, description, scheduled_date, start_time, end_time, status"
        )
        .eq("tenant_id", tenantId)
        .eq("scheduled_date", selectedDate)
        .neq("status", "cancelled")
        .order("start_time", { ascending: true })
        .limit(20),
      supabase
        .from("notifications")
        .select("id, title, body, sent_at, is_read")
        .eq("user_id", userId)
        .order("sent_at", { ascending: false })
        .limit(6),
      supabase
        .from("shifts")
        .select("id, title, start_date, end_date, facility_id")
        .eq("tenant_id", tenantId)
        .gte("start_date", todayKey)
        .order("start_date", { ascending: true })
        .limit(8),
      supabase
        .from("worker")
        .select("id, first_name, last_name, job_role, status, created_at")
        .eq("tenant_id", tenantId)
        .in("status", ["new", "approved", "pending", "New", "Approved", "Pending"])
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("shifts")
        .select("id, facility_id, start_date, end_date")
        .eq("tenant_id", tenantId)
        .lte("start_date", selectedDate)
        .or(`end_date.gte.${selectedDate},end_date.is.null`),
      loadFacilitiesForTenant(supabase, tenantId),
      fetchWorkerStatusMetrics(supabase, tenantId),
      countWorkersCreatedBetween(supabase, tenantId, currentWindowStart.toISOString(), now.toISOString()),
      countWorkersCreatedBetween(
        supabase,
        tenantId,
        previousWindowStart.toISOString(),
        previousWindowEnd.toISOString(),
      ),
      supabase
        .from("job_requisitions")
        .select(
          "id, title, public_title, job_role, msp_name, msp_client_name, msp_client, facility_name, facility, created_at"
        )
        .eq("tenant_id", tenantId)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(7),
      supabase
        .from("worker_license_records")
        .select("id, worker_id, license_type, expires_at, created_at, updated_at")
        .eq("tenant_id", tenantId)
        .not("expires_at", "is", null)
        .lte("expires_at", credentialCutoff)
        .order("expires_at", { ascending: true })
        .limit(10),
    ]);

    if (jobsRes.error) console.warn("[admin/dashboard-overview] job_requisitions", jobsRes.error.message);
    if (licensesRes.error) console.warn("[admin/dashboard-overview] worker_license_records", licensesRes.error.message);

    if (profileRes.error) throw profileRes.error;
    if (scheduleRes.error) throw scheduleRes.error;
    if (notificationsRes.error) throw notificationsRes.error;
    if (shiftsRes.error) throw shiftsRes.error;
    if (workersRes.error) throw workersRes.error;
    if (facilityShiftsRes.error) throw facilityShiftsRes.error;

    const schedules = (scheduleRes.data ?? []) as InterviewScheduleRow[];
    const licenseRows = (licensesRes.error ? [] : (licensesRes.data ?? [])) as LicenseRecordRow[];
    const workerIds = Array.from(
      new Set(
        [...schedules.map((row) => row.worker_id), ...licenseRows.map((row) => row.worker_id)].filter(
          (id): id is string => Boolean(id)
        )
      )
    );

    const { data: workerRows } = workerIds.length
      ? await supabase
          .from("worker")
          .select("id, first_name, last_name, job_role")
          .in("id", workerIds)
      : { data: [] };

    const workersById = new Map(
      ((workerRows ?? []) as WorkerRow[]).map((worker) => [worker.id, worker])
    );

    const interviews = schedules.map((row, index) => {
      const worker = row.worker_id ? workersById.get(row.worker_id) : undefined;
      const name = worker
        ? applicantDisplayName(worker.first_name, worker.last_name)
        : "Applicant";
      const title = row.title?.trim() || interviewOrdinalTitle(index + 1);
      const { startsAt } = scheduleRowToIso(row.scheduled_date, row.start_time, row.end_time);
      return {
        id: row.id,
        time: formatTime12h(row.start_time),
        label: "Interview",
        description: row.description?.trim() || `${title} with ${name}`,
        startsAt,
      };
    });

    const meetings = (notificationsRes.data ?? [])
      .filter((item) => {
        if (!item.sent_at) return false;
        const sentKey = localDateString(new Date(item.sent_at));
        return sentKey === selectedDate;
      })
      .map((item) => ({
        id: `meeting-${item.id}`,
        time: item.sent_at
          ? formatTime12h(localTimeString(new Date(item.sent_at)))
          : "—",
        label: "Meeting",
        description: item.body?.trim() || item.title?.trim() || "Scheduled item",
        startsAt: item.sent_at,
      }));

    const shiftRows = (shiftsRes.data ?? []) as ShiftRow[];
    const shiftIds = shiftRows.map((row) => row.id);
    const facilityIds = Array.from(
      new Set(shiftRows.map((row) => row.facility_id).filter((id): id is string => Boolean(id)))
    );

    const [{ data: assignmentRows }, { data: facilityRows }] = await Promise.all([
      shiftIds.length
        ? supabase
            .from("worker_shift_assignments")
            .select("shift_id, worker_id")
            .eq("tenant_id", tenantId)
            .in("shift_id", shiftIds)
        : Promise.resolve({ data: [] }),
      facilityIds.length
        ? supabase.from("facility").select("id, name, address").in("id", facilityIds)
        : Promise.resolve({ data: [] }),
    ]);

    const workerCountByShift = new Map<string, number>();
    for (const assignment of assignmentRows ?? []) {
      const shiftId = String(assignment.shift_id);
      workerCountByShift.set(shiftId, (workerCountByShift.get(shiftId) ?? 0) + 1);
    }

    const facilityById = new Map(
      (facilityRows ?? []).map((facility) => [
        String(facility.id),
        {
          name: String(facility.name ?? "Facility"),
          address: String(facility.address ?? "—"),
        },
      ])
    );

    const shifts = shiftRows.map((row) => {
      const facility = row.facility_id ? facilityById.get(String(row.facility_id)) : null;
      return {
        id: row.id,
        date: row.start_date ? formatHumanDate(row.start_date) : "—",
        timeRange: formatShiftTimeRange(row.title),
        facilityAddress: facility?.address ?? "—",
        workerCount: workerCountByShift.get(row.id) ?? 0,
        managerName: "—",
      };
    });

    const onboardHires = ((workersRes.data ?? []) as WorkerRow[]).map((worker) => ({
      id: worker.id,
      name: applicantDisplayName(worker.first_name, worker.last_name),
      role: worker.job_role?.trim() || "Worker",
      startLabel: daysUntilLabel(worker.created_at),
      status: (worker.status ?? "new").toLowerCase(),
    }));

    const facilityWorkers = await buildFacilityWorkersForDate(
      supabase,
      tenantId,
      selectedDate,
      (facilityShiftsRes.data ?? []) as ShiftRow[],
      facilitiesData.facilities
    );

    const profileName =
      [profileRes.data?.first_name, profileRes.data?.last_name].filter(Boolean).join(" ").trim() ||
      "there";

    const todos = (notificationsRes.data ?? []).map((item) => ({
      id: String(item.id),
      title: item.title?.trim() || "Update",
      description: item.body?.trim() || "Check this item",
      agoLabel: relativeTimeLabel(item.sent_at),
      isRead: Boolean(item.is_read),
    }));

    const workforceBuckets = resolveWorkforceBuckets(workerStatusMetrics);
    const stats = {
      activeWorkers: {
        value: workforceBuckets.active,
        changePct: pctChange(workforceBuckets.active, Math.max(0, workforceBuckets.active - newCandidatesCurrent)),
      },
      newCandidates: {
        value: newCandidatesCurrent,
        changePct: pctChange(newCandidatesCurrent, newCandidatesPrevious),
      },
      newlyOnboarded: {
        value: workforceBuckets.newHires,
        changePct: pctChange(workforceBuckets.newHires, Math.max(0, workforceBuckets.newHires - newCandidatesCurrent)),
      },
      hired: {
        value: workerStatusMetrics.hires,
        changePct: pctChange(workerStatusMetrics.hires, Math.max(0, workerStatusMetrics.hires - newCandidatesCurrent)),
      },
    };

    const onboardingAttention: RankedAttentionItem[] = ((workersRes.data ?? []) as WorkerRow[]).map((worker) => {
      const name = applicantDisplayName(worker.first_name, worker.last_name);
      const role = worker.job_role?.trim() || "Worker";
      const { subtitle, tone } = onboardingAttentionCopy((worker.status ?? "new").toLowerCase());
      return {
        item: {
          id: `onboarding-${worker.id}`,
          name,
          title: `${name} · ${role}`,
          subtitle,
          tag: "Onboarding",
          tone,
          agoLabel: agoLabel(worker.created_at),
          href: `/admin_recruiter/new/checklist/${worker.id}`,
        },
        priority: 1,
        sortAt: timestampOf(worker.created_at),
      };
    });

    const credentialAttention: RankedAttentionItem[] = licenseRows.map((record) => {
      const worker = workersById.get(record.worker_id);
      const name = worker ? applicantDisplayName(worker.first_name, worker.last_name) : "Worker";
      const credential = record.license_type?.trim() || "Credential";
      const expiresAt = record.expires_at ?? todayKey;
      const expired = expiresAt < todayKey;
      const expiryLabel = formatHumanDate(expiresAt);
      return {
        item: {
          id: `credential-${record.id}`,
          name,
          title: `${name} · ${credential} ${expired ? "expired" : "expiring"}`,
          subtitle: expired ? `Expired on ${expiryLabel}` : `Expires on ${expiryLabel}`,
          tag: "Credential",
          tone: expired ? "red" : "orange",
          agoLabel: agoLabel(record.updated_at ?? record.created_at),
          href: `/admin_recruiter/workers/${record.worker_id}/profile`,
        },
        priority: expired ? 0 : 1,
        sortAt: timestampOf(record.updated_at ?? record.created_at),
      };
    });

    const needsAttention = [...credentialAttention, ...onboardingAttention]
      .sort((a, b) => a.priority - b.priority || b.sortAt - a.sortAt)
      .slice(0, 5)
      .map((entry) => entry.item);

    const jobsByClient = ((jobsRes.error ? [] : (jobsRes.data ?? [])) as JobRequisitionRow[]).map((row) => ({
      id: row.id,
      clientName: jobClientName(row),
      role: jobRoleName(row),
      agoLabel: agoLabel(row.created_at),
      href: `/admin_recruiter/jobs/${row.id}`,
    }));

    return {
      greeting: greetingForHour(easternHour(new Date())),
      userName: profileName,
      selectedDate,
      selectedDateLabel: formatWeekdayDate(selectedDate),
      schedule: {
        meetings,
        interviews,
        meetingCount: meetings.length,
        interviewCount: interviews.length,
      },
      todos,
      shifts,
      onboardHires,
      facilityWorkers,
      stats,
      needsAttention,
      jobsByClient,
    };
}

async function buildFacilityWorkersForDate(
  supabase: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  tenantId: string,
  selectedDate: string,
  shiftRows: ShiftRow[],
  facilities: Awaited<ReturnType<typeof loadFacilitiesForTenant>>["facilities"]
) {
  const activeShiftRows = shiftRows.filter((row) => shiftActiveOnDate(row, selectedDate));
  const shiftIds = activeShiftRows.map((row) => row.id);
  if (shiftIds.length === 0) return [];

  const { data: assignmentRows, error } = await supabase
    .from("worker_shift_assignments")
    .select("shift_id, worker_id")
    .eq("tenant_id", tenantId)
    .in("shift_id", shiftIds);
  if (error) throw error;

  const shiftToFacility = new Map<string, string>();
  for (const shift of activeShiftRows) {
    if (shift.facility_id) shiftToFacility.set(shift.id, String(shift.facility_id));
  }

  const workerCountByFacility = new Map<string, number>();
  const seenWorkersByFacility = new Map<string, Set<string>>();

  for (const assignment of assignmentRows ?? []) {
    const facilityId = shiftToFacility.get(String(assignment.shift_id));
    if (!facilityId) continue;

    const workerKey = String(assignment.worker_id);
    const seen = seenWorkersByFacility.get(facilityId) ?? new Set<string>();
    if (seen.has(workerKey)) continue;
    seen.add(workerKey);
    seenWorkersByFacility.set(facilityId, seen);
    workerCountByFacility.set(facilityId, (workerCountByFacility.get(facilityId) ?? 0) + 1);
  }

  const facilityById = new Map(facilities.map((facility) => [facility.id, facility]));

  return Array.from(workerCountByFacility.entries())
    .map(([facilityId, workerCount]) => {
      const facility = facilityById.get(facilityId);
      if (!facility) return null;
      return {
        id: facility.id,
        name: facility.name,
        address: facility.address ?? "—",
        workerCount,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((a, b) => b.workerCount - a.workerCount || a.name.localeCompare(b.name))
    .slice(0, 6);
}

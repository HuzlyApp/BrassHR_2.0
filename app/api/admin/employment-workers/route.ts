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

function formatYMDToSlash(val: string | null | undefined): string | null {
  if (!val) return null;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return null;
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
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

    // Collect related IDs for dynamic data resolution
    const candidateIds = Array.from(new Set(rows.map((r) => r.candidate_id).filter(Boolean)));
    const sourceAppIds = Array.from(new Set(rows.map((r) => r.source_job_application_id).filter(Boolean))) as string[];

    // 1. Fetch candidate profiles from `worker`
    const candidatesMap = new Map<string, any>();
    if (candidateIds.length > 0) {
      const { data: candidateRows } = await supabase
        .from("worker")
        .select("id, hourly_rate, experience_years, created_at, status, job_role, city, state")
        .in("id", candidateIds);
      if (candidateRows) {
        for (const c of candidateRows) {
          candidatesMap.set(c.id, c);
        }
      }
    }

    // 2. Fetch linked job applications and job requisitions
    const jobAppsByWorkerId = new Map<string, any>();
    const jobAppsById = new Map<string, any>();
    if (candidateIds.length > 0 || sourceAppIds.length > 0) {
      let appQuery = supabase
        .from("job_applications")
        .select(`
          id,
          worker_id,
          job_requisition_id,
          submitted_at,
          hired_at,
          created_at,
          status,
          job_requisitions (
            id,
            public_title,
            facility,
            facility_name,
            msp_client,
            msp_name,
            target_start_date,
            duration,
            pay_rate_min,
            pay_rate_max,
            bill_rate,
            department,
            shift_type,
            shift_details,
            hours_per_week,
            location
          )
        `)
        .order("created_at", { ascending: false });

      if (tenantId) appQuery = appQuery.eq("tenant_id", tenantId);

      if (sourceAppIds.length > 0 && candidateIds.length > 0) {
        appQuery = appQuery.or(`id.in.(${sourceAppIds.join(",")}),worker_id.in.(${candidateIds.join(",")})`);
      } else if (candidateIds.length > 0) {
        appQuery = appQuery.in("worker_id", candidateIds);
      } else if (sourceAppIds.length > 0) {
        appQuery = appQuery.in("id", sourceAppIds);
      }

      const { data: appRows } = await appQuery;
      if (appRows) {
        for (const app of appRows) {
          jobAppsById.set(app.id, app);
          if (app.worker_id && !jobAppsByWorkerId.has(app.worker_id)) {
            jobAppsByWorkerId.set(app.worker_id, app);
          }
        }
      }
    }

    // 3. Fetch facility / shift assignments
    const assignmentsByWorkerId = new Map<string, any>();
    if (candidateIds.length > 0) {
      try {
        const { data: assignmentRows } = await supabase
          .from("worker_shift_assignments")
          .select(`
            worker_id,
            assigned_at,
            status,
            shifts (
              id,
              facility_id,
              start_time,
              end_time,
              facility (
                id,
                name,
                address
              )
            )
          `)
          .in("worker_id", candidateIds);
        if (assignmentRows) {
          for (const a of assignmentRows) {
            if (a.worker_id && !assignmentsByWorkerId.has(a.worker_id)) {
              assignmentsByWorkerId.set(a.worker_id, a);
            }
          }
        }
      } catch {
        // Safe fallback if shifts table structure differs
      }
    }

    // 4. Index all tenant jobs by title for direct fallback linking
    const jobsByTitleMap = new Map<string, string>();
    if (tenantId) {
      try {
        const { data: allTenantJobs } = await supabase
          .from("job_requisitions")
          .select("id, public_title")
          .eq("tenant_id", tenantId);
        if (allTenantJobs) {
          for (const j of allTenantJobs) {
            if (j.public_title) {
              jobsByTitleMap.set(j.public_title.toLowerCase().trim(), j.id);
            }
          }
        }
      } catch {
        // Safe fallback
      }
    }

    const workers = await Promise.all(
      rows.map(async (row) => {
        const normalized = normalizeWorkerRow(row);
        const candidate = candidatesMap.get(row.candidate_id);
        const linkedApp =
          (row.source_job_application_id ? jobAppsById.get(row.source_job_application_id) : null) ||
          jobAppsByWorkerId.get(row.candidate_id);
        const assignment = assignmentsByWorkerId.get(row.candidate_id);
        const jobReq = Array.isArray(linkedApp?.job_requisitions)
          ? linkedApp.job_requisitions[0]
          : linkedApp?.job_requisitions;
        const shift = Array.isArray(assignment?.shifts)
          ? assignment.shifts[0]
          : assignment?.shifts;
        const facility = Array.isArray(shift?.facility)
          ? shift.facility[0]
          : shift?.facility;
        const snapshot = (row.application_snapshot as Record<string, unknown> | null) ?? {};

        // Dynamic Job Requisition ID:
        const jobId =
          jobReq?.id ||
          linkedApp?.job_requisition_id ||
          (typeof snapshot.job_requisition_id === "string" ? snapshot.job_requisition_id : null) ||
          (typeof snapshot.job_id === "string" ? snapshot.job_id : null) ||
          (row.job_role ? jobsByTitleMap.get(row.job_role.toLowerCase().trim()) : null) ||
          null;

        // Dynamic Client Name:
        const client =
          facility?.name?.trim() ||
          jobReq?.facility_name?.trim() ||
          jobReq?.facility?.trim() ||
          jobReq?.msp_name?.trim() ||
          jobReq?.msp_client?.trim() ||
          (typeof snapshot.client_name === "string" ? snapshot.client_name.trim() : null) ||
          (typeof snapshot.facility_name === "string" ? snapshot.facility_name.trim() : null) ||
          (row.location?.trim() || "—");

        // Dynamic Pay Rate:
        let payRate: string | null = null;
        if (candidate?.hourly_rate) {
          payRate = `$${Number(candidate.hourly_rate)}/hr`;
        } else if (jobReq?.pay_rate_min && jobReq?.pay_rate_max) {
          payRate =
            jobReq.pay_rate_min === jobReq.pay_rate_max
              ? `$${jobReq.pay_rate_min}/hr`
              : `$${jobReq.pay_rate_min}-$${jobReq.pay_rate_max}/hr`;
        } else if (jobReq?.pay_rate_min) {
          payRate = `$${jobReq.pay_rate_min}/hr`;
        } else if (jobReq?.bill_rate) {
          payRate = `$${jobReq.bill_rate}/hr`;
        } else if (snapshot.pay_rate) {
          payRate = `$${snapshot.pay_rate}/hr`;
        } else {
          payRate = "—";
        }

        // Dynamic Assignment Start Date:
        const rawStartDate =
          jobReq?.target_start_date ||
          shift?.start_time ||
          assignment?.assigned_at ||
          row.converted_at ||
          linkedApp?.hired_at ||
          linkedApp?.submitted_at ||
          row.created_at;
        const assignmentStartDate = formatYMDToSlash(rawStartDate) || "—";

        // Dynamic Assignment End Date:
        let assignmentEndDate = formatYMDToSlash(shift?.end_time);
        if (!assignmentEndDate && rawStartDate && jobReq?.duration) {
          const dur = String(jobReq.duration).toLowerCase();
          const num = parseInt(dur, 10);
          if (!Number.isNaN(num) && num > 0) {
            const d = new Date(rawStartDate);
            if (dur.includes("week")) {
              d.setDate(d.getDate() + num * 7);
            } else if (dur.includes("month")) {
              d.setMonth(d.getMonth() + num);
            } else if (dur.includes("year")) {
              d.setFullYear(d.getFullYear() + num);
            }
            assignmentEndDate = formatYMDToSlash(d.toISOString());
          }
        }
        if (!assignmentEndDate) {
          assignmentEndDate = "Ongoing";
        }

        // Dynamic Experience:
        let experience: string | null = null;
        if (candidate?.experience_years) {
          experience = `${candidate.experience_years} yrs experience`;
        } else if (snapshot.experience_years) {
          experience = `${snapshot.experience_years} yrs experience`;
        } else if (typeof snapshot.experience === "string" && snapshot.experience.trim()) {
          experience = snapshot.experience.trim();
        } else {
          experience = "—";
        }

        // Dynamic Facilities:
        const facilities: string[] = [];
        if (facility?.name) facilities.push(facility.name);
        if (jobReq?.facility_name && !facilities.includes(jobReq.facility_name)) facilities.push(jobReq.facility_name);
        if (jobReq?.facility && !facilities.includes(jobReq.facility)) facilities.push(jobReq.facility);
        if (facilities.length === 0 && client !== "—") facilities.push(`${client} Main Campus`);

        const billRate = jobReq?.bill_rate
          ? `$${jobReq.bill_rate}/hr`
          : snapshot.bill_rate
            ? `$${snapshot.bill_rate}/hr`
            : null;

        return {
          ...normalized,
          job_id: jobId,
          assignment_start_date: assignmentStartDate,
          assignment_end_date: assignmentEndDate,
          pay_rate: payRate,
          bill_rate: billRate,
          client,
          experience,
          facilities: facilities.length > 0 ? facilities : null,
          department: jobReq?.department || (snapshot.department as string | null) || null,
          specialty: (snapshot.specialty as string | null) || candidate?.specialty || null,
          profession: (snapshot.profession as string | null) || candidate?.profession || null,
          shift_type: jobReq?.shift_type || shift?.shift_type || null,
          shift_details: jobReq?.shift_details || null,
          hours_per_week: jobReq?.hours_per_week ? String(jobReq.hours_per_week) : null,
          hired_date: formatYMDToSlash(row.converted_at || linkedApp?.hired_at || row.created_at),
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

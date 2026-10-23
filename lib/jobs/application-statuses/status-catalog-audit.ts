import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveApplicationApplicantName } from "@/lib/jobs/application-applicant-display";
import {
  ApplicationStatusError,
  type ApplicationStatusUsage,
  type ApplicationStatusUsageRecord,
  type ApplicationStatusVersionRecord,
} from "./types";

const USAGE_LIMIT = 50;

type VersionRow = {
  id: string;
  status_id: string;
  version_number: number;
  name: string;
  previous_name: string | null;
  description: string | null;
  edited_by: string | null;
  edited_at: string;
};

function oneRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : {};
  }
  return value as Record<string, unknown>;
}

/** Null when the status can be removed. Otherwise the status stays so linked records are kept. */
export function statusDeleteBlockReason(usageCount: number): string | null {
  if (!Number.isFinite(usageCount) || usageCount <= 0) return null;
  const count = Math.trunc(usageCount);
  const applications = count === 1 ? "1 application" : `${count} applications`;
  return `This status is still used by ${applications}. It stays in place so those candidate and job records are not lost.`;
}

export function mapApplicationStatusUsageRow(row: {
  id?: string | null;
  worker_id?: string | null;
  job_requisition_id?: string | null;
  applicant_profiles?: unknown;
  worker?: unknown;
  job_requisitions?: unknown;
}): ApplicationStatusUsageRecord | null {
  const applicationId = typeof row.id === "string" ? row.id : "";
  const jobId = typeof row.job_requisition_id === "string" ? row.job_requisition_id : "";
  if (!applicationId || !jobId) return null;
  const job = oneRecord(row.job_requisitions);
  const publicTitle = typeof job.public_title === "string" ? job.public_title.trim() : "";
  const sourceTitle = typeof job.source_job_title === "string" ? job.source_job_title.trim() : "";
  return {
    applicationId,
    candidateName: resolveApplicationApplicantName({
      applicant_profiles: row.applicant_profiles as never,
      worker: row.worker as never,
    }),
    workerId: typeof row.worker_id === "string" && row.worker_id ? row.worker_id : null,
    jobId,
    jobTitle: publicTitle || sourceTitle || "Untitled job",
  };
}

async function editorNames(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (userIds.length === 0) return names;
  const { data } = await supabase
    .from("users")
    .select("id, first_name, last_name, email")
    .in("id", userIds);
  for (const user of data ?? []) {
    const row = user as {
      id: string;
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
    };
    const fullName = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    names.set(row.id, fullName || row.email?.trim() || "Staff");
  }
  return names;
}

export async function listApplicationStatusVersions(
  supabase: SupabaseClient,
  input: { tenantId: string; statusId: string }
): Promise<ApplicationStatusVersionRecord[]> {
  const { data, error } = await supabase
    .from("application_status_versions")
    .select(
      "id, status_id, version_number, name, previous_name, description, edited_by, edited_at"
    )
    .eq("tenant_id", input.tenantId)
    .eq("status_id", input.statusId)
    .order("version_number", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as VersionRow[];
  const names = await editorNames(
    supabase,
    Array.from(new Set(rows.map((row) => row.edited_by).filter((id): id is string => Boolean(id))))
  );

  return rows.map((row) => ({
    id: row.id,
    statusId: row.status_id,
    versionNumber: row.version_number,
    name: row.name,
    previousName: row.previous_name,
    description: row.description,
    editedBy: row.edited_by,
    editedByName: row.edited_by ? (names.get(row.edited_by) ?? "Staff") : null,
    editedAt: row.edited_at,
  }));
}

export async function listApplicationStatusUsage(
  supabase: SupabaseClient,
  input: { tenantId: string; statusId: string }
): Promise<ApplicationStatusUsage> {
  const { count, error: countError } = await supabase
    .from("job_applications")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", input.tenantId)
    .eq("status_id", input.statusId);
  if (countError) throw countError;

  const total = count ?? 0;
  if (total === 0) return { total: 0, records: [] };

  const { data, error } = await supabase
    .from("job_applications")
    .select(
      "id, worker_id, job_requisition_id, applicant_profiles!applicant_profile_id(first_name, last_name, email), worker:worker_id(first_name, last_name, email), job_requisitions(id, public_title, source_job_title)"
    )
    .eq("tenant_id", input.tenantId)
    .eq("status_id", input.statusId)
    .order("created_at", { ascending: false })
    .limit(USAGE_LIMIT);
  if (error) throw error;

  const records = ((data ?? []) as Array<Parameters<typeof mapApplicationStatusUsageRow>[0]>).flatMap(
    (row) => {
      const mapped = mapApplicationStatusUsageRow(row);
      return mapped ? [mapped] : [];
    }
  );
  return { total, records };
}

export async function assertApplicationStatusInTenant(
  supabase: SupabaseClient,
  tenantId: string,
  statusId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("application_statuses")
    .select("id")
    .eq("id", statusId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApplicationStatusError("Status not found", "NOT_FOUND", 404);
}

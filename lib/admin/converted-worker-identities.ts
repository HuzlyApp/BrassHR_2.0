import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ConvertedWorkerIdentities = {
  candidateIds: Set<string>;
  sourceApplicationIds: Set<string>;
};

const PAGE_SIZE = 1000;
const MAX_ROWS = 50_000;

/**
 * Candidate profiles that became employment workers, plus the applications they were hired from.
 * Matches the `staff_application_list_page` rule: `worker.status = 'converted'` or a
 * `public.workers` row for the candidate. Never matches on email or name, because different
 * people can share those.
 */
export async function loadTenantConvertedWorkerIdentities(
  supabase: SupabaseClient,
  tenantId: string
): Promise<ConvertedWorkerIdentities> {
  const candidateIds = new Set<string>();
  const sourceApplicationIds = new Set<string>();
  if (!tenantId) return { candidateIds, sourceApplicationIds };

  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("workers")
      .select("candidate_id, source_job_application_id")
      .eq("tenant_id", tenantId)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data ?? [];
    for (const row of chunk) {
      const candidateId = String(row.candidate_id ?? "").trim();
      if (candidateId) candidateIds.add(candidateId);
      const applicationId = String(row.source_job_application_id ?? "").trim();
      if (applicationId) sourceApplicationIds.add(applicationId);
    }
    if (chunk.length < PAGE_SIZE) break;
  }

  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("worker")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("status", "converted")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data ?? [];
    for (const row of chunk) {
      const id = String(row.id ?? "").trim();
      if (id) candidateIds.add(id);
    }
    if (chunk.length < PAGE_SIZE) break;
  }

  return { candidateIds, sourceApplicationIds };
}

type ApplicationIdentitySource = {
  id?: string | null;
  worker_id?: string | null;
};

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => String(value ?? "").trim()).filter((value) => value.length > 0))
  );
}

/**
 * Converted identities for one job's applications.
 * Same rule as `staff_application_list_page` and `job_list_application_metrics`:
 * `worker.status = converted`, a `public.workers` row for the candidate, or a hire
 * sourced from the application.
 */
export async function loadConvertedIdentitiesForApplications(
  supabase: SupabaseClient,
  applications: ApplicationIdentitySource[]
): Promise<ConvertedWorkerIdentities> {
  const candidateIds = new Set<string>();
  const sourceApplicationIds = new Set<string>();
  const workerIds = uniqueIds(applications.map((row) => row.worker_id));
  const applicationIds = uniqueIds(applications.map((row) => row.id));

  if (workerIds.length > 0) {
    const { data: workers, error: workerError } = await supabase
      .from("worker")
      .select("id, status")
      .in("id", workerIds);
    if (workerError) throw workerError;
    for (const row of workers ?? []) {
      const id = String(row.id ?? "").trim();
      if (id && String(row.status ?? "").trim().toLowerCase() === "converted") {
        candidateIds.add(id);
      }
    }

    const { data: hiredCandidates, error: hiredError } = await supabase
      .from("workers")
      .select("candidate_id")
      .in("candidate_id", workerIds);
    if (hiredError) throw hiredError;
    for (const row of hiredCandidates ?? []) {
      const id = String(row.candidate_id ?? "").trim();
      if (id) candidateIds.add(id);
    }
  }

  if (applicationIds.length > 0) {
    const { data: hiredFrom, error: hiredFromError } = await supabase
      .from("workers")
      .select("source_job_application_id")
      .in("source_job_application_id", applicationIds);
    if (hiredFromError) throw hiredFromError;
    for (const row of hiredFrom ?? []) {
      const id = String(row.source_job_application_id ?? "").trim();
      if (id) sourceApplicationIds.add(id);
    }
  }

  return { candidateIds, sourceApplicationIds };
}

export function withoutConvertedWorkerApplications<T extends ApplicationIdentitySource>(
  applications: T[],
  identities: ConvertedWorkerIdentities
): T[] {
  return applications.filter(
    (row) =>
      !isConvertedWorkerApplication(
        { applicationId: row.id, workerId: row.worker_id },
        identities
      )
  );
}

/** True when the application belongs to a converted worker or was the source of a hire. */
export function isConvertedWorkerApplication(
  application: { applicationId?: string | null; workerId?: string | null },
  identities: ConvertedWorkerIdentities
): boolean {
  const applicationId = String(application.applicationId ?? "").trim();
  if (applicationId && identities.sourceApplicationIds.has(applicationId)) return true;
  const workerId = String(application.workerId ?? "").trim();
  return Boolean(workerId && identities.candidateIds.has(workerId));
}

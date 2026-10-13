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

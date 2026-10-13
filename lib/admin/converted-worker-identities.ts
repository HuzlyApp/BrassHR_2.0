import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeTenantEmail } from "@/lib/tenant/tenant-email-uniqueness";
import { normalizeCandidatePersonName } from "@/lib/workers/candidate-identity";

export type ConvertedWorkerIdentities = {
  candidateIds: Set<string>;
  emails: Set<string>;
  fullNames: Set<string>;
  sourceApplicationIds: Set<string>;
};

/**
 * Loads all converted / hired worker identity attributes for a tenant.
 * Used dynamically by Candidate and Job Application listings to exclude
 * applicants and any of their applications once they have become a worker.
 */
export async function loadTenantConvertedWorkerIdentities(
  supabase: SupabaseClient,
  tenantId: string
): Promise<ConvertedWorkerIdentities> {
  const candidateIds = new Set<string>();
  const emails = new Set<string>();
  const fullNames = new Set<string>();
  const sourceApplicationIds = new Set<string>();

  if (!tenantId) {
    return { candidateIds, emails, fullNames, sourceApplicationIds };
  }

  // 1. Employment records in public.workers
  try {
    const { data: empWorkers } = await supabase
      .from("workers")
      .select("candidate_id, email, first_name, last_name, source_job_application_id")
      .eq("tenant_id", tenantId);

    for (const w of empWorkers ?? []) {
      const candId = String(w.candidate_id ?? "").trim();
      if (candId) candidateIds.add(candId);

      const email = normalizeTenantEmail(String(w.email ?? ""));
      if (email) emails.add(email);

      const name = normalizeCandidatePersonName(w.first_name, w.last_name);
      if (name) fullNames.add(name);

      const appId = String(w.source_job_application_id ?? "").trim();
      if (appId) sourceApplicationIds.add(appId);
    }
  } catch (err) {
    console.warn("[converted-worker-identities] workers query failed:", err);
  }

  // 2. Converted candidate profiles in public.worker
  try {
    const { data: convProfiles } = await supabase
      .from("worker")
      .select("id, email, first_name, last_name")
      .eq("tenant_id", tenantId)
      .or("status.eq.converted,converted_at.not.is.null,converted_worker_type.not.is.null");

    for (const p of convProfiles ?? []) {
      const id = String(p.id ?? "").trim();
      if (id) candidateIds.add(id);

      const email = normalizeTenantEmail(String(p.email ?? ""));
      if (email) emails.add(email);

      const name = normalizeCandidatePersonName(p.first_name, p.last_name);
      if (name) fullNames.add(name);
    }
  } catch (err) {
    console.warn("[converted-worker-identities] worker query failed:", err);
  }

  // 3. Applications marked hired or post_hire in public.job_applications
  try {
    const { data: hiredApps } = await supabase
      .from("job_applications")
      .select("id, worker_id")
      .eq("tenant_id", tenantId)
      .or("status.eq.hired,workflow_phase.eq.post_hire,post_hire_activated_at.not.is.null");

    for (const app of hiredApps ?? []) {
      const id = String(app.id ?? "").trim();
      if (id) sourceApplicationIds.add(id);

      const workerId = String(app.worker_id ?? "").trim();
      if (workerId) candidateIds.add(workerId);
    }
  } catch (err) {
    console.warn("[converted-worker-identities] job_applications query failed:", err);
  }

  return { candidateIds, emails, fullNames, sourceApplicationIds };
}

/**
 * Checks whether an applicant, candidate, or application matches a converted worker.
 * Once a candidate becomes a worker, all their applications across all jobs are excluded.
 */
export function isConvertedWorkerOrApplication(
  item: {
    workerId?: string | null;
    candidateId?: string | null;
    id?: string | null;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    name?: string | null;
    status?: string | null;
    statusKey?: string | null;
    systemKey?: string | null;
    workflowPhase?: string | null;
    applicationId?: string | null;
  },
  identities: ConvertedWorkerIdentities
): boolean {
  const status = String(item.status ?? "").trim().toLowerCase();
  const statusKey = String(item.statusKey ?? "").trim().toLowerCase();
  const systemKey = String(item.systemKey ?? "").trim().toLowerCase();
  const workflowPhase = String(item.workflowPhase ?? "").trim().toLowerCase();

  if (
    status === "converted" ||
    status === "hired" ||
    statusKey === "converted" ||
    statusKey === "hired" ||
    systemKey === "hired" ||
    workflowPhase === "post_hire"
  ) {
    return true;
  }

  const directAppId = String(item.applicationId ?? "").trim();
  if (directAppId && identities.sourceApplicationIds.has(directAppId)) {
    return true;
  }

  const id = String(item.id ?? "").trim();
  if (id && (identities.candidateIds.has(id) || identities.sourceApplicationIds.has(id))) {
    return true;
  }

  const workerId = String(item.workerId ?? "").trim();
  if (workerId && identities.candidateIds.has(workerId)) {
    return true;
  }

  const candidateId = String(item.candidateId ?? "").trim();
  if (candidateId && identities.candidateIds.has(candidateId)) {
    return true;
  }

  const email = normalizeTenantEmail(String(item.email ?? ""));
  if (email && identities.emails.has(email)) {
    return true;
  }

  const parts = String(item.name ?? "").trim().split(" ");
  const firstName = item.firstName ?? (parts.length > 0 ? parts[0] : null);
  const lastName = item.lastName ?? (parts.length > 1 ? parts.slice(1).join(" ") : null);
  const fullName = normalizeCandidatePersonName(firstName, lastName);
  if (fullName && identities.fullNames.has(fullName)) {
    return true;
  }

  return false;
}

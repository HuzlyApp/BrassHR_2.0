import type { SupabaseClient } from "@supabase/supabase-js";
import { changeApplicationStatus, getStatusBySystemKey } from "@/lib/jobs/application-statuses/service";

export const QUALIFIED_SYSTEM_KEY = "shortlisted";

const PRE_QUALIFIED_LEGACY_STATUSES = new Set([
  "new",
  "submitted",
  "reviewing",
  "interviewing",
]);

type CurrentStatus = {
  systemKey: string | null;
  name: string | null;
  sortOrder: number | null;
  legacyStatus: string | null;
};

export function shouldAdvanceToQualified(
  current: CurrentStatus | null,
  targetSortOrder: number
): boolean {
  if (!current) return true;
  if (current.systemKey === QUALIFIED_SYSTEM_KEY) return false;
  const currentName = (current.name ?? "").trim().toLowerCase();
  if (currentName === "qualified" || currentName.startsWith("qualified")) return false;
  if (current.sortOrder === null) {
    return PRE_QUALIFIED_LEGACY_STATUSES.has((current.legacyStatus ?? "").trim().toLowerCase());
  }
  return current.sortOrder < targetSortOrder;
}

async function loadCurrentStatus(
  supabase: SupabaseClient,
  params: { tenantId: string; applicationId: string }
): Promise<CurrentStatus | null> {
  const { data: application, error } = await supabase
    .from("job_applications")
    .select("status_id, status")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.applicationId)
    .maybeSingle();
  if (error) throw error;
  if (!application) return null;

  const legacyStatus = typeof application.status === "string" ? application.status : null;
  if (!application.status_id) {
    return { systemKey: null, name: null, sortOrder: null, legacyStatus };
  }

  const { data: status, error: statusError } = await supabase
    .from("application_statuses")
    .select("system_key, name, sort_order")
    .eq("tenant_id", params.tenantId)
    .eq("id", application.status_id)
    .maybeSingle();
  if (statusError) throw statusError;
  return {
    systemKey: typeof status?.system_key === "string" ? status.system_key : null,
    name: typeof status?.name === "string" ? status.name : null,
    sortOrder: typeof status?.sort_order === "number" ? status.sort_order : null,
    legacyStatus,
  };
}

/** Sets the application's progress status to Qualified once the recruiter marks the candidate as qualified. */
export async function advanceApplicationToQualified(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    applicationId: string | null;
    actorUserId: string | null;
    origin?: string | null;
  }
): Promise<{ statusName: string } | null> {
  const applicationId = params.applicationId?.trim();
  if (!applicationId) return null;

  let targetId: string | null = null;
  let targetSortOrder = 6;

  const targetRecord = await getStatusBySystemKey(supabase, params.tenantId, QUALIFIED_SYSTEM_KEY);
  if (targetRecord?.isActive) {
    targetId = targetRecord.id;
    targetSortOrder = targetRecord.sortOrder;
  } else {
    // Fall back to matching an active status with name Qualified
    const { data: statuses } = await supabase
      .from("application_statuses")
      .select("id, name, sort_order, is_active")
      .eq("tenant_id", params.tenantId)
      .eq("is_active", true);

    const found = (statuses ?? []).find(
      (s) => (s.name ?? "").trim().toLowerCase() === "qualified"
    );
    if (found) {
      targetId = String(found.id);
      targetSortOrder = typeof found.sort_order === "number" ? found.sort_order : 6;
    }
  }

  if (!targetId) return null;

  const current = await loadCurrentStatus(supabase, { tenantId: params.tenantId, applicationId });
  if (!shouldAdvanceToQualified(current, targetSortOrder)) return null;

  const result = await changeApplicationStatus(supabase, {
    tenantId: params.tenantId,
    applicationId,
    statusId: targetId,
    changedByUserId: params.actorUserId,
    note: "Candidate marked as Qualified by recruiter",
    origin: params.origin ?? null,
  });

  return result.unchanged ? null : { statusName: result.application.statusName };
}

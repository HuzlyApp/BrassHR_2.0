import type { SupabaseClient } from "@supabase/supabase-js";
import { changeApplicationStatus, getStatusBySystemKey } from "@/lib/jobs/application-statuses/service";

export const SCREENING_COMPLETE_SYSTEM_KEY = "reviewing";

const PRE_SCREENING_LEGACY_STATUSES = new Set(["new", "submitted"]);

type CurrentStatus = {
  systemKey: string | null;
  sortOrder: number | null;
  legacyStatus: string | null;
};

/**
 * Only move forward: earlier statuses in the tenant's order (New, Attempted Contact, …) advance;
 * Screening Complete itself and anything after it (interview, client selection, rejections) stay.
 */
export function shouldAdvanceToScreeningComplete(
  current: CurrentStatus | null,
  targetSortOrder: number
): boolean {
  if (!current) return true;
  if (current.systemKey === SCREENING_COMPLETE_SYSTEM_KEY) return false;
  if (current.sortOrder === null) {
    return PRE_SCREENING_LEGACY_STATUSES.has((current.legacyStatus ?? "").trim().toLowerCase());
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
  if (!application.status_id) return { systemKey: null, sortOrder: null, legacyStatus };

  const { data: status, error: statusError } = await supabase
    .from("application_statuses")
    .select("system_key, sort_order")
    .eq("tenant_id", params.tenantId)
    .eq("id", application.status_id)
    .maybeSingle();
  if (statusError) throw statusError;
  return {
    systemKey: typeof status?.system_key === "string" ? status.system_key : null,
    sortOrder: typeof status?.sort_order === "number" ? status.sort_order : null,
    legacyStatus,
  };
}

/** Sets the application's progress status to Screening Complete once the recruiter completes screening. */
export async function advanceApplicationToScreeningComplete(
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

  const target = await getStatusBySystemKey(supabase, params.tenantId, SCREENING_COMPLETE_SYSTEM_KEY);
  if (!target?.isActive) return null;

  const current = await loadCurrentStatus(supabase, { tenantId: params.tenantId, applicationId });
  if (!shouldAdvanceToScreeningComplete(current, target.sortOrder)) return null;

  const result = await changeApplicationStatus(supabase, {
    tenantId: params.tenantId,
    applicationId,
    statusId: target.id,
    changedByUserId: params.actorUserId,
    note: "Recruiter Screening step completed",
    origin: params.origin ?? null,
  });
  return result.unchanged ? null : { statusName: result.application.statusName };
}

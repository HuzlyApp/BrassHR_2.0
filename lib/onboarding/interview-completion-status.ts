import type { SupabaseClient } from "@supabase/supabase-js";
import { changeApplicationStatus } from "@/lib/jobs/application-statuses/service";

const PRE_INTERVIEW_COMPLETE_LEGACY_STATUSES = new Set([
  "new",
  "submitted",
  "reviewing",
  "shortlisted",
  "interviewing",
]);

type CurrentStatus = {
  id: string | null;
  name: string | null;
  systemKey: string | null;
  sortOrder: number | null;
  legacyStatus: string | null;
};

export function shouldAdvanceToInterviewComplete(
  current: CurrentStatus | null,
  targetSortOrder: number
): boolean {
  if (!current) return true;
  const currentName = (current.name ?? "").trim().toLowerCase();
  if (currentName === "interview complete" || currentName === "interview completed") return false;
  if (current.sortOrder === null) {
    return PRE_INTERVIEW_COMPLETE_LEGACY_STATUSES.has((current.legacyStatus ?? "").trim().toLowerCase());
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
    return { id: null, name: null, systemKey: null, sortOrder: null, legacyStatus };
  }

  const { data: status, error: statusError } = await supabase
    .from("application_statuses")
    .select("id, name, system_key, sort_order")
    .eq("tenant_id", params.tenantId)
    .eq("id", application.status_id)
    .maybeSingle();
  if (statusError) throw statusError;
  return {
    id: status?.id ? String(status.id) : null,
    name: typeof status?.name === "string" ? status.name : null,
    systemKey: typeof status?.system_key === "string" ? status.system_key : null,
    sortOrder: typeof status?.sort_order === "number" ? status.sort_order : null,
    legacyStatus,
  };
}

/** Sets the application's progress status to Interview Complete once the recruiter completes the interview step. */
export async function advanceApplicationToInterviewComplete(
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

  // 1. Find the tenant's "interview" status group so it stays categorized under Admin Settings
  const { data: interviewGroup } = await supabase
    .from("application_status_groups")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("system_key", "interview")
    .maybeSingle();

  // 2. Find or resolve "Interview Complete" status in this tenant
  const { data: statuses, error: listError } = await supabase
    .from("application_statuses")
    .select("id, name, sort_order, is_active, system_key, group_id")
    .eq("tenant_id", params.tenantId)
    .eq("is_active", true);

  if (listError) {
    console.warn("[interview-completion-status] failed to list statuses", listError);
  }

  let target = (statuses ?? []).find(
    (s) =>
      s.name?.trim().toLowerCase() === "interview complete" ||
      s.name?.trim().toLowerCase() === "interview completed"
  );

  // If no "Interview Complete" status exists yet in this tenant, insert one linked to the Interview group
  if (!target) {
    const { data: inserted, error: insertError } = await supabase
      .from("application_statuses")
      .insert({
        tenant_id: params.tenantId,
        name: "Interview Complete",
        sort_order: 6,
        is_active: true,
        is_default: false,
        group_id: interviewGroup?.id ?? null,
      })
      .select("id, name, sort_order, is_active, system_key, group_id")
      .maybeSingle();

    if (!insertError && inserted) {
      target = inserted;
    }
  } else if (!target.group_id && interviewGroup?.id) {
    // If it exists but is ungrouped, link it to the Interview group so it displays properly in Admin Settings
    await supabase
      .from("application_statuses")
      .update({ group_id: interviewGroup.id })
      .eq("id", target.id)
      .eq("tenant_id", params.tenantId);
  }

  if (!target) return null;

  const current = await loadCurrentStatus(supabase, { tenantId: params.tenantId, applicationId });
  const targetSortOrder = typeof target.sort_order === "number" ? target.sort_order : 6;
  if (!shouldAdvanceToInterviewComplete(current, targetSortOrder)) return null;

  const result = await changeApplicationStatus(supabase, {
    tenantId: params.tenantId,
    applicationId,
    statusId: target.id,
    changedByUserId: params.actorUserId,
    note: "Interview step marked as completed by recruiter",
    origin: params.origin ?? null,
  });

  return result.unchanged ? null : { statusName: result.application.statusName };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApplicationPipelineStatus } from "@/lib/jobs/application-status";
import {
  activatePostHire,
  shouldActivatePostHireAfterStatusChange,
} from "@/lib/onboarding/activate-post-hire";
import { writeActivityLog } from "@/lib/audit/activity-log";
import { shouldSuspendPostHireAfterStatusChange } from "@/lib/onboarding/lock-post-hire";
import { isPlacementAcceptedStatus } from "@/lib/onboarding/workflow-phase";
import { invalidateCandidateKpiCache } from "@/lib/workers/candidate-kpi-cache";
import { isSharedClosedGroupKey } from "./groups";
import {
  isAssignableStatusStageName,
  type ApplicationStatusGroupStageAssignmentRecord,
  type StatusStageName,
} from "./stage-assignments";
import {
  DEFAULT_ALTERNATE_REASON_CODES,
  DEFAULT_CLOSING_REASON_CODES,
  REASON_CODE_LANES,
  codesForScopedAppend,
  normalizeReasonCode,
  normalizeReasonCodeLane,
  parseReasonCodeList,
  reasonCodeLaneOf,
  type ReasonCodeLane,
} from "./stage-reason-codes";
import {
  STAGE_STATUS_LANES,
  normalizeStageButtonLabel,
  normalizeStageStatusLane,
  type StageActionButtonLane,
  type StageStatusLane,
} from "./stage-status-lanes";
import {
  ApplicationStatusError,
  type ApplicationStatusChangeSource,
  type ApplicationStatusGroupRecord,
  type ApplicationStatusHistoryRecord,
  type ApplicationStatusRecord,
  type ChangeApplicationStatusResult,
} from "./types";

const STATUS_COLUMNS =
  "id, tenant_id, name, description, color, sort_order, is_active, is_default, system_key, group_id, button_lane, created_by, created_at, updated_at, application_status_groups(id, name, description, sort_order, system_key)";

const GROUP_COLUMNS =
  "id, tenant_id, name, description, sort_order, system_key, created_at, updated_at";

type GroupJoin = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  system_key: string | null;
};

type StatusRow = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  is_default: boolean;
  system_key: string | null;
  group_id?: string | null;
  button_lane?: string | null;
  application_status_groups?: GroupJoin | GroupJoin[] | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type GroupRow = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  system_key: string | null;
  created_at: string;
  updated_at: string;
};

type HistoryRow = {
  id: string;
  tenant_id: string;
  application_id: string;
  from_status_id: string | null;
  from_status_name: string | null;
  to_status_id: string | null;
  to_status_name: string;
  changed_by_user_id: string | null;
  change_source: string | null;
  note: string | null;
  created_at: string;
};

function normalizeChangeSource(value: string | null | undefined): ApplicationStatusChangeSource {
  if (value === "SYSTEM" || value === "API") return value;
  return "USER";
}

/**
 * Placement acceptance is the system key `hired` ("Selected by Client"), not the display name.
 */
export async function previousPlacementSystemKey(
  supabase: SupabaseClient,
  params: { tenantId: string; statusId: string | null; displayName: string | null }
): Promise<string | null> {
  if (params.statusId) {
    const { data, error } = await supabase
      .from("application_statuses")
      .select("system_key")
      .eq("id", params.statusId)
      .eq("tenant_id", params.tenantId)
      .maybeSingle();
    if (!error && data && typeof data.system_key === "string" && data.system_key.trim()) {
      return data.system_key;
    }
  }
  return params.displayName;
}

function oneGroup(value: StatusRow["application_status_groups"]): GroupJoin | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function mapGroup(row: GroupRow): ApplicationStatusGroupRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order,
    systemKey: row.system_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStatus(row: StatusRow): ApplicationStatusRecord {
  const group = oneGroup(row.application_status_groups);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    color: row.color,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    isDefault: row.is_default,
    systemKey: (row.system_key as ApplicationStatusRecord["systemKey"]) ?? null,
    groupId: row.group_id ?? group?.id ?? null,
    groupName: group?.name ?? null,
    groupDescription: group?.description ?? null,
    groupSortOrder: group?.sort_order ?? null,
    groupSystemKey: group?.system_key ?? null,
    buttonLane: row.button_lane ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function ensureDefaultApplicationStatuses(
  supabase: SupabaseClient,
  tenantId: string
): Promise<void> {
  const { count, error: countError } = await supabase
    .from("application_statuses")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (countError) throw countError;
  // Once a tenant has a catalog, do not recreate statuses an admin deleted.
  if ((count ?? 0) > 0) return;

  const { error } = await supabase.rpc("ensure_default_application_statuses", {
    p_tenant_id: tenantId,
  });
  if (error) throw error;
}

export async function listApplicationStatuses(
  supabase: SupabaseClient,
  tenantId: string,
  options?: { activeOnly?: boolean; ensureDefaults?: boolean }
): Promise<ApplicationStatusRecord[]> {
  if (options?.ensureDefaults !== false) {
    await ensureDefaultApplicationStatuses(supabase, tenantId);
  }

  const baseColumns =
    "id, tenant_id, name, description, color, sort_order, is_active, is_default, system_key, group_id, created_by, created_at, updated_at";

  let query = supabase
    .from("application_statuses")
    .select(STATUS_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (options?.activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (!error) {
    return ((data ?? []) as StatusRow[]).map(mapStatus);
  }

  // Schema-cache lag after adding groups: still return statuses without the join.
  const message = String((error as { message?: string }).message ?? error);
  if (/application_status_groups|group_id|schema cache|Could not find/i.test(message)) {
    let fallback = supabase
      .from("application_statuses")
      .select(baseColumns)
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (options?.activeOnly) {
      fallback = fallback.eq("is_active", true);
    }
    const retry = await fallback;
    if (retry.error) throw retry.error;
    return ((retry.data ?? []) as StatusRow[]).map(mapStatus);
  }

  throw error;
}

export async function listApplicationStatusGroups(
  supabase: SupabaseClient,
  tenantId: string
): Promise<ApplicationStatusGroupRecord[]> {
  const { data, error } = await supabase
    .from("application_status_groups")
    .select(GROUP_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    const message = String((error as { message?: string }).message ?? error);
    if (/application_status_groups|schema cache|Could not find/i.test(message)) {
      return [];
    }
    throw error;
  }
  return ((data ?? []) as GroupRow[]).map(mapGroup);
}

/** Exact application counts keyed by status id (tenant-scoped). */
export async function countApplicationsByStatus(
  supabase: SupabaseClient,
  tenantId: string,
  statuses: ApplicationStatusRecord[]
): Promise<Record<string, number>> {
  const entries = await Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await supabase
        .from("job_applications")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status_id", status.id);
      if (error) throw error;
      return [status.id, count ?? 0] as const;
    })
  );
  return Object.fromEntries(entries);
}

export async function getStatusBySystemKey(
  supabase: SupabaseClient,
  tenantId: string,
  systemKey: ApplicationPipelineStatus | "withdrawn"
): Promise<ApplicationStatusRecord | null> {
  await ensureDefaultApplicationStatuses(supabase, tenantId);
  const { data, error } = await supabase
    .from("application_statuses")
    .select(
      STATUS_COLUMNS
    )
    .eq("tenant_id", tenantId)
    .eq("system_key", systemKey)
    .maybeSingle();
  if (error) throw error;
  return data ? mapStatus(data as StatusRow) : null;
}

export async function createApplicationStatus(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    name: string;
    description?: string | null;
    color?: string | null;
    sortOrder?: number;
    isActive?: boolean;
    isDefault?: boolean;
    groupId?: string | null;
    createdBy?: string | null;
  }
): Promise<ApplicationStatusRecord> {
  const name = input.name.trim();
  if (!name) {
    throw new ApplicationStatusError("Status name is required", "VALIDATION");
  }

  if (input.groupId) {
    await assertGroupInTenant(supabase, input.tenantId, input.groupId);
  }

  if (input.isDefault) {
    await clearDefaultFlag(supabase, input.tenantId);
  }

  const maxSort = await nextSortOrder(supabase, input.tenantId);

  const { data, error } = await supabase
    .from("application_statuses")
    .insert({
      tenant_id: input.tenantId,
      name,
      description: input.description?.trim() || null,
      color: input.color?.trim() || null,
      sort_order: input.sortOrder ?? maxSort,
      is_active: input.isActive ?? true,
      is_default: input.isDefault ?? false,
      group_id: input.groupId ?? null,
      created_by: input.createdBy ?? null,
    })
    .select(
      STATUS_COLUMNS
    )
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ApplicationStatusError("A status with this name already exists", "CONFLICT", 409);
    }
    throw error;
  }

  return mapStatus(data as StatusRow);
}

export async function updateApplicationStatus(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    statusId: string;
    name?: string;
    description?: string | null;
    color?: string | null;
    sortOrder?: number;
    isActive?: boolean;
    isDefault?: boolean;
    groupId?: string | null;
  }
): Promise<ApplicationStatusRecord> {
  const existing = await getStatusOrThrow(supabase, input.tenantId, input.statusId);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new ApplicationStatusError("Status name is required", "VALIDATION");
    patch.name = name;
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }
  if (input.color !== undefined) {
    patch.color = input.color?.trim() || null;
  }
  if (input.sortOrder !== undefined) {
    patch.sort_order = input.sortOrder;
  }
  if (input.isActive !== undefined) {
    if (input.isActive === false && existing.isDefault) {
      throw new ApplicationStatusError(
        "Cannot deactivate the default status. Set another default first.",
        "VALIDATION"
      );
    }
    patch.is_active = input.isActive;
  }
  if (input.isDefault === true) {
    await clearDefaultFlag(supabase, input.tenantId, input.statusId);
    patch.is_default = true;
    patch.is_active = true;
  } else if (input.isDefault === false) {
    patch.is_default = false;
  }
  if (input.groupId !== undefined) {
    if (input.groupId) {
      await assertGroupInTenant(supabase, input.tenantId, input.groupId);
      patch.group_id = input.groupId;
    } else {
      patch.group_id = null;
    }
  }

  if (Object.keys(patch).length === 0) {
    return existing;
  }

  const { data, error } = await supabase
    .from("application_statuses")
    .update(patch)
    .eq("id", input.statusId)
    .eq("tenant_id", input.tenantId)
    .select(
      STATUS_COLUMNS
    )
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      throw new ApplicationStatusError("A status with this name already exists", "CONFLICT", 409);
    }
    throw error;
  }
  if (!data) throw new ApplicationStatusError("Status not found", "NOT_FOUND", 404);
  return mapStatus(data as StatusRow);
}

export async function deleteApplicationStatus(
  supabase: SupabaseClient,
  input: { tenantId: string; statusId: string }
): Promise<void> {
  const existing = await getStatusOrThrow(supabase, input.tenantId, input.statusId);
  if (existing.isDefault) {
    throw new ApplicationStatusError(
      "The default status can't be deleted. Choose another default first.",
      "VALIDATION"
    );
  }

  const { count, error: countError } = await supabase
    .from("job_applications")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", input.tenantId)
    .eq("status_id", input.statusId);
  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    throw new ApplicationStatusError(
      "This status is still used by applications and can't be deleted.",
      "CONFLICT",
      409
    );
  }

  const { error } = await supabase
    .from("application_statuses")
    .delete()
    .eq("id", input.statusId)
    .eq("tenant_id", input.tenantId);
  if (error) throw error;
}

export async function reorderApplicationStatuses(
  supabase: SupabaseClient,
  tenantId: string,
  orderedIds: string[]
): Promise<ApplicationStatusRecord[]> {
  const statuses = await listApplicationStatuses(supabase, tenantId, { ensureDefaults: true });
  const idSet = new Set(statuses.map((s) => s.id));
  for (const id of orderedIds) {
    if (!idSet.has(id)) {
      throw new ApplicationStatusError("Unknown status in reorder list", "VALIDATION");
    }
  }

  await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from("application_statuses")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("tenant_id", tenantId)
    )
  );

  return listApplicationStatuses(supabase, tenantId, { ensureDefaults: false });
}

export async function createApplicationStatusGroup(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    name: string;
    description?: string | null;
  }
): Promise<ApplicationStatusGroupRecord> {
  const name = input.name.trim();
  if (!name) throw new ApplicationStatusError("Group name is required", "VALIDATION");
  const description = cleanGroupDescription(input.description);

  const sortOrder = await nextGroupSortOrder(supabase, input.tenantId);
  const { data, error } = await supabase
    .from("application_status_groups")
    .insert({
      tenant_id: input.tenantId,
      name,
      description,
      sort_order: sortOrder,
      system_key: null,
    })
    .select(GROUP_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ApplicationStatusError("A group with this name already exists", "CONFLICT", 409);
    }
    throw error;
  }
  return mapGroup(data as GroupRow);
}

export async function updateApplicationStatusGroup(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    groupId: string;
    name?: string;
    description?: string | null;
  }
): Promise<ApplicationStatusGroupRecord> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new ApplicationStatusError("Group name is required", "VALIDATION");
    patch.name = name;
  }
  if (input.description !== undefined) {
    patch.description = cleanGroupDescription(input.description);
  }
  if (Object.keys(patch).length === 0) {
    const existing = await assertGroupInTenant(supabase, input.tenantId, input.groupId);
    return existing;
  }

  const { data, error } = await supabase
    .from("application_status_groups")
    .update(patch)
    .eq("id", input.groupId)
    .eq("tenant_id", input.tenantId)
    .select(GROUP_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      throw new ApplicationStatusError("A group with this name already exists", "CONFLICT", 409);
    }
    throw error;
  }
  if (!data) throw new ApplicationStatusError("Status group not found", "NOT_FOUND", 404);
  return mapGroup(data as GroupRow);
}

export async function changeApplicationStatus(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    applicationId: string;
    statusId: string;
    changedByUserId?: string | null;
    note?: string | null;
    origin?: string | null;
    changeSource?: "USER" | "SYSTEM" | "API";
  }
): Promise<ChangeApplicationStatusResult> {
  const note =
    typeof input.note === "string" ? input.note.trim() || null : input.note ?? null;
  if (note && note.length > 4000) {
    throw new ApplicationStatusError("Note must be 4000 characters or fewer", "VALIDATION");
  }

  const changeSource = input.changeSource ?? "USER";

  const { data, error } = await supabase.rpc("change_job_application_status", {
    p_tenant_id: input.tenantId,
    p_application_id: input.applicationId,
    p_to_status_id: input.statusId,
    p_changed_by_user_id: input.changedByUserId ?? null,
    p_note: note,
  });

  if (error) {
    const message = String(error.message ?? "");
    if (/Application not found|Status not found/i.test(message)) {
      throw new ApplicationStatusError(message, "NOT_FOUND", 404);
    }
    if (/inactive/i.test(message)) {
      throw new ApplicationStatusError("Status is inactive", "INACTIVE", 400);
    }
    if (/Note too long/i.test(message)) {
      throw new ApplicationStatusError("Note must be 4000 characters or fewer", "VALIDATION");
    }
    if (/required.*task|gate|blocked|must complete/i.test(message)) {
      throw new ApplicationStatusError(
        message || "Finish the open tasks before changing status.",
        "GATE_TASK_OPEN",
        422
      );
    }
    if (/invalid.*transition|not allowed|cannot move/i.test(message)) {
      throw new ApplicationStatusError(
        message || "This status transition is not allowed.",
        "INVALID_TRANSITION",
        422
      );
    }
    if (/conflict|status.*changed|stale/i.test(message)) {
      throw new ApplicationStatusError(
        message || "Status was changed by another user. Please refresh and try again.",
        "STATUS_CHANGED",
        409
      );
    }
    throw error;
  }

  const payload = data as {
    unchanged: boolean;
    application: {
      id: string;
      statusId: string;
      status: string;
      statusName: string;
    };
    history: null | {
      id: string;
      fromStatusId: string | null;
      fromStatusName: string | null;
      toStatusId: string;
      toStatusName: string;
      note: string | null;
      changedByUserId: string | null;
      changedAt: string;
    };
  };

  const result: ChangeApplicationStatusResult = {
    unchanged: Boolean(payload.unchanged),
    application: payload.application,
    history: payload.history
      ? {
          id: payload.history.id,
          fromStatus: {
            id: payload.history.fromStatusId,
            name: payload.history.fromStatusName,
          },
          toStatus: {
            id: payload.history.toStatusId,
            name: payload.history.toStatusName,
          },
          note: payload.history.note,
          changedByUserId: payload.history.changedByUserId,
          changedAt: payload.history.changedAt,
        }
      : null,
    postHire: null,
  };

  if (shouldActivatePostHireAfterStatusChange({
    unchanged: result.unchanged,
    status: result.application.status,
  })) {
    try {
      const postHire = await activatePostHire(supabase, {
        tenantId: input.tenantId,
        applicationId: input.applicationId,
        actorUserId: input.changedByUserId,
        origin: input.origin,
        sendEmail: Boolean(input.origin),
      });
      result.postHire = {
        activated: postHire.activated,
        alreadyActive: postHire.alreadyActive,
        phase: postHire.phase,
        emailSent: Boolean(postHire.email?.sent),
      };
    } catch (activationError) {
      console.error("[changeApplicationStatus] activatePostHire", activationError);
    }
  }

  const previousStatusKey = await previousPlacementSystemKey(supabase, {
    tenantId: input.tenantId,
    statusId: result.history?.fromStatus.id ?? null,
    displayName: result.history?.fromStatus.name ?? null,
  });

  if (
    shouldSuspendPostHireAfterStatusChange({
      previousStatus: previousStatusKey,
      nextStatus: result.application.status,
      unchanged: result.unchanged,
    })
  ) {
    await writeActivityLog({
      actorUserId: input.changedByUserId ?? null,
      action: "post_hire.suspended",
      entityType: "job_application",
      entityId: input.applicationId,
      tenantId: input.tenantId,
      metadata: { status: result.application.status },
    });
  }

  if (!result.unchanged) {
    await invalidateCandidateKpiCache(input.tenantId);
    await writeActivityLog({
      actorUserId: input.changedByUserId ?? null,
      action: isPlacementAcceptedStatus(result.application.status)
        ? "application.hired"
        : "application.status_changed",
      entityType: "job_application",
      entityId: input.applicationId,
      tenantId: input.tenantId,
      metadata: {
        status: result.application.status,
        postHire: result.postHire,
      },
    });
  }

  return result;
}

export async function changeApplicationStatusBySystemKey(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    applicationId: string;
    systemKey: ApplicationPipelineStatus | "withdrawn";
    changedByUserId?: string | null;
    note?: string | null;
    origin?: string | null;
  }
): Promise<ChangeApplicationStatusResult> {
  const status = await getStatusBySystemKey(supabase, input.tenantId, input.systemKey);
  if (!status) {
    throw new ApplicationStatusError(
      `Status "${input.systemKey}" is not configured for this tenant`,
      "NOT_FOUND",
      404
    );
  }
  if (!status.isActive) {
    throw new ApplicationStatusError("Status is inactive", "INACTIVE", 400);
  }
  return changeApplicationStatus(supabase, {
    tenantId: input.tenantId,
    applicationId: input.applicationId,
    statusId: status.id,
    changedByUserId: input.changedByUserId,
    note: input.note,
    origin: input.origin,
  });
}

export async function listApplicationStatusHistory(
  supabase: SupabaseClient,
  input: { tenantId: string; applicationId: string }
): Promise<ApplicationStatusHistoryRecord[]> {
  const { data: app, error: appError } = await supabase
    .from("job_applications")
    .select("id")
    .eq("id", input.applicationId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (appError) throw appError;
  if (!app) throw new ApplicationStatusError("Application not found", "NOT_FOUND", 404);

  const { data, error } = await supabase
    .from("application_status_history")
    .select(
      "id, tenant_id, application_id, from_status_id, from_status_name, to_status_id, to_status_name, changed_by_user_id, change_source, note, created_at"
    )
    .eq("tenant_id", input.tenantId)
    .eq("application_id", input.applicationId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as HistoryRow[];
  const userIds = Array.from(
    new Set(rows.map((r) => r.changed_by_user_id).filter((id): id is string => Boolean(id)))
  );

  const nameByUserId = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, first_name, last_name, email")
      .in("id", userIds);
    for (const user of users ?? []) {
      const row = user as {
        id: string;
        first_name?: string | null;
        last_name?: string | null;
        email?: string | null;
      };
      const fullName = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
      nameByUserId.set(row.id, fullName || row.email?.trim() || "Staff");
    }
  }

  return rows.map((row) => ({
    id: row.id,
    applicationId: row.application_id,
    tenantId: row.tenant_id,
    fromStatusId: row.from_status_id,
    fromStatusName: row.from_status_name,
    toStatusId: row.to_status_id,
    toStatusName: row.to_status_name,
    changedByUserId: row.changed_by_user_id,
    changedByName: row.changed_by_user_id
      ? nameByUserId.get(row.changed_by_user_id) ?? "Staff"
      : "System",
    changeSource: normalizeChangeSource(row.change_source),
    note: row.note,
    createdAt: row.created_at,
  }));
}

function cleanGroupDescription(value: string | null | undefined): string | null {
  if (value == null) return null;
  const description = value.trim();
  if (!description) return null;
  if (description.length > 2000) {
    throw new ApplicationStatusError("Group notes must be 2000 characters or fewer", "VALIDATION");
  }
  return description;
}

async function assertGroupInTenant(
  supabase: SupabaseClient,
  tenantId: string,
  groupId: string
): Promise<ApplicationStatusGroupRecord> {
  const { data, error } = await supabase
    .from("application_status_groups")
    .select(GROUP_COLUMNS)
    .eq("id", groupId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApplicationStatusError("Status group not found", "NOT_FOUND", 404);
  return mapGroup(data as GroupRow);
}

async function nextGroupSortOrder(supabase: SupabaseClient, tenantId: string): Promise<number> {
  const { data, error } = await supabase
    .from("application_status_groups")
    .select("sort_order")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return ((data as { sort_order?: number } | null)?.sort_order ?? -1) + 1;
}

async function getStatusOrThrow(
  supabase: SupabaseClient,
  tenantId: string,
  statusId: string
): Promise<ApplicationStatusRecord> {
  const { data, error } = await supabase
    .from("application_statuses")
    .select(
      STATUS_COLUMNS
    )
    .eq("id", statusId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApplicationStatusError("Status not found", "NOT_FOUND", 404);
  return mapStatus(data as StatusRow);
}

async function clearDefaultFlag(
  supabase: SupabaseClient,
  tenantId: string,
  exceptId?: string
): Promise<void> {
  let query = supabase
    .from("application_statuses")
    .update({ is_default: false })
    .eq("tenant_id", tenantId)
    .eq("is_default", true);
  if (exceptId) query = query.neq("id", exceptId);
  const { error } = await query;
  if (error) throw error;
}

async function nextSortOrder(supabase: SupabaseClient, tenantId: string): Promise<number> {
  const { data, error } = await supabase
    .from("application_statuses")
    .select("sort_order")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return ((data as { sort_order?: number } | null)?.sort_order ?? -1) + 1;
}

type GroupStageAssignmentRow = {
  id: string;
  tenant_id: string;
  stage_name: string;
  group_id: string;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const GROUP_STAGE_ASSIGNMENT_COLUMNS =
  "id, tenant_id, stage_name, group_id, sort_order, created_by, created_at, updated_at";

function mapGroupStageAssignment(
  row: GroupStageAssignmentRow
): ApplicationStatusGroupStageAssignmentRecord | null {
  if (!isAssignableStatusStageName(row.stage_name)) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    stageName: row.stage_name,
    groupId: row.group_id,
    sortOrder: row.sort_order,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function ensureDefaultPreHireGroupStageAssignments(
  supabase: SupabaseClient,
  tenantId: string
): Promise<void> {
  const { error } = await supabase.rpc("ensure_default_prehire_group_stage_assignments", {
    p_tenant_id: tenantId,
  });
  if (error) {
    const message = String((error as { message?: string }).message ?? error);
    if (/ensure_default_prehire_group_stage_assignments|schema cache|Could not find/i.test(message)) {
      return;
    }
    throw error;
  }
}

export async function ensureDefaultAiMatchGroupStageAssignments(
  supabase: SupabaseClient,
  tenantId: string
): Promise<void> {
  const { error } = await supabase.rpc("ensure_default_ai_match_group_stage_assignments", {
    p_tenant_id: tenantId,
  });
  if (error) {
    const message = String((error as { message?: string }).message ?? error);
    if (/ensure_default_ai_match_group_stage_assignments|schema cache|Could not find/i.test(message)) {
      return;
    }
    throw error;
  }
}

export async function listApplicationStatusGroupStageAssignments(
  supabase: SupabaseClient,
  tenantId: string,
  options?: { ensureDefaults?: boolean }
): Promise<ApplicationStatusGroupStageAssignmentRecord[]> {
  if (options?.ensureDefaults !== false) {
    await ensureDefaultApplicationStatuses(supabase, tenantId);
    await ensureDefaultPreHireGroupStageAssignments(supabase, tenantId);
    await ensureDefaultAiMatchGroupStageAssignments(supabase, tenantId);
  }

  const { data, error } = await supabase
    .from("application_status_group_stage_assignments")
    .select(GROUP_STAGE_ASSIGNMENT_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("stage_name", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    const message = String((error as { message?: string }).message ?? error);
    if (/application_status_group_stage_assignments|schema cache|Could not find/i.test(message)) {
      return [];
    }
    throw error;
  }
  return ((data ?? []) as GroupStageAssignmentRow[])
    .map(mapGroupStageAssignment)
    .filter((row): row is ApplicationStatusGroupStageAssignmentRecord => row != null);
}

/**
 * Assign a status group to a Pre-Hire stage.
 * The same group may be assigned to many stages (one-to-many).
 * Closed cannot be assigned — it is always shared.
 */
export async function assignGroupToPreHireStage(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    stageName: string;
    groupId: string;
    actorUserId?: string | null;
  }
): Promise<ApplicationStatusGroupStageAssignmentRecord[]> {
  if (!isAssignableStatusStageName(input.stageName)) {
    throw new ApplicationStatusError(`Unknown stage: ${input.stageName}`, "VALIDATION");
  }
  const group = await assertGroupInTenant(supabase, input.tenantId, input.groupId);
  if (isSharedClosedGroupKey(group.systemKey)) {
    throw new ApplicationStatusError(
      "Closed is already available on every stage and does not need assignment.",
      "VALIDATION"
    );
  }

  const existing = await listApplicationStatusGroupStageAssignments(supabase, input.tenantId, {
    ensureDefaults: false,
  });
  const already = existing.some(
    (row) => row.stageName === input.stageName && row.groupId === input.groupId
  );
  if (already) {
    return existing;
  }

  const stageCount = existing.filter((row) => row.stageName === input.stageName).length;
  const { error } = await supabase.from("application_status_group_stage_assignments").insert({
    tenant_id: input.tenantId,
    stage_name: input.stageName,
    group_id: input.groupId,
    sort_order: stageCount,
    created_by: input.actorUserId ?? null,
  });
  if (error) {
    if (error.code === "23505") {
      return listApplicationStatusGroupStageAssignments(supabase, input.tenantId, {
        ensureDefaults: false,
      });
    }
    throw error;
  }

  return listApplicationStatusGroupStageAssignments(supabase, input.tenantId, {
    ensureDefaults: false,
  });
}

/** Remove a status group from one Pre-Hire stage (other stages keep it). */
export async function unassignGroupFromPreHireStage(
  supabase: SupabaseClient,
  input: { tenantId: string; stageName: string; groupId: string }
): Promise<ApplicationStatusGroupStageAssignmentRecord[]> {
  if (!isAssignableStatusStageName(input.stageName)) {
    throw new ApplicationStatusError(`Unknown stage: ${input.stageName}`, "VALIDATION");
  }
  const { error } = await supabase
    .from("application_status_group_stage_assignments")
    .delete()
    .eq("tenant_id", input.tenantId)
    .eq("stage_name", input.stageName)
    .eq("group_id", input.groupId);
  if (error) throw error;
  return listApplicationStatusGroupStageAssignments(supabase, input.tenantId, {
    ensureDefaults: false,
  });
}

export type ApplicationStatusStageLaneRecord = {
  id: string;
  tenantId: string;
  stageName: StatusStageName;
  statusId: string;
  lane: StageStatusLane;
  sortOrder: number;
  workflowId: string | null;
  noteId: string | null;
  note: string | null;
};

type StageLaneRow = {
  id: string;
  tenant_id: string;
  stage_name: string;
  status_id: string;
  lane: string;
  sort_order: number;
  workflow_id?: string | null;
  note_id?: string | null;
  note?: string | null;
};

function mapStageLane(row: StageLaneRow): ApplicationStatusStageLaneRecord | null {
  const lane = normalizeStageStatusLane(row.lane);
  if (!isAssignableStatusStageName(row.stage_name) || !lane) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    stageName: row.stage_name,
    statusId: row.status_id,
    lane,
    sortOrder: row.sort_order,
    workflowId: row.workflow_id ?? null,
    noteId: row.note_id ?? null,
    note: typeof row.note === "string" && row.note.trim() ? row.note.trim() : null,
  };
}

const STAGE_LANE_COLUMNS =
  "id, tenant_id, stage_name, status_id, lane, sort_order, workflow_id, note_id, note";

export async function listApplicationStatusStageLanes(
  supabase: SupabaseClient,
  tenantId: string
): Promise<ApplicationStatusStageLaneRecord[]> {
  const scoped = await supabase
    .from("application_status_stage_lanes")
    .select(STAGE_LANE_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("stage_name", { ascending: true })
    .order("sort_order", { ascending: true });
  const query = scoped.error && /workflow_id|note_id|\bnote\b|schema cache|Could not find/i.test(String(scoped.error.message ?? ""))
    ? await supabase
        .from("application_status_stage_lanes")
        .select("id, tenant_id, stage_name, status_id, lane, sort_order, workflow_id, note_id")
        .eq("tenant_id", tenantId)
        .order("stage_name", { ascending: true })
        .order("sort_order", { ascending: true })
    : scoped;
  if (query.error) {
    const message = String(query.error.message ?? query.error);
    if (/application_status_stage_lanes|schema cache|Could not find/i.test(message)) return [];
    throw query.error;
  }
  return ((query.data ?? []) as StageLaneRow[])
    .map(mapStageLane)
    .filter((row): row is ApplicationStatusStageLaneRecord => row != null);
}

async function assertWorkflowInTenant(
  supabase: SupabaseClient,
  tenantId: string,
  workflowId: string | null
): Promise<void> {
  if (!workflowId) return;
  const { data, error } = await supabase
    .from("onboarding_flows")
    .select("id")
    .eq("id", workflowId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) {
    throw new ApplicationStatusError("Workflow not found for this tenant.", "NOT_FOUND", 404);
  }
}

export type ApplicationStatusStageButtonRecord = {
  id: string;
  tenantId: string;
  stageName: StatusStageName;
  workflowId: string | null;
  showAlternate: boolean;
  showClosed: boolean;
  /** Null shows the alternate status name from the catalog. */
  alternateLabel: string | null;
  /** Null shows the closing status name from the catalog. */
  closedLabel: string | null;
};

type StageButtonRow = {
  id: string;
  tenant_id: string;
  stage_name: string;
  workflow_id?: string | null;
  show_alternate: boolean;
  show_closed: boolean;
  alternate_label?: string | null;
  closed_label?: string | null;
};

const STAGE_BUTTON_COLUMNS =
  "id, tenant_id, stage_name, workflow_id, show_alternate, show_closed, alternate_label, closed_label";
const STAGE_BUTTON_COLUMNS_WITHOUT_LABELS =
  "id, tenant_id, stage_name, workflow_id, show_alternate, show_closed";

function mapStageButton(row: StageButtonRow): ApplicationStatusStageButtonRecord | null {
  if (!isAssignableStatusStageName(row.stage_name)) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    stageName: row.stage_name,
    workflowId: row.workflow_id ?? null,
    showAlternate: row.show_alternate !== false,
    showClosed: row.show_closed !== false,
    alternateLabel: row.alternate_label?.trim() || null,
    closedLabel: row.closed_label?.trim() || null,
  };
}

function stageButtonErrorMessage(error: unknown): string {
  return String((error as { message?: string }).message ?? error);
}

function isMissingStageButtonTable(error: unknown): boolean {
  const message = stageButtonErrorMessage(error);
  if (/alternate_label|closed_label/i.test(message)) return false;
  return /application_status_stage_buttons|schema cache|Could not find/i.test(message);
}

function isMissingStageButtonLabelColumn(error: unknown): boolean {
  return /alternate_label|closed_label/i.test(stageButtonErrorMessage(error));
}

function requireStageButtonLabel(
  lane: StageActionButtonLane,
  value: string | null | undefined
): string | null {
  const parsed = normalizeStageButtonLabel(lane, value);
  if (!parsed.ok) throw new ApplicationStatusError(parsed.error, "VALIDATION");
  return parsed.label;
}

export async function listApplicationStatusStageButtons(
  supabase: SupabaseClient,
  tenantId: string
): Promise<ApplicationStatusStageButtonRecord[]> {
  const first = await supabase
    .from("application_status_stage_buttons")
    .select(STAGE_BUTTON_COLUMNS)
    .eq("tenant_id", tenantId);
  const query = first.error && isMissingStageButtonLabelColumn(first.error)
    ? await supabase
        .from("application_status_stage_buttons")
        .select(STAGE_BUTTON_COLUMNS_WITHOUT_LABELS)
        .eq("tenant_id", tenantId)
    : first;
  if (query.error) {
    if (isMissingStageButtonTable(query.error)) return [];
    throw query.error;
  }
  return ((query.data ?? []) as StageButtonRow[])
    .map(mapStageButton)
    .filter((row): row is ApplicationStatusStageButtonRecord => row != null);
}

async function replaceApplicationStatusStageButtons(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    stageName: string;
    workflowId: string | null;
    showAlternate: boolean;
    showClosed: boolean;
    /** Undefined keeps the label already stored for this stage. */
    alternateLabel?: string | null;
    closedLabel?: string | null;
  }
): Promise<void> {
  const current = (await listApplicationStatusStageButtons(supabase, input.tenantId)).find(
    (row) => row.stageName === input.stageName && (row.workflowId ?? null) === input.workflowId
  );
  const alternateLabel =
    input.alternateLabel === undefined
      ? current?.alternateLabel ?? null
      : requireStageButtonLabel("alternate", input.alternateLabel);
  const closedLabel =
    input.closedLabel === undefined
      ? current?.closedLabel ?? null
      : requireStageButtonLabel("closed", input.closedLabel);
  let deleteQuery = supabase
    .from("application_status_stage_buttons")
    .delete()
    .eq("tenant_id", input.tenantId)
    .eq("stage_name", input.stageName);
  deleteQuery = input.workflowId
    ? deleteQuery.eq("workflow_id", input.workflowId)
    : deleteQuery.is("workflow_id", null);
  const { error: deleteError } = await deleteQuery;
  if (deleteError) {
    if (isMissingStageButtonTable(deleteError)) return;
    throw deleteError;
  }
  const row = {
    tenant_id: input.tenantId,
    stage_name: input.stageName,
    workflow_id: input.workflowId,
    show_alternate: input.showAlternate,
    show_closed: input.showClosed,
    alternate_label: alternateLabel,
    closed_label: closedLabel,
  };
  const { error: insertError } = await supabase.from("application_status_stage_buttons").insert(row);
  if (insertError && isMissingStageButtonLabelColumn(insertError)) {
    if (input.alternateLabel !== undefined || input.closedLabel !== undefined) {
      throw new ApplicationStatusError(
        "Button labels are not available until the stage button migration is applied.",
        "VALIDATION"
      );
    }
    const { alternate_label: _alternateLabel, closed_label: _closedLabel, ...withoutLabels } = row;
    const retry = await supabase.from("application_status_stage_buttons").insert(withoutLabels);
    if (retry.error) {
      if (isMissingStageButtonTable(retry.error)) return;
      throw retry.error;
    }
    return;
  }
  if (insertError) {
    if (isMissingStageButtonTable(insertError)) return;
    throw insertError;
  }
}

export type ApplicationStatusButtonLabels = {
  alternateLabel: string | null;
  closedLabel: string | null;
};

function mapButtonLabels(row: {
  alternate_label?: string | null;
  closed_label?: string | null;
} | null): ApplicationStatusButtonLabels {
  return {
    alternateLabel: row?.alternate_label?.trim() || null,
    closedLabel: row?.closed_label?.trim() || null,
  };
}

function isMissingButtonLabelTable(error: unknown): boolean {
  const message = stageButtonErrorMessage(error);
  return /application_status_button_labels|schema cache|Could not find/i.test(message);
}

/** One follow-up and close name for every stage in the tenant. */
export async function getApplicationStatusButtonLabels(
  supabase: SupabaseClient,
  tenantId: string
): Promise<ApplicationStatusButtonLabels> {
  const { data, error } = await supabase
    .from("application_status_button_labels")
    .select("alternate_label, closed_label")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    if (isMissingButtonLabelTable(error)) return { alternateLabel: null, closedLabel: null };
    throw error;
  }
  return mapButtonLabels(data);
}

export async function saveApplicationStatusButtonLabels(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    alternateLabel: string | null;
    closedLabel: string | null;
  }
): Promise<ApplicationStatusButtonLabels> {
  const alternateLabel = requireStageButtonLabel("alternate", input.alternateLabel);
  const closedLabel = requireStageButtonLabel("closed", input.closedLabel);
  const { error } = await supabase.from("application_status_button_labels").upsert(
    {
      tenant_id: input.tenantId,
      alternate_label: alternateLabel,
      closed_label: closedLabel,
    },
    { onConflict: "tenant_id" }
  );
  if (error) {
    if (isMissingButtonLabelTable(error)) {
      throw new ApplicationStatusError(
        "Button labels are not available until the button label migration is applied.",
        "VALIDATION"
      );
    }
    throw error;
  }
  return { alternateLabel, closedLabel };
}

export type StageLanePlacement = {
  statusId: string;
  /** Undefined keeps the note already stored for this status. */
  noteId?: string | null;
  /** Free-text note for this status on this stage. Undefined keeps the saved text. */
  note?: string | null;
};

export async function replaceApplicationStatusStageLanes(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    stageName: string;
    lanes: Record<StageStatusLane, StageLanePlacement[]>;
    workflowId?: string | null;
  }
): Promise<ApplicationStatusStageLaneRecord[]> {
  if (!isAssignableStatusStageName(input.stageName)) {
    throw new ApplicationStatusError(`Unknown stage: ${input.stageName}`, "VALIDATION");
  }
  const workflowId = input.workflowId?.trim() || null;
  await assertWorkflowInTenant(supabase, input.tenantId, workflowId);
  const current = await listApplicationStatusStageLanes(supabase, input.tenantId);
  const previous = new Map(
    current
      .filter(
        (row) =>
          row.stageName === input.stageName && (row.workflowId ?? null) === workflowId
      )
      .map((row) => [row.statusId, row])
  );
  const rows = STAGE_STATUS_LANES.flatMap((lane) =>
    input.lanes[lane].map((placement, sortOrder) => {
      const prior = previous.get(placement.statusId);
      const noteSource = placement.note === undefined ? prior?.note ?? null : placement.note;
      const note = noteSource?.trim() || null;
      if (note && note.length > 2000) {
        throw new ApplicationStatusError("Notes must be 2000 characters or fewer.", "VALIDATION");
      }
      return {
        tenant_id: input.tenantId,
        stage_name: input.stageName,
        status_id: placement.statusId,
        lane,
        sort_order: sortOrder,
        workflow_id: workflowId,
        note_id:
          placement.noteId === undefined ? prior?.noteId ?? null : placement.noteId,
        note,
      };
    })
  );
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.status_id)) {
      throw new ApplicationStatusError("A status can only be in one category on a stage.", "VALIDATION");
    }
    seen.add(row.status_id);
  }
  const noteIds = [...new Set(rows.map((row) => row.note_id).filter((id): id is string => Boolean(id)))];
  if (noteIds.length > 0) {
    const notes = await listApplicationStatusStageNotes(supabase, input.tenantId);
    for (const noteId of noteIds) {
      const note = notes.find((row) => row.id === noteId);
      if (!note || note.stageName !== input.stageName || (note.workflowId ?? null) !== workflowId) {
        throw new ApplicationStatusError("That note belongs to a different stage or workflow.", "VALIDATION");
      }
    }
  }

  let deleteQuery = supabase
    .from("application_status_stage_lanes")
    .delete()
    .eq("tenant_id", input.tenantId)
    .eq("stage_name", input.stageName);
  deleteQuery = workflowId ? deleteQuery.eq("workflow_id", workflowId) : deleteQuery.is("workflow_id", null);
  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw deleteError;
  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("application_status_stage_lanes").insert(rows);
    if (insertError && /note_id|\bnote\b|schema cache|Could not find/i.test(String(insertError.message ?? ""))) {
      const withoutNotes = rows.map(({ note_id: _noteId, note: _note, ...row }) => row);
      const retry = await supabase.from("application_status_stage_lanes").insert(withoutNotes);
      if (retry.error) throw retry.error;
    } else if (insertError) {
      throw insertError;
    }
  }
  await replaceApplicationStatusStageButtons(supabase, {
    tenantId: input.tenantId,
    stageName: input.stageName,
    workflowId,
    showAlternate: input.lanes.alternate.length > 0,
    showClosed: input.lanes.closed.length > 0,
  });
  return listApplicationStatusStageLanes(supabase, input.tenantId);
}

export type ApplicationStatusStageReasonCodeRecord = {
  id: string;
  tenantId: string;
  stageName: StatusStageName;
  code: string;
  sortOrder: number;
  workflowId: string | null;
  note: string | null;
  /** Alternate and closing keep separate lists. Older rows are closing codes. */
  lane: ReasonCodeLane;
};

type ReasonCodeRow = {
  id: string;
  tenant_id: string;
  stage_name: string;
  code: string;
  sort_order: number;
  workflow_id?: string | null;
  note?: string | null;
  lane?: string | null;
};

const REASON_CODE_COLUMNS =
  "id, tenant_id, stage_name, code, sort_order, workflow_id, note, lane";
const REASON_CODE_COLUMNS_WITHOUT_LANE =
  "id, tenant_id, stage_name, code, sort_order, workflow_id, note";

function mapReasonCode(row: ReasonCodeRow): ApplicationStatusStageReasonCodeRecord | null {
  if (!isAssignableStatusStageName(row.stage_name)) return null;
  const code = row.code.trim();
  if (!code) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    stageName: row.stage_name,
    code,
    sortOrder: row.sort_order,
    workflowId: row.workflow_id ?? null,
    note: row.note?.trim() || null,
    lane: reasonCodeLaneOf(row.lane),
  };
}

function isMissingReasonLaneColumn(error: unknown): boolean {
  const message = String((error as { message?: string }).message ?? error);
  return /\blane\b/i.test(message) && /schema cache|Could not find|does not exist/i.test(message);
}

function requireReasonCodeLane(value: string | null | undefined): ReasonCodeLane {
  const lane = normalizeReasonCodeLane(value);
  if (!lane) {
    throw new ApplicationStatusError("Choose alternate or closing for these reason codes.", "VALIDATION");
  }
  return lane;
}

export async function listApplicationStatusStageReasonCodes(
  supabase: SupabaseClient,
  tenantId: string
): Promise<ApplicationStatusStageReasonCodeRecord[]> {
  const existing = await supabase
    .from("application_status_stage_reason_codes")
    .select("id")
    .eq("tenant_id", tenantId)
    .is("workflow_id", null)
    .limit(1);
  if (existing.error) {
    const message = String(existing.error.message ?? existing.error);
    if (/application_status_stage_reason_codes|schema cache|Could not find/i.test(message)) return [];
    throw existing.error;
  }
  if ((existing.data ?? []).length === 0) {
    const defaultsByLane = {
      alternate: DEFAULT_ALTERNATE_REASON_CODES,
      closed: DEFAULT_CLOSING_REASON_CODES,
    } as const;
    const seed = REASON_CODE_LANES.flatMap((lane) =>
      Object.entries(defaultsByLane[lane]).flatMap(([stageName, codes]) => {
        if (!isAssignableStatusStageName(stageName)) return [];
        return codes.map((code, sortOrder) => ({
          tenant_id: tenantId,
          stage_name: stageName,
          code,
          sort_order: sortOrder,
          workflow_id: null,
          lane,
        }));
      })
    );
    if (seed.length > 0) {
      const seeded = await supabase.from("application_status_stage_reason_codes").insert(seed);
      if (seeded.error && isMissingReasonLaneColumn(seeded.error)) {
        const withoutLane = seed.map(({ lane: _lane, ...row }) => row);
        const retry = await supabase.from("application_status_stage_reason_codes").insert(withoutLane);
        if (retry.error && retry.error.code !== "23505") throw retry.error;
      } else if (seeded.error && seeded.error.code !== "23505") {
        throw seeded.error;
      }
    }
  }

  const listed = await supabase
    .from("application_status_stage_reason_codes")
    .select(REASON_CODE_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("stage_name", { ascending: true })
    .order("sort_order", { ascending: true });
  let data = listed.data;
  if (listed.error && isMissingReasonLaneColumn(listed.error)) {
    const retry = await supabase
      .from("application_status_stage_reason_codes")
      .select(REASON_CODE_COLUMNS_WITHOUT_LANE)
      .eq("tenant_id", tenantId)
      .order("stage_name", { ascending: true })
      .order("sort_order", { ascending: true });
    if (retry.error) throw retry.error;
    data = (retry.data ?? []).map((row) => ({ ...row, lane: "closed" }));
  } else if (listed.error) {
    throw listed.error;
  }
  return ((data ?? []) as ReasonCodeRow[])
    .map(mapReasonCode)
    .filter((row): row is ApplicationStatusStageReasonCodeRecord => row != null);
}

/** Used only before the lane column exists. The shared list is the closing list. */
async function replaceLegacySharedReasonCodes(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    stageName: string;
    workflowId: string | null;
    codes: string[];
    noteByCode: Map<string, string | null>;
  }
): Promise<ApplicationStatusStageReasonCodeRecord[]> {
  let deleteQuery = supabase
    .from("application_status_stage_reason_codes")
    .delete()
    .eq("tenant_id", input.tenantId)
    .eq("stage_name", input.stageName);
  deleteQuery = input.workflowId
    ? deleteQuery.eq("workflow_id", input.workflowId)
    : deleteQuery.is("workflow_id", null);
  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw deleteError;
  if (input.codes.length > 0) {
    const { error: insertError } = await supabase.from("application_status_stage_reason_codes").insert(
      input.codes.map((code, sortOrder) => ({
        tenant_id: input.tenantId,
        stage_name: input.stageName,
        code,
        sort_order: sortOrder,
        workflow_id: input.workflowId,
        note: input.noteByCode.get(code.trim().toLowerCase()) ?? null,
      }))
    );
    if (insertError) throw insertError;
  }
  return listApplicationStatusStageReasonCodes(supabase, input.tenantId);
}

export async function replaceApplicationStatusStageReasonCodes(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    stageName: string;
    codes: string[];
    workflowId?: string | null;
    lane: ReasonCodeLane | string;
  }
): Promise<ApplicationStatusStageReasonCodeRecord[]> {
  if (!isAssignableStatusStageName(input.stageName)) {
    throw new ApplicationStatusError(`Unknown stage: ${input.stageName}`, "VALIDATION");
  }
  const lane = requireReasonCodeLane(input.lane);
  const workflowId = input.workflowId?.trim() || null;
  await assertWorkflowInTenant(supabase, input.tenantId, workflowId);
  const codes = parseReasonCodeList(input.codes);
  if (codes.length > 30) {
    throw new ApplicationStatusError("A stage can have at most 30 reason codes.", "VALIDATION");
  }
  for (const code of codes) {
    if (code.length > 80) {
      throw new ApplicationStatusError("Reason codes must be 80 characters or fewer.", "VALIDATION");
    }
  }

  const prior = await listApplicationStatusStageReasonCodes(supabase, input.tenantId);
  const noteByCode = new Map(
    prior
      .filter(
        (row) =>
          row.stageName === input.stageName &&
          row.lane === lane &&
          (row.workflowId ?? null) === workflowId
      )
      .map((row) => [row.code.trim().toLowerCase(), row.note])
  );

  let deleteQuery = supabase
    .from("application_status_stage_reason_codes")
    .delete()
    .eq("tenant_id", input.tenantId)
    .eq("stage_name", input.stageName)
    .eq("lane", lane);
  deleteQuery = workflowId ? deleteQuery.eq("workflow_id", workflowId) : deleteQuery.is("workflow_id", null);
  const { error: deleteError } = await deleteQuery;
  if (deleteError && isMissingReasonLaneColumn(deleteError)) {
    if (lane !== "closed") {
      throw new ApplicationStatusError(
        "Separate alternate and closing reason codes need the latest database migration.",
        "VALIDATION",
        503
      );
    }
    return replaceLegacySharedReasonCodes(supabase, {
      tenantId: input.tenantId,
      stageName: input.stageName,
      workflowId,
      codes,
      noteByCode,
    });
  }
  if (deleteError) throw deleteError;
  if (codes.length > 0) {
    const { error: insertError } = await supabase.from("application_status_stage_reason_codes").insert(
      codes.map((code, sortOrder) => ({
        tenant_id: input.tenantId,
        stage_name: input.stageName,
        code,
        sort_order: sortOrder,
        workflow_id: workflowId,
        lane,
        note: noteByCode.get(code.trim().toLowerCase()) ?? null,
      }))
    );
    if (insertError && isMissingReasonLaneColumn(insertError)) {
      throw new ApplicationStatusError(
        "Separate alternate and closing reason codes need the latest database migration.",
        "VALIDATION",
        503
      );
    }
    if (insertError) throw insertError;
  }
  return listApplicationStatusStageReasonCodes(supabase, input.tenantId);
}

export async function appendApplicationStatusStageReasonCode(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    stageName: string;
    code: string;
    workflowId?: string | null;
    lane: ReasonCodeLane | string;
  }
): Promise<{ reasonCodes: ApplicationStatusStageReasonCodeRecord[]; created: boolean }> {
  const lane = requireReasonCodeLane(input.lane);
  const workflowId = input.workflowId?.trim() || null;
  const code = normalizeReasonCode(input.code);
  if (!code) {
    throw new ApplicationStatusError("Enter a reason code.", "VALIDATION");
  }
  const existing = await listApplicationStatusStageReasonCodes(supabase, input.tenantId);
  const stageRows = existing.filter((row) => row.stageName === input.stageName && row.lane === lane);
  const targetRows = stageRows.filter((row) => (row.workflowId ?? null) === workflowId);
  const alreadyThere = targetRows.some((row) => row.code.toLowerCase() === code.toLowerCase());
  if (alreadyThere) {
    return { reasonCodes: existing, created: false };
  }
  const codes = codesForScopedAppend(stageRows, workflowId, code);
  const reasonCodes = await replaceApplicationStatusStageReasonCodes(supabase, {
    tenantId: input.tenantId,
    stageName: input.stageName,
    workflowId,
    lane,
    codes,
  });
  return { reasonCodes, created: true };
}

export type ApplicationStatusStageNoteRecord = {
  id: string;
  tenantId: string;
  stageName: StatusStageName;
  body: string;
  sortOrder: number;
  workflowId: string | null;
};

type StageNoteRow = {
  id: string;
  tenant_id: string;
  stage_name: string;
  body: string;
  sort_order: number;
  workflow_id?: string | null;
};

function mapStageNote(row: StageNoteRow): ApplicationStatusStageNoteRecord | null {
  if (!isAssignableStatusStageName(row.stage_name)) return null;
  const body = normalizeReasonCode(row.body);
  if (!body) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    stageName: row.stage_name,
    body,
    sortOrder: row.sort_order,
    workflowId: row.workflow_id ?? null,
  };
}

function isMissingStageNoteTable(error: unknown): boolean {
  const message = String((error as { message?: string }).message ?? error);
  return /application_status_stage_notes|schema cache|Could not find/i.test(message);
}

export async function listApplicationStatusStageNotes(
  supabase: SupabaseClient,
  tenantId: string
): Promise<ApplicationStatusStageNoteRecord[]> {
  const { data, error } = await supabase
    .from("application_status_stage_notes")
    .select("id, tenant_id, stage_name, body, sort_order, workflow_id")
    .eq("tenant_id", tenantId)
    .order("stage_name", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) {
    if (isMissingStageNoteTable(error)) return [];
    throw error;
  }
  return ((data ?? []) as StageNoteRow[])
    .map(mapStageNote)
    .filter((row): row is ApplicationStatusStageNoteRecord => row != null);
}

export async function findOrCreateApplicationStatusStageNote(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    stageName: string;
    body: string;
    workflowId?: string | null;
  }
): Promise<{ note: ApplicationStatusStageNoteRecord; created: boolean }> {
  if (!isAssignableStatusStageName(input.stageName)) {
    throw new ApplicationStatusError(`Unknown stage: ${input.stageName}`, "VALIDATION");
  }
  const workflowId = input.workflowId?.trim() || null;
  await assertWorkflowInTenant(supabase, input.tenantId, workflowId);
  const body = normalizeReasonCode(input.body);
  if (!body) {
    throw new ApplicationStatusError("Enter a note.", "VALIDATION");
  }
  if (body.length > 500) {
    throw new ApplicationStatusError("Notes must be 500 characters or fewer.", "VALIDATION");
  }
  const existing = (await listApplicationStatusStageNotes(supabase, input.tenantId)).filter(
    (row) => row.stageName === input.stageName && (row.workflowId ?? null) === workflowId
  );
  const match = existing.find((row) => row.body.toLowerCase() === body.toLowerCase());
  if (match) return { note: match, created: false };
  if (existing.length >= 100) {
    throw new ApplicationStatusError("This stage already has 100 notes.", "VALIDATION");
  }
  const { data, error } = await supabase
    .from("application_status_stage_notes")
    .insert({
      tenant_id: input.tenantId,
      stage_name: input.stageName,
      body,
      sort_order: existing.length,
      workflow_id: workflowId,
    })
    .select("id, tenant_id, stage_name, body, sort_order, workflow_id")
    .single();
  if (error) {
    if (error.code === "23505") {
      const again = (await listApplicationStatusStageNotes(supabase, input.tenantId)).find(
        (row) =>
          row.stageName === input.stageName &&
          (row.workflowId ?? null) === workflowId &&
          row.body.toLowerCase() === body.toLowerCase()
      );
      if (again) return { note: again, created: false };
    }
    throw error;
  }
  const note = mapStageNote(data as StageNoteRow);
  if (!note) {
    throw new ApplicationStatusError("Could not save that note.", "VALIDATION");
  }
  return { note, created: true };
}

/** Save the three button categories for one status group. */
export async function replaceGroupButtonLanes(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    groupId: string;
    lanes: Record<StageStatusLane, string[]>;
  }
): Promise<void> {
  await assertGroupInTenant(supabase, input.tenantId, input.groupId);
  const rows = STAGE_STATUS_LANES.flatMap((lane) =>
    input.lanes[lane].map((statusId, sortOrder) => ({ statusId, lane, sortOrder }))
  );
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.statusId)) {
      throw new ApplicationStatusError("A status can only be in one category.", "VALIDATION");
    }
    seen.add(row.statusId);
  }

  for (const row of rows) {
    const existing = await getStatusOrThrow(supabase, input.tenantId, row.statusId);
    if (existing.groupId !== input.groupId) {
      throw new ApplicationStatusError("That status is not in this group.", "VALIDATION");
    }
    const { error } = await supabase
      .from("application_statuses")
      .update({ button_lane: row.lane, sort_order: row.sortOrder })
      .eq("tenant_id", input.tenantId)
      .eq("id", row.statusId);
    if (error) {
      const message = String((error as { message?: string }).message ?? error);
      if (/button_lane|schema cache|Could not find/i.test(message)) {
        throw new ApplicationStatusError(
          "Status categories are not available until the latest database migration is applied.",
          "VALIDATION",
          503
        );
      }
      throw error;
    }
  }
}

/** @deprecated Use group-stage assignment APIs. */
export async function ensureDefaultPreHireStageStatusAssignments(
  supabase: SupabaseClient,
  tenantId: string
): Promise<void> {
  await ensureDefaultPreHireGroupStageAssignments(supabase, tenantId);
}

/** @deprecated Use listApplicationStatusGroupStageAssignments. */
export async function listApplicationStatusStageAssignments(
  supabase: SupabaseClient,
  tenantId: string,
  options?: { ensureDefaults?: boolean }
) {
  return listApplicationStatusGroupStageAssignments(supabase, tenantId, options);
}

/** @deprecated Use assignGroupToPreHireStage. */
export async function assignStatusToPreHireStage() {
  throw new ApplicationStatusError(
    "Assign status groups to stages, not individual statuses.",
    "VALIDATION"
  );
}

/** @deprecated Use unassignGroupFromPreHireStage. */
export async function unassignStatusFromPreHireStage() {
  throw new ApplicationStatusError(
    "Unassign status groups from stages, not individual statuses.",
    "VALIDATION"
  );
}

/** @deprecated Use assignGroupToPreHireStage / unassignGroupFromPreHireStage. */
export async function replaceApplicationStatusStageAssignments() {
  throw new ApplicationStatusError(
    "Assign status groups to stages, not individual statuses.",
    "VALIDATION"
  );
}

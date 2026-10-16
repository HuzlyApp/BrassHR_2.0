import type { OnboardingDbClient } from "@/lib/onboarding/load-tenant-config";
import { hireLifecycleForPhase, stampHireStageOnStepSettings } from "@/lib/onboarding/hire-stage-catalog";
import { isSerializableWorkflowState } from "@/lib/onboarding/workflow-builder-serialization";

type SnapshotNode = Record<string, unknown>;

export type StepRecordRow = {
  tenant_id: string;
  workflow_instance_id: string;
  snapshot_step_id: string;
  position: number;
  title: string;
  step_type: string;
  is_required: boolean;
  phase: "pre_hire" | "post_hire";
  settings: Record<string, unknown>;
};

export type SyncableStepRecord = StepRecordRow & {
  id: string;
  status: string | null;
  completed_at: string | null;
  status_changed_at: string | null;
  review_decision: string | null;
};

export type InstanceStepSyncPlan = {
  deleteIds: string[];
  /** Existing records with their final position (and refreshed content when untouched). */
  updates: Array<StepRecordRow & { id: string }>;
  inserts: StepRecordRow[];
  changed: boolean;
};

const SYNC_RECORD_COLUMNS =
  "id, tenant_id, workflow_instance_id, snapshot_step_id, position, title, step_type, is_required, phase, settings, status, completed_at, status_changed_at, review_decision";

/** Unique-position constraint is not deferrable, so reorders park rows above any real position first. */
const PARKED_POSITION_OFFSET = 100_000;
const BATCH_SIZE = 200;

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function asSettings(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function snapshotNodes(draft: unknown): SnapshotNode[] {
  const nodes = (draft as { nodes?: unknown } | null)?.nodes;
  return Array.isArray(nodes) ? (nodes as SnapshotNode[]) : [];
}

/**
 * Node ids from a saved builder draft. Returns null when the draft is not a step canvas,
 * so a partial payload cannot replace a candidate's steps.
 */
export function workflowDraftNodeIds(draft: unknown): string[] | null {
  if (!isSerializableWorkflowState(draft) || !draft.nodes.length) return null;
  const ids: string[] = [];
  for (let index = 0; index < draft.nodes.length; index += 1) {
    const node = draft.nodes[index];
    if (!node || typeof node.stepId !== "string" || !node.stepId.trim()) return null;
    const id = typeof node.id === "string" ? node.id.trim() : "";
    ids.push(id || `step-${index + 1}`);
  }
  return ids;
}

/** True when the saved workflow canvas has a step the candidate instance does not. */
export function workflowDraftHasNewSteps(recordStepIds: Iterable<string>, flowDraft: unknown): boolean {
  const next = workflowDraftNodeIds(flowDraft);
  if (!next) return false;
  const have = new Set(recordStepIds);
  return next.some((id) => !have.has(id));
}

function nodeSnapshotStepId(node: SnapshotNode, index: number): string {
  return String(node.id ?? `step-${index + 1}`);
}

export function buildStepRecordRow(
  tenantId: string,
  instanceId: string,
  node: SnapshotNode,
  index: number
): StepRecordRow {
  const settings = asSettings(node.settings);
  const phase =
    typeof settings.phase === "string"
      ? settings.phase
      : typeof node.phase === "string"
        ? node.phase
        : "pre_hire";
  const stepType = String(node.stepId ?? "custom");
  const stamped = stampHireStageOnStepSettings(stepType, { ...settings, phase });
  return {
    tenant_id: tenantId,
    workflow_instance_id: instanceId,
    snapshot_step_id: nodeSnapshotStepId(node, index),
    position: index + 1,
    title: String(node.label ?? `Step ${index + 1}`),
    step_type: stepType,
    is_required: node.required === true,
    phase: hireLifecycleForPhase(stamped.phase ?? phase) ?? "pre_hire",
    settings: stamped,
  };
}

export function isRecordTouched(
  record: Pick<SyncableStepRecord, "status" | "completed_at" | "status_changed_at" | "review_decision">
): boolean {
  const status = asText(record.status) ?? "pending";
  return (
    status !== "pending" ||
    Boolean(record.completed_at) ||
    Boolean(record.status_changed_at) ||
    Boolean(record.review_decision)
  );
}

/** jsonb does not preserve key order, so settings are compared with sorted keys. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function sameContent(a: StepRecordRow, b: StepRecordRow): boolean {
  return (
    a.title === b.title &&
    a.step_type === b.step_type &&
    a.is_required === b.is_required &&
    a.phase === b.phase &&
    stableJson(a.settings) === stableJson(b.settings)
  );
}

function existingRow(record: SyncableStepRecord, position: number): StepRecordRow & { id: string } {
  return {
    id: record.id,
    tenant_id: record.tenant_id,
    workflow_instance_id: record.workflow_instance_id,
    snapshot_step_id: record.snapshot_step_id,
    position,
    title: record.title,
    step_type: record.step_type,
    is_required: record.is_required,
    phase: record.phase === "post_hire" ? "post_hire" : "pre_hire",
    settings: asSettings(record.settings),
  };
}

/**
 * Aligns one candidate's step records with the current workflow nodes: current nodes keep their
 * record (or get a new one) in workflow order; records for removed nodes are deleted unless someone
 * already worked on them, in which case they stay after the current steps.
 */
export function planInstanceStepSync(params: {
  tenantId: string;
  instanceId: string;
  nodes: SnapshotNode[];
  records: SyncableStepRecord[];
  /** Extra "already worked on" signal for records that would be deleted (events, candidate progress). */
  isStaleRecordTouched?: (record: SyncableStepRecord) => boolean;
}): InstanceStepSyncPlan {
  const records = [...params.records].sort((a, b) => a.position - b.position);
  const recordByNodeId = new Map<string, SyncableStepRecord>();
  const stale: SyncableStepRecord[] = [];
  const nodeIds = new Set(params.nodes.map(nodeSnapshotStepId));

  const touched = (record: SyncableStepRecord) =>
    isRecordTouched(record) || Boolean(params.isStaleRecordTouched?.(record));

  for (const record of records) {
    const nodeId = record.snapshot_step_id;
    const keeper = recordByNodeId.get(nodeId);
    if (!nodeIds.has(nodeId)) {
      stale.push(record);
    } else if (!keeper) {
      recordByNodeId.set(nodeId, record);
    } else if (!touched(keeper) && touched(record)) {
      recordByNodeId.set(nodeId, record);
      stale.push(keeper);
    } else {
      stale.push(record);
    }
  }

  const deleteIds: string[] = [];
  const keptStale: SyncableStepRecord[] = [];
  for (const record of stale) {
    if (touched(record)) keptStale.push(record);
    else deleteIds.push(record.id);
  }
  keptStale.sort((a, b) => a.position - b.position);

  const updates: InstanceStepSyncPlan["updates"] = [];
  const inserts: StepRecordRow[] = [];
  let changed = deleteIds.length > 0;

  params.nodes.forEach((node, index) => {
    const fresh = buildStepRecordRow(params.tenantId, params.instanceId, node, index);
    const record = recordByNodeId.get(fresh.snapshot_step_id);
    if (!record) {
      inserts.push(fresh);
      changed = true;
      return;
    }
    const current = existingRow(record, fresh.position);
    const next = isRecordTouched(record) ? current : { ...fresh, id: record.id };
    if (record.position !== next.position || !sameContent(existingRow(record, record.position), next)) {
      changed = true;
    }
    updates.push(next);
  });

  keptStale.forEach((record, index) => {
    const position = params.nodes.length + index + 1;
    if (record.position !== position) changed = true;
    updates.push(existingRow(record, position));
  });

  return { deleteIds, updates, inserts, changed };
}

function chunk<T>(items: T[], size = BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const PAGE_SIZE = 1000;

/**
 * PostgREST silently caps each response (max-rows), so a truncated read here would look like
 * missing steps. Pages until an empty page so any server cap is handled.
 */
async function selectAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    if (!batch.length) return rows;
    rows.push(...batch);
  }
}

async function loadTouchedStaleIds(
  supabase: OnboardingDbClient,
  params: {
    tenantId: string;
    /** Records whose own events count as work (removed steps and duplicate copies). */
    eventRecordIds: string[];
    /** Records for removed steps, which also count candidate progress on that step. */
    removedRecords: SyncableStepRecord[];
    workerByInstanceId: Map<string, string | null>;
  }
): Promise<Set<string>> {
  const touched = new Set<string>();
  for (const batch of chunk(params.eventRecordIds)) {
    const rows = await selectAllPages<{ step_record_id: string }>((from, to) =>
      supabase
        .from("applicant_workflow_step_events")
        .select("id, step_record_id")
        .in("step_record_id", batch)
        .order("id")
        .range(from, to)
    );
    for (const row of rows) touched.add(String(row.step_record_id));
  }

  const nodeIds = Array.from(new Set(params.removedRecords.map((record) => record.snapshot_step_id)));
  if (!nodeIds.length) return touched;
  const tenantStepNodeById = new Map<string, string>();
  for (const batch of chunk(nodeIds)) {
    const rows = await selectAllPages<{ id: string; metadata: Record<string, unknown> | null }>(
      (from, to) =>
        supabase
          .from("tenant_onboarding_steps")
          .select("id, metadata")
          .eq("tenant_id", params.tenantId)
          .in("metadata->>workflow_node_id", batch)
          .order("id")
          .range(from, to)
    );
    for (const row of rows) {
      const nodeId = asText(row.metadata?.workflow_node_id);
      if (nodeId) tenantStepNodeById.set(String(row.id), nodeId);
    }
  }
  if (!tenantStepNodeById.size) return touched;

  const workedOn = new Set<string>();
  for (const batch of chunk(Array.from(tenantStepNodeById.keys()))) {
    const rows = await selectAllPages<{ worker_id: string; onboarding_step_id: string }>(
      (from, to) =>
        supabase
          .from("worker_onboarding_step_progress")
          .select("id, worker_id, onboarding_step_id")
          .eq("tenant_id", params.tenantId)
          .in("onboarding_step_id", batch)
          .neq("status", "pending")
          .order("id")
          .range(from, to)
    );
    for (const row of rows) {
      const nodeId = tenantStepNodeById.get(String(row.onboarding_step_id));
      if (nodeId) workedOn.add(`${row.worker_id}:${nodeId}`);
    }
  }

  for (const record of params.removedRecords) {
    const workerId = params.workerByInstanceId.get(record.workflow_instance_id);
    if (workerId && workedOn.has(`${workerId}:${record.snapshot_step_id}`)) touched.add(record.id);
  }
  return touched;
}

/**
 * After a workflow is published, brings every active candidate assigned to it in line with the
 * published steps so the Hire Journey matches what the candidate portal shows.
 */
export async function syncActiveWorkflowInstancesToDraft(
  supabase: OnboardingDbClient,
  params: { tenantId: string; flowId: string; draft: unknown; flowName?: string | null }
): Promise<{ instances: number; inserted: number; deleted: number }> {
  const nodes = snapshotNodes(params.draft);
  const result = { instances: 0, inserted: 0, deleted: 0 };
  if (!nodes.length) return result;

  const instances = await selectAllPages<{ id: string; worker_id: string | null }>((from, to) =>
    supabase
      .from("applicant_workflow_instances")
      .select("id, worker_id")
      .eq("tenant_id", params.tenantId)
      .eq("assignment_state", "active")
      .or(`workflow_id.eq.${params.flowId},onboarding_flow_id.eq.${params.flowId}`)
      .order("id")
      .range(from, to)
  );
  if (!instances.length) return result;

  const records: SyncableStepRecord[] = [];
  for (const batch of chunk(instances.map((row) => row.id), 50)) {
    records.push(
      ...(await selectAllPages<SyncableStepRecord>((from, to) =>
        supabase
          .from("applicant_workflow_step_records")
          .select(SYNC_RECORD_COLUMNS)
          .eq("tenant_id", params.tenantId)
          .in("workflow_instance_id", batch)
          .order("id")
          .range(from, to)
      ))
    );
  }

  const recordsByInstance = new Map<string, SyncableStepRecord[]>();
  for (const record of records) {
    const list = recordsByInstance.get(record.workflow_instance_id) ?? [];
    list.push(record);
    recordsByInstance.set(record.workflow_instance_id, list);
  }

  const currentNodeIds = new Set(nodes.map(nodeSnapshotStepId));
  const copiesPerStep = new Map<string, number>();
  for (const record of records) {
    const key = `${record.workflow_instance_id}:${record.snapshot_step_id}`;
    copiesPerStep.set(key, (copiesPerStep.get(key) ?? 0) + 1);
  }
  const untouched = records.filter((record) => !isRecordTouched(record));
  const removedRecords = untouched.filter((record) => !currentNodeIds.has(record.snapshot_step_id));
  const duplicateRecords = untouched.filter(
    (record) =>
      currentNodeIds.has(record.snapshot_step_id) &&
      (copiesPerStep.get(`${record.workflow_instance_id}:${record.snapshot_step_id}`) ?? 0) > 1
  );
  const touchedStale =
    removedRecords.length || duplicateRecords.length
      ? await loadTouchedStaleIds(supabase, {
          tenantId: params.tenantId,
          eventRecordIds: [...removedRecords, ...duplicateRecords].map((record) => record.id),
          removedRecords,
          workerByInstanceId: new Map(instances.map((row) => [row.id, row.worker_id])),
        })
      : new Set<string>();

  const deleteIds: string[] = [];
  const updates: InstanceStepSyncPlan["updates"] = [];
  const inserts: StepRecordRow[] = [];
  const changedInstanceIds: string[] = [];

  for (const instance of instances) {
    const plan = planInstanceStepSync({
      tenantId: params.tenantId,
      instanceId: instance.id,
      nodes,
      records: recordsByInstance.get(instance.id) ?? [],
      isStaleRecordTouched: (record) => touchedStale.has(record.id),
    });
    if (!plan.changed) continue;
    changedInstanceIds.push(instance.id);
    deleteIds.push(...plan.deleteIds);
    updates.push(...plan.updates);
    inserts.push(...plan.inserts);
  }
  if (!changedInstanceIds.length) return result;

  for (const batch of chunk(deleteIds)) {
    const { error } = await supabase.from("applicant_workflow_step_records").delete().in("id", batch);
    if (error) throw error;
  }
  for (const batch of chunk(updates)) {
    const { error } = await supabase
      .from("applicant_workflow_step_records")
      .upsert(
        batch.map((row) => ({ ...row, position: row.position + PARKED_POSITION_OFFSET })),
        { onConflict: "id" }
      );
    if (error) throw error;
  }
  for (const batch of chunk(updates)) {
    const { error } = await supabase
      .from("applicant_workflow_step_records")
      .upsert(batch, { onConflict: "id" });
    if (error) throw error;
  }
  for (const batch of chunk(inserts)) {
    const { error } = await supabase.from("applicant_workflow_step_records").insert(batch);
    if (error) throw error;
  }

  const instancePatch: Record<string, unknown> = {
    workflow_snapshot: params.draft,
    workflow_version: new Date().toISOString(),
  };
  if (params.flowName?.trim()) instancePatch.workflow_name = params.flowName.trim();
  for (const batch of chunk(changedInstanceIds)) {
    const { error } = await supabase
      .from("applicant_workflow_instances")
      .update(instancePatch)
      .eq("tenant_id", params.tenantId)
      .in("id", batch);
    if (error) throw error;
  }

  result.instances = changedInstanceIds.length;
  result.inserted = inserts.length;
  result.deleted = deleteIds.length;
  return result;
}

/** Publish has already succeeded when this runs, so a sync failure is logged rather than thrown. */
export async function syncActiveWorkflowInstancesSafely(
  supabase: OnboardingDbClient,
  params: Parameters<typeof syncActiveWorkflowInstancesToDraft>[1]
): Promise<void> {
  try {
    const result = await syncActiveWorkflowInstancesToDraft(supabase, params);
    if (result.instances) {
      console.info("[sync-workflow-instances] synced assigned candidates", {
        flowId: params.flowId,
        ...result,
      });
    }
  } catch (err) {
    console.error("[sync-workflow-instances] failed", {
      flowId: params.flowId,
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}

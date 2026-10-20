import { describe, expect, it } from "vitest";
import {
  buildStepRecordRow,
  planInstanceStepSync,
  type SyncableStepRecord,
} from "@/lib/onboarding/sync-workflow-instances";

const TENANT = "tenant-1";
const INSTANCE = "instance-1";

function node(id: string, stepId: string, label = id) {
  return { id, stepId, label, required: true, settings: { phase: "pre_hire" } };
}

function record(
  id: string,
  snapshotStepId: string,
  position: number,
  overrides: Partial<SyncableStepRecord> = {}
): SyncableStepRecord {
  const row = buildStepRecordRow(TENANT, INSTANCE, node(snapshotStepId, "ssn-verification"), position - 1);
  return {
    ...row,
    id,
    position,
    status: "pending",
    completed_at: null,
    status_changed_at: null,
    review_decision: null,
    ...overrides,
  };
}

describe("planInstanceStepSync", () => {
  it("deletes an untouched record for a removed node and inserts newly added nodes", () => {
    const nodes = [node("a", "ssn-verification"), node("c", "ssn-verification")];
    const plan = planInstanceStepSync({
      tenantId: TENANT,
      instanceId: INSTANCE,
      nodes,
      records: [record("r-a", "a", 1), record("r-b", "b", 2)],
    });

    expect(plan.changed).toBe(true);
    expect(plan.deleteIds).toEqual(["r-b"]);
    expect(plan.updates.map((row) => [row.id, row.position])).toEqual([["r-a", 1]]);
    expect(plan.inserts.map((row) => [row.snapshot_step_id, row.position])).toEqual([["c", 2]]);
  });

  it("keeps removed steps someone already worked on, after the current steps", () => {
    const plan = planInstanceStepSync({
      tenantId: TENANT,
      instanceId: INSTANCE,
      nodes: [node("a", "ssn-verification")],
      records: [
        record("r-old-done", "old-1", 1, { status: "completed", completed_at: "2026-10-01T00:00:00Z" }),
        record("r-old-progress", "old-2", 2),
        record("r-a", "a", 3),
      ],
      isStaleRecordTouched: (row) => row.id === "r-old-progress",
    });

    expect(plan.deleteIds).toEqual([]);
    expect(plan.updates.map((row) => [row.id, row.position])).toEqual([
      ["r-a", 1],
      ["r-old-done", 2],
      ["r-old-progress", 3],
    ]);
  });

  it("refreshes untouched records from the workflow but leaves decided records as they are", () => {
    const plan = planInstanceStepSync({
      tenantId: TENANT,
      instanceId: INSTANCE,
      nodes: [node("a", "ssn-verification", "Renamed A"), node("b", "ssn-verification", "Renamed B")],
      records: [
        record("r-a", "a", 1),
        record("r-b", "b", 2, { status_changed_at: "2026-10-01T00:00:00Z", review_decision: "complete" }),
      ],
    });

    expect(plan.updates.find((row) => row.id === "r-a")?.title).toBe("Renamed A");
    expect(plan.updates.find((row) => row.id === "r-b")?.title).toBe("b");
  });

  it("treats a duplicate record for the same node as stale", () => {
    const plan = planInstanceStepSync({
      tenantId: TENANT,
      instanceId: INSTANCE,
      nodes: [node("a", "ssn-verification")],
      records: [record("r-a", "a", 1), record("r-a-dup", "a", 2)],
    });

    expect(plan.deleteIds).toEqual(["r-a-dup"]);
  });

  it("keeps the duplicate that has history and drops the untouched copy", () => {
    const plan = planInstanceStepSync({
      tenantId: TENANT,
      instanceId: INSTANCE,
      nodes: [node("a", "ssn-verification")],
      records: [
        record("r-a", "a", 1),
        record("r-a-dup", "a", 2, { status: "completed", completed_at: "2026-10-01T00:00:00Z" }),
      ],
    });

    expect(plan.deleteIds).toEqual(["r-a"]);
    expect(plan.updates.map((row) => [row.id, row.position])).toEqual([["r-a-dup", 1]]);
  });

  it("reports no change when records already match the workflow", () => {
    const nodes = [node("a", "ssn-verification"), node("b", "ssn-verification")];
    const records = nodes.map((n, index) => ({
      ...buildStepRecordRow(TENANT, INSTANCE, n, index),
      id: `r-${n.id}`,
      status: "pending",
      completed_at: null,
      status_changed_at: null,
      review_decision: null,
    }));
    const plan = planInstanceStepSync({ tenantId: TENANT, instanceId: INSTANCE, nodes, records });

    expect(plan.changed).toBe(false);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.inserts).toEqual([]);
  });
});

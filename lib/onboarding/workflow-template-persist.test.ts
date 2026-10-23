import { describe, expect, it } from "vitest";
import { resolveWorkflowPersistTarget } from "@/lib/onboarding/workflow-template-persist";

describe("resolveWorkflowPersistTarget", () => {
  it("never mutates a system preset on autosave", () => {
    expect(
      resolveWorkflowPersistTarget({
        editingTemplate: { id: "preset-1099", isReadOnly: true },
        flowId: null,
        options: { silent: true } as { publish?: boolean; template?: boolean },
      })
    ).toEqual({ action: "noop" });
  });

  it("forks a tenant template when saving a preset as a template", () => {
    expect(
      resolveWorkflowPersistTarget({
        editingTemplate: { id: "preset-1099", isReadOnly: true },
        flowId: null,
        options: { template: true },
      })
    ).toEqual({ action: "fork-preset", publish: false });
  });

  it("forks and publishes when publishing while a preset is open", () => {
    expect(
      resolveWorkflowPersistTarget({
        editingTemplate: { id: "preset-1099", isReadOnly: true },
        flowId: null,
        options: { publish: true },
      })
    ).toEqual({ action: "fork-preset", publish: true });
  });

  it("updates the tenant template on save and publish", () => {
    expect(
      resolveWorkflowPersistTarget({
        editingTemplate: { id: "tenant-t1", isReadOnly: false },
        flowId: null,
        options: { publish: true },
      })
    ).toEqual({ action: "update-template", templateId: "tenant-t1", publish: true });
  });

  it("does not fall through to the tenant default flow while a template is open", () => {
    const target = resolveWorkflowPersistTarget({
      editingTemplate: { id: "tenant-t1", isReadOnly: false },
      flowId: null,
      options: { publish: true },
    });
    expect(target.action).not.toBe("tenant-default-flow");
  });

  it("keeps Publish Workflow on the tenant default flow when no template is open", () => {
    expect(
      resolveWorkflowPersistTarget({
        editingTemplate: null,
        flowId: null,
        options: { publish: true },
      })
    ).toEqual({ action: "tenant-default-flow", publish: true, saveTemplate: false });
  });
});

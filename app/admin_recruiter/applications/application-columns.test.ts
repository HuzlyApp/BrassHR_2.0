import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_APPLICATION_COLUMNS,
  loadApplicationColumnOrder,
  withoutRetiredProgressStatusColumn,
} from "@/app/admin_recruiter/applications/application-columns";

describe("job all-candidates columns", () => {
  const store = new Map<string, string>();

  afterEach(() => {
    store.clear();
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "localStorage");
  });

  function installStorage() {
    const localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };
    Object.assign(globalThis, { window: {}, localStorage });
  }

  it("leaves Progress Status off the default All candidates table", () => {
    expect(DEFAULT_APPLICATION_COLUMNS).not.toContain("status");
    expect(withoutRetiredProgressStatusColumn(["assignee", "status", "actions"])).toEqual([
      "assignee",
      "actions",
    ]);
  });

  it("drops Progress Status from a layout saved before the column was removed", () => {
    installStorage();
    store.set(
      "nexus-job-applications-list-columns-v6",
      JSON.stringify([...DEFAULT_APPLICATION_COLUMNS.filter((id) => id !== "actions"), "status", "actions"])
    );

    const order = loadApplicationColumnOrder();
    expect(order).not.toContain("status");
    expect(order.at(-1)).toBe("actions");
  });

  it("keeps Progress Status when the current layout still includes it", () => {
    installStorage();
    store.set(
      "nexus-job-applications-list-columns-v7",
      JSON.stringify(["candidates", "status", "actions"])
    );

    expect(loadApplicationColumnOrder()).toContain("status");
  });
});

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

  it("includes Status on the default All candidates table", () => {
    expect(DEFAULT_APPLICATION_COLUMNS).toContain("status");
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

import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CANDIDATE_COLUMNS,
  loadColumnOrder,
  withoutRetiredProgressStatusColumn,
} from "@/app/admin_recruiter/candidates/column-config";

describe("candidate list columns", () => {
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

  it("leaves Progress Status off the default candidates table", () => {
    expect(DEFAULT_CANDIDATE_COLUMNS).not.toContain("progressStatus");
    expect(withoutRetiredProgressStatusColumn(["name", "progressStatus", "fit"])).toEqual(["name", "fit"]);
  });

  it("drops Progress Status when reading a layout saved before the column was removed", () => {
    installStorage();
    store.set(
      "nexus-candidates-list-columns-v8",
      JSON.stringify(["name", "contact", "clientName", "matchJob", "progressStatus", "fit", "currentStage", "createdDate"])
    );

    expect(loadColumnOrder()).not.toContain("progressStatus");
  });

  it("keeps Progress Status when the current layout still includes it", () => {
    installStorage();
    store.set(
      "nexus-candidates-list-columns-v9",
      JSON.stringify(["name", "progressStatus", "fit"])
    );

    expect(loadColumnOrder()).toContain("progressStatus");
  });
});

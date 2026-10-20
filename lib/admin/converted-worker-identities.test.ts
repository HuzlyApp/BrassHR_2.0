import { describe, expect, it } from "vitest";
import {
  isConvertedWorkerApplication,
  withoutConvertedWorkerApplications,
  type ConvertedWorkerIdentities,
} from "./converted-worker-identities";

describe("isConvertedWorkerApplication", () => {
  const identities: ConvertedWorkerIdentities = {
    candidateIds: new Set(["cand-123", "cand-456"]),
    sourceApplicationIds: new Set(["app-1"]),
  };

  it("matches applications of a converted candidate", () => {
    expect(isConvertedWorkerApplication({ workerId: "cand-123" }, identities)).toBe(true);
    expect(isConvertedWorkerApplication({ workerId: " cand-456 " }, identities)).toBe(true);
    expect(isConvertedWorkerApplication({ workerId: "cand-999" }, identities)).toBe(false);
  });

  it("matches the application a worker was hired from", () => {
    expect(isConvertedWorkerApplication({ applicationId: "app-1" }, identities)).toBe(true);
    expect(isConvertedWorkerApplication({ applicationId: "app-2" }, identities)).toBe(false);
  });

  it("keeps applications without a converted id", () => {
    expect(isConvertedWorkerApplication({}, identities)).toBe(false);
    expect(
      isConvertedWorkerApplication({ applicationId: "app-2", workerId: null }, identities)
    ).toBe(false);
  });
});

describe("withoutConvertedWorkerApplications", () => {
  it("drops hired applications that belong to converted workers", () => {
    const visible = withoutConvertedWorkerApplications(
      [
        { id: "app-new", worker_id: "cand-new", status: "new" },
        { id: "app-hired-1", worker_id: "cand-123", status: "hired" },
        { id: "app-hired-2", worker_id: "cand-hired", status: "hired" },
        { id: "app-custom", worker_id: "cand-open", status: "custom" },
      ],
      {
        candidateIds: new Set(["cand-123"]),
        sourceApplicationIds: new Set(["app-hired-2"]),
      }
    );

    expect(visible.map((row) => row.id)).toEqual(["app-new", "app-custom"]);
  });
});

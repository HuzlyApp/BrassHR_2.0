import { describe, expect, it } from "vitest";
import {
  isConvertedWorkerApplication,
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

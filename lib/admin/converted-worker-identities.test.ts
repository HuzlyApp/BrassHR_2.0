import { describe, expect, it } from "vitest";
import {
  isConvertedWorkerOrApplication,
  type ConvertedWorkerIdentities,
} from "./converted-worker-identities";

describe("converted-worker-identities", () => {
  const identities: ConvertedWorkerIdentities = {
    candidateIds: new Set(["cand-123", "cand-456"]),
    emails: new Set(["worker@test.com", "hired@company.org"]),
    fullNames: new Set(["john doe", "applicant user"]),
    sourceApplicationIds: new Set(["app-1"]),
  };

  it("identifies candidate by candidateId / workerId", () => {
    expect(
      isConvertedWorkerOrApplication({ candidateId: "cand-123" }, identities)
    ).toBe(true);
    expect(
      isConvertedWorkerOrApplication({ workerId: "cand-456" }, identities)
    ).toBe(true);
    expect(
      isConvertedWorkerOrApplication({ id: "cand-123" }, identities)
    ).toBe(true);
    expect(
      isConvertedWorkerOrApplication({ id: "other-id" }, identities)
    ).toBe(false);
  });

  it("identifies candidate and sibling applications by email", () => {
    expect(
      isConvertedWorkerOrApplication({ email: "Worker@test.com" }, identities)
    ).toBe(true);
    expect(
      isConvertedWorkerOrApplication({ email: "hired@company.org " }, identities)
    ).toBe(true);
    expect(
      isConvertedWorkerOrApplication({ email: "other@test.com" }, identities)
    ).toBe(false);
  });

  it("identifies candidate and sibling applications by person name", () => {
    expect(
      isConvertedWorkerOrApplication({ firstName: "John", lastName: "Doe" }, identities)
    ).toBe(true);
    expect(
      isConvertedWorkerOrApplication({ name: "Applicant User" }, identities)
    ).toBe(true);
    expect(
      isConvertedWorkerOrApplication({ name: "Unrelated Person" }, identities)
    ).toBe(false);
  });

  it("identifies hired status or post-hire workflow phase directly", () => {
    expect(
      isConvertedWorkerOrApplication({ status: "hired" }, identities)
    ).toBe(true);
    expect(
      isConvertedWorkerOrApplication({ status: "converted" }, identities)
    ).toBe(true);
    expect(
      isConvertedWorkerOrApplication({ statusKey: "hired" }, identities)
    ).toBe(true);
    expect(
      isConvertedWorkerOrApplication({ systemKey: "hired" }, identities)
    ).toBe(true);
    expect(
      isConvertedWorkerOrApplication({ workflowPhase: "post_hire" }, identities)
    ).toBe(true);
  });

  it("identifies application by source application id", () => {
    expect(
      isConvertedWorkerOrApplication({ applicationId: "app-1" }, identities)
    ).toBe(true);
    expect(
      isConvertedWorkerOrApplication({ applicationId: "app-2" }, identities)
    ).toBe(false);
  });
});

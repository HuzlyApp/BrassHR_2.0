import { describe, expect, it } from "vitest";
import { pickLatestExpiredUploads } from "@/lib/onboarding/notify-expired-profession-documents";

describe("pickLatestExpiredUploads", () => {
  it("notifies from the newest file and skips a current replacement", () => {
    const notices = pickLatestExpiredUploads(
      [
        {
          id: "old",
          tenantId: "tenant",
          workerId: "worker",
          professionDocumentId: "java",
          expiryDate: "2024-01-01",
          uploadedAt: "2024-01-02T00:00:00.000Z",
          title: "Java",
          candidateName: "Goutham K",
        },
        {
          id: "new",
          tenantId: "tenant",
          workerId: "worker",
          professionDocumentId: "java",
          expiryDate: "2027-01-01",
          uploadedAt: "2026-10-01T00:00:00.000Z",
          title: "Java",
          candidateName: "Goutham K",
        },
        {
          id: "cpp",
          tenantId: "tenant",
          workerId: "worker",
          professionDocumentId: "cpp",
          expiryDate: "2025-06-01",
          uploadedAt: "2025-01-01T00:00:00.000Z",
          title: "C++",
          candidateName: "Goutham K",
        },
      ],
      "2026-10-20"
    );

    expect(notices).toEqual([
      {
        uploadId: "cpp",
        tenantId: "tenant",
        workerId: "worker",
        title: "C++",
        expiryDate: "2025-06-01",
        candidateName: "Goutham K",
      },
    ]);
  });
});

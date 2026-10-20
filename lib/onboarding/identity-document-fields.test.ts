import { describe, expect, it } from "vitest";
import {
  IDENTITY_DOCUMENT_FIELDS,
  identityUploadDisplayName,
} from "@/lib/onboarding/identity-document-fields";

describe("identity document fields", () => {
  it("requires only the SSN card and driver's license fronts", () => {
    expect(IDENTITY_DOCUMENT_FIELDS.filter((field) => field.required).map((field) => field.column)).toEqual([
      "ssn_url",
      "drivers_license_url",
    ]);
  });

  it("shows the original file name of a stored upload", () => {
    expect(
      identityUploadDisplayName(
        "https://x.supabase.co/storage/v1/object/public/worker_required_files/ssn/u1/1791211115531-14fb0043-9fa5-42cc-bd7b-da7aca561d45-Icon.png"
      )
    ).toBe("Icon.png");
    expect(
      identityUploadDisplayName(
        "license/u1/1791211116924-d123047a-5755-4a83-b8e0-bd35d5055d1c-Screenshot%202026-09-07.png"
      )
    ).toBe("Screenshot 2026-09-07.png");
    expect(identityUploadDisplayName("plain.pdf")).toBe("plain.pdf");
  });
});

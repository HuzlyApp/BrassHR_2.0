export type IdentityDocumentColumn =
  | "ssn_url"
  | "ssn_back_url"
  | "drivers_license_url"
  | "drivers_license_back_url";

export type IdentityDocumentField = {
  column: IdentityDocumentColumn;
  side: "Front" | "Back";
  required: boolean;
};

export type IdentityDocumentGroup = {
  id: "ssn" | "license";
  title: string;
  folder: "ssn" | "license";
  fields: IdentityDocumentField[];
};

/** Identity uploads stored on `worker_documents`; fronts are what the identity step requires. */
export const IDENTITY_DOCUMENT_GROUPS: IdentityDocumentGroup[] = [
  {
    id: "ssn",
    title: "SSN Card",
    folder: "ssn",
    fields: [
      { column: "ssn_url", side: "Front", required: true },
      { column: "ssn_back_url", side: "Back", required: false },
    ],
  },
  {
    id: "license",
    title: "Driver's License",
    folder: "license",
    fields: [
      { column: "drivers_license_url", side: "Front", required: true },
      { column: "drivers_license_back_url", side: "Back", required: false },
    ],
  },
];

export const IDENTITY_DOCUMENT_FIELDS: IdentityDocumentField[] = IDENTITY_DOCUMENT_GROUPS.flatMap(
  (group) => group.fields
);

const UPLOAD_NAME_PREFIX_RE =
  /^\d+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;

/** Original file name from a stored upload path (`<ts>-<uuid>-<name>`). */
export function identityUploadDisplayName(stored: string): string {
  const segment = stored.split("?")[0]?.split("/").pop() ?? stored;
  let name = segment;
  try {
    name = decodeURIComponent(segment);
  } catch {
    // keep the raw segment
  }
  return name.replace(UPLOAD_NAME_PREFIX_RE, "") || name;
}

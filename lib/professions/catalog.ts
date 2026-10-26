export type EmploymentFlowType = "W2" | "1099" | "Contract" | "RNR";

export type ProfessionStarter = {
  key: string;
  industryKey: string;
  name: string;
};

export type WorkflowDocumentSeed = {
  code: string;
  name: string;
  isRequired: boolean;
  hasExpiration: boolean;
  collectIssuingOrganization: boolean;
  collectScope: boolean;
  collectValidity: boolean;
  sortOrder: number;
};

export const PROFESSION_STARTERS: ProfessionStarter[] = [
  { key: "nursing", industryKey: "healthcare", name: "Nursing" },
  { key: "pharmacy", industryKey: "healthcare", name: "Pharmacy" },
  { key: "office_admin", industryKey: "healthcare", name: "Office Admin" },
  { key: "software_developer", industryKey: "technology", name: "Software Developer" },
  { key: "forklift_operator", industryKey: "warehouse", name: "Forklift Operator" },
];

export const NURSING_W2_DOCUMENTS: WorkflowDocumentSeed[] = [
  {
    code: "NURSING_LICENSE",
    name: "Nursing license",
    isRequired: true,
    hasExpiration: true,
    collectIssuingOrganization: true,
    collectScope: true,
    collectValidity: true,
    sortOrder: 10,
  },
  {
    code: "CPR",
    name: "CPR",
    isRequired: true,
    hasExpiration: true,
    collectIssuingOrganization: true,
    collectScope: false,
    collectValidity: true,
    sortOrder: 20,
  },
  {
    code: "BLS",
    name: "BLS",
    isRequired: true,
    hasExpiration: true,
    collectIssuingOrganization: true,
    collectScope: false,
    collectValidity: true,
    sortOrder: 30,
  },
  {
    code: "ACLS",
    name: "ACLS",
    isRequired: false,
    hasExpiration: true,
    collectIssuingOrganization: true,
    collectScope: false,
    collectValidity: true,
    sortOrder: 40,
  },
  {
    code: "SSN_CARD",
    name: "SSN card",
    isRequired: true,
    hasExpiration: false,
    collectIssuingOrganization: false,
    collectScope: false,
    collectValidity: false,
    sortOrder: 50,
  },
  {
    code: "DRIVERS_LICENSE",
    name: "Driver license",
    isRequired: true,
    hasExpiration: true,
    collectIssuingOrganization: true,
    collectScope: false,
    collectValidity: false,
    sortOrder: 60,
  },
];

export function startersForIndustry(industryKey: string): ProfessionStarter[] {
  return PROFESSION_STARTERS.filter((row) => row.industryKey === industryKey);
}

export function professionVisibleToIndustry(
  professionIndustryKey: string,
  tenantIndustryKey: string
): boolean {
  return professionIndustryKey === tenantIndustryKey;
}

export function assertEmploymentFlowHasProfession(input: {
  employmentType: EmploymentFlowType | null;
  professionId: string | null;
}): void {
  if (input.employmentType && !input.professionId) {
    throw new Error("A flow with an employment type requires a profession.");
  }
}

export type ApplyDocument = {
  code: string;
  name: string;
  isRequired: boolean;
  hasExpiration: boolean;
  isActive: boolean;
};

const NURSING_APPLY_CODES = ["NURSING_LICENSE", "CPR", "BLS", "SSN_CARD", "DRIVERS_LICENSE"] as const;

export function documentsForApply(documents: ApplyDocument[]): ApplyDocument[] {
  return documents
    .filter((doc) => doc.isActive)
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function nursingApplyShowsExpectedDocuments(documents: ApplyDocument[]): boolean {
  const visible = new Set(documentsForApply(documents).map((doc) => doc.code));
  if (visible.has("FORKLIFT_OPERATOR")) return false;
  return NURSING_APPLY_CODES.every((code) => visible.has(code));
}

export type CredentialDateInput = {
  hasExpiration: boolean;
  issuedDate: string | null;
  expiryDate: string | null;
};

export function validateCredentialDates(input: CredentialDateInput): string | null {
  const issued = input.issuedDate?.trim() || null;
  const expiry = input.expiryDate?.trim() || null;

  if (input.hasExpiration && (!issued || !expiry)) {
    return "Issued date and expiry date are required.";
  }
  if (issued && expiry && expiry < issued) {
    return "Expiry date must be on or after the issued date.";
  }
  return null;
}

export function credentialBelongsToTenant(
  rowTenantId: string,
  requestTenantId: string
): boolean {
  return rowTenantId === requestTenantId;
}

export function credentialUpsertKey(input: {
  tenantId: string;
  workerId: string;
  requiredDocumentId: string;
}): string {
  return `${input.tenantId}:${input.workerId}:${input.requiredDocumentId}`;
}

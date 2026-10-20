import { z } from "zod";
import {
  EMPLOYMENT_TYPES,
  JOB_STATUSES,
  PLACEMENT_TYPES,
  SOURCE_TYPES,
  type FieldErrors,
  type JobRequisitionInput,
  type WorkflowMatchKey,
} from "@/lib/jobs/types";
import { jobRequiresWorkflow } from "@/lib/jobs/placement";
import { industryKeyValidationMessage } from "@/lib/ai-catalog/industry-catalog";
import { isRemoteJobLocationType } from "@/lib/service-area/location-type";
import { locationFromFreeText } from "@/lib/service-area/normalize";

const optionalText = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => value?.trim() || null);

const optionalNumber = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((value, ctx) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      ctx.addIssue({ code: "custom", message: "Must be a valid number" });
      return z.NEVER;
    }
    return parsed;
  });

export const jobRequisitionInputSchema = z.object({
  internalRequisitionNumber: optionalText,
  externalRequisitionId: optionalText,
  sourceType: z.enum(SOURCE_TYPES),
  placementType: z.enum(PLACEMENT_TYPES).nullable().optional(),
  eorType: z.enum(["Tenant", "MSP"]).nullable().optional(),
  mspClient: optionalText,
  professionId: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => value?.trim() || null)
    .pipe(z.union([z.uuid(), z.null()])),
  profession: optionalText,
  specialtyId: optionalText.pipe(z.uuid().nullable()),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  employerOfRecord: optionalText,
  department: optionalText,
  facility: optionalText,
  billRate: optionalNumber,
  payRateMin: optionalNumber,
  payRateMax: optionalNumber,
  commissionPercent: optionalNumber,
  commissionFixedAmount: optionalNumber,
  targetStartDate: optionalText,
  duration: optionalText,
  shiftType: optionalText,
  shiftDetails: optionalText,
  hoursPerWeek: optionalNumber,
  publicTitle: optionalText,
  publicDescription: optionalText,
  industryKey: optionalText,
  location: optionalText,
  postalCode: optionalText,
  worksiteCity: optionalText,
  worksiteState: optionalText,
  worksitePostalCode: optionalText,
  remoteAllowedStates: z
    .union([z.array(z.string()), z.null(), z.undefined()])
    .transform((value) =>
      Array.isArray(value)
        ? value.map((item) => item.trim().toUpperCase()).filter(Boolean)
        : null
    ),
  schedule: optionalText,
  qualifications: optionalText,
  responsibilities: optionalText,
  benefits: optionalText,
  applicationDeadline: optionalText,
  numberOfPositions: optionalNumber,
  yearsOfExperience: optionalText,
  additionalLocations: z
    .union([z.array(z.string()), z.null(), z.undefined()])
    .transform((value) =>
      Array.isArray(value)
        ? value.map((item) => item.trim()).filter(Boolean)
        : null
    ),
  showInMultipleAreas: z
    .union([z.boolean(), z.null(), z.undefined()])
    .transform((value) => (typeof value === "boolean" ? value : null)),
  jobLocationType: optionalText,
  acceptableMatchRate: optionalText,
  isEmployerOnRecord: z
    .union([z.boolean(), z.null(), z.undefined()])
    .transform((value) => (typeof value === "boolean" ? value : null)),
  compensationType: optionalText,
  currency: optionalText,
  showPayBy: optionalText,
  payRatePeriod: optionalText,
  mspName: optionalText,
  sourceJobTitle: optionalText,
  sourceJobUrl: optionalText,
  sourceJobDetails: optionalText,
  suggestedPayRate: optionalNumber,
  requiredCredentials: optionalText,
  specialRequirements: optionalText,
  internalNotes: optionalText,
});

export const jobMutationSchema = z.object({
  job: jobRequisitionInputSchema,
  action: z.enum(["save_draft", "publish", "update", "unpublish", "close", "archive"]),
});

export const jobStatusSchema = z.enum(JOB_STATUSES);

export function validatePublishableJob(
  input: JobRequisitionInput,
  workflowId: string | null
): FieldErrors {
  const errors: FieldErrors = {};
  const isMsp = input.sourceType === "MSP";
  const isMspEor = isMsp && input.placementType === "Recruit_and_EOR";
  const isMspRnr = isMsp && input.placementType === "Recruit_and_Release";
  const requiresWorkflow = jobRequiresWorkflow(input);
  const location = input.location?.trim() || input.facility?.trim() || "";

  if (!input.publicTitle?.trim()) errors.publicTitle = "Public job title is required.";
  if (!input.publicDescription?.trim()) {
    errors.publicDescription = "Public job description is required.";
  }
  const isRemote = isRemoteJobLocationType(input.jobLocationType ?? input.schedule);
  if (!isRemote) {
    const parsed = locationFromFreeText(location, input.postalCode);
    const hasWorksite = Boolean(parsed.city && parsed.state);
    if (!hasWorksite) {
      errors.location = "Every job needs a worksite city and state.";
    }
  }
  if (!input.employmentType) errors.employmentType = "Employment type is required.";
  if (!input.shiftType?.trim()) errors.shiftType = "Employment Type is required.";
  if (!input.sourceType) errors.sourceType = "Source type is required.";
  const industryError = industryKeyValidationMessage(input.industryKey);
  if (industryError) errors.industryKey = industryError;

  if (!input.professionId && !input.profession?.trim()) {
    errors.professionId = "Profession is required.";
  }

  if (!isMsp) {
    if (requiresWorkflow && !workflowId) {
      errors.workflowId = "A matching published workflow is required.";
    }
  }

  if (isMspRnr) {
    if (requiresWorkflow && !workflowId) {
      errors.workflowId = "A matching published workflow is required.";
    }
    const hasCommission =
      (input.commissionPercent != null && input.commissionPercent > 0) ||
      (input.commissionFixedAmount != null && input.commissionFixedAmount > 0);
    if (!hasCommission) {
      errors.commissionPercent = "Select a commission fee type and enter the amount.";
      errors.commissionFixedAmount = "Select a commission fee type and enter the amount.";
    }
    if (
      input.commissionPercent != null &&
      (input.commissionPercent < 0 || input.commissionPercent > 100)
    ) {
      errors.commissionPercent = "Commission percentage must be between 0 and 100.";
    }
    if (input.commissionFixedAmount != null && input.commissionFixedAmount < 0) {
      errors.commissionFixedAmount = "Fixed commission amount cannot be negative.";
    }
  }

  if (isMspEor) {
    if (input.employmentType !== "W2" && input.employmentType !== "1099") {
      errors.employmentType = "Select W2 or 1099 for EOR placements.";
    }
    if (requiresWorkflow && !workflowId) {
      errors.workflowId = "A matching published workflow is required.";
    }
  }

  if (isMsp && !input.placementType) {
    errors.placementType = "Select Recruit & Release or Recruit & EOR.";
  }

  if (
    input.payRateMin !== null &&
    input.payRateMin !== undefined &&
    input.payRateMax !== null &&
    input.payRateMax !== undefined &&
    input.payRateMin > input.payRateMax
  ) {
    errors.payRateMax = "Maximum pay rate must be greater than or equal to minimum pay rate.";
  }

  return errors;
}

export function normalizeApplicantEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function workflowNoMatchMessage(
  professionName: string,
  key: Pick<WorkflowMatchKey, "employmentType" | "specialtyId" | "location" | "jobLocationType" | "yearsOfExperience">
): string {
  const employmentLabel = key.employmentType === "Contract" ? "RNR" : key.employmentType;
  const lines = [
    "No published workflow is configured for this job.",
    "",
    `Profession: ${professionName}`,
    `Employment Type: ${employmentLabel}`,
  ];
  if (key.specialtyId) lines.push(`Specialty: ${key.specialtyId}`);
  if (key.jobLocationType?.trim()) lines.push(`Location Type: ${key.jobLocationType.trim()}`);
  if (key.location?.trim()) lines.push(`Location: ${key.location.trim()}`);
  if (key.yearsOfExperience?.trim()) {
    lines.push(`Years of Experience: ${key.yearsOfExperience.trim()}`);
  }
  lines.push(
    "",
    "Ask an administrator to create a workflow mapping or employment-type default before publishing."
  );
  return lines.join("\n");
}

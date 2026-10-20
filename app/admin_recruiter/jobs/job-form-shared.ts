import type { CSSProperties } from "react";
import type { EmploymentType, JobRequisitionInput, PlacementType, SourceType } from "@/lib/jobs/types";
import {
  defaultEmploymentTypeForJob,
  deriveEorType,
  isMspRecruitAndEor,
  isMspRecruitAndRelease,
  placementTypeFromApiRow,
  resolvePlacementTypeForSource,
} from "@/lib/jobs/placement";
import { embeddedRelationName } from "@/lib/jobs/profession-text";

export type JobFormStep =
  | "setup"
  | "requisition"
  | "msp-details"
  | "compensation"
  | "description"
  | "review";

export const JOB_FORM_MSP_JOB_DETAIL_OPTIONS = [
  "Long-Term Care",
  "Contract Assignment",
  "Healthcare Staffing",
  "Travel Assignment",
  "Local Contract",
  "Per Diem",
  "Acute Care",
  "Permanent Placement",
] as const;

/** Contract duration is free text (most assignments are 6–12 months). */
export const JOB_FORM_DURATION_PLACEHOLDER = "e.g. 6 months";

export const JOB_FORM_COMMISSION_FEE_TYPES = [
  { value: "percentage", label: "Percentage" },
  { value: "fixed_amount", label: "Fixed Amount" },
] as const;

export type CommissionFeeType = "" | (typeof JOB_FORM_COMMISSION_FEE_TYPES)[number]["value"];

/** Remote jobs default to all US states; restrict only for exceptions. */
export type RemoteStatesScope = "all" | "restrict";

export type JobFormUiState = {
  numberOfPositions: number;
  yearsOfExperience: string;
  additionalLocations: string[];
  showInMultipleAreas: boolean;
  jobLocationType: string;
  /** All States (default) vs explicit state allow-list for remote roles. */
  remoteStatesScope: RemoteStatesScope;
  employerOnRecord: "" | "yes" | "no";
  compensationType: string;
  currency: string;
  showPayBy: string;
  payRatePeriod: string;
  /** Expected hours display mode (stored in shift_details). */
  hoursShowBy: string;
  /** MSP R&R: percentage vs fixed USD commission fee. */
  commissionFeeType: CommissionFeeType;
  selectedBenefits: string[];
  /** User-created benefit chips (shown alongside presets). */
  customBenefits: string[];
};

export const JOB_FORM_BENEFIT_OPTIONS = [
  "Flexible schedule",
  "Dental Insurance",
  "401(k)",
  "Tuition reimbursement",
  "Retirement Plan",
  "Employee Assistance Program",
  "Referral Program",
  "Paid time off",
  "Health savings account",
  "Vision Insurance",
  "Flexible spending account",
  "Parental leave",
  "Employee Discount",
  "401(k) matching",
  "Life Insurance",
  "Health Insurance",
  "Professional development assistance",
] as const;

export const JOB_FORM_COMPENSATION_TYPES = ["Hourly", "Weekly", "Monthly", "Annually"] as const;
export const JOB_FORM_CURRENCIES = ["United States Dollar $"] as const;
export const JOB_FORM_SHOW_PAY_BY = ["Range", "Starting amount", "Exact amount"] as const;
export const JOB_FORM_PAY_PERIODS = ["Hourly", "Weekly", "Monthly", "Annually"] as const;
export const JOB_FORM_RATE_OPTIONS = [
  { value: "Hourly", label: "Per hour" },
  { value: "Weekly", label: "Per week" },
  { value: "Monthly", label: "Per month" },
  { value: "Annually", label: "Per year" },
] as const;
export const JOB_FORM_HOURS_SHOW_BY = ["Fixed Hours", "Flexible Hours"] as const;
export const JOB_FORM_LOCATION_TYPES = ["Remote", "Hybrid", "On-site", "Remote, Hybrid"] as const;
export const JOB_FORM_ACCEPTABLE_MATCH_RATES = [
  "100%",
  "> 90%",
  "> 75%",
  "> 50%",
  "> 25%",
] as const;
export type JobFormAcceptableMatchRate = (typeof JOB_FORM_ACCEPTABLE_MATCH_RATES)[number];
export const JOB_FORM_YEARS_OF_EXPERIENCE = [
  "1 yr",
  "2 yrs",
  "3 yrs",
  "4 yrs",
  "5 yrs",
  "6 yrs",
  "7 yrs",
  "8 yrs",
  "9 yrs",
  "10+",
] as const;
export const JOB_FORM_SHIFT_TYPES = ["Day", "Evening", "Night", "Rotating", "PRN"] as const;

/** Figma create-job "Job Type" chips (stored in job_requisitions.shift_type). */
export const JOB_FORM_JOB_TYPES = [
  "Permanent",
  "Paid-time",
  "Full-time",
  "Part-time",
  "Fixed term",
  "Travel Contract",
  "Local Contract",
] as const;

export type JobFormJobType = (typeof JOB_FORM_JOB_TYPES)[number];

/** Map older chip labels onto the current catalog (case / wording drift). */
const JOB_FORM_JOB_TYPE_ALIASES: Record<string, JobFormJobType> = {
  "travel contract": "Travel Contract",
  "local contract": "Local Contract",
  "per diem": "Paid-time",
  "per-diem": "Paid-time",
};

function normalizeJobFormJobType(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const aliased = JOB_FORM_JOB_TYPE_ALIASES[trimmed.toLowerCase()];
  if (aliased) return aliased;
  const exact = JOB_FORM_JOB_TYPES.find((type) => type.toLowerCase() === trimmed.toLowerCase());
  return exact ?? trimmed;
}

/** Parse comma-separated employment-type chips; legacy single values stay one item. */
export function parseJobFormJobTypes(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of value.split(",")) {
    const next = normalizeJobFormJobType(part);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    result.push(next);
  }
  return result;
}

export function serializeJobFormJobTypes(values: readonly string[]): string {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const next = value.trim();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    unique.push(next);
  }
  const known = JOB_FORM_JOB_TYPES.filter((type) => seen.has(type));
  const extras = unique.filter(
    (item) => !JOB_FORM_JOB_TYPES.includes(item as JobFormJobType)
  );
  return [...known, ...extras].join(", ");
}

export function toggleJobFormJobType(
  current: string | null | undefined,
  option: string
): string {
  const selected = parseJobFormJobTypes(current);
  const next = selected.includes(option)
    ? selected.filter((value) => value !== option)
    : [...selected, option];
  return serializeJobFormJobTypes(next);
}

export function jobFormJobTypesInclude(
  value: string | null | undefined,
  option: string
): boolean {
  const needle = option.trim();
  if (!needle) return false;
  return parseJobFormJobTypes(value).includes(needle);
}

/** Select options for Number of Positions (Figma MSP Job Source Details). */
export const JOB_FORM_NUMBER_OF_POSITION_OPTIONS = Array.from({ length: 20 }, (_, index) => index + 1);

export const JOB_FORM_SURFACE_CLASS =
  "rounded-lg border border-[#CBD5E1] bg-white text-sm text-[#334155]";

/** Centered field column inside the full-bleed white create-job card (Figma). */
export const JOB_FORM_CENTER_COLUMN_CLASS =
  "mx-auto flex w-full min-w-0 max-w-[720px] flex-1 flex-col px-3 py-4 sm:px-4 sm:py-5 min-[700px]:max-w-[760px] min-[700px]:px-10 min-[700px]:py-8 lg:px-12";

export const JOB_FORM_PAGE_CARD_CLASS =
  "flex min-h-[calc(100dvh-6.5rem)] w-full min-w-0 flex-col overflow-x-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-sm";

export const JOB_FORM_INPUT_CLASS = `${JOB_FORM_SURFACE_CLASS} h-10 w-full cursor-pointer px-3 outline-none transition focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--brand-primary)_12%,transparent)] [&::-webkit-calendar-picker-indicator]:cursor-pointer`;

export const JOB_FORM_SELECT_CLASS = `${JOB_FORM_INPUT_CLASS} appearance-none bg-[length:12px_12px] bg-[right_12px_center] bg-no-repeat pr-10 cursor-pointer`;

export const JOB_FORM_TEXTAREA_CLASS = `${JOB_FORM_SURFACE_CLASS} min-h-[280px] w-full cursor-pointer resize-y px-3 py-3 outline-none transition focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--brand-primary)_12%,transparent)]`;

export const JOB_FORM_LABEL_CLASS =
  "mb-1.5 block cursor-pointer text-sm font-normal leading-5 text-[#64748B]";

export const JOB_FORM_SECTION_TITLE_CLASS = "text-sm font-semibold leading-6 text-[#1D2739]";

export const JOB_FORM_SECTION_SUBTITLE_CLASS = "mt-1 text-sm font-normal leading-5 text-[#64748B]";

export const JOB_FORM_PRIMARY_BUTTON_CLASS =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50";

export const JOB_FORM_OUTLINE_BUTTON_CLASS =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#CBD5E1] bg-white px-4 text-sm font-medium text-[#334155] transition hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50";

export const JOB_FORM_ICON_BUTTON_CLASS =
  "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[color:var(--brand-primary)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-primary)_10%,white)] hover:opacity-90";

/** Radio option row: 24px gap on mobile, 40px on web (≥700px). */
export const JOB_FORM_RADIO_OPTIONS_CLASS = "job-form-radio-options flex flex-wrap";

/** Figma Neutral/500 — highlighted setup field surface. */
export const JOB_FORM_NEUTRAL_500_BG = "#F1F5F9";

/** Figma: MSP setup question block (620×135, 20px padding, 16px label-to-options gap). */
export const JOB_FORM_SETUP_MSP_FIELD_CLASS = "job-form-setup-msp-field";

/** Figma vertical field spacing: 30px between field groups. */
export const JOB_FORM_FIELDS_CLASS = "job-form-fields";

/** Figma: 12px between Job Location and Add Additional Location row. */
export const JOB_FORM_LOCATION_CLUSTER_CLASS = "job-form-fields--location-cluster";

export const JOB_FORM_SELECT_CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";

export function normalizePayRatePeriod(value?: string | null): string {
  const raw = value?.trim() || "";
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower.includes("hour")) return "Hourly";
  if (lower.includes("week")) return "Weekly";
  if (lower.includes("month")) return "Monthly";
  if (lower.includes("year") || lower.includes("annual")) return "Annually";
  if ((JOB_FORM_PAY_PERIODS as readonly string[]).includes(raw)) return raw;
  return raw;
}

export function employmentTypeLabel(type: EmploymentType): string {
  if (type === "Contract") return "RNR";
  return type;
}

export function employmentTypeFromLabel(label: string): EmploymentType {
  if (label === "RNR" || label === "R&R") return "Contract";
  if (label === "1099" || label === "W2" || label === "Contract") return label;
  return "W2";
}

/** Review step: employment type is locked because it drives workflow routing. */
export const REVIEW_LOCKED_EMPLOYMENT_TYPE_TOOLTIP =
  "Employment type is set in Job Details and determines which onboarding workflow is assigned to applicants for this job. To change it, go back to the Job Details step.";

export function defaultJobFormUiState(): JobFormUiState {
  return {
    numberOfPositions: 1,
    yearsOfExperience: "",
    additionalLocations: [],
    showInMultipleAreas: false,
    jobLocationType: "",
    remoteStatesScope: "all",
    employerOnRecord: "",
    compensationType: "",
    currency: "",
    showPayBy: "Exact amount",
    payRatePeriod: "",
    hoursShowBy: "",
    commissionFeeType: "",
    selectedBenefits: [],
    customBenefits: [],
  };
}

export function jobFormUiFromJob(job: JobRequisitionInput): JobFormUiState {
  const ui = defaultJobFormUiState();
  ui.numberOfPositions = Math.max(1, Math.trunc(job.numberOfPositions ?? ui.numberOfPositions));
  ui.yearsOfExperience = (() => {
    const raw = job.yearsOfExperience?.trim() || "";
    if (raw === "10+ yrs" || raw === "10+ yr") return "10+";
    return raw;
  })();
  ui.additionalLocations = Array.isArray(job.additionalLocations)
    ? [...job.additionalLocations]
    : [];
  ui.showInMultipleAreas = Boolean(job.showInMultipleAreas);
  ui.jobLocationType = job.jobLocationType?.trim() || job.schedule?.trim() || "";
  ui.remoteStatesScope = (job.remoteAllowedStates?.length ?? 0) > 0 ? "restrict" : "all";
  if (typeof job.isEmployerOnRecord === "boolean") {
    ui.employerOnRecord = job.isEmployerOnRecord ? "yes" : "no";
  } else {
    const employer = job.employerOfRecord?.trim().toLowerCase();
    if (employer === "no") ui.employerOnRecord = "no";
    else if (employer === "yes") ui.employerOnRecord = "yes";
    else if (job.employerOfRecord?.trim()) ui.employerOnRecord = "yes";
  }
  ui.compensationType = (() => {
    const raw = job.compensationType?.trim() || "";
    if (raw === "Yearly" || raw === "Annually" || raw.toLowerCase() === "annual") return "Annually";
    return raw;
  })();
  ui.currency = job.currency?.trim() || "";
  ui.showPayBy = (() => {
    const raw = job.showPayBy?.trim() || "";
    if (raw && (JOB_FORM_SHOW_PAY_BY as readonly string[]).includes(raw)) return raw;
    if (
      job.payRateMin != null &&
      job.payRateMax != null &&
      job.payRateMin !== job.payRateMax
    ) {
      return "Range";
    }
    return "Exact amount";
  })();
  ui.payRatePeriod =
    normalizePayRatePeriod(job.payRatePeriod) ||
    normalizePayRatePeriod(job.compensationType);
  const shiftDetails = job.shiftDetails?.trim() || "";
  if ((JOB_FORM_HOURS_SHOW_BY as readonly string[]).includes(shiftDetails)) {
    ui.hoursShowBy = shiftDetails;
  } else if (job.hoursPerWeek != null) {
    ui.hoursShowBy = "Fixed Hours";
  }
  if (job.benefits?.trim()) {
    const parsed = job.benefits
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (parsed.length) {
      ui.selectedBenefits = parsed;
      ui.customBenefits = parsed.filter(
        (item) =>
          !(JOB_FORM_BENEFIT_OPTIONS as readonly string[]).includes(item)
      );
    }
  }
  if (isMspRecruitAndRelease(job)) {
    if (!job.showPayBy?.trim() && job.payRateMin == null && job.payRateMax == null) {
      ui.showPayBy = "Range";
    }
    if (!ui.payRatePeriod) {
      ui.payRatePeriod = "Hourly";
    }
    if (!ui.hoursShowBy) {
      ui.hoursShowBy = "Fixed Hours";
    }
    if (job.commissionPercent != null && job.commissionPercent > 0) {
      ui.commissionFeeType = "percentage";
    } else if (job.commissionFixedAmount != null && job.commissionFixedAmount > 0) {
      ui.commissionFeeType = "fixed_amount";
    }
  }
  return ui;
}

/** Map a job_requisitions API row into form state (create-from-reference or edit). */
export function jobRequisitionInputFromApiRow(row: Record<string, unknown>): JobRequisitionInput {
  const additionalRaw = row.additional_locations;
  const additionalLocations = Array.isArray(additionalRaw)
    ? additionalRaw.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];

  const employmentRaw = String(row.employment_type ?? "").trim();
  const employmentType: JobRequisitionInput["employmentType"] =
    employmentRaw === "1099" || employmentRaw === "W2" || employmentRaw === "Contract"
      ? employmentRaw
      : (employmentRaw as JobRequisitionInput["employmentType"]) || "W2";

  const payRateMin = row.pay_rate_min == null ? null : Number(row.pay_rate_min);
  const suggestedPayRate = row.pay_rate == null ? null : Number(row.pay_rate);

  return {
    internalRequisitionNumber: String(row.internal_requisition_number ?? ""),
    externalRequisitionId: String(row.external_requisition_id ?? ""),
    sourceType: row.source_type as JobRequisitionInput["sourceType"],
    placementType: placementTypeFromApiRow(
      row.source_type as SourceType,
      row.placement_type,
      row.employment_type
    ),
    eorType:
      row.eor_type === "Tenant" || row.eor_type === "MSP" ? row.eor_type : null,
    mspClient: String(row.msp_client ?? ""),
    professionId: String(row.profession_id ?? ""),
    profession: embeddedRelationName(row.professions) || null,
    specialtyId: row.specialty_id ? String(row.specialty_id) : null,
    employmentType,
    employerOfRecord: String(row.employer_of_record ?? ""),
    department: String(row.department ?? ""),
    facility: String(row.facility ?? ""),
    billRate: row.bill_rate == null ? null : Number(row.bill_rate),
    commissionPercent:
      row.commission_percent == null ? null : Number(row.commission_percent),
    commissionFixedAmount:
      row.commission_fixed_amount == null ? null : Number(row.commission_fixed_amount),
    payRateMin: payRateMin ?? suggestedPayRate,
    payRateMax: row.pay_rate_max == null ? null : Number(row.pay_rate_max),
    targetStartDate: row.target_start_date ? String(row.target_start_date) : null,
    duration: String(row.duration ?? ""),
    shiftType: String(row.shift_type ?? ""),
    shiftDetails: String(row.shift_details ?? ""),
    hoursPerWeek: row.hours_per_week == null ? null : Number(row.hours_per_week),
    publicTitle: String(row.public_title ?? ""),
    publicDescription: String(row.public_description ?? ""),
    industryKey: row.industry_key ? String(row.industry_key) : null,
    location: String(row.location ?? ""),
    postalCode: row.postal_code ? String(row.postal_code) : null,
    worksiteCity: row.worksite_city ? String(row.worksite_city) : null,
    worksiteState: row.worksite_state ? String(row.worksite_state) : null,
    worksitePostalCode: row.worksite_postal_code ? String(row.worksite_postal_code) : null,
    remoteAllowedStates: Array.isArray(row.remote_allowed_states)
      ? row.remote_allowed_states.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [],
    schedule: String(row.schedule ?? ""),
    qualifications: String(row.qualifications ?? ""),
    responsibilities: String(row.responsibilities ?? ""),
    benefits: String(row.benefits ?? ""),
    applicationDeadline: row.application_deadline ? String(row.application_deadline) : null,
    numberOfPositions:
      row.positions_count == null ? 1 : Math.max(1, Number(row.positions_count) || 1),
    yearsOfExperience: row.years_of_experience
      ? String(row.years_of_experience)
      : row.years_experience_required != null
        ? `${row.years_experience_required} yrs`
        : null,
    additionalLocations,
    showInMultipleAreas: Boolean(row.show_in_multiple_areas),
    jobLocationType: row.location_type
      ? String(row.location_type)
      : row.schedule
        ? String(row.schedule)
        : null,
    acceptableMatchRate: row.acceptable_match_rate ? String(row.acceptable_match_rate) : null,
    isEmployerOnRecord:
      typeof row.is_employer_on_record === "boolean" ? row.is_employer_on_record : true,
    compensationType: row.compensation_type ? String(row.compensation_type) : null,
    currency: row.currency ? String(row.currency) : null,
    showPayBy: row.show_pay_by ? String(row.show_pay_by) : null,
    payRatePeriod: row.pay_rate_period
      ? String(row.pay_rate_period)
      : row.rate_unit
        ? String(row.rate_unit)
        : null,
    mspName: row.msp_name ? String(row.msp_name) : null,
    sourceJobTitle: row.source_job_title ? String(row.source_job_title) : null,
    sourceJobUrl: row.source_job_url ? String(row.source_job_url) : null,
    sourceJobDetails: row.source_job_details ? String(row.source_job_details) : null,
    suggestedPayRate,
    requiredCredentials: Array.isArray(row.required_credentials)
      ? row.required_credentials
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
          .join(", ")
      : row.required_credentials
        ? String(row.required_credentials)
        : null,
    specialRequirements: row.special_requirements ? String(row.special_requirements) : null,
    internalNotes: row.internal_notes ? String(row.internal_notes) : null,
  };
}

/** Strip identifiers when cloning an existing job as a new requisition. */
export function jobRequisitionInputForNewFromReference(
  loaded: JobRequisitionInput,
  sourceType: SourceType,
  mspPlacementType?: PlacementType | null
): JobRequisitionInput {
  const placementType = resolvePlacementTypeForSource(sourceType, mspPlacementType);
  const mspTitle =
    loaded.sourceJobTitle?.trim() || loaded.publicTitle?.trim() || null;
  const base = {
    ...loaded,
    sourceType,
    placementType,
    eorType: deriveEorType({ sourceType, placementType, eorType: null }),
    internalRequisitionNumber: "",
    externalRequisitionId: "",
    employerOfRecord: null,
    ...(sourceType === "MSP"
      ? {
          sourceJobTitle: mspTitle,
          publicTitle: mspTitle,
        }
      : {}),
  };

  if (sourceType === "MSP" && placementType === "Recruit_and_Release") {
    return { ...base, employmentType: "Contract" };
  }

  if (sourceType === "MSP" && placementType === "Recruit_and_EOR") {
    return {
      ...base,
      employmentType:
        loaded.employmentType === "1099" || loaded.employmentType === "W2"
          ? loaded.employmentType
          : ("" as EmploymentType),
    };
  }

  return {
    ...base,
    employmentType:
      loaded.employmentType === "1099" || loaded.employmentType === "W2"
        ? loaded.employmentType
        : ("" as EmploymentType),
  };
}

export function applyUiToJob(job: JobRequisitionInput, ui: JobFormUiState): JobRequisitionInput {
  const isYes = ui.employerOnRecord === "yes";
  const isNo = ui.employerOnRecord === "no";
  const showPayBy = ui.showPayBy.trim() || "Exact amount";
  const isRange = showPayBy === "Range";
  const compensationType =
    ui.compensationType === "Annually" ? "Yearly" : ui.compensationType;

  return {
    ...job,
    placementType:
      job.placementType ??
      (job.sourceType === "Internal" ? "Internal" : "Recruit_and_Release"),
    eorType: deriveEorType(job),
    schedule: ui.jobLocationType,
    jobLocationType: ui.jobLocationType,
    remoteAllowedStates: ui.remoteStatesScope === "all" ? [] : job.remoteAllowedStates ?? [],
    numberOfPositions: Math.max(1, Math.trunc(ui.numberOfPositions || 1)),
    yearsOfExperience: ui.yearsOfExperience,
    additionalLocations: ui.additionalLocations
      .map((item) => item.trim())
      .filter(Boolean),
    showInMultipleAreas: ui.showInMultipleAreas,
    isEmployerOnRecord: isYes ? true : isNo ? false : null,
    employerOfRecord: isYes ? job.employerOfRecord ?? null : isNo ? null : job.employerOfRecord ?? null,
    employmentType: isMspRecruitAndRelease(job)
      ? "Contract"
      : defaultEmploymentTypeForJob(job),
    /** MSP Location maps to facility; keep public location in sync. */
    location:
      job.sourceType === "MSP"
        ? job.facility?.trim() || job.location?.trim() || null
        : job.location,
    professionId: job.professionId || null,
    profession: job.profession ?? null,
    specialtyId: job.sourceType === "Internal" ? job.specialtyId : null,
    compensationType: isMspRecruitAndRelease(job)
      ? ui.payRatePeriod || compensationType || null
      : compensationType,
    currency: isMspRecruitAndRelease(job) ? "USD" : ui.currency.trim() || "USD",
    showPayBy,
    payRatePeriod: ui.payRatePeriod || ui.compensationType || null,
    payRateMin: job.payRateMin,
    payRateMax: isRange ? job.payRateMax : null,
    suggestedPayRate: job.payRateMin ?? job.suggestedPayRate ?? null,
    commissionPercent: isMspRecruitAndRelease(job)
      ? ui.commissionFeeType === "fixed_amount"
        ? null
        : job.commissionPercent ?? null
      : null,
    commissionFixedAmount: isMspRecruitAndRelease(job)
      ? ui.commissionFeeType === "percentage"
        ? null
        : job.commissionFixedAmount ?? null
      : null,
    hoursPerWeek: job.hoursPerWeek ?? null,
    shiftDetails: ui.hoursShowBy.trim() || job.shiftDetails || null,
    benefits: isMspRecruitAndRelease(job) ? null : ui.selectedBenefits.join(", "),
    publicTitle:
      job.sourceType === "MSP"
        ? job.sourceJobTitle?.trim() || job.publicTitle?.trim() || null
        : job.publicTitle?.trim() || job.publicTitle,
    sourceJobTitle:
      job.sourceType === "MSP"
        ? job.sourceJobTitle?.trim() || job.publicTitle?.trim() || null
        : job.sourceJobTitle,
  };
}

function normalizeShowPayBy(value: string | null | undefined): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "range") return "Range";
  if (raw === "starting amount") return "Starting amount";
  if (raw === "exact amount") return "Exact amount";
  return "Exact amount";
}

export function formatCommissionSummary(job: JobRequisitionInput): string {
  const parts: string[] = [];
  if (job.commissionPercent != null && job.commissionPercent > 0) {
    parts.push(`${job.commissionPercent}%`);
  }
  if (job.commissionFixedAmount != null && job.commissionFixedAmount > 0) {
    parts.push(`$${job.commissionFixedAmount} USD`);
  }
  return parts.length ? parts.join(" + ") : "—";
}

export function formatCommissionFeeTypeLabel(type: CommissionFeeType): string {
  return JOB_FORM_COMMISSION_FEE_TYPES.find((item) => item.value === type)?.label ?? "";
}

export function formatCommissionPercentValue(job: JobRequisitionInput): string {
  if (job.commissionPercent == null || job.commissionPercent <= 0) return "";
  return `${job.commissionPercent}%`;
}

export function formatCommissionFixedValue(job: JobRequisitionInput): string {
  if (job.commissionFixedAmount == null || job.commissionFixedAmount <= 0) return "";
  const amount = Number.isInteger(job.commissionFixedAmount)
    ? String(job.commissionFixedAmount)
    : job.commissionFixedAmount.toFixed(2).replace(/\.?0+$/, "");
  return `$${amount} USD`;
}

export function formatPayRatePeriodLabel(period: string | null | undefined): string {
  const raw = String(period ?? "").trim().toLowerCase();
  if (raw.includes("hour")) return "Per hour";
  if (raw.includes("week")) return "Per week";
  if (raw.includes("month")) return "Per month";
  if (raw.includes("year") || raw.includes("annual")) return "Per year";
  return String(period ?? "").trim();
}

export function formatCommissionEstimateFromPayRate(
  job: JobRequisitionInput,
  ui: JobFormUiState
): string {
  if (ui.commissionFeeType !== "percentage" || job.commissionPercent == null || job.commissionPercent <= 0) {
    return "";
  }
  const pct = job.commissionPercent / 100;
  const min = job.payRateMin;
  const max = job.payRateMax;
  const periodLabel = formatPayRatePeriodLabel(ui.payRatePeriod || "Hourly");
  const formatAmount = (value: number) => {
    const product = value * pct;
    const text = Number.isInteger(product) ? String(product) : product.toFixed(2).replace(/\.?0+$/, "");
    return `$${text}`;
  };
  const showPayBy = normalizeShowPayBy(ui.showPayBy || job.showPayBy);
  if (showPayBy === "Range" && min != null && max != null && min !== max) {
    return `${formatAmount(min)} to ${formatAmount(max)} ${periodLabel}`;
  }
  const amount = min ?? max;
  if (amount == null) return "";
  return `${formatAmount(amount)} ${periodLabel}`;
}

export function formatPaySummary(
  job: JobRequisitionInput,
  ui: JobFormUiState
): string {
  const min = job.payRateMin;
  const max = job.payRateMax;
  const period = formatPayRatePeriodLabel(ui.payRatePeriod || ui.compensationType);
  const showPayBy = normalizeShowPayBy(ui.showPayBy || job.showPayBy);

  if (showPayBy === "Range") {
    if (min == null && max == null) return "—";
    if (min != null && max != null && min !== max) {
      return period ? `$${min} to $${max} ${period}` : `$${min} to $${max}`;
    }
    const amount = min ?? max;
    if (amount == null) return "—";
    return period ? `$${amount} ${period}` : `$${amount}`;
  }

  // Starting amount / Exact amount — always a single value (never "min to max").
  const amount = min ?? max;
  if (amount == null) return "—";
  return period ? `$${amount} ${period}` : `$${amount}`;
}

export function formatExpectedHoursValue(
  job: JobRequisitionInput,
  ui: JobFormUiState
): string {
  const hoursShowBy = ui.hoursShowBy || (job.hoursPerWeek != null ? "Fixed Hours" : "");
  if (hoursShowBy === "Fixed Hours" && job.hoursPerWeek != null) {
    return `${job.hoursPerWeek} hrs/week`;
  }
  return hoursShowBy;
}

export function primaryButtonStyle(brandStyle: CSSProperties): CSSProperties {
  return {
    ...brandStyle,
    backgroundColor: "var(--brand-primary)",
    borderColor: "var(--brand-primary)",
  };
}

export type JobFormOption = { id: string; name: string };
export type JobFormSpecialtyOption = JobFormOption & { profession_id: string };

export type JobFormOptionsPayload = {
  professions: JobFormOption[];
  specialties: JobFormSpecialtyOption[];
  workflows?: JobFormOption[];
  employmentTypes: EmploymentType[];
  sourceTypes: SourceType[];
  employerOfRecordOptions: JobFormOption[];
  canManageWorkflows: boolean;
  primaryIndustryKey?: string | null;
};

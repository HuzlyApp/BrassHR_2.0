import "server-only";

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PUBLIC_ACCEPTING_JOB_STATUS_QUERY,
  JobValidationError,
  type EmploymentType,
  type JobRequisitionInput,
  type JobStatus,
  type JobWorkflowAssignmentOptions,
  type SourceType,
  type WorkflowAssignmentMode,
  type WorkflowMatch,
} from "@/lib/jobs/types";
import {
  normalizeApplicantEmail,
  validatePublishableJob,
  workflowNoMatchMessage,
} from "@/lib/jobs/validation";
import { parseIndustryKey, InvalidIndustryKeyError, industryKeyFromLegacyLabel } from "@/lib/ai-catalog/industry-catalog";
import {
  formatDateOnlyUtc,
  isJobRequisitionOpen,
  normalizeJobToken,
} from "@/lib/jobs/public-application-routing";
import {
  buildPublicJobsKeywordOrFilters,
  buildPublicJobsLocationOrFilter,
  buildPublicJobsWorkplaceTypeOrFilter,
} from "@/lib/jobs/public-jobs-board";
import {
  deriveEorType,
  isMspRecruitAndRelease,
  jobRequiresWorkflow,
  placementTypeFromApiRow,
  resolvePlacementTypeForSource,
} from "@/lib/jobs/placement";
import {
  canTransitionJobStatus,
  isLiveJobRequisitionStatus,
  isOpenJobRequisitionStatus,
  normalizeJobRequisitionStatus,
} from "@/lib/jobs/job-status";
import { normalizeJobFormLocationForStorage } from "@/lib/location/city-state";
import { evaluateJobServiceArea, requireApplyWorkLocation } from "@/lib/service-area/jobs";
import { locationFromFreeText } from "@/lib/service-area/normalize";
import {
  assertTenantCanOperate,
  evaluateServiceAreaWithDb,
  recordWorkLocationConfirmation,
} from "@/lib/service-area/db";
import { serviceAreaMessage } from "@/lib/service-area/copy";
import { isOpenJobServiceAreaHoldError } from "@/lib/service-area/errors";
import type { ServiceAreaLocation } from "@/lib/service-area/types";
import { resolveWorkflowMatch } from "@/lib/workflow-mappings/service";
import { ensureAdminCandidateWorker } from "@/lib/jobs/ensure-admin-candidate-worker";
import { getOnboardingFlowById } from "@/lib/onboarding/onboarding-flows";
import { buildStepRecordRow, snapshotNodes } from "@/lib/onboarding/sync-workflow-instances";
import {
  jobScreeningQuestionToInput,
  loadJobScreeningQuestions,
  syncJobScreeningQuestions,
  type JobScreeningQuestionInput,
} from "@/lib/jobs/screening-questions";
import {
  normalizeJobTags,
  type JobRequisitionPatchInput,
} from "@/lib/jobs/job-requisition-patch";
import { capJobListBodyFields } from "@/lib/jobs/cap-job-list-text";
import { loadStaffUsersByIds } from "@/lib/account/resolve-staff-users";
import { embeddedRelationName } from "@/lib/jobs/profession-text";
import { resolveProfessionIdForSave } from "@/lib/jobs/resolve-profession";
import { jobRequirementsSourceFieldsChanged } from "@/lib/jobs/match-analysis/build-job-requirements";
import { invalidateMatchCachesForJobDescriptionChange } from "@/lib/jobs/match-analysis/invalidate-on-job-change";

type DbClient = SupabaseClient;

function throwJobWriteError(error: unknown): never {
  if (isOpenJobServiceAreaHoldError(error)) {
    const message = serviceAreaMessage("location_not_enabled");
    throw new JobValidationError(message, { location: message }, "platform_hold");
  }
  throw error;
}

export { resolveWorkflowMatch };

function clean(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

/** DB check: rate_unit IN ('Hour','Day','Week','Month','Year','Flat') */
function toLegacyRateUnit(
  payRatePeriod?: string | null,
  compensationType?: string | null
): "Hour" | "Day" | "Week" | "Month" | "Year" | "Flat" | null {
  const period = (payRatePeriod ?? "").trim().toLowerCase();
  if (period.includes("hour")) return "Hour";
  if (period.includes("day")) return "Day";
  if (period.includes("week")) return "Week";
  if (period.includes("month")) return "Month";
  if (period.includes("year") || period.includes("annual")) return "Year";
  if (period.includes("flat")) return "Flat";

  const compensation = (compensationType ?? "").trim().toLowerCase();
  if (compensation.includes("hour")) return "Hour";
  if (compensation.includes("week")) return "Week";
  if (compensation.includes("month")) return "Month";
  if (compensation.includes("annual") || compensation.includes("year")) return "Year";

  return null;
}

function toJobRow(input: JobRequisitionInput) {
  const publicTitle = clean(input.publicTitle);
  const sourceJobTitle = clean(input.sourceJobTitle);
  /** MSP: Job Title and Source Job Title are the same field — prefer source title. */
  const resolvedPublicTitle =
    input.sourceType === "MSP"
      ? sourceJobTitle ?? publicTitle
      : publicTitle;
  const publicDescription = clean(input.publicDescription);
  const facility = clean(input.facility);
  const duration = clean(input.duration);
  const benefits = clean(input.benefits);
  const mspClient = clean(input.mspClient);
  const externalRequisitionId = clean(input.externalRequisitionId);
  const jobLocationType = clean(input.jobLocationType) ?? clean(input.schedule);
  const payRatePeriod = clean(input.payRatePeriod);
  const compensationType = clean(input.compensationType);
  const yearsOfExperience = clean(input.yearsOfExperience);
  const yearsExperienceRequired = yearsOfExperience
    ? Number.parseInt(yearsOfExperience.replace(/[^\d]/g, ""), 10)
    : null;
  const requiredCredentials = clean(input.requiredCredentials);
  const suggestedPayRate =
    input.suggestedPayRate ?? input.payRateMin ?? input.payRateMax ?? null;
  const professionId = clean(input.professionId);
  /** MSP Location field writes facility; mirror into location for public/list display. */
  const rawLocation =
    clean(input.location) ?? (input.sourceType === "MSP" ? facility : null);
  const normalizedPrimary = rawLocation
    ? normalizeJobFormLocationForStorage(rawLocation)
    : { location: null, zipCode: null };
  const location = normalizedPrimary.location ?? (rawLocation ? rawLocation : null);
  const postalCode =
    clean(input.postalCode) ?? normalizedPrimary.zipCode ?? null;
  const parsedWorksite = locationFromFreeText(location, postalCode);
  const additionalLocations = Array.isArray(input.additionalLocations)
    ? input.additionalLocations
        .map(
          (item) =>
            normalizeJobFormLocationForStorage(item.trim()).location ?? item.trim()
        )
        .filter(Boolean)
    : [];

  return {
    internal_requisition_number: clean(input.internalRequisitionNumber),
    external_requisition_id: externalRequisitionId,
    source_type: input.sourceType,
    msp_client: mspClient,
    msp_name: clean(input.mspName),
    msp_client_name: mspClient,
    profession_id: professionId,
    specialty_id: clean(input.specialtyId),
    employment_type: input.employmentType,
    employer_of_record: clean(input.employerOfRecord),
    department: clean(input.department),
    facility,
    bill_rate: input.billRate ?? null,
    pay_rate_min: input.payRateMin ?? null,
    pay_rate_max: input.payRateMax ?? null,
    commission_percent: input.commissionPercent ?? null,
    commission_fixed_amount: input.commissionFixedAmount ?? null,
    target_start_date: clean(input.targetStartDate),
    duration,
    shift_type: clean(input.shiftType),
    shift_details: clean(input.shiftDetails),
    hours_per_week: input.hoursPerWeek ?? null,
    public_title: resolvedPublicTitle,
    public_description: publicDescription,
    industry_key: (() => {
      try {
        return input.industryKey ? parseIndustryKey(input.industryKey) : null;
      } catch (error) {
        if (error instanceof InvalidIndustryKeyError) {
          throw new JobValidationError("Select a valid job industry.", {
            industryKey: "Select a valid job industry.",
          });
        }
        throw error;
      }
    })(),
    location,
    postal_code: postalCode,
    worksite_city: parsedWorksite.city || null,
    worksite_state: parsedWorksite.state || null,
    worksite_postal_code: parsedWorksite.postalCode || postalCode,
    worksite_country: "US",
    remote_allowed_states: Array.isArray(input.remoteAllowedStates)
      ? input.remoteAllowedStates.map((item) => item.trim().toUpperCase()).filter(Boolean)
      : [],
    schedule: jobLocationType,
    qualifications: clean(input.qualifications),
    responsibilities: clean(input.responsibilities),
    benefits,
    application_deadline: clean(input.applicationDeadline),
    positions_count: Math.max(1, Math.trunc(input.numberOfPositions ?? 1)),
    years_of_experience: yearsOfExperience,
    years_experience_required: Number.isFinite(yearsExperienceRequired)
      ? yearsExperienceRequired
      : null,
    additional_locations: additionalLocations,
    show_in_multiple_areas: Boolean(input.showInMultipleAreas),
    location_type: jobLocationType,
    acceptable_match_rate: clean(input.acceptableMatchRate),
    is_employer_on_record:
      typeof input.isEmployerOnRecord === "boolean" ? input.isEmployerOnRecord : true,
    compensation_type: compensationType,
    currency: clean(input.currency) ?? "USD",
    show_pay_by: clean(input.showPayBy),
    pay_rate_period: payRatePeriod,
    rate_unit: toLegacyRateUnit(payRatePeriod, compensationType),
    source_job_title: input.sourceType === "MSP" ? sourceJobTitle ?? resolvedPublicTitle : null,
    source_job_url: clean(input.sourceJobUrl),
    source_job_details: clean(input.sourceJobDetails),
    special_requirements: clean(input.specialRequirements),
    internal_notes: clean(input.internalNotes),
    required_credentials: requiredCredentials
      ? requiredCredentials
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
    // Legacy columns still required on upgraded job_requisitions tables.
    title: resolvedPublicTitle ?? "Untitled job",
    description: publicDescription,
    placement_type:
      input.placementType ??
      (input.sourceType === "MSP" ? "Recruit_and_Release" : "Internal"),
    eor_type: deriveEorType(input),
    external_req_id: externalRequisitionId,
    facility_name: facility,
    job_duration: duration,
    benefits_summary: benefits,
    pay_rate: suggestedPayRate,
  };
}

type JobDbRow = ReturnType<typeof toJobRow> & { eor_tenant_id?: string | null };

/** MSP Recruit & EOR (tenant EOR) requires eor_tenant_id — enforced by DB check constraint. */
function applyTenantEorRowFields(
  row: ReturnType<typeof toJobRow>,
  tenantId: string,
  tenantName: string | null
): JobDbRow {
  if (row.placement_type !== "Recruit_and_EOR" || row.eor_type !== "Tenant") {
    return row;
  }

  return {
    ...row,
    eor_tenant_id: tenantId,
    is_employer_on_record: true,
    employer_of_record: row.employer_of_record ?? tenantName,
  };
}

async function resolveTenantName(
  supabase: DbClient,
  tenantId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw error;
  return data?.name ? String(data.name).trim() : null;
}


function cleanMatchText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() || "";
}

async function routingKeyChanged(
  supabase: DbClient,
  tenantId: string,
  jobId: string,
  input: JobRequisitionInput
): Promise<boolean> {
  const { data, error } = await supabase
    .from("job_requisitions")
    .select(
      "profession_id, specialty_id, employment_type, location, location_type, years_of_experience"
    )
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;
  const nextLocationType = cleanMatchText(input.jobLocationType ?? input.schedule);
  return (
    String(data.profession_id ?? "") !== String(input.professionId ?? "") ||
    String(data.specialty_id ?? "") !== String(input.specialtyId ?? "") ||
    String(data.employment_type) !== input.employmentType ||
    cleanMatchText(data.location as string | null) !== cleanMatchText(input.location) ||
    cleanMatchText(data.location_type as string | null) !== nextLocationType ||
    cleanMatchText(data.years_of_experience as string | null) !==
      cleanMatchText(input.yearsOfExperience)
  );
}

async function loadExistingWorkflowAssignment(
  supabase: DbClient,
  tenantId: string,
  jobId: string
): Promise<{
  workflowId: string | null;
  assignmentMode: WorkflowAssignmentMode;
  mappingId: string | null;
} | null> {
  const { data, error } = await supabase
    .from("job_requisitions")
    .select("workflow_id, workflow_assignment_mode, workflow_mapping_id")
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    const message = String(error.message ?? "").toLowerCase();
    if (message.includes("workflow_assignment_mode") || message.includes("does not exist")) {
      const legacy = await supabase
        .from("job_requisitions")
        .select("workflow_id")
        .eq("id", jobId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (legacy.error) throw legacy.error;
      if (!legacy.data) return null;
      return {
        workflowId: legacy.data.workflow_id ? String(legacy.data.workflow_id) : null,
        assignmentMode: "automatic",
        mappingId: null,
      };
    }
    throw error;
  }
  if (!data) return null;
  return {
    workflowId: data.workflow_id ? String(data.workflow_id) : null,
    assignmentMode:
      data.workflow_assignment_mode === "manual" ? "manual" : "automatic",
    mappingId: data.workflow_mapping_id ? String(data.workflow_mapping_id) : null,
  };
}

async function resolveManualOverrideMatch(
  supabase: DbClient,
  tenantId: string,
  workflowId: string
): Promise<WorkflowMatch> {
  const flow = await getOnboardingFlowById(supabase, tenantId, workflowId);
  if (!flow || flow.status !== "published") {
    throw new JobValidationError(
      "Select a published workflow to override the automatic assignment.",
      { workflowId: "Published workflow is required." },
      "WORKFLOW_OVERRIDE_INVALID"
    );
  }
  return {
    mappingId: null,
    workflowId: flow.id,
    workflowName: flow.name,
    source: "manual",
    specificity: 0,
    criteriaLabel: "Manual override",
  };
}

async function resolveJobWorkflowAssignment(
  supabase: DbClient,
  tenantId: string,
  input: JobRequisitionInput,
  options: {
    jobId?: string;
    resetToAutomatic?: boolean;
    overrideWorkflowId?: string | null;
  }
): Promise<{
  match: WorkflowMatch | null;
  assignmentMode: WorkflowAssignmentMode;
  assignmentError: string | null;
}> {
  const existing = options.jobId
    ? await loadExistingWorkflowAssignment(supabase, tenantId, options.jobId)
    : null;

  const overrideId = options.overrideWorkflowId?.trim() || null;
  if (overrideId) {
    const match = await resolveManualOverrideMatch(supabase, tenantId, overrideId);
    return { match, assignmentMode: "manual", assignmentError: null };
  }

  const keepManual =
    !options.resetToAutomatic &&
    existing?.assignmentMode === "manual" &&
    Boolean(existing.workflowId);

  if (keepManual && existing?.workflowId) {
    const match = await resolveManualOverrideMatch(supabase, tenantId, existing.workflowId);
    return { match, assignmentMode: "manual", assignmentError: null };
  }

  const match = await resolveWorkflowMatch(supabase, tenantId, {
    professionId: input.professionId,
    specialtyId: input.specialtyId,
    employmentType: input.employmentType,
    location: input.location,
    locationType: input.jobLocationType,
    jobLocationType: input.jobLocationType,
    yearsOfExperience: input.yearsOfExperience,
  });

  if (!match) {
    const name = await professionName(supabase, tenantId, input.professionId ?? "");
    return {
      match: null,
      assignmentMode: "automatic",
      assignmentError: workflowNoMatchMessage(name, {
        employmentType: input.employmentType,
        specialtyId: input.specialtyId,
        location: input.location,
        jobLocationType: input.jobLocationType,
        yearsOfExperience: input.yearsOfExperience,
      }),
    };
  }

  return { match, assignmentMode: "automatic", assignmentError: null };
}

/** Load the published onboarding flow assigned to a job (for new applicants). */
export async function resolvePublishedFlowForJobWorkflow(
  supabase: DbClient,
  tenantId: string,
  workflowId: string
) {
  const flow = await getOnboardingFlowById(supabase, tenantId, workflowId);
  if (!flow) {
    throw new JobValidationError(
      "The workflow assigned to this job is unavailable.",
      {},
      "WORKFLOW_UNAVAILABLE"
    );
  }
  if (flow.status !== "published") {
    throw new JobValidationError(
      "The workflow assigned to this job is not published.",
      {},
      "WORKFLOW_UNAVAILABLE"
    );
  }
  if (!flow.builderDraft || !Array.isArray(flow.builderDraft.nodes) || !flow.builderDraft.nodes.length) {
    throw new JobValidationError(
      "The workflow assigned to this job has no applicant steps.",
      {},
      "WORKFLOW_UNAVAILABLE"
    );
  }
  return flow;
}

async function countActiveApplicantsForJob(
  supabase: DbClient,
  tenantId: string,
  jobId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("job_applications")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("job_requisition_id", jobId)
    .neq("status", "withdrawn");
  if (error) throw error;
  return count ?? 0;
}

async function professionName(
  supabase: DbClient,
  tenantId: string,
  professionId: string
): Promise<string> {
  const { data } = await supabase
    .from("professions")
    .select("name")
    .eq("id", professionId)
    .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
    .maybeSingle();
  return data?.name ? String(data.name) : professionId;
}

async function requirePublishable(
  supabase: DbClient,
  tenantId: string,
  input: JobRequisitionInput,
  match: WorkflowMatch | null
): Promise<void> {
  const fieldErrors = validatePublishableJob(input, match?.workflowId ?? null);
  if (Object.keys(fieldErrors).length === 0) return;

  let message = "Complete the required fields before publishing.";
  if (jobRequiresWorkflow(input) && !match) {
    message = workflowNoMatchMessage(
      await professionName(supabase, tenantId, input.professionId ?? ""),
      {
        employmentType: input.employmentType,
      }
    );
  }
  throw new JobValidationError(message, fieldErrors);
}

async function resolvePublicJobTokenForPublish(
  supabase: DbClient,
  tenantId: string,
  jobId?: string
): Promise<string | undefined> {
  if (jobId) {
    const { data, error } = await supabase
      .from("job_requisitions")
      .select("public_job_token")
      .eq("id", jobId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw error;
    if (normalizeJobToken(data?.public_job_token ? String(data.public_job_token) : null)) {
      return undefined;
    }
  }
  return randomUUID();
}

export async function saveJobRequisition(
  supabase: DbClient,
  tenantId: string,
  actorUserId: string,
  input: JobRequisitionInput,
  options: {
    jobId?: string;
    publish: boolean;
    confirmRoutingChange?: boolean;
    screeningQuestions?: JobScreeningQuestionInput[];
  } & JobWorkflowAssignmentOptions
) {
  input.professionId = await resolveProfessionIdForSave(supabase, tenantId, input);

  let existingJobForMatchInvalidation: Record<string, unknown> | null = null;

  if (options.jobId) {
    const { data: existingJob, error: existingJobError } = await supabase
      .from("job_requisitions")
      .select(
        "status, workflow_assignment_mode, public_title, public_description, qualifications, responsibilities, special_requirements, required_credentials, years_of_experience, years_experience_required, location, specialty"
      )
      .eq("id", options.jobId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (existingJobError) {
      const message = String(existingJobError.message ?? "").toLowerCase();
      if (!message.includes("workflow_assignment_mode") && !message.includes("does not exist")) {
        throw existingJobError;
      }
    }
    existingJobForMatchInvalidation = existingJob as Record<string, unknown> | null;

    if (isLiveJobRequisitionStatus(String(existingJob?.status ?? ""))) {
      const routingChanged = await routingKeyChanged(supabase, tenantId, options.jobId, input);
      const isManual = existingJob?.workflow_assignment_mode === "manual";
      if (routingChanged && !isManual && !options.resetToAutomatic) {
        const applicantCount = await countActiveApplicantsForJob(
          supabase,
          tenantId,
          options.jobId
        );
        if (applicantCount > 0 && !options.confirmRoutingChange) {
          throw new JobValidationError(
            "Changing job attributes will assign a different workflow for new applicants. Existing applicants remain on their original workflow. Confirm to continue.",
            { professionId: "Confirm routing change to update workflow assignment." },
            "ROUTING_CHANGE_CONFIRMATION_REQUIRED"
          );
        }
      }
    }
  }

  const { match, assignmentMode, assignmentError } = await resolveJobWorkflowAssignment(
    supabase,
    tenantId,
    input,
    options
  );
  if (options.publish) await requirePublishable(supabase, tenantId, input, match);

  const serviceArea = await evaluateJobServiceArea(supabase, tenantId, input, {
    publish: options.publish,
    actorUserId,
    jobId: options.jobId,
  });

  const baseRow = toJobRow(input);
  const tenantName =
    baseRow.placement_type === "Recruit_and_EOR" && baseRow.eor_type === "Tenant"
      ? await resolveTenantName(supabase, tenantId)
      : null;
  const jobRow = applyTenantEorRowFields(baseRow, tenantId, tenantName);
  if (!jobRow.industry_key && !options.jobId) {
    const { data: tenantIndustry } = await supabase
      .from("tenants")
      .select("primary_industry_key, industry")
      .eq("id", tenantId)
      .maybeSingle();
    const rawPrimary =
      typeof tenantIndustry?.primary_industry_key === "string" &&
      tenantIndustry.primary_industry_key.trim()
        ? tenantIndustry.primary_industry_key
        : null;
    let primary: ReturnType<typeof parseIndustryKey> = null;
    try {
      primary = rawPrimary ? parseIndustryKey(rawPrimary) : null;
    } catch {
      primary = null;
    }
    if (!primary) {
      primary = industryKeyFromLegacyLabel(
        typeof tenantIndustry?.industry === "string" ? tenantIndustry.industry : null
      );
    }
    if (primary) jobRow.industry_key = primary;
  }

  const now = new Date().toISOString();
  const publicJobToken = options.publish
    ? await resolvePublicJobTokenForPublish(supabase, tenantId, options.jobId)
    : undefined;
  const patch = {
    ...jobRow,
    workflow_id: match?.workflowId ?? null,
    workflow_mapping_id: assignmentMode === "automatic" ? match?.mappingId ?? null : null,
    workflow_assignment_mode: assignmentMode,
    workflow_assignment_error: match ? null : assignmentError,
    status: options.publish ? ("open" as const) : ("draft" as const),
    published_at: options.publish ? now : null,
    closed_at: null,
    archived_at: null,
    updated_by: actorUserId,
    service_area_status: serviceArea.status,
    ...(publicJobToken ? { public_job_token: publicJobToken } : {}),
  };

  const selectCols =
    "*, professions(name), specialties(name), onboarding_flows!workflow_id(name)";

  if (options.jobId) {
    let { data, error } = await supabase
      .from("job_requisitions")
      .update(patch)
      .eq("id", options.jobId)
      .eq("tenant_id", tenantId)
      .select(selectCols)
      .single();

    if (error) {
      const message = String(error.message ?? "").toLowerCase();
      if (
        message.includes("workflow_assignment_mode") ||
        message.includes("workflow_mapping_id") ||
        message.includes("does not exist")
      ) {
        const legacyPatch = {
          ...applyTenantEorRowFields(toJobRow(input), tenantId, tenantName),
          workflow_id: match?.workflowId ?? null,
          status: options.publish ? ("open" as const) : ("draft" as const),
          published_at: options.publish ? now : null,
          closed_at: null,
          archived_at: null,
          updated_by: actorUserId,
          ...(publicJobToken ? { public_job_token: publicJobToken } : {}),
        };
        const retry = await supabase
          .from("job_requisitions")
          .update(legacyPatch)
          .eq("id", options.jobId)
          .eq("tenant_id", tenantId)
          .select(selectCols)
          .single();
        data = retry.data;
        error = retry.error;
      }
    }
    if (error) throwJobWriteError(error);
    const savedJobId = String(data.id);

    let matchReanalysisScheduled = 0;
    if (
      jobRequirementsSourceFieldsChanged(existingJobForMatchInvalidation, {
        public_title: jobRow.public_title,
        public_description: jobRow.public_description,
        qualifications: jobRow.qualifications,
        responsibilities: jobRow.responsibilities,
        special_requirements: jobRow.special_requirements,
        required_credentials: jobRow.required_credentials,
        years_of_experience: jobRow.years_of_experience,
        years_experience_required: jobRow.years_experience_required,
        location: jobRow.location,
        specialty: existingJobForMatchInvalidation?.specialty ?? null,
      })
    ) {
      const invalidated = await invalidateMatchCachesForJobDescriptionChange({
        supabase,
        tenantId,
        jobRequisitionId: savedJobId,
      });
      if (data.ai_match_enabled !== false && invalidated.applicationIds.length > 0) {
        const { scheduleReanalysisAfterJobDescriptionChange } = await import(
          "@/lib/jobs/match-analysis/auto-quick-match"
        );
        matchReanalysisScheduled = scheduleReanalysisAfterJobDescriptionChange({
          supabase,
          tenantId,
          jobApplicationIds: invalidated.applicationIds,
          analyzedByUserId: actorUserId,
        });
      }
    }

    const screeningQuestions =
      options.screeningQuestions !== undefined
        ? await syncJobScreeningQuestions(supabase, {
            tenantId,
            jobId: savedJobId,
            actorUserId,
            questions: options.screeningQuestions,
          })
        : await loadJobScreeningQuestions(supabase, tenantId, savedJobId);
    return {
      job: data,
      workflow: match,
      screeningQuestions: screeningQuestions.map(jobScreeningQuestionToInput),
      matchReanalysisScheduled,
    };
  }

  let { data, error } = await supabase
    .from("job_requisitions")
    .insert({
      ...patch,
      tenant_id: tenantId,
      created_by: actorUserId,
    })
    .select(selectCols)
    .single();

  if (error) {
    const message = String(error.message ?? "").toLowerCase();
    if (
      message.includes("workflow_assignment_mode") ||
      message.includes("workflow_mapping_id") ||
      message.includes("does not exist")
    ) {
      const legacyPatch = {
        ...applyTenantEorRowFields(toJobRow(input), tenantId, tenantName),
        workflow_id: match?.workflowId ?? null,
        status: options.publish ? ("open" as const) : ("draft" as const),
        published_at: options.publish ? now : null,
        closed_at: null,
        archived_at: null,
        updated_by: actorUserId,
        ...(publicJobToken ? { public_job_token: publicJobToken } : {}),
      };
      const retry = await supabase
        .from("job_requisitions")
        .insert({
          ...legacyPatch,
          tenant_id: tenantId,
          created_by: actorUserId,
        })
        .select(selectCols)
        .single();
      data = retry.data;
      error = retry.error;
    }
  }
  if (error) throwJobWriteError(error);
  const savedJobId = String(data.id);
  const screeningQuestions =
    options.screeningQuestions !== undefined
      ? await syncJobScreeningQuestions(supabase, {
          tenantId,
          jobId: savedJobId,
          actorUserId,
          questions: options.screeningQuestions,
        })
      : [];
  return {
    job: data,
    workflow: match,
    screeningQuestions: screeningQuestions.map(jobScreeningQuestionToInput),
    serviceAreaWarning: serviceArea.warning,
  };
}

export async function transitionJobStatus(
  supabase: DbClient,
  tenantId: string,
  actorUserId: string,
  jobId: string,
  status: JobStatus,
  options: { skipTransitionGuard?: boolean } = {}
) {
  const { data: existing, error: existingError } = await supabase
    .from("job_requisitions")
    .select("id, status, published_at")
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new JobValidationError("Job not found.", {}, "JOB_NOT_FOUND");

  const fromStatus = normalizeJobRequisitionStatus(String(existing.status ?? ""));
  const toStatus = normalizeJobRequisitionStatus(status);
  if (!options.skipTransitionGuard && !canTransitionJobStatus(fromStatus, toStatus)) {
    throw new JobValidationError(
      `Cannot change job status from ${fromStatus} to ${toStatus}.`,
      {},
      "JOB_STATUS_TRANSITION_INVALID"
    );
  }

  const now = new Date().toISOString();
  const patch: Record<string, string | null> = {
    status: toStatus,
    updated_by: actorUserId,
  };

  if (toStatus === "draft") {
    patch.published_at = null;
    patch.closed_at = null;
    patch.archived_at = null;
  } else if (toStatus === "open") {
    const { data: jobRow, error: jobRowError } = await supabase
      .from("job_requisitions")
      .select("*")
      .eq("id", jobId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (jobRowError) throw jobRowError;
    if (jobRow) {
      await evaluateJobServiceArea(
        supabase,
        tenantId,
        jobRowToInput(jobRow as Record<string, unknown>),
        { publish: true, actorUserId, jobId }
      );
      if (!normalizeJobToken(jobRow.public_job_token ? String(jobRow.public_job_token) : null)) {
        patch.public_job_token = randomUUID();
      }
    }
    patch.published_at = existing.published_at
      ? String(existing.published_at)
      : now;
    patch.closed_at = null;
    patch.archived_at = null;
  } else if (toStatus === "paused") {
    patch.published_at = existing.published_at
      ? String(existing.published_at)
      : now;
    patch.closed_at = null;
    patch.archived_at = null;
  } else if (toStatus === "filled") {
    patch.closed_at = now;
    patch.archived_at = null;
  } else if (toStatus === "closed") {
    patch.closed_at = now;
    patch.archived_at = null;
  } else if (toStatus === "archived") {
    patch.archived_at = now;
    patch.closed_at = null;
    patch.published_at = null;
  }

  const { data, error } = await supabase
    .from("job_requisitions")
    .update(patch)
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .select("id, status, published_at, closed_at, archived_at")
    .single();
  if (error) throwJobWriteError(error);
  return data;
}

/** Restore an archived job to draft (off public board, editable). */
export async function unarchiveJobRequisition(
  supabase: DbClient,
  tenantId: string,
  actorUserId: string,
  jobId: string
) {
  const { data: row, error } = await supabase
    .from("job_requisitions")
    .select("id, status")
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new JobValidationError("Job not found.", {}, "JOB_NOT_FOUND");
  if (normalizeJobRequisitionStatus(String(row.status ?? "")) !== "archived") {
    throw new JobValidationError("Job is not archived.", {}, "JOB_NOT_ARCHIVED");
  }
  return transitionJobStatus(supabase, tenantId, actorUserId, jobId, "draft");
}

/** Close open jobs whose application deadline has passed. */
export async function closeExpiredPublishedJobs(
  supabase: DbClient,
  tenantId: string,
  actorUserId: string
): Promise<void> {
  const today = formatDateOnlyUtc(new Date());
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("job_requisitions")
    .update({
      status: "closed",
      closed_at: now,
      updated_by: actorUserId,
    })
    .eq("tenant_id", tenantId)
    .in("status", ["open", "published", "paused"])
    .not("application_deadline", "is", null)
    .lt("application_deadline", today);
  if (error) throw error;
}

/**
 * Same deadline rule as closeExpiredPublishedJobs, across every tenant.
 * Leaves updated_by unchanged. Used by the hourly cron, not by list GETs.
 */
export async function closeExpiredPublishedJobsAllTenants(
  supabase: DbClient
): Promise<number> {
  const today = formatDateOnlyUtc(new Date());
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("job_requisitions")
    .update({
      status: "closed",
      closed_at: now,
    })
    .in("status", ["open", "published", "paused"])
    .not("application_deadline", "is", null)
    .lt("application_deadline", today)
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

export type JobPickerOption = {
  id: string;
  title: string;
  status: string;
  /** MSP end-client name. Null for internal jobs. Keeps the Candidates client filter. */
  clientName: string | null;
};

function jobPickerTitle(row: {
  source_type?: string | null;
  source_job_title?: string | null;
  public_title?: string | null;
}): string {
  const source = String(row.source_type ?? "").trim().toLowerCase();
  if (source === "msp") {
    return row.source_job_title?.trim() || row.public_title?.trim() || "Untitled draft";
  }
  return row.public_title?.trim() || "Untitled draft";
}

/** Id, display title, status, and MSP client name. No descriptions or list metrics. */
export async function listJobPickerOptions(
  supabase: DbClient,
  tenantId: string
): Promise<JobPickerOption[]> {
  const { data, error } = await supabase
    .from("job_requisitions")
    .select("id, status, source_type, public_title, source_job_title, msp_name")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const source = String(row.source_type ?? "").trim().toLowerCase();
    const clientName = source === "msp" ? row.msp_name?.trim() || null : null;
    return {
      id: row.id,
      title: jobPickerTitle(row),
      status: normalizeJobRequisitionStatus(String(row.status ?? "")),
      clientName,
    };
  });
}

function jobRowToInput(row: Record<string, unknown>): JobRequisitionInput {
  const additionalRaw = row.additional_locations;
  const additionalLocations = Array.isArray(additionalRaw)
    ? additionalRaw.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];

  return {
    internalRequisitionNumber: row.internal_requisition_number
      ? String(row.internal_requisition_number)
      : null,
    externalRequisitionId: row.external_requisition_id ? String(row.external_requisition_id) : null,
    sourceType: (row.source_type as SourceType) || "Internal",
    placementType: placementTypeFromApiRow(
      (row.source_type as SourceType) || "Internal",
      row.placement_type,
      row.employment_type
    ),
    eorType:
      row.eor_type === "Tenant" || row.eor_type === "MSP" ? row.eor_type : null,
    mspClient: row.msp_client ? String(row.msp_client) : null,
    professionId: String(row.profession_id ?? ""),
    profession: embeddedRelationName(row.professions) || null,
    specialtyId: row.specialty_id ? String(row.specialty_id) : null,
    employmentType: (row.employment_type as EmploymentType) || "W2",
    employerOfRecord: row.employer_of_record ? String(row.employer_of_record) : null,
    department: row.department ? String(row.department) : null,
    facility: row.facility ? String(row.facility) : null,
    billRate: row.bill_rate == null ? null : Number(row.bill_rate),
    commissionPercent:
      row.commission_percent == null ? null : Number(row.commission_percent),
    commissionFixedAmount:
      row.commission_fixed_amount == null ? null : Number(row.commission_fixed_amount),
    payRateMin: row.pay_rate_min == null ? null : Number(row.pay_rate_min),
    payRateMax: row.pay_rate_max == null ? null : Number(row.pay_rate_max),
    targetStartDate: row.target_start_date ? String(row.target_start_date) : null,
    duration: row.duration ? String(row.duration) : null,
    shiftType: row.shift_type ? String(row.shift_type) : null,
    shiftDetails: row.shift_details ? String(row.shift_details) : null,
    hoursPerWeek: row.hours_per_week == null ? null : Number(row.hours_per_week),
    publicTitle: row.public_title ? String(row.public_title) : null,
    publicDescription: row.public_description ? String(row.public_description) : null,
    industryKey: row.industry_key ? String(row.industry_key) : null,
    location: row.location ? String(row.location) : null,
    postalCode: row.postal_code ? String(row.postal_code) : null,
    worksiteCity: row.worksite_city ? String(row.worksite_city) : null,
    worksiteState: row.worksite_state ? String(row.worksite_state) : null,
    worksitePostalCode: row.worksite_postal_code ? String(row.worksite_postal_code) : null,
    remoteAllowedStates: Array.isArray(row.remote_allowed_states)
      ? row.remote_allowed_states.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [],
    schedule: row.schedule ? String(row.schedule) : null,
    qualifications: row.qualifications ? String(row.qualifications) : null,
    responsibilities: row.responsibilities ? String(row.responsibilities) : null,
    benefits: row.benefits ? String(row.benefits) : null,
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
    suggestedPayRate: row.pay_rate == null ? null : Number(row.pay_rate),
    requiredCredentials: Array.isArray(row.required_credentials)
      ? row.required_credentials.map((item) => String(item ?? "").trim()).filter(Boolean).join(", ")
      : row.required_credentials
        ? String(row.required_credentials)
        : null,
    specialRequirements: row.special_requirements ? String(row.special_requirements) : null,
    internalNotes: row.internal_notes ? String(row.internal_notes) : null,
  };
}

/** Publish an existing draft/closed job from the list actions menu. */
export async function publishExistingJob(
  supabase: DbClient,
  tenantId: string,
  actorUserId: string,
  jobId: string
) {
  const { data: row, error } = await supabase
    .from("job_requisitions")
    .select("*")
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new JobValidationError("Job not found.", {}, "JOB_NOT_FOUND");

  const status = String(row.status ?? "");
  if (isOpenJobRequisitionStatus(status)) {
    throw new JobValidationError("Job is already open.", {}, "JOB_ALREADY_PUBLISHED");
  }
  if (normalizeJobRequisitionStatus(status) === "archived") {
    throw new JobValidationError("Unarchive the job before publishing.", {}, "JOB_ARCHIVED");
  }

  if (
    !isJobRequisitionOpen({
      application_deadline: row.application_deadline ? String(row.application_deadline) : null,
    })
  ) {
    throw new JobValidationError(
      "Update the application deadline before republishing this job.",
      { applicationDeadline: "Application deadline has passed." },
      "JOB_DEADLINE_EXPIRED"
    );
  }

  const result = await saveJobRequisition(
    supabase,
    tenantId,
    actorUserId,
    jobRowToInput(row as Record<string, unknown>),
    { jobId, publish: true }
  );
  return result.job;
}

/**
 * Move a job to Open. Drafts go through full publish validation;
 * paused/filled/closed use a status transition (with deadline guard).
 */
export async function openJobRequisition(
  supabase: DbClient,
  tenantId: string,
  actorUserId: string,
  jobId: string
) {
  const { data: row, error } = await supabase
    .from("job_requisitions")
    .select("id, status, application_deadline, published_at, closed_at, archived_at")
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new JobValidationError("Job not found.", {}, "JOB_NOT_FOUND");

  const current = normalizeJobRequisitionStatus(String(row.status ?? ""));
  if (current === "open") {
    return {
      id: row.id,
      status: "open" as const,
      published_at: row.published_at,
      closed_at: row.closed_at,
      archived_at: row.archived_at,
    };
  }
  if (current === "draft") {
    return publishExistingJob(supabase, tenantId, actorUserId, jobId);
  }
  if (current === "archived") {
    throw new JobValidationError("Unarchive the job before opening.", {}, "JOB_ARCHIVED");
  }

  if (
    !isJobRequisitionOpen({
      application_deadline: row.application_deadline ? String(row.application_deadline) : null,
    })
  ) {
    throw new JobValidationError(
      "Update the application deadline before reopening this job.",
      { applicationDeadline: "Application deadline has passed." },
      "JOB_DEADLINE_EXPIRED"
    );
  }

  return transitionJobStatus(supabase, tenantId, actorUserId, jobId, "open");
}

/**
 * Partial update for FSD PUT /requisitions/{id}: status, assignee, tags, is_hot.
 */
export async function patchJobRequisition(
  supabase: DbClient,
  tenantId: string,
  actorUserId: string,
  jobId: string,
  patch: JobRequisitionPatchInput
) {
  const { data: existing, error: existingError } = await supabase
    .from("job_requisitions")
    .select(
      "id, status, application_deadline, published_at, closed_at, archived_at, assigned_recruiter_user_id, tags, is_hot"
    )
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new JobValidationError("Job not found.", {}, "JOB_NOT_FOUND");

  let latest: Record<string, unknown> = { ...existing };

  if (patch.status !== undefined) {
    const target = normalizeJobRequisitionStatus(String(patch.status));
    if (target === "open") {
      latest = {
        ...(await openJobRequisition(supabase, tenantId, actorUserId, jobId)),
      } as Record<string, unknown>;
    } else {
      latest = {
        ...(await transitionJobStatus(supabase, tenantId, actorUserId, jobId, target)),
      } as Record<string, unknown>;
    }
  }

  const fieldPatch: Record<string, unknown> = {
    updated_by: actorUserId,
  };
  let hasFieldPatch = false;

  if (patch.assignee !== undefined) {
    fieldPatch.assigned_recruiter_user_id = patch.assignee;
    hasFieldPatch = true;
  }
  if (patch.tags !== undefined) {
    fieldPatch.tags = normalizeJobTags(patch.tags);
    hasFieldPatch = true;
  }
  if (patch.isHot !== undefined) {
    fieldPatch.is_hot = patch.isHot;
    hasFieldPatch = true;
  }

  if (hasFieldPatch) {
    const { data, error } = await supabase
      .from("job_requisitions")
      .update(fieldPatch)
      .eq("id", jobId)
      .eq("tenant_id", tenantId)
      .select(
        "id, status, published_at, closed_at, archived_at, assigned_recruiter_user_id, tags, is_hot"
      )
      .single();
    if (error) throw error;
    latest = data as Record<string, unknown>;
  }

  return {
    id: String(latest.id),
    status: normalizeJobRequisitionStatus(String(latest.status ?? "")),
    published_at: latest.published_at ?? null,
    closed_at: latest.closed_at ?? null,
    archived_at: latest.archived_at ?? null,
    assigned_recruiter_user_id:
      latest.assigned_recruiter_user_id == null
        ? null
        : String(latest.assigned_recruiter_user_id),
    tags: normalizeJobTags(latest.tags),
    is_hot: Boolean(latest.is_hot),
  };
}

/** FSD: Draft copy of a job with no applicants; new public token on publish. */
export async function duplicateJobRequisition(
  supabase: DbClient,
  tenantId: string,
  actorUserId: string,
  jobId: string
) {
  const { data: source, error } = await supabase
    .from("job_requisitions")
    .select("*")
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!source) throw new JobValidationError("Job not found.", {}, "JOB_NOT_FOUND");

  await assertTenantCanOperate(supabase, tenantId);

  const sourceRow = source as Record<string, unknown>;
  // Identity / lifecycle fields must not be copied — job_number & idempotency_key are unique.
  const omitKeys = new Set([
    "id",
    "created_at",
    "updated_at",
    "published_at",
    "closed_at",
    "archived_at",
    "public_job_token",
    "created_by",
    "updated_by",
    "job_number",
    "idempotency_key",
    "approved_at",
    "approved_by",
    "rejected_at",
    "rejection_reason",
  ]);

  const insertRow: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sourceRow)) {
    if (omitKeys.has(key)) continue;
    insertRow[key] = value;
  }

  const baseTitle = String(
    sourceRow.public_title ?? sourceRow.source_job_title ?? sourceRow.title ?? "Untitled job"
  ).trim();
  const copyTitle = baseTitle.toLowerCase().endsWith("(copy)")
    ? baseTitle
    : `${baseTitle} (Copy)`;

  insertRow.tenant_id = tenantId;
  insertRow.status = "draft";
  insertRow.is_published = false;
  insertRow.public_title = copyTitle;
  if (insertRow.title != null) insertRow.title = copyTitle;
  if (sourceRow.source_type === "MSP" && insertRow.source_job_title != null) {
    insertRow.source_job_title = copyTitle;
  }
  insertRow.public_job_token = null;
  insertRow.published_at = null;
  insertRow.closed_at = null;
  insertRow.archived_at = null;
  insertRow.created_by = actorUserId;
  insertRow.updated_by = actorUserId;
  insertRow.tags = normalizeJobTags(sourceRow.tags);
  insertRow.is_hot = false;
  insertRow.hot_job = false;
  insertRow.filled_positions = 0;
  // Avoid unique MSP external-id collisions on the draft copy.
  insertRow.external_req_id = null;
  insertRow.external_requisition_id = null;
  // FSD: draft copy — clear assignee.
  insertRow.assigned_recruiter_user_id = null;
  insertRow.assigned_recruiter = null;

  const { data: created, error: createError } = await supabase
    .from("job_requisitions")
    .insert(insertRow)
    .select("id, status, public_title, source_job_title, assigned_recruiter_user_id, tags, is_hot")
    .single();
  if (createError) throw createError;

  const newJobId = String(created.id);
  const screening = await loadJobScreeningQuestions(supabase, tenantId, jobId);
  if (screening.length) {
    await syncJobScreeningQuestions(supabase, {
      tenantId,
      jobId: newJobId,
      actorUserId,
      questions: screening.map((row) => {
        const input = jobScreeningQuestionToInput(row);
        return { ...input, id: null };
      }),
    });
  }

  return created;
}

export async function listInternalJobs(
  supabase: DbClient,
  tenantId: string,
  filters: {
    status?: JobStatus;
    professionId?: string;
    employmentType?: string;
    createdBy?: string;
  } = {}
) {
  let query = supabase
    .from("job_requisitions")
    .select(
      "id, internal_requisition_number, external_requisition_id, public_title, public_job_token, profession_id, specialty_id, employment_type, source_type, placement_type, msp_name, msp_client, source_job_title, status, is_hot, tags, assigned_recruiter_user_id, workflow_id, created_by, created_at, published_at, location, facility, facility_name, application_deadline, location_type, schedule, shift_type, pay_rate_min, pay_rate_max, pay_rate_period, rate_unit, pay_rate, show_pay_by, commission_percent, commission_fixed_amount, qualifications, public_description, responsibilities, special_requirements, required_credentials, industry_key, professions(name), specialties(name), onboarding_flows!workflow_id(name)"
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (filters.status) {
    if (filters.status === "open") {
      query = query.in("status", [...PUBLIC_ACCEPTING_JOB_STATUS_QUERY]);
    } else {
      query = query.eq("status", filters.status);
    }
  }
  if (filters.professionId) query = query.eq("profession_id", filters.professionId);
  if (filters.employmentType) query = query.eq("employment_type", filters.employmentType);
  if (filters.createdBy) query = query.eq("created_by", filters.createdBy);

  const metricsQuery = supabase.rpc("job_list_application_metrics", {
    p_tenant_id: tenantId,
  });
  const [{ data, error }, metricsResult] = await Promise.all([query, metricsQuery]);
  if (error) throw error;
  if (metricsResult.error) throw metricsResult.error;
  const jobs = data ?? [];
  if (!jobs.length) return jobs;

  const metricsByJob = new Map<
    string,
    {
      applicant_count?: number;
      new_count?: number;
      in_process_count?: number;
      analyzed_count?: number;
      strong_count?: number;
      ready_count?: number;
      hired_count?: number;
      in_process_redirect_tab?: string | null;
    }
  >();
  for (const row of metricsResult.data ?? []) {
    const jobId = String((row as { job_requisition_id?: string }).job_requisition_id ?? "");
    if (jobId) metricsByJob.set(jobId, row as {
      applicant_count?: number;
      new_count?: number;
      in_process_count?: number;
      analyzed_count?: number;
      strong_count?: number;
      ready_count?: number;
      hired_count?: number;
      in_process_redirect_tab?: string | null;
    });
  }

  const creatorIds = jobs
    .map((job) => (job as { created_by?: string | null }).created_by)
    .filter((id): id is string => Boolean(id));
  const creatorsById = await loadStaffUsersByIds(supabase, tenantId, creatorIds);

  return jobs.map((job) => {
    const metrics = metricsByJob.get(String(job.id));
    const createdByUserId = (job as { created_by?: string | null }).created_by;
    return capJobListBodyFields({
      ...job,
      status: normalizeJobRequisitionStatus(String(job.status ?? "")),
      is_hot: Boolean((job as { is_hot?: boolean | null }).is_hot),
      tags: normalizeJobTags((job as { tags?: unknown }).tags),
      assigned_recruiter_user_id:
        (job as { assigned_recruiter_user_id?: string | null }).assigned_recruiter_user_id ?? null,
      job_applications: [{ count: Number(metrics?.applicant_count ?? 0) }],
      new_application_count: Number(metrics?.new_count ?? 0),
      in_process_application_count: Number(metrics?.in_process_count ?? 0),
      in_process_redirect_tab: metrics?.in_process_redirect_tab ?? null,
      analyzed_application_count: Number(metrics?.analyzed_count ?? 0),
      strong_match_count: Number(metrics?.strong_count ?? 0),
      ready_to_submit_count: Number(metrics?.ready_count ?? 0),
      hired_application_count: Number(metrics?.hired_count ?? 0),
      createdBy: createdByUserId
        ? creatorsById.get(String(createdByUserId)) ?? null
        : null,
    });
  });
}

export async function listPublicJobs(
  supabase: DbClient,
  tenantId: string,
  filters: {
    query?: string;
    professionId?: string;
    specialtyId?: string;
    location?: string;
    employmentType?: string;
    locationType?: string;
    page?: number;
    pageSize?: number;
  } = {}
) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, filters.pageSize ?? 12));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const today = new Date().toISOString().slice(0, 10);

  let query = supabase
    .from("job_requisitions")
    .select(
      "id, public_job_token, public_title, source_job_title, source_type, public_description, location, location_type, schedule, employment_type, pay_rate_min, pay_rate_max, pay_rate, pay_rate_period, rate_unit, show_pay_by, compensation_type, currency, qualifications, responsibilities, benefits, application_deadline, published_at, updated_at, profession_id, specialty_id, workflow_id, professions(name), specialties(name)",
      { count: "exact" }
    )
    .eq("tenant_id", tenantId)
    .in("status", [...PUBLIC_ACCEPTING_JOB_STATUS_QUERY])
    // Public board requires a token; avoid neq("") which breaks uuid-typed columns.
    .not("public_job_token", "is", null)
    // MSP jobs publish without workflow_id; still list them on the public board.
    .or(`application_deadline.is.null,application_deadline.gte.${today}`)
    // Prefer latest activity so "Most recent" matches Posted/Updated labels on cards.
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (filters.query?.trim()) {
    for (const orFilter of buildPublicJobsKeywordOrFilters(filters.query)) {
      query = query.or(orFilter);
    }
  }
  if (filters.professionId) query = query.eq("profession_id", filters.professionId);
  if (filters.specialtyId) query = query.eq("specialty_id", filters.specialtyId);
  const locationOr = buildPublicJobsLocationOrFilter(filters.location ?? "");
  if (locationOr) query = query.or(locationOr);
  if (filters.employmentType) query = query.eq("employment_type", filters.employmentType);
  const workplaceOr = buildPublicJobsWorkplaceTypeOrFilter(filters.locationType ?? "");
  if (workplaceOr) query = query.or(workplaceOr);

  const { data, error, count } = await query;
  if (error) throw error;
  const jobs = (data ?? []).filter((job) =>
    Boolean(normalizeJobToken(job.public_job_token ? String(job.public_job_token) : null))
  );
  return { jobs, total: count ?? jobs.length, page, pageSize };
}

export async function getPublishedJobByToken(
  supabase: DbClient,
  tenantId: string,
  token: string
) {
  const { data, error } = await supabase
    .from("job_requisitions")
    .select(
      "id, tenant_id, public_job_token, public_title, source_job_title, source_type, public_description, location, location_type, schedule, employment_type, pay_rate_min, pay_rate_max, pay_rate, pay_rate_period, rate_unit, show_pay_by, compensation_type, currency, qualifications, responsibilities, benefits, application_deadline, published_at, updated_at, profession_id, specialty_id, workflow_id, professions(name), specialties(name)"
    )
    .eq("tenant_id", tenantId)
    .eq("public_job_token", token)
    .in("status", [...PUBLIC_ACCEPTING_JOB_STATUS_QUERY])
    // MSP jobs are intentionally published without workflow_id; public detail still shows.
    .maybeSingle();
  if (error) throw error;
  if (!data || !isJobRequisitionOpen(data)) return null;
  return data;
}

type StartApplicationInput = {
  tenantId: string;
  jobToken: string;
  applicantAuthUserId: string;
  workerId?: string | null;
  email?: string | null;
  workLocation?: ServiceAreaLocation | null;
};

export async function startOrResumeJobApplication(
  supabase: DbClient,
  input: StartApplicationInput
) {
  const { data: job, error: jobError } = await supabase
    .from("job_requisitions")
    .select("id, tenant_id, workflow_id, status")
    .eq("tenant_id", input.tenantId)
    .eq("public_job_token", input.jobToken)
    .in("status", [...PUBLIC_ACCEPTING_JOB_STATUS_QUERY])
    .maybeSingle();
  if (jobError) throw jobError;
  if (!job?.workflow_id) {
    throw new JobValidationError(
      "This job is unavailable or no longer accepting applications.",
      {},
      "JOB_UNAVAILABLE"
    );
  }

  let assignedFlow;
  try {
    assignedFlow = await resolvePublishedFlowForJobWorkflow(
      supabase,
      input.tenantId,
      String(job.workflow_id)
    );
  } catch (error) {
    throw new JobValidationError(
      error instanceof Error
        ? error.message
        : "The workflow assigned to this job is unavailable.",
      {},
      "WORKFLOW_UNAVAILABLE"
    );
  }

  const workflowId = assignedFlow.id;
  const snapshot = assignedFlow.builderDraft ?? { nodes: [], edges: [] };
  const workflowVersion = String(assignedFlow.updatedAt ?? new Date().toISOString());
  const workflowName = String(assignedFlow.name ?? "Assigned Workflow");

  const normalizedEmail = input.email ? normalizeApplicantEmail(input.email) : null;

  // Resolve existing applicant_profiles by worker_id, auth_user_id, then email.
  // Looking up by email alone can miss an existing auth_user_id row and cause
  // applicant_profiles_tenant_auth_uidx on insert when applying to another job.
  let profileId: string | null = null;

  if (input.workerId) {
    const { data: byWorker, error: byWorkerError } = await supabase
      .from("applicant_profiles")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("worker_id", input.workerId)
      .maybeSingle();
    if (byWorkerError) throw byWorkerError;
    if (byWorker?.id) profileId = String(byWorker.id);
  }

  if (!profileId) {
    const { data: byAuth, error: byAuthError } = await supabase
      .from("applicant_profiles")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("auth_user_id", input.applicantAuthUserId)
      .maybeSingle();
    if (byAuthError) throw byAuthError;
    if (byAuth?.id) profileId = String(byAuth.id);
  }

  if (!profileId && normalizedEmail) {
    const { data: byEmail, error: byEmailError } = await supabase
      .from("applicant_profiles")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("normalized_email", normalizedEmail)
      .maybeSingle();
    if (byEmailError) throw byEmailError;
    if (byEmail?.id) profileId = String(byEmail.id);
  }

  if (!profileId) {
    const { data: profile, error: profileError } = await supabase
      .from("applicant_profiles")
      .insert({
        tenant_id: input.tenantId,
        auth_user_id: input.applicantAuthUserId,
        worker_id: input.workerId ?? null,
        email: input.email?.trim() || null,
        normalized_email: normalizedEmail,
      })
      .select("id")
      .single();

    if (profileError) {
      const isDuplicate =
        profileError.code === "23505" ||
        /duplicate key|unique constraint/i.test(String(profileError.message ?? ""));
      if (!isDuplicate) throw profileError;

      const { data: racedByAuth } = await supabase
        .from("applicant_profiles")
        .select("id")
        .eq("tenant_id", input.tenantId)
        .eq("auth_user_id", input.applicantAuthUserId)
        .maybeSingle();
      if (racedByAuth?.id) {
        profileId = String(racedByAuth.id);
      } else if (input.workerId) {
        const { data: racedByWorker } = await supabase
          .from("applicant_profiles")
          .select("id")
          .eq("tenant_id", input.tenantId)
          .eq("worker_id", input.workerId)
          .maybeSingle();
        if (racedByWorker?.id) profileId = String(racedByWorker.id);
      }

      if (!profileId && normalizedEmail) {
        const { data: racedByEmail } = await supabase
          .from("applicant_profiles")
          .select("id")
          .eq("tenant_id", input.tenantId)
          .eq("normalized_email", normalizedEmail)
          .maybeSingle();
        if (racedByEmail?.id) profileId = String(racedByEmail.id);
      }

      if (!profileId) throw profileError;
    } else {
      profileId = String(profile.id);
    }
  }

  if (profileId) {
    const { error: profileUpdateError } = await supabase
      .from("applicant_profiles")
      .update({
        auth_user_id: input.applicantAuthUserId,
        worker_id: input.workerId ?? undefined,
        email: input.email?.trim() || undefined,
        normalized_email: normalizedEmail ?? undefined,
      })
      .eq("id", profileId)
      .eq("tenant_id", input.tenantId);
    if (profileUpdateError) throw profileUpdateError;
  }

  if (!profileId) {
    throw new JobValidationError("Could not resolve applicant profile.", {}, "PROFILE_REQUIRED");
  }

  const { data: existingApplication, error: existingError } = await supabase
    .from("job_applications")
    .select("id, applicant_workflow_instance_id, status")
    .eq("tenant_id", input.tenantId)
    .eq("job_requisition_id", job.id)
    .eq("applicant_profile_id", profileId)
    .not("status", "in", '("rejected","withdrawn")')
    .maybeSingle();
  if (existingError) throw existingError;
  if (existingApplication) {
    await requireApplyWorkLocation(supabase, {
      tenantId: input.tenantId,
      jobId: String(job.id),
      applicantId: profileId,
      createdBy: input.applicantAuthUserId,
      location: input.workLocation ?? null,
    });
    return { application: existingApplication, resumed: true };
  }

  // Also check by worker_id when available (DB unique job_applications_worker_job_uidx)
  if (input.workerId) {
    const { data: byWorker, error: byWorkerError } = await supabase
      .from("job_applications")
      .select("id, applicant_workflow_instance_id, status")
      .eq("tenant_id", input.tenantId)
      .eq("job_requisition_id", job.id)
      .eq("worker_id", input.workerId)
      .not("status", "in", '("rejected","withdrawn")')
      .maybeSingle();
    if (byWorkerError) throw byWorkerError;
    if (byWorker) {
      await requireApplyWorkLocation(supabase, {
        tenantId: input.tenantId,
        jobId: String(job.id),
        applicantId: profileId,
        createdBy: input.applicantAuthUserId,
        location: input.workLocation ?? null,
      });
      return { application: byWorker, resumed: true };
    }
  }

  await requireApplyWorkLocation(supabase, {
    tenantId: input.tenantId,
    jobId: String(job.id),
    applicantId: profileId,
    createdBy: input.applicantAuthUserId,
    location: input.workLocation ?? null,
  });

  const { data: application, error: applicationError } = await supabase
    .from("job_applications")
    .insert({
      tenant_id: input.tenantId,
      job_requisition_id: job.id,
      applicant_profile_id: profileId,
      applicant_auth_user_id: input.applicantAuthUserId,
      worker_id: input.workerId ?? null,
      workflow_id: workflowId,
      assigned_recruiter_user_id: null,
    })
    .select("id, status")
    .single();

  if (applicationError) {
    // Concurrent duplicate apply: return existing active application
    const isDuplicate =
      applicationError.code === "23505" ||
      /duplicate key|unique constraint/i.test(String(applicationError.message ?? ""));
    if (isDuplicate) {
      const { data: raced } = await supabase
        .from("job_applications")
        .select("id, applicant_workflow_instance_id, status")
        .eq("tenant_id", input.tenantId)
        .eq("job_requisition_id", job.id)
        .eq("applicant_profile_id", profileId)
        .not("status", "in", '("rejected","withdrawn")')
        .maybeSingle();
      if (raced) return { application: raced, resumed: true };
    }
    throw applicationError;
  }

  // Prefer the job-application schema; include legacy columns when present on staging.
  const instancePayload = {
    tenant_id: input.tenantId,
    application_id: application.id,
    workflow_id: workflowId,
    worker_id: input.workerId ?? null,
    job_requisition_id: job.id,
    onboarding_flow_id: workflowId,
    workflow_name: workflowName,
    workflow_snapshot: snapshot,
    workflow_version: workflowVersion,
    status: "in_progress" as const,
  };

  let { data: instance, error: instanceError } = await supabase
    .from("applicant_workflow_instances")
    .insert(instancePayload)
    .select("id")
    .single();

  if (instanceError) {
    const message = String(instanceError.message ?? "");
    const unknownLegacyColumn = /onboarding_flow_id|job_requisition_id|Could not find/i.test(
      message
    );
    if (unknownLegacyColumn) {
      const retry = await supabase
        .from("applicant_workflow_instances")
        .insert({
          tenant_id: input.tenantId,
          application_id: application.id,
          workflow_id: workflowId,
          workflow_name: workflowName,
          workflow_snapshot: snapshot,
          workflow_version: workflowVersion,
          status: "in_progress",
        })
        .select("id")
        .single();
      instance = retry.data;
      instanceError = retry.error;
    }
  }

  if (instanceError || !instance?.id) {
    await supabase.from("job_applications").delete().eq("id", application.id);
    throw instanceError ?? new Error("Failed to create applicant workflow instance.");
  }

  const nodes = snapshotNodes(snapshot);
  if (nodes.length) {
    const stepRows = nodes.map((node, index) =>
      buildStepRecordRow(input.tenantId, instance.id, node, index)
    );
    const { error: stepsError } = await supabase
      .from("applicant_workflow_step_records")
      .insert(stepRows);
    if (stepsError) throw stepsError;
  }

  const { data: linked, error: linkError } = await supabase
    .from("job_applications")
    .update({ applicant_workflow_instance_id: instance.id })
    .eq("id", application.id)
    .eq("tenant_id", input.tenantId)
    .select("id, applicant_workflow_instance_id, status")
    .single();
  if (linkError) throw linkError;

  return { application: linked, resumed: false };
}

function splitCandidateFullName(fullName: string): { firstName: string; lastName: string | null } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export async function attachWorkflowInstanceToApplication(
  supabase: DbClient,
  input: {
    tenantId: string;
    applicationId: string;
    jobRequisitionId: string;
    workflowId: string;
    workerId?: string | null;
    flow: { name?: string | null; builder_draft?: unknown; updated_at?: string | null };
  }
) {
  const snapshot = input.flow.builder_draft ?? { nodes: [], edges: [] };
  const workflowVersion = String(input.flow.updated_at ?? new Date().toISOString());
  const workflowName = String(input.flow.name ?? "Workflow");

  const instancePayload = {
    tenant_id: input.tenantId,
    application_id: input.applicationId,
    workflow_id: input.workflowId,
    worker_id: input.workerId ?? null,
    job_requisition_id: input.jobRequisitionId,
    onboarding_flow_id: input.workflowId,
    workflow_name: workflowName,
    workflow_snapshot: snapshot,
    workflow_version: workflowVersion,
    status: "in_progress" as const,
  };

  let { data: instance, error: instanceError } = await supabase
    .from("applicant_workflow_instances")
    .insert(instancePayload)
    .select("id")
    .single();

  if (instanceError) {
    const message = String(instanceError.message ?? "");
    const unknownLegacyColumn = /onboarding_flow_id|job_requisition_id|Could not find/i.test(
      message
    );
    if (unknownLegacyColumn) {
      const retry = await supabase
        .from("applicant_workflow_instances")
        .insert({
          tenant_id: input.tenantId,
          application_id: input.applicationId,
          workflow_id: input.workflowId,
          workflow_name: workflowName,
          workflow_snapshot: snapshot,
          workflow_version: workflowVersion,
          status: "in_progress",
        })
        .select("id")
        .single();
      instance = retry.data;
      instanceError = retry.error;
    }
  }

  if (instanceError || !instance?.id) {
    throw instanceError ?? new Error("Failed to create applicant workflow instance.");
  }

  const nodes = snapshotNodes(snapshot);
  if (nodes.length) {
    const stepRows = nodes.map((node, index) =>
      buildStepRecordRow(input.tenantId, instance.id, node, index)
    );
    const { error: stepsError } = await supabase
      .from("applicant_workflow_step_records")
      .insert(stepRows);
    if (stepsError) throw stepsError;
  }

  const { data: linked, error: linkError } = await supabase
    .from("job_applications")
    .update({ applicant_workflow_instance_id: instance.id })
    .eq("id", input.applicationId)
    .eq("tenant_id", input.tenantId)
    .select("id, applicant_workflow_instance_id, status, job_requisition_id, applicant_profile_id")
    .single();
  if (linkError) throw linkError;
  return linked;
}

export type CreateAdminCandidateInput = {
  tenantId: string;
  jobRequisitionId: string;
  name: string;
  email: string;
  phone?: string | null;
  streetAddress?: string | null;
  cityStateZip?: string | null;
  country?: string | null;
  lastJobTitle?: string | null;
  lastCompany?: string | null;
  createdByStaffUserId?: string | null;
  resumePath?: string | null;
  resumeFileName?: string | null;
  workLocation?: ServiceAreaLocation | null;
};

/**
 * Admin "Add candidate": create/update applicant_profiles + job_applications (status new)
 * so the candidate appears in the job's candidates listing.
 */
/** Active (not rejected/withdrawn) application for this applicant profile on this job, if any. */
export async function findActiveApplicationForJob(
  supabase: DbClient,
  input: { tenantId: string; jobRequisitionId: string; applicantProfileId: string }
): Promise<{ id: string; worker_id: string | null } | null> {
  const { data, error } = await supabase
    .from("job_applications")
    .select("id, worker_id")
    .eq("tenant_id", input.tenantId)
    .eq("job_requisition_id", input.jobRequisitionId)
    .eq("applicant_profile_id", input.applicantProfileId)
    .not("status", "in", '("rejected","withdrawn")')
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) return null;
  return {
    id: String(data.id),
    worker_id: data.worker_id != null ? String(data.worker_id) : null,
  };
}

async function assertNoActiveApplicationForJob(
  supabase: DbClient,
  input: { tenantId: string; jobRequisitionId: string; applicantProfileId: string }
): Promise<void> {
  if (await findActiveApplicationForJob(supabase, input)) {
    throw new JobValidationError(
      "This candidate already has an application for this job.",
      { email: "A candidate with this email already applied for this job." },
      "DUPLICATE_APPLICATION"
    );
  }
}

export async function createAdminJobApplication(
  supabase: DbClient,
  input: CreateAdminCandidateInput
) {
  const email = input.email.trim();
  const normalizedEmail = normalizeApplicantEmail(email);
  const fullName = input.name.trim();
  if (!fullName) {
    throw new JobValidationError("Name is required.", { name: "Name is required." }, "NAME_REQUIRED");
  }
  if (!normalizedEmail) {
    throw new JobValidationError("Email is required.", { email: "Email is required." }, "EMAIL_REQUIRED");
  }

  const { data: job, error: jobError } = await supabase
    .from("job_requisitions")
    .select("id, tenant_id, workflow_id, status, public_title")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.jobRequisitionId)
    .maybeSingle();
  if (jobError) throw jobError;
  if (!job?.workflow_id) {
    throw new JobValidationError(
      "This job is unavailable or has no workflow assigned.",
      {},
      "JOB_UNAVAILABLE"
    );
  }
  if (!isOpenJobRequisitionStatus(String(job.status))) {
    throw new JobValidationError(
      "Only open jobs can accept candidates. Open the job first.",
      {},
      "JOB_NOT_PUBLISHED"
    );
  }

  await assertTenantCanOperate(supabase, input.tenantId);

  if (!input.workLocation) {
    throw new JobValidationError(
      "Where will they work this assignment?",
      { work_state: "Work location is required." },
      "incomplete_location"
    );
  }
  const attachDecision = await evaluateServiceAreaWithDb(
    supabase,
    {
      tenantId: input.tenantId,
      jobId: input.jobRequisitionId,
      action: "attach_candidate",
      location: input.workLocation,
    },
    { createdBy: input.createdByStaffUserId }
  );
  await recordWorkLocationConfirmation(supabase, {
    tenantId: input.tenantId,
    jobId: input.jobRequisitionId,
    source: "recruiter_upload",
    location: input.workLocation,
    decision: attachDecision,
    createdBy: input.createdByStaffUserId,
  });
  if (!attachDecision.allowed) {
    throw new JobValidationError(
      serviceAreaMessage("attach_blocked"),
      { work_state: serviceAreaMessage("location_not_enabled") },
      attachDecision.reasonCode
    );
  }

  let assignedFlow;
  try {
    assignedFlow = await resolvePublishedFlowForJobWorkflow(
      supabase,
      input.tenantId,
      String(job.workflow_id)
    );
  } catch (error) {
    throw new JobValidationError(
      error instanceof Error
        ? error.message
        : "The workflow assigned to this job is unavailable.",
      {},
      "WORKFLOW_UNAVAILABLE"
    );
  }

  const workflowId = assignedFlow.id;

  const { firstName, lastName } = splitCandidateFullName(fullName);
  const profileFields = {
    email,
    normalized_email: normalizedEmail,
    first_name: firstName,
    last_name: lastName,
    phone: clean(input.phone),
    street_address: clean(input.streetAddress),
    city_state_zip: clean(input.cityStateZip),
    country: clean(input.country),
    last_job_title: clean(input.lastJobTitle),
    last_company: clean(input.lastCompany),
    resume_path: clean(input.resumePath),
    resume_file_name: clean(input.resumeFileName),
    updated_at: new Date().toISOString(),
  };

  const { data: existingProfile, error: profileLookupError } = await supabase
    .from("applicant_profiles")
    .select("id, worker_id")
    .eq("tenant_id", input.tenantId)
    .eq("normalized_email", normalizedEmail)
    .maybeSingle();
  if (profileLookupError) throw profileLookupError;

  let profileId = existingProfile?.id ? String(existingProfile.id) : null;
  let linkedWorkerId = existingProfile?.worker_id ? String(existingProfile.worker_id) : null;
  // Reject duplicates before touching the profile so a retried add cannot repoint resume_path.
  if (profileId) {
    await assertNoActiveApplicationForJob(supabase, {
      tenantId: input.tenantId,
      jobRequisitionId: String(job.id),
      applicantProfileId: profileId,
    });
  }
  if (!profileId) {
    const { data: profile, error: profileError } = await supabase
      .from("applicant_profiles")
      .insert({
        tenant_id: input.tenantId,
        ...profileFields,
      })
      .select("id, worker_id")
      .single();
    if (profileError) throw profileError;
    profileId = String(profile.id);
    linkedWorkerId = profile.worker_id ? String(profile.worker_id) : null;
  } else {
    const { error: profileUpdateError } = await supabase
      .from("applicant_profiles")
      .update(profileFields)
      .eq("id", profileId)
      .eq("tenant_id", input.tenantId);
    if (profileUpdateError) throw profileUpdateError;
  }

  try {
    const linked = await ensureAdminCandidateWorker(supabase, {
      tenantId: input.tenantId,
      applicantProfileId: profileId,
      existingWorkerId: linkedWorkerId,
      email,
      firstName,
      lastName,
      phone: input.phone,
      streetAddress: input.streetAddress,
      cityStateZip: input.cityStateZip,
      lastJobTitle: input.lastJobTitle,
      resumePath: input.resumePath,
    });
    linkedWorkerId = linked.workerId;
  } catch (workerError) {
    throw new JobValidationError(
      workerError instanceof Error ? workerError.message : "Failed to link candidate profile",
      { email: workerError instanceof Error ? workerError.message : "Failed to link candidate profile" },
      "WORKER_LINK_FAILED"
    );
  }

  await assertNoActiveApplicationForJob(supabase, {
    tenantId: input.tenantId,
    jobRequisitionId: String(job.id),
    applicantProfileId: profileId,
  });

  const nowIso = new Date().toISOString();
  const { data: application, error: applicationError } = await supabase
    .from("job_applications")
    .insert({
      tenant_id: input.tenantId,
      job_requisition_id: job.id,
      applicant_profile_id: profileId,
      workflow_id: workflowId,
      worker_id: linkedWorkerId,
      status: "new",
      submitted_at: nowIso,
      source: "admin",
      created_by_staff_user_id: input.createdByStaffUserId ?? null,
      assigned_recruiter_user_id: null,
    })
    .select("id, status, job_requisition_id, applicant_profile_id, worker_id")
    .single();
  if (applicationError) throw applicationError;

  try {
    const linked = await attachWorkflowInstanceToApplication(supabase, {
      tenantId: input.tenantId,
      applicationId: String(application.id),
      jobRequisitionId: String(job.id),
      workflowId,
      workerId: linkedWorkerId,
      flow: {
        name: assignedFlow.name,
        builder_draft: assignedFlow.builderDraft,
        updated_at: assignedFlow.updatedAt,
      },
    });

    // Attach any worker-level requirements row to this application when still unscoped
    if (linkedWorkerId) {
      await supabase
        .from("worker_requirements")
        .update({ application_id: String(application.id), updated_at: nowIso })
        .eq("worker_id", linkedWorkerId)
        .eq("tenant_id", input.tenantId)
        .is("application_id", null);
    }

    return {
      application: linked,
      applicantProfileId: profileId,
      jobTitle: String(job.public_title ?? ""),
    };
  } catch (error) {
    await supabase.from("job_applications").delete().eq("id", application.id);
    throw error;
  }
}

const MAX_BULK_DELETE_COUNT = 100;

function normalizeBulkDeleteIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const unique = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
  return unique.slice(0, MAX_BULK_DELETE_COUNT);
}

export function parseBulkDeleteIds(ids: unknown): string[] {
  return normalizeBulkDeleteIds(ids);
}

export async function bulkDeleteJobApplications(
  supabase: DbClient,
  tenantId: string,
  ids: string[]
): Promise<{ deletedIds: string[]; workerIds: string[] }> {
  const normalized = normalizeBulkDeleteIds(ids);
  if (!normalized.length) return { deletedIds: [], workerIds: [] };

  // Capture worker ids before deleting applications so callers can remove orphan candidates.
  const { data: beforeRows, error: beforeError } = await supabase
    .from("job_applications")
    .select("id, worker_id")
    .in("id", normalized)
    .eq("tenant_id", tenantId);

  if (beforeError) throw beforeError;

  const workerIds = [
    ...new Set(
      (beforeRows ?? [])
        .map((row) => String(row.worker_id ?? "").trim())
        .filter(Boolean)
    ),
  ];

  const { data, error } = await supabase
    .from("job_applications")
    .delete()
    .in("id", normalized)
    .eq("tenant_id", tenantId)
    .select("id");

  if (error) throw error;
  return {
    deletedIds: (data ?? []).map((row) => String(row.id)),
    workerIds,
  };
}

/**
 * After applications are deleted, hard-delete any workers that no longer have applications.
 * Keeps Candidates list in sync with Applications "Delete candidate".
 */
export async function deleteOrphanWorkersAfterApplicationDelete(
  supabase: DbClient,
  tenantId: string,
  workerIds: string[]
): Promise<{ deletedWorkerIds: string[] }> {
  const normalized = normalizeBulkDeleteIds(workerIds);
  if (!normalized.length) return { deletedWorkerIds: [] };

  const { data: remainingApps, error: remainingError } = await supabase
    .from("job_applications")
    .select("worker_id")
    .in("worker_id", normalized)
    .eq("tenant_id", tenantId);

  if (remainingError) throw remainingError;

  const stillLinked = new Set(
    (remainingApps ?? [])
      .map((row) => String(row.worker_id ?? "").trim())
      .filter(Boolean)
  );
  const orphanWorkerIds = normalized.filter((id) => !stillLinked.has(id));
  if (!orphanWorkerIds.length) return { deletedWorkerIds: [] };

  const { bulkDeleteWorkers } = await import("@/lib/workers/bulk-delete-workers");
  const result = await bulkDeleteWorkers(supabase, tenantId, orphanWorkerIds);
  return { deletedWorkerIds: result.deletedIds };
}

export async function bulkDeleteJobRequisitions(
  supabase: DbClient,
  tenantId: string,
  ids: string[]
): Promise<{ deletedIds: string[] }> {
  const normalized = normalizeBulkDeleteIds(ids);
  if (!normalized.length) return { deletedIds: [] };

  // Remove linked applications first so delete works even when the DB FK is still RESTRICT
  // (staging missed the ON DELETE CASCADE migration). Child rows cascade from applications.
  const { error: applicationsError } = await supabase
    .from("job_applications")
    .delete()
    .in("job_requisition_id", normalized)
    .eq("tenant_id", tenantId);

  if (applicationsError) throw applicationsError;

  const { data, error } = await supabase
    .from("job_requisitions")
    .delete()
    .in("id", normalized)
    .eq("tenant_id", tenantId)
    .select("id");

  if (error) throw error;
  return { deletedIds: (data ?? []).map((row) => String(row.id)) };
}

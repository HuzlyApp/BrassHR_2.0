"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Minus, Plus, X } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import type { EmploymentType, JobRequisitionInput, SourceType } from "@/lib/jobs/types";
import { isMspRecruitAndRelease } from "@/lib/jobs/placement";
import { isRemoteJobLocationType } from "@/lib/service-area/location-type";
import { JobDescriptionEditor } from "./JobDescriptionEditor";
import { JobTypeChipSelect } from "./JobTypeChipSelect";
import { BenefitsChipSelect } from "./BenefitsChipSelect";
import JobLocationAutocompleteField from "./JobLocationAutocompleteField";
import ServiceAreaLocationHint from "./ServiceAreaLocationHint";
import { SERVICE_AREA_COPY } from "@/lib/service-area/copy";
import {
  RemoteAllowedStatesField,
  showsRemoteAllowedStatesField,
} from "./RemoteAllowedStatesField";
import {
  employmentTypeFromLabel,
  employmentTypeLabel,
  JOB_FORM_BENEFIT_OPTIONS,
  JOB_FORM_COMMISSION_FEE_TYPES,
  JOB_FORM_COMPENSATION_TYPES,
  JOB_FORM_CURRENCIES,
  JOB_FORM_DURATION_PLACEHOLDER,
  JOB_FORM_HOURS_SHOW_BY,
  JOB_FORM_INPUT_CLASS,
  JOB_FORM_LABEL_CLASS,
  JOB_FORM_LOCATION_TYPES,
  JOB_FORM_ACCEPTABLE_MATCH_RATES,
  JOB_FORM_MSP_JOB_DETAIL_OPTIONS,
  JOB_FORM_NUMBER_OF_POSITION_OPTIONS,
  JOB_FORM_OUTLINE_BUTTON_CLASS,
  JOB_FORM_PAY_PERIODS,
  JOB_FORM_RATE_OPTIONS,
  JOB_FORM_PRIMARY_BUTTON_CLASS,
  JOB_FORM_SELECT_CHEVRON,
  JOB_FORM_SELECT_CLASS,
  JOB_FORM_SHOW_PAY_BY,
  JOB_FORM_TEXTAREA_CLASS,
  JOB_FORM_YEARS_OF_EXPERIENCE,
  formatCommissionEstimateFromPayRate,
  type JobFormOption,
  type JobFormUiState,
  type CommissionFeeType,
} from "./job-form-shared";
import { JobFormRequiredMark } from "./JobFormRequiredMark";

export type ReviewEditFieldId =
  | "jobId"
  | "jobTitle"
  | "profession"
  | "jobLocation"
  | "additionalLocation"
  | "jobLocationType"
  | "remoteAllowedStates"
  | "acceptableMatchRate"
  | "numberOfPositions"
  | "yearsOfExperience"
  | "employmentType"
  | "jobType"
  | "employerOnRecord"
  | "employerOfRecord"
  | "jobSource"
  | "mspName"
  | "mspClient"
  | "sourceJobId"
  | "sourceJobTitle"
  | "facilityLocation"
  | "sourceJobUrl"
  | "billRate"
  | "payRate"
  | "jobDuration"
  | "startDate"
  | "applicationDeadline"
  | "expectedHours"
  | "credentials"
  | "specialRequirements"
  | "sourceJobDetails"
  | "internalNotes"
  | "compensation"
  | "benefits"
  | "jobDescription";

type DraftState = {
  job: JobRequisitionInput;
  ui: JobFormUiState;
};

type Props = {
  open: boolean;
  field: ReviewEditFieldId | null;
  job: JobRequisitionInput;
  ui: JobFormUiState;
  brandStyle: CSSProperties;
  /** CSS vars for portal (Radix mounts outside tenant branding wrapper). */
  brandVars?: CSSProperties;
  professions: JobFormOption[];
  employmentTypes: EmploymentType[];
  sourceTypes: SourceType[];
  employerOfRecordOptions: JobFormOption[];
  onOpenChange: (open: boolean) => void;
  onUpdate: (next: { job: JobRequisitionInput; ui: JobFormUiState }) => void;
  onServiceAreaBlockedChange?: (blocked: boolean, message: string | null) => void;
};

function ModalRadio({
  checked,
  name,
  label,
  onChange,
}: {
  checked: boolean;
  name: string;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#E5E7EB] px-4 py-3 text-sm text-[#334155] transition hover:bg-[#F8FAFC]">
      <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
        <input
          type="radio"
          name={name}
          checked={checked}
          onChange={onChange}
          className="peer absolute inset-0 z-10 h-5 w-5 cursor-pointer opacity-0"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border-2 border-[#CBD5E1] bg-white transition peer-checked:opacity-0"
        />
        <svg
          width={20}
          height={20}
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="pointer-events-none absolute inset-0 h-5 w-5 text-[color:var(--brand-secondary)] opacity-0 transition peer-checked:opacity-100"
          aria-hidden
        >
          <rect width="20" height="20" rx="10" fill="currentColor" />
          <circle cx="10" cy="10" r="4" fill="white" />
        </svg>
      </span>
      <span>{label}</span>
    </label>
  );
}

function cloneDraft(job: JobRequisitionInput, ui: JobFormUiState): DraftState {
  return {
    job: { ...job },
    ui: {
      ...ui,
      additionalLocations: [...ui.additionalLocations],
      selectedBenefits: [...ui.selectedBenefits],
      customBenefits: [...ui.customBenefits],
    },
  };
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Application deadline picker: today through the next 6 months. */
function applicationDeadlineBounds() {
  const minDate = new Date();
  minDate.setHours(0, 0, 0, 0);
  const maxDate = new Date(minDate);
  maxDate.setMonth(maxDate.getMonth() + 6);
  return {
    min: toDateInputValue(minDate),
    max: toDateInputValue(maxDate),
  };
}

export function JobReviewEditModal({
  open,
  field,
  job,
  ui,
  brandStyle,
  brandVars,
  professions,
  employmentTypes,
  sourceTypes,
  employerOfRecordOptions,
  onOpenChange,
  onUpdate,
  onServiceAreaBlockedChange,
}: Props) {
  const [draft, setDraft] = useState<DraftState>(() => cloneDraft(job, ui));
  const [customBenefitName, setCustomBenefitName] = useState("");
  const [serviceAreaBlocked, setServiceAreaBlocked] = useState(false);
  const [serviceAreaBlockMessage, setServiceAreaBlockMessage] = useState<string | null>(null);
  const [locationFieldError, setLocationFieldError] = useState("");

  useEffect(() => {
    if (open && field) {
      setDraft(cloneDraft(job, ui));
      setCustomBenefitName("");
      setServiceAreaBlocked(false);
      setServiceAreaBlockMessage(null);
      setLocationFieldError("");
    }
  }, [open, field, job, ui]);

  const employmentLabels = employmentTypes.map((type) => employmentTypeLabel(type));
  const isMsp = draft.job.sourceType === "MSP";
  const isMspRnr = isMspRecruitAndRelease(draft.job);
  const rnrShowPayBy = draft.ui.showPayBy || "Range";
  const rnrRatePeriod = draft.ui.payRatePeriod || "Hourly";
  const commissionEstimate = formatCommissionEstimateFromPayRate(draft.job, draft.ui);

  function handleServiceAreaBlockedChange(blocked: boolean, message: string | null) {
    setServiceAreaBlocked(blocked);
    setServiceAreaBlockMessage(message);
    setLocationFieldError(
      blocked ? message || SERVICE_AREA_COPY.location_not_enabled : ""
    );
  }

  function patchJob<K extends keyof JobRequisitionInput>(key: K, value: JobRequisitionInput[K]) {
    setDraft((current) => {
      const job = { ...current.job, [key]: value };
      if (key === "location" || key === "postalCode" || key === "facility") {
        job.worksiteCity = null;
        job.worksiteState = null;
        job.worksitePostalCode = null;
      }
      return { ...current, job };
    });
  }

  function patchUi(patch: Partial<JobFormUiState>) {
    setDraft((current) => ({ ...current, ui: { ...current.ui, ...patch } }));
  }

  function handleUpdate() {
    // Restricted locations may be kept for draft; publish remains gated on the review screen.
    if (field === "jobLocation" || field === "facilityLocation") {
      onServiceAreaBlockedChange?.(
        serviceAreaBlocked,
        serviceAreaBlocked
          ? serviceAreaBlockMessage || SERVICE_AREA_COPY.location_not_enabled
          : null
      );
    }
    onUpdate(draft);
    onOpenChange(false);
  }

  if (!field) return null;

  const isLocationField =
    field === "jobLocation" || field === "facilityLocation" || field === "additionalLocation";
  const isRemoteStatesField =
    field === "remoteAllowedStates" ||
    (field === "jobLocationType" && showsRemoteAllowedStatesField(draft.ui.jobLocationType));

  const benefitOptions = [
    ...JOB_FORM_BENEFIT_OPTIONS,
    ...draft.ui.customBenefits.filter(
      (item) => !(JOB_FORM_BENEFIT_OPTIONS as readonly string[]).includes(item)
    ),
  ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/40" />
        <Dialog.Content
          className={`fixed left-1/2 top-1/2 z-[201] flex ${
            field === "compensation" && isMspRnr
              ? "w-[min(720px,calc(100vw-24px))]"
              : isRemoteStatesField
                ? "w-[min(720px,calc(100vw-24px))]"
              : "w-[min(560px,calc(100vw-24px))]"
          } -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-[#E5E7EB] bg-white shadow-xl outline-none [&_input]:border-[#CBD5E1] [&_input]:outline-none [&_input]:focus:border-[color:var(--brand-primary)] [&_input]:focus:ring-2 [&_input]:focus:ring-[color:color-mix(in_srgb,var(--brand-primary)_20%,transparent)] [&_select]:border-[#CBD5E1] [&_select]:outline-none [&_select]:focus:border-[color:var(--brand-primary)] [&_select]:focus:ring-2 [&_select]:focus:ring-[color:color-mix(in_srgb,var(--brand-primary)_20%,transparent)] [&_textarea]:border-[#CBD5E1] [&_textarea]:outline-none [&_textarea]:focus:border-[color:var(--brand-primary)] [&_textarea]:focus:ring-2 [&_textarea]:focus:ring-[color:color-mix(in_srgb,var(--brand-primary)_20%,transparent)] ${
            isLocationField
              ? "min-h-[min(480px,85dvh)] max-h-[92dvh] overflow-visible"
              : "max-h-[92dvh] overflow-hidden"
          }`}
          style={brandVars}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 pb-3">
            <Dialog.Title className="text-sm font-semibold text-[#1D2739]">
              Edit the job post
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              Update this field and save changes to the job post review.
            </Dialog.Description>
            <Dialog.Close
              type="button"
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[#1D2739] text-white transition hover:opacity-90"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={2.5} />
            </Dialog.Close>
          </div>

          <div
            className={`min-h-0 flex-1 px-5 pt-3 ${
              isLocationField ? "overflow-visible pb-[22rem]" : "overflow-y-auto pb-8"
            }`}
          >
            {/* Job ID hidden for now
            {field === "jobId" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-job-id">
                  Job ID
                </label>
                <input
                  id="review-edit-job-id"
                  className={JOB_FORM_INPUT_CLASS}
                  value={draft.job.internalRequisitionNumber ?? ""}
                  onChange={(event) => patchJob("internalRequisitionNumber", event.target.value)}
                />
              </div>
            ) : null}
            */}

            {field === "jobTitle" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-job-title">
                  Job title
                  <JobFormRequiredMark />
                </label>
                <input
                  id="review-edit-job-title"
                  className={JOB_FORM_INPUT_CLASS}
                  value={draft.job.publicTitle ?? ""}
                  onChange={(event) => patchJob("publicTitle", event.target.value)}
                />
              </div>
            ) : null}

            {field === "profession" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-profession">
                  Profession
                  <JobFormRequiredMark />
                </label>
                <select
                  id="review-edit-profession"
                  className={JOB_FORM_SELECT_CLASS}
                  style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
                  value={draft.job.professionId ?? ""}
                  onChange={(event) => {
                    const nextId = event.target.value || null;
                    const selected = professions.find((item) => item.id === nextId);
                    patchJob("professionId", nextId);
                    patchJob("profession", selected?.name ?? null);
                    if ((draft.job.professionId || null) !== nextId) {
                      patchJob("specialtyId", null);
                    }
                  }}
                >
                  <option value="">Select Profession</option>
                  {professions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {field === "jobLocation" ? (
              <div>
                <JobLocationAutocompleteField
                  id="review-edit-location"
                  label="Job Location"
                  required
                  value={draft.job.location ?? ""}
                  onChange={(next) => patchJob("location", next)}
                  onPostalCodeChange={(postalCode) => patchJob("postalCode", postalCode)}
                  placeholder="Search city, area, or address"
                  suggestionsClassName="!max-h-[21rem]"
                  error={locationFieldError || undefined}
                />
                <ServiceAreaLocationHint
                  silent
                  locationText={draft.job.location}
                  postalCode={draft.job.postalCode}
                  locationType={draft.ui.jobLocationType || draft.job.jobLocationType}
                  remoteAllowedStates={draft.job.remoteAllowedStates}
                  onBlockedChange={handleServiceAreaBlockedChange}
                />
              </div>
            ) : null}

            {field === "additionalLocation" ? (
              <div className="space-y-3">
                <label className={JOB_FORM_LABEL_CLASS}>Additional Location</label>
                {(draft.ui.additionalLocations.length
                  ? draft.ui.additionalLocations
                  : [""]
                ).map((location, index) => (
                  <div key={`addl-${index}`} className="flex gap-2">
                    <JobLocationAutocompleteField
                      id={`review-edit-additional-location-${index}`}
                      label={`Additional location ${index + 1}`}
                      showLabel={false}
                      className="min-w-0 flex-1"
                      value={location}
                      placeholder="Search additional location"
                      suggestionsClassName="!max-h-[21rem]"
                      onChange={(next) => {
                        const nextLocations = [...draft.ui.additionalLocations];
                        if (!nextLocations.length) nextLocations.push("");
                        nextLocations[index] = next;
                        patchUi({
                          additionalLocations: nextLocations,
                          showInMultipleAreas: true,
                        });
                      }}
                    />
                    {draft.ui.additionalLocations.length > 1 ? (
                      <button
                        type="button"
                        className={`${JOB_FORM_OUTLINE_BUTTON_CLASS} shrink-0 self-start`}
                        onClick={() =>
                          patchUi({
                            additionalLocations: draft.ui.additionalLocations.filter(
                              (_, i) => i !== index
                            ),
                          })
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-[color:var(--brand-primary)]"
                  onClick={() =>
                    patchUi({
                      additionalLocations: [...draft.ui.additionalLocations, ""],
                      showInMultipleAreas: true,
                    })
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add another location
                </button>
              </div>
            ) : null}

            {field === "acceptableMatchRate" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-match-rate">
                  Acceptable Match Rate
                </label>
                <select
                  id="review-edit-match-rate"
                  className={JOB_FORM_SELECT_CLASS}
                  style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
                  value={draft.job.acceptableMatchRate ?? ""}
                  onChange={(event) => patchJob("acceptableMatchRate", event.target.value || null)}
                >
                  <option value="">Select Acceptable Match Rate</option>
                  {JOB_FORM_ACCEPTABLE_MATCH_RATES.map((rate) => (
                    <option key={rate} value={rate}>
                      {rate}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {field === "jobLocationType" ? (
              <div className="space-y-4">
                <div>
                  <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-location-type">
                    Placement Type
                  </label>
                  <select
                    id="review-edit-location-type"
                    className={JOB_FORM_SELECT_CLASS}
                    style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
                    value={draft.ui.jobLocationType ?? ""}
                    onChange={(event) => {
                      const nextType = event.target.value;
                      patchUi({
                        jobLocationType: nextType,
                        ...(!showsRemoteAllowedStatesField(nextType)
                          ? { remoteStatesScope: "all" as const }
                          : {}),
                      });
                      if (!showsRemoteAllowedStatesField(nextType)) {
                        patchJob("remoteAllowedStates", []);
                      }
                    }}
                  >
                    <option value="">Select Placement Type</option>
                    {JOB_FORM_LOCATION_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                    {draft.ui.jobLocationType &&
                    !JOB_FORM_LOCATION_TYPES.includes(
                      draft.ui.jobLocationType as (typeof JOB_FORM_LOCATION_TYPES)[number]
                    ) ? (
                      <option value={draft.ui.jobLocationType}>{draft.ui.jobLocationType}</option>
                    ) : null}
                  </select>
                </div>
                {showsRemoteAllowedStatesField(draft.ui.jobLocationType) ? (
                  <RemoteAllowedStatesField
                    value={draft.job.remoteAllowedStates ?? []}
                    scope={draft.ui.remoteStatesScope}
                    required={isRemoteJobLocationType(draft.ui.jobLocationType)}
                    onChange={(next) => patchJob("remoteAllowedStates", next)}
                    onScopeChange={(next) => patchUi({ remoteStatesScope: next })}
                  />
                ) : null}
              </div>
            ) : null}

            {field === "remoteAllowedStates" ? (
              <RemoteAllowedStatesField
                value={draft.job.remoteAllowedStates ?? []}
                scope={draft.ui.remoteStatesScope}
                required={isRemoteJobLocationType(draft.ui.jobLocationType)}
                onChange={(next) => patchJob("remoteAllowedStates", next)}
                onScopeChange={(next) => patchUi({ remoteStatesScope: next })}
              />
            ) : null}

            {field === "numberOfPositions" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-positions">
                  Number of Positions
                </label>
                {isMsp ? (
                  <select
                    id="review-edit-positions"
                    className={`${JOB_FORM_SELECT_CLASS} text-[#334155]`}
                    style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
                    value={draft.ui.numberOfPositions}
                    onChange={(event) =>
                      patchUi({
                        numberOfPositions: Math.max(1, Math.trunc(Number(event.target.value) || 1)),
                      })
                    }
                  >
                    {JOB_FORM_NUMBER_OF_POSITION_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                    {draft.ui.numberOfPositions > JOB_FORM_NUMBER_OF_POSITION_OPTIONS.length ? (
                      <option value={draft.ui.numberOfPositions}>
                        {draft.ui.numberOfPositions}
                      </option>
                    ) : null}
                  </select>
                ) : (
                  <div className="flex h-10 items-center overflow-hidden rounded-lg border border-[#CBD5E1]">
                    <input
                      type="number"
                      min={1}
                      className="h-full min-w-0 flex-1 border-0 px-3 text-sm text-[#334155] outline-none"
                      value={draft.ui.numberOfPositions}
                      onChange={(event) =>
                        patchUi({
                          numberOfPositions: Math.max(1, Number(event.target.value) || 1),
                        })
                      }
                    />
                    <button
                      type="button"
                      className="inline-flex h-full w-10 cursor-pointer items-center justify-center border-l border-[#CBD5E1] text-[#64748B] hover:bg-[#F8FAFC]"
                      onClick={() =>
                        patchUi({ numberOfPositions: draft.ui.numberOfPositions + 1 })
                      }
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-full w-10 cursor-pointer items-center justify-center border-l border-[#CBD5E1] text-[#64748B] hover:bg-[#F8FAFC]"
                      onClick={() =>
                        patchUi({
                          numberOfPositions: Math.max(1, draft.ui.numberOfPositions - 1),
                        })
                      }
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            {field === "yearsOfExperience" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-years">
                  Years of Experience
                </label>
                <select
                  id="review-edit-years"
                  className={JOB_FORM_SELECT_CLASS}
                  style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
                  value={draft.ui.yearsOfExperience}
                  onChange={(event) => patchUi({ yearsOfExperience: event.target.value })}
                >
                  <option value="">Select Years of Experience</option>
                  {JOB_FORM_YEARS_OF_EXPERIENCE.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {field === "employmentType" ? (
              <div className="space-y-2">
                {employmentLabels.map((label) => (
                  <ModalRadio
                    key={label}
                    name="review-edit-employment-type"
                    label={label}
                    checked={
                      Boolean(draft.job.employmentType) &&
                      employmentTypeLabel(draft.job.employmentType) === label
                    }
                    onChange={() => {
                      const nextType = employmentTypeFromLabel(label);
                      patchJob("employmentType", nextType);
                      if (nextType === "Contract") {
                        patchJob("sourceType", "MSP");
                      }
                    }}
                  />
                ))}
              </div>
            ) : null}

            {field === "jobType" ? (
              <JobTypeChipSelect
                label={isMsp ? "Job Type" : "Employment Type"}
                value={draft.job.shiftType ?? ""}
                onChange={(next) => patchJob("shiftType", next)}
                labelClassName="sr-only"
              />
            ) : null}

            {field === "employerOnRecord" ? (
              <div className="space-y-2">
                <ModalRadio
                  name="review-edit-eor"
                  label="Yes"
                  checked={draft.ui.employerOnRecord === "yes"}
                  onChange={() => patchUi({ employerOnRecord: "yes" })}
                />
                <ModalRadio
                  name="review-edit-eor"
                  label="No"
                  checked={draft.ui.employerOnRecord === "no"}
                  onChange={() => {
                    patchUi({ employerOnRecord: "no" });
                    patchJob("employerOfRecord", null);
                  }}
                />
              </div>
            ) : null}

            {field === "employerOfRecord" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-eor-select">
                  Employer on Record
                </label>
                <select
                  id="review-edit-eor-select"
                  className={JOB_FORM_SELECT_CLASS}
                  style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
                  value={draft.job.employerOfRecord ?? ""}
                  onChange={(event) => patchJob("employerOfRecord", event.target.value || null)}
                >
                  <option value="">Select Employer on Record</option>
                  {employerOfRecordOptions.map((item) => (
                    <option key={item.id} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {field === "jobSource" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-job-source">
                  Job Source
                </label>
                <select
                  id="review-edit-job-source"
                  className={JOB_FORM_SELECT_CLASS}
                  style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
                  value={draft.job.sourceType || ""}
                  onChange={(event) => patchJob("sourceType", event.target.value as SourceType)}
                >
                  <option value="">Select Job Source</option>
                  {sourceTypes.map((value) => (
                    <option key={value} value={value}>
                      {value === "Internal" ? "Internal" : value}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {field === "mspName" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-msp-name">
                  Contract Group / Client
                  <JobFormRequiredMark />
                </label>
                <input
                  id="review-edit-msp-name"
                  className={JOB_FORM_INPUT_CLASS}
                  value={draft.job.mspName ?? ""}
                  onChange={(event) => patchJob("mspName", event.target.value)}
                />
              </div>
            ) : null}

            {field === "mspClient" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-msp-client">
                  MSP Name
                  <JobFormRequiredMark />
                </label>
                <input
                  id="review-edit-msp-client"
                  className={JOB_FORM_INPUT_CLASS}
                  value={draft.job.mspClient ?? ""}
                  onChange={(event) => patchJob("mspClient", event.target.value)}
                />
              </div>
            ) : null}

            {field === "sourceJobId" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-source-job-id">
                  Internal Reference / Source Job ID
                  <JobFormRequiredMark />
                </label>
                <input
                  id="review-edit-source-job-id"
                  className={JOB_FORM_INPUT_CLASS}
                  value={draft.job.externalRequisitionId ?? ""}
                  onChange={(event) => patchJob("externalRequisitionId", event.target.value)}
                />
              </div>
            ) : null}

            {field === "sourceJobTitle" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-source-job-title">
                  Source Job Title
                  <JobFormRequiredMark />
                </label>
                <input
                  id="review-edit-source-job-title"
                  className={JOB_FORM_INPUT_CLASS}
                  value={draft.job.sourceJobTitle ?? ""}
                  onChange={(event) => {
                    const next = event.target.value;
                    patchJob("sourceJobTitle", next);
                    if (isMsp) {
                      patchJob("publicTitle", next);
                    }
                  }}
                  placeholder="e.g. Registered Nurse - Acute Care"
                />
              </div>
            ) : null}

            {field === "facilityLocation" ? (
              <div>
                <JobLocationAutocompleteField
                  id="review-edit-facility"
                  label="Location"
                  required
                  value={draft.job.facility?.trim() || draft.job.location?.trim() || ""}
                  onChange={(next) => {
                    patchJob("facility", next);
                    if (isMsp) patchJob("location", next);
                  }}
                  onPostalCodeChange={(postalCode) => patchJob("postalCode", postalCode)}
                  placeholder="Search city, area, or address"
                  suggestionsClassName="!max-h-[21rem]"
                  error={locationFieldError || undefined}
                />
                <ServiceAreaLocationHint
                  silent
                  locationText={
                    draft.job.facility?.trim() || draft.job.location?.trim() || ""
                  }
                  postalCode={draft.job.postalCode}
                  locationType={draft.ui.jobLocationType || draft.job.jobLocationType}
                  remoteAllowedStates={draft.job.remoteAllowedStates}
                  onBlockedChange={handleServiceAreaBlockedChange}
                />
              </div>
            ) : null}

            {field === "sourceJobUrl" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-source-url">
                  Direct Source Job URL
                </label>
                <input
                  id="review-edit-source-url"
                  className={JOB_FORM_INPUT_CLASS}
                  value={draft.job.sourceJobUrl ?? ""}
                  onChange={(event) => patchJob("sourceJobUrl", event.target.value)}
                />
              </div>
            ) : null}

            {field === "billRate" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-bill-rate">
                  Bill Rate
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#94A3B8]">
                    $
                  </span>
                  <input
                    id="review-edit-bill-rate"
                    type="number"
                    min="0"
                    step="0.01"
                    className={`${JOB_FORM_INPUT_CLASS} pl-7`}
                    value={draft.job.billRate ?? ""}
                    onChange={(event) =>
                      patchJob("billRate", event.target.value ? Number(event.target.value) : null)
                    }
                  />
                </div>
              </div>
            ) : null}

            {field === "payRate" ? (
              <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                <div>
                  <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-pay-rate">
                    Suggested Pay Rate
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#94A3B8]">
                      $
                    </span>
                    <input
                      id="review-edit-pay-rate"
                      type="number"
                      min="0"
                      step="0.01"
                      className={`${JOB_FORM_INPUT_CLASS} pl-7`}
                      value={draft.job.suggestedPayRate ?? ""}
                      onChange={(event) =>
                        patchJob(
                          "suggestedPayRate",
                          event.target.value ? Number(event.target.value) : null
                        )
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-pay-period">
                    Period
                  </label>
                  <select
                    id="review-edit-pay-period"
                    className={JOB_FORM_SELECT_CLASS}
                    style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
                    value={draft.ui.compensationType}
                    onChange={(event) => patchUi({ compensationType: event.target.value })}
                  >
                    <option value="">Select</option>
                    {JOB_FORM_COMPENSATION_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            {field === "jobDuration" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-duration">
                  Job Duration
                </label>
                <input
                  id="review-edit-duration"
                  type="text"
                  className={JOB_FORM_INPUT_CLASS}
                  value={draft.job.duration ?? ""}
                  onChange={(event) => patchJob("duration", event.target.value || null)}
                  placeholder={JOB_FORM_DURATION_PLACEHOLDER}
                  autoComplete="off"
                />
              </div>
            ) : null}

            {field === "startDate" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-start-date">
                  Start Date
                </label>
                <input
                  id="review-edit-start-date"
                  type="date"
                  className={JOB_FORM_INPUT_CLASS}
                  value={draft.job.targetStartDate ?? ""}
                  onChange={(event) => patchJob("targetStartDate", event.target.value || null)}
                />
              </div>
            ) : null}

            {field === "applicationDeadline"
              ? (() => {
                  const deadlineBounds = applicationDeadlineBounds();
                  return (
                    <div>
                      <label
                        className={JOB_FORM_LABEL_CLASS}
                        htmlFor="review-edit-application-deadline"
                      >
                        Application Deadline
                      </label>
                      <input
                        id="review-edit-application-deadline"
                        type="date"
                        min={deadlineBounds.min}
                        max={deadlineBounds.max}
                        className={JOB_FORM_INPUT_CLASS}
                        value={draft.job.applicationDeadline ?? ""}
                        onChange={(event) => {
                          const next = event.target.value || null;
                          if (
                            next &&
                            (next < deadlineBounds.min || next > deadlineBounds.max)
                          ) {
                            return;
                          }
                          patchJob("applicationDeadline", next);
                        }}
                      />
                    </div>
                  );
                })()
              : null}

            {field === "expectedHours" ? (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-[#1D2739]">Expected hours</h3>
                <div
                  className={`grid gap-4 min-[700px]:items-end ${
                    (draft.ui.hoursShowBy || "Fixed Hours") === "Fixed Hours"
                      ? "min-[700px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]"
                      : "min-[700px]:grid-cols-[minmax(0,1.2fr)]"
                  }`}
                >
                  <div className="min-w-0">
                    <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-hours-show-by">
                      Show by
                    </label>
                    <select
                      id="review-edit-hours-show-by"
                      className={`${JOB_FORM_SELECT_CLASS} text-[#334155]`}
                      style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
                      value={draft.ui.hoursShowBy || "Fixed Hours"}
                      onChange={(event) => {
                        const next = event.target.value;
                        patchUi({ hoursShowBy: next });
                        patchJob("shiftDetails", next || null);
                      }}
                    >
                      {JOB_FORM_HOURS_SHOW_BY.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(draft.ui.hoursShowBy || "Fixed Hours") === "Fixed Hours" ? (
                    <>
                      <div className="min-w-0">
                        <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-hours-per-week">
                          Fixed at
                        </label>
                        <input
                          id="review-edit-hours-per-week"
                          type="number"
                          min="0"
                          step="1"
                          className={JOB_FORM_INPUT_CLASS}
                          value={draft.job.hoursPerWeek ?? ""}
                          onChange={(event) =>
                            patchJob(
                              "hoursPerWeek",
                              event.target.value ? Number(event.target.value) : null
                            )
                          }
                        />
                      </div>
                      <span className="hidden pb-2 text-sm text-[#64748B] min-[700px]:block">
                        Hours per week
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}

            {field === "credentials" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-credentials">
                  Required Credentials / Certifications
                </label>
                <textarea
                  id="review-edit-credentials"
                  className={`${JOB_FORM_TEXTAREA_CLASS} min-h-[140px]`}
                  value={draft.job.requiredCredentials ?? ""}
                  onChange={(event) => patchJob("requiredCredentials", event.target.value)}
                />
              </div>
            ) : null}

            {field === "specialRequirements" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-special">
                  Special Requirement / Restrictions
                </label>
                <textarea
                  id="review-edit-special"
                  className={`${JOB_FORM_TEXTAREA_CLASS} min-h-[140px]`}
                  value={draft.job.specialRequirements ?? ""}
                  onChange={(event) => patchJob("specialRequirements", event.target.value)}
                />
              </div>
            ) : null}

            {field === "sourceJobDetails" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-job-details">
                  Job Details
                </label>
                <select
                  id="review-edit-job-details"
                  className={JOB_FORM_SELECT_CLASS}
                  style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
                  value={draft.job.sourceJobDetails ?? ""}
                  onChange={(event) => patchJob("sourceJobDetails", event.target.value || null)}
                >
                  <option value="">Select Job Details</option>
                  {JOB_FORM_MSP_JOB_DETAIL_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {field === "internalNotes" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-edit-notes">
                  Internal Notes
                </label>
                <textarea
                  id="review-edit-notes"
                  className={`${JOB_FORM_TEXTAREA_CLASS} min-h-[160px]`}
                  value={draft.job.internalNotes ?? ""}
                  onChange={(event) => patchJob("internalNotes", event.target.value)}
                />
              </div>
            ) : null}

            {field === "compensation" ? (
              isMspRnr ? (
                <div className="space-y-6">
                  <div
                    className={`grid gap-4 min-[700px]:items-end ${
                      rnrShowPayBy === "Range"
                        ? "min-[700px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1.1fr)]"
                        : "min-[700px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.1fr)]"
                    }`}
                  >
                    <div className="min-w-0">
                      <label className={JOB_FORM_LABEL_CLASS}>Show pay by</label>
                      <select
                        className={`${JOB_FORM_SELECT_CLASS} text-[#334155]`}
                        style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
                        value={rnrShowPayBy}
                        onChange={(event) => {
                          const next = event.target.value;
                          patchUi({ showPayBy: next });
                          if (next !== "Range") {
                            patchJob("payRateMax", null);
                          }
                        }}
                      >
                        {JOB_FORM_SHOW_PAY_BY.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </div>

                    {rnrShowPayBy === "Range" ? (
                      <>
                        <div className="min-w-0">
                          <label className={JOB_FORM_LABEL_CLASS}>Minimum</label>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#94A3B8]">
                              $
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className={`${JOB_FORM_INPUT_CLASS} pl-7`}
                              value={draft.job.payRateMin ?? ""}
                              onChange={(event) =>
                                patchJob(
                                  "payRateMin",
                                  event.target.value ? Number(event.target.value) : null
                                )
                              }
                            />
                          </div>
                        </div>
                        <span className="hidden pb-2 text-sm text-[#64748B] min-[700px]:block">to</span>
                        <div className="min-w-0">
                          <label className={JOB_FORM_LABEL_CLASS}>Maximum</label>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#94A3B8]">
                              $
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className={`${JOB_FORM_INPUT_CLASS} pl-7`}
                              value={draft.job.payRateMax ?? ""}
                              onChange={(event) =>
                                patchJob(
                                  "payRateMax",
                                  event.target.value ? Number(event.target.value) : null
                                )
                              }
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="min-w-0">
                        <label className={JOB_FORM_LABEL_CLASS}>
                          {rnrShowPayBy === "Starting amount" ? "Starting amount" : "Exact amount"}
                        </label>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#94A3B8]">
                            $
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className={`${JOB_FORM_INPUT_CLASS} pl-7`}
                            value={draft.job.payRateMin ?? ""}
                            onChange={(event) =>
                              patchJob(
                                "payRateMin",
                                event.target.value ? Number(event.target.value) : null
                              )
                            }
                          />
                        </div>
                      </div>
                    )}

                    <div className="min-w-0">
                      <label className={JOB_FORM_LABEL_CLASS}>Rate</label>
                      <select
                        className={`${JOB_FORM_SELECT_CLASS} text-[#334155]`}
                        style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
                        value={rnrRatePeriod}
                        onChange={(event) =>
                          patchUi({
                            payRatePeriod: event.target.value,
                            compensationType: event.target.value,
                          })
                        }
                      >
                        {JOB_FORM_RATE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-commission-fee-type">
                        Please select commission fees
                      </label>
                      <select
                        id="review-commission-fee-type"
                        className={JOB_FORM_SELECT_CLASS}
                        style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
                        value={draft.ui.commissionFeeType}
                        onChange={(event) => {
                          const next = event.target.value as CommissionFeeType;
                          patchUi({ commissionFeeType: next });
                          if (next === "percentage") {
                            patchJob("commissionFixedAmount", null);
                          } else if (next === "fixed_amount") {
                            patchJob("commissionPercent", null);
                          } else {
                            patchJob("commissionPercent", null);
                            patchJob("commissionFixedAmount", null);
                          }
                        }}
                      >
                        <option value="">Please select commission fees</option>
                        {JOB_FORM_COMMISSION_FEE_TYPES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.value === "percentage" && commissionEstimate
                              ? `${option.label} (${commissionEstimate})`
                              : option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {draft.ui.commissionFeeType === "percentage" ? (
                      <div>
                        <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-commission-percent">
                          Commission Percentage
                        </label>
                        <div className="relative">
                          <input
                            id="review-commission-percent"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            className={`${JOB_FORM_INPUT_CLASS} pr-10`}
                            value={draft.job.commissionPercent ?? ""}
                            onChange={(event) =>
                              patchJob(
                                "commissionPercent",
                                event.target.value ? Number(event.target.value) : null
                              )
                            }
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#94A3B8]">
                            %
                          </span>
                        </div>
                        {commissionEstimate ? (
                          <p className="mt-1.5 text-sm text-[#64748B]">
                            Estimated commission from pay rate: {commissionEstimate}
                          </p>
                        ) : (
                          <p className="mt-1.5 text-sm text-[#64748B]">
                            Enter a percentage to calculate commission from the pay rate above.
                          </p>
                        )}
                      </div>
                    ) : null}

                    {draft.ui.commissionFeeType === "fixed_amount" ? (
                      <div>
                        <label className={JOB_FORM_LABEL_CLASS} htmlFor="review-commission-fixed">
                          Fixed Commission Amount
                        </label>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#94A3B8]">
                            $
                          </span>
                          <input
                            id="review-commission-fixed"
                            type="number"
                            min="0"
                            step="0.01"
                            className={`${JOB_FORM_INPUT_CLASS} pl-7 pr-14`}
                            value={draft.job.commissionFixedAmount ?? ""}
                            onChange={(event) =>
                              patchJob(
                                "commissionFixedAmount",
                                event.target.value ? Number(event.target.value) : null
                              )
                            }
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[#94A3B8]">
                            USD
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={JOB_FORM_LABEL_CLASS}>Compensation</label>
                    <select
                      className={JOB_FORM_SELECT_CLASS}
                      style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
                      value={draft.ui.compensationType}
                      onChange={(event) =>
                        patchUi({
                          compensationType: event.target.value,
                          payRatePeriod: event.target.value,
                        })
                      }
                    >
                      <option value="">Select Compensation</option>
                      {JOB_FORM_COMPENSATION_TYPES.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={JOB_FORM_LABEL_CLASS}>Currency</label>
                    <select
                      className={JOB_FORM_SELECT_CLASS}
                      style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
                      value={draft.ui.currency}
                      onChange={(event) => patchUi({ currency: event.target.value })}
                    >
                      <option value="">Select Currency</option>
                      {JOB_FORM_CURRENCIES.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={JOB_FORM_LABEL_CLASS}>Show pay by</label>
                  <select
                    className={JOB_FORM_SELECT_CLASS}
                    style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
                    value={draft.ui.showPayBy || "Exact amount"}
                    onChange={(event) => {
                      const next = event.target.value;
                      patchUi({ showPayBy: next });
                      if (next !== "Range") {
                        patchJob("payRateMax", null);
                      }
                    }}
                  >
                    {JOB_FORM_SHOW_PAY_BY.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Rate duplicates Compensation — hidden in create/review flow.
                <div>
                  <label className={JOB_FORM_LABEL_CLASS}>Rate</label>
                  <select
                    className={JOB_FORM_SELECT_CLASS}
                    style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
                    value={draft.ui.payRatePeriod}
                    onChange={(event) => patchUi({ payRatePeriod: event.target.value })}
                  >
                    <option value="">Select Rate</option>
                    {JOB_FORM_PAY_PERIODS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                    {draft.ui.payRatePeriod &&
                    !JOB_FORM_PAY_PERIODS.includes(
                      draft.ui.payRatePeriod as (typeof JOB_FORM_PAY_PERIODS)[number]
                    ) ? (
                      <option value={draft.ui.payRatePeriod}>{draft.ui.payRatePeriod}</option>
                    ) : null}
                  </select>
                </div>
                */}
                {draft.ui.showPayBy === "Range" ? (
                  <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
                    <div>
                      <label className={JOB_FORM_LABEL_CLASS}>Minimum</label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#94A3B8]">
                          $
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={`${JOB_FORM_INPUT_CLASS} pl-7`}
                          value={draft.job.payRateMin ?? ""}
                          onChange={(event) =>
                            patchJob(
                              "payRateMin",
                              event.target.value ? Number(event.target.value) : null
                            )
                          }
                        />
                      </div>
                    </div>
                    <span className="hidden pb-2 text-sm text-[#64748B] sm:block">to</span>
                    <div>
                      <label className={JOB_FORM_LABEL_CLASS}>Maximum</label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#94A3B8]">
                          $
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={`${JOB_FORM_INPUT_CLASS} pl-7`}
                          value={draft.job.payRateMax ?? ""}
                          onChange={(event) =>
                            patchJob(
                              "payRateMax",
                              event.target.value ? Number(event.target.value) : null
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className={JOB_FORM_LABEL_CLASS}>
                      {draft.ui.showPayBy === "Starting amount"
                        ? "Starting amount"
                        : "Exact amount"}
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#94A3B8]">
                        $
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={`${JOB_FORM_INPUT_CLASS} pl-7`}
                        value={draft.job.payRateMin ?? ""}
                        onChange={(event) =>
                          patchJob(
                            "payRateMin",
                            event.target.value ? Number(event.target.value) : null
                          )
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
              )
            ) : null}

            {field === "benefits" ? (
              <div className="space-y-4">
                <BenefitsChipSelect
                  options={benefitOptions}
                  selected={draft.ui.selectedBenefits}
                  onToggle={(benefit) => {
                    const selected = draft.ui.selectedBenefits.includes(benefit);
                    patchUi({
                      selectedBenefits: selected
                        ? draft.ui.selectedBenefits.filter((item) => item !== benefit)
                        : [...draft.ui.selectedBenefits, benefit],
                    });
                  }}
                  customBenefits={draft.ui.customBenefits}
                  onRemoveCustom={(benefit) => {
                    patchUi({
                      customBenefits: draft.ui.customBenefits.filter((item) => item !== benefit),
                      selectedBenefits: draft.ui.selectedBenefits.filter((item) => item !== benefit),
                    });
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <input
                    className={`${JOB_FORM_INPUT_CLASS} max-w-xs`}
                    value={customBenefitName}
                    placeholder="Create benefit"
                    onChange={(event) => setCustomBenefitName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      const name = customBenefitName.trim();
                      if (!name) return;
                      if (
                        benefitOptions.some((item) => item.toLowerCase() === name.toLowerCase())
                      ) {
                        setCustomBenefitName("");
                        return;
                      }
                      patchUi({
                        customBenefits: [...draft.ui.customBenefits, name],
                        selectedBenefits: [...draft.ui.selectedBenefits, name],
                      });
                      setCustomBenefitName("");
                    }}
                  />
                  <button
                    type="button"
                    className={JOB_FORM_OUTLINE_BUTTON_CLASS}
                    onClick={() => {
                      const name = customBenefitName.trim();
                      if (!name) return;
                      if (
                        benefitOptions.some((item) => item.toLowerCase() === name.toLowerCase())
                      ) {
                        setCustomBenefitName("");
                        return;
                      }
                      patchUi({
                        customBenefits: [...draft.ui.customBenefits, name],
                        selectedBenefits: [...draft.ui.selectedBenefits, name],
                      });
                      setCustomBenefitName("");
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            ) : null}

            {field === "jobDescription" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS}>
                  Job Description
                  <JobFormRequiredMark />
                </label>
                <JobDescriptionEditor
                  value={draft.job.publicDescription ?? ""}
                  onChange={(next) => patchJob("publicDescription", next)}
                />
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[#E5E7EB] px-5 py-4">
            <Dialog.Close type="button" className={JOB_FORM_OUTLINE_BUTTON_CLASS}>
              Close
            </Dialog.Close>
            <button
              type="button"
              className={JOB_FORM_PRIMARY_BUTTON_CLASS}
              style={brandStyle}
              onClick={handleUpdate}
            >
              Update
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

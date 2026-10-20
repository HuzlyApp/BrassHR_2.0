"use client";

import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Check,
  Copy,
  Eye,
  HelpCircle,
  Minus,
  Pencil,
  Plus,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getSidebarIconSrc } from "@/app/admin_recruiter/components/sidebar-icons";
import {
  ensureTintedSidebarIconMarkup,
  getTintedSidebarIconMarkup,
} from "@/lib/sidebar/sidebar-icon-markup";
import { isRemoteJobLocationType } from "@/lib/service-area/location-type";
import type { EmploymentType, JobRequisitionInput, SourceType } from "@/lib/jobs/types";
import { isMspRecruitAndEor, isMspRecruitAndRelease, MSP_PLACEMENT_SUMMARIES, PLACEMENT_TYPE_LABELS } from "@/lib/jobs/placement";
import {
  formatRemoteAllowedStatesLabel,
  RemoteAllowedStatesField,
  showsRemoteAllowedStatesField,
} from "./RemoteAllowedStatesField";
import {
  JobDescriptionHtml,
  jobDescriptionPlainText,
} from "./JobDescriptionEditor";
import { JobDescriptionViewModal } from "./JobDescriptionViewModal";
import { JobDescriptionWithAiSuggest } from "./JobDescriptionWithAiSuggest";
import { JobScreeningQuestionsEditor } from "./JobScreeningQuestionsEditor";
import type { JobScreeningQuestionInput } from "@/lib/jobs/screening-questions";
import type { ReviewEditFieldId } from "./JobReviewEditModal";
import { JobTypeChipSelect } from "./JobTypeChipSelect";
import { BenefitsChipSelect } from "./BenefitsChipSelect";
import JobLocationAutocompleteField from "./JobLocationAutocompleteField";
import ServiceAreaLocationHint from "./ServiceAreaLocationHint";
import {
  JOB_FORM_BENEFIT_OPTIONS,
  JOB_FORM_COMMISSION_FEE_TYPES,
  JOB_FORM_COMPENSATION_TYPES,
  JOB_FORM_DURATION_PLACEHOLDER,
  JOB_FORM_FIELDS_CLASS,
  JOB_FORM_HOURS_SHOW_BY,
  JOB_FORM_ICON_BUTTON_CLASS,
  JOB_FORM_INPUT_CLASS,
  JOB_FORM_LABEL_CLASS,
  JOB_FORM_LOCATION_CLUSTER_CLASS,
  JOB_FORM_LOCATION_TYPES,
  JOB_FORM_ACCEPTABLE_MATCH_RATES,
  JOB_FORM_MSP_JOB_DETAIL_OPTIONS,
  JOB_FORM_NUMBER_OF_POSITION_OPTIONS,
  JOB_FORM_OUTLINE_BUTTON_CLASS,
  JOB_FORM_PAY_PERIODS,
  JOB_FORM_RATE_OPTIONS,
  JOB_FORM_PRIMARY_BUTTON_CLASS,
  JOB_FORM_RADIO_OPTIONS_CLASS,
  JOB_FORM_SECTION_TITLE_CLASS,
  JOB_FORM_SECTION_SUBTITLE_CLASS,
  JOB_FORM_SELECT_CHEVRON,
  JOB_FORM_SELECT_CLASS,
  // JOB_FORM_SHIFT_TYPES, // TODO(future): Internal job configuration
  JOB_FORM_SHOW_PAY_BY,
  JOB_FORM_SURFACE_CLASS,
  JOB_FORM_TEXTAREA_CLASS,
  JOB_FORM_YEARS_OF_EXPERIENCE,
  employmentTypeFromLabel,
  employmentTypeLabel,
  REVIEW_LOCKED_EMPLOYMENT_TYPE_TOOLTIP,
  formatPaySummary,
  formatCommissionFeeTypeLabel,
  formatCommissionPercentValue,
  formatCommissionFixedValue,
  formatCommissionEstimateFromPayRate,
  formatExpectedHoursValue,
  formatPayRatePeriodLabel,
  type JobFormOption,
  type JobFormStep,
  type JobFormUiState,
  type CommissionFeeType,
} from "./job-form-shared";
import { JobFormRequiredMark } from "./JobFormRequiredMark";
// Job Industry UI hidden on create — industry_key still set from tenant primary in JobRequisitionForm (AI prompts).
// import { activeUserFacingIndustries } from "@/lib/ai-catalog/industry-catalog";


function BrandedCheckbox({
  checked,
  onChange,
  label,
  className = "",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-2.5 text-sm text-[#334155] ${className}`}
    >
      <span className="relative inline-flex h-5 w-5 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-[5px] border-2 border-[#CBD5E1] bg-white transition-colors checked:border-[color:var(--brand-secondary)] checked:bg-[color:var(--brand-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--brand-secondary)_30%,transparent)]"
        />
        <Check
          className="pointer-events-none absolute inset-0 m-auto hidden h-3 w-3 text-white peer-checked:block"
          strokeWidth={3}
          aria-hidden
        />
      </span>
      <span className="min-w-0">{label}</span>
    </label>
  );
}

function BrandedRadio({
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
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[#334155]">
      <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
        <input
          type="radio"
          name={name}
          checked={checked}
          onChange={onChange}
          className="peer absolute inset-0 z-10 h-5 w-5 cursor-pointer opacity-0"
        />
        {/* Inactive ring */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border-2 border-[#CBD5E1] bg-white transition peer-focus-visible:ring-2 peer-focus-visible:ring-[color:color-mix(in_srgb,var(--brand-secondary)_30%,transparent)] peer-checked:opacity-0"
        />
        {/* Active icon — brand secondary */}
        <svg
          width={20}
          height={20}
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="pointer-events-none absolute inset-0 h-5 w-5 text-[color:var(--brand-secondary)] opacity-0 transition peer-checked:opacity-100 peer-focus-visible:rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-[color:color-mix(in_srgb,var(--brand-secondary)_30%,transparent)]"
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

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <span className="mt-1 block text-sm text-rose-600">{error}</span>;
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

/* TODO(future): restore with Internal job configuration section
function InternalField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2 text-sm font-normal text-[#64748B]">
        {label}
        <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
          Internal
        </span>
      </span>
      {children}
      <FieldError error={error} />
    </label>
  );
}
*/

function PublicField({
  label,
  error,
  required = false,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className={JOB_FORM_LABEL_CLASS}>
        {label}
        {required ? <JobFormRequiredMark /> : null}
      </span>
      {children}
      <FieldError error={error} />
    </label>
  );
}

function AcceptableMatchRateField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className={JOB_FORM_LABEL_CLASS} htmlFor={id}>
        Acceptable Match Rate
      </label>
      <select
        id={id}
        className={`${JOB_FORM_SELECT_CLASS} ${value ? "text-[#334155]" : "text-[#94A3B8]"}`}
        style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select Acceptable Match Rate</option>
        {JOB_FORM_ACCEPTABLE_MATCH_RATES.map((rate) => (
          <option key={rate} value={rate}>
            {rate}
          </option>
        ))}
      </select>
    </div>
  );
}

function WorkLocationTypeField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className={JOB_FORM_LABEL_CLASS} htmlFor={id}>
        Work Location Type
      </label>
      <select
        id={id}
        className={`${JOB_FORM_SELECT_CLASS} ${value ? "text-[#334155]" : "text-[#94A3B8]"}`}
        style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select work location type</option>
        {JOB_FORM_LOCATION_TYPES.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
        {value &&
        !JOB_FORM_LOCATION_TYPES.includes(value as (typeof JOB_FORM_LOCATION_TYPES)[number]) ? (
          <option value={value}>{value}</option>
        ) : null}
      </select>
    </div>
  );
}

export function JobFormStepRequisition({
  job,
  ui,
  fieldErrors,
  professions,
  employmentTypes,
  onJobChange,
  onUiChange,
  onServiceAreaBlockedChange,
}: {
  job: JobRequisitionInput;
  ui: JobFormUiState;
  fieldErrors: Record<string, string>;
  professions: JobFormOption[];
  employmentTypes: EmploymentType[];
  onJobChange: <K extends keyof JobRequisitionInput>(key: K, value: JobRequisitionInput[K]) => void;
  onUiChange: (patch: Partial<JobFormUiState>) => void;
  onServiceAreaBlockedChange?: (blocked: boolean, message: string | null) => void;
}) {
  const requisitionEmploymentTypes = employmentTypes.filter(
    (type) => type === "W2" || type === "1099"
  );
  const employmentLabels = requisitionEmploymentTypes.map((type) => employmentTypeLabel(type));
  const deadlineBounds = applicationDeadlineBounds();

  return (
    <div className="flex flex-1 flex-col">
      <div className={`${JOB_FORM_FIELDS_CLASS} flex-1`}>
        <div className="grid gap-4 min-[700px]:grid-cols-2">
          {/* Job ID hidden for now
          <div>
            <label className={JOB_FORM_LABEL_CLASS} htmlFor="job-id">
              Job ID
            </label>
            <input
              id="job-id"
              className={JOB_FORM_INPUT_CLASS}
              value={job.internalRequisitionNumber ?? ""}
              onChange={(event) => onJobChange("internalRequisitionNumber", event.target.value)}
              placeholder="e.g. JR-1024"
            />
            <FieldError error={fieldErrors.internalRequisitionNumber} />
          </div>
          */}
          <div className="min-[700px]:col-span-2">
            <label className={JOB_FORM_LABEL_CLASS} htmlFor="job-title">
              Job Title
              <JobFormRequiredMark />
            </label>
            <input
              id="job-title"
              className={JOB_FORM_INPUT_CLASS}
              value={job.publicTitle ?? ""}
              onChange={(event) => onJobChange("publicTitle", event.target.value)}
            />
            <FieldError error={fieldErrors.publicTitle} />
          </div>
        </div>

        <div>
          {/* Job Industry — hidden on create/edit form (keep tenant primary industry_key for AI prompts).
          <div>
            <label className={JOB_FORM_LABEL_CLASS} htmlFor="job-industry">
              Job Industry
            </label>
            <select
              id="job-industry"
              className={JOB_FORM_SELECT_CLASS}
              style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
              value={job.industryKey ?? ""}
              onChange={(event) => onJobChange("industryKey", event.target.value || null)}
            >
              <option value="">Select industry</option>
              {activeUserFacingIndustries().map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
            <FieldError error={fieldErrors.industryKey} />
          </div>
          */}
          <label className={JOB_FORM_LABEL_CLASS} htmlFor="profession">
            Profession
            <JobFormRequiredMark />
          </label>
          <select
            id="profession"
            className={JOB_FORM_SELECT_CLASS}
            style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
            value={job.professionId ?? ""}
            onChange={(event) => {
              const nextId = event.target.value || null;
              const selected = professions.find((item) => item.id === nextId);
              onJobChange("professionId", nextId);
              onJobChange("profession", selected?.name ?? null);
              if ((job.professionId || null) !== nextId) {
                onJobChange("specialtyId", null);
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
          <FieldError error={fieldErrors.professionId} />
        </div>

        <div>
          <div className="flex flex-col gap-3 min-[700px]:flex-row min-[700px]:flex-wrap min-[700px]:items-center min-[700px]:gap-x-10 min-[700px]:gap-y-3">
            <span className={`${JOB_FORM_LABEL_CLASS} mb-0 shrink-0`}>
              Employment Type
              <JobFormRequiredMark />
            </span>
            <div className={JOB_FORM_RADIO_OPTIONS_CLASS}>
              {employmentLabels.map((label) => (
                <BrandedRadio
                  key={label}
                  name="employment-type"
                  label={label}
                  checked={Boolean(job.employmentType) && employmentTypeLabel(job.employmentType) === label}
                  onChange={() => {
                    const nextType = employmentTypeFromLabel(label);
                    onJobChange("employmentType", nextType);
                  }}
                />
              ))}
            </div>
          </div>
          <FieldError error={fieldErrors.employmentType} />
        </div>

        {/* Figma: 12px between Job Location and Add Additional Location row */}
        <div className={JOB_FORM_LOCATION_CLUSTER_CLASS}>
          <JobLocationAutocompleteField
            id="job-location"
            label="Job Location"
            required
            value={job.location ?? ""}
            onChange={(next) => onJobChange("location", next)}
            onPostalCodeChange={(postalCode) => onJobChange("postalCode", postalCode)}
            placeholder="Search city, area, or address"
            error={fieldErrors.location}
          />
          <ServiceAreaLocationHint
            locationText={job.location}
            postalCode={job.postalCode}
            locationType={ui.jobLocationType || job.jobLocationType}
            remoteAllowedStates={job.remoteAllowedStates}
            onBlockedChange={onServiceAreaBlockedChange}
          />

          <div className="flex flex-col gap-3 min-[700px]:flex-row min-[700px]:items-center min-[700px]:justify-between">
            <BrandedCheckbox
              checked={ui.showInMultipleAreas}
              onChange={(checked) =>
                onUiChange({
                  showInMultipleAreas: checked,
                  additionalLocations: checked ? ui.additionalLocations : [],
                })
              }
              label="I want to show my job in multiple areas"
              className="order-1 items-center min-[700px]:order-2"
            />
            {ui.showInMultipleAreas ? (
              <button
                type="button"
                className="order-2 inline-flex h-10 w-fit cursor-pointer items-center gap-2 self-end rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm font-medium text-[#1D2739] no-underline transition hover:bg-[#F8FAFC] min-[700px]:order-1 min-[700px]:self-auto"
                onClick={() =>
                  onUiChange({
                    additionalLocations: [...ui.additionalLocations, ""],
                  })
                }
              >
                <Plus className="h-4 w-4 shrink-0 text-[color:var(--brand-secondary)]" strokeWidth={2.5} />
                Add Additional Location
              </button>
            ) : (
              <span className="hidden min-[700px]:order-1 min-[700px]:block" />
            )}
          </div>

          {ui.showInMultipleAreas
            ? ui.additionalLocations.map((location, index) => (
                <div key={`extra-location-${index}`} className="flex gap-2">
                  <JobLocationAutocompleteField
                    id={`job-additional-location-${index}`}
                    label={`Additional location ${index + 1}`}
                    showLabel={false}
                    className="min-w-0 flex-1"
                    value={location}
                    placeholder="Search additional location"
                    onChange={(next) => {
                      const nextLocations = [...ui.additionalLocations];
                      nextLocations[index] = next;
                      onUiChange({ additionalLocations: nextLocations });
                    }}
                  />
                  <button
                    type="button"
                    className={`${JOB_FORM_OUTLINE_BUTTON_CLASS} shrink-0 self-start px-3`}
                    onClick={() =>
                      onUiChange({
                        additionalLocations: ui.additionalLocations.filter((_, i) => i !== index),
                      })
                    }
                    aria-label="Remove location"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                </div>
              ))
            : null}
        </div>

        <div className="grid gap-4 min-[700px]:grid-cols-2">
          <AcceptableMatchRateField
            id="job-acceptable-match-rate"
            value={job.acceptableMatchRate ?? ""}
            onChange={(next) => onJobChange("acceptableMatchRate", next || null)}
          />
          <div>
            <label className={JOB_FORM_LABEL_CLASS} htmlFor="job-location-type">
              Placement type
            </label>
            <select
              id="job-location-type"
              className={`${JOB_FORM_SELECT_CLASS} ${ui.jobLocationType ? "text-[#334155]" : "text-[#94A3B8]"}`}
              style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
              value={ui.jobLocationType}
              onChange={(event) => onUiChange({ jobLocationType: event.target.value })}
            >
              <option value="">Select Placement type</option>
              {JOB_FORM_LOCATION_TYPES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>
        {showsRemoteAllowedStatesField(ui.jobLocationType) ? (
          <RemoteAllowedStatesField
            value={job.remoteAllowedStates ?? []}
            scope={ui.remoteStatesScope}
            error={fieldErrors.remoteAllowedStates}
            required={isRemoteJobLocationType(ui.jobLocationType)}
            onChange={(next) => onJobChange("remoteAllowedStates", next)}
            onScopeChange={(next) => onUiChange({ remoteStatesScope: next })}
          />
        ) : null}

        <div className="grid gap-4 min-[700px]:grid-cols-2">
          <div>
            <label className={JOB_FORM_LABEL_CLASS} htmlFor="number-of-positions">
              Number of Positions
            </label>
            <div className={`${JOB_FORM_SURFACE_CLASS} flex h-10 w-full overflow-hidden`}>
              <input
                id="number-of-positions"
                type="number"
                min={1}
                inputMode="numeric"
                className="h-full min-w-0 flex-1 cursor-pointer border-0 bg-transparent px-3 text-sm text-[#334155] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                value={ui.numberOfPositions}
                onChange={(event) => {
                  const next = Math.max(1, Math.trunc(Number(event.target.value) || 1));
                  onUiChange({ numberOfPositions: next });
                }}
                aria-label="Number of Positions"
              />
              <div className="flex shrink-0 border-l border-[#CBD5E1]">
                <button
                  type="button"
                  className="inline-flex h-full w-10 cursor-pointer items-center justify-center bg-[#EEF2F6] text-[#64748B] transition hover:bg-[#E2E8F0] hover:text-[#334155]"
                  onClick={() => onUiChange({ numberOfPositions: ui.numberOfPositions + 1 })}
                  aria-label="Increase positions"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-full w-10 cursor-pointer items-center justify-center border-l border-[#CBD5E1] bg-white text-[#64748B] transition hover:bg-[#F8FAFC] hover:text-[#334155]"
                  onClick={() =>
                    onUiChange({
                      numberOfPositions: Math.max(1, ui.numberOfPositions - 1),
                    })
                  }
                  aria-label="Decrease positions"
                >
                  <Minus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <div>
            <label className={JOB_FORM_LABEL_CLASS} htmlFor="years-experience">
              Years of Experience
            </label>
            <select
              id="years-experience"
              className={`${JOB_FORM_SELECT_CLASS} ${ui.yearsOfExperience ? "text-[#334155]" : "text-[#94A3B8]"}`}
              style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
              value={ui.yearsOfExperience}
              onChange={(event) => onUiChange({ yearsOfExperience: event.target.value })}
            >
              <option value="">Select Years of Experience</option>
              {JOB_FORM_YEARS_OF_EXPERIENCE.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
              {ui.yearsOfExperience &&
              !JOB_FORM_YEARS_OF_EXPERIENCE.includes(
                ui.yearsOfExperience as (typeof JOB_FORM_YEARS_OF_EXPERIENCE)[number]
              ) ? (
                <option value={ui.yearsOfExperience}>{ui.yearsOfExperience}</option>
              ) : null}
            </select>
          </div>
        </div>

        <div className="grid gap-4 min-[700px]:grid-cols-1">
          <PublicField label="Application Deadline">
            <div className="relative">
              <input
                id="application-deadline"
                type="date"
                min={deadlineBounds.min}
                max={deadlineBounds.max}
                className={`${JOB_FORM_INPUT_CLASS} pr-10 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:h-10 [&::-webkit-calendar-picker-indicator]:w-10 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0`}
                value={job.applicationDeadline ?? ""}
                onChange={(event) => {
                  const next = event.target.value || null;
                  if (
                    next &&
                    (next < deadlineBounds.min || next > deadlineBounds.max)
                  ) {
                    return;
                  }
                  onJobChange("applicationDeadline", next);
                }}
              />
              <Calendar
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]"
                aria-hidden
              />
            </div>
          </PublicField>
        </div>
      </div>

      <div className={`${JOB_FORM_FIELDS_CLASS} mt-auto pt-[30px]`}>
        <JobTypeChipSelect
          value={job.shiftType ?? ""}
          onChange={(next) => onJobChange("shiftType", next)}
          error={fieldErrors.shiftType}
        />
      </div>
    </div>
  );
}

/** Figma: Job Source Details — only when Job Source = MSP. Avoids duplicating Job Location / public pay range. */
function JobFormMspPlacementBanner({
  placementType,
}: {
  placementType: "Recruit_and_Release" | "Recruit_and_EOR";
}) {
  const summary = MSP_PLACEMENT_SUMMARIES[placementType];
  const isRnr = placementType === "Recruit_and_Release";

  return (
    <div
      className={`overflow-hidden rounded-xl border shadow-sm ${
        isRnr
          ? "border-[color:color-mix(in_srgb,var(--brand-secondary)_22%,#E2E8F0)] bg-gradient-to-br from-[color:color-mix(in_srgb,var(--brand-secondary)_6%,white)] to-white"
          : "border-[color:color-mix(in_srgb,var(--brand-primary)_22%,#E2E8F0)] bg-gradient-to-br from-[color:color-mix(in_srgb,var(--brand-primary)_6%,white)] to-white"
      }`}
    >
      <div className="flex items-center gap-3 p-4 min-[700px]:p-5">
        <span
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
            isRnr
              ? "bg-[color:color-mix(in_srgb,var(--brand-secondary)_14%,white)] text-[color:var(--brand-secondary)]"
              : "bg-[color:color-mix(in_srgb,var(--brand-primary)_12%,white)] text-[color:var(--brand-primary)]"
          }`}
          aria-hidden
        >
          {isRnr ? "R&R" : "EOR"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[#1D2739]">{summary.title}</p>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                isRnr
                  ? "bg-[color:color-mix(in_srgb,var(--brand-secondary)_12%,white)] text-[color:var(--brand-secondary)]"
                  : "bg-[color:color-mix(in_srgb,var(--brand-primary)_10%,white)] text-[color:var(--brand-primary)]"
              }`}
            >
              {isRnr ? "Commission placement" : "Tenant employs"}
            </span>
          </div>
          {/* Descriptive bullet points hidden per product request — keep title + badge only.
          <ul className="mt-2.5 space-y-1.5">
            {summary.lines.map((line) => (
              <li key={line} className="flex gap-2 text-sm leading-5 text-[#64748B]">
                <span
                  className={`mt-2 h-1 w-1 shrink-0 rounded-full ${
                    isRnr ? "bg-[color:var(--brand-secondary)]" : "bg-[color:var(--brand-primary)]"
                  }`}
                  aria-hidden
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          */}
        </div>
      </div>
    </div>
  );
}

export function JobFormStepMspDetails({
  job,
  ui,
  fieldErrors,
  professions,
  onJobChange,
  onUiChange,
  onServiceAreaBlockedChange,
}: {
  job: JobRequisitionInput;
  ui: JobFormUiState;
  fieldErrors: Record<string, string>;
  professions: JobFormOption[];
  onJobChange: <K extends keyof JobRequisitionInput>(key: K, value: JobRequisitionInput[K]) => void;
  onUiChange: (patch: Partial<JobFormUiState>) => void;
  onServiceAreaBlockedChange?: (blocked: boolean, message: string | null) => void;
}) {
  const facilityValue = job.facility?.trim() || job.location?.trim() || "";
  const isMspEor = isMspRecruitAndEor(job);
  const mspPlacementKey: "Recruit_and_Release" | "Recruit_and_EOR" = isMspEor
    ? "Recruit_and_EOR"
    : "Recruit_and_Release";
  const payrollEmploymentTypes: EmploymentType[] = ["W2", "1099"];
  const payrollEmploymentLabels = payrollEmploymentTypes.map((type) => employmentTypeLabel(type));

  async function copySourceJobId() {
    const value = job.externalRequisitionId?.trim();
    if (!value || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* ignore clipboard errors */
    }
  }

  return (
    <div className={JOB_FORM_FIELDS_CLASS}>
      <JobFormMspPlacementBanner placementType={mspPlacementKey} />

      {isMspEor ? (
        <div>
          <div className="flex flex-col gap-3 min-[700px]:flex-row min-[700px]:flex-wrap min-[700px]:items-center min-[700px]:gap-x-10 min-[700px]:gap-y-3">
            <span className={`${JOB_FORM_LABEL_CLASS} mb-0 shrink-0`}>
              Payroll Employment Type
              <JobFormRequiredMark />
            </span>
            <div className={JOB_FORM_RADIO_OPTIONS_CLASS}>
              {payrollEmploymentLabels.map((label) => (
                <BrandedRadio
                  key={label}
                  name="msp-payroll-employment-type"
                  label={label}
                  checked={
                    Boolean(job.employmentType) &&
                    employmentTypeLabel(job.employmentType) === label
                  }
                  onChange={() => onJobChange("employmentType", employmentTypeFromLabel(label))}
                />
              ))}
            </div>
          </div>
          <FieldError error={fieldErrors.employmentType} />
        </div>
      ) : null}

      <div>
        <label className={JOB_FORM_LABEL_CLASS} htmlFor="source-job-title">
          Source Job Title
          <JobFormRequiredMark />
        </label>
        <input
          id="source-job-title"
          className={JOB_FORM_INPUT_CLASS}
          value={job.sourceJobTitle ?? ""}
          onChange={(event) => {
            const next = event.target.value;
            onJobChange("sourceJobTitle", next);
            // MSP: Job Title and Source Job Title are the same field.
            onJobChange("publicTitle", next);
          }}
          placeholder="e.g. Registered Nurse - Acute Care"
        />
        <FieldError error={fieldErrors.sourceJobTitle} />
      </div>

      <div>
        <label className={JOB_FORM_LABEL_CLASS} htmlFor="msp-profession">
          Profession
          <JobFormRequiredMark />
        </label>
        <select
          id="msp-profession"
          className={JOB_FORM_SELECT_CLASS}
          style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
          value={job.professionId ?? ""}
          onChange={(event) => {
            const nextId = event.target.value || null;
            const selected = professions.find((item) => item.id === nextId);
            onJobChange("professionId", nextId);
            onJobChange("profession", selected?.name ?? null);
            if ((job.professionId || null) !== nextId) {
              onJobChange("specialtyId", null);
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
        <FieldError error={fieldErrors.professionId} />
      </div>

      {/* Job Industry — hidden on MSP create/edit form (industry_key still from tenant primary).
      <div>
        <label className={JOB_FORM_LABEL_CLASS} htmlFor="msp-job-industry">
          Job Industry
        </label>
        <select
          id="msp-job-industry"
          className={JOB_FORM_SELECT_CLASS}
          style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
          value={job.industryKey ?? ""}
          onChange={(event) => onJobChange("industryKey", event.target.value || null)}
        >
          <option value="">Select industry</option>
          {activeUserFacingIndustries().map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
        <FieldError error={fieldErrors.industryKey} />
      </div>
      */}

      <div>
        <label className={JOB_FORM_LABEL_CLASS} htmlFor="source-job-id">
          Internal Reference / Source Job ID
        </label>
        <div className="relative">
          <input
            id="source-job-id"
            className={`${JOB_FORM_INPUT_CLASS} pr-10`}
            value={job.externalRequisitionId ?? ""}
            onChange={(event) => onJobChange("externalRequisitionId", event.target.value)}
            placeholder="e.g. 122ZO3892"
          />
          <button
            type="button"
            onClick={() => void copySourceJobId()}
            className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-[#94A3B8] transition hover:bg-[#F8FAFC] hover:text-[#334155]"
            aria-label="Copy Internal Reference / Source Job ID"
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
        <FieldError error={fieldErrors.externalRequisitionId} />
      </div>

      <div>
        <label className={JOB_FORM_LABEL_CLASS} htmlFor="msp-client-name">
          MSP Name
        </label>
        <input
          id="msp-client-name"
          className={JOB_FORM_INPUT_CLASS}
          value={job.mspClient ?? ""}
          onChange={(event) => onJobChange("mspClient", event.target.value)}
          placeholder="e.g. Novant"
        />
        <FieldError error={fieldErrors.mspClient} />
      </div>

      <div>
        <label className={JOB_FORM_LABEL_CLASS} htmlFor="msp-contract-group">
          Contract Group / Client
        </label>
        <input
          id="msp-contract-group"
          className={JOB_FORM_INPUT_CLASS}
          value={job.mspName ?? ""}
          onChange={(event) => onJobChange("mspName", event.target.value)}
          placeholder="e.g. Probationary"
        />
        <FieldError error={fieldErrors.mspName} />
      </div>

      <div>
        <JobLocationAutocompleteField
          id="msp-facility"
          label="Location"
          required
          value={facilityValue}
          onChange={(next) => {
            onJobChange("facility", next);
            onJobChange("location", next);
          }}
          onPostalCodeChange={(postalCode) => onJobChange("postalCode", postalCode)}
          placeholder="Search city, area, or address"
          error={fieldErrors.location}
        />
        <ServiceAreaLocationHint
          locationText={facilityValue}
          postalCode={job.postalCode}
          locationType={ui.jobLocationType || job.jobLocationType}
          remoteAllowedStates={job.remoteAllowedStates}
          onBlockedChange={onServiceAreaBlockedChange}
        />
      </div>

      <div>
        <label className={JOB_FORM_LABEL_CLASS} htmlFor="source-job-url">
          Direct Source Job URL
        </label>
        <input
          id="source-job-url"
          className={JOB_FORM_INPUT_CLASS}
          value={job.sourceJobUrl ?? ""}
          onChange={(event) => onJobChange("sourceJobUrl", event.target.value)}
          placeholder="https://"
        />
      </div>

      <div className="grid gap-4 min-[700px]:grid-cols-2">
        <div>
          <label className={JOB_FORM_LABEL_CLASS} htmlFor="msp-number-of-positions">
            Number of Positions
          </label>
          <select
            id="msp-number-of-positions"
            className={`${JOB_FORM_SELECT_CLASS} text-[#334155]`}
            style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
            value={ui.numberOfPositions}
            onChange={(event) =>
              onUiChange({
                numberOfPositions: Math.max(1, Math.trunc(Number(event.target.value) || 1)),
              })
            }
          >
            {JOB_FORM_NUMBER_OF_POSITION_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
            {ui.numberOfPositions > JOB_FORM_NUMBER_OF_POSITION_OPTIONS.length ? (
              <option value={ui.numberOfPositions}>{ui.numberOfPositions}</option>
            ) : null}
          </select>
        </div>

        <div>
          <label className={JOB_FORM_LABEL_CLASS} htmlFor="msp-years-experience">
            Years of Experience
          </label>
          <select
            id="msp-years-experience"
            className={`${JOB_FORM_SELECT_CLASS} ${ui.yearsOfExperience ? "text-[#334155]" : "text-[#94A3B8]"}`}
            style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
            value={ui.yearsOfExperience}
            onChange={(event) => onUiChange({ yearsOfExperience: event.target.value })}
          >
            <option value="">Select Years of Experience</option>
            {JOB_FORM_YEARS_OF_EXPERIENCE.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
            {ui.yearsOfExperience &&
            !JOB_FORM_YEARS_OF_EXPERIENCE.includes(
              ui.yearsOfExperience as (typeof JOB_FORM_YEARS_OF_EXPERIENCE)[number]
            ) ? (
              <option value={ui.yearsOfExperience}>{ui.yearsOfExperience}</option>
            ) : null}
          </select>
        </div>
      </div>

      <JobTypeChipSelect
        label="Job Type"
        value={job.shiftType ?? ""}
        onChange={(next) => onJobChange("shiftType", next)}
        error={fieldErrors.shiftType}
      />

      <div className="grid gap-4 min-[700px]:grid-cols-2">
        <WorkLocationTypeField
          id="msp-work-location-type"
          value={ui.jobLocationType}
          onChange={(next) => onUiChange({ jobLocationType: next })}
        />
        {showsRemoteAllowedStatesField(ui.jobLocationType) ? (
          <RemoteAllowedStatesField
            value={job.remoteAllowedStates ?? []}
            scope={ui.remoteStatesScope}
            error={fieldErrors.remoteAllowedStates}
            required={isRemoteJobLocationType(ui.jobLocationType)}
            onChange={(next) => onJobChange("remoteAllowedStates", next)}
            onScopeChange={(next) => onUiChange({ remoteStatesScope: next })}
          />
        ) : null}
      </div>

      <AcceptableMatchRateField
        id="msp-acceptable-match-rate"
        value={job.acceptableMatchRate ?? ""}
        onChange={(next) => onJobChange("acceptableMatchRate", next || null)}
      />

      {/* Required Credentials / Certifications & Special Requirement / Restrictions hidden for now
      <div>
        <label className={JOB_FORM_LABEL_CLASS} htmlFor="required-credentials">
          Required Credentials / Certifications
        </label>
        <input
          id="required-credentials"
          className={JOB_FORM_INPUT_CLASS}
          value={job.requiredCredentials ?? ""}
          onChange={(event) => onJobChange("requiredCredentials", event.target.value)}
          placeholder="Required Credentials / Certifications"
        />
      </div>

      <div>
        <label className={JOB_FORM_LABEL_CLASS} htmlFor="special-requirements">
          Special Requirement / Restrictions
        </label>
        <input
          id="special-requirements"
          className={JOB_FORM_INPUT_CLASS}
          value={job.specialRequirements ?? ""}
          onChange={(event) => onJobChange("specialRequirements", event.target.value)}
          placeholder="Special Requirement / Restrictions"
        />
      </div>
      */}

      {/* Job Details hidden for now
      <div>
        <label className={JOB_FORM_LABEL_CLASS} htmlFor="source-job-details">
          Job Details
        </label>
        <select
          id="source-job-details"
          className={JOB_FORM_SELECT_CLASS}
          style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
          value={job.sourceJobDetails ?? ""}
          onChange={(event) => onJobChange("sourceJobDetails", event.target.value || null)}
        >
          <option value="">Select</option>
          {JOB_FORM_MSP_JOB_DETAIL_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
          {job.sourceJobDetails &&
          !JOB_FORM_MSP_JOB_DETAIL_OPTIONS.includes(
            job.sourceJobDetails as (typeof JOB_FORM_MSP_JOB_DETAIL_OPTIONS)[number]
          ) ? (
            <option value={job.sourceJobDetails}>{job.sourceJobDetails}</option>
          ) : null}
        </select>
      </div>
      */}

      <div>
        <label className={JOB_FORM_LABEL_CLASS} htmlFor="internal-notes">
          Internal Notes
        </label>
        <textarea
          id="internal-notes"
          className={`${JOB_FORM_TEXTAREA_CLASS} min-h-[140px]`}
          value={job.internalNotes ?? ""}
          onChange={(event) => onJobChange("internalNotes", event.target.value)}
        />
      </div>
    </div>
  );
}

export function JobFormStepCompensation({
  job,
  ui,
  fieldErrors,
  onJobChange,
  onUiChange,
}: {
  job: JobRequisitionInput;
  ui: JobFormUiState;
  fieldErrors: Record<string, string>;
  onJobChange: <K extends keyof JobRequisitionInput>(key: K, value: JobRequisitionInput[K]) => void;
  onUiChange: (patch: Partial<JobFormUiState>) => void;
}) {
  const [creatingBenefit, setCreatingBenefit] = useState(false);
  const [newBenefitName, setNewBenefitName] = useState("");
  const isMspRnr = isMspRecruitAndRelease(job);
  const hoursShowBy = ui.hoursShowBy || "Fixed Hours";
  const showFixedHours = hoursShowBy === "Fixed Hours";

  const benefitOptions = [
    ...JOB_FORM_BENEFIT_OPTIONS,
    ...ui.customBenefits.filter(
      (item) => !(JOB_FORM_BENEFIT_OPTIONS as readonly string[]).includes(item)
    ),
  ];

  function toggleBenefit(benefit: string) {
    const selected = ui.selectedBenefits.includes(benefit);
    onUiChange({
      selectedBenefits: selected
        ? ui.selectedBenefits.filter((item) => item !== benefit)
        : [...ui.selectedBenefits, benefit],
    });
  }

  function addCustomBenefit() {
    const name = newBenefitName.trim();
    if (!name) return;
    const exists = benefitOptions.some(
      (item) => item.toLowerCase() === name.toLowerCase()
    );
    if (exists) {
      if (!ui.selectedBenefits.some((item) => item.toLowerCase() === name.toLowerCase())) {
        const match =
          benefitOptions.find((item) => item.toLowerCase() === name.toLowerCase()) ?? name;
        onUiChange({ selectedBenefits: [...ui.selectedBenefits, match] });
      }
      setNewBenefitName("");
      setCreatingBenefit(false);
      return;
    }
    onUiChange({
      customBenefits: [...ui.customBenefits, name],
      selectedBenefits: [...ui.selectedBenefits, name],
    });
    setNewBenefitName("");
    setCreatingBenefit(false);
  }

  function handleCommissionFeeTypeChange(next: CommissionFeeType) {
    onUiChange({ commissionFeeType: next });
    if (next === "percentage") {
      onJobChange("commissionFixedAmount", null);
    } else if (next === "fixed_amount") {
      onJobChange("commissionPercent", null);
    } else {
      onJobChange("commissionPercent", null);
      onJobChange("commissionFixedAmount", null);
    }
  }

  if (isMspRnr) {
    const commissionEstimate = formatCommissionEstimateFromPayRate(job, ui);
    const rnrShowPayBy = ui.showPayBy || "Range";
    const rnrRatePeriod = ui.payRatePeriod || "Hourly";

    return (
      <div className="space-y-8">
        <section className={JOB_FORM_FIELDS_CLASS}>
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
                  onUiChange({ showPayBy: next });
                  if (next !== "Range") {
                    onJobChange("payRateMax", null);
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
                      value={job.payRateMin ?? ""}
                      onChange={(event) =>
                        onJobChange(
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
                      value={job.payRateMax ?? ""}
                      onChange={(event) =>
                        onJobChange(
                          "payRateMax",
                          event.target.value ? Number(event.target.value) : null
                        )
                      }
                    />
                  </div>
                  <FieldError error={fieldErrors.payRateMax} />
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
                    value={job.payRateMin ?? ""}
                    onChange={(event) =>
                      onJobChange(
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
                  onUiChange({
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

          <div className="mt-4 grid gap-4 min-[700px]:grid-cols-2">
            <div>
              <label className={JOB_FORM_LABEL_CLASS} htmlFor="rnr-job-duration">
                Duration
              </label>
              <input
                id="rnr-job-duration"
                type="text"
                className={JOB_FORM_INPUT_CLASS}
                value={job.duration ?? ""}
                onChange={(event) => onJobChange("duration", event.target.value || null)}
                placeholder={JOB_FORM_DURATION_PLACEHOLDER}
                autoComplete="off"
              />
            </div>

            <div>
              <label className={JOB_FORM_LABEL_CLASS} htmlFor="rnr-start-date">
                Start Date
              </label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  id="rnr-start-date"
                  type="date"
                  className={`${JOB_FORM_INPUT_CLASS} pl-9`}
                  value={job.targetStartDate ?? ""}
                  onChange={(event) => onJobChange("targetStartDate", event.target.value || null)}
                />
              </div>
            </div>
          </div>
        </section>

        <hr className="border-[#E5E7EB]" />

        <section className="flex flex-col gap-[15px]">
          <h3 className={JOB_FORM_SECTION_TITLE_CLASS}>Expected hours</h3>
          <div
            className={`grid gap-4 min-[700px]:items-end ${
              showFixedHours
                ? "min-[700px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]"
                : "min-[700px]:grid-cols-[minmax(0,1.2fr)]"
            }`}
          >
            <div className="min-w-0">
              <label className={JOB_FORM_LABEL_CLASS}>Show by</label>
              <select
                className={`${JOB_FORM_SELECT_CLASS} text-[#334155]`}
                style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
                value={hoursShowBy}
                onChange={(event) => {
                  const next = event.target.value;
                  onUiChange({ hoursShowBy: next });
                  onJobChange("shiftDetails", next || null);
                }}
              >
                {JOB_FORM_HOURS_SHOW_BY.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            {showFixedHours ? (
              <>
                <div className="min-w-0">
                  <label className={JOB_FORM_LABEL_CLASS} htmlFor="rnr-hours-per-week">
                    Fixed at
                  </label>
                  <input
                    id="rnr-hours-per-week"
                    type="number"
                    min="0"
                    step="1"
                    className={JOB_FORM_INPUT_CLASS}
                    value={job.hoursPerWeek ?? ""}
                    onChange={(event) =>
                      onJobChange(
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
        </section>

        <hr className="border-[#E5E7EB]" />

        <section className="flex flex-col gap-[15px]">
          <h3 className={JOB_FORM_SECTION_TITLE_CLASS}>Commission fees</h3>
          <div className="grid gap-4 min-[700px]:grid-cols-2">
            <div>
              <label className={JOB_FORM_LABEL_CLASS} htmlFor="commission-fee-type">
                Please select commission fees
              </label>
              <select
                id="commission-fee-type"
                className={JOB_FORM_SELECT_CLASS}
                style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
                value={ui.commissionFeeType}
                onChange={(event) =>
                  handleCommissionFeeTypeChange(event.target.value as CommissionFeeType)
                }
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
              {!ui.commissionFeeType && fieldErrors.commissionPercent ? (
                <FieldError error={fieldErrors.commissionPercent} />
              ) : null}
            </div>

            {ui.commissionFeeType === "percentage" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="commission-percent">
                  Commission Percentage
                </label>
                <div className="relative">
                  <input
                    id="commission-percent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    className={`${JOB_FORM_INPUT_CLASS} pr-10`}
                    value={job.commissionPercent ?? ""}
                    onChange={(event) =>
                      onJobChange(
                        "commissionPercent",
                        event.target.value ? Number(event.target.value) : null
                      )
                    }
                    placeholder="e.g. 15"
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
                <FieldError error={fieldErrors.commissionPercent} />
              </div>
            ) : null}

            {ui.commissionFeeType === "fixed_amount" ? (
              <div>
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="commission-fixed-amount">
                  Fixed Commission Amount
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#94A3B8]">
                    $
                  </span>
                  <input
                    id="commission-fixed-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    className={`${JOB_FORM_INPUT_CLASS} pl-7 pr-14`}
                    value={job.commissionFixedAmount ?? ""}
                    onChange={(event) =>
                      onJobChange(
                        "commissionFixedAmount",
                        event.target.value ? Number(event.target.value) : null
                      )
                    }
                    placeholder="e.g. 2500"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[#94A3B8]">
                    USD
                  </span>
                </div>
                <FieldError error={fieldErrors.commissionFixedAmount} />
              </div>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className={JOB_FORM_FIELDS_CLASS}>
        <div>
          <label className={JOB_FORM_LABEL_CLASS}>Compensation</label>
          <select
            className={`${JOB_FORM_SELECT_CLASS} ${ui.compensationType ? "text-[#334155]" : "text-[#94A3B8]"}`}
            style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
            value={ui.compensationType}
            onChange={(event) =>
              onUiChange({
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
            {ui.compensationType &&
            !JOB_FORM_COMPENSATION_TYPES.includes(
              ui.compensationType as (typeof JOB_FORM_COMPENSATION_TYPES)[number]
            ) ? (
              <option value={ui.compensationType}>{ui.compensationType}</option>
            ) : null}
          </select>
        </div>

        <div
          className={`mt-4 grid gap-4 min-[700px]:items-end ${
            ui.showPayBy === "Range"
              ? "min-[700px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto_minmax(0,1fr)]"
              : "min-[700px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
          }`}
        >
          <div className="min-w-0">
            <label className={JOB_FORM_LABEL_CLASS}>Show pay by</label>
            <select
              className={`${JOB_FORM_SELECT_CLASS} text-[#334155]`}
              style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
              value={ui.showPayBy || "Exact amount"}
              onChange={(event) => {
                const next = event.target.value;
                onUiChange({ showPayBy: next });
                if (next !== "Range") {
                  onJobChange("payRateMax", null);
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

          {ui.showPayBy === "Range" ? (
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
                    value={job.payRateMin ?? ""}
                    onChange={(event) =>
                      onJobChange(
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
                    value={job.payRateMax ?? ""}
                    onChange={(event) =>
                      onJobChange(
                        "payRateMax",
                        event.target.value ? Number(event.target.value) : null
                      )
                    }
                  />
                </div>
                <FieldError error={fieldErrors.payRateMax} />
              </div>
            </>
          ) : (
            <div className="min-w-0">
              <label className={JOB_FORM_LABEL_CLASS}>
                {ui.showPayBy === "Starting amount" ? "Starting amount" : "Exact amount"}
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
                  value={job.payRateMin ?? ""}
                  onChange={(event) =>
                    onJobChange(
                      "payRateMin",
                      event.target.value ? Number(event.target.value) : null
                    )
                  }
                />
              </div>
            </div>
          )}

          {/* Rate duplicates Compensation (Hourly / Weekly / Monthly / Annually) — hidden in create flow.
          <div className="min-w-0">
            <label className={JOB_FORM_LABEL_CLASS}>Rate</label>
            <select
              className={`${JOB_FORM_SELECT_CLASS} ${ui.payRatePeriod ? "text-[#334155]" : "text-[#94A3B8]"}`}
              style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
              value={ui.payRatePeriod}
              onChange={(event) => onUiChange({ payRatePeriod: event.target.value })}
            >
              <option value="">Select Rate</option>
              {JOB_FORM_PAY_PERIODS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
              {ui.payRatePeriod &&
              !JOB_FORM_PAY_PERIODS.includes(
                ui.payRatePeriod as (typeof JOB_FORM_PAY_PERIODS)[number]
              ) ? (
                <option value={ui.payRatePeriod}>{ui.payRatePeriod}</option>
              ) : null}
            </select>
          </div>
          */}
        </div>

        <div className="mt-4 grid gap-4 min-[700px]:grid-cols-2">
          <div>
            <label className={JOB_FORM_LABEL_CLASS} htmlFor="job-duration">
              Duration
            </label>
            <input
              id="job-duration"
              type="text"
              className={JOB_FORM_INPUT_CLASS}
              value={job.duration ?? ""}
              onChange={(event) => onJobChange("duration", event.target.value || null)}
              placeholder={JOB_FORM_DURATION_PLACEHOLDER}
              autoComplete="off"
            />
          </div>

          <div>
            <label className={JOB_FORM_LABEL_CLASS} htmlFor="compensation-start-date">
              Start Date
            </label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
              <input
                id="compensation-start-date"
                type="date"
                className={`${JOB_FORM_INPUT_CLASS} pl-9`}
                value={job.targetStartDate ?? ""}
                onChange={(event) => onJobChange("targetStartDate", event.target.value || null)}
              />
            </div>
          </div>
        </div>
      </section>

      <hr className="border-[#E5E7EB]" />

      <section className="flex flex-col gap-[15px]">
        <h3 className={JOB_FORM_SECTION_TITLE_CLASS}>Expected hours</h3>
        <div
          className={`grid gap-4 min-[700px]:items-end ${
            showFixedHours
              ? "min-[700px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]"
              : "min-[700px]:grid-cols-[minmax(0,1.2fr)]"
          }`}
        >
          <div className="min-w-0">
            <label className={JOB_FORM_LABEL_CLASS}>Show by</label>
            <select
              className={`${JOB_FORM_SELECT_CLASS} text-[#334155]`}
              style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
              value={hoursShowBy}
              onChange={(event) => {
                const next = event.target.value;
                onUiChange({ hoursShowBy: next });
                onJobChange("shiftDetails", next || null);
              }}
            >
              {JOB_FORM_HOURS_SHOW_BY.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          {showFixedHours ? (
            <>
              <div className="min-w-0">
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="hours-per-week">
                  Fixed at
                </label>
                <input
                  id="hours-per-week"
                  type="number"
                  min="0"
                  step="1"
                  className={JOB_FORM_INPUT_CLASS}
                  value={job.hoursPerWeek ?? ""}
                  onChange={(event) =>
                    onJobChange(
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
      </section>

      <hr className="border-[#E5E7EB]" />

      <section className="space-y-4">
        <BenefitsChipSelect
          labelClassName={JOB_FORM_SECTION_TITLE_CLASS}
          options={benefitOptions}
          selected={ui.selectedBenefits}
          onToggle={toggleBenefit}
          customBenefits={ui.customBenefits}
          onRemoveCustom={(benefit) => {
            onUiChange({
              customBenefits: ui.customBenefits.filter((item) => item !== benefit),
              selectedBenefits: ui.selectedBenefits.filter((item) => item !== benefit),
            });
          }}
          headerAction={
            !creatingBenefit ? (
              <button
                type="button"
                onClick={() => setCreatingBenefit(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-[color:var(--brand-secondary)] transition hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                Create Benefit
              </button>
            ) : null
          }
        />

        {creatingBenefit ? (
          <div className="flex w-full flex-col gap-2 min-[700px]:flex-row min-[700px]:flex-wrap min-[700px]:items-center">
            <input
              autoFocus
              className={`${JOB_FORM_INPUT_CLASS} w-full min-[700px]:max-w-xs`}
              value={newBenefitName}
              onChange={(event) => setNewBenefitName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addCustomBenefit();
                }
                if (event.key === "Escape") {
                  setCreatingBenefit(false);
                  setNewBenefitName("");
                }
              }}
              placeholder="Enter benefit name"
              aria-label="New benefit name"
            />
            <button
              type="button"
              onClick={addCustomBenefit}
              className={JOB_FORM_PRIMARY_BUTTON_CLASS}
              style={{
                backgroundColor: "var(--brand-primary)",
                borderColor: "var(--brand-primary)",
              }}
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setCreatingBenefit(false);
                setNewBenefitName("");
              }}
              className={JOB_FORM_OUTLINE_BUTTON_CLASS}
            >
              Cancel
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function JobFormStepDescription({
  job,
  ui,
  fieldErrors,
  onJobChange,
  professionName = "",
  specialtyName = "",
  companyName = "",
  brandStyle,
  screeningQuestions,
  onScreeningQuestionsChange,
}: {
  job: JobRequisitionInput;
  ui: JobFormUiState;
  fieldErrors: Record<string, string>;
  onJobChange: <K extends keyof JobRequisitionInput>(key: K, value: JobRequisitionInput[K]) => void;
  professionName?: string;
  specialtyName?: string;
  companyName?: string;
  brandStyle?: CSSProperties;
  screeningQuestions?: JobScreeningQuestionInput[];
  onScreeningQuestionsChange?: (questions: JobScreeningQuestionInput[]) => void;
}) {
  return (
    <section className="space-y-4">
      <JobDescriptionWithAiSuggest
        value={job.publicDescription ?? ""}
        onChange={(next) => onJobChange("publicDescription", next)}
        error={fieldErrors.publicDescription}
        brandStyle={brandStyle}
        buildPayload={() => {
          const shiftParts = [job.shiftType, job.shiftDetails, job.schedule]
            .map((item) => item?.trim())
            .filter(Boolean);
          const benefitList =
            ui.selectedBenefits.length > 0
              ? ui.selectedBenefits
              : (job.benefits ?? "")
                  .split(/[,;\n]/)
                  .map((item) => item.trim())
                  .filter(Boolean);

          return {
            // MSP: prefer source job title so About the Role is not driven by opaque codes.
            jobTitle:
              job.sourceType === "MSP"
                ? job.sourceJobTitle || job.publicTitle || null
                : job.publicTitle || null,
            profession: professionName || null,
            specialty: specialtyName || null,
            employmentType: job.employmentType || null,
            location: job.location || job.facility || null,
            locationType: job.jobLocationType || ui.jobLocationType || null,
            yearsOfExperience: job.yearsOfExperience || ui.yearsOfExperience || null,
            numberOfPositions: job.numberOfPositions ?? ui.numberOfPositions ?? null,
            shiftOrSchedule: shiftParts.length ? shiftParts.join(" · ") : null,
            benefits: benefitList,
            responsibilities: job.responsibilities,
            qualifications: job.qualifications,
            companyName: companyName || null,
            department: job.department,
            facility: job.facility,
            duration: job.duration,
            requiredCredentials: job.requiredCredentials,
            specialRequirements: job.specialRequirements,
            additionalLocations: job.additionalLocations ?? ui.additionalLocations ?? [],
            sourceType: job.sourceType || "Internal",
            mspName: job.sourceType === "MSP" ? job.mspName : null,
            mspClient: job.sourceType === "MSP" ? job.mspClient : null,
            sourceJobTitle: job.sourceType === "MSP" ? job.sourceJobTitle : null,
            sourceJobDetails: job.sourceType === "MSP" ? job.sourceJobDetails : null,
            targetStartDate: job.sourceType === "MSP" ? job.targetStartDate : null,
            placementType: job.sourceType === "MSP" ? job.placementType : null,
          };
        }}
      />
      {screeningQuestions && onScreeningQuestionsChange ? (
        <JobScreeningQuestionsEditor
          questions={screeningQuestions}
          onChange={onScreeningQuestionsChange}
        />
      ) : null}
    </section>
  );
}

function formatReviewMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "";
  return `$${value}`;
}

function formatReviewDate(value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return raw;
  return `${match[2]}/${match[3]}/${match[1]}`;
}

function isReviewValueEmpty(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  return !trimmed || trimmed === "—" || trimmed === "-";
}

function reviewAddLabel(label: string, addLabel?: string): string {
  if (addLabel?.trim()) return addLabel.trim();
  return label.trim().toLowerCase();
}

function ReviewAddPlusIcon() {
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-primary)] text-white"
      aria-hidden
    >
      <Plus className="h-3 w-3" strokeWidth={2.75} />
    </span>
  );
}

function ReviewLockedHelpButton({ message }: { message: string }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    const width = 260;
    const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
    setPosition({ top: rect.bottom + 8, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-[#94A3B8] transition hover:text-[#64748B]"
        aria-label="Why can't this be edited?"
        aria-expanded={open}
        aria-describedby={open ? "review-locked-help-popover" : undefined}
      >
        <HelpCircle className="h-4 w-4" strokeWidth={2} />
      </button>
      {open && position && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              id="review-locked-help-popover"
              role="tooltip"
              style={{ position: "fixed", top: position.top, left: position.left, zIndex: 200 }}
              className="w-[260px] rounded-lg border border-[#E5E7EB] bg-white px-3 py-2.5 text-left text-xs leading-5 text-[#475569] shadow-lg"
            >
              {message}
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function ReviewRow({
  label,
  value,
  onEdit,
  addLabel,
  readOnly = false,
  valueAsChip = false,
  lockedNotice,
  error,
}: {
  label: string;
  value: string;
  onEdit?: () => void;
  /** Custom text after “Add” when empty (defaults to lowercased label). */
  addLabel?: string;
  /** Hide edit control — used for fields locked after earlier steps (Figma review). */
  readOnly?: boolean;
  /** Render the value inside a grey pill (employment type on review). */
  valueAsChip?: boolean;
  /** “Cannot be edited” hint with tooltip on the trailing column. */
  lockedNotice?: { tooltip: string };
  error?: string;
}) {
  const empty = isReviewValueEmpty(value);
  const editable = Boolean(onEdit) && !readOnly;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 py-3 min-[700px]:grid-cols-[220px_1fr_auto] min-[700px]:gap-x-2 min-[700px]:gap-y-0">
      <div className="col-span-2 text-sm font-medium text-[#64748B] min-[700px]:col-span-1">{label}</div>
      <div className="min-w-0 text-sm text-[#1D2739]">
        {empty ? (
          readOnly ? (
            <span className="text-[#94A3B8]">—</span>
          ) : editable ? (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[color:var(--brand-primary)] transition hover:opacity-90"
            >
              <ReviewAddPlusIcon />
              Add {reviewAddLabel(label, addLabel)}
            </button>
          ) : (
            <span className="inline-flex items-center gap-2 font-medium text-[color:var(--brand-primary)]">
              <ReviewAddPlusIcon />
              Add {reviewAddLabel(label, addLabel)}
            </span>
          )
        ) : valueAsChip ? (
          <span className="inline-flex rounded-full bg-[#EEF2F6] px-3 py-1 text-sm font-medium text-[#1D2739]">
            {value}
          </span>
        ) : (
          <div className="whitespace-pre-line">{value}</div>
        )}
        {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
      </div>
      {editable ? (
        <button
          type="button"
          onClick={onEdit}
          className={`${JOB_FORM_ICON_BUTTON_CLASS} shrink-0 self-center`}
          aria-label={empty ? `Add ${reviewAddLabel(label, addLabel)}` : `Edit ${label}`}
        >
          <Pencil className="h-4 w-4" />
        </button>
      ) : lockedNotice ? (
        <div className="col-span-2 flex items-center justify-end gap-1.5 self-center min-[700px]:col-span-1">
          <span className="text-sm text-[#94A3B8]">Cannot be edited</span>
          <ReviewLockedHelpButton message={lockedNotice.tooltip} />
        </div>
      ) : null}
    </div>
  );
}

export function JobFormStepReview({
  job,
  ui,
  professionName,
  onEditField,
  brandVars,
  fieldErrors = {},
  onServiceAreaBlockedChange,
}: {
  job: JobRequisitionInput;
  ui: JobFormUiState;
  professionName: string;
  onEditField: (field: ReviewEditFieldId) => void;
  brandVars?: CSSProperties;
  fieldErrors?: Record<string, string>;
  onServiceAreaBlockedChange?: (blocked: boolean, message: string | null) => void;
}) {
  const [descriptionViewOpen, setDescriptionViewOpen] = useState(false);
  const descriptionHtml = job.publicDescription?.trim() || "";
  const descriptionPlain = jobDescriptionPlainText(descriptionHtml);
  const hasDescription = Boolean(descriptionPlain.trim());
  const shortDescription =
    descriptionPlain.length > 180
      ? `${descriptionPlain.slice(0, 180).trim()}…`
      : descriptionPlain;
  const isTruncated = descriptionPlain.length > 180;
  const additionalLocationsValue = ui.additionalLocations.map((item) => item.trim()).filter(Boolean).join(", ");
  const employmentTypeValue = job.employmentType
    ? employmentTypeLabel(job.employmentType)
    : "";
  const compensationValue = (() => {
    const paySummary = formatPaySummary(job, ui);
    const payLine = [ui.showPayBy, paySummary !== "—" ? paySummary : ""].filter(Boolean).join(", ");
    const hoursLine =
      ui.hoursShowBy === "Fixed Hours" && job.hoursPerWeek != null
        ? `${ui.hoursShowBy}: ${job.hoursPerWeek} hrs/week`
        : ui.hoursShowBy || "";
    const durationLine = [job.duration, job.targetStartDate ? formatReviewDate(job.targetStartDate) : ""]
      .filter(Boolean)
      .join(", ");
    return [
      ui.compensationType,
      payLine,
      durationLine,
      hoursLine,
    ]
      .filter(Boolean)
      .join("\n");
  })();
  const mspPayRateValue = formatPaySummary(job, ui);
  const isMspRnr = isMspRecruitAndRelease(job);
  const isMspEor = isMspRecruitAndEor(job);
  const commissionFeeTypeLabel = formatCommissionFeeTypeLabel(ui.commissionFeeType);
  const commissionPercentValue = formatCommissionPercentValue(job);
  const commissionFixedValue = formatCommissionFixedValue(job);
  const commissionEstimate = formatCommissionEstimateFromPayRate(job, ui);
  const expectedHoursValue = formatExpectedHoursValue(job, ui);
  const ratePeriodLabel = formatPayRatePeriodLabel(ui.payRatePeriod || ui.compensationType);
  const showRemoteStates = showsRemoteAllowedStatesField(ui.jobLocationType);
  const remoteStatesValue = formatRemoteAllowedStatesLabel(job.remoteAllowedStates);

  return (
    <section className="space-y-1">
      <ServiceAreaLocationHint
        silent
        locationText={job.facility?.trim() || job.location}
        postalCode={job.postalCode}
        locationType={ui.jobLocationType || job.jobLocationType}
        remoteAllowedStates={job.remoteAllowedStates}
        onBlockedChange={onServiceAreaBlockedChange}
      />
      <div className="mb-4">
        <h2 className={JOB_FORM_SECTION_TITLE_CLASS}>Job Details</h2>
      </div>

      {/* Job ID hidden for now
      <ReviewRow
        label="Job ID"
        value={job.internalRequisitionNumber ?? ""}
        onEdit={() => onEditField("jobId")}
      />
      */}
      {job.sourceType !== "MSP" ? (
        <ReviewRow
          label="Job Title"
          value={job.publicTitle?.trim() || ""}
          onEdit={() => onEditField("jobTitle")}
        />
      ) : null}
      {job.sourceType !== "MSP" ? (
        <ReviewRow label="Profession" value={professionName} readOnly />
      ) : null}
      {job.sourceType !== "MSP" ? (
        <>
          <ReviewRow
            label="Job Location"
            value={job.location ?? ""}
            error={fieldErrors.location}
            onEdit={() => onEditField("jobLocation")}
          />
          <ReviewRow
            label="Add Additional Location"
            value={additionalLocationsValue}
            addLabel="optional job information"
            onEdit={() => onEditField("additionalLocation")}
          />
          <ReviewRow
            label="Acceptable Match Rate"
            value={job.acceptableMatchRate ?? ""}
            addLabel="acceptable match rate"
            onEdit={() => onEditField("acceptableMatchRate")}
          />
          <ReviewRow
            label="Placement type"
            value={ui.jobLocationType}
            onEdit={() => onEditField("jobLocationType")}
          />
          {showRemoteStates ? (
            <ReviewRow
              label="Remote work allowed in"
              value={remoteStatesValue}
              addLabel="allowed states"
              error={fieldErrors.remoteAllowedStates}
              onEdit={() => onEditField("remoteAllowedStates")}
            />
          ) : null}
          <ReviewRow
            label="Number of Positions"
            value={ui.numberOfPositions > 0 ? String(ui.numberOfPositions) : ""}
            onEdit={() => onEditField("numberOfPositions")}
          />
          <ReviewRow
            label="Years of Experience"
            value={ui.yearsOfExperience}
            onEdit={() => onEditField("yearsOfExperience")}
          />
        </>
      ) : null}
      {job.sourceType !== "MSP" ? (
        <ReviewRow
          label="Employment Type"
          value={employmentTypeValue}
          readOnly
          valueAsChip={Boolean(employmentTypeValue)}
          lockedNotice={{ tooltip: REVIEW_LOCKED_EMPLOYMENT_TYPE_TOOLTIP }}
        />
      ) : isMspEor ? (
        <ReviewRow
          label="Payroll Employment Type"
          value={job.employmentType === "1099" ? "1099" : job.employmentType === "W2" ? "W2" : employmentTypeValue}
          readOnly
          valueAsChip={Boolean(job.employmentType)}
          lockedNotice={{ tooltip: REVIEW_LOCKED_EMPLOYMENT_TYPE_TOOLTIP }}
        />
      ) : null}
      {job.sourceType !== "MSP" ? (
        <ReviewRow
          label="Job Type"
          value={job.shiftType ?? ""}
          onEdit={() => onEditField("jobType")}
        />
      ) : null}
      {job.sourceType !== "MSP" ? (
        <ReviewRow
          label="Application Deadline"
          value={formatReviewDate(job.applicationDeadline)}
          addLabel="application deadline"
          onEdit={() => onEditField("applicationDeadline")}
        />
      ) : null}
      {/* EOR hidden on review — removed from create job flow
      <ReviewRow
        label="Are you the employer on Record"
        value={
          ui.employerOnRecord === "yes" ? "Yes" : ui.employerOnRecord === "no" ? "No" : ""
        }
        addLabel="employer on record"
        onEdit={() => onEditField("employerOnRecord")}
      />
      {ui.employerOnRecord === "yes" ? (
        <ReviewRow
          label="Employer on Record"
          value={job.employerOfRecord ?? ""}
          onEdit={() => onEditField("employerOfRecord")}
        />
      ) : null}
      */}
      {job.sourceType === "MSP" ? (
        <>
          <ReviewRow
            label="MSP Placement"
            value={
              job.placementType === "Recruit_and_EOR"
                ? PLACEMENT_TYPE_LABELS.Recruit_and_EOR
                : PLACEMENT_TYPE_LABELS.Recruit_and_Release
            }
            readOnly
          />
          <ReviewRow
            label="Source Job Title"
            value={job.sourceJobTitle ?? ""}
            onEdit={() => onEditField("sourceJobTitle")}
          />
          <ReviewRow label="Profession" value={professionName} readOnly />
          <ReviewRow
            label="Internal Reference / Source Job ID"
            value={job.externalRequisitionId ?? ""}
            addLabel="source job ID"
            onEdit={() => onEditField("sourceJobId")}
          />
          <ReviewRow
            label="MSP Name"
            value={job.mspClient ?? ""}
            addLabel="MSP name"
            onEdit={() => onEditField("mspClient")}
          />
          <ReviewRow
            label="Contract Group / Client"
            value={job.mspName ?? ""}
            addLabel="contract group"
            onEdit={() => onEditField("mspName")}
          />
          <ReviewRow
            label="Location"
            value={job.facility?.trim() || job.location?.trim() || ""}
            addLabel="location"
            error={fieldErrors.location}
            onEdit={() => onEditField("facilityLocation")}
          />
          <ReviewRow
            label="Direct Source Job URL"
            value={job.sourceJobUrl ?? ""}
            addLabel="source job URL"
            onEdit={() => onEditField("sourceJobUrl")}
          />
          <ReviewRow
            label="Number of Positions"
            value={ui.numberOfPositions > 0 ? String(ui.numberOfPositions) : ""}
            onEdit={() => onEditField("numberOfPositions")}
          />
          <ReviewRow
            label="Years of Experience"
            value={ui.yearsOfExperience}
            addLabel="years of experience"
            onEdit={() => onEditField("yearsOfExperience")}
          />
          <ReviewRow
            label="Job Type"
            value={job.shiftType ?? ""}
            addLabel="job type"
            onEdit={() => onEditField("jobType")}
          />
          <ReviewRow
            label="Acceptable Match Rate"
            value={job.acceptableMatchRate ?? ""}
            addLabel="acceptable match rate"
            onEdit={() => onEditField("acceptableMatchRate")}
          />
          <ReviewRow
            label="Work Location Type"
            value={ui.jobLocationType}
            addLabel="work location type"
            onEdit={() => onEditField("jobLocationType")}
          />
          {showRemoteStates ? (
            <ReviewRow
              label="Remote work allowed in"
              value={remoteStatesValue}
              addLabel="allowed states"
              error={fieldErrors.remoteAllowedStates}
              onEdit={() => onEditField("remoteAllowedStates")}
            />
          ) : null}
          <ReviewRow
            label="Internal Notes"
            value={job.internalNotes ?? ""}
            addLabel="internal notes"
            onEdit={() => onEditField("internalNotes")}
          />
          {isMspRnr ? (
            <>
              <ReviewRow
                label="Show Pay By"
                value={ui.showPayBy}
                addLabel="show pay by"
                onEdit={() => onEditField("compensation")}
              />
              <ReviewRow
                label="Pay Rate"
                value={mspPayRateValue !== "—" ? mspPayRateValue : ""}
                addLabel="pay rate"
                onEdit={() => onEditField("compensation")}
              />
              <ReviewRow
                label="Rate"
                value={ratePeriodLabel}
                addLabel="rate"
                onEdit={() => onEditField("compensation")}
              />
            </>
          ) : (
            <>
              <ReviewRow
                label="Compensation Type"
                value={ui.compensationType}
                addLabel="compensation type"
                onEdit={() => onEditField("compensation")}
              />
              <ReviewRow
                label="Show Pay By"
                value={ui.showPayBy}
                addLabel="show pay by"
                onEdit={() => onEditField("compensation")}
              />
              <ReviewRow
                label="Pay Rate"
                value={mspPayRateValue !== "—" ? mspPayRateValue : ""}
                addLabel="pay rate"
                onEdit={() => onEditField("compensation")}
              />
            </>
          )}
          <ReviewRow
            label="Duration"
            value={job.duration ?? ""}
            addLabel="duration"
            onEdit={() => onEditField("jobDuration")}
          />
          <ReviewRow
            label="Start Date"
            value={formatReviewDate(job.targetStartDate)}
            addLabel="start date"
            onEdit={() => onEditField("startDate")}
          />
          <ReviewRow
            label="Expected Hours"
            value={expectedHoursValue}
            addLabel="expected hours"
            onEdit={() => onEditField("expectedHours")}
          />
          {isMspRnr ? (
            <>
              <ReviewRow
                label="Commission Fee Type"
                value={
                  ui.commissionFeeType === "percentage" && commissionEstimate
                    ? `${commissionFeeTypeLabel} (${commissionEstimate})`
                    : commissionFeeTypeLabel
                }
                addLabel="commission fee type"
                onEdit={() => onEditField("compensation")}
              />
              {ui.commissionFeeType === "percentage" ? (
                <ReviewRow
                  label="Commission Percentage"
                  value={
                    [commissionPercentValue, commissionEstimate].filter(Boolean).join(" · ")
                  }
                  addLabel="commission percentage"
                  onEdit={() => onEditField("compensation")}
                />
              ) : null}
              {ui.commissionFeeType === "fixed_amount" ? (
                <ReviewRow
                  label="Fixed Commission Amount"
                  value={commissionFixedValue}
                  addLabel="fixed commission amount"
                  onEdit={() => onEditField("compensation")}
                />
              ) : null}
            </>
          ) : (
            <ReviewRow
              label="Benefits"
              value={ui.selectedBenefits.join(", ")}
              addLabel="benefits"
              onEdit={() => onEditField("benefits")}
            />
          )}
        </>
      ) : null}
      {job.sourceType !== "MSP" ? (
        <ReviewRow
          label="Compensation"
          value={compensationValue}
          onEdit={() => onEditField("compensation")}
        />
      ) : null}
      {job.sourceType !== "MSP" && !isMspRnr ? (
        <ReviewRow
          label="Benefits"
          value={ui.selectedBenefits.join(", ")}
          onEdit={() => onEditField("benefits")}
        />
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 py-3 min-[700px]:grid-cols-[220px_1fr_auto] min-[700px]:gap-x-2 min-[700px]:gap-y-0">
        <div className="col-span-2 text-sm font-medium text-[#64748B] min-[700px]:col-span-1">Job Description</div>
        <div className="min-w-0">
          {!hasDescription ? (
            <button
              type="button"
              onClick={() => onEditField("jobDescription")}
              className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[color:var(--brand-primary)] transition hover:opacity-90"
            >
              <ReviewAddPlusIcon />
              Add job description
            </button>
          ) : (
            <>
              {isTruncated ? (
                <p className="whitespace-pre-wrap text-sm text-[#334155]">{shortDescription}</p>
              ) : (
                <JobDescriptionHtml
                  html={descriptionHtml}
                  className=""
                  emptyLabel=""
                />
              )}
              {isTruncated ? (
                <button
                  type="button"
                  onClick={() => setDescriptionViewOpen(true)}
                  className="mt-2 cursor-pointer text-sm font-medium text-[color:var(--brand-primary)]"
                >
                  Show full description
                </button>
              ) : null}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => onEditField("jobDescription")}
          className={`${JOB_FORM_ICON_BUTTON_CLASS} shrink-0 self-center`}
          aria-label={hasDescription ? "Edit Job Description" : "Add job description"}
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>
      <JobDescriptionViewModal
        open={descriptionViewOpen}
        onOpenChange={setDescriptionViewOpen}
        html={descriptionHtml}
        brandVars={brandVars}
      />
    </section>
  );
}

const WORKFLOW_AUTOMATION_ICON_SRC = getSidebarIconSrc("Automation", true);

function WorkflowAutomationIcon() {
  const [markup, setMarkup] = useState<string | null>(() =>
    getTintedSidebarIconMarkup(WORKFLOW_AUTOMATION_ICON_SRC, "#FFFFFF")
  );

  useEffect(() => {
    const cached = getTintedSidebarIconMarkup(WORKFLOW_AUTOMATION_ICON_SRC, "#FFFFFF");
    if (cached) {
      setMarkup(cached);
      return;
    }

    let cancelled = false;
    void ensureTintedSidebarIconMarkup(WORKFLOW_AUTOMATION_ICON_SRC, "#FFFFFF")
      .then((next) => {
        if (!cancelled) setMarkup(next);
      })
      .catch(() => {
        if (!cancelled) setMarkup(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!markup) {
    return <span className="inline-block h-5 w-5 shrink-0 rounded-sm bg-white/30" aria-hidden />;
  }

  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

export function JobFormWorkflowBanner({
  workflowName,
  workflowWarning,
  mappingCriteria,
  mappingLink,
  canManageWorkflows,
  fieldError,
  assignmentMode = "automatic",
  publishedWorkflows = [],
  overrideWorkflowId = null,
  onOverrideWorkflow,
  onResetToAutomatic,
  hideUnmappedDetails = false,
  showMappingLink = true,
  workflowBuilderHref = "/admin_recruiter/dashboard/onboarding-builder",
}: {
  workflowName?: string;
  workflowWarning: string;
  mappingCriteria?: string;
  mappingLink: string;
  canManageWorkflows: boolean;
  fieldError?: string;
  assignmentMode?: "automatic" | "manual";
  publishedWorkflows?: Array<{ id: string; name: string }>;
  overrideWorkflowId?: string | null;
  onOverrideWorkflow?: (workflowId: string) => void;
  onResetToAutomatic?: () => void;
  hideUnmappedDetails?: boolean;
  showMappingLink?: boolean;
  workflowBuilderHref?: string;
}) {
  const hasWorkflow = Boolean(workflowName);
  const isManual = assignmentMode === "manual";

  return (
    <div
      className={`mt-6 overflow-hidden rounded-xl border ${
        hasWorkflow
          ? "border-[color:color-mix(in_srgb,var(--brand-primary)_22%,#E5E7EB)] bg-[color:color-mix(in_srgb,var(--brand-primary)_7%,white)]"
          : "border-amber-200/90 bg-gradient-to-br from-amber-50 to-[#FFFBF5]"
      }`}
    >
      <div className="flex flex-col gap-3 p-3 min-[700px]:flex-row min-[700px]:items-start min-[700px]:justify-between min-[700px]:gap-5 min-[700px]:p-5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              hasWorkflow
                ? "bg-[color:var(--brand-secondary)] text-white shadow-sm"
                : "bg-amber-100 text-amber-700"
            }`}
            aria-hidden
          >
            {hasWorkflow ? (
              <WorkflowAutomationIcon />
            ) : (
              <TriangleAlert className="h-5 w-5" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm font-semibold text-[#1D2739]">Assigned workflow</p>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                  hasWorkflow
                    ? "bg-[color:color-mix(in_srgb,var(--brand-secondary)_12%,white)] text-[color:var(--brand-secondary)]"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {hasWorkflow ? (isManual ? "Manual" : "Automatic") : "Action needed"}
              </span>
            </div>

            {hasWorkflow ? (
              <>
                <p className="mt-2 break-words text-base font-semibold leading-6 tracking-tight text-[color:var(--brand-primary)]">
                  {workflowName}
                </p>
                {mappingCriteria ? (
                  <p className="mt-1 text-xs leading-5 text-[#64748B]">
                    {isManual ? "Overridden — " : "Matched on "}
                    <span className="font-medium text-[#475569]">{mappingCriteria}</span>
                  </p>
                ) : (
                  <p className="mt-1 text-xs leading-5 text-[#64748B]">
                    New applicants for this job will follow this workflow. Existing applicants keep
                    their current workflow.
                  </p>
                )}
              </>
            ) : hideUnmappedDetails ? null : (
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-amber-900/90">
                {workflowWarning ||
                  "Select employment type (and optional attributes) to resolve a workflow."}
              </p>
            )}

            {canManageWorkflows && onOverrideWorkflow ? (
              <div className="mt-3 w-full min-w-0 max-w-full space-y-2">
                <label className={JOB_FORM_LABEL_CLASS} htmlFor="workflow-override">
                  Override assigned workflow
                </label>
                <select
                  id="workflow-override"
                  className={`${JOB_FORM_SELECT_CLASS} ${
                    fieldError
                      ? "border-rose-400 text-[#334155]"
                      : isManual && overrideWorkflowId
                        ? "text-[#334155]"
                        : "text-[#94A3B8]"
                  }`}
                  style={{ backgroundImage: JOB_FORM_SELECT_CHEVRON }}
                  value={isManual ? (overrideWorkflowId ?? "") : ""}
                  aria-invalid={Boolean(fieldError)}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (!value) {
                      onResetToAutomatic?.();
                      return;
                    }
                    onOverrideWorkflow(value);
                  }}
                >
                  <option value="">Use automatic mapping</option>
                  {publishedWorkflows.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {isManual && onResetToAutomatic ? (
                  <button
                    type="button"
                    onClick={onResetToAutomatic}
                    className="cursor-pointer text-xs font-semibold text-[color:var(--brand-primary)] hover:underline"
                  >
                    Reset to automatic mapping
                  </button>
                ) : null}
                {publishedWorkflows.length === 0 ? (
                  <p className="text-sm leading-6 text-[#475569]">
                    No published workflows are available yet. Create a workflow and publish it.
                    Published workflows will appear in this list.
                    {canManageWorkflows ? (
                      <>
                        {" "}
                        <Link
                          href={workflowBuilderHref}
                          className="font-semibold text-[color:var(--brand-primary)] hover:underline"
                        >
                          Create and publish a workflow
                        </Link>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>
            ) : null}

            {fieldError ? <p className="mt-2 text-sm text-rose-600">{fieldError}</p> : null}
          </div>
        </div>

        {canManageWorkflows && showMappingLink ? (
          <Link
            href={mappingLink}
            className={`inline-flex h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium whitespace-nowrap transition min-[700px]:h-9 min-[700px]:w-auto min-[700px]:self-start ${
              hasWorkflow
                ? "border border-[color:color-mix(in_srgb,var(--brand-primary)_35%,#CBD5E1)] bg-white text-[color:var(--brand-primary)] hover:bg-[color:color-mix(in_srgb,var(--brand-primary)_8%,white)]"
                : "bg-[color:var(--brand-primary)] text-white hover:opacity-95"
            }`}
          >
            {hasWorkflow ? "Manage mappings" : "Create mapping"}
            <ArrowUpRight className="h-4 w-4 shrink-0" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function JobFormFooter({
  step,
  saving,
  canPublish,
  showPublishActions,
  termsAccepted,
  brandStyle,
  saveDraftLabel = "Save",
  onBack,
  onNext,
  onPreview,
  onSaveDraft,
  onPublish,
  onTermsChange,
  termsHref,
  privacyHref,
}: {
  step: JobFormStep;
  saving: boolean;
  canPublish: boolean;
  showPublishActions: boolean;
  termsAccepted: boolean;
  brandStyle: CSSProperties;
  /** Label for the draft/save control (e.g. "Save draft" when location is restricted). */
  saveDraftLabel?: string;
  onBack: () => void;
  onNext: () => void;
  onPreview: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  onTermsChange: (accepted: boolean) => void;
  termsHref?: string;
  privacyHref?: string;
}) {
  const isReview = step === "review";
  const isCompensation = step === "compensation";
  const isDescription = step === "description";
  const showStepPreview = isCompensation || isDescription;
  const outlineButtonClass = `${JOB_FORM_OUTLINE_BUTTON_CLASS} w-full min-[700px]:w-auto`;
  const primaryButtonClass = `${JOB_FORM_PRIMARY_BUTTON_CLASS} w-full min-[700px]:w-auto`;

  return (
    <div className="mt-8 border-t border-[#E5E7EB] pt-5">
      {isReview ? (
        <div className="mb-5 flex flex-col gap-3 min-[700px]:flex-row min-[700px]:items-start min-[700px]:justify-between min-[700px]:gap-6">
          <BrandedCheckbox
            checked={termsAccepted}
            onChange={onTermsChange}
            className="max-w-2xl text-sm leading-5 text-[#64748B]"
            label={
              <>
                By selecting Confirm, you agree that this job post reflects your requirements, and
                agree it will be posted and applications will be processed following applicable{" "}
                {termsHref ? (
                  <Link
                    href={termsHref}
                    className="font-medium text-[color:var(--brand-primary)] underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    Terms
                  </Link>
                ) : (
                  <span className="font-medium text-[color:var(--brand-primary)]">Terms</span>
                )}
                {" "}
                and{" "}
                {/* Cookie policy link removed — not shown in job create flow
                ,{" "}
                <span className="font-medium text-[color:var(--brand-primary)]">Cookie</span>, and{" "}
                */}
                {privacyHref ? (
                  <Link
                    href={privacyHref}
                    className="font-medium text-[color:var(--brand-primary)] underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    Privacy
                  </Link>
                ) : (
                  <span className="font-medium text-[color:var(--brand-primary)]">Privacy</span>
                )}{" "}
                Policies.
              </>
            }
          />
          <button
            type="button"
            onClick={onPreview}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 self-start text-sm font-medium text-[color:var(--brand-primary)] transition hover:opacity-90"
          >
            <Eye className="h-4 w-4" />
            Preview
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {showStepPreview ? (
          <>
            {/* Mobile: Preview alone, then Back | Next */}
            <button
              type="button"
              className={`${outlineButtonClass} min-[700px]:hidden`}
              onClick={onPreview}
            >
              <Eye className="h-4 w-4" />
              Preview
            </button>
            <div className="grid grid-cols-2 gap-2 min-[700px]:hidden">
              <button
                type="button"
                className={outlineButtonClass}
                onClick={onBack}
                disabled={saving}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              {isCompensation ? (
                <button
                  type="button"
                  className={primaryButtonClass}
                  style={brandStyle}
                  onClick={onNext}
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  className={primaryButtonClass}
                  style={brandStyle}
                  onClick={onNext}
                >
                  Continue to Review
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Desktop: Back + Preview | Next */}
            <div className="hidden min-[700px]:flex min-[700px]:items-center min-[700px]:justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={outlineButtonClass}
                  onClick={onBack}
                  disabled={saving}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button type="button" className={outlineButtonClass} onClick={onPreview}>
                  <Eye className="h-4 w-4" />
                  Preview
                </button>
              </div>
              {isCompensation ? (
                <button
                  type="button"
                  className={primaryButtonClass}
                  style={brandStyle}
                  onClick={onNext}
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  className={primaryButtonClass}
                  style={brandStyle}
                  onClick={onNext}
                >
                  Continue to Review
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2 min-[700px]:flex min-[700px]:items-center min-[700px]:justify-between">
            <div className="contents min-[700px]:flex min-[700px]:items-center min-[700px]:gap-2">
              <button
                type="button"
                className={outlineButtonClass}
                onClick={onBack}
                disabled={saving}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            </div>

            <div className="contents min-[700px]:flex min-[700px]:items-center min-[700px]:justify-end min-[700px]:gap-2">
              {step === "requisition" || step === "msp-details" ? (
                <button
                  type="button"
                  className={primaryButtonClass}
                  style={brandStyle}
                  onClick={onNext}
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : showPublishActions ? (
                <>
                  <button
                    type="button"
                    className={primaryButtonClass}
                    style={brandStyle}
                    disabled={saving}
                    onClick={onSaveDraft}
                  >
                    {saving ? "Saving…" : saveDraftLabel}
                  </button>
                  <button
                    type="button"
                    className={`${primaryButtonClass} col-span-2 min-[700px]:col-span-1`}
                    style={brandStyle}
                    disabled={saving || !canPublish || !termsAccepted}
                    onClick={onPublish}
                    title={
                      !termsAccepted
                        ? "Accept terms to publish"
                        : !canPublish
                          ? "Assign a published workflow before publishing"
                          : undefined
                    }
                  >
                    Save and Publish
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={primaryButtonClass}
                  style={brandStyle}
                  disabled={saving}
                  onClick={onSaveDraft}
                >
                  {saving ? "Saving…" : saveDraftLabel}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

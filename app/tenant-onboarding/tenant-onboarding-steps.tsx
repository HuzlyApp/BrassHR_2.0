"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, Link2, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentProps, type CSSProperties, type DragEvent } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { SignupStateOption } from "@/lib/signup/owner-signup";
import { getStateCodeFromName, getStateNameFromCode } from "@/lib/us-state-names";
import AddressAutocompleteField from "@/app/components/signup/AddressAutocompleteField";
import type { AddressSuggestion } from "@/lib/mapbox/address-validation-types";
import { useAddressAutocomplete } from "@/lib/mapbox/use-address-autocomplete";
import OnboardingStepsBuilder from "@/app/components/onboarding/OnboardingStepsBuilder";
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import { PasswordVisibilityToggle } from "@/app/components/PasswordVisibilityToggle";
import { interStyle, primaryButtonStyle } from "@/app/tenant-onboarding/TenantOnboardingShell";
import {
  COMPANY_SIZE_OPTIONS,
  INDUSTRY_OPTIONS,
  TENANT_GOAL_OPTIONS,
  brandingFontStack,
  TENANT_BRANDING_FONT_OPTIONS,
  type BusinessInfoForm,
  type TenantBrandingFontId,
  type TenantBrandingThemeMode,
  type TenantGoalId,
} from "@/app/tenant-onboarding/constants";
import { activeUserFacingIndustries, industryKeyFromLegacyLabel } from "@/lib/ai-catalog/industry-catalog";
import {
  addressVerificationMessage,
  normalizeBusinessZipInput,
  normalizeEinInput,
  validateBusinessInfoForm,
  type BusinessInfoFieldErrors,
  type BusinessInfoFieldKey,
} from "@/lib/tenant/business-info-validation";
import { APPLICATION_ROUTES } from "@/lib/onboarding/application-routes";
import { sanitizeESignatureUserMessage } from "@/lib/e-signature/user-facing";
import { formatPhoneNumber } from "@/lib/phone";
import type { OnboardingStepDraft } from "@/lib/onboarding/default-onboarding-steps";
import { subdomainFieldErrorMessage } from "@/lib/tenant/subdomain-validation";
import type { TenantBranding } from "@/lib/tenant/tenant-branding";
import {
  APPLICANT_PORTAL_CTA_START_APPLICATION,
  brandingToCssVars,
  normalizeBrandingImageSrc,
} from "@/lib/tenant/tenant-branding";
import { withTenant } from "@/lib/tenant/with-tenant";
import SearchableSelectField from "@/app/tenant-onboarding/SearchableSelectField";
import BrandingColorField from "@/app/tenant-onboarding/BrandingColorField";

const inputTypographyStyle = {
  fontFamily: "Inter, Arial, sans-serif",
  fontSize: "16px",
  lineHeight: "24px",
  fontWeight: 400,
  letterSpacing: "0",
} as const;

const inputTextClass =
  "text-[16px] font-normal leading-[24px] tracking-normal placeholder:text-[16px] placeholder:leading-[24px] placeholder:font-normal";

/** Fixed validation red — never tied to tenant brand colors. */
const VALIDATION_ERROR_RED = "#DC2626";
const REQUIRED_ASTERISK_RED = "#DC2626";

const inputErrorClass =
  "!border-[#DC2626] bg-white text-[#0f172a] focus:!border-[#DC2626] focus:ring-2 focus:ring-[#DC2626]/30";

function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p
      className="to-field-error mt-[6px] text-[13px] font-medium leading-[18px] text-[#DC2626]"
      style={{ ...interStyle, color: VALIDATION_ERROR_RED }}
    >
      {message}
    </p>
  );
}

const inputFocusClass =
  "tenant-onboarding-input text-[#0f172a] placeholder:text-[#94a3b8] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--brand-primary)_20%,transparent)]";

function FieldLabel({ children, required = true }: { children: string; required?: boolean }) {
  return (
    <label
      className="mb-[8px] block text-[14px] font-normal leading-[20px] tracking-normal text-[#374151]"
      style={interStyle}
    >
      {children}
      {required ? (
        <span
          className="ml-1 !text-[#DC2626]"
          style={{ color: REQUIRED_ASTERISK_RED, fontWeight: 700 }}
          aria-hidden="true"
        >
          *
        </span>
      ) : null}
    </label>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="to-field-error mb-6 rounded-[8px] border border-[#FECACA] bg-[#FEF2F2] px-[14px] py-[12px] text-[14px] font-medium leading-[20px] text-[#DC2626]"
      style={{ ...interStyle, color: VALIDATION_ERROR_RED }}
    >
      {message}
    </div>
  );
}

function ContinueButton({
  label = "Continue",
  disabled,
  onClick,
  type = "button",
  className = "",
}: {
  label?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
}) {
  const enabled = !disabled;
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-[54px] w-full items-center justify-center rounded-[12px] text-[16px] font-semibold leading-[22px] tracking-normal transition disabled:cursor-not-allowed disabled:bg-[#dddddd] disabled:text-[#c5c5c5] enabled:cursor-pointer enabled:hover:brightness-95 ${
        enabled ? "to-on-brand text-white" : ""
      } ${className}`.trim()}
      style={primaryButtonStyle(enabled)}
    >
      {label}
    </button>
  );
}

function SkipForNowButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-[14px] inline-flex w-full items-center justify-center gap-[6px] text-[13px] font-semibold leading-[18px] text-[#104b83] transition hover:text-[#0b3a70]"
      style={interStyle}
    >
      Skip for now
      <ChevronRight className="h-[14px] w-[14px]" strokeWidth={2.5} />
    </button>
  );
}

function BackButton({
  onClick,
  className = "",
  disabled = false,
}: {
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-[54px] w-full items-center justify-center rounded-[12px] border border-[#012352] bg-white text-[16px] font-semibold leading-[22px] tracking-normal text-md text-[#012352] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-60 ${className}`.trim()}
      style={interStyle}
    >
      Back
    </button>
  );
}

function InviteStepActions({
  onBack,
  onSkip,
  onSendInvites,
  skipping = false,
  sending = false,
}: {
  onBack: () => void;
  onSkip: () => void;
  onSendInvites: () => void;
  skipping?: boolean;
  sending?: boolean;
}) {
  return (
    <div className="mt-[32px] flex flex-col gap-3 sm:flex-row sm:items-stretch">
      <div className="flex flex-row gap-2 sm:contents">
        <BackButton
          onClick={onBack}
          className="flex-1 px-2 text-[14px] sm:px-4 sm:text-[16px]"
          disabled={skipping || sending}
        />
        <button
          type="button"
          onClick={onSkip}
          disabled={skipping || sending}
          className="flex h-[54px] flex-1 items-center justify-center rounded-[12px] border border-[#104b83] bg-white px-2 text-[14px] font-semibold leading-[20px] text-[#104b83] transition hover:bg-[#f0f7ff] disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:text-[16px] sm:leading-[22px]"
          style={interStyle}
        >
          {skipping ? "Finishing..." : "Skip for now"}
        </button>
      </div>
      <ContinueButton
        className="px-2 text-[14px] sm:flex-1 sm:px-4 sm:text-[16px]"
        label={sending ? "Sending..." : "Send Invites"}
        disabled={skipping || sending}
        onClick={onSendInvites}
      />
    </div>
  );
}

function StepActions({
  onBack,
  onContinue,
  continueLabel = "Continue",
  continueDisabled,
  className = "",
}: {
  onBack: () => void;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  className?: string;
}) {
  return (
    <div className={`mt-[32px] flex flex-row items-stretch gap-3 ${className}`.trim()}>
      <BackButton onClick={onBack} className="flex-1" />
      <ContinueButton
        className="flex-1"
        label={continueLabel}
        disabled={continueDisabled}
        onClick={onContinue}
      />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  type = "text",
  error,
  onBlur,
  inputMode,
  maxLength,
  autoComplete,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  error?: string | null;
  onBlur?: () => void;
  inputMode?: ComponentProps<"input">["inputMode"];
  maxLength?: number;
  autoComplete?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        autoComplete={autoComplete}
        disabled={disabled}
        readOnly={disabled}
        style={inputTypographyStyle}
        className={`h-[56px] w-full rounded-[8px] border px-[14px] ${inputTextClass} outline-none transition placeholder:text-[#94a3b8] ${
          disabled ? "cursor-not-allowed border-[#e2e8f0] bg-[#f8fafc] text-[#94a3b8]" : "bg-white"
        } ${
          error ? inputErrorClass : disabled ? "" : `border-[#cbd5e1] text-[#0f172a] ${inputFocusClass}`
        }`}
      />
      <FieldError message={error} />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  placeholder,
  options,
  required = false,
  disabled = false,
  error,
  emptyMessage,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  options: readonly string[];
  required?: boolean;
  disabled?: boolean;
  error?: string | null;
  emptyMessage?: string;
}) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <div className="relative">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={inputTypographyStyle}
          className={`h-[56px] w-full cursor-pointer appearance-none rounded-[8px] border bg-white px-[14px] pr-10 ${inputTextClass} outline-none transition disabled:cursor-not-allowed disabled:bg-[#f7f8fa] disabled:text-[#94a3b8] ${
            error
              ? inputErrorClass
              : `border-[#cbd5e1] ${inputFocusClass} ${value ? "text-[#0f172a]" : "text-[#94a3b8]"}`
          }`}
        >
          <option value="" disabled={options.length === 0 && Boolean(emptyMessage)}>
            {options.length === 0 && emptyMessage ? emptyMessage : placeholder ?? "Select"}
          </option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#64748b]" />
      </div>
      <FieldError message={error} />
    </div>
  );
}

function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="text-left">
      <h2 className="text-[24px] font-semibold leading-[30px] tracking-normal text-[#0f172a] sm:text-[30px] sm:leading-[36px]" style={interStyle}>
        {title}
      </h2>
      <p className="mt-[8px] text-[14px] font-normal leading-[20px] text-[#64748b] sm:text-[16px] sm:leading-[24px]" style={interStyle}>
        {subtitle}
      </p>
    </div>
  );
}

type GoalCardProps = {
  id: TenantGoalId;
  label: string;
  icon: string;
  selected: boolean;
  onToggle: (id: TenantGoalId) => void;
};

function GoalCard({ id, label, icon, selected, onToggle }: GoalCardProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(id)}
      className={`flex w-full items-center gap-[10px] rounded-[12px] border px-[12px] py-[14px] text-left transition sm:gap-[14px] sm:px-[16px] sm:py-[18px] ${
        selected
          ? "border-[color:var(--brand-primary)] bg-[color:color-mix(in_srgb,var(--brand-primary)_6%,white)]"
          : "border-[#e2e8f0] bg-white hover:border-[#cbd5e1]"
      }`}
    >
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[#f5efe6] sm:h-[44px] sm:w-[44px]">
        <Image src={icon} alt="" width={26} height={26} className="h-[22px] w-[22px] sm:h-[26px] sm:w-[26px]" />
      </span>
      <span className="flex-1 text-[13px] font-medium leading-[18px] text-[#104b83] sm:text-[15px] sm:leading-[22px]" style={interStyle}>
        {label}
      </span>
      <span
        className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[8px] border sm:h-[24px] sm:w-[24px] ${
          selected
            ? "to-on-brand border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]"
            : "border-[#cbd5e1] bg-white"
        }`}
      >
        {selected ? (
          <Check className="h-[14px] w-[14px] text-white" strokeWidth={3} color="#ffffff" />
        ) : null}
      </span>
    </button>
  );
}

export function GoalsStep({
  selectedGoals,
  onToggleGoal,
  onContinue,
  onSkip,
}: {
  selectedGoals: TenantGoalId[];
  onToggleGoal: (id: TenantGoalId) => void;
  onContinue: () => void;
  onSkip: () => void;
}) {
  return (
    <div>
      <StepHeading
        title="What brings you to brassHR"
        subtitle="Choose what matters most to you, and we'll make sure to help you hit your goals."
      />
      <div className="mt-[28px] grid grid-cols-1 gap-[12px] min-[600px]:grid-cols-2 sm:gap-[16px]">
        {TENANT_GOAL_OPTIONS.map((goal) => (
          <GoalCard
            key={goal.id}
            id={goal.id}
            label={goal.label}
            icon={goal.icon}
            selected={selectedGoals.includes(goal.id)}
            onToggle={onToggleGoal}
          />
        ))}
      </div>
      <ContinueButton className="mt-[32px]" disabled={selectedGoals.length === 0} onClick={onContinue} />
      <SkipForNowButton onClick={onSkip} />
    </div>
  );
}

export function BusinessStep({
  orgName,
  businessInfo,
  onOrgNameChange,
  onBusinessInfoChange,
  onContinue,
  onBack,
  onSkip,
}: {
  orgName: string;
  businessInfo: BusinessInfoForm;
  onOrgNameChange: (value: string) => void;
  onBusinessInfoChange: (patch: Partial<BusinessInfoForm>) => void;
  onContinue: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const [stateRows, setStateRows] = useState<SignupStateOption[]>([]);
  const [stateOptions, setStateOptions] = useState<string[]>([]);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [locationLoading, setLocationLoading] = useState(true);
  const [citiesLoading, setCitiesLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabaseBrowser
          .from("signup_us_states")
          .select("code, name")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });

        if (!active || error || !data?.length) return;

        const states = data.map((row) => ({
          code: String(row.code),
          name: String(row.name),
        }));
        setStateRows(states);
        setStateOptions(states.map((row) => row.name));
      } finally {
        if (active) setLocationLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const selectedStateCode = useMemo(() => {
    const fromRows = stateRows.find((row) => row.name === businessInfo.state)?.code;
    if (fromRows) return fromRows;
    const fromName = getStateCodeFromName(businessInfo.state);
    if (fromName) return fromName;
    const trimmed = businessInfo.state.trim().toUpperCase();
    if (trimmed.length === 2 && getStateNameFromCode(trimmed)) return trimmed;
    return "";
  }, [businessInfo.state, stateRows]);

  useEffect(() => {
    if (!selectedStateCode || selectedStateCode.length !== 2) {
      setCityOptions([]);
      setCitiesLoading(false);
      return;
    }

    let active = true;
    setCitiesLoading(true);
    void (async () => {
      try {
        const { data, error } = await supabaseBrowser
          .from("signup_us_cities")
          .select("city_name")
          .eq("state_code", selectedStateCode)
          .order("sort_order", { ascending: true })
          .order("city_name", { ascending: true });

        if (!active) return;
        if (error) {
          setCityOptions([]);
          return;
        }

        const names = (data ?? []).map((row) => String(row.city_name));
        setCityOptions(names);
      } catch {
        if (active) setCityOptions([]);
      } finally {
        if (active) setCitiesLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedStateCode]);

  const [fieldErrors, setFieldErrors] = useState<BusinessInfoFieldErrors>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const effectiveCityOptions = useMemo(() => {
    const city = businessInfo.city.trim();
    if (!city || cityOptions.includes(city)) {
      return cityOptions;
    }
    return [...cityOptions, city].sort((a, b) => a.localeCompare(b));
  }, [businessInfo.city, cityOptions]);

  const effectiveStateOptions = useMemo(() => {
    const state = businessInfo.state.trim();
    if (!state) return stateOptions;

    if (stateOptions.includes(state)) return stateOptions;

    // Address autocomplete / saved data may store a 2-letter code — resolve to name.
    const fromCode = getStateNameFromCode(state);
    if (fromCode && stateOptions.includes(fromCode)) return stateOptions;

    return [...stateOptions, fromCode || state].sort((a, b) => a.localeCompare(b));
  }, [businessInfo.state, stateOptions]);

  const displayStateValue = useMemo(() => {
    const raw = businessInfo.state.trim();
    if (!raw) return "";
    if (stateOptions.includes(raw) || effectiveStateOptions.includes(raw)) return raw;
    const fromCode = getStateNameFromCode(raw);
    if (fromCode && (stateOptions.includes(fromCode) || effectiveStateOptions.includes(fromCode))) {
      return fromCode;
    }
    return raw;
  }, [businessInfo.state, effectiveStateOptions, stateOptions]);

  // Normalize a stored state code (e.g. "AZ") to the full name once options load.
  useEffect(() => {
    const raw = businessInfo.state.trim();
    if (!raw || stateOptions.length === 0) return;
    if (stateOptions.includes(raw)) return;
    const fromCode = getStateNameFromCode(raw);
    if (fromCode && stateOptions.includes(fromCode) && fromCode !== raw) {
      onBusinessInfoChange({ state: fromCode });
    }
    // Parent passes an inline setter; only re-run when the stored value/options change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid re-running on unstable callback identity
  }, [businessInfo.state, stateOptions]);

  const stateOptionsUnavailable = !locationLoading && stateOptions.length === 0;

  const validationContext = useMemo(
    () => ({
      stateCode: selectedStateCode || undefined,
      stateName: displayStateValue || businessInfo.state || undefined,
      allowedStateNames: effectiveStateOptions.length > 0 ? effectiveStateOptions : stateOptions,
      requireEin: true,
    }),
    [
      businessInfo.state,
      displayStateValue,
      effectiveStateOptions,
      selectedStateCode,
      stateOptions,
    ]
  );

  const formInput = useMemo(
    () => ({
      companyName: orgName,
      industry: businessInfo.industry,
      companySize: businessInfo.companySize,
      state: businessInfo.state,
      city: businessInfo.city,
      address: businessInfo.address,
      phone: businessInfo.phone,
      email: businessInfo.email,
      zipCode: businessInfo.zipCode,
      ein: businessInfo.ein,
    }),
    [businessInfo, orgName]
  );

  const businessAddressAutocomplete = useAddressAutocomplete(businessInfo.address, {
    city: businessInfo.city,
    state: businessInfo.state,
    zipCode: businessInfo.zipCode,
  });

  const revalidateField = (field: BusinessInfoFieldKey, nextInput = formInput) => {
    const nextErrors = validateBusinessInfoForm(nextInput, validationContext);
    setFieldErrors((prev) => ({
      ...prev,
      [field]: nextErrors[field] ?? undefined,
    }));
  };

  const handleSelectBusinessAddressSuggestion = (suggestion: AddressSuggestion) => {
    const components = businessAddressAutocomplete.selectSuggestion(suggestion);
    const stateName = components.state
      ? getStateNameFromCode(components.state) ?? components.state
      : "";
    const patch: Partial<BusinessInfoForm> = {};
    if (components.address1) patch.address = components.address1;
    if (components.city) patch.city = components.city;
    if (stateName) patch.state = stateName;
    if (components.zipCode) patch.zipCode = components.zipCode;
    handleBusinessFieldChange(patch);
  };

  const showFieldError = (field: BusinessInfoFieldKey) => {
    if (!submitAttempted) return null;
    if (field === "address") {
      return (
        fieldErrors.address ??
        addressVerificationMessage(businessInfo.address, {
          isAddressVerified: businessAddressAutocomplete.isAddressVerified,
          showError: true,
        })
      );
    }
    return fieldErrors[field] ?? null;
  };

  const handleFieldBlur = (field: BusinessInfoFieldKey) => {
    if (!submitAttempted) return;
    revalidateField(field);
  };

  const handleOrgNameChange = (value: string) => {
    onOrgNameChange(value);
    if (submitAttempted) {
      const nextInput = { ...formInput, companyName: value };
      revalidateField("companyName", nextInput);
    }
  };

  const handleBusinessFieldChange = (patch: Partial<BusinessInfoForm>) => {
    onBusinessInfoChange(patch);
    if (!submitAttempted) return;
    const { hireForIndustryKeys: _hireFor, ...rest } = patch;
    const nextInput = {
      ...formInput,
      ...rest,
    };
    const keysToCheck = new Set<BusinessInfoFieldKey>(
      Object.keys(rest) as BusinessInfoFieldKey[]
    );
    if (patch.state !== undefined) {
      keysToCheck.add("city");
      keysToCheck.add("zipCode");
    }
    for (const key of keysToCheck) {
      revalidateField(key, nextInput);
    }
  };

  const handleContinue = async () => {
    setSubmitAttempted(true);
    setSubmitError(null);

    const errors = validateBusinessInfoForm(formInput, validationContext);
    const addressVerifyError = addressVerificationMessage(businessInfo.address, {
      isAddressVerified: businessAddressAutocomplete.isAddressVerified,
      showError: true,
    });
    if (addressVerifyError) {
      errors.address = addressVerifyError;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/tenant-onboarding/business-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: formInput.companyName,
          industry: formInput.industry,
          companySize: formInput.companySize,
          state: formInput.state,
          city: formInput.city,
          address: formInput.address,
          phone: formInput.phone,
          email: formInput.email,
          zipCode: formInput.zipCode,
          ein: formInput.ein,
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        errors?: BusinessInfoFieldErrors;
      };

      if (!res.ok) {
        if (payload.errors) {
          setFieldErrors(payload.errors);
        }
        setSubmitError(payload.error ?? "Could not save business information.");
        return;
      }

      onContinue();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not save business information.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <StepHeading
        title="Business Information"
        subtitle="Add your business info."
      />

      {submitError ? <ErrorBanner message={submitError} /> : null}

      <div className="mt-[28px] space-y-[18px] sm:space-y-[24px]">
        <TextField
          label="Company Name"
          required
          value={orgName}
          onChange={handleOrgNameChange}
          onBlur={() => handleFieldBlur("companyName")}
          placeholder="ABC Company"
          error={showFieldError("companyName")}
        />

        <div className="grid grid-cols-1 gap-[14px] min-[600px]:grid-cols-2 sm:gap-[24px]">
          <SelectField
            label="Industry"
            required
            value={businessInfo.industry}
            onChange={(value) => {
              const mapped = industryKeyFromLegacyLabel(value);
              const hireFor = [...(businessInfo.hireForIndustryKeys ?? [])];
              if (mapped && !hireFor.includes(mapped)) hireFor.push(mapped);
              handleBusinessFieldChange({ industry: value, hireForIndustryKeys: hireFor });
            }}
            placeholder="Select industry"
            options={INDUSTRY_OPTIONS}
            error={showFieldError("industry")}
          />
          <SelectField
            label="Number of Employees"
            required
            value={businessInfo.companySize}
            onChange={(value) => handleBusinessFieldChange({ companySize: value })}
            placeholder="Select size"
            options={COMPANY_SIZE_OPTIONS}
            error={showFieldError("companySize")}
          />
        </div>

        <div>
          <p className="text-sm font-medium text-[#334155]">Industries you hire for</p>
          <p className="mt-1 text-sm text-[#64748B]">
            Select every industry this organization staffs. New jobs default to your primary industry.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 min-[600px]:grid-cols-2">
            {activeUserFacingIndustries().map((item) => {
              const checked = (businessInfo.hireForIndustryKeys ?? []).includes(item.key);
              return (
                <label key={item.key} className="flex items-center gap-2 text-sm text-[#334155] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const current = businessInfo.hireForIndustryKeys ?? [];
                      const next = event.target.checked
                        ? current.includes(item.key)
                          ? current
                          : [...current, item.key]
                        : current.filter((key) => key !== item.key);
                      handleBusinessFieldChange({ hireForIndustryKeys: next });
                    }}
                    className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-[#012352]"
                    style={{ accentColor: '#012352' }}
                  />
                  {item.label}
                </label>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-[14px] min-[600px]:grid-cols-2 sm:gap-[24px]">
          <SearchableSelectField
            label="State"
            required
            loading={locationLoading}
            disabled={locationLoading || stateOptionsUnavailable}
            value={displayStateValue}
            onChange={(value) => handleBusinessFieldChange({ state: value, city: "" })}
            onBlur={() => handleFieldBlur("state")}
            placeholder={
              locationLoading
                ? "Loading…"
                : stateOptionsUnavailable
                  ? "No states found"
                  : "Search state"
            }
            searchPlaceholder="Type to search states"
            options={effectiveStateOptions}
            error={showFieldError("state")}
            emptyMessage="No states found. Try another search."
          />
          <SearchableSelectField
            label="City"
            required
            allowCustom
            disabled={!businessInfo.state || stateOptionsUnavailable}
            loading={citiesLoading}
            value={businessInfo.city}
            onChange={(value) => handleBusinessFieldChange({ city: value })}
            onBlur={() => handleFieldBlur("city")}
            placeholder={
              stateOptionsUnavailable
                ? "No states found"
                : !businessInfo.state
                  ? "Select state first"
                  : citiesLoading
                    ? "Loading…"
                    : "Search or enter city"
            }
            searchPlaceholder="Type any city"
            options={effectiveCityOptions}
            error={showFieldError("city")}
            emptyMessage="Type a city name and press Enter."
          />
        </div>

        <AddressAutocompleteField
          label="Business Address"
          required
          value={businessInfo.address}
          onChange={(value) => {
            businessAddressAutocomplete.resetVerification();
            handleBusinessFieldChange({ address: value });
          }}
          onBlur={() => handleFieldBlur("address")}
          onFocus={businessAddressAutocomplete.openSuggestions}
          onCloseSuggestions={businessAddressAutocomplete.closeSuggestions}
          placeholder="Start typing your street address"
          error={showFieldError("address")}
          searchError={submitAttempted ? businessAddressAutocomplete.searchError : null}
          suggestions={businessAddressAutocomplete.suggestions}
          isLoading={businessAddressAutocomplete.isLoading}
          isOpen={businessAddressAutocomplete.isOpen}
          isVerified={businessAddressAutocomplete.isAddressVerified}
          onSelectSuggestion={handleSelectBusinessAddressSuggestion}
          variant="onboarding"
        />

        <div className="grid grid-cols-1 gap-[14px] min-[600px]:grid-cols-2 sm:gap-[24px]">
          <TextField
            label="Business Phone"
            required
            value={businessInfo.phone}
            onChange={(value) => handleBusinessFieldChange({ phone: formatPhoneNumber(value) })}
            onBlur={() => handleFieldBlur("phone")}
            placeholder="(201) 512-2366"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            error={showFieldError("phone")}
          />
          <TextField
            label="Business Email Address"
            required
            value={businessInfo.email}
            onChange={(value) => handleBusinessFieldChange({ email: value })}
            onBlur={() => handleFieldBlur("email")}
            placeholder="info@abccompany.com"
            type="email"
            inputMode="email"
            autoComplete="email"
            error={showFieldError("email")}
          />
        </div>

        <div className="grid grid-cols-1 gap-[14px] min-[600px]:grid-cols-2 sm:gap-[24px]">
          <TextField
            label="Zip Code"
            required
            value={businessInfo.zipCode}
            onChange={(value) =>
              handleBusinessFieldChange({
                zipCode: normalizeBusinessZipInput(value).slice(0, 5),
              })
            }
            onBlur={() => handleFieldBlur("zipCode")}
            placeholder="40170"
            inputMode="numeric"
            maxLength={5}
            error={showFieldError("zipCode")}
          />
          <TextField
            label="EIN Number"
            required
            value={businessInfo.ein}
            onChange={(value) => handleBusinessFieldChange({ ein: normalizeEinInput(value) })}
            onBlur={() => handleFieldBlur("ein")}
            placeholder="12-3456789"
            inputMode="numeric"
            maxLength={10}
            error={showFieldError("ein")}
          />
        </div>
      </div>

      <StepActions
        onBack={onBack}
        onContinue={() => void handleContinue()}
        continueLabel={submitting ? "Saving..." : "Save and Continue"}
        continueDisabled={submitting}
      />
      <SkipForNowButton onClick={onSkip} />
    </div>
  );
}

const LOGO_ACCEPT = "image/png,image/jpeg,image/jpg,.png,.jpg,.jpeg";
const FAVICON_ACCEPT = "image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/x-icon,.png,.jpg,.jpeg,.webp,.svg,.ico";

function isAllowedLogoFile(file: File): boolean {
  const allowed = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/pjpeg",
  ]);
  if (file.type && allowed.has(file.type)) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "png" || ext === "jpg" || ext === "jpeg";
}

function isAllowedFaviconFile(file: File): boolean {
  const allowed = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/pjpeg",
    "image/webp",
    "image/svg+xml",
    "image/x-icon",
    "image/vnd.microsoft.icon",
  ]);
  if (file.type && allowed.has(file.type)) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return (
    ext === "png" ||
    ext === "jpg" ||
    ext === "jpeg" ||
    ext === "webp" ||
    ext === "svg" ||
    ext === "ico"
  );
}

export function CompanyLogoStep({
  logoUrl,
  logoFile,
  faviconFile,
  orgName,
  logoDisplayName,
  logoTagline,
  onLogoFileChange,
  onLogoUrlChange,
  onFaviconFileChange,
  onLogoDisplayNameChange,
  onLogoTaglineChange,
  onContinue,
  onBack,
  onSkip,
}: {
  logoUrl: string;
  logoFile: File | null;
  faviconFile: File | null;
  orgName: string;
  logoDisplayName: string;
  logoTagline: string;
  onLogoFileChange: (file: File | null, previewUrl: string) => void;
  onLogoUrlChange: (value: string) => void;
  onFaviconFileChange: (file: File | null) => void;
  onLogoDisplayNameChange: (value: string) => void;
  onLogoTaglineChange: (value: string) => void;
  onContinue: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [faviconError, setFaviconError] = useState<string | null>(null);
  const [transparentBackground, setTransparentBackground] = useState(false);
  const [previewSrc, setPreviewSrc] = useState("");
  const [faviconPreviewSrc, setFaviconPreviewSrc] = useState("");

  useEffect(() => {
    if (logoFile) {
      const objectUrl = URL.createObjectURL(logoFile);
      setPreviewSrc(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }

    const external = logoUrl.trim();
    if (external.startsWith("blob:") || external.startsWith("data:") || external.startsWith("http")) {
      setPreviewSrc(external);
      return;
    }

    setPreviewSrc("");
  }, [logoFile, logoUrl]);

  useEffect(() => {
    if (!faviconFile) {
      setFaviconPreviewSrc("");
      return;
    }
    const objectUrl = URL.createObjectURL(faviconFile);
    setFaviconPreviewSrc(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [faviconFile]);

  const hasUserLogo = Boolean(logoFile) || previewSrc.length > 0;

  const previewName = logoDisplayName.trim() || orgName.trim() || "Your company name";
  const previewTagline = logoTagline.trim() || "Your company tagline";

  const canContinue =
    logoDisplayName.trim().length >= 1 && logoTagline.trim().length >= 1;

  const handleFile = (file: File | null) => {
    if (!file) return;

    if (!isAllowedLogoFile(file)) {
      setUploadError("Only support png, jpg files");
      return;
    }

    const maxBytes = 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      setUploadError("Max 10 MB files are allowed");
      return;
    }

    setUploadError(null);
    const objectUrl = URL.createObjectURL(file);
    onLogoFileChange(file, objectUrl);
    onLogoUrlChange(objectUrl);
  };

  const handleFaviconFile = (file: File | null) => {
    setFaviconError(null);
    if (!file) {
      onFaviconFileChange(null);
      return;
    }
    if (!isAllowedFaviconFile(file)) {
      setFaviconError("Use PNG, JPG, WEBP, SVG, or ICO.");
      onFaviconFileChange(null);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFaviconError("Favicon must be 2 MB or smaller.");
      onFaviconFileChange(null);
      return;
    }
    onFaviconFileChange(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    handleFile(event.dataTransfer.files?.[0] ?? null);
  };

  const onFaviconDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    handleFaviconFile(event.dataTransfer.files?.[0] ?? null);
  };

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    handleFile(event.target.files?.[0] ?? null);
  };

  const onFaviconFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    handleFaviconFile(event.target.files?.[0] ?? null);
  };

  const openFilePicker = () => {
    inputRef.current?.click();
  };

  const openFaviconFilePicker = () => {
    faviconInputRef.current?.click();
  };

  const handleRemoveLogo = (event: React.MouseEvent) => {
    event.stopPropagation();
    setUploadError(null);
    setTransparentBackground(false);
    onLogoFileChange(null, "");
    onLogoUrlChange("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleRemoveFavicon = (event: React.MouseEvent) => {
    event.stopPropagation();
    setFaviconError(null);
    onFaviconFileChange(null);
    if (faviconInputRef.current) faviconInputRef.current.value = "";
  };

  return (
    <div>
      <StepHeading title="Company Logo" subtitle="Customize your company logo" />

      <div className="mt-[28px] space-y-[18px] sm:space-y-[24px]">
        <TextField
          label="Logo Name"
          required
          value={logoDisplayName}
          onChange={onLogoDisplayNameChange}
          placeholder="Logo name"
        />
        <TextField
          label="Tagline"
          required
          value={logoTagline}
          onChange={onLogoTaglineChange}
          placeholder="Tagline"
        />

        {hasUserLogo ? (
          <>
            <div className="flex items-center gap-[14px] rounded-[12px] border border-[color:var(--brand-primary)] bg-[#F4F4F4] px-[16px] py-[14px]">
              <div className="flex h-[56px] w-[56px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#e2e8f0] bg-white p-1">
                {previewSrc ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={previewSrc}
                    alt=""
                    className="h-full w-full rounded-full object-contain"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p
                  className="truncate text-[16px] font-semibold leading-[22px] text-[#374151]"
                  style={interStyle}
                >
                  {previewName}
                </p>
                <p
                  className="truncate text-[14px] font-normal leading-[20px] text-[#94a3b8]"
                  style={interStyle}
                >
                  {previewTagline}
                </p>
              </div>
              <button
                type="button"
                onClick={handleRemoveLogo}
                className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[8px] text-[color:var(--brand-primary)] transition hover:bg-white/80"
                aria-label="Remove logo"
              >
                <Trash2 className="h-[20px] w-[20px]" strokeWidth={2} />
              </button>
            </div>

            <label className="flex cursor-pointer items-start gap-[10px]">
              <span
                className={`relative mt-[2px] flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[6px] border ${
                  transparentBackground
                    ? "to-on-brand border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]"
                    : "border-[#cbd5e1] bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  checked={transparentBackground}
                  onChange={(e) => setTransparentBackground(e.target.checked)}
                  className="absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
                  aria-label="Make the white background on my logo transparent"
                />
                {transparentBackground ? (
                  <Check className="h-[14px] w-[14px] text-white" strokeWidth={3} color="#ffffff" />
                ) : null}
              </span>
              <span
                className="text-[14px] font-normal leading-[20px] text-[#94a3b8]"
                style={interStyle}
              >
                Make the white background on my logo transparent
              </span>
            </label>
          </>
        ) : (
          <div>
            <h3
              className="text-[16px] font-semibold leading-[24px] text-[#0f172a]"
              style={interStyle}
            >
              Upload Logo
            </h3>

            <div
              role="button"
              tabIndex={0}
              onClick={openFilePicker}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") openFilePicker();
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="mt-[16px] flex cursor-pointer flex-col items-center justify-center rounded-[10px] border-2 border-dashed border-[#94a3b8] bg-white px-4 py-[24px] transition hover:border-[#64748b] hover:bg-[#fafafa] sm:px-6 sm:py-[28px]"
            >
              <Image
                src="/icons/braas-HR/tenant-onboarding/upload.svg"
                alt=""
                width={36}
                height={36}
                className="h-[30px] w-[30px] sm:h-[36px] sm:w-[36px]"
              />

              <p
                className="mt-[12px] text-center text-[14px] font-medium leading-[20px] text-[#104b83] sm:mt-[16px] sm:text-[16px] sm:leading-[24px]"
                style={interStyle}
              >
                Drag your file(s) to start uploading
              </p>

              <div className="my-[16px] flex w-full max-w-[320px] items-center gap-3">
                <div className="h-px flex-1 bg-[#cbd5e1]" aria-hidden />
                <span
                  className="text-[14px] font-medium leading-[20px] text-[#64748b]"
                  style={interStyle}
                >
                  OR
                </span>
                <div className="h-px flex-1 bg-[#cbd5e1]" aria-hidden />
              </div>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  openFilePicker();
                }}
                className="flex h-[44px] min-w-[160px] items-center justify-center rounded-[8px] border border-[#104b83] bg-white px-6 text-[14px] font-semibold leading-[20px] text-[#104b83] transition hover:bg-[#f8fafc]"
                style={interStyle}
              >
                Browse files
              </button>

              <p
                className="mt-[12px] text-[13px] leading-[18px] text-[#94a3b8]"
                style={interStyle}
              >
                Max 10 MB files are allowed
              </p>

              <p
                className="mt-[16px] text-[14px] leading-[20px] text-[#64748b]"
                style={interStyle}
              >
                Recommended image size: 512×512 px
              </p>
            </div>

            {uploadError ? (
              <p
                className="to-field-error mt-[8px] text-[13px] font-medium leading-[18px] text-[#DC2626]"
                style={{ ...interStyle, color: VALIDATION_ERROR_RED }}
              >
                {uploadError}
              </p>
            ) : null}

            <p className="mt-[12px] text-[13px] leading-[18px] text-[#94a3b8]" style={interStyle}>
              Only support png, jpg files
            </p>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={LOGO_ACCEPT}
          className="hidden"
          onChange={onFileInput}
        />

        <div>
          <h3
            className="text-[16px] font-semibold leading-[24px] text-[#0f172a]"
            style={interStyle}
          >
            Upload your favicon icon
          </h3>

          {faviconFile && faviconPreviewSrc ? (
            <div className="mt-[16px] flex items-center gap-[14px] rounded-[12px] border border-[color:var(--brand-primary)] bg-[#F4F4F4] px-[16px] py-[14px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={faviconPreviewSrc}
                alt=""
                className="h-[56px] w-[56px] shrink-0 rounded-[10px] border border-[#e2e8f0] bg-white object-contain p-1"
              />
              <div className="min-w-0 flex-1 text-left">
                <p
                  className="truncate text-[16px] font-semibold leading-[22px] text-[#374151]"
                  style={interStyle}
                >
                  {faviconFile.name}
                </p>
                <p
                  className="truncate text-[14px] font-normal leading-[20px] text-[#94a3b8]"
                  style={interStyle}
                >
                  Uploaded favicon
                </p>
              </div>
              <button
                type="button"
                onClick={handleRemoveFavicon}
                className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[8px] text-[color:var(--brand-primary)] transition hover:bg-white/80"
                aria-label="Remove favicon"
              >
                <Trash2 className="h-[20px] w-[20px]" strokeWidth={2} />
              </button>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={openFaviconFilePicker}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") openFaviconFilePicker();
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onFaviconDrop}
              className="mt-[16px] flex cursor-pointer flex-col items-center justify-center rounded-[10px] border-2 border-dashed border-[#94a3b8] bg-white px-4 py-[24px] transition hover:border-[#64748b] hover:bg-[#fafafa] sm:px-6 sm:py-[28px]"
            >
              <Image
                src="/icons/braas-HR/tenant-onboarding/upload.svg"
                alt=""
                width={36}
                height={36}
                className="h-[30px] w-[30px] sm:h-[36px] sm:w-[36px]"
              />

              <p
                className="mt-[12px] text-center text-[14px] font-medium leading-[20px] text-[#104b83] sm:mt-[16px] sm:text-[16px] sm:leading-[24px]"
                style={interStyle}
              >
                Drag your file(s) to start uploading
              </p>

              <div className="my-[16px] flex w-full max-w-[320px] items-center gap-3">
                <div className="h-px flex-1 bg-[#cbd5e1]" aria-hidden />
                <span
                  className="text-[14px] font-medium leading-[20px] text-[#64748b]"
                  style={interStyle}
                >
                  OR
                </span>
                <div className="h-px flex-1 bg-[#cbd5e1]" aria-hidden />
              </div>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  openFaviconFilePicker();
                }}
                className="flex h-[44px] min-w-[160px] items-center justify-center rounded-[8px] border border-[#104b83] bg-white px-6 text-[14px] font-semibold leading-[20px] text-[#104b83] transition hover:bg-[#f8fafc]"
                style={interStyle}
              >
                Browse files
              </button>

              <p
                className="mt-[12px] text-[13px] leading-[18px] text-[#94a3b8]"
                style={interStyle}
              >
                Max 2 MB files are allowed
              </p>
            </div>
          )}

          {faviconError ? (
            <p
              className="to-field-error mt-[8px] text-[13px] font-medium leading-[18px] text-[#DC2626]"
              style={{ ...interStyle, color: VALIDATION_ERROR_RED }}
            >
              {faviconError}
            </p>
          ) : null}

          {!faviconFile ? (
            <p className="mt-[12px] text-[13px] leading-[18px] text-[#94a3b8]" style={interStyle}>
              PNG, JPG, WEBP, SVG, or ICO. Max 2 MB.
            </p>
          ) : null}
        </div>

        <input
          ref={faviconInputRef}
          type="file"
          accept={FAVICON_ACCEPT}
          className="hidden"
          onChange={onFaviconFileInput}
        />
      </div>

      <StepActions
        onBack={onBack}
        onContinue={onContinue}
        continueLabel="Save and Continue"
        continueDisabled={!canContinue}
      />
      <SkipForNowButton onClick={onSkip} />
    </div>
  );
}

function SplitCircle({
  left,
  right,
  selected = false,
}: {
  left: string;
  right: string;
  selected?: boolean;
}) {
  return (
    <div
      className={`mx-auto flex h-[88px] w-[88px] shrink-0 overflow-hidden rounded-full shadow-sm ${
        selected ? "border-2 border-[#012352]" : "border border-black/10"
      }`}
      aria-hidden
    >
      <div className="h-full w-1/2" style={{ backgroundColor: left }} />
      <div className="h-full w-1/2" style={{ backgroundColor: right }} />
    </div>
  );
}

function ThemeSelectedCheck() {
  return (
    <span
      className="to-on-brand relative inline-grid h-[18px] w-[18px] shrink-0 place-items-center overflow-hidden rounded-full bg-[#012352] leading-none"
      aria-hidden
    >
      <Check
        aria-hidden
        className="pointer-events-none block h-[10px] w-[10px] text-white"
        strokeWidth={2.75}
        color="#ffffff"
        absoluteStrokeWidth
        style={{
          display: "block",
          margin: 0,
          // Lucide Check path is optically top-heavy; nudge keeps it centered at 100–110% zoom.
          transform: "translateY(0.5px)",
        }}
      />
    </span>
  );
}

export function BrandingStep({
  platformColors,
  themeMode,
  onThemeModeChange,
  fontId,
  onFontChange,
  primaryHex,
  secondaryHex,
  accentHex,
  headline,
  subtitle,
  backgroundUrl,
  backgroundFile,
  orgName,
  preview,
  onPrimaryChange,
  onSecondaryChange,
  onAccentChange,
  onHeadlineChange,
  onSubtitleChange,
  onBackgroundChange,
  onBackgroundFileChange,
  onContinue,
  onBack,
  onSkip,
}: {
  platformColors: { primary: string; secondary: string; accent: string };
  themeMode: TenantBrandingThemeMode;
  onThemeModeChange: (mode: TenantBrandingThemeMode) => void;
  fontId: TenantBrandingFontId;
  onFontChange: (id: TenantBrandingFontId) => void;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  headline: string;
  subtitle: string;
  backgroundUrl: string;
  backgroundFile: File | null;
  orgName: string;
  preview: TenantBranding;
  onPrimaryChange: (value: string) => void;
  onSecondaryChange: (value: string) => void;
  onAccentChange: (value: string) => void;
  onHeadlineChange: (value: string) => void;
  onSubtitleChange: (value: string) => void;
  onBackgroundChange: (value: string) => void;
  onBackgroundFileChange: (file: File | null) => void;
  onContinue: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const customSwatchLeft = "#94a3b8";
  const customSwatchRight = "#e2e8f0";
  const [backgroundUploadError, setBackgroundUploadError] = useState<string | null>(null);

  const handleBackgroundFile = (file: File | null) => {
    setBackgroundUploadError(null);
    if (!file) {
      onBackgroundFileChange(null);
      return;
    }
    const mime = (file.type || "").toLowerCase();
    if (!["image/png", "image/jpeg", "image/webp"].includes(mime)) {
      setBackgroundUploadError("Use PNG, JPG, or WEBP.");
      onBackgroundFileChange(null);
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setBackgroundUploadError("Background image must be 3 MB or smaller.");
      onBackgroundFileChange(null);
      return;
    }
    onBackgroundFileChange(file);
  };

  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const [backgroundPreviewSrc, setBackgroundPreviewSrc] = useState("");

  useEffect(() => {
    if (!backgroundFile) {
      setBackgroundPreviewSrc("");
      return;
    }
    const objectUrl = URL.createObjectURL(backgroundFile);
    setBackgroundPreviewSrc(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [backgroundFile]);

  const clearBackgroundUpload = () => {
    setBackgroundUploadError(null);
    onBackgroundFileChange(null);
    if (backgroundInputRef.current) backgroundInputRef.current.value = "";
  };

  return (
    <div>
      <div className="text-left">
        <h2 className="text-[30px] font-semibold leading-[36px] text-[#0f172a]" style={interStyle}>
          Branding
        </h2>
        <p className="mt-[8px] text-[16px] font-normal leading-[24px] text-[#64748b]" style={interStyle}>
          Customize your company&apos;s look and feel.
        </p>
      </div>

      <div className="mt-[28px] rounded-[16px] border border-[#e2e8f0] bg-[#f8fafc] p-[16px]">
        <p className="mb-[12px] text-[13px] font-semibold uppercase tracking-wide text-[#64748b]" style={interStyle}>
          Live preview
        </p>
        <PreviewCard b={preview} />
      </div>

      <div className="mt-[28px] space-y-[28px]">
        <section>
          <h3 className="text-[16px] font-semibold leading-[22px] text-[#334155]" style={interStyle}>
            Select Theme Colors
          </h3>
          <div className="mt-[16px] grid grid-cols-2 gap-[14px]">
            <button
              type="button"
              onClick={() => onThemeModeChange("system")}
              className={`flex cursor-pointer flex-col items-center rounded-[14px] border-2 bg-[#f8fafc] px-[16px] py-[20px] transition ${
                themeMode === "system"
                  ? "border-[#012352]"
                  : "border-transparent hover:border-[#e2e8f0]"
              }`}
            >
              <SplitCircle
                left={platformColors.primary}
                right={platformColors.accent}
                selected={themeMode === "system"}
              />
              <div className="mt-[14px] flex items-center justify-center gap-2">
                <span className="text-[14px] font-medium text-[#0f172a]" style={interStyle}>
                  System Default
                </span>
                {themeMode === "system" ? <ThemeSelectedCheck /> : null}
              </div>
            </button>

            <button
              type="button"
              onClick={() => onThemeModeChange("custom")}
              className={`flex cursor-pointer flex-col items-center rounded-[14px] border-2 bg-white px-[16px] py-[20px] transition ${
                themeMode === "custom"
                  ? "border-[#012352]"
                  : "border-[#e8edf4] hover:border-[#cbd5e1]"
              }`}
            >
              <SplitCircle
                left={customSwatchLeft}
                right={customSwatchRight}
                selected={themeMode === "custom"}
              />
              <div className="mt-[14px] flex items-center justify-center gap-2">
                {themeMode === "custom" ? <ThemeSelectedCheck /> : null}
                <span className="text-[14px] font-medium text-[#0f172a]" style={interStyle}>
                  Custom Color
                </span>
              </div>
            </button>
          </div>

          {themeMode === "custom" ? (
            <div className="mt-[20px] grid gap-[16px] sm:grid-cols-3">
              <BrandingColorField
                label="Primary"
                value={primaryHex}
                defaultValue={platformColors.primary}
                onChange={onPrimaryChange}
              />
              <BrandingColorField
                label="Secondary"
                value={secondaryHex}
                defaultValue={platformColors.secondary}
                onChange={onSecondaryChange}
              />
              <BrandingColorField
                label="Accent"
                value={accentHex}
                defaultValue={platformColors.accent}
                onChange={onAccentChange}
              />
            </div>
          ) : null}
        </section>

        <section>
          <h3 className="text-[16px] font-semibold leading-[22px] text-[#334155]" style={interStyle}>
            Select Fonts
          </h3>
          <div className="mt-[16px] flex flex-wrap gap-[10px]">
            {TENANT_BRANDING_FONT_OPTIONS.map((opt) => {
              const selected = fontId === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onFontChange(opt.id)}
                  className={`flex min-w-[100px] flex-1 flex-col items-center justify-center rounded-[12px] border px-[12px] py-[18px] transition sm:min-w-[108px] ${
                    selected
                      ? "border-[color:var(--brand-primary)] bg-[#f8fafc]"
                      : "border-[#e2e8f0] bg-white hover:border-[#cbd5e1]"
                  }`}
                >
                  <span
                    className="text-[18px] font-semibold leading-none text-[#0f172a]"
                    style={{ fontFamily: opt.fontFamily }}
                  >
                    {opt.label}
                  </span>
                  {"isSystemDefault" in opt && opt.isSystemDefault ? (
                    <span className="mt-[8px] text-[11px] text-[#64748b]" style={interStyle}>
                      System Default
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <p className="mt-[14px] text-[13px] leading-[20px] text-[#64748b]" style={interStyle}>
            Note: You can skip this step if you want to use the default theme and font.
          </p>
        </section>

        <section className="rounded-[14px] border border-[#e8edf4] bg-[#fafafa] px-[16px] py-[18px]">
          <p className="mb-[14px] text-[13px] font-semibold text-[#475569]" style={interStyle}>
            Messages & background (optional)
          </p>
          <div className="space-y-[16px]">
            <TextField
              label="Welcome headline"
              required={false}
              value={headline}
              onChange={onHeadlineChange}
              placeholder={`Welcome to ${orgName.trim() || "your organization"}`}
            />
            <TextField
              label="Subtitle"
              required={false}
              value={subtitle}
              onChange={onSubtitleChange}
              placeholder="HR Simplified for growing teams"
            />
            <TextField
              label="Background image"
              required={false}
              value={backgroundFile ? "" : backgroundUrl}
              onChange={onBackgroundChange}
              placeholder={backgroundFile ? "Using uploaded image" : "/images/singup-bg-image.jpg"}
              disabled={Boolean(backgroundFile)}
            />
            <p className="-mt-[8px] text-[12px] leading-[18px] text-[#64748b]" style={interStyle}>
              Hero image on login/signup. Paste a web link or path, or upload a file below.
            </p>
            <div>
              <FieldLabel required={false}>Or upload background</FieldLabel>
              <p className="mb-2 text-[12px] leading-[18px] text-[#64748b]" style={interStyle}>
                PNG, JPG, or WEBP. Max 3 MB.
              </p>
              {backgroundFile && backgroundPreviewSrc ? (
                <div className="flex items-center gap-[14px] rounded-[12px] border border-[color:var(--brand-primary)] bg-white px-[14px] py-[12px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={backgroundPreviewSrc}
                    alt=""
                    className="h-[56px] w-[72px] shrink-0 rounded-[8px] border border-[#e2e8f0] object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-[14px] font-semibold leading-[20px] text-[#0f172a]"
                      style={interStyle}
                    >
                      {backgroundFile.name}
                    </p>
                    <p className="text-[12px] text-[#64748b]" style={interStyle}>
                      Uploaded background
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearBackgroundUpload}
                    className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[8px] text-[color:var(--brand-primary)] transition hover:bg-[#f1f5f9]"
                    aria-label="Remove background image"
                  >
                    <Trash2 className="h-[20px] w-[20px]" strokeWidth={2} />
                  </button>
                </div>
              ) : (
                <>
                  <input
                    ref={backgroundInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event) => handleBackgroundFile(event.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    onClick={() => backgroundInputRef.current?.click()}
                    className="to-on-brand inline-flex h-[40px] cursor-pointer items-center justify-center rounded-lg bg-[#012352] px-4 text-[14px] font-medium text-white transition hover:brightness-110"
                    style={{ ...interStyle, color: "#ffffff" }}
                  >
                    Choose file
                  </button>
                  <span className="ml-3 text-[13px] text-[#64748b]" style={interStyle}>
                    No file chosen
                  </span>
                </>
              )}
              {backgroundUploadError ? (
                <p className="mt-2 text-[12px] text-[#e11d48]" style={interStyle}>
                  {backgroundUploadError}
                </p>
              ) : null}
            </div>
          </div>
        </section>

      </div>

      <StepActions
        className="mt-[36px]"
        onBack={onBack}
        onContinue={onContinue}
        continueLabel="Save and Continue"
      />
      <SkipForNowButton onClick={onSkip} />
    </div>
  );
}

export function DomainStep({
  subdomain,
  publicRootDomain,
  onSubdomainChange,
  onContinue,
  onBack,
  serverError = null,
}: {
  subdomain: string;
  publicRootDomain: string;
  onSubdomainChange: (value: string) => void;
  onContinue: () => void;
  onBack: () => void;
  serverError?: string | null;
}) {
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [checking, setChecking] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const hostPreview = publicRootDomain ? `${subdomain || "your-org"}.${publicRootDomain}` : null;

  const localError = submitAttempted ? subdomainFieldErrorMessage(subdomain) : null;
  const displayError = fieldError ?? localError ?? serverError;

  const handleSubdomainChange = (value: string) => {
    onSubdomainChange(value);
    setFieldError(null);
  };

  const handleContinue = async () => {
    setSubmitAttempted(true);
    setFieldError(null);

    const formatError = subdomainFieldErrorMessage(subdomain);
    if (formatError) {
      return;
    }

    setChecking(true);
    try {
      const res = await fetch("/api/tenant-onboarding/check-subdomain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setFieldError(payload.error ?? "This domain is not available. Please choose another.");
        return;
      }
      onContinue();
    } catch {
      setFieldError("Could not verify domain. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div>
      <StepHeading title="Create your BrassHR Domain" subtitle="Customize your BrassHR Domain" />

      <div className="mt-[28px] space-y-[24px]">
        <div className="rounded-[12px] border border-[#b6c8de] bg-[#f8fbff] p-[18px]">
          <div
            className={`flex flex-nowrap items-center gap-2 rounded-[12px] border bg-white p-[10px] sm:gap-4 ${
              displayError ? "border-[#DC2626] ring-2 ring-[#DC2626]/20" : "border-[#d4dbe6]"
            }`}
          >
            <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[8px] bg-[#f8fbff] text-[#104b83] sm:h-[40px] sm:w-[40px]">
              <Link2 className="h-[16px] w-[16px] sm:h-[18px] sm:w-[18px]" />
            </div>
            <input
              value={subdomain}
              onChange={(e) => handleSubdomainChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="companydomain"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={displayError ? true : undefined}
              style={inputTypographyStyle}
              className={`min-w-0 flex-1 border-0 bg-transparent py-[10px] ${inputTextClass} text-[#0f172a] outline-none`}
            />
            <span className="whitespace-nowrap text-[15px] font-semibold leading-none text-[#0b3a70] sm:text-[20px]" style={interStyle}>
              .{publicRootDomain || "brasshr.com"}
            </span>
          </div>
          <div className="mt-[14px] text-[16px] leading-[24px] text-[#0f172a]" style={interStyle}>
            Domain preview:&nbsp;
            <span className="font-semibold">{hostPreview ?? "abcccompany.brasshr.com"}</span>
          </div>
          <FieldError message={displayError} />
        </div>
      </div>

      <StepActions
        onBack={onBack}
        onContinue={() => void handleContinue()}
        continueLabel={checking ? "Checking..." : "Save and Continue"}
        continueDisabled={checking}
      />
    </div>
  );
}

export function WorkerOnboardingStep({
  steps,
  onStepsChange,
  onContinue,
  onBack,
}: {
  steps: OnboardingStepDraft[];
  onStepsChange: (steps: OnboardingStepDraft[]) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <StepHeading
        title="Worker onboarding flow"
        subtitle="Choose which steps applicants complete and which documents are required."
      />
      <div className="mt-[28px]">
        <OnboardingStepsBuilder steps={steps} onChange={onStepsChange} />
      </div>
      <StepActions onBack={onBack} onContinue={onContinue} />
    </div>
  );
}

export function PreviewCard({ b }: { b: TenantBranding }) {
  const shellStyle = brandingToCssVars(b) as CSSProperties;
  const logoSrc = normalizeBrandingImageSrc(b.logoUrl, "/images/new-logo-nexus.svg", { allowBlob: true });
  const panelSrc = normalizeBrandingImageSrc(b.loginBackgroundSrc, "/images/handshake.jpg", { allowBlob: true });

  return (
    <div
      className="overflow-hidden rounded-[16px] border border-[#e2e8f0] bg-white shadow-sm"
      style={shellStyle}
    >
      <div className="relative bg-[color:var(--brand-primary)] p-4 min-[520px]:hidden">
        <div className="relative overflow-hidden rounded-[20px] bg-white/88 px-5 py-8 text-center shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={panelSrc} alt="" className="h-full w-full object-cover object-right opacity-25 grayscale" />
            <div className="absolute inset-0 bg-gradient-to-r from-white/75 via-white/60 to-black/10" />
          </div>

          <div className="relative z-10 flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} alt="" className="h-11 max-w-[150px] object-contain" />
            <h3
              className="mt-5 text-[24px] font-semibold leading-[30px]"
              style={{ fontFamily: "var(--brand-font-heading)", color: "var(--brand-heading)" }}
            >
              {b.headline}
            </h3>
            <p
              className="mt-2 text-[14px] leading-5"
              style={{ fontFamily: "var(--brand-font-body)", color: "var(--brand-muted)" }}
            >
              {b.subtitle}
            </p>
            <button
              type="button"
              className="to-on-brand mt-6 w-full max-w-[196px] rounded-xl px-5 py-2.5 text-[18px] font-semibold leading-[22px] text-white"
              style={{ backgroundColor: "var(--brand-primary)", color: "#ffffff" }}
            >
              {APPLICANT_PORTAL_CTA_START_APPLICATION}
            </button>
            <p className="mt-5 text-center text-[13px] leading-5 text-slate-500">
              Already approved?{" "}
              <span className="font-semibold" style={{ color: "var(--brand-primary)" }}>
                Worker sign in
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="hidden grid-cols-[58%_42%] min-[520px]:grid">
        <div className="flex flex-col items-center justify-center gap-4 px-5 py-7 text-center min-[520px]:px-6 min-[520px]:py-8">
          <div className="space-y-2">
            <h3
              className="text-[20px] font-semibold leading-[28px] text-slate-800 sm:text-[24px] sm:leading-[32px]"
              style={{ fontFamily: "var(--brand-font-heading)", color: "var(--brand-heading)" }}
            >
              {b.headline}
            </h3>
            <p
              className="text-[14px] leading-5 text-slate-500 sm:text-[15px] sm:leading-6"
              style={{ fontFamily: "var(--brand-font-body)", color: "var(--brand-muted)" }}
            >
              {b.subtitle}
            </p>
          </div>

          <p
            className="text-[16px] font-semibold leading-[22px] sm:text-[18px]"
            style={{ color: "var(--brand-primary)" }}
          >
            {APPLICANT_PORTAL_CTA_START_APPLICATION}
          </p>

          <p className="text-center text-[13px] leading-5 text-slate-500">
            Already approved?{" "}
            <span className="font-semibold" style={{ color: "var(--brand-primary)" }}>
              Worker sign in
            </span>
          </p>
        </div>

        <div className="relative flex min-h-[220px] items-center justify-center overflow-hidden border-t border-slate-200 min-[520px]:min-h-[260px] min-[520px]:border-l min-[520px]:border-t-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={panelSrc} alt="" className="absolute inset-0 h-full w-full object-cover grayscale" />
          <div className="absolute inset-0 bg-white/75" />

          <div className="relative z-10 flex w-full max-w-[200px] flex-col items-center gap-3 px-4 text-center sm:gap-4">
            <div className="flex h-[40px] w-[120px] items-center justify-center sm:h-[48px] sm:w-[140px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoSrc} alt="" className="max-h-[40px] max-w-[120px] object-contain sm:max-h-[48px] sm:max-w-[140px]" />
            </div>

            <div className="flex w-full max-w-[180px] items-center justify-center gap-3">
              <div className="h-px flex-1 bg-slate-400/40" />
              <BrandedSvgIcon
                src="/icons/circle-star-icon.svg"
                className="h-4 w-4 flex-none sm:h-5 sm:w-5"
                color={b.primaryHex}
              />
              <div className="h-px flex-1 bg-slate-400/40" />
            </div>

            <p className="max-w-[180px] text-center text-[12px] leading-5 text-black sm:text-[13px] sm:leading-6">
              {b.tagline}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PreviewStep({
  preview,
  onContinue,
  onBack,
}: {
  preview: TenantBranding;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <StepHeading
        title="Applicant preview"
        subtitle="This is how your branding will look to applicants."
      />
      <div className="mt-[28px]">
        <PreviewCard b={preview} />
      </div>
      <StepActions onBack={onBack} onContinue={onContinue} continueLabel="Continue" />
    </div>
  );
}

export function InviteTeamMembersStep({
  inviteEmails,
  submitting,
  inviteNotice,
  onInviteEmailsChange,
  onAddEmail,
  onRemoveEmail,
  onSkip,
  onSendInvites,
  onBack,
}: {
  inviteEmails: string[];
  submitting: boolean;
  inviteNotice: string | null;
  onInviteEmailsChange: (index: number, value: string) => void;
  onAddEmail: () => void;
  onRemoveEmail: (index: number) => void;
  onSkip: () => void;
  onSendInvites: () => void;
  onBack: () => void;
}) {
  const skipping = submitting;

  return (
    <div>
      <StepHeading
        title="Invite Team Members"
        subtitle="Add team emails. You can skip and invite later from your dashboard."
      />
      <div className="mt-[28px] space-y-[20px]">
        {inviteEmails.map((email, index) => (
          <div key={`invite-email-${index}`} className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <FieldLabel required={false}>{index === 0 ? "Email" : `Email ${index + 1}`}</FieldLabel>
              <input
                type="email"
                value={email}
                onChange={(e) => onInviteEmailsChange(index, e.target.value)}
                placeholder="name@company.com"
                style={inputTypographyStyle}
                className={`h-[56px] w-full rounded-[8px] border border-[#cbd5e1] bg-white px-[14px] ${inputTextClass} text-[#0f172a] outline-none transition placeholder:text-[#94a3b8] ${inputFocusClass}`}
              />
            </div>
            {inviteEmails.length > 1 ? (
              <button
                type="button"
                onClick={() => onRemoveEmail(index)}
                className="mt-[30px] shrink-0 text-[13px] font-semibold text-[#64748b] transition hover:text-[#0f172a]"
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}

        {inviteEmails.length < 5 ? (
          <button
            type="button"
            onClick={onAddEmail}
            className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#104b83] transition hover:text-[#0b3a70]"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Add email
          </button>
        ) : null}
      </div>

      {inviteNotice ? (
        <div
          className="mt-[20px] rounded-[8px] border border-[#BFDBFE] bg-[#EFF6FF] px-[14px] py-[12px] text-[14px] leading-[20px] text-[#1E40AF]"
          style={interStyle}
          role="status"
        >
          {inviteNotice}
        </div>
      ) : null}

      <InviteStepActions
        onBack={onBack}
        onSkip={onSkip}
        onSendInvites={onSendInvites}
        skipping={skipping}
      />
    </div>
  );
}

export function DoneStep({
  preview,
  createdSlug,
  createdDomain,
  firmaProvisioning,
}: {
  preview: TenantBranding;
  createdSlug: string | null;
  createdDomain: string | null;
  firmaProvisioning?: {
    status: string;
    workspaceId?: string | null;
    message?: string | null;
  } | null;
}) {
  const headline = (() => {
    switch (firmaProvisioning?.status) {
      case "created":
        return "Tenant ready! E-Signature Workspace created successfully.";
      case "already_configured":
        return "Tenant ready! E-Signature Workspace is already configured.";
      case "failed":
        return "Tenant ready!";
      default:
        return "Tenant ready!";
    }
  })();

  const firmaMessage = (() => {
    switch (firmaProvisioning?.status) {
      case "failed":
        return sanitizeESignatureUserMessage(
          firmaProvisioning.message,
          "Tenant ready, but e-signature workspace creation failed. You can retry in Account Settings."
        );
      default:
        return null;
    }
  })();

  const firmaTone = firmaProvisioning?.status === "failed" ? "warning" : "success";

  // Send recruiters to the clean "/admin" login (no protected "/admin_recruiter"
  // hop that the middleware bounces to "/admin?next=...", which flashes an error).
  const cleanedDashboardDomain = createdDomain
    ? createdDomain.replace(/^https?:\/\//i, "").replace(/\/+$/, "")
    : "";
  const dashboardProtocol =
    typeof window !== "undefined" && window.location.protocol
      ? window.location.protocol
      : "https:";
  const dashboardHref = cleanedDashboardDomain
    ? `${dashboardProtocol}//${cleanedDashboardDomain}/admin`
    : "/admin";

  return (
    <div className="text-center">
      <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--brand-primary)_15%,white)]">
        <Check className="h-[36px] w-[36px] text-[color:var(--brand-primary)]" strokeWidth={2.5} />
      </div>
      <h2 className="mt-[24px] text-[30px] font-semibold leading-[36px] text-[#0f172a]" style={interStyle}>
        {headline}
      </h2>
      <p className="mx-auto mt-[12px] max-w-lg text-[16px] leading-[24px] text-[#64748b]" style={interStyle}>
        Applicant portal:{" "}
        <span className="font-mono text-[#0f172a]">
          {createdDomain ? `https://${createdDomain}` : createdSlug ? `tenant “${createdSlug}”` : "—"}
        </span>
        . Sign in with the recruiter you created, then share your subdomain URL with applicants.
      </p>
      {firmaProvisioning?.workspaceId &&
      (firmaProvisioning.status === "created" || firmaProvisioning.status === "already_configured") ? (
        <p className="mx-auto mt-[12px] max-w-lg text-[14px] leading-[22px] text-[#64748b]" style={interStyle}>
          Workspace ID:{" "}
          <span className="font-mono text-[#0f172a]">{firmaProvisioning.workspaceId}</span>
        </p>
      ) : null}
      {firmaMessage ? (
        <div
          className={`mx-auto mt-[20px] max-w-lg rounded-[12px] border px-4 py-3 text-left text-[14px] leading-[22px] ${
            firmaTone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
          role="status"
        >
          <p>{firmaMessage}</p>
        </div>
      ) : null}
      <div className="mt-[32px] flex flex-wrap justify-center gap-3">
        <Link
          href={dashboardHref}
          className="to-on-brand inline-flex h-[52px] min-w-[200px] cursor-pointer items-center justify-center rounded-[12px] px-8 text-[15px] font-semibold text-white"
          style={primaryButtonStyle(true)}
        >
          Go to recruiter dashboard
        </Link>
        <Link
          href={withTenant(APPLICATION_ROUTES.addResume, createdSlug)}
          className="inline-flex h-[52px] min-w-[200px] items-center justify-center rounded-[12px] border border-[#e2e8f0] px-8 text-[15px] font-semibold text-[#0f172a]"
        >
          View applicant onboarding
        </Link>
      </div>
    </div>
  );
}

export { ErrorBanner };

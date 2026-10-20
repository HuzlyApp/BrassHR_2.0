"use client";

import type { ReactNode } from "react";
import OnboardingCheckbox from "@/app/components/OnboardingCheckbox";
import {
  APPLICANT_ACTION_ROW,
  APPLICANT_BTN_BACK,
  APPLICANT_BTN_PRIMARY,
} from "@/app/application/applicant-onboarding-responsive";

export type ActionRowProps = {
  onBack: () => void;
  onSkip?: () => void;
};

export function ActionRow({
  onBack,
  onSkip,
  primaryLabel,
  onPrimary,
  disabled,
  saving,
}: ActionRowProps & {
  primaryLabel: string;
  onPrimary: () => void;
  disabled?: boolean;
  saving?: boolean;
}) {
  return (
    <div className={APPLICANT_ACTION_ROW}>
      <button type="button" onClick={onBack} className={APPLICANT_BTN_BACK}>
        Back
      </button>
      <div className="flex gap-2 sm:contents">
        {onSkip ? (
          <button type="button" onClick={onSkip} disabled={saving} className={APPLICANT_BTN_BACK}>
            Skip for now
          </button>
        ) : null}
        <button
          type="button"
          disabled={disabled || saving}
          onClick={onPrimary}
          className={`${APPLICANT_BTN_PRIMARY} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {saving ? "Saving…" : primaryLabel}
        </button>
      </div>
    </div>
  );
}

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[color:var(--brand-primary)] disabled:bg-slate-50";

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      {title ? <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3> : null}
      {children}
    </section>
  );
}

function FieldLabel({ id, label, required, hint }: { id: string; label: string; required?: boolean; hint?: string }) {
  return (
    <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-700">
      {label}
      {required ? <span className="text-red-600"> *</span> : null}
      {hint ? <span className="ml-1 font-normal text-slate-500">({hint})</span> : null}
    </label>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  required,
  hint,
  type = "text",
  inputMode,
  autoComplete,
  maxLength,
  placeholder,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
  type?: "text" | "email" | "tel" | "date" | "password";
  inputMode?: "text" | "numeric" | "decimal" | "email" | "tel";
  autoComplete?: string;
  maxLength?: number;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <FieldLabel id={id} label={label} required={required} hint={hint} />
      <input
        id={id}
        type={type}
        value={value}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLASS}
      />
    </div>
  );
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  required,
  placeholder = "Select…",
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  required?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <FieldLabel id={id} label={label} required={required} />
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS}>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function RadioGroup({
  name,
  label,
  value,
  onChange,
  options,
  required,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  required?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </legend>
      <div className="space-y-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 has-[:checked]:border-[color:var(--brand-primary)] has-[:checked]:bg-[color:var(--brand-primary)]/5"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="mt-0.5 accent-[color:var(--brand-primary)]"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CheckboxRow({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <OnboardingCheckbox id={id} checked={checked} onChange={onChange} alignFirstLine>
      <span className="text-sm leading-5 text-slate-700">{children}</span>
    </OnboardingCheckbox>
  );
}

export type SignatureValue = { agreed: boolean; name: string };

export function isSignatureComplete(value: SignatureValue): boolean {
  return value.agreed && value.name.trim().length >= 2;
}

/** Attestation checkbox plus typed full legal name used as the electronic signature. */
export function SignatureBlock({
  idPrefix,
  statement,
  value,
  onChange,
}: {
  idPrefix: string;
  statement: string;
  value: SignatureValue;
  onChange: (value: SignatureValue) => void;
}) {
  return (
    <Section title="Signature">
      <CheckboxRow
        id={`${idPrefix}-agree`}
        checked={value.agreed}
        onChange={(agreed) => onChange({ ...value, agreed })}
      >
        {statement}
      </CheckboxRow>
      <TextField
        id={`${idPrefix}-signature`}
        className="mt-3 sm:max-w-sm"
        label="Type your full legal name to sign"
        value={value.name}
        onChange={(name) => onChange({ ...value, name })}
        autoComplete="name"
        maxLength={120}
        required
      />
    </Section>
  );
}

export function formatSubmittedDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

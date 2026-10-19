"use client";

import { useEffect, useState } from "react";
import { CARD_BORDER, TEXT_PRIMARY, TEXT_SECONDARY } from "@/app/components/workflow-builder/constants";
import {
  EMAIL_TEMPLATE_TYPE,
  EMAIL_TEMPLATE_TYPE_LABELS,
  isOnboardingEmailTemplateKey,
} from "@/lib/email-templates/template-keys";

export type EmailTemplateOption = {
  template_key: string;
  name: string;
  is_active?: boolean;
};

type EmailTemplateSelectProps = {
  value: string;
  templateName?: string;
  onChange: (next: { key: string; name: string }) => void;
  disabled?: boolean;
};

/** Recruiter notification stays on its own agreement path. This picker is candidate email only. */
function isCandidateEmailTemplateKey(key: string): boolean {
  return isOnboardingEmailTemplateKey(key) && key !== EMAIL_TEMPLATE_TYPE.RECRUITER_AGREEMENT_SIGNED;
}

export function EmailTemplateSelect({
  value,
  templateName,
  onChange,
  disabled = false,
}: EmailTemplateSelectProps) {
  const [options, setOptions] = useState<EmailTemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/email-templates", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            typeof data?.error === "string" ? data.error : "Could not load email templates"
          );
        }
        if (cancelled) return;
        const templates = Array.isArray(data.templates) ? (data.templates as EmailTemplateOption[]) : [];
        setOptions(
          templates.filter(
            (template) =>
              isCandidateEmailTemplateKey(template.template_key) && template.is_active !== false
          )
        );
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load email templates");
        setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const savedLabel =
    (value && isOnboardingEmailTemplateKey(value) ? EMAIL_TEMPLATE_TYPE_LABELS[value] : "") ||
    templateName ||
    value;

  return (
    <div data-testid="email-template-select">
      <label
        className="mb-1.5 block text-xs font-medium leading-4"
        style={{ color: TEXT_SECONDARY }}
      >
        Email template
      </label>
      <select
        data-testid="email-template-select-input"
        value={value}
        disabled={disabled || loading}
        onChange={(event) => {
          const key = event.target.value;
          const selected = options.find((option) => option.template_key === key);
          onChange({
            key,
            name: selected?.name ?? (key && isOnboardingEmailTemplateKey(key) ? EMAIL_TEMPLATE_TYPE_LABELS[key] : ""),
          });
        }}
        className="h-10 w-full appearance-none rounded-lg border bg-white px-3 text-sm outline-none transition focus:border-[#BC8B41] focus:ring-2 focus:ring-[#BC8B41]/25 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        style={{ borderColor: CARD_BORDER, color: TEXT_PRIMARY }}
        aria-label="Email template"
      >
        <option value="">{loading ? "Loading templates..." : "No email for this step"}</option>
        {value && savedLabel && !options.some((option) => option.template_key === value) ? (
          <option value={value}>{savedLabel}</option>
        ) : null}
        {options.map((option) => (
          <option key={option.template_key} value={option.template_key}>
            {option.name ||
              (isOnboardingEmailTemplateKey(option.template_key)
                ? EMAIL_TEMPLATE_TYPE_LABELS[option.template_key]
                : option.template_key)}
          </option>
        ))}
      </select>
      {error ? (
        <p className="mt-1.5 text-[11px] leading-4 text-red-600" data-testid="email-template-select-error">
          {error}
        </p>
      ) : !loading && options.length === 0 ? (
        <p className="mt-1.5 text-[11px] leading-4" style={{ color: TEXT_SECONDARY }}>
          No active email templates yet.{" "}
          <a
            href="/admin_recruiter/email-templates"
            className="font-medium underline underline-offset-2"
            style={{ color: "#BC8B41" }}
          >
            Open Email templates
          </a>
          . This step can stay blank.
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] leading-4" style={{ color: TEXT_SECONDARY }}>
          Optional. When this step is completed, the candidate receives this email. Leave blank to send nothing.
        </p>
      )}
    </div>
  );
}

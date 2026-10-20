"use client";

import { useCallback, useState } from "react";
import { AuthorizationsFirmaAgreementPanel } from "@/app/components/onboarding/AuthorizationsFirmaAgreementPanel";
import type { StepSettings } from "@/app/components/workflow-builder/types";
import { readFirmaTemplateSettings } from "@/lib/onboarding/firma-step-settings";
import type { PostHireSubmissionField } from "@/lib/onboarding/post-hire-step-screens";
import type { TenantOnboardingStep } from "@/lib/onboarding/types";
import { ActionRow, CheckboxRow, type ActionRowProps } from "./fields";

/** Steps with an attached Firma template are signed in the embedded Firma document instead of the built-in form. */
export default function FirmaSignedForm({
  step,
  applicantId,
  tenantSlug,
  signerEmail,
  signerEmailLoading,
  acknowledgmentText,
  submit,
  actions,
}: {
  step: TenantOnboardingStep;
  applicantId: string | null;
  tenantSlug: string | null;
  signerEmail: string;
  signerEmailLoading: boolean;
  acknowledgmentText: string;
  submit: (fields: PostHireSubmissionField[], extra?: Record<string, unknown>) => Promise<void>;
  actions: ActionRowProps;
}) {
  const [agreed, setAgreed] = useState(false);
  const [signed, setSigned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const templateName = readFirmaTemplateSettings(
    step.metadata?.workflow_settings as Partial<StepSettings> | undefined
  ).recruiterTemplateName;
  const handleSignedChange = useCallback((value: boolean) => {
    setSigned(value);
    if (value) setAgreed(true);
  }, []);

  async function handleContinue() {
    setError("");
    if (!signed) {
      setError("Sign the document before continuing.");
      return;
    }
    setSaving(true);
    try {
      await submit(
        [
          { label: "Signed document", value: "Signed electronically" },
          { label: "Statement", value: acknowledgmentText },
          { label: "Signed on", value: new Date().toLocaleDateString("en-US") },
        ],
        { signing_provider: "firma", firma_signed: true, authorization_agreed: true }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your progress");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mt-4">
        <CheckboxRow id="firma-agree" checked={agreed} onChange={(v) => !signed && setAgreed(v)}>
          {acknowledgmentText}
        </CheckboxRow>
      </div>
      <div className="mt-4">
        <AuthorizationsFirmaAgreementPanel
          applicantId={applicantId}
          step={step}
          tenantSlug={tenantSlug}
          signerEmail={signerEmail}
          signerEmailLoading={signerEmailLoading}
          agreed={agreed}
          onSignedChange={handleSignedChange}
          documentTitle={templateName ?? step.title}
        />
      </div>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      <ActionRow
        {...actions}
        primaryLabel="Continue"
        onPrimary={() => void handleContinue()}
        disabled={!signed}
        saving={saving}
      />
    </>
  );
}

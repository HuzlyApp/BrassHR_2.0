"use client";

import { useEffect, useState } from "react";
import { useOnboardingConfigOptional } from "@/app/components/onboarding/OnboardingConfigProvider";
// Bank account fields commented out per request - uncomment when re-enabling bank details collection
/*
import {
  isValidRoutingNumber,
  validateDirectDepositInput,
} from "@/lib/onboarding/post-hire-step-screens";
import { RadioGroup, TextField } from "./fields";
*/
import type { PostHireSubmissionField } from "@/lib/onboarding/post-hire-step-screens";
import { ActionRow, CheckboxRow, Section, type ActionRowProps } from "./fields";

/*
type Summary = {
  accountHolderName: string;
  bankName: string;
  accountType: "checking" | "savings";
  routingNumberMasked: string;
  accountNumberMasked: string;
};
*/

export default function DirectDepositForm({
  stepKey: _stepKey,
  stepId,
  applicantId: _applicantId,
  applicationId: _applicationId,
  tenantSlug: _tenantSlug,
  defaultHolderName: _defaultHolderName,
  authorizationText,
  isPreview: _isPreview,
  submit,
  persistDraft,
  actions,
}: {
  stepKey: string;
  stepId?: string;
  applicantId: string | null;
  applicationId: string | null;
  tenantSlug: string | null;
  defaultHolderName: string;
  authorizationText: string;
  isPreview: boolean;
  submit: (fields: PostHireSubmissionField[], extra?: Record<string, unknown>) => Promise<void>;
  persistDraft?: (extra: Record<string, unknown>) => Promise<void>;
  actions: ActionRowProps;
}) {
  const onboarding = useOnboardingConfigOptional();
  const progressRow = onboarding?.progress?.steps.find((row) =>
    stepId ? row.onboarding_step_id === stepId : row.step_key === _stepKey
  );
  const rowData = (progressRow?.data && typeof progressRow.data === "object" ? progressRow.data : {}) as Record<string, unknown>;
  const isAlreadyConfirmed = Boolean(
    rowData.checkbox_confirmed === true ||
    rowData.authorized === true ||
    rowData.direct_deposit_confirmed === true ||
    progressRow?.status === "completed"
  );

  const [authorized, setAuthorized] = useState(isAlreadyConfirmed);

  useEffect(() => {
    if (isAlreadyConfirmed && !authorized) {
      setAuthorized(true);
    }
  }, [isAlreadyConfirmed, authorized]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCheckboxChange(checked: boolean) {
    setAuthorized(checked);
    setError("");
    if (!persistDraft) return;
    try {
      await persistDraft({
        checkbox_confirmed: checked,
        checkbox_label: authorizationText,
        authorized: checked,
        direct_deposit_confirmed: checked,
        response: checked ? authorizationText : "",
        confirmed_at: checked ? new Date().toISOString() : null,
      });
    } catch {
      // Draft save failures should not block the candidate from continuing.
    }
  }

  /*
  const routingDigits = routing.replace(/\D/g, "");
  const routingInvalid = routingDigits.length === 9 && !isValidRoutingNumber(routingDigits);
  */

  async function handleSave() {
    setError("");
    /*
    const validation = validateDirectDepositInput({
      accountHolderName: holder || defaultHolderName,
      bankName,
      accountType,
      routingNumber: routing,
      accountNumber: account,
    });
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    if (account.replace(/\s+/g, "") !== accountConfirm.replace(/\s+/g, "")) {
      setError("Account numbers don't match.");
      return;
    }
    */
    if (!authorized) {
      setError("Authorize direct deposit to continue.");
      return;
    }
    /*
    if (isPreview) {
      setError("Direct deposit isn't saved in preview mode.");
      return;
    }
    if (!applicantId) {
      setError("Missing applicant session. Return to the first onboarding step.");
      return;
    }
    */

    setSaving(true);
    try {
      /*
      const res = await fetch("/api/onboarding/direct-deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicantId,
          tenantSlug: tenantSlug || undefined,
          applicationId: applicationId || undefined,
          stepKey,
          ...validation.value,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { summary?: Summary; error?: string };
      if (!res.ok || !json.summary) throw new Error(json.error || "Could not save your direct deposit");
      const summary = json.summary;
      setAccount("");
      setAccountConfirm("");
      await submit([
        { label: "Account holder", value: summary.accountHolderName },
        { label: "Bank", value: summary.bankName },
        { label: "Account type", value: summary.accountType === "savings" ? "Savings" : "Checking" },
        { label: "Routing number", value: summary.routingNumberMasked },
        { label: "Account number", value: summary.accountNumberMasked },
        { label: "Deposit authorization", value: "Authorized" },
      ]);
      */
      await submit(
        [
          { label: "Deposit authorization", value: "Authorized" },
          { label: "Confirmation", value: authorizationText },
        ],
        {
          checkbox_confirmed: true,
          checkbox_label: authorizationText,
          authorized: true,
          direct_deposit_confirmed: true,
          response: authorizationText,
          confirmed_at: new Date().toISOString(),
        }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete this step");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Bank account fields commented out per request - only showing authorization checkbox
      <Section title="Bank account">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <TextField
            id="dd-holder"
            label="Account holder name"
            value={holder}
            onChange={setHolder}
            autoComplete="name"
            maxLength={120}
            required
          />
          <TextField
            id="dd-bank"
            label="Bank name"
            value={bankName}
            onChange={setBankName}
            maxLength={120}
            required
          />
          <div className="sm:col-span-2">
            <RadioGroup
              name="dd-account-type"
              label="Account type"
              value={accountType}
              onChange={setAccountType}
              options={[
                { value: "checking", label: "Checking" },
                { value: "savings", label: "Savings" },
              ]}
              required
            />
          </div>
          <div>
            <TextField
              id="dd-routing"
              label="Routing number"
              hint="9 digits"
              value={routing}
              onChange={(v) => setRouting(v.replace(/[^\d\s]/g, ""))}
              inputMode="numeric"
              autoComplete="off"
              maxLength={11}
              required
            />
            {routingInvalid ? (
              <p className="mt-1 text-xs text-red-700">This routing number doesn&apos;t look right.</p>
            ) : null}
          </div>
          <div className="hidden sm:block" aria-hidden="true" />
          <TextField
            id="dd-account"
            label="Account number"
            type="password"
            value={account}
            onChange={(v) => setAccount(v.replace(/[^\d\s]/g, ""))}
            inputMode="numeric"
            autoComplete="off"
            maxLength={20}
            required
          />
          <TextField
            id="dd-account-confirm"
            label="Confirm account number"
            type="password"
            value={accountConfirm}
            onChange={(v) => setAccountConfirm(v.replace(/[^\d\s]/g, ""))}
            inputMode="numeric"
            autoComplete="off"
            maxLength={20}
            required
          />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Your account number is encrypted. HR only sees the last four digits here.
        </p>
      </Section>
      */}

      <Section>
        <CheckboxRow
          id="dd-authorize"
          checked={authorized}
          onChange={(checked) => void handleCheckboxChange(checked)}
        >
          {authorizationText}
        </CheckboxRow>
      </Section>

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      <ActionRow {...actions} primaryLabel="Save & continue" onPrimary={() => void handleSave()} saving={saving} />
    </>
  );
}

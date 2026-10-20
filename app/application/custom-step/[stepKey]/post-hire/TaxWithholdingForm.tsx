"use client";

import { useMemo, useState } from "react";
import { US_STATE_CODE_TO_NAME } from "@/lib/us-state-names";
import {
  W4_FILING_STATUS_OPTIONS,
  w4DependentsAmount,
  type PostHireSubmissionField,
} from "@/lib/onboarding/post-hire-step-screens";
import {
  ActionRow,
  CheckboxRow,
  isSignatureComplete,
  RadioGroup,
  Section,
  SelectField,
  SignatureBlock,
  TextField,
  type ActionRowProps,
  type SignatureValue,
} from "./fields";

const STATE_OPTIONS = Object.entries(US_STATE_CODE_TO_NAME)
  .map(([value, label]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label));

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function parseAmount(value: string): number {
  const n = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseCount(value: string): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function amountField(value: string): string {
  return value.replace(/[^\d.,]/g, "");
}

export default function TaxWithholdingForm({
  certificationText,
  submit,
  actions,
}: {
  certificationText: string;
  submit: (fields: PostHireSubmissionField[]) => Promise<void>;
  actions: ActionRowProps;
}) {
  const [filingStatus, setFilingStatus] = useState("");
  const [multipleJobs, setMultipleJobs] = useState(false);
  const [childCount, setChildCount] = useState("");
  const [otherDependents, setOtherDependents] = useState("");
  const [otherIncome, setOtherIncome] = useState("");
  const [deductions, setDeductions] = useState("");
  const [extraWithholding, setExtraWithholding] = useState("");
  const [exempt, setExempt] = useState(false);
  const [workState, setWorkState] = useState("");
  const [signature, setSignature] = useState<SignatureValue>({ agreed: false, name: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dependentsTotal = useMemo(
    () => w4DependentsAmount(parseCount(childCount), parseCount(otherDependents)),
    [childCount, otherDependents]
  );

  async function handleSave() {
    setError("");
    if (!filingStatus) {
      setError("Choose your filing status.");
      return;
    }
    if (!isSignatureComplete(signature)) {
      setError("Check the certification and type your full legal name to sign.");
      return;
    }
    const statusLabel = W4_FILING_STATUS_OPTIONS.find((o) => o.value === filingStatus)?.label ?? filingStatus;
    setSaving(true);
    try {
      await submit([
        { label: "Form", value: "Form W-4 (Employee's Withholding Certificate)" },
        { label: "Filing status", value: statusLabel },
        { label: "Multiple jobs or spouse works", value: multipleJobs ? "Yes" : "No" },
        { label: "Qualifying children under 17", value: String(parseCount(childCount)) },
        { label: "Other dependents", value: String(parseCount(otherDependents)) },
        { label: "Dependents amount (Step 3)", value: usd.format(dependentsTotal) },
        { label: "Other income (Step 4a)", value: usd.format(parseAmount(otherIncome)) },
        { label: "Deductions (Step 4b)", value: usd.format(parseAmount(deductions)) },
        { label: "Extra withholding per pay period (Step 4c)", value: usd.format(parseAmount(extraWithholding)) },
        { label: "Claims exemption from withholding", value: exempt ? "Yes" : "No" },
        { label: "Work state", value: workState ? US_STATE_CODE_TO_NAME[workState] ?? workState : "" },
        { label: "Signature", value: signature.name.trim() },
        { label: "Signed on", value: new Date().toLocaleDateString("en-US") },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your tax withholding");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Section title="Step 1 · Filing status">
        <RadioGroup
          name="w4-filing-status"
          label="Filing status"
          value={filingStatus}
          onChange={setFilingStatus}
          options={W4_FILING_STATUS_OPTIONS}
          required
        />
      </Section>

      <Section title="Step 2 · Multiple jobs or spouse works">
        <CheckboxRow id="w4-multiple-jobs" checked={multipleJobs} onChange={setMultipleJobs}>
          I hold more than one job at a time, or I&apos;m married filing jointly and my spouse also works.
        </CheckboxRow>
      </Section>

      <Section title="Step 3 · Dependents">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <TextField
            id="w4-children"
            label="Qualifying children under 17"
            hint="× $2,000"
            value={childCount}
            onChange={(v) => setChildCount(v.replace(/\D/g, ""))}
            inputMode="numeric"
            maxLength={2}
          />
          <TextField
            id="w4-other-dependents"
            label="Other dependents"
            hint="× $500"
            value={otherDependents}
            onChange={(v) => setOtherDependents(v.replace(/\D/g, ""))}
            inputMode="numeric"
            maxLength={2}
          />
        </div>
        <p className="mt-2 text-sm text-slate-700">
          Total dependents amount: <span className="font-semibold">{usd.format(dependentsTotal)}</span>
        </p>
      </Section>

      <Section title="Step 4 · Other adjustments (optional)">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <TextField
            id="w4-other-income"
            label="Other income (not from jobs)"
            value={otherIncome}
            onChange={(v) => setOtherIncome(amountField(v))}
            inputMode="decimal"
            placeholder="$0"
          />
          <TextField
            id="w4-deductions"
            label="Deductions"
            value={deductions}
            onChange={(v) => setDeductions(amountField(v))}
            inputMode="decimal"
            placeholder="$0"
          />
          <TextField
            id="w4-extra"
            label="Extra withholding per pay period"
            value={extraWithholding}
            onChange={(v) => setExtraWithholding(amountField(v))}
            inputMode="decimal"
            placeholder="$0"
          />
        </div>
        <div className="mt-3">
          <CheckboxRow id="w4-exempt" checked={exempt} onChange={setExempt}>
            I claim exemption from federal income tax withholding (I had no tax liability last year and expect none
            this year).
          </CheckboxRow>
        </div>
      </Section>

      <Section title="State">
        <SelectField
          id="w4-state"
          className="sm:max-w-sm"
          label="State where you will work"
          value={workState}
          onChange={setWorkState}
          options={STATE_OPTIONS}
        />
        <p className="mt-2 text-xs text-slate-500">HR will send any state withholding form your work state requires.</p>
      </Section>

      <SignatureBlock idPrefix="w4" statement={certificationText} value={signature} onChange={setSignature} />

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      <ActionRow {...actions} primaryLabel="Sign & continue" onPrimary={() => void handleSave()} saving={saving} />
    </>
  );
}

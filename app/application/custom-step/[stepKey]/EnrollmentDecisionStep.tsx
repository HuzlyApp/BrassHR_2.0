"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useOnboardingConfigOptional } from "@/app/components/onboarding/OnboardingConfigProvider";
import { persistStepProgress } from "@/lib/onboarding/use-mark-step-in-progress-if-pending";
import {
  enrollmentDecisionData,
  enrollmentQuestionForStep,
  readEnrollmentDecision,
  statusForEnrollmentDecision,
  type EnrollmentDecision,
} from "@/lib/onboarding/enrollment-decision-step";
import type { OnboardingStepStatus, TenantOnboardingStep } from "@/lib/onboarding/types";
import {
  APPLICANT_ACTION_ROW,
  APPLICANT_BTN_BACK,
  APPLICANT_BTN_PRIMARY,
} from "@/app/application/applicant-onboarding-responsive";
import { CheckboxRow, Section } from "./post-hire/fields";

type UpdateStepStatus = (
  stepKey: string,
  status: OnboardingStepStatus,
  data?: Record<string, unknown>
) => Promise<void>;

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function EnrollmentDecisionStep({
  step,
  required,
  updateStepStatus,
  onBack,
  onContinue,
}: {
  step: TenantOnboardingStep;
  required: boolean;
  updateStepStatus: UpdateStepStatus | undefined;
  onBack: () => void;
  onContinue: () => void;
}) {
  const onboarding = useOnboardingConfigOptional();
  const completingRef = useRef(false);
  const [saving, setSaving] = useState<EnrollmentDecision | null>(null);
  const [error, setError] = useState("");

  const question = enrollmentQuestionForStep(step);
  const progressRow = onboarding?.progress?.steps.find(
    (row) => row.onboarding_step_id === step.id || row.step_key === step.step_key
  );
  const saved = progressRow ? readEnrollmentDecision(progressRow.data) : null;
  const rowData = (progressRow?.data && typeof progressRow.data === "object" ? progressRow.data : {}) as Record<string, unknown>;

  const checkboxLabel = useMemo(() => {
    const rawSettings = step.metadata?.workflow_settings as Record<string, unknown> | undefined;
    if (typeof rawSettings?.acknowledgmentText === "string" && rawSettings.acknowledgmentText.trim()) {
      return rawSettings.acknowledgmentText.trim();
    }
    const title = step.title?.trim();
    if (title) return `I confirm that I have completed ${title}.`;
    return question;
  }, [step, question]);

  const isInitiallyConfirmed = Boolean(
    saved?.decision === "agreed" ||
    rowData.checkbox_confirmed === true ||
    rowData.benefits_enrollment_confirmed === true ||
    rowData.retirement_enrollment_confirmed === true ||
    rowData.k401_enrollment_confirmed === true ||
    progressRow?.status === "completed"
  );

  const [confirmed, setConfirmed] = useState(isInitiallyConfirmed);

  useEffect(() => {
    if (isInitiallyConfirmed && !confirmed) {
      setConfirmed(true);
    }
  }, [isInitiallyConfirmed, confirmed]);

  const answeredOn = formatDate(saved?.answeredAt ?? (rowData.confirmed_at as string | null) ?? null);

  async function handleSaveAgreed() {
    setError("");
    if (!confirmed) {
      setError("Please check the confirmation box to continue.");
      return;
    }
    setSaving("agreed");
    try {
      const isBenefits =
        step.step_key.includes("benefit") ||
        step.metadata?.workflow_step_id === "benefits-enrollment" ||
        (step.title || "").toLowerCase().includes("benefit");
      const is401k =
        step.step_key.includes("401k") ||
        step.step_key.includes("retirement") ||
        step.metadata?.workflow_step_id === "401k-enrollment" ||
        (step.title || "").toLowerCase().includes("401k");

      const extraData: Record<string, unknown> = {
        checkbox_confirmed: true,
        checkbox_label: checkboxLabel,
        response: checkboxLabel,
        step_type: step.step_type,
        ...(isBenefits ? { benefits_enrollment_confirmed: true, benefits_enrollment_decision: "agreed" } : {}),
        ...(is401k ? { retirement_enrollment_confirmed: true, k401_enrollment_confirmed: true, retirement_enrollment_decision: "agreed" } : {}),
        post_hire_submission: {
          kind: "acknowledgment",
          fields: [
            { label: step.title || "Enrollment", value: "Confirmed" },
            { label: "Confirmation", value: checkboxLabel },
          ],
          submitted_at: new Date().toISOString(),
        },
      };

      await persistStepProgress(
        updateStepStatus,
        step.step_key,
        "completed",
        completingRef,
        enrollmentDecisionData("agreed", question, new Date().toISOString(), extraData)
      );
      onContinue();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your response");
    } finally {
      setSaving(null);
    }
  }

  async function handleNotReady() {
    setError("");
    setSaving("not_ready");
    try {
      await persistStepProgress(
        updateStepStatus,
        step.step_key,
        statusForEnrollmentDecision("not_ready", required),
        completingRef,
        enrollmentDecisionData("not_ready", question, new Date().toISOString())
      );
      if (!required) onContinue();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your response");
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <Section>
        <CheckboxRow
          id={`enrollment-confirm-${step.id || step.step_key}`}
          checked={confirmed}
          onChange={(checked) => setConfirmed(checked)}
        >
          <span className="font-medium text-slate-800">{checkboxLabel}</span>
          {required ? <span className="text-red-600"> *</span> : null}
        </CheckboxRow>
        <p className="mt-2 text-xs text-slate-500">{question}</p>
      </Section>

      {confirmed && answeredOn ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          You confirmed this step{answeredOn ? ` on ${answeredOn}` : ""}.
        </p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

      <div className={APPLICANT_ACTION_ROW}>
        <button type="button" onClick={onBack} className={APPLICANT_BTN_BACK}>
          Back
        </button>
        <div className="flex gap-2">
          {!required ? (
            <button
              type="button"
              disabled={saving != null}
              onClick={() => void handleNotReady()}
              className={`${APPLICANT_BTN_BACK} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {saving === "not_ready" ? "Saving…" : "Skip for now"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={saving != null}
            onClick={() => void handleSaveAgreed()}
            className={`${APPLICANT_BTN_PRIMARY} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {saving === "agreed" ? "Saving…" : "Save & continue"}
          </button>
        </div>
      </div>
    </>
  );
}

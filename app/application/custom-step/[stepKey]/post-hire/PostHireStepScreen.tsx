"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, Eye } from "lucide-react";
import { useOnboardingConfigOptional } from "@/app/components/onboarding/OnboardingConfigProvider";
import { persistStepProgress } from "@/lib/onboarding/use-mark-step-in-progress-if-pending";
import { skipOnboardingStep } from "@/lib/onboarding/skip-onboarding-step";
import { isOnboardingStepSkippable } from "@/lib/onboarding/is-step-skippable";
import { stepUsesFirmaSigning } from "@/lib/onboarding/firma-step-settings";
import { isAgreementOrSignatureStep } from "@/lib/onboarding/is-agreement-step";
import { useApplicantSigningEmail } from "@/lib/onboarding/use-applicant-signing-email";
import {
  buildPostHireSubmissionData,
  effectivePostHireProgressStatus,
  hasCandidatePostHireEvidence,
  readPostHireScreenContent,
  readPostHireSubmission,
  type PostHireScreenKind,
  type PostHireSubmissionField,
} from "@/lib/onboarding/post-hire-step-screens";
import type { OnboardingStepStatus, TenantOnboardingStep } from "@/lib/onboarding/types";
import { ActionRow, formatSubmittedDate, Section, type ActionRowProps } from "./fields";
import AcknowledgmentForm from "./AcknowledgmentForm";
import DirectDepositForm from "./DirectDepositForm";
import FirmaSignedForm from "./FirmaSignedForm";
import I9AttestationForm from "./I9AttestationForm";
import StepContent from "./StepContent";
import TaxWithholdingForm from "./TaxWithholdingForm";

type UpdateStepStatus = (
  stepKey: string,
  status: OnboardingStepStatus,
  data?: Record<string, unknown>,
  stepId?: string
) => Promise<void>;

const FIRMA_CAPABLE_KINDS: ReadonlySet<PostHireScreenKind> = new Set([
  "tax_withholding",
  "i9_attestation",
  "acknowledgment",
]);

export default function PostHireStepScreen({
  step,
  kind,
  tenantSlug,
  updateStepStatus,
  onBack,
  onContinue,
}: {
  step: TenantOnboardingStep;
  kind: PostHireScreenKind;
  tenantSlug: string | null;
  updateStepStatus: UpdateStepStatus | undefined;
  onBack: () => void;
  onContinue: () => void;
}) {
  const onboarding = useOnboardingConfigOptional();
  const applicantId = onboarding?.applicantId ?? null;
  const completingRef = useRef(false);
  const [editing, setEditing] = useState(false);
  const signer = useApplicantSigningEmail({ applicantId, tenantSlug });

  const progressRows = onboarding?.progress?.steps ?? [];
  // Prefer step id only — shared step_key prefixes (custom_question_N) must not cross-match.
  const progressRow = progressRows.find((row) => row.onboarding_step_id === step.id) ?? null;
  const submission = progressRow ? readPostHireSubmission(progressRow.data) : null;
  const effectiveStatus = effectivePostHireProgressStatus(kind, progressRow?.status, progressRow?.data);
  const done = effectiveStatus === "completed" && hasCandidatePostHireEvidence(kind, progressRow?.data);
  const content = readPostHireScreenContent(step);
  const usesFirma = FIRMA_CAPABLE_KINDS.has(kind) && stepUsesFirmaSigning(step);
  const fullName = `${signer.firstName} ${signer.lastName}`.trim();
  const healAttemptedRef = useRef<string | null>(null);

  // Heal false "completed" rows (no checkbox / submission) so candidate sees the form again.
  useEffect(() => {
    if (!progressRow || !updateStepStatus || usesFirma) return;
    if (progressRow.status !== "completed") return;
    if (hasCandidatePostHireEvidence(kind, progressRow.data)) return;
    if (healAttemptedRef.current === step.id) return;
    healAttemptedRef.current = step.id;
    void persistStepProgress(
      updateStepStatus,
      step.step_key,
      "pending",
      completingRef,
      {
        step_type: step.step_type,
        false_completion_reset: true,
        reset_at: new Date().toISOString(),
      },
      step.id
    ).catch(() => {
      healAttemptedRef.current = null;
    });
  }, [progressRow, updateStepStatus, usesFirma, kind, step.id, step.step_key, step.step_type]);

  async function submit(fields: PostHireSubmissionField[], extra?: Record<string, unknown>) {
    await persistStepProgress(
      updateStepStatus,
      step.step_key,
      "completed",
      completingRef,
      {
        ...extra,
        ...buildPostHireSubmissionData(kind, fields),
        step_type: step.step_type,
      },
      step.id
    );
    setEditing(false);
    onContinue();
  }

  /** Persist checkbox / partial response without marking the step completed. */
  async function persistCheckboxDraft(extra: Record<string, unknown>) {
    if (done || !updateStepStatus) return;
    await persistStepProgress(
      updateStepStatus,
      step.step_key,
      "in_progress",
      completingRef,
      {
        ...extra,
        step_type: step.step_type,
      },
      step.id
    );
  }

  const actions: ActionRowProps = {
    onBack,
    onSkip:
      !done && isOnboardingStepSkippable(step)
        ? () => void skipOnboardingStep({ step, updateStepStatus, completingRef, onNavigate: onContinue })
        : undefined,
  };

  const showMedia = kind === "training" || kind === "acknowledgment";

  if (done && !editing) {
    const submittedOn = formatSubmittedDate(submission?.submittedAt ?? progressRow?.completed_at ?? null);
    return (
      <>
        <StepContent content={content} showMedia={showMedia} />
        <Section>
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Completed{submittedOn ? ` on ${submittedOn}` : ""}
          </p>
          {submission?.fields.length ? (
            <dl className="mt-3 space-y-2 text-sm">
              {submission.fields
                .filter((field) => field.label !== "Statement")
                .map((field) => (
                  <div key={field.label} className="flex justify-between gap-3">
                    <dt className="text-slate-500">{field.label}</dt>
                    <dd className="text-right font-medium text-slate-800 break-all">{field.value}</dd>
                  </div>
                ))}
            </dl>
          ) : null}

          {(() => {
            const rowData = progressRow?.data && typeof progressRow.data === "object" && !Array.isArray(progressRow.data)
              ? (progressRow.data as Record<string, unknown>)
              : {};
            const isAgreement =
              usesFirma ||
              isAgreementOrSignatureStep(step) ||
              Boolean(rowData.signing_request_id || rowData.firma_status || rowData.download_url);
            const downloadUrl = (rowData.download_url as string) || (rowData.signed_document_url as string) || null;
            const signingRequestId = (rowData.signing_request_id as string) || null;

            if (!isAgreement || (!downloadUrl && !signingRequestId)) return null;

            return (
              <div className="mt-4 flex flex-wrap items-center gap-2.5 pt-3 border-t border-slate-100">
                <a
                  href={
                    downloadUrl ||
                    `/api/onboarding/firma-sign/download?${new URLSearchParams({
                      applicantId: applicantId || "",
                      stepKey: step.step_key || "",
                      signingRequestId: signingRequestId || "",
                      redirect: "true",
                    }).toString()}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--brand-primary)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--brand-primary)] shadow-sm transition hover:bg-slate-50"
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden />
                  Preview Signed Agreement
                </a>
                <a
                  href={
                    downloadUrl ||
                    `/api/onboarding/firma-sign/download?${new URLSearchParams({
                      applicantId: applicantId || "",
                      stepKey: step.step_key || "",
                      signingRequestId: signingRequestId || "",
                      redirect: "true",
                      download: "true",
                      filename: `${step.title || "Signed_Agreement"}.pdf`,
                    }).toString()}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  download={`${step.title || "Signed_Agreement"}.pdf`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-95"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Download Signed Agreement
                </a>
              </div>
            );
          })()}

          {!usesFirma ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-3 text-sm font-medium text-[color:var(--brand-primary)] hover:underline"
            >
              Update my answers
            </button>
          ) : null}
        </Section>
        <ActionRow onBack={onBack} primaryLabel="Continue" onPrimary={onContinue} />
      </>
    );
  }

  return (
    <>
      <StepContent content={content} showMedia={showMedia} />
      {usesFirma ? (
        <FirmaSignedForm
          step={step}
          applicantId={applicantId}
          tenantSlug={tenantSlug}
          signerEmail={signer.email}
          signerEmailLoading={!signer.resolved}
          acknowledgmentText={content.acknowledgmentText}
          submit={submit}
          actions={actions}
        />
      ) : kind === "direct_deposit" ? (
        <DirectDepositForm
          stepKey={step.step_key}
          stepId={step.id}
          applicantId={applicantId}
          applicationId={onboarding?.applicationId ?? null}
          tenantSlug={tenantSlug}
          defaultHolderName={fullName}
          authorizationText={content.acknowledgmentText}
          isPreview={Boolean(onboarding?.isDraftPreview)}
          submit={submit}
          persistDraft={persistCheckboxDraft}
          actions={actions}
        />
      ) : kind === "tax_withholding" ? (
        <TaxWithholdingForm certificationText={content.acknowledgmentText} submit={submit} actions={actions} />
      ) : kind === "i9_attestation" ? (
        <I9AttestationForm
          prefill={{ firstName: signer.firstName, lastName: signer.lastName, email: signer.email }}
          attestationText={content.acknowledgmentText}
          stepId={step.id}
          submit={submit}
          persistDraft={persistCheckboxDraft}
          actions={actions}
        />
      ) : (
        <AcknowledgmentForm
          mode={kind === "acknowledgment" ? "acknowledgment" : "training"}
          acknowledgmentText={content.acknowledgmentText}
          documentUrl={content.documentUrl}
          initialAgreed={hasCandidatePostHireEvidence(kind, progressRow?.data)}
          initialSignatureName={
            submission?.fields.find((f) => f.label === "Signature")?.value || fullName
          }
          submit={submit}
          persistDraft={persistCheckboxDraft}
          actions={actions}
        />
      )}
    </>
  );
}

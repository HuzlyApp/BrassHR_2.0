"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import OnboardingLayout from "@/app/components/OnboardingLayout";
import OnboardingStepper from "@/app/components/OnboardingStepper";
import OnboardingCheckbox from "@/app/components/OnboardingCheckbox";
import ApplicantWorkflowStepRedirect from "@/app/components/onboarding/ApplicantWorkflowStepRedirect";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import { brandingToCssVars } from "@/lib/tenant/tenant-branding";
import { useOnboardingStepNav } from "@/lib/onboarding/use-onboarding-step-nav";
import { useOnboardingConfigOptional } from "@/app/components/onboarding/OnboardingConfigProvider";
import {
  persistStepProgress,
  useMarkStepInProgressIfPending,
} from "@/lib/onboarding/use-mark-step-in-progress-if-pending";
import {
  getWorkflowSettings,
  integrationProviderLabel,
  isApplicantWaitingGateStep,
  isIntegrationPartnerStep,
  showsApplicantPartnerScreeningNotice,
} from "@/lib/onboarding/workflow-settings";
import { dedicatedRouteForWorkflowStep } from "@/lib/onboarding/resolve-applicant-step-route";
import { APPLICATION_ROUTES } from "@/lib/onboarding/application-routes";
import { resolveCustomStepContinue } from "@/lib/onboarding/custom-step-continue";
import { isOfferAcceptanceStepType } from "@/lib/onboarding/offer-acceptance";
import { isEnrollmentDecisionStep } from "@/lib/onboarding/enrollment-decision-step";
import {
  candidateCheckboxMessage,
  I9_SECTION_1_CHECKBOX_LABEL,
  isCandidateCheckboxStep,
  isDirectDepositCheckboxStep,
  isPayrollSetupCheckboxStep,
} from "@/lib/onboarding/candidate-checkbox-steps";
import {
  POST_HIRE_SCREEN_SUBTITLE,
  candidatePostHireScreenKind,
} from "@/lib/onboarding/post-hire-step-screens";
import { hireStageLabelForStep } from "@/lib/onboarding/hire-stage-groups";
import { workflowStepIdFromMetadata } from "@/lib/onboarding/firma-step-settings";
import EnrollmentDecisionStep from "./EnrollmentDecisionStep";
import OfferAcceptanceStep from "./OfferAcceptanceStep";
import PostHireStepScreen from "./post-hire/PostHireStepScreen";
import {
  APPLICANT_ACTION_ROW,
  APPLICANT_BTN_BACK,
  APPLICANT_BTN_PRIMARY,
  APPLICANT_CONTENT_CLASS,
  APPLICANT_HEADER_ROW,
  APPLICANT_SHELL_CLASS,
  APPLICANT_TITLE_CLASS,
} from "@/app/application/applicant-onboarding-responsive";

export default function CustomOnboardingStepPage() {
  const branding = useTenantBranding();
  const contentStyle = brandingToCssVars(branding) as CSSProperties;
  const params = useParams();
  const stepKey = decodeURIComponent(String(params?.stepKey ?? "")).trim();
  const nav = useOnboardingStepNav();
  const completingRef = useRef(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);

  const step = useMemo(() => {
    return nav.enabledSteps?.find((s) => s.step_key === stepKey) ?? nav.currentStep ?? null;
  }, [nav.enabledSteps, nav.currentStep, stepKey]);

  const settings = step ? getWorkflowSettings(step) : null;
  const partnerLabel = step ? integrationProviderLabel(step) : null;
  const usesPartner = step ? isIntegrationPartnerStep(step) : false;
  const waitingGate = step ? isApplicantWaitingGateStep(step) : false;
  const showScreeningNotice = step ? showsApplicantPartnerScreeningNotice(step) : false;
  const isOfferStep =
    typeof step?.metadata?.workflow_step_id === "string" &&
    isOfferAcceptanceStepType(step.metadata.workflow_step_id);
  const isEnrollmentStep = isEnrollmentDecisionStep(step);
  const postHireKind = candidatePostHireScreenKind(step);
  const rawWorkflowSettings = step?.metadata?.workflow_settings as Record<string, unknown> | null | undefined;
  const stageLabel =
    step && postHireKind
      ? hireStageLabelForStep({
          stageName: rawWorkflowSettings?.stageName,
          libraryId: workflowStepIdFromMetadata(step.metadata),
          stepKey: step.step_key,
          lifecycle: "post_hire",
        })
      : null;

  const isGenericCustom =
    step?.step_type === "custom_question" &&
    !usesPartner &&
    (typeof step.metadata?.workflow_step_id !== "string" ||
      step.metadata.workflow_step_id === "custom-step" ||
      step.metadata.workflow_step_id === "custom-form");

  const onboarding = useOnboardingConfigOptional();

  function isI9Section1Step(targetStep: typeof step): boolean {
    if (!targetStep) return false;
    const id = typeof targetStep.metadata?.workflow_step_id === "string" ? targetStep.metadata.workflow_step_id.toLowerCase() : "";
    const key = (targetStep.step_key || "").toLowerCase();
    const title = (targetStep.title || "").toLowerCase();
    return (
      key === "i9-right-to-work-verification" ||
      key === "i9-section-1" ||
      id === "i9-right-to-work-verification" ||
      id === "i9-section-1" ||
      key.includes("i9") ||
      key.includes("i-9") ||
      title.includes("i-9") ||
      title.includes("i 9")
    );
  }

  const dynamicCheckboxLabel = useMemo(() => {
    if (!step) return "";
    const id = typeof step.metadata?.workflow_step_id === "string" ? step.metadata.workflow_step_id.toLowerCase() : "";
    const key = (step.step_key || "").toLowerCase();
    const title = (step.title || "").trim();
    const lowerTitle = title.toLowerCase();

    if (isI9Section1Step(step)) {
      return I9_SECTION_1_CHECKBOX_LABEL;
    }
    if (key.includes("benefit") || id.includes("benefit") || lowerTitle.includes("benefit")) {
      return "I confirm that I have completed Benefits Enrollment / Selection.";
    }
    if (key.includes("401k") || id.includes("401k") || lowerTitle.includes("401k") || key.includes("retirement") || lowerTitle.includes("retirement")) {
      return "I confirm that I have completed 401K / Retirement Enrollment.";
    }
    if (isCandidateCheckboxStep(step)) {
      return candidateCheckboxMessage(step);
    }
    if (id === "compliance-training" || key.includes("compliance")) {
      return "I have completed the compliance training and understand my obligations.";
    }
    if (id === "training-modules-quiz" || key.includes("training-modules") || key.includes("training_modules")) {
      return "I have completed the training modules and quiz.";
    }
    if (id === "orientation-video" || key.includes("orientation")) {
      return "I have watched the orientation video in full.";
    }
    if (id === "safety-training" || key.includes("safety")) {
      return "I have completed the safety training and understand the safety procedures covered.";
    }
    const rawSettings = step.metadata?.workflow_settings as Record<string, unknown> | undefined;
    if (typeof rawSettings?.acknowledgmentText === "string" && rawSettings.acknowledgmentText.trim()) {
      return rawSettings.acknowledgmentText.trim();
    }
    return `I confirm that I have completed ${title || "this step"}.`;
  }, [step]);

  const isCheckboxStep = useMemo(() => {
    if (!step) return false;
    const id = typeof step.metadata?.workflow_step_id === "string" ? step.metadata.workflow_step_id.toLowerCase() : "";
    const key = (step.step_key || "").toLowerCase();
    const title = (step.title || "").toLowerCase();
    return (
      isI9Section1Step(step) ||
      key.includes("benefit") ||
      id.includes("benefit") ||
      title.includes("benefit") ||
      key.includes("401k") ||
      id.includes("401k") ||
      title.includes("401k") ||
      key.includes("retirement") ||
      id.includes("retirement") ||
      title.includes("retirement") ||
      key.includes("direct-deposit") ||
      id.includes("direct-deposit") ||
      title.includes("direct deposit") ||
      id === "compliance-training" ||
      id === "training-modules-quiz" ||
      id === "orientation-video" ||
      id === "safety-training" ||
      key.includes("compliance") ||
      key.includes("training") ||
      key.includes("orientation") ||
      key.includes("quiz") ||
      title.includes("compliance") ||
      title.includes("training") ||
      title.includes("orientation") ||
      title.includes("quiz") ||
      isCandidateCheckboxStep(step) ||
      isGenericCustom ||
      showCustomForm
    );
  }, [step, isGenericCustom, showCustomForm]);

  // Candidate workflow steps with no separate screen still belong in Your Application.
  const confirmsWorkflowStep = !waitingGate && !isGenericCustom && !showCustomForm && !isCheckboxStep;

  const progressRow = useMemo(() => {
    if (!step) return null;
    const rows = onboarding?.progress?.steps ?? [];
    return (
      rows.find((r) => r.onboarding_step_id === step.id) ??
      rows.find((r) => r.step_key === step.step_key) ??
      null
    );
  }, [step, onboarding?.progress?.steps]);

  useEffect(() => {
    if (!progressRow || answer) return;
    const data = (progressRow.data && typeof progressRow.data === "object" ? progressRow.data : {}) as Record<string, unknown>;
    const isCompleted = progressRow.status === "completed";
    const hasCheckboxConfirmed =
      data.checkbox_confirmed === true ||
      data.benefits_enrollment_confirmed === true ||
      data.retirement_enrollment_confirmed === true ||
      data.k401_enrollment_confirmed === true ||
      data.i9_section_1_confirmed === true ||
      data.direct_deposit_confirmed === true ||
      data.payroll_setup_confirmed === true ||
      data.authorized === true ||
      data.enrollment_decision === "agreed";

    if ((isCheckboxStep || confirmsWorkflowStep) && (hasCheckboxConfirmed || isCompleted)) {
      setAnswer(dynamicCheckboxLabel);
    } else if (typeof data.response === "string" && data.response.trim()) {
      setAnswer(data.response.trim());
    }
  }, [progressRow, isCheckboxStep, confirmsWorkflowStep, dynamicCheckboxLabel, answer]);

  const shouldRedirectToDedicatedScreen = useMemo(() => {
    if (
      !step ||
      showCustomForm ||
      isEnrollmentDecisionStep(step) ||
      candidatePostHireScreenKind(step) ||
      isCandidateCheckboxStep(step) ||
      isI9Section1Step(step)
    ) {
      return false;
    }
    if (step.step_type !== "custom_question") return true;
    const dedicated = dedicatedRouteForWorkflowStep(step);
    const customPath = APPLICATION_ROUTES.customStep(step.step_key).split("?")[0];
    return Boolean(dedicated && dedicated !== customPath);
  }, [step, showCustomForm]);

  useMarkStepInProgressIfPending({
    step,
    disabled: nav.configLoading || !step || Boolean(postHireKind),
    updateStepStatus: nav.updateStepStatus,
    completingRef,
  });

  async function handleComplete() {
    if (!step) return;
    setError("");
    if (waitingGate) {
      nav.goNext();
      return;
    }
    const formVisible = isGenericCustom || showCustomForm || isCheckboxStep || confirmsWorkflowStep;
    const decision = resolveCustomStepContinue({
      formVisible,
      required: settings?.required === true,
      answer,
    });
    if (decision.action === "require-answer") {
      setError(
        isCheckboxStep || confirmsWorkflowStep
          ? "Please check the confirmation box to continue."
          : "This step is required. Enter a response before continuing."
      );
      return;
    }
    setSaving(true);
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
      const isI9 = isI9Section1Step(step);
      const isDirectDeposit = isDirectDepositCheckboxStep(step);
      const isPayrollSetup = isPayrollSetupCheckboxStep(step) && !isDirectDeposit;

      const saved = await persistStepProgress(
        nav.updateStepStatus,
        step.step_key,
        "completed",
        completingRef,
        {
          response: decision.response,
          step_type: step.step_type,
          ...(isCheckboxStep || confirmsWorkflowStep
            ? {
                checkbox_confirmed: true,
                checkbox_label: dynamicCheckboxLabel,
                confirmed_at: new Date().toISOString(),
              }
            : {}),
          ...(isBenefits
            ? {
                benefits_enrollment_confirmed: true,
                benefits_enrollment_decision: "agreed",
                enrollment_decision: "agreed",
                post_hire_submission: {
                  kind: "acknowledgment",
                  fields: [
                    { label: step.title || "Benefits Enrollment", value: "Confirmed" },
                    { label: "Confirmation", value: dynamicCheckboxLabel },
                  ],
                  submitted_at: new Date().toISOString(),
                },
              }
            : {}),
          ...(is401k
            ? {
                retirement_enrollment_confirmed: true,
                k401_enrollment_confirmed: true,
                retirement_enrollment_decision: "agreed",
                enrollment_decision: "agreed",
                post_hire_submission: {
                  kind: "acknowledgment",
                  fields: [
                    { label: step.title || "401K / Retirement Enrollment", value: "Confirmed" },
                    { label: "Confirmation", value: dynamicCheckboxLabel },
                  ],
                  submitted_at: new Date().toISOString(),
                },
              }
            : {}),
          ...(isI9
            ? {
                i9_section_1_confirmed: true,
                form_i9_section_1_completed: true,
              }
            : {}),
          ...(isDirectDeposit
            ? {
                direct_deposit_confirmed: true,
                authorized: true,
                post_hire_submission: {
                  kind: "direct_deposit",
                  fields: [
                    { label: "Confirmation", value: dynamicCheckboxLabel },
                  ],
                  submitted_at: new Date().toISOString(),
                },
              }
            : {}),
          ...(isPayrollSetup
            ? {
                payroll_setup_confirmed: true,
                post_hire_submission: {
                  kind: "confirmation",
                  fields: [
                    { label: step.title || "HCM & Payroll Setup", value: "Confirmed" },
                    { label: "Confirmation", value: dynamicCheckboxLabel },
                  ],
                  submitted_at: new Date().toISOString(),
                },
              }
            : {}),
        },
        step.id
      );
      if (!saved) throw new Error("Could not save progress");
      nav.goNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save progress");
    } finally {
      setSaving(false);
    }
  }

  if (!nav.configLoading && !step) {
    return (
      <OnboardingLayout>
        <div className={`${APPLICANT_SHELL_CLASS} justify-center`} style={contentStyle}>
          <div className="mx-auto max-w-lg text-center text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Step not found</p>
            <p className="mt-2">
              The step &quot;{stepKey}&quot; is not part of this tenant&apos;s onboarding workflow.
            </p>
          </div>
        </div>
      </OnboardingLayout>
    );
  }

  if (step && shouldRedirectToDedicatedScreen) {
    return (
      <ApplicantWorkflowStepRedirect
        step={step}
        onStayOnCustomPage={() => setShowCustomForm(true)}
      />
    );
  }

  const pageTitle = step?.title?.trim() || "Onboarding step";

  return (
    <OnboardingLayout>
      <div className={APPLICANT_SHELL_CLASS} style={contentStyle}>
        <OnboardingStepper />

        <div className={APPLICANT_CONTENT_CLASS}>
          <div className={APPLICANT_HEADER_ROW}>
            <div className="min-w-0">
              {stageLabel ? (
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--brand-primary)]">
                  {stageLabel}
                </p>
              ) : null}
              <h2 className={APPLICANT_TITLE_CLASS}>{pageTitle}</h2>
            </div>
          </div>

          {step?.description ? (
            <p className="text-sm text-slate-600">{step.description}</p>
          ) : isOfferStep ? (
            <p className="text-sm text-slate-600">Review your offer details and choose to accept or decline.</p>
          ) : postHireKind ? (
            <p className="text-sm text-slate-600">{POST_HIRE_SCREEN_SUBTITLE[postHireKind]}</p>
          ) : null}

          {step && postHireKind ? (
            <PostHireStepScreen
              key={step.id}
              step={step}
              kind={postHireKind}
              tenantSlug={nav.slug || null}
              updateStepStatus={nav.updateStepStatus}
              onBack={() => nav.goPrev()}
              onContinue={(status) => nav.goNext(status)}
            />
          ) : step && isOfferStep ? (
            <OfferAcceptanceStep
              step={step}
              tenantSlug={nav.slug || null}
              updateStepStatus={nav.updateStepStatus}
              onBack={() => nav.goPrev()}
              onContinue={() => nav.goNext()}
            />
          ) : step && isEnrollmentStep ? (
            <EnrollmentDecisionStep
              step={step}
              required={settings?.required === true}
              updateStepStatus={nav.updateStepStatus}
              onBack={() => nav.goPrev()}
              onContinue={() => nav.goNext()}
            />
          ) : (
            <>
              {waitingGate ? (
                <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  Your recruiter or HR team completes this approval. Continue does not unlock the next
                  stage — you will get an email when they accept your placement.
                </p>
              ) : showScreeningNotice && partnerLabel ? (
                <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  Your background screening is handled by {partnerLabel}.
                  {settings?.timeline ? ` Typical turnaround: ${settings.timeline}.` : ""}
                </p>
              ) : settings && !usesPartner ? (
                <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {settings.clientPerforms
                    ? "Complete this step in the application."
                    : "Your recruiter or HR team will complete this step on your behalf."}
                  {settings.timeline ? ` Expected timeline: ${settings.timeline}.` : ""}
                  {!settings.required ? " This step is optional." : null}
                </p>
              ) : null}

              {isGenericCustom || showCustomForm || isCheckboxStep || confirmsWorkflowStep ? (
                isCheckboxStep || confirmsWorkflowStep ? (
                  <div className="mt-6">
                    <OnboardingCheckbox
                      alignFirstLine
                      checked={Boolean(answer && answer === dynamicCheckboxLabel)}
                      onChange={(checked) => {
                        setAnswer(checked ? dynamicCheckboxLabel : "");
                        if (!step) return;
                        void persistStepProgress(
                          nav.updateStepStatus,
                          step.step_key,
                          "in_progress",
                          completingRef,
                          {
                            checkbox_confirmed: checked,
                            checkbox_label: dynamicCheckboxLabel,
                            response: checked ? dynamicCheckboxLabel : "",
                            confirmed_at: checked ? new Date().toISOString() : null,
                            step_type: step.step_type,
                          },
                          step.id
                        ).catch(() => {
                          // Draft save failures should not block the candidate from continuing.
                        });
                      }}
                    >
                      <span className="text-sm leading-5 text-slate-700">
                        {dynamicCheckboxLabel}
                        {settings?.required ? <span className="text-red-600"> *</span> : null}
                      </span>
                    </OnboardingCheckbox>
                  </div>
                ) : (
                  <div className="mt-6 space-y-3">
                    <label className="block text-sm font-medium text-slate-800" htmlFor="custom-answer">
                      Your response {settings?.required ? <span className="text-red-600">*</span> : null}
                    </label>
                    <textarea
                      id="custom-answer"
                      rows={5}
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[color:var(--brand-primary)]"
                      placeholder="Enter information for this step"
                    />
                  </div>
                )
              ) : null}

              {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

              <div className={APPLICANT_ACTION_ROW}>
                <button
                  type="button"
                  onClick={() => nav.goPrev()}
                  className={APPLICANT_BTN_BACK}
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    void handleComplete();
                  }}
                  className={`${APPLICANT_BTN_PRIMARY} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {saving
                    ? "Saving…"
                    : waitingGate
                      ? "View application status"
                      : isGenericCustom || showCustomForm || isCheckboxStep || confirmsWorkflowStep
                        ? "Save & continue"
                        : "Continue"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </OnboardingLayout>
  );
}

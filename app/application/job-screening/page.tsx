"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import OnboardingLoader from "@/app/components/OnboardingLoader";
import OnboardingLayout from "@/app/components/OnboardingLayout";
import OnboardingStepper from "@/app/components/OnboardingStepper";
import AwaitingRecruiterReviewModal from "@/app/components/onboarding/AwaitingRecruiterReviewModal";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import { useOnboardingConfigOptional } from "@/app/components/onboarding/OnboardingConfigProvider";
import { APPLICATION_ROUTES } from "@/lib/onboarding/application-routes";
import { applicationPath } from "@/lib/tenant/with-tenant";
import { brandingToCssVars, hexToRgba } from "@/lib/tenant/tenant-branding";
import { currentOnboardingTenantSlug } from "@/lib/tenant/with-tenant";
import type { JobScreeningQuestionType } from "@/lib/jobs/screening-questions";
import {
  readStoredApplyLocation,
  storedApplyLocationSearchParams,
} from "@/lib/service-area/apply-location-client";
import {
  APPLICANT_ACTION_ROW,
  APPLICANT_BTN_BACK,
  APPLICANT_BTN_PRIMARY,
  APPLICANT_CONTENT_CLASS,
  APPLICANT_HEADER_ROW,
  APPLICANT_SHELL_CLASS,
  APPLICANT_SKIP_COLUMN,
  APPLICANT_TITLE_CLASS,
} from "@/app/application/applicant-onboarding-responsive";
import { ChevronDown, ChevronRight, FileQuestion } from "lucide-react";
import { nextStepRouteAfter } from "@/lib/onboarding/professional-license-step";
import { isApplicantWaitingGateStep } from "@/lib/onboarding/workflow-settings";
import { readStepKeyFromSearch } from "@/lib/onboarding/find-applicant-step";
import {
  useMarkStepInProgressIfPending,
  persistStepProgress,
} from "@/lib/onboarding/use-mark-step-in-progress-if-pending";

type ScreeningQuestion = {
  id: string;
  question: string;
  questionType: JobScreeningQuestionType;
  options: Array<{ label: string; value: string }> | null;
  isRequired: boolean;
  answer: unknown;
};

export default function JobScreeningPage() {
  const branding = useTenantBranding();
  const router = useRouter();
  const searchParams = useSearchParams();
  const onboarding = useOnboardingConfigOptional();
  const completingRef = useRef(false);
  
  const tenantSlug =
    searchParams.get("tenant")?.trim().toLowerCase() ||
    branding.slug?.trim().toLowerCase() ||
    currentOnboardingTenantSlug();
  const jobToken =
    searchParams.get("job_token")?.trim() ||
    (typeof window !== "undefined" ? localStorage.getItem("applicationJobToken")?.trim() : "") ||
    "";
  
  const stepKey = readStepKeyFromSearch(
    searchParams.toString() ? `?${searchParams.toString()}` : ""
  );

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<ScreeningQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [showWaitingModal, setShowWaitingModal] = useState(false);

  const currentStep = useMemo(() => {
    if (!onboarding?.config?.steps) return null;
    return onboarding.config.steps.find(
      (s) => s.step_key === stepKey || s.metadata?.workflow_step_id === "parameterized-job-application"
    ) ?? null;
  }, [onboarding?.config?.steps, stepKey]);

  const shellStyle = useMemo(
    () => ({
      ...brandingToCssVars(branding),
    }),
    [branding]
  );

  useMarkStepInProgressIfPending({
    step: currentStep,
    disabled: onboarding?.loading,
    updateStepStatus: onboarding?.updateStepStatus,
    completingRef,
  });

  useEffect(() => {
    const applicantId =
      typeof window !== "undefined" ? localStorage.getItem("applicantId")?.trim() : "";
    if (!applicantId || !jobToken || !tenantSlug) {
      setLoading(false);
      setError("Missing application context. Return to the job listing and apply again.");
      return;
    }

    void fetch(
      `/api/onboarding/job-screening-answers?applicantId=${encodeURIComponent(applicantId)}&jobToken=${encodeURIComponent(jobToken)}&tenantSlug=${encodeURIComponent(tenantSlug)}&${storedApplyLocationSearchParams(tenantSlug, jobToken).toString()}`,
      { cache: "no-store" }
    )
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load screening questions");
        }
        if (!payload.hasQuestions || !(payload.questions && payload.questions.length > 0)) {
          setQuestions([]);
          return;
        }
        const loaded = (payload.questions ?? []) as ScreeningQuestion[];
        setQuestions(loaded);
        setAnswers(
          Object.fromEntries(
            loaded.map((item) => [item.id, item.answer ?? defaultAnswer(item.questionType)])
          )
        );
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Failed to load screening questions");
      })
      .finally(() => setLoading(false));
  }, [currentStep, jobToken, onboarding, router, tenantSlug]);

  function defaultAnswer(questionType: JobScreeningQuestionType): unknown {
    if (questionType === "multiple_select") return [];
    if (questionType === "yes_no") return null;
    return "";
  }

  function clearFieldError(questionId: string) {
    setFieldErrors((current) => {
      if (!current[questionId]) return current;
      const updated = { ...current };
      delete updated[questionId];
      return updated;
    });
  }

  async function handleSkip() {
    setSubmitting(true);
    setError(null);
    try {
      const applicantId = localStorage.getItem("applicantId")?.trim();
      const stepKeyToComplete = currentStep?.step_key || "parameterized-job-application";

      // Explicitly persist completion in client onboarding state
      if (onboarding?.updateStepStatus) {
        await persistStepProgress(
          onboarding.updateStepStatus,
          stepKeyToComplete,
          "completed",
          completingRef,
          { system_completed: true, reason: "no_screening_questions" }
        );
      }

      // Persist step completion in backend DB
      if (applicantId && jobToken && tenantSlug) {
        await fetch("/api/onboarding/job-screening-answers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applicantId,
            tenantSlug,
            jobToken,
            workLocation: readStoredApplyLocation(tenantSlug, jobToken),
            answers: [],
          }),
        }).catch(() => {});
      }

      // Refresh the onboarding config and progress to get updated step status
      if (onboarding?.refresh) {
        await onboarding.refresh();
      }

      // Get next step and check if it's a waiting gate
      const nextRoute = nextStepRouteAfter(onboarding?.config, currentStep, tenantSlug);
      
      if (nextRoute) {
        const enabledSteps = onboarding?.config?.steps?.filter((s) => s.is_enabled) ?? [];
        const currentIndex = enabledSteps.findIndex(
          (s) => s.id === currentStep?.id || s.step_key === currentStep?.step_key
        );
        const nextStep = currentIndex >= 0 && currentIndex < enabledSteps.length - 1 
          ? enabledSteps[currentIndex + 1] 
          : null;

        if (nextStep && isApplicantWaitingGateStep(nextStep)) {
          // Show modal for recruiter-owned steps, do not navigate away
          setShowWaitingModal(true);
          return;
        } else {
          // Navigate immediately for candidate steps
          router.push(nextRoute);
        }
      } else {
        // Fallback to application status
        router.push(applicationPath(APPLICATION_ROUTES.applicationStatus, tenantSlug));
      }
    } catch (skipError) {
      setError(skipError instanceof Error ? skipError.message : "Failed to continue to next step");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const applicantId = localStorage.getItem("applicantId")?.trim();
    if (!applicantId || !jobToken || !tenantSlug) return;

    // Validate required questions
    const validationErrors: Record<string, string> = {};
    for (const item of questions) {
      if (!item.isRequired) continue;
      const value = answers[item.id];
      if (item.questionType === "yes_no") {
        if (value !== true && value !== false && value !== "yes" && value !== "no") {
          validationErrors[item.id] = "Please select Yes or No.";
        }
      } else if (item.questionType === "multiple_select") {
        if (!Array.isArray(value) || value.length === 0) {
          validationErrors[item.id] = "Please select at least one option.";
        }
      } else if (item.questionType === "single_select") {
        if (typeof value !== "string" || !value.trim()) {
          validationErrors[item.id] = "Please select an option.";
        }
      } else if (item.questionType === "number") {
        const num = Number(value);
        if (value === "" || value === null || value === undefined || isNaN(num)) {
          validationErrors[item.id] = "Please enter a valid number.";
        } else if (num > 99) {
          validationErrors[item.id] = "Maximum allowed value is 99.";
        } else if (num < 0) {
          validationErrors[item.id] = "Value cannot be negative.";
        }
      } else {
        if (typeof value !== "string" || !value.trim()) {
          validationErrors[item.id] = "This field is required.";
        }
      }
    }

    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setError("Please answer all required questions before continuing.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      // API handles step completion in DB
      const response = await fetch("/api/onboarding/job-screening-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicantId,
          tenantSlug,
          jobToken,
          workLocation: readStoredApplyLocation(tenantSlug, jobToken),
          answers: questions.map((item) => ({
            questionId: item.id,
            answer: answers[item.id],
          })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save screening answers");
      }

      // Explicitly persist completion in client onboarding state
      const stepKeyToComplete = currentStep?.step_key || "parameterized-job-application";
      if (onboarding?.updateStepStatus) {
        await persistStepProgress(
          onboarding.updateStepStatus,
          stepKeyToComplete,
          "completed",
          completingRef,
          { source: "job_screening_answers" }
        );
      }

      // Refresh the onboarding config and progress to get updated step status
      if (onboarding?.refresh) {
        await onboarding.refresh();
      }

      // Get next step and check if it's a waiting gate
      const nextRoute = nextStepRouteAfter(onboarding?.config, currentStep, tenantSlug);
      
      if (nextRoute) {
        // Find the next step to check if it's internal/recruiter-owned
        const enabledSteps = onboarding?.config?.steps?.filter((s) => s.is_enabled) ?? [];
        const currentIndex = enabledSteps.findIndex(
          (s) => s.id === currentStep?.id || s.step_key === currentStep?.step_key
        );
        const nextStep = currentIndex >= 0 && currentIndex < enabledSteps.length - 1 
          ? enabledSteps[currentIndex + 1] 
          : null;

        if (nextStep && isApplicantWaitingGateStep(nextStep)) {
          // Show modal for recruiter-owned steps, do not navigate away
          setShowWaitingModal(true);
          return;
        } else {
          // Navigate immediately for candidate steps
          router.push(nextRoute);
        }
      } else {
        // Fallback to application status
        router.push(applicationPath(APPLICATION_ROUTES.applicationStatus, tenantSlug));
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save screening answers");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <OnboardingLoader label="Loading screening questions…" />;
  }

  const inputClass = (hasError?: boolean) =>
    `w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors ${
      hasError
        ? "border-rose-400 bg-rose-50/20 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
        : "border-slate-300 focus:border-[color:var(--brand-primary)] focus:ring-1 focus:ring-[color:var(--brand-primary)]"
    } disabled:bg-slate-50`;

  const selectClass = (hasError?: boolean) =>
    `w-full appearance-none rounded-lg border bg-white px-3.5 py-2.5 pr-10 text-sm text-slate-900 outline-none transition-colors cursor-pointer ${
      hasError
        ? "border-rose-400 bg-rose-50/20 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
        : "border-slate-300 focus:border-[color:var(--brand-primary)] focus:ring-1 focus:ring-[color:var(--brand-primary)]"
    } disabled:bg-slate-50`;

  return (
    <>
      <OnboardingLayout>
        <div className={APPLICANT_SHELL_CLASS} style={shellStyle}>
          <OnboardingStepper />

          <div className={APPLICANT_CONTENT_CLASS}>
            <div className={APPLICANT_HEADER_ROW}>
              <h2 className={APPLICANT_TITLE_CLASS}>
                {currentStep?.title || "Screening Questions"}
              </h2>
              {questions.length === 0 ? (
                <div className={APPLICANT_SKIP_COLUMN}>
                  <button
                    type="button"
                    onClick={() => void handleSkip()}
                    disabled={submitting}
                    className="cursor-pointer text-[12px] font-medium leading-5 text-[color:var(--brand-primary)] hover:underline"
                  >
                    Skip for Now {"\u2192"}
                  </button>
                </div>
              ) : null}
            </div>

            {error ? (
              <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            ) : null}

            {questions.length === 0 ? (
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/70 p-6 text-center sm:p-8">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <FileQuestion className="h-6 w-6 text-slate-500" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">
                  No screening questions required
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                  No screening questions have been added for this job. You can skip this step and continue with your application.
                </p>
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => void handleSkip()}
                    disabled={submitting}
                    className="group inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md bg-[color:var(--brand-primary)] px-5 py-2.5 text-[12px] font-semibold leading-5 text-white shadow-sm transition hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? "Continuing…" : "Skip for Now"}
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  Answer these job-specific questions before continuing your application.
                </p>

                <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-5">
                  {questions.map((item, index) => {
                    const cleanQuestionText = item.question.replace(/\s*\*+\s*$/, "").trim();
                    const fieldError = fieldErrors[item.id];
                    const hasError = Boolean(fieldError);

                    return (
                      <fieldset key={item.id} className="space-y-2">
                        <legend className="text-sm font-medium text-slate-900">
                          <span className="font-semibold text-slate-800 mr-1.5">{index + 1}.</span>
                          {cleanQuestionText}
                          {item.isRequired ? <span className="text-rose-600"> *</span> : null}
                        </legend>

                        {item.questionType === "yes_no" ? (
                          <div className="flex gap-4 pt-1">
                            {["Yes", "No"].map((label) => {
                              const isChecked =
                                label === "Yes"
                                  ? answers[item.id] === true || answers[item.id] === "yes"
                                  : answers[item.id] === false || answers[item.id] === "no";

                              return (
                                <label
                                  key={label}
                                  className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer"
                                >
                                  <input
                                    type="radio"
                                    name={item.id}
                                    checked={isChecked}
                                    onChange={() => {
                                      clearFieldError(item.id);
                                      setAnswers((current) => ({
                                        ...current,
                                        [item.id]: label === "Yes",
                                      }));
                                    }}
                                    className="h-4 w-4 cursor-pointer"
                                    style={isChecked ? { accentColor: branding.primaryHex } : undefined}
                                  />
                                  {label}
                                </label>
                              );
                            })}
                          </div>
                        ) : null}

                        {item.questionType === "number" ? (
                          <input
                            type="number"
                            min={0}
                            max={99}
                            value={String(answers[item.id] ?? "")}
                            onChange={(event) => {
                              clearFieldError(item.id);
                              let val = event.target.value;
                              if (val.length > 2) {
                                val = val.slice(0, 2);
                              }
                              if (Number(val) > 99) {
                                val = "99";
                              }
                              setAnswers((current) => ({
                                ...current,
                                [item.id]: val,
                              }));
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "e" || event.key === "E" || event.key === "+" || event.key === "-") {
                                event.preventDefault();
                              }
                            }}
                            className={inputClass(hasError)}
                          />
                        ) : null}

                        {item.questionType === "short_text" || item.questionType === "long_text" ? (
                          <textarea
                            rows={item.questionType === "long_text" ? 4 : 2}
                            value={String(answers[item.id] ?? "")}
                            onChange={(event) => {
                              clearFieldError(item.id);
                              setAnswers((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }));
                            }}
                            className={inputClass(hasError)}
                          />
                        ) : null}

                        {item.questionType === "single_select" ? (
                          <div className="relative">
                            <select
                              value={String(answers[item.id] ?? "")}
                              onChange={(event) => {
                                clearFieldError(item.id);
                                setAnswers((current) => ({
                                  ...current,
                                  [item.id]: event.target.value,
                                }));
                              }}
                              className={selectClass(hasError)}
                            >
                              <option value="">Select an option</option>
                              {(item.options ?? []).map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          </div>
                        ) : null}

                        {item.questionType === "multiple_select" ? (
                          <div className="space-y-2 pt-1">
                            {(item.options ?? []).map((option) => {
                              const selected = Array.isArray(answers[item.id])
                                ? (answers[item.id] as string[])
                                : [];
                              return (
                                <label
                                  key={option.value}
                                  className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected.includes(option.value)}
                                    onChange={(event) => {
                                      clearFieldError(item.id);
                                      setAnswers((current) => {
                                        const currentValues = Array.isArray(current[item.id])
                                          ? [...(current[item.id] as string[])]
                                          : [];
                                        const nextValues = event.target.checked
                                          ? [...currentValues, option.value]
                                          : currentValues.filter((value) => value !== option.value);
                                        return { ...current, [item.id]: nextValues };
                                      });
                                    }}
                                    className="h-[18px] w-[18px] rounded-[6px] cursor-pointer accent-[color:var(--brand-secondary)]"
                                    style={
                                      selected.includes(option.value)
                                        ? { accentColor: branding.secondaryHex || "var(--brand-secondary)" }
                                        : undefined
                                    }
                                  />
                                  {option.label}
                                </label>
                              );
                            })}
                          </div>
                        ) : null}

                        {hasError ? (
                          <p className="mt-1 text-xs font-medium text-rose-600">{fieldError}</p>
                        ) : null}
                      </fieldset>
                    );
                  })}

                  <div className={APPLICANT_ACTION_ROW}>
                    <button
                      type="button"
                      onClick={() => void handleSkip()}
                      disabled={submitting}
                      className={APPLICANT_BTN_BACK}
                    >
                      Skip for now
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || questions.length === 0}
                      className={APPLICANT_BTN_PRIMARY}
                    >
                      {submitting ? "Saving…" : "Save & continue"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </OnboardingLayout>

      <AwaitingRecruiterReviewModal 
        open={showWaitingModal} 
        onClose={() => setShowWaitingModal(false)} 
      />
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  Sparkles,
  Award,
  Briefcase,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  ShieldCheck,
  Check,
} from "lucide-react";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import { applicationPath } from "@/lib/tenant/with-tenant";
import { useOnboardingTenant } from "@/lib/tenant/use-onboarding-tenant";
import { useOnboardingConfigOptional } from "@/app/components/onboarding/OnboardingConfigProvider";
import {
  evaluateWorkflowCompletion,
  type StepCompletionItem,
  type WorkflowCompletionResult,
} from "@/lib/onboarding/workflow-completion-check";
import {
  APPLICANT_SHELL_TALL_CLASS,
  APPLICANT_TITLE_CLASS,
} from "@/app/application/applicant-onboarding-responsive";
import { stepStatusLabel } from "@/app/application/components/completion/step-status-label";

function StepStatusRow({ item }: { item: StepCompletionItem }) {
  return (
    <div className="flex items-center justify-between text-xs text-slate-700">
      <span className="flex items-center gap-2">
        {item.isComplete ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <Circle className="h-3.5 w-3.5 text-slate-400" />
        )}
        <span>{item.title}</span>
      </span>
      <span className={`text-[11px] font-semibold ${item.isComplete ? "text-emerald-700" : "text-slate-500"}`}>
        {stepStatusLabel(item.status)}
      </span>
    </div>
  );
}

type Props = {
  completionResult?: WorkflowCompletionResult | null;
  embedded?: boolean;
};

export default function PostHireCompletionView({
  completionResult: propResult,
  embedded = false,
}: Props) {
  const router = useRouter();
  const branding = useTenantBranding();
  const { slug } = useOnboardingTenant();
  const onboarding = useOnboardingConfigOptional();

  const [showPreHireList, setShowPreHireList] = useState(false);
  const [showPostHireList, setShowPostHireList] = useState(false);

  // Dynamically evaluate all step completion
  const effectiveResult =
    propResult ??
    evaluateWorkflowCompletion({
      allSteps: onboarding?.allWorkflowSteps ?? onboarding?.config?.steps ?? [],
      progress: onboarding?.progress ?? null,
      tenantSlug: slug,
    });

  const preHireSteps = effectiveResult.preHire.steps;
  const postHireSteps = effectiveResult.postHire.steps;

  const totalStepsCompleted =
    effectiveResult.preHire.completedCount + effectiveResult.postHire.completedCount;
  const totalStepsCount =
    effectiveResult.preHire.total + effectiveResult.postHire.total;

  const handleDashboard = () => {
    router.push(
      applicationPath(
        slug ? `/application/applicant-dashboard?tenant=${encodeURIComponent(slug)}` : "/application/applicant-dashboard"
      )
    );
  };

  const containerClasses = embedded
    ? "flex flex-1 flex-col items-center justify-center py-4"
    : APPLICANT_SHELL_TALL_CLASS;

  return (
    <div className={containerClasses}>
      <div className="flex flex-1 flex-col items-center justify-center text-center max-w-[640px] mx-auto w-full px-2 sm:px-4">
        {/* Celebratory Hero Icon */}
        <div className="relative mb-6">
          <div className="absolute -inset-3 rounded-full bg-emerald-400 opacity-25 blur-lg animate-pulse" />
          <div className="relative flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl transition-transform hover:scale-105">
            <Award className="h-10 w-10 sm:h-12 sm:w-12" strokeWidth={2.2} />
          </div>
          <div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-white shadow-md">
            <Sparkles className="h-4 w-4" />
          </div>
        </div>

        {/* Phase Pill */}
        <div className="mb-3.5 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1 text-xs font-semibold text-emerald-800">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span>Onboarding 100% Completed</span>
        </div>

        {/* User's Exact Requested Messages */}
        <h1 className={`${APPLICANT_TITLE_CLASS} text-slate-900 sm:text-[34px] tracking-tight`}>
          Congratulations
        </h1>

        <p className="mt-2 text-lg font-semibold text-slate-800 sm:text-2xl">
          You completed all pre hire and Post hire steps
        </p>

        <p className="mt-1.5 text-base sm:text-lg font-medium text-emerald-700">
          You can now continue work
        </p>

        <p className="mt-2 max-w-[500px] text-xs sm:text-sm text-slate-600 leading-relaxed">
          All your applicant screening, employment agreements, background verifications, and post-hire compliance requirements have been finalized and verified.
        </p>

        {/* Dynamic Dual Completion Summary Cards */}
        <div className="mt-6 w-full space-y-3.5 text-left">
          {/* Pre-Hire Card */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
                  <Check className="h-5 w-5" strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-emerald-950">Pre-Hire Steps Completed</h3>
                  <p className="text-xs text-emerald-700">
                    {`${effectiveResult.preHire.completedCount} of ${effectiveResult.preHire.total} steps completed (${effectiveResult.preHire.percent}%)`}
                  </p>
                </div>
              </div>

              {preHireSteps.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowPreHireList(!showPreHireList)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:text-emerald-950"
                  aria-expanded={showPreHireList}
                >
                  <span>{showPreHireList ? "Hide steps" : "View steps"}</span>
                  {showPreHireList ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              ) : (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                  Completed
                </span>
              )}
            </div>

            {showPreHireList && preHireSteps.length > 0 ? (
              <div className="mt-3 pt-3 border-t border-emerald-200/80 space-y-1.5">
                {preHireSteps.map((item, idx) => (
                  <StepStatusRow key={item.id || idx} item={item} />
                ))}
              </div>
            ) : null}
          </div>

          {/* Post-Hire Card */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
                  <Check className="h-5 w-5" strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-emerald-950">Post-Hire Steps Completed</h3>
                  <p className="text-xs text-emerald-700">
                    {`${effectiveResult.postHire.completedCount} of ${effectiveResult.postHire.total} steps completed (${effectiveResult.postHire.percent}%)`}
                  </p>
                </div>
              </div>

              {postHireSteps.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowPostHireList(!showPostHireList)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:text-emerald-950"
                  aria-expanded={showPostHireList}
                >
                  <span>{showPostHireList ? "Hide steps" : "View steps"}</span>
                  {showPostHireList ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              ) : (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                  Completed
                </span>
              )}
            </div>

            {showPostHireList && postHireSteps.length > 0 ? (
              <div className="mt-3 pt-3 border-t border-emerald-200/80 space-y-1.5">
                {postHireSteps.map((item, idx) => (
                  <StepStatusRow key={item.id || idx} item={item} />
                ))}
              </div>
            ) : null}
          </div>

          {/* Work Readiness Highlight Box */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Briefcase className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">Next Step: Ready for Work</h4>
                <p className="mt-1 text-xs text-slate-600 leading-normal">
                  Your worker file is now fully certified and in good standing. Your recruiter and facility coordinators will provide your assignment details, schedule, and reporting instructions.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-7 flex w-full flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleDashboard}
            className="inline-flex h-12 w-full sm:w-auto min-w-[220px] items-center justify-center gap-2 rounded-xl px-6 text-sm sm:text-base font-semibold text-white shadow-md transition-all hover:brightness-95 hover:shadow-lg"
            style={{ backgroundColor: branding.primaryHex }}
          >
            <span>Go to Dashboard</span>
            <ArrowRight className="h-4 w-4" />
          </button>

          {/* <button
            type="button"
            onClick={() =>
              router.push(
                applicationPath(
                  slug ? `/application/application-status?tenant=${encodeURIComponent(slug)}` : "/application/application-status"
                )
              )
            }
            className="inline-flex h-12 w-full sm:w-auto items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            View Application Status
          </button> */}
        </div>
      </div>
    </div>
  );
}

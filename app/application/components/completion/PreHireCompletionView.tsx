"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ArrowRight,
  ClipboardCheck,
  FileCheck,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import { applicationPath } from "@/lib/tenant/with-tenant";
import { useOnboardingTenant } from "@/lib/tenant/use-onboarding-tenant";
import { useOnboardingConfigOptional } from "@/app/components/onboarding/OnboardingConfigProvider";
import {
  evaluateWorkflowCompletion,
  type WorkflowCompletionResult,
} from "@/lib/onboarding/workflow-completion-check";
import {
  APPLICANT_SHELL_TALL_CLASS,
  APPLICANT_TITLE_CLASS,
} from "@/app/application/applicant-onboarding-responsive";
import { CompletionDetailsToggle } from "@/app/application/components/completion/CompletionDetailsToggle";
import { CompletionStepStatusRow } from "@/app/application/components/completion/CompletionStepStatusRow";
import { useMarkPhaseCompletionStep } from "@/app/application/components/completion/useMarkPhaseCompletionStep";

type Props = {
  completionResult?: WorkflowCompletionResult | null;
  applicantId?: string;
  onContinuePostHire?: () => void;
  embedded?: boolean;
};

export default function PreHireCompletionView({
  completionResult: propResult,
  applicantId: propApplicantId,
  onContinuePostHire,
  embedded = false,
}: Props) {
  const router = useRouter();
  const branding = useTenantBranding();
  const { slug } = useOnboardingTenant();
  const onboarding = useOnboardingConfigOptional();
  useMarkPhaseCompletionStep("pre_hire");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStepList, setShowStepList] = useState(false);
  const [remoteReady, setRemoteReady] = useState<boolean | null>(
    typeof propResult?.postHireReady === "boolean" ? propResult.postHireReady : null
  );

  // Compute dynamic completion status
  const effectiveResult =
    propResult ??
    evaluateWorkflowCompletion({
      allSteps: onboarding?.allWorkflowSteps ?? onboarding?.config?.steps ?? [],
      progress: onboarding?.progress ?? null,
      tenantSlug: slug,
    });

  const applicantId =
    propApplicantId ||
    onboarding?.applicantId ||
    (typeof window !== "undefined" ? localStorage.getItem("applicantId")?.trim() : "") ||
    "";

  const preHireSteps = effectiveResult.preHire.steps;
  const postHireSteps = effectiveResult.postHire.steps;
  const hasPostHireSteps = effectiveResult.hasPostHireSteps;

  useEffect(() => {
    if (typeof propResult?.postHireReady === "boolean") {
      setRemoteReady(propResult.postHireReady);
      return;
    }
    if (!applicantId) return;
    let cancelled = false;
    const params = new URLSearchParams({ applicantId });
    if (slug) params.set("tenant", slug);
    if (onboarding?.applicationId) params.set("applicationId", onboarding.applicationId);
    const jobToken =
      typeof window !== "undefined" ? localStorage.getItem("applicationJobToken")?.trim() : "";
    if (jobToken) params.set("job_token", jobToken);
    void fetch(`/api/onboarding/completion-status?${params.toString()}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { postHireReady?: boolean } | null) => {
        if (!cancelled) setRemoteReady(data?.postHireReady === true);
      })
      .catch(() => {
        if (!cancelled) setRemoteReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applicantId, slug, onboarding?.applicationId, propResult?.postHireReady]);

  const postHireReady = remoteReady === true;

  const handleContinue = async () => {
    if (!postHireReady) return;
    if (onContinuePostHire) {
      onContinuePostHire();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Transition phase to post_hire on server
      if (applicantId) {
        const res = await fetch("/api/onboarding/completion-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applicantId,
            tenantSlug: slug,
            jobToken: localStorage.getItem("applicationJobToken")?.trim() || undefined,
            applicationId: onboarding?.applicationId,
            action: "continue_to_post_hire",
          }),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setError(
            data.error || "Post-Hire stays locked until every required Pre-Hire step is complete."
          );
          return;
        }
        const data = (await res.json()) as { nextRoute?: string };
        await onboarding?.refresh?.();
        if (data.nextRoute) {
          router.push(data.nextRoute);
          return;
        }
      }

      // If we have a computed first/next post-hire route, use it
      if (effectiveResult.nextIncompletePostHireRoute) {
        router.push(effectiveResult.nextIncompletePostHireRoute);
        return;
      }
      if (effectiveResult.firstPostHireRoute) {
        router.push(effectiveResult.firstPostHireRoute);
        return;
      }

      // Fallback: go to onboarding or custom-step post-hire
      router.push(
        applicationPath(
          slug ? `/application/applicant-dashboard?tenant=${encodeURIComponent(slug)}` : "/application/applicant-dashboard"
        )
      );
    } catch (err: unknown) {
      console.error("[PreHireCompletionView] handleContinue error", err);
      setError("Could not transition to post-hire steps. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const containerClasses = embedded
    ? "flex flex-1 flex-col items-center justify-center py-4"
    : APPLICANT_SHELL_TALL_CLASS;

  return (
    <div className={containerClasses}>
      <div className="flex flex-1 flex-col items-center justify-center text-center max-w-[620px] mx-auto w-full px-2 sm:px-4">
        {/* Animated Celebration Icon */}
        <div className="relative mb-6">
          <div
            className="absolute -inset-2 rounded-full opacity-25 blur-md animate-pulse"
            style={{ backgroundColor: branding.primaryHex }}
          />
          <div
            className="relative flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105"
            style={{ backgroundColor: branding.primaryHex }}
          >
            <CheckCircle2 className="h-10 w-10" strokeWidth={2.5} />
          </div>
        </div>

        {/* Phase Pill */}
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1 text-xs font-semibold text-emerald-800">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          <span>{postHireReady ? "Pre-Hire Phase Complete" : "Pre-Hire still in progress"}</span>
        </div>

        {/* User's Exact Requested Messages */}
        <h1 className={`${APPLICANT_TITLE_CLASS} text-slate-900 sm:text-[32px] tracking-tight`}>
          Congratulations
        </h1>

        <p className="mt-2 text-lg font-medium text-slate-800 sm:text-xl">
          {postHireReady
            ? "Your all Pre hire steps are completed"
            : "Required Pre-Hire steps are still in progress"}
        </p>

        <p className="mt-1 text-base text-slate-600">
          {postHireReady && hasPostHireSteps
            ? "You continue with Post hire steps"
            : hasPostHireSteps
              ? "Post-Hire opens after every required Pre-Hire step is complete."
              : "No further action is needed. Your recruiter will contact you with next steps."}
        </p>

        {error ? (
          <div className="mt-4 w-full rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {/* Dynamic Summary Cards */}
        <div className="mt-6 w-full space-y-3.5 text-left">
          {/* Pre-Hire Status Card */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 transition-all hover:bg-emerald-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
                  <FileCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-emerald-950">Pre-Hire Steps</h3>
                  <p className="text-xs text-emerald-700">
                    {`${effectiveResult.preHire.completedCount} of ${effectiveResult.preHire.total} steps completed (${effectiveResult.preHire.percent}%)`}
                  </p>
                </div>
              </div>

              {preHireSteps.length > 0 ? (
                <CompletionDetailsToggle
                  expanded={showStepList}
                  onToggle={() => setShowStepList(!showStepList)}
                />
              ) : null}
            </div>

            {/* Collapsible Step List */}
            {showStepList && preHireSteps.length > 0 ? (
              <div className="mt-3.5 pt-3 border-t border-emerald-200/80 space-y-2">
                {preHireSteps.map((item, idx) => (
                  <CompletionStepStatusRow key={item.id || idx} item={item} />
                ))}
              </div>
            ) : null}
          </div>

          {/* Post-Hire Preview Card */}
          {postHireReady && hasPostHireSteps ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-white shadow-sm"
                  style={{ backgroundColor: branding.primaryHex }}
                >
                  <ClipboardCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Post-Hire Steps</h3>
                  <p className="text-xs text-slate-500">
                    {`${effectiveResult.postHire.total} ${
                      effectiveResult.postHire.total === 1 ? "step" : "steps"
                    } ready to complete`}
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                Next Phase
              </span>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
              {postHireSteps.slice(0, 4).map((step, idx) => (
                <div key={step.id || idx} className="flex items-center gap-2 truncate">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  <span className="truncate">{step.title}</span>
                </div>
              ))}
            </div>
          </div>
          ) : null}
        </div>

        {/* Primary Action Button (Required by user) */}
        {postHireReady && hasPostHireSteps ? (
        <div className="mt-7 flex w-full flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void handleContinue()}
            disabled={loading}
            className="inline-flex h-12 w-full sm:w-auto min-w-[240px] items-center justify-center gap-2 rounded-xl px-6 text-sm sm:text-base font-semibold text-white shadow-md transition-all hover:brightness-95 hover:shadow-lg disabled:opacity-60"
            style={{ backgroundColor: branding.primaryHex }}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading Post-Hire...</span>
              </>
            ) : (
              <>
                <span>Continue with post hire</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
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
        ) : null}
      </div>
    </div>
  );
}

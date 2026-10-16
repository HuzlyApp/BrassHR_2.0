"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import OnboardingLoader from "@/app/components/OnboardingLoader";
import AwaitingRecruiterReviewModal from "@/app/components/onboarding/AwaitingRecruiterReviewModal";
import { useOnboardingConfigOptional } from "@/app/components/onboarding/OnboardingConfigProvider";
import { APPLICATION_ROUTES } from "@/lib/onboarding/application-routes";
import { useApplicantSession } from "@/lib/onboarding/applicant-session-context";
import { resolveApplicantOnboardingRoute } from "@/lib/onboarding/resolve-applicant-onboarding-route";
import { resolveApplicantEnabledSteps } from "@/lib/onboarding/tenant-step-navigation";
import { useAutoSkipNonNavigableApplicantSteps } from "@/lib/onboarding/use-auto-skip-non-navigable-steps";
import { resolveClientOnboardingTenantSlug } from "@/lib/tenant/client-onboarding-slug";
import { useOnboardingTenant } from "@/lib/tenant/use-onboarding-tenant";

function OnboardingRouteGuardInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const { replace } = useOnboardingTenant();
  const onboarding = useOnboardingConfigOptional();
  const { sessionReady, sessionLoading } = useApplicantSession();
  const lastRedirectRef = useRef<string | null>(null);
  const [awaitingReviewOpen, setAwaitingReviewOpen] = useState(false);
  const closeAwaitingReview = useCallback(() => setAwaitingReviewOpen(false), []);
  const waitingOnInternal = onboarding?.waitingOnInternal === true;

  const tenantSlug = useMemo(() => {
    const fromQuery = searchParams.get("tenant")?.trim().toLowerCase();
    if (fromQuery && fromQuery.length >= 2) return fromQuery;
    if (typeof window !== "undefined") {
      return resolveClientOnboardingTenantSlug(window.location.search);
    }
    return null;
  }, [searchParams]);

  const isDraftPreview =
    searchParams.get("preview") === "draft" ||
    searchParams.get("mode")?.trim().toLowerCase() === "test";
  const isApplicantDashboard =
    pathname.startsWith("/application/applicant-dashboard") ||
    pathname.startsWith("/application/home");

  const enabledSteps = useMemo(
    () => resolveApplicantEnabledSteps(onboarding?.config ?? null, onboarding?.loadingConfig ?? true),
    [onboarding?.config, onboarding?.loadingConfig]
  );

  useAutoSkipNonNavigableApplicantSteps(
    enabledSteps,
    onboarding?.progress ?? null,
    onboarding?.updateStepStatus
  );

  const decision = useMemo(() => {
    if (isApplicantDashboard || !onboarding) {
      return { status: "allow" as const };
    }

    const initialLoad =
      !onboarding.progressHydrated &&
      (onboarding.loadingProgress || onboarding.loadingConfig || sessionLoading || !sessionReady);

    return resolveApplicantOnboardingRoute({
      isLoadingSession: sessionLoading || !sessionReady,
      isLoadingTenant: !tenantSlug && !isDraftPreview,
      isLoadingConfig: onboarding.loadingConfig,
      isLoadingProgress: initialLoad,
      tenantSlug,
      config: onboarding.config,
      progress: onboarding.progress,
      pathname,
      search,
      isDraftPreview,
    });
  }, [
    isApplicantDashboard,
    onboarding,
    sessionLoading,
    sessionReady,
    tenantSlug,
    isDraftPreview,
    pathname,
    search,
  ]);

  useEffect(() => {
    if (decision.status !== "redirect") {
      lastRedirectRef.current = null;
      return;
    }
    if (lastRedirectRef.current === decision.href) return;
    lastRedirectRef.current = decision.href;
    // The application-status page explains the wait itself; only bounces back to a step need the modal.
    // Post-hire candidate steps continue without the pre-hire recruiter-review modal.
    const inPostHire =
      onboarding?.workflowPhase === "post_hire" || onboarding?.workflowPhase === "completed";
    if (
      waitingOnInternal &&
      !inPostHire &&
      !decision.href.startsWith(APPLICATION_ROUTES.applicationStatus)
    ) {
      setAwaitingReviewOpen(true);
    }
    replace(decision.href);
  }, [decision, replace, waitingOnInternal, onboarding?.workflowPhase]);

  const showLoading =
    decision.status === "loading" &&
    (!onboarding?.progressHydrated || onboarding.loadingConfig || sessionLoading || !sessionReady);

  if (showLoading) {
    return (
      <OnboardingLoader
        label={
          onboarding?.workflowPhase === "post_hire"
            ? "Loading your onboarding…"
            : "Loading the Application Steps...."
        }
      />
    );
  }

  return (
    <>
      {children}
      <AwaitingRecruiterReviewModal open={awaitingReviewOpen} onClose={closeAwaitingReview} />
    </>
  );
}

/** Waits for session, tenant, config, and progress before redirecting applicants. */
export default function ApplicantOnboardingRouteGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OnboardingRouteGuardInner>{children}</OnboardingRouteGuardInner>;
}

"use client";

import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useOnboardingConfigOptional } from "@/app/components/onboarding/OnboardingConfigProvider";
import {
  adjacentStepRoute,
  computeMaxAllowedStepIndex,
  findStepForPathname,
  firstOnboardingStepRoute,
  resolveApplicantEnabledSteps,
  resolvePostStepContinueRoute,
  stepIndexFromPathname,
} from "@/lib/onboarding/tenant-step-navigation";
import { useOnboardingTenant } from "@/lib/tenant/use-onboarding-tenant";
import { APPLICATION_ROUTES } from "@/lib/onboarding/application-routes";
import { readStepLifecyclePhase } from "@/lib/onboarding/workflow-phase";
import { withTenant } from "@/lib/tenant/with-tenant";

/** Tenant-ordered onboarding navigation for applicant pages. */
export function useOnboardingStepNav() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const { slug, push, replace, path } = useOnboardingTenant();
  const onboarding = useOnboardingConfigOptional();

  const enabledSteps = useMemo(
    () => resolveApplicantEnabledSteps(onboarding?.config, onboarding?.loading ?? true),
    [onboarding?.config, onboarding?.loading]
  );

  const currentIndex = useMemo(() => {
    if (!enabledSteps?.length) return 1;
    return stepIndexFromPathname(pathname, enabledSteps, search);
  }, [pathname, enabledSteps, search]);

  const currentStep = useMemo(() => {
    if (!enabledSteps?.length) return null;
    return findStepForPathname(pathname, enabledSteps, search);
  }, [pathname, enabledSteps, search]);

  const maxAllowedStepIndex = useMemo(
    () =>
      computeMaxAllowedStepIndex(onboarding?.config ?? null, onboarding?.progress ?? null, pathname),
    [onboarding?.config, onboarding?.progress, pathname]
  );

  const completedThrough = Math.max(0, maxAllowedStepIndex - 1);

  const nextRoute = useMemo(
    () => adjacentStepRoute(onboarding?.config, currentStep, 1, slug),
    [onboarding?.config, currentStep, slug]
  );

  const prevRoute = useMemo(
    () => adjacentStepRoute(onboarding?.config, currentStep, -1, slug),
    [onboarding?.config, currentStep, slug]
  );

  const firstRoute = useMemo(
    () => firstOnboardingStepRoute(onboarding?.config, slug),
    [onboarding?.config, slug]
  );

  return {
    slug,
    path,
    push,
    replace,
    enabledSteps,
    currentIndex,
    currentStep,
    maxAllowedStepIndex,
    completedThrough,
    nextRoute,
    prevRoute,
    firstRoute,
    goNext: (savedStatus: "completed" | "skipped" = "completed") => {
      const completion =
        currentStep && readStepLifecyclePhase(currentStep) === "post_hire"
          ? "post_hire"
          : "pre_hire";
      const inPostHire = onboarding?.workflowPhase === "post_hire" || onboarding?.workflowPhase === "completed";
      if (savedStatus !== "skipped" && onboarding?.waitingOnInternal && !inPostHire) {
        const query = new URLSearchParams({ completion });
        if (slug) query.set("tenant", slug);
        push(`${APPLICATION_ROUTES.applicationStatus}?${query.toString()}`);
        return;
      }
      const href = resolvePostStepContinueRoute(onboarding?.config, currentStep, slug, {
        progress: onboarding?.progress,
        savedStepId: currentStep?.id,
        savedStatus,
      });
      if (href) push(href);
    },
    goPrev: () => {
      if (prevRoute) push(prevRoute);
    },
    configLoading: onboarding?.loading ?? true,
    config: onboarding?.config ?? null,
    updateStepStatus: onboarding?.updateStepStatus,
  };
}

import { APPLICATION_ROUTES } from "@/lib/onboarding/application-routes";
import {
  buildProgressStatusMaps,
  resolveNextIncompleteStepIndex,
} from "@/lib/onboarding/compute-max-allowed-from-progress";
import { resolveApplicantStepFromPath, stepIndexForApplicantStep } from "@/lib/onboarding/find-applicant-step";
import { mergeOnboardingQuery } from "@/lib/onboarding/legacy-add-references-redirect";
import { routeForApplicantStep } from "@/lib/onboarding/resolve-applicant-step-route";
import {
  computeMaxAllowedStepIndex,
  getEnabledTenantSteps,
  getLegacyFallbackSteps,
  resolveApplicantEnabledSteps,
} from "@/lib/onboarding/tenant-step-navigation";
import { readStepLifecyclePhase } from "@/lib/onboarding/workflow-phase";
import type {
  TenantOnboardingConfig,
  TenantOnboardingStep,
  WorkerOnboardingProgressPayload,
} from "@/lib/onboarding/types";

export type OnboardingRouteDecision =
  | { status: "loading" }
  | { status: "allow" }
  | { status: "redirect"; href: string };

export type ResolveApplicantOnboardingRouteInput = {
  isLoadingSession: boolean;
  isLoadingTenant: boolean;
  isLoadingConfig: boolean;
  isLoadingProgress: boolean;
  isLoadingResume?: boolean;
  tenantSlug: string | null;
  config: TenantOnboardingConfig | null;
  progress: WorkerOnboardingProgressPayload | null;
  pathname: string;
  search: string;
  isDraftPreview?: boolean;
};

const EXEMPT_PATH_PREFIXES = [
  "/application/applicant-dashboard",
  "/application/continue",
  "/application/onboarding",
] as const;

const POST_SUBMIT_ALLOWED_PREFIXES = [
  "/application/success",
  "/application/application-status",
  "/application/pre-hire-completion",
  "/application/post-hire-completion",
] as const;

function isPostSubmitAllowedPath(pathname: string): boolean {
  return POST_SUBMIT_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isExemptApplicantPath(pathname: string): boolean {
  return EXEMPT_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function resolveEnabledSteps(
  config: TenantOnboardingConfig | null,
  loadingConfig: boolean
): TenantOnboardingStep[] | null {
  return resolveApplicantEnabledSteps(config, loadingConfig);
}

function routeForStepIndex(
  enabledSteps: TenantOnboardingStep[],
  stepIndex: number,
  tenantSlug: string | null,
  search: string
): string {
  const step = enabledSteps[Math.max(0, stepIndex - 1)];
  if (!step) {
    const fallback = enabledSteps[0];
    if (!fallback) {
      return mergeOnboardingQuery(
        tenantSlug ? `${APPLICATION_ROUTES.addResume}?tenant=${encodeURIComponent(tenantSlug)}` : APPLICATION_ROUTES.addResume,
        search
      );
    }
    return mergeOnboardingQuery(routeForApplicantStep(fallback, tenantSlug), search);
  }
  return mergeOnboardingQuery(routeForApplicantStep(step, tenantSlug), search);
}

function allApplicantStepsFinished(
  enabledSteps: TenantOnboardingStep[],
  progress: WorkerOnboardingProgressPayload | null
): boolean {
  if (!enabledSteps.length || !progress?.steps?.length) return false;
  const statusById = buildProgressStatusMaps(enabledSteps, progress);
  return enabledSteps.every((step) => {
    const status = statusById.get(step.id);
    return status === "completed" || status === "skipped";
  });
}

function completionRedirect(
  completion: "pre_hire" | "post_hire",
  tenantSlug: string,
  search: string
): OnboardingRouteDecision {
  const query = new URLSearchParams({ completion, tenant: tenantSlug });
  return {
    status: "redirect",
    href: mergeOnboardingQuery(`${APPLICATION_ROUTES.applicationStatus}?${query}`, search),
  };
}

function pathsEqual(a: string, b: string): boolean {
  const pathA = a.split("?")[0] ?? a;
  const pathB = b.split("?")[0] ?? b;
  return pathA === pathB;
}

/**
 * Central applicant onboarding route resolver.
 * Returns `loading` while required state is unresolved; never treats missing data during load as no progress.
 */
export function resolveApplicantOnboardingRoute(
  input: ResolveApplicantOnboardingRouteInput
): OnboardingRouteDecision {
  const {
    isLoadingSession,
    isLoadingTenant,
    isLoadingConfig,
    isLoadingProgress,
    isLoadingResume = false,
    tenantSlug,
    config,
    progress,
    pathname,
    search,
    isDraftPreview = false,
  } = input;

  if (isDraftPreview) {
    return { status: "allow" };
  }

  const normalizedPath = pathname || "";

  if (!normalizedPath.startsWith("/application") || isExemptApplicantPath(normalizedPath)) {
    return { status: "allow" };
  }

  if (isLoadingSession || isLoadingTenant || isLoadingConfig || isLoadingProgress || isLoadingResume) {
    return { status: "loading" };
  }

  if (!tenantSlug?.trim()) {
    return { status: "loading" };
  }

  const enabledSteps = resolveEnabledSteps(config, false);
  if (enabledSteps === null) {
    return { status: "loading" };
  }

  if (!enabledSteps.length) {
    // Workflows with no post-hire steps leave nothing to show once the last pre-hire step
    // moves the applicant into post-hire.
    const phaseMovedOn =
      progress?.workflowPhase === "post_hire" || progress?.workflowPhase === "completed";
    if (phaseMovedOn && !isPostSubmitAllowedPath(normalizedPath)) {
      return completionRedirect("pre_hire", tenantSlug, search);
    }
    return { status: "allow" };
  }

  const currentStep = resolveApplicantStepFromPath(normalizedPath, search, enabledSteps);
  const isPostHireStep = Boolean(currentStep && readStepLifecyclePhase(currentStep) === "post_hire");
  const isPostHirePhase =
    progress?.workflowPhase === "post_hire" ||
    (enabledSteps.length > 0 && enabledSteps.every((s) => readStepLifecyclePhase(s) === "post_hire"));

  if (progress?.submittedAt && !isPostHireStep && !isPostHirePhase) {
    if (isPostSubmitAllowedPath(normalizedPath) || isExemptApplicantPath(normalizedPath)) {
      return { status: "allow" };
    }
    const href = mergeOnboardingQuery(
      tenantSlug
        ? `${APPLICATION_ROUTES.applicationStatus}?tenant=${encodeURIComponent(tenantSlug)}`
        : APPLICATION_ROUTES.applicationStatus,
      search
    );
    if (pathsEqual(href, normalizedPath)) {
      return { status: "allow" };
    }
    return { status: "redirect", href };
  }
  const maxAllowed = computeMaxAllowedStepIndex(config, progress, normalizedPath);
  if (maxAllowed < 1) {
    const href = mergeOnboardingQuery(
      tenantSlug
        ? `${APPLICATION_ROUTES.applicationStatus}?tenant=${encodeURIComponent(tenantSlug)}`
        : APPLICATION_ROUTES.applicationStatus,
      search
    );
    if (pathsEqual(href, normalizedPath) || isPostSubmitAllowedPath(normalizedPath)) {
      return { status: "allow" };
    }
    return { status: "redirect", href };
  }

  // Workflows without a Review & Submit step never set submittedAt, so finishing every
  // candidate step must still open the completion screen instead of looping on the last step.
  if (!currentStep && allApplicantStepsFinished(enabledSteps, progress)) {
    if (isPostSubmitAllowedPath(normalizedPath)) {
      return { status: "allow" };
    }
    const lastStep = enabledSteps[enabledSteps.length - 1]!;
    return completionRedirect(
      readStepLifecyclePhase(lastStep) === "post_hire" ? "post_hire" : "pre_hire",
      tenantSlug,
      search
    );
  }

  if (!currentStep) {
    const nextIndex = Math.min(
      resolveNextIncompleteStepIndex(enabledSteps, progress),
      maxAllowed
    );
    const href = routeForStepIndex(enabledSteps, nextIndex, tenantSlug, search);
    if (pathsEqual(href, normalizedPath)) {
      return { status: "allow" };
    }
    return { status: "redirect", href };
  }

  const currentIndex = stepIndexForApplicantStep(currentStep, enabledSteps);

  if (currentIndex <= maxAllowed) {
    return { status: "allow" };
  }

  const redirectIndex = Math.min(
    resolveNextIncompleteStepIndex(enabledSteps, progress),
    maxAllowed
  );
  const href = routeForStepIndex(enabledSteps, redirectIndex, tenantSlug, search);
  if (pathsEqual(href, normalizedPath)) {
    return { status: "allow" };
  }

  return { status: "redirect", href };
}

/** Resolve enabled steps for tests and server helpers without loading flag. */
export function resolveApplicantOnboardingSteps(
  config: TenantOnboardingConfig | null | undefined
): TenantOnboardingStep[] {
  const fromTenant = getEnabledTenantSteps(config);
  if (fromTenant.length > 0) return fromTenant;
  if (config) return [];
  return getLegacyFallbackSteps();
}

import { createDefaultOnboardingStepDrafts } from "@/lib/onboarding/default-onboarding-steps";
import {
  applicantStepHasNavigableScreen,
  findNavigableStepIndex,
} from "@/lib/onboarding/applicant-step-navigability";
import { routeForApplicantStep } from "@/lib/onboarding/resolve-applicant-step-route";
import { stepIndexFromPathname } from "@/lib/onboarding/step-index-from-pathname";
import {
  resolveApplicantStepFromPath,
} from "@/lib/onboarding/find-applicant-step";
import type {
  OnboardingStepType,
  TenantOnboardingConfig,
  TenantOnboardingStep,
  WorkerOnboardingProgressPayload,
} from "@/lib/onboarding/types";
import { APPLICATION_ROUTES } from "@/lib/onboarding/application-routes";
import { filterApplicantVisibleSteps } from "@/lib/onboarding/filter-applicant-steps";
import { withTenant } from "@/lib/tenant/with-tenant";
import { readStepLifecyclePhase } from "@/lib/onboarding/workflow-phase";
import { isWorkerPerformableStep } from "@/lib/onboarding/workflow-settings";
import { isTenantStepBlocking } from "@/lib/onboarding/reference-verification";
import {
  buildProgressStatusMaps,
  computeMaxAllowedStepIndexFromProgress,
} from "@/lib/onboarding/compute-max-allowed-from-progress";
import { computeCandidateOnboardingFrontier } from "@/lib/onboarding/candidate-onboarding-projection";
import { resolveApplicantNavBoundaries } from "@/lib/onboarding/farthest-reached-step";

/** Enabled steps for applicants, ordered by tenant `sort_order`. */
export function getEnabledTenantSteps(
  config: TenantOnboardingConfig | null | undefined
): TenantOnboardingStep[] {
  if (!config?.steps?.length) return [];
  return filterApplicantVisibleSteps(config.steps).slice().sort((a, b) => a.sort_order - b.sort_order);
}

/** Platform default 1–6 flow when tenant config is unavailable (pre-seed / offline). */
export function getLegacyFallbackSteps(): TenantOnboardingStep[] {
  return createDefaultOnboardingStepDrafts()
    .filter((s) => s.is_enabled)
    .map((d) => ({
      id: `legacy-${d.step_key}`,
      step_key: d.step_key,
      title: d.title,
      description: d.description,
      step_type: d.step_type,
      sort_order: d.sort_order,
      is_required: d.is_required,
      is_enabled: d.is_enabled,
      metadata: d.metadata,
    }));
}

export function resolveApplicantEnabledSteps(
  config: TenantOnboardingConfig | null | undefined,
  loading: boolean
): TenantOnboardingStep[] | null {
  if (loading) return null;
  const fromTenant = getEnabledTenantSteps(config);
  if (fromTenant.length > 0) return fromTenant;
  if (config) return [];
  return getLegacyFallbackSteps();
}

export function findStepForPathname(
  pathname: string,
  enabledSteps: TenantOnboardingStep[],
  search?: string
): TenantOnboardingStep | null {
  const searchStr =
    search ??
    (typeof window !== "undefined" ? window.location.search : "");
  return resolveApplicantStepFromPath(pathname, searchStr, enabledSteps);
}

export function findStepByKeyOrType(
  config: TenantOnboardingConfig | null | undefined,
  opts: { stepKey?: string; stepType?: OnboardingStepType }
): TenantOnboardingStep | null {
  const enabled = getEnabledTenantSteps(config);
  if (!enabled.length) return null;
  if (opts.stepKey) {
    const byKey = enabled.find((s) => s.step_key === opts.stepKey);
    if (byKey) return byKey;
  }
  if (opts.stepType) {
    return enabled.find((s) => s.step_type === opts.stepType) ?? null;
  }
  return null;
}

export function adjacentStepRoute(
  config: TenantOnboardingConfig | null | undefined,
  current: TenantOnboardingStep | null,
  direction: 1 | -1,
  tenantSlug?: string | null
): string | null {
  const enabled = getEnabledTenantSteps(config);
  if (!enabled.length) {
    if (config) return null;
    const legacy = getLegacyFallbackSteps();
    if (!legacy.length) return null;
    if (!current) {
      if (direction < 0) return null;
      const firstIdx = findNavigableStepIndex(legacy, -1, 1);
      if (firstIdx === null) return null;
      return routeForApplicantStep(legacy[firstIdx]!, tenantSlug);
    }
    const idx = legacy.findIndex((s) => s.id === current.id || s.step_key === current.step_key);
    const nextIdx = findNavigableStepIndex(legacy, idx, direction);
    if (nextIdx === null) return null;
    return routeForApplicantStep(legacy[nextIdx]!, tenantSlug);
  }

  if (!current) {
    if (direction < 0) return null;
    const firstIdx = findNavigableStepIndex(enabled, -1, 1);
    if (firstIdx === null) return null;
    return routeForApplicantStep(enabled[firstIdx]!, tenantSlug);
  }

  const idx = enabled.findIndex((s) => s.id === current.id);
  const resolvedIdx = idx >= 0 ? idx : enabled.findIndex((s) => s.step_key === current.step_key);
  const nextIdx = findNavigableStepIndex(enabled, resolvedIdx, direction);
  if (nextIdx === null) return null;
  return routeForApplicantStep(enabled[nextIdx]!, tenantSlug);
}

export type ContinueRouteProgress = {
  progress?: WorkerOnboardingProgressPayload | null;
  /** Status just saved for `current`, which may not be in `progress` yet. */
  savedStepId?: string | null;
  savedStatus?: string | null;
};

/**
 * First required candidate step in this phase that was skipped.
 * Optional skips are ignored. Used after the last step of a phase so the
 * candidate finishes those steps before the final screen.
 */
export function firstSkippedRequiredCandidateStep(
  steps: TenantOnboardingStep[],
  phase: "pre_hire" | "post_hire",
  progress: WorkerOnboardingProgressPayload | null | undefined,
  saved?: { stepId?: string | null; status?: string | null }
): TenantOnboardingStep | null {
  const statusById = buildProgressStatusMaps(steps, progress ?? null);
  if (saved?.stepId && saved.status) {
    statusById.set(saved.stepId, saved.status);
  }
  for (const step of steps) {
    if (readStepLifecyclePhase(step) !== phase) continue;
    if (!isTenantStepBlocking(step) || !isWorkerPerformableStep(step)) continue;
    if (String(statusById.get(step.id) ?? "").trim().toLowerCase() !== "skipped") continue;
    return step;
  }
  return null;
}

function nextRouteInSamePhase(
  enabled: TenantOnboardingStep[],
  current: TenantOnboardingStep,
  tenantSlug?: string | null
): string | null {
  const phase = readStepLifecyclePhase(current);
  const idx = enabled.findIndex((step) => step.id === current.id || step.step_key === current.step_key);
  for (let i = idx + 1; i < enabled.length; i++) {
    const step = enabled[i]!;
    if (readStepLifecyclePhase(step) !== phase) break;
    if (!applicantStepHasNavigableScreen(step, enabled)) continue;
    return routeForApplicantStep(step, tenantSlug);
  }
  return null;
}

function completionStatusRoute(
  phase: "pre_hire" | "post_hire",
  tenantSlug?: string | null
): string {
  const statusUrl = new URLSearchParams({ completion: phase });
  if (tenantSlug?.trim()) statusUrl.set("tenant", tenantSlug.trim().toLowerCase());
  return `${APPLICATION_ROUTES.applicationStatus}?${statusUrl.toString()}`;
}

/** Route after completing the current step (next step, remaining required skip, or final screen). */
export function resolvePostStepContinueRoute(
  config: TenantOnboardingConfig | null | undefined,
  current: TenantOnboardingStep | null,
  tenantSlug?: string | null,
  saved?: ContinueRouteProgress
): string {
  const enabled = getEnabledTenantSteps(config);
  const phase =
    current && readStepLifecyclePhase(current) === "post_hire" ? "post_hire" : "pre_hire";

  if (current) {
    const nextInPhase = nextRouteInSamePhase(enabled, current, tenantSlug);
    if (nextInPhase) return nextInPhase;
  }

  const remaining = firstSkippedRequiredCandidateStep(enabled, phase, saved?.progress, {
    stepId: saved?.savedStepId ?? current?.id,
    status: saved?.savedStatus,
  });
  if (remaining && remaining.id !== current?.id) {
    return routeForApplicantStep(remaining, tenantSlug);
  }
  if (remaining && saved?.savedStatus?.trim().toLowerCase() === "skipped") {
    return routeForApplicantStep(remaining, tenantSlug);
  }

  if (!current) {
    const next = adjacentStepRoute(config, null, 1, tenantSlug);
    if (next) return next;
  }

  const reviewStep = enabled.find(
    (step) =>
      (step.step_key === "review_submit" || step.step_type === "review_submit") &&
      readStepLifecyclePhase(step) === phase
  );
  if (reviewStep && reviewStep.id !== current?.id) {
    return routeForApplicantStep(reviewStep, tenantSlug);
  }

  return completionStatusRoute(phase, tenantSlug);
}

export function firstOnboardingStepRoute(
  config: TenantOnboardingConfig | null | undefined,
  tenantSlug?: string | null
): string {
  return (
    adjacentStepRoute(config, null, 1, tenantSlug) ??
    withTenant(APPLICATION_ROUTES.addResume, tenantSlug)
  );
}

export function computeMaxAllowedStepIndex(
  config: TenantOnboardingConfig | null | undefined,
  progress: WorkerOnboardingProgressPayload | null,
  pathname?: string | null
): number {
  const enabled = getEnabledTenantSteps(config);
  const steps = enabled.length ? enabled : config ? [] : getLegacyFallbackSteps();
  if (!steps.length) return 1;

  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const preview = params.get("preview");
    const mode = params.get("mode")?.trim().toLowerCase();
    if (preview === "draft" || mode === "test") {
      const idx = stepIndexFromPathname(pathname ?? "", steps, window.location.search);
      return Math.max(idx, steps.length);
    }
  }

  const frontier = config?.candidateEngineOrder?.length
    ? computeCandidateOnboardingFrontier({
        engineOrder: config.candidateEngineOrder,
        candidateSteps: steps,
        progress,
      })
    : {
        maxAllowedStepIndex: computeMaxAllowedStepIndexFromProgress(steps, progress),
        waitingOnInternal: false,
      };
  if (frontier.maxAllowedStepIndex < 1) return 0;
  if (frontier.waitingOnInternal) {
    return Math.min(frontier.maxAllowedStepIndex, steps.length);
  }

  const { farthestReachedIndex } = resolveApplicantNavBoundaries(
    steps,
    progress,
    frontier.maxAllowedStepIndex
  );

  let max = farthestReachedIndex;

  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const resume = params.get("resume");
    const stepKey = params.get("stepKey");
    if (resume === "1" || stepKey) {
      const idx = stepIndexFromPathname(pathname ?? "", steps, window.location.search);
      if (idx > 0) max = Math.max(max, idx);
    }
    if (localStorage.getItem("step1ReviewCompleted") === "true") {
      const resumeIdx = steps.findIndex(
        (s) => s.step_type === "resume_upload" || s.step_key === "resume_upload"
      );
      if (resumeIdx >= 0) max = Math.max(max, resumeIdx + 2);
    }
    if (localStorage.getItem("step4Skipped") === "1") {
      const authIdx = steps.findIndex(
        (s) =>
          s.step_type === "authorizations" ||
          s.step_key === "authorizations" ||
          s.step_key === "authorization_background_check" ||
          s.step_key === "agreement_signature" ||
          s.step_type === "references" ||
          s.step_key === "references"
      );
      if (authIdx >= 0) max = Math.max(max, authIdx + 2);
    }
  }

  return Math.min(max, steps.length);
}

export { stepIndexFromPathname };

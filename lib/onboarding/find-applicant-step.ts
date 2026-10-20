import type { TenantOnboardingStep } from "@/lib/onboarding/types";
import { APPLICATION_ROUTE_STEP_MARKERS, APPLICATION_ROUTES } from "@/lib/onboarding/application-routes";
import { routeForApplicantStep } from "@/lib/onboarding/resolve-applicant-step-route";

const AUTHORIZATIONS_SATELLITE_PATHS = [
  APPLICATION_ROUTES.authorizationsDocuments,
  APPLICATION_ROUTES.identityVerification,
  "/application/employee-agreement",
  "/application/upload-form",
];

function isAuthorizationsDocumentsRoute(routePath: string): boolean {
  return routePath.includes(APPLICATION_ROUTES.authorizationsDocuments);
}

function pathnameIsAuthorizationsFamily(pathname: string): boolean {
  return AUTHORIZATIONS_SATELLITE_PATHS.some((fragment) => pathname.includes(fragment));
}

export function readStepKeyFromSearch(search: string): string | null {
  const key = new URLSearchParams(search).get("stepKey")?.trim();
  return key || null;
}

export function findApplicantStepByKey(
  steps: TenantOnboardingStep[],
  stepKey: string | null | undefined
): TenantOnboardingStep | null {
  if (!stepKey?.trim()) return null;
  const exact = steps.find((s) => s.step_key === stepKey);
  if (exact) return exact;

  // Authorization / Background Check may be published as custom_question or
  // authorization_background_check depending on when the flow was synced.
  const aliases = new Set([
    "custom_question",
    "authorization_background_check",
    "authorizations",
    "agreement_signature",
    "background_check",
  ]);
  const key = stepKey.trim();
  const base = key.replace(/_\d+$/, "");
  if (!aliases.has(key) && !aliases.has(base)) return null;

  return (
    steps.find(
      (s) =>
        aliases.has(s.step_key) ||
        aliases.has(s.step_key.replace(/_\d+$/, "")) ||
        (typeof s.metadata?.workflow_step_id === "string" &&
          s.metadata.workflow_step_id === "background-check")
    ) ?? null
  );
}

function pathnameMatchesStepGroup(
  pathname: string,
  step: TenantOnboardingStep,
  marker: (typeof APPLICATION_ROUTE_STEP_MARKERS)[number]
): boolean {
  if (marker.stepKey && step.step_key !== marker.stepKey) return false;
  if (marker.stepType && step.step_type !== marker.stepType) return false;
  return marker.pathIncludes.some((fragment) => pathname.includes(fragment));
}

function customStepKeyFromPath(pathname: string): string | null {
  const match = pathname.match(/\/application\/custom-step\/([^/?#]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** Resolve which enabled step the applicant is on from URL + optional stepKey query. */
export function resolveApplicantStepFromPath(
  pathname: string,
  search: string,
  steps: TenantOnboardingStep[]
): TenantOnboardingStep | null {
  if (!steps.length) return null;

  const p = pathname || "";

  // The custom-step path is the screen the candidate is on. A stale stepKey query
  // (left over from the previous workflow step) must not highlight a different step.
  const pathStepKey = customStepKeyFromPath(p);
  if (pathStepKey) {
    const byPath = findApplicantStepByKey(steps, pathStepKey);
    if (byPath) return byPath;
  }

  const stepKey = readStepKeyFromSearch(search);
  if (stepKey) {
    const byKey = findApplicantStepByKey(steps, stepKey);
    if (byKey) return byKey;
  }

  const routePaths = steps.map((step) => routeForApplicantStep(step).split("?")[0]);
  // A step's own screen (e.g. SSN / Identity Verification) wins over a step that only borrows it.
  const exactIndex = routePaths.findIndex((routePath) => p === routePath);
  if (exactIndex >= 0) return steps[exactIndex];

  for (const [index, step] of steps.entries()) {
    const routePath = routePaths[index];
    if (p.startsWith(routePath) || p.includes(routePath)) return step;

    // Published background-check steps often use step_key "custom_question" but still
    // route to Authorizations & Documents (+ identity uploads).
    if (isAuthorizationsDocumentsRoute(routePath) && pathnameIsAuthorizationsFamily(p)) {
      return step;
    }

    for (const marker of APPLICATION_ROUTE_STEP_MARKERS) {
      if (pathnameMatchesStepGroup(p, step, marker)) return step;
    }
  }

  return null;
}

export function stepIndexForApplicantStep(
  step: TenantOnboardingStep | null,
  steps: TenantOnboardingStep[]
): number {
  if (!step || !steps.length) return 1;
  const idx = steps.findIndex((s) => s.id === step.id || s.step_key === step.step_key);
  return idx >= 0 ? idx + 1 : 1;
}

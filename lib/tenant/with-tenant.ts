import { resolveClientOnboardingTenantSlug } from "@/lib/tenant/client-onboarding-slug";
import { normalizeJobToken } from "@/lib/jobs/public-application-routing";
import { isOnboardingDraftPreview } from "@/lib/onboarding/is-draft-preview";

const APPLICATION_JOB_TOKEN_KEY = "applicationJobToken";

/** Paths where a stored apply-flow job token should ride along in query params. */
function shouldPreserveApplicationJobToken(pathname: string): boolean {
  return (
    pathname === "/application" ||
    pathname.startsWith("/application/") ||
    pathname === "/apply" ||
    pathname.startsWith("/apply/") ||
    pathname === "/jobs" ||
    pathname.startsWith("/jobs/") ||
    pathname === "/worker-signin" ||
    pathname.startsWith("/worker-signin/")
  );
}

/** Read job token from the current browser URL or localStorage (apply flow). */
export function currentApplicationJobToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    // Test workflow / draft preview must never inherit a live job application token.
    if (isOnboardingDraftPreview(window.location.search)) return null;
    const fromUrl = normalizeJobToken(new URLSearchParams(window.location.search).get("job_token"));
    if (fromUrl) return fromUrl;
    return normalizeJobToken(localStorage.getItem(APPLICATION_JOB_TOKEN_KEY));
  } catch {
    return null;
  }
}

/** Keep the live application's job token so navigation that drops it from the URL stays on the job workflow. */
export function rememberApplicationJobToken(token: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeJobToken(token ?? null);
  if (!normalized) return;
  try {
    if (isOnboardingDraftPreview(window.location.search)) return;
    localStorage.setItem(APPLICATION_JOB_TOKEN_KEY, normalized);
  } catch {
    // storage unavailable; URL token still applies
  }
}

/** Appends `?tenant=` (and preserves `job_token` when known) for applicant navigation. */
export function withTenant(path: string, tenant?: string | null): string {
  const slug = tenant?.trim().toLowerCase();
  if (!slug || slug.length < 2) return path;

  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("tenant", slug);

  const inWorkflowTest =
    params.get("preview") === "draft" ||
    params.get("mode")?.trim().toLowerCase() === "test" ||
    (typeof window !== "undefined" && isOnboardingDraftPreview(window.location.search));

  if (inWorkflowTest) {
    // Keep test mode sticky across step navigation; never attach live job tokens.
    if (!params.get("preview") && !params.get("mode")) {
      params.set("preview", "draft");
    }
    params.delete("job_token");
  } else if (shouldPreserveApplicationJobToken(pathname)) {
    const jobToken = currentApplicationJobToken();
    if (jobToken && !params.get("job_token")) {
      params.set("job_token", jobToken);
    }
  }

  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

/** Resolves tenant slug from the current browser URL or onboarding cookie. */
export function currentOnboardingTenantSlug(): string | null {
  if (typeof window === "undefined") return null;
  return resolveClientOnboardingTenantSlug(window.location.search);
}

/** Tenant-aware path for worker `/application/*` navigation (client-side). */
export function applicationPath(path: string, tenant?: string | null): string {
  return withTenant(path, tenant ?? currentOnboardingTenantSlug());
}

import { ADMIN_RECRUITER_HOME_ROUTE } from "@/app/admin_recruiter/components/sidebar-config";
import { getEffectiveRootDomain, isRootDomainHost } from "@/lib/tenant/tenant-host-resolution";

export function pickTenantVanityLabel(tenant: {
  subdomain?: string | null;
  slug?: string | null;
}): string | null {
  const subdomain = tenant.subdomain?.trim().toLowerCase();
  if (subdomain && subdomain.length >= 2) return subdomain;
  const slug = tenant.slug?.trim().toLowerCase();
  if (slug && slug.length >= 2) return slug;
  return null;
}

export function buildTenantVanityOrigin(
  subdomainLabel: string,
  options?: { protocol?: "http" | "https"; rootDomain?: string }
): string {
  const label = subdomainLabel.trim().toLowerCase();
  const root = options?.rootDomain?.trim().toLowerCase() || getEffectiveRootDomain();
  const protocol = options?.protocol ?? "https";
  return `${protocol}://${label}.${root}`;
}

export function buildTenantVanityUrl(
  subdomainLabel: string,
  path: string,
  options?: { protocol?: "http" | "https"; rootDomain?: string }
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, buildTenantVanityOrigin(subdomainLabel, options)).href;
}

function isLocalDevHostname(hostname: string | null | undefined): boolean {
  const host = hostname?.trim().toLowerCase() ?? "";
  return (
    !host ||
    host === "localhost" ||
    host.startsWith("127.0.0.1") ||
    host === "[::1]" ||
    host === "::1"
  );
}

/**
 * Preview deploys (`*.vercel.app`) have no `{tenant}.…` host.
 * Sending the recruiter there makes sidebar clicks fail and full page loads go blank.
 */
function isUnsupportedVanityHost(hostname: string | null | undefined): boolean {
  const host = hostname?.trim().toLowerCase() ?? "";
  if (!host) return false;
  return (
    host === "vercel.app" ||
    host === "vercel.sh" ||
    host.endsWith(".vercel.app") ||
    host.endsWith(".vercel.sh")
  );
}

/** Recruiter dashboard routes should open on the tenant vanity host when available. */
export function shouldUseTenantVanityHost(path: string): boolean {
  const pathname = path.split("?")[0]?.trim() || "";
  return pathname.startsWith("/admin_recruiter") || pathname === ADMIN_RECRUITER_HOME_ROUTE;
}

/**
 * When a recruiter has a vanity subdomain, keep dashboard URLs on `{subdomain}.{root}`.
 * Returns a relative path when already on the correct host (or in local dev).
 */
export function resolveRecruiterDashboardUrl(params: {
  path: string;
  tenantSubdomain: string | null;
  currentHostname?: string | null;
  protocol?: "http" | "https";
  rootDomain?: string;
}): string {
  const path = params.path.startsWith("/") ? params.path : `/${params.path}`;
  const tenantSubdomain = params.tenantSubdomain?.trim().toLowerCase() || null;
  if (!tenantSubdomain || !shouldUseTenantVanityHost(path)) return path;

  const root = params.rootDomain?.trim().toLowerCase() || getEffectiveRootDomain();
  const host = params.currentHostname?.trim().toLowerCase() ?? null;

  if (isLocalDevHostname(host)) return path;
  if (isUnsupportedVanityHost(host) || isUnsupportedVanityHost(root)) return path;

  const vanityHost = `${tenantSubdomain}.${root}`;
  if (host === vanityHost) return path;

  const protocol = params.protocol ?? "https";
  if (host && isRootDomainHost(host, root)) {
    return buildTenantVanityUrl(tenantSubdomain, path, { protocol, rootDomain: root });
  }

  if (host && host.endsWith(`.${root}`) && host !== vanityHost) {
    return buildTenantVanityUrl(tenantSubdomain, path, { protocol, rootDomain: root });
  }

  return path;
}

type HeaderReader = { get(name: string): string | null };

/**
 * Next.js App Router client navigations and prefetches.
 * A cross-origin redirect on these requests makes the router drop the click
 * (`Failed to fetch RSC payload`) instead of opening the page.
 * Full document loads do not send these headers and can still change host.
 */
export function isAppRouterFlightRequest(
  headers: HeaderReader,
  searchParams?: { has(name: string): boolean } | null
): boolean {
  if (headers.get("rsc") != null) return true;
  if (headers.get("next-router-prefetch") != null) return true;
  if (headers.get("next-router-segment-prefetch") != null) return true;
  if (headers.get("next-router-state-tree") != null) return true;
  const accept = headers.get("accept") ?? "";
  if (accept.includes("text/x-component")) return true;
  if (searchParams?.has("_rsc")) return true;
  return false;
}

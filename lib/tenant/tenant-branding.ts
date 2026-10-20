/** Row shape compatible with PostgREST `tenants`. */
export type TenantBrandingRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  login_logo_url?: string | null;
  signup_logo_url?: string | null;
  favicon_url?: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  checkbox_color: string | null;
  welcome_headline: string | null;
  welcome_subtitle: string | null;
  signup_headline?: string | null;
  signup_subheadline?: string | null;
  auth_background_image_url: string | null;
  primary_font?: string | null;
  heading_font?: string | null;
  body_font?: string | null;
  font_color?: string | null;
  heading_color?: string | null;
  muted_text_color?: string | null;
  button_text?: string | null;
  button_color?: string | null;
};

export type TenantBrandingFontId = "inter" | "impact" | "roboto" | "poppins" | "ubuntu";

/** Runtime branding used by UI (+ CSS vars). */
export type TenantBranding = {
  id: string | null;
  slug: string | null;
  companyName: string;
  logoUrl: string;
  loginLogoUrl: string;
  signupLogoUrl: string;
  faviconUrl: string;
  headline: string;
  subtitle: string;
  signupHeadline: string;
  signupSubheadline: string;
  loginBackgroundSrc: string;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  checkboxHex: string;
  tagline: string;
  primaryFontId: TenantBrandingFontId;
  headingFontId: TenantBrandingFontId;
  bodyFontId: TenantBrandingFontId;
  fontColor: string;
  headingColor: string;
  mutedTextColor: string;
  buttonText: string;
  buttonColor: string;
};

export const PLATFORM_DEFAULT_TENANT_SLUG = "braas-hr";

export const APPLICANT_PORTAL_CTA_START_APPLICATION = "Start Application";
export const APPLICANT_PORTAL_CTA_VIEW_OPEN_POSITIONS = "View positions";

/** CTA on Braas HR platform pages that onboard a new tenant (not a job application). */
export const PLATFORM_ONBOARDING_CTA_GET_STARTED = "Get Started";

/** Brass HR platform favicon and default tenant icon. */
export const BRAAS_PLATFORM_FAVICON = "/brassHR favicon 2.svg";

export function isBraasPlatformBranding(brand: Pick<TenantBranding, "slug" | "companyName">): boolean {
  const slug = brand.slug?.trim().toLowerCase();
  if (slug === PLATFORM_DEFAULT_TENANT_SLUG) return true;
  if (!slug) {
    return brand.companyName.trim().toLowerCase() === "brass hr";
  }
  return false;
}

/** Logo shown in Braas login shell header + art panel. */
export function braasLoginShellLogoUrl(brand: TenantBranding): string {
  if (isBraasPlatformBranding(brand)) return BRAAS_PLATFORM_FAVICON;
  return brand.loginLogoUrl || brand.logoUrl;
}

/** Logo shown on applicant welcome + onboarding right panels. */
export function tenantApplicantPanelLogoUrl(brand: TenantBranding): string {
  return brand.loginLogoUrl || brand.logoUrl;
}

/** Primary auth CTA style — gradient when enabled, visible gray when disabled. */
export function brandingAuthButtonStyle(enabled: boolean): Record<string, string> {
  if (!enabled) {
    return {
      backgroundColor: "#dddddd",
      backgroundImage: "none",
      color: "#94a3b8",
      WebkitTextFillColor: "#94a3b8",
      fontFamily: "var(--brand-font-body)",
    };
  }
  return {
    backgroundImage: "linear-gradient(90deg, var(--brand-button) 0%, var(--brand-accent) 100%)",
    backgroundColor: "transparent",
    color: "#ffffff",
    WebkitTextFillColor: "#ffffff",
    fontFamily: "var(--brand-font-body)",
  };
}

/** Braas Figma split login UI for all tenants (company branding from API / subdomain). */
export function usesBraasFigmaLoginUi(_tenantQuery?: string | null): boolean {
  return true;
}

/**
 * True when `slug` identifies a real tenant applicant portal (subdomain or ?tenant=).
 * Platform marketing (`braas-hr`) and missing slug are not applicant portals.
 */
export function isTenantApplicantPortalSlug(slug: string | null | undefined): boolean {
  const key = slug?.trim().toLowerCase();
  if (!key || key.length < 2) return false;
  return key !== PLATFORM_DEFAULT_TENANT_SLUG;
}

export function applicantLandingCtaLabel(
  slug: string | null | undefined,
  opts?: { hasOpenJobs?: boolean }
): string {
  if (!isTenantApplicantPortalSlug(slug)) {
    return PLATFORM_ONBOARDING_CTA_GET_STARTED;
  }
  if (opts?.hasOpenJobs === true) {
    return APPLICANT_PORTAL_CTA_VIEW_OPEN_POSITIONS;
  }
  return APPLICANT_PORTAL_CTA_START_APPLICATION;
}

/** Braas HR platform owner UI (login, signup, tenant-onboarding shell). */
export const BRAAS_PRIMARY = "#BC8B41";
export const BRAAS_SECONDARY = "#104b83";
export const BRAAS_ACCENT = "#E9B771";
/** Braas Figma Deep Navy — sign-in checkboxes. */
export const BRAAS_CHECKBOX = "#012352";

/** Nexus tenant defaults when DB fields are empty. */
export const NEXUS_PRIMARY = "#0d9488";
export const NEXUS_SECONDARY = "#0f766e";
export const NEXUS_ACCENT = "#99f6e4";

/** @deprecated Use slug-specific fallbacks via `brandingFallbackForSlug`. */
export const FALLBACK_PRIMARY = BRAAS_PRIMARY;
export const FALLBACK_SECONDARY = BRAAS_SECONDARY;
export const FALLBACK_ACCENT = BRAAS_ACCENT;

const DEFAULT_LOGO = "/images/new-logo-nexus.svg";
const DEFAULT_BACKGROUND = "/images/handshake.jpg";
const DEFAULT_FONT_ID: TenantBrandingFontId = "inter";
const DEFAULT_FONT_COLOR = "#0F172A";
const DEFAULT_HEADING_COLOR = "#0F172A";
const DEFAULT_MUTED_COLOR = "#64748B";
const DEFAULT_BUTTON_TEXT = "Sign in";

export function sanitizeAuthButtonText(
  value: string | null | undefined,
  fallback: string = DEFAULT_BUTTON_TEXT
): string {
  const text = value?.trim();
  if (!text) return fallback;
  if (text.includes("@")) return fallback;
  return text;
}

const FONT_FAMILY_BY_ID: Record<TenantBrandingFontId, string> = {
  inter: "var(--font-tenant-branding-inter, ui-sans-serif), Inter, system-ui, sans-serif",
  impact: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
  roboto: "var(--font-tenant-branding-roboto, sans-serif), Roboto, system-ui, sans-serif",
  poppins:
    "var(--font-tenant-branding-poppins, sans-serif), Poppins, system-ui, sans-serif",
  ubuntu: "var(--font-tenant-branding-ubuntu, sans-serif), Ubuntu, system-ui, sans-serif",
};

export function normalizeBrandingFontId(value: string | null | undefined): TenantBrandingFontId {
  const key = value?.trim().toLowerCase();
  if (key === "impact" || key === "roboto" || key === "poppins" || key === "ubuntu") {
    return key;
  }
  return DEFAULT_FONT_ID;
}

export function brandingFontFamily(fontId: TenantBrandingFontId): string {
  return FONT_FAMILY_BY_ID[fontId] ?? FONT_FAMILY_BY_ID.inter;
}

/** Apply a single onboarding font choice to all typography slots. */
export function applyPrimaryFontToBranding(
  branding: TenantBranding,
  fontId: TenantBrandingFontId
): TenantBranding {
  return {
    ...branding,
    primaryFontId: fontId,
    headingFontId: fontId,
    bodyFontId: fontId,
  };
}

function brandingTypographyDefaults(primaryHex: string) {
  return {
    primaryFontId: DEFAULT_FONT_ID,
    headingFontId: DEFAULT_FONT_ID,
    bodyFontId: DEFAULT_FONT_ID,
    fontColor: DEFAULT_FONT_COLOR,
    headingColor: DEFAULT_HEADING_COLOR,
    mutedTextColor: DEFAULT_MUTED_COLOR,
    buttonText: DEFAULT_BUTTON_TEXT,
    buttonColor: primaryHex,
  };
}

/** Reject placeholder junk (e.g. DB value "test") and non-URL strings for next/image. */
export function normalizeBrandingImageSrc(
  src: string | null | undefined,
  fallback: string,
  options?: { allowBlob?: boolean }
): string {
  const raw = src?.trim();
  if (!raw) return fallback;

  if (raw.startsWith("/")) return raw;

  if (raw.startsWith("blob:")) {
    return options?.allowBlob ? raw : fallback;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return raw;
  } catch {
    /* not an absolute URL */
  }

  return fallback;
}

export function isRemoteOrBlobImageSrc(src: string): boolean {
  return src.startsWith("http://") || src.startsWith("https://") || src.startsWith("blob:");
}

export function defaultTenantBranding(overrides: Partial<TenantBranding> = {}): TenantBranding {
  return brandingFallbackForSlug(PLATFORM_DEFAULT_TENANT_SLUG, overrides);
}

/** Per-tenant static fallbacks — never apply Braas assets to other tenants. */
export function brandingFallbackForSlug(
  slug: string | null | undefined,
  overrides: Partial<TenantBranding> = {}
): TenantBranding {
  const key = slug?.trim().toLowerCase() ?? "";
  const name =
    key === "nexus"
      ? "Nexus"
      : key === PLATFORM_DEFAULT_TENANT_SLUG
        ? "Brass HR"
        : "Your organization";

  const base: TenantBranding =
    key === "nexus"
      ? {
          id: null,
          slug: "nexus",
          companyName: name,
          logoUrl: "/images/new-logo-nexus.svg",
          loginLogoUrl: "/images/new-logo-nexus.svg",
          signupLogoUrl: "/images/new-logo-nexus.svg",
          faviconUrl: "/images/new-logo-nexus.svg",
          headline: `Welcome to ${name}`,
          subtitle: "Quick pay, flexible shifts, support team",
          signupHeadline: `Join ${name}`,
          signupSubheadline: "Create your account to get started",
          loginBackgroundSrc: "/images/handshake.jpg",
          primaryHex: NEXUS_PRIMARY,
          secondaryHex: NEXUS_SECONDARY,
          accentHex: NEXUS_ACCENT,
          checkboxHex: NEXUS_PRIMARY,
          tagline: `Connecting Healthcare professionals — ${name}.`,
          ...brandingTypographyDefaults(NEXUS_PRIMARY),
        }
      : {
          id: null,
          slug: key === PLATFORM_DEFAULT_TENANT_SLUG ? PLATFORM_DEFAULT_TENANT_SLUG : key || null,
          companyName: name,
          logoUrl: "/icons/braas-HR/BrassHR-logo.svg",
          loginLogoUrl: "/icons/braas-HR/BrassHR-logo.svg",
          signupLogoUrl: "/icons/braas-HR/BrassHR-logo.svg",
          faviconUrl: BRAAS_PLATFORM_FAVICON,
          headline: `Welcome to ${name}`,
          subtitle: "HR Simplified for growing teams",
          signupHeadline: `Welcome to ${name}`,
          signupSubheadline: "Create your organization account",
          loginBackgroundSrc: "/images/singup-bg-image.jpg",
          primaryHex: BRAAS_PRIMARY,
          secondaryHex: BRAAS_SECONDARY,
          accentHex: BRAAS_ACCENT,
          checkboxHex: BRAAS_CHECKBOX,
          tagline: "HR Simplified for growing teams",
          ...brandingTypographyDefaults(BRAAS_PRIMARY),
        };

  return { ...base, ...overrides };
}

export function brandingFromTenantRow(
  row: TenantBrandingRow | null,
  requestedSlug?: string | null
): TenantBranding {
  if (!row) return brandingFallbackForSlug(requestedSlug ?? PLATFORM_DEFAULT_TENANT_SLUG);
  const fb = brandingFallbackForSlug(row.slug);
  const company = row.name?.trim() || fb.companyName;
  const primaryHex = row.primary_color?.trim() || fb.primaryHex;
  const logoUrl = normalizeBrandingImageSrc(row.logo_url, fb.logoUrl, { allowBlob: true });
  const hasCustomLogo = Boolean(row.logo_url?.trim());
  const isPlatformBranding = row.slug?.trim().toLowerCase() === PLATFORM_DEFAULT_TENANT_SLUG;
  const faviconFallback =
    isPlatformBranding || !hasCustomLogo ? BRAAS_PLATFORM_FAVICON : logoUrl;
  const typography = brandingTypographyDefaults(primaryHex);
  return {
    id: row.id,
    slug: row.slug,
    companyName: company,
    logoUrl,
    loginLogoUrl: normalizeBrandingImageSrc(row.login_logo_url, logoUrl, { allowBlob: true }),
    signupLogoUrl: normalizeBrandingImageSrc(row.signup_logo_url, logoUrl, { allowBlob: true }),
    faviconUrl: isPlatformBranding
      ? BRAAS_PLATFORM_FAVICON
      : normalizeBrandingImageSrc(row.favicon_url, faviconFallback, { allowBlob: true }),
    headline: row.welcome_headline?.trim() || `Welcome to ${company}`,
    subtitle: row.welcome_subtitle?.trim() || fb.subtitle,
    signupHeadline: row.signup_headline?.trim() || row.welcome_headline?.trim() || `Welcome to ${company}`,
    signupSubheadline:
      row.signup_subheadline?.trim() || row.welcome_subtitle?.trim() || fb.signupSubheadline,
    loginBackgroundSrc: normalizeBrandingImageSrc(row.auth_background_image_url, fb.loginBackgroundSrc),
    primaryHex,
    secondaryHex: row.secondary_color?.trim() || fb.secondaryHex,
    accentHex: row.accent_color?.trim() || fb.accentHex,
    checkboxHex: row.checkbox_color?.trim() || fb.checkboxHex,
    tagline: row.welcome_subtitle?.trim()
      ? row.welcome_subtitle.trim()
      : `Connecting Healthcare professionals — ${company}.`,
    primaryFontId: normalizeBrandingFontId(row.primary_font ?? typography.primaryFontId),
    headingFontId: normalizeBrandingFontId(row.heading_font ?? row.primary_font ?? typography.headingFontId),
    bodyFontId: normalizeBrandingFontId(row.body_font ?? row.primary_font ?? typography.bodyFontId),
    fontColor: row.font_color?.trim() || typography.fontColor,
    headingColor: row.heading_color?.trim() || typography.headingColor,
    mutedTextColor: row.muted_text_color?.trim() || typography.mutedTextColor,
    buttonText: sanitizeAuthButtonText(row.button_text, typography.buttonText),
    buttonColor: row.button_color?.trim() || primaryHex,
  };
}

/** Light tint for borders and surfaces derived from a brand hex. */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Page shell gradient used by onboarding layouts. */
export function brandingShellGradient(b: TenantBranding): string {
  const vars = brandingToCssVars(b);
  return `linear-gradient(135deg, ${vars["--brand-gradient-from"]} 0%, ${vars["--brand-gradient-to"]} 100%)`;
}

/** Apply CSS variables consumed by onboarding / auth surfaces. */
export function brandingToCssVars(b: TenantBranding): Record<string, string> {
  return {
    "--brand-primary": b.primaryHex,
    "--brand-secondary": b.secondaryHex,
    "--brand-accent": b.accentHex,
    "--brand-checkbox": b.checkboxHex,
    // Shell uses primary only so applicant + welcome match brand gold (API primary),
    // not a primary→secondary (navy) split.
    "--brand-gradient-from": lightenForGradient(b.primaryHex),
    "--brand-gradient-to": b.primaryHex,
    "--brand-font-family": brandingFontFamily(b.primaryFontId),
    "--brand-font-primary": brandingFontFamily(b.primaryFontId),
    "--brand-font-heading": brandingFontFamily(b.headingFontId),
    "--brand-font-body": brandingFontFamily(b.bodyFontId),
    "--brand-text": b.fontColor,
    "--brand-heading": b.headingColor,
    "--brand-muted": b.mutedTextColor,
    "--brand-button": b.buttonColor,
  };
}

/** Foreground that stays legible on a tenant colour of unknown lightness. */
export function readableTextOnBrand(hex: string, dark = "#0F172A", light = "#FFFFFF"): string {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return light;
  const channel = (raw: number) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel(parseInt(h.slice(0, 2), 16)) +
    0.7152 * channel(parseInt(h.slice(2, 4), 16)) +
    0.0722 * channel(parseInt(h.slice(4, 6), 16));
  return luminance > 0.45 ? dark : light;
}

function lightenForGradient(hex: string): string {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return hex;
  const r = Math.min(255, parseInt(h.slice(0, 2), 16) + 36);
  const g = Math.min(255, parseInt(h.slice(2, 4), 16) + 42);
  const b = Math.min(255, parseInt(h.slice(4, 6), 16) + 40);
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function to2(n: number): string {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
}

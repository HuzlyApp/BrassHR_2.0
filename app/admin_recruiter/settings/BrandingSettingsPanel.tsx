"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon, ImageIcon, RefreshCw } from "lucide-react";
import {
  AccountErrorBanner,
  AccountLoadingSkeleton,
} from "@/app/admin_recruiter/account/components/AccountFormStatus";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import BrandingColorField from "@/app/tenant-onboarding/BrandingColorField";
import {
  BRAND_COLOR_PRESETS,
  TENANT_BRANDING_FONT_OPTIONS,
  type TenantBrandingFontId,
} from "@/app/tenant-onboarding/constants";
import {
  EFFECTIVE_BRANDING_QUERY_KEY,
  patchEffectiveBrandingCache,
} from "@/lib/admin/hooks/use-effective-branding";
import { notifyBrandingUpdated } from "@/lib/tenant/branding-events";
import {
  BRAAS_ACCENT,
  BRAAS_PRIMARY,
  BRAAS_SECONDARY,
  brandingFontFamily,
  type TenantBranding,
} from "@/lib/tenant/tenant-branding";
import BrandingAuthPreview from "@/app/admin_recruiter/settings/BrandingAuthPreview";
import HireJourneyThemePanel from "@/app/admin_recruiter/settings/HireJourneyThemePanel";
import { supabaseBrowser } from "@/lib/supabase-browser";
import toast from "react-hot-toast";

type PreviewMode = "login" | "signup";
type LogoField = "logo" | "login" | "signup" | "favicon";
type BrandingTab = "logo" | "backgrounds" | "colors" | "typography" | "hiring-journey";

const BRANDING_TABS: Array<{ id: BrandingTab; label: string }> = [
  { id: "logo", label: "Logo" },
  { id: "backgrounds", label: "Backgrounds" },
  { id: "colors", label: "Colors" },
  { id: "typography", label: "Typography" },
  { id: "hiring-journey", label: "Hiring Journey" },
];

function normalizePresetHex(hex: string): string {
  return hex.trim().toLowerCase();
}

function isPresetActive(
  preset: (typeof BRAND_COLOR_PRESETS)[number],
  primaryHex: string,
  secondaryHex: string,
  accentHex: string
): boolean {
  return (
    normalizePresetHex(preset.primary) === normalizePresetHex(primaryHex) &&
    normalizePresetHex(preset.secondary) === normalizePresetHex(secondaryHex) &&
    normalizePresetHex(preset.accent) === normalizePresetHex(accentHex)
  );
}

function FieldBlock({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-semibold text-[#0F172A]">{label}</span>
      {hint ? <span className="block text-xs text-[#64748B]">{hint}</span> : null}
      {children}
    </label>
  );
}

const DEFAULT_FONT_COLOR = "#0F172A";
const DEFAULT_HEADING_COLOR = "#0F172A";
const DEFAULT_MUTED_COLOR = "#64748B";

function FontSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TenantBrandingFontId;
  onChange: (id: TenantBrandingFontId) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <FieldBlock label={label}>
      <div className="relative">
        <select
          value={value}
          onMouseDown={() => setIsOpen(true)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setIsOpen(false)}
          onChange={(event) => {
            onChange(event.target.value as TenantBrandingFontId);
            setIsOpen(false);
          }}
          className="h-11 w-full cursor-pointer appearance-none rounded-lg border border-[#CBD5E1] bg-white px-3 pr-11 text-sm text-[#0F172A] outline-none focus:border-[color:var(--brand-primary)]"
          style={{ fontFamily: brandingFontFamily(value) }}
        >
          {TENANT_BRANDING_FONT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id} style={{ fontFamily: option.fontFamily }}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" aria-hidden>
          <ChevronDownIcon
            className={`size-4 text-[#64748B] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </span>
      </div>
    </FieldBlock>
  );
}

function fileNameFromUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("blob:")) return null;

  try {
    const pathname = new URL(trimmed, window.location.origin).pathname;
    const segment = pathname.split("/").filter(Boolean).pop();
    return segment ? decodeURIComponent(segment) : null;
  } catch {
    const segment = trimmed.split("/").filter(Boolean).pop();
    if (!segment) return null;
    return decodeURIComponent(segment.split("?")[0] ?? segment);
  }
}

function LogoUploadBlock({
  label,
  hint,
  previewSrc,
  selectedFile,
  onFileChange,
  onRemove,
}: {
  label: string;
  hint: string;
  previewSrc: string;
  selectedFile: File | null;
  onFileChange: (file: File | null) => void;
  onRemove?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadedFileName = useMemo(() => fileNameFromUrl(previewSrc), [previewSrc]);
  const displayFileName = selectedFile?.name ?? uploadedFileName;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[#E5E7EB] bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewSrc}
          alt=""
          className="size-11 shrink-0 rounded-full border border-[#E5E7EB] bg-[#F8FAFC] object-contain p-1"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#101828]">{label}</p>
          <p className="mt-0.5 text-xs leading-5 text-[#6B7280]">{hint}</p>
          {displayFileName ? (
            <p className="mt-1 truncate text-xs text-[#94A3B8]" title={displayFileName}>
              {displayFileName}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:pl-4">
        <button
          type="button"
          onClick={() => {
            onFileChange(null);
            onRemove?.();
            if (inputRef.current) inputRef.current.value = "";
          }}
          className="inline-flex h-[30px] cursor-pointer items-center justify-center rounded-md border border-[#012352] bg-white px-3 text-xs font-medium text-[#012352] transition hover:bg-[#F8FAFC]"
        >
          Remove
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-[30px] cursor-pointer items-center justify-center rounded-md bg-[#012352] px-3 text-xs font-medium text-white transition hover:brightness-110"
        >
          Choose file
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,.png,.jpg,.jpeg,.webp,.svg,.ico"
        onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        className="sr-only"
      />
    </div>
  );
}

async function authHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

async function uploadLogo(field: LogoField, file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("field", field);
  const uploadRes = await fetch("/api/admin/branding/logo", {
    method: "POST",
    headers: await authHeaders(),
    body: formData,
  });
  const uploadPayload = (await uploadRes.json().catch(() => ({}))) as {
    logoUrl?: string;
    error?: string;
  };
  if (!uploadRes.ok) throw new Error(uploadPayload.error || "Logo upload failed.");
  if (!uploadPayload.logoUrl) throw new Error("Logo upload did not return a URL.");
  return uploadPayload.logoUrl;
}

export default function BrandingSettingsPanel({
  initialTab = "logo",
}: {
  initialTab?: BrandingTab;
} = {}) {
  const queryClient = useQueryClient();
  const currentBranding = useTenantBranding();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("login");
  const [activeTab, setActiveTab] = useState<BrandingTab>(initialTab);

  const [primaryHex, setPrimaryHex] = useState(currentBranding.primaryHex);
  const [secondaryHex, setSecondaryHex] = useState(currentBranding.secondaryHex);
  const [accentHex, setAccentHex] = useState(currentBranding.accentHex);
  const [headline, setHeadline] = useState(currentBranding.headline);
  const [subtitle, setSubtitle] = useState(currentBranding.subtitle);
  const [signupHeadline, setSignupHeadline] = useState(currentBranding.signupHeadline);
  const [signupSubheadline, setSignupSubheadline] = useState(currentBranding.signupSubheadline);
  const [loginBackgroundSrc, setLoginBackgroundSrc] = useState(currentBranding.loginBackgroundSrc);
  const [buttonText, setButtonText] = useState(currentBranding.buttonText);
  const [buttonColor, setButtonColor] = useState(currentBranding.buttonColor);
  const [logoUrl, setLogoUrl] = useState(currentBranding.logoUrl);
  const [loginLogoUrl, setLoginLogoUrl] = useState(currentBranding.loginLogoUrl);
  const [signupLogoUrl, setSignupLogoUrl] = useState(currentBranding.signupLogoUrl);
  const [faviconUrl, setFaviconUrl] = useState(currentBranding.faviconUrl);
  const [primaryFontId, setPrimaryFontId] = useState(currentBranding.primaryFontId);
  const [headingFontId, setHeadingFontId] = useState(currentBranding.headingFontId);
  const [bodyFontId, setBodyFontId] = useState(currentBranding.bodyFontId);
  const [fontColor, setFontColor] = useState(currentBranding.fontColor);
  const [headingColor, setHeadingColor] = useState(currentBranding.headingColor);
  const [mutedTextColor, setMutedTextColor] = useState(currentBranding.mutedTextColor);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [loginLogoFile, setLoginLogoFile] = useState<File | null>(null);
  const [signupLogoFile, setSignupLogoFile] = useState<File | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);

  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [loginLogoPreview, setLoginLogoPreview] = useState<string | null>(null);
  const [signupLogoPreview, setSignupLogoPreview] = useState<string | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(null);

  const applyBranding = useCallback((branding: TenantBranding) => {
    setPrimaryHex(branding.primaryHex);
    setSecondaryHex(branding.secondaryHex);
    setAccentHex(branding.accentHex);
    setHeadline(branding.headline);
    setSubtitle(branding.subtitle);
    setSignupHeadline(branding.signupHeadline);
    setSignupSubheadline(branding.signupSubheadline);
    setLoginBackgroundSrc(branding.loginBackgroundSrc);
    setButtonText(branding.buttonText);
    setButtonColor(branding.buttonColor);
    setLogoUrl(branding.logoUrl);
    setLoginLogoUrl(branding.loginLogoUrl);
    setSignupLogoUrl(branding.signupLogoUrl);
    setFaviconUrl(branding.faviconUrl);
    setPrimaryFontId(branding.primaryFontId);
    setHeadingFontId(branding.headingFontId);
    setBodyFontId(branding.bodyFontId);
    setFontColor(branding.fontColor);
    setHeadingColor(branding.headingColor);
    setMutedTextColor(branding.mutedTextColor);
  }, []);

  const loadBranding = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/branding", { cache: "no-store", headers });
      const payload = (await res.json().catch(() => ({}))) as {
        branding?: TenantBranding;
        tenantId?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || "Could not load branding.");
      if (payload.branding) {
        applyBranding(payload.branding);
        patchEffectiveBrandingCache(queryClient, payload.branding);
      }
      setTenantId(payload.tenantId ?? null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load branding.");
    } finally {
      setLoading(false);
    }
  }, [applyBranding, queryClient]);

  useEffect(() => {
    void loadBranding();
  }, [loadBranding]);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(logoFile);
    setLogoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [logoFile]);

  useEffect(() => {
    if (!loginLogoFile) {
      setLoginLogoPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(loginLogoFile);
    setLoginLogoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [loginLogoFile]);

  useEffect(() => {
    if (!signupLogoFile) {
      setSignupLogoPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(signupLogoFile);
    setSignupLogoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [signupLogoFile]);

  useEffect(() => {
    if (!faviconFile) {
      setFaviconPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(faviconFile);
    setFaviconPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [faviconFile]);

  useEffect(() => {
    if (!backgroundFile) {
      setBackgroundPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(backgroundFile);
    setBackgroundPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [backgroundFile]);

  const preview = useMemo(
    (): TenantBranding => ({
      ...currentBranding,
      primaryHex,
      secondaryHex,
      accentHex,
      headline: headline.trim() || currentBranding.headline,
      subtitle: subtitle.trim() || currentBranding.subtitle,
      signupHeadline: signupHeadline.trim() || currentBranding.signupHeadline,
      signupSubheadline: signupSubheadline.trim() || currentBranding.signupSubheadline,
      loginBackgroundSrc: backgroundPreview || loginBackgroundSrc,
      logoUrl: logoPreview || logoUrl,
      loginLogoUrl: loginLogoPreview || loginLogoUrl || logoPreview || logoUrl,
      signupLogoUrl: signupLogoPreview || signupLogoUrl || logoPreview || logoUrl,
      faviconUrl: faviconPreview || faviconUrl || logoPreview || logoUrl,
      primaryFontId,
      headingFontId,
      bodyFontId,
      fontColor,
      headingColor,
      mutedTextColor,
      buttonText: buttonText.trim() || currentBranding.buttonText,
      buttonColor,
    }),
    [
      accentHex,
      backgroundPreview,
      bodyFontId,
      buttonColor,
      buttonText,
      currentBranding,
      faviconPreview,
      faviconUrl,
      fontColor,
      headingColor,
      headingFontId,
      headline,
      loginBackgroundSrc,
      loginLogoPreview,
      loginLogoUrl,
      logoPreview,
      logoUrl,
      mutedTextColor,
      primaryFontId,
      primaryHex,
      secondaryHex,
      signupHeadline,
      signupLogoPreview,
      signupLogoUrl,
      signupSubheadline,
      subtitle,
    ]
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const headers = {
        ...(await authHeaders()),
        "Content-Type": "application/json",
      };

      let nextLogoUrl = logoUrl;
      let nextLoginLogoUrl = loginLogoUrl;
      let nextSignupLogoUrl = signupLogoUrl;
      let nextFaviconUrl = faviconUrl;
      let nextBackgroundUrl = loginBackgroundSrc;

      if (logoFile) {
        nextLogoUrl = await uploadLogo("logo", logoFile);
        setLogoUrl(nextLogoUrl);
        setLogoFile(null);
      }
      if (loginLogoFile) {
        nextLoginLogoUrl = await uploadLogo("login", loginLogoFile);
        setLoginLogoUrl(nextLoginLogoUrl);
        setLoginLogoFile(null);
      }
      if (signupLogoFile) {
        nextSignupLogoUrl = await uploadLogo("signup", signupLogoFile);
        setSignupLogoUrl(nextSignupLogoUrl);
        setSignupLogoFile(null);
      }
      if (faviconFile) {
        nextFaviconUrl = await uploadLogo("favicon", faviconFile);
        setFaviconUrl(nextFaviconUrl);
        setFaviconFile(null);
      }

      if (backgroundFile) {
        const bgFormData = new FormData();
        bgFormData.append("file", backgroundFile);
        const bgUploadRes = await fetch("/api/admin/branding/background", {
          method: "POST",
          headers: await authHeaders(),
          body: bgFormData,
        });
        const bgUploadPayload = (await bgUploadRes.json().catch(() => ({}))) as {
          backgroundImageUrl?: string;
          error?: string;
        };
        if (!bgUploadRes.ok) throw new Error(bgUploadPayload.error || "Background upload failed.");
        if (bgUploadPayload.backgroundImageUrl) {
          nextBackgroundUrl = bgUploadPayload.backgroundImageUrl;
          setLoginBackgroundSrc(bgUploadPayload.backgroundImageUrl);
        }
        setBackgroundFile(null);
      }

      const res = await fetch("/api/admin/branding", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          primaryColor: primaryHex,
          secondaryColor: secondaryHex,
          accentColor: accentHex,
          welcomeHeadline: headline,
          welcomeSubtitle: subtitle,
          signupHeadline,
          signupSubheadline,
          authBackgroundImageUrl: nextBackgroundUrl,
          logoUrl: nextLogoUrl,
          loginLogoUrl: nextLoginLogoUrl,
          signupLogoUrl: nextSignupLogoUrl,
          faviconUrl: nextFaviconUrl,
          primaryFont: primaryFontId,
          headingFont: headingFontId,
          bodyFont: bodyFontId,
          fontColor,
          headingColor,
          mutedTextColor,
          buttonText,
          buttonColor,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        branding?: TenantBranding;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || "Could not save branding.");
      if (payload.branding) {
        applyBranding(payload.branding);
        patchEffectiveBrandingCache(queryClient, payload.branding);
      }

      void queryClient.invalidateQueries({ queryKey: EFFECTIVE_BRANDING_QUERY_KEY });
      notifyBrandingUpdated();
      toast.success("Saved! Your team and workers will see the new look.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save branding.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <AccountLoadingSkeleton rows={6} />;
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-6">
        <p className="text-base font-semibold text-[#991B1B]">Could not load branding</p>
        <p className="mt-2 text-sm text-[#B91C1C]">{loadError}</p>
        <button
          type="button"
          onClick={() => void loadBranding()}
          className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#CBD5E1] bg-white px-5 text-sm font-medium text-[#012352] hover:bg-[#F8FAFC]"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Try again
        </button>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <p className="text-base font-semibold text-[#0F172A]">No organization selected</p>
        <p className="mt-2 text-sm text-[#64748B]">
          Switch to your company in the header, then open Settings again.
        </p>
      </div>
    );
  }

  const previewCard = (
    <div className="rounded-lg border border-[#E5E7EB] bg-white p-3.5 xl:sticky xl:top-6">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="flex size-[30px] shrink-0 items-center justify-center rounded-md bg-[#F1F5F9] text-[color:var(--brand-primary)]">
          <ImageIcon className="size-[18px]" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold text-[#101828]">Preview</p>
          <p className="text-xs text-[#6B7280]">Live preview of login and signup styling.</p>
        </div>
      </div>
      <div className="mb-3 flex gap-1 rounded-md bg-[#F1F5F9] p-1">
        {(["login", "signup"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setPreviewMode(mode)}
            className={`flex-1 cursor-pointer rounded px-2 py-1.5 text-xs font-medium transition ${
              previewMode === mode
                ? "bg-white text-[color:var(--brand-primary)] shadow-sm"
                : "text-[#64748B] hover:text-[#012352]"
            }`}
          >
            {mode === "login" ? "Login" : "Signup"}
          </button>
        ))}
      </div>
      <BrandingAuthPreview branding={preview} mode={previewMode} />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold leading-7 tracking-tight text-[#101828]">Branding</h1>
        <p className="mt-1 text-sm leading-5 text-[#6B7280]">Customized your branding.</p>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-[#E5E7EB]">
        {BRANDING_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-[1.5px] px-3 pb-2.5 pt-1 text-sm transition-colors ${
                active
                  ? "border-[color:var(--brand-primary)] text-[color:var(--brand-primary)]"
                  : "border-transparent text-[#012352] hover:text-[color:var(--brand-primary)]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {error ? <AccountErrorBanner message={error} /> : null}

      {activeTab === "hiring-journey" ? (
        <HireJourneyThemePanel />
      ) : (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(240px,280px)] xl:items-start">
        <div className="min-w-0 space-y-5">
          {activeTab === "logo" ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-[#101828]">Company Logo</h2>
                <p className="mt-0.5 text-xs text-[#6B7280]">
                  Upload your company logo and optional login/signup variants.
                </p>
              </div>
              <div className="space-y-3">
                <LogoUploadBlock
                  label="Company logo"
                  hint="Used in the app shell and as a fallback. PNG, JPG, WEBP, or SVG. Max 2 MB."
                  previewSrc={logoPreview || logoUrl}
                  selectedFile={logoFile}
                  onFileChange={setLogoFile}
                />
                <LogoUploadBlock
                  label="Login page logo"
                  hint="Shown on worker and recruiter sign-in. Falls back to company logo."
                  previewSrc={loginLogoPreview || loginLogoUrl || logoPreview || logoUrl}
                  selectedFile={loginLogoFile}
                  onFileChange={setLoginLogoFile}
                />
                <LogoUploadBlock
                  label="Sign up page logo"
                  hint="Shown on tenant signup. Falls back to company logo."
                  previewSrc={signupLogoPreview || signupLogoUrl || logoPreview || logoUrl}
                  selectedFile={signupLogoFile}
                  onFileChange={setSignupLogoFile}
                />
                <LogoUploadBlock
                  label="Favicon"
                  hint="Small icon shown in the browser tab, sidebar, header, and applicant portal. Square image works best."
                  previewSrc={faviconPreview || faviconUrl || logoPreview || logoUrl}
                  selectedFile={faviconFile}
                  onFileChange={setFaviconFile}
                />
              </div>
            </div>
          ) : null}

          {activeTab === "backgrounds" ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-[#101828]">Backgrounds</h2>
                <p className="mt-0.5 text-xs text-[#6B7280]">Backgrounds for logins and signup styling</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-[#E5E7EB] bg-white p-4">
                  <p className="text-sm font-semibold text-[#101828]">Background Login</p>
                  <div className="mt-3 space-y-3">
                    <div className="overflow-hidden rounded-md border border-[#E5E7EB] bg-[#F8FAFC]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={backgroundPreview || loginBackgroundSrc}
                        alt=""
                        className="h-[180px] w-full object-cover"
                      />
                    </div>
                    <FieldBlock label="Image URL">
                      <input
                        value={loginBackgroundSrc}
                        onChange={(event) => setLoginBackgroundSrc(event.target.value)}
                        placeholder="/images/singup-bg-image.jpg"
                        className="h-10 w-full rounded-md border border-[#CBD5E1] px-3 text-sm text-[#0F172A] outline-none focus:border-[color:var(--brand-primary)]"
                      />
                    </FieldBlock>
                    <div className="flex gap-2">
                      <label className="inline-flex h-[30px] flex-1 cursor-pointer items-center justify-center rounded-md border border-[#012352] bg-white text-xs font-medium text-[#012352]">
                        Choose file
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(event) => setBackgroundFile(event.target.files?.[0] ?? null)}
                          className="sr-only"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setBackgroundFile(null);
                          setLoginBackgroundSrc(currentBranding.loginBackgroundSrc);
                        }}
                        className="inline-flex h-[30px] flex-1 items-center justify-center rounded-md bg-[#012352] px-3 text-xs font-medium text-white"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-[#E5E7EB] bg-white p-4">
                  <p className="text-sm font-semibold text-[#101828]">Background Sign up</p>
                  <p className="mt-1 text-xs text-[#6B7280]">
                    Uses the same background as login for now.
                  </p>
                  <div className="mt-3 overflow-hidden rounded-md border border-[#E5E7EB] bg-[#F8FAFC]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={backgroundPreview || loginBackgroundSrc}
                      alt=""
                      className="h-[180px] w-full object-cover"
                    />
                  </div>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FieldBlock label="Login headline">
                  <input
                    value={headline}
                    onChange={(event) => setHeadline(event.target.value)}
                    placeholder={`Welcome to ${currentBranding.companyName}`}
                    className="h-10 w-full rounded-md border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[color:var(--brand-primary)]"
                  />
                </FieldBlock>
                <FieldBlock label="Login subheadline">
                  <input
                    value={subtitle}
                    onChange={(event) => setSubtitle(event.target.value)}
                    className="h-10 w-full rounded-md border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[color:var(--brand-primary)]"
                  />
                </FieldBlock>
                <FieldBlock label="Signup headline">
                  <input
                    value={signupHeadline}
                    onChange={(event) => setSignupHeadline(event.target.value)}
                    className="h-10 w-full rounded-md border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[color:var(--brand-primary)]"
                  />
                </FieldBlock>
                <FieldBlock label="Signup subheadline">
                  <input
                    value={signupSubheadline}
                    onChange={(event) => setSignupSubheadline(event.target.value)}
                    className="h-10 w-full rounded-md border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[color:var(--brand-primary)]"
                  />
                </FieldBlock>
                <FieldBlock label="Button text">
                  <input
                    value={buttonText}
                    onChange={(event) => setButtonText(event.target.value)}
                    className="h-10 w-full rounded-md border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[color:var(--brand-primary)]"
                  />
                </FieldBlock>
                <BrandingColorField
                  label="Button color"
                  value={buttonColor}
                  defaultValue={primaryHex}
                  onChange={setButtonColor}
                />
              </div>
            </div>
          ) : null}

          {activeTab === "colors" ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-[#101828]">Colors</h2>
                <p className="mt-0.5 text-xs text-[#6B7280]">Set your brand palette for login and app accents.</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-[#101828]">Quick presets</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {BRAND_COLOR_PRESETS.map((preset) => {
                    const active = isPresetActive(preset, primaryHex, secondaryHex, accentHex);
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setPrimaryHex(preset.primary);
                          setSecondaryHex(preset.secondary);
                          setAccentHex(preset.accent);
                          setButtonColor(preset.primary);
                        }}
                        aria-pressed={active}
                        className={`relative cursor-pointer rounded-lg p-4 text-left transition ${
                          active
                            ? "border-2 bg-white shadow-sm"
                            : "border border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#94A3B8]"
                        }`}
                        style={active ? { borderColor: "var(--brand-primary)" } : undefined}
                      >
                        {active ? (
                          <span
                            className="absolute right-3 top-3 text-xs font-semibold text-[color:var(--brand-primary)]"
                          >
                            Active
                          </span>
                        ) : null}
                        <div className="flex gap-2">
                          <span
                            className="h-7 w-7 rounded-full border border-black/10"
                            style={{ backgroundColor: preset.primary }}
                          />
                          <span
                            className="h-7 w-7 rounded-full border border-black/10"
                            style={{ backgroundColor: preset.secondary }}
                          />
                          <span
                            className="h-7 w-7 rounded-full border border-black/10"
                            style={{ backgroundColor: preset.accent }}
                          />
                        </div>
                        <p className="mt-2 text-sm font-semibold text-[#0F172A]">{preset.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <BrandingColorField
                  label="Primary color"
                  value={primaryHex}
                  defaultValue={BRAAS_PRIMARY}
                  onChange={setPrimaryHex}
                />
                <BrandingColorField
                  label="Second color"
                  value={secondaryHex}
                  defaultValue={BRAAS_SECONDARY}
                  onChange={setSecondaryHex}
                />
                <BrandingColorField
                  label="Accent color"
                  value={accentHex}
                  defaultValue={BRAAS_ACCENT}
                  onChange={setAccentHex}
                />
              </div>
            </div>
          ) : null}

          {activeTab === "typography" ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-[#101828]">Typography</h2>
                <p className="mt-0.5 text-xs text-[#6B7280]">
                  Fonts and text colors for auth and applicant-facing pages.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <FontSelect label="Primary font" value={primaryFontId} onChange={setPrimaryFontId} />
                <FontSelect label="Heading font" value={headingFontId} onChange={setHeadingFontId} />
                <FontSelect label="Body font" value={bodyFontId} onChange={setBodyFontId} />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <BrandingColorField
                  label="Body text color"
                  value={fontColor}
                  defaultValue={DEFAULT_FONT_COLOR}
                  onChange={setFontColor}
                />
                <BrandingColorField
                  label="Heading color"
                  value={headingColor}
                  defaultValue={DEFAULT_HEADING_COLOR}
                  onChange={setHeadingColor}
                />
                <BrandingColorField
                  label="Muted text color"
                  value={mutedTextColor}
                  defaultValue={DEFAULT_MUTED_COLOR}
                  onChange={setMutedTextColor}
                />
              </div>
            </div>
          ) : null}
        </div>

        {previewCard}
      </div>
      )}

      {activeTab !== "hiring-journey" ? (
        <div className="flex items-center justify-end gap-3 border-t border-[#E5E7EB] pt-4">
          <button
            type="button"
            onClick={() => void loadBranding()}
            disabled={saving}
            className="inline-flex h-9 items-center justify-center rounded-md border border-[#012352] bg-white px-4 text-sm font-medium text-[#012352] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-9 items-center justify-center rounded-md bg-[#012352] px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      ) : null}
    </form>
  );
}

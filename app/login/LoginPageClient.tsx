"use client";

import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
// import { FaApple } from "react-icons/fa";
// import { FaXTwitter } from "react-icons/fa6";
// import { FcGoogle } from "react-icons/fc";
import { PasswordVisibilityToggle } from "@/app/components/PasswordVisibilityToggle";
import { ADMIN_RECRUITER_HOME_ROUTE } from "@/app/admin_recruiter/components/sidebar-config";
import RedirectionProgressModal from "@/app/components/RedirectionProgressModal";
import { TenantBrandingProvider } from "@/app/components/tenant/TenantBrandingContext";
import ClassicTenantLogin from "@/app/login/ClassicTenantLogin";
import { useLoginInitialBranding } from "@/app/login/LoginBrandingBootstrap";
import { LoginBrandHeader, LoginPageShell, interStyle, loginFieldLabelClass, loginFormOptionsStackClass, loginFormStackClass, loginInputClass, loginPageStackClass, loginPasswordInputClass, loginPrimaryButtonClass } from "@/app/login/BraasLoginShell";
import LoginFormError, { loginInputErrorClass } from "@/app/login/LoginFormError";
import LoginOtpStep from "@/app/login/LoginOtpStep";
import { isGodAdminUser } from "@/lib/auth/god-admin";
import { buildForgotPasswordHref } from "@/lib/auth/password-reset-return";
import {
  classifyAuthMessage,
  parseLoginApiError,
  type LoginAuthErrorPayload,
} from "@/lib/auth/login-api-errors";
import {
  formatLoginOtpCooldownMessage,
  LOGIN_OTP_MAX_RESENDS,
  LOGIN_OTP_RESEND_COOLDOWN_SECONDS,
  LOGIN_OTP_TTL_SECONDS,
  parseLoginOtpCooldownSeconds,
} from "@/lib/auth/login-otp-constants";
import { resolveGodAdminClient } from "@/lib/auth/resolve-god-admin-client";
import { isNexusPlatformUser, isPlatformEnforcementEnabled } from "@/lib/auth/platform-shared";
import { isRecruiterSignInRole } from "@/lib/auth/recruiter-sign-in";
import {
  persistOnboardingSlugCookie,
} from "@/lib/tenant/client-onboarding-slug";
import { getClientTenantHostLabel } from "@/lib/tenant/client-host-subdomain";
import {
  buildTenantBrandingApiUrl,
  resolveTenantSlugForClient,
} from "@/lib/tenant/resolve-tenant-context";
import {
  readHostnameScopedItem,
  removeHostnameScopedItem,
  writeHostnameScopedItem,
} from "@/lib/tenant/scoped-storage";
import {
  readCachedTenantBranding,
  writeCachedTenantBranding,
} from "@/lib/tenant/client-branding-cache";
import {
  brandingFallbackForSlug,
  brandingAuthButtonStyle,
  brandingShellGradient,
  isTenantApplicantPortalSlug,
  PLATFORM_DEFAULT_TENANT_SLUG,
  usesBraasFigmaLoginUi,
  type TenantBranding,
} from "@/lib/tenant/tenant-branding";
import { supabaseBrowser } from "@/lib/supabase-browser";
import {
  clearAdminLoginDraft,
  readAdminLoginDraft,
  writeAdminLoginDraft,
} from "@/lib/auth/admin-login-draft";

const checkboxActiveClass =
  "border-[color:var(--brand-secondary)] bg-[color:var(--brand-secondary)]";

function primaryButtonStyle(enabled: boolean): React.CSSProperties | undefined {
  return brandingAuthButtonStyle(enabled);
}

function FieldLabel({ children }: { children: string }) {
  return (
    <label className={loginFieldLabelClass} style={interStyle}>
      {children}
      <span className="ml-1 text-[#e11d48]">*</span>
    </label>
  );
}

type PendingLogin = {
  email: string;
  password: string;
  rememberMe: boolean;
};

type RecruiterOnboardingStatusResponse = {
  userId: string;
  role: string | null;
  activeTenantId: string | null;
  requestedTenantId: string | null;
  validTenantAccess: boolean;
  tenantOnboardingCompleted: boolean;
  tenantSubdomain: string | null;
  redirectTarget: "/godadmin/tenants" | typeof ADMIN_RECRUITER_HOME_ROUTE | "/tenant-onboarding";
  redirectUrl?: string;
};

type LoginStep = "credentials" | "otp";

const OTP_SUCCESS_REDIRECT_DELAY_MS = 900;

function LoginLoadingShell({ brand }: { brand?: TenantBranding | null }) {
  if (brand) {
    return (
      <div
        className="min-h-screen"
        style={{ background: brandingShellGradient(brand) }}
        aria-hidden="true"
      />
    );
  }
  return <div className="min-h-screen bg-white" aria-hidden="true" />;
}

/*
function SocialButton({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex h-[40px] w-[40px] items-center justify-center rounded-[8px] border border-[#e5e7eb] bg-white text-[18px] text-black transition hover:bg-[#f8fafc]"
    >
      {children}
    </button>
  );
}
*/

function LoginPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const serverBranding = useLoginInitialBranding();
  const tenantQuery = searchParams.get("tenant");
  const roleQuery = searchParams.get("role");
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const recruiterSignIn =
    isRecruiterSignInRole(roleQuery) || isAdminRoute;
  const useClassicRecruiterLogin =
    isAdminRoute || (recruiterSignIn && Boolean(tenantQuery?.trim()));
  const useBraasUi = usesBraasFigmaLoginUi(tenantQuery) && !useClassicRecruiterLogin;
  const [step, setStep] = useState<LoginStep>("credentials");
  const [showRedirecting, setShowRedirecting] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpResendCount, setOtpResendCount] = useState(0);
  const [otpMaxResends, setOtpMaxResends] = useState(LOGIN_OTP_MAX_RESENDS);
  const [otpExpiresInSeconds, setOtpExpiresInSeconds] = useState(LOGIN_OTP_TTL_SECONDS);
  const [otpResendCooldownSeconds, setOtpResendCooldownSeconds] = useState(LOGIN_OTP_RESEND_COOLDOWN_SECONDS);
  const cooldownExpiresAtRef = useRef<number | null>(null);
  const [pendingLogin, setPendingLogin] = useState<PendingLogin | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState<LoginAuthErrorPayload | null>(null);
  const [brand, setBrand] = useState<TenantBranding | null>(serverBranding);
  const [brandLoaded, setBrandLoaded] = useState(Boolean(serverBranding));
  const [form, setForm] = useState({
    email: "",
    password: "",
    rememberMe: false,
    agree: false,
  });
  const [draftHydrated, setDraftHydrated] = useState(false);

  useEffect(() => {
    if (!serverBranding) return;
    setBrand(serverBranding);
    setBrandLoaded(true);
    writeCachedTenantBranding(serverBranding);
  }, [serverBranding]);

  useEffect(() => {
    if (serverBranding) return;

    let alive = true;
    void (async () => {
      const resolved = resolveTenantSlugForClient(
        typeof window !== "undefined" ? window.location.search : "",
        {
          path: isAdminRoute ? "/admin" : "/login",
        }
      );
      const hostLabel = getClientTenantHostLabel();
      const qpRaw = searchParams.get("tenant")?.trim().toLowerCase();
      const qp = qpRaw != null && qpRaw.length >= 2 ? qpRaw : null;

      const applicantPortalSlug =
        resolved.slug && isTenantApplicantPortalSlug(resolved.slug)
          ? resolved.slug
          : hostLabel && isTenantApplicantPortalSlug(hostLabel)
            ? hostLabel
            : null;

      if (recruiterSignIn && qp) {
        persistOnboardingSlugCookie(qp);
      } else if (applicantPortalSlug) {
        persistOnboardingSlugCookie(applicantPortalSlug);
      } else if (qp) {
        persistOnboardingSlugCookie(qp);
      }

      const brandingResolved =
        recruiterSignIn && qp
          ? {
              ...resolved,
              slug: qp,
              subdomainLabel: hostLabel ?? qp,
              isRootDomain: resolved.isRootDomain,
            }
          : applicantPortalSlug
            ? { ...resolved, slug: applicantPortalSlug, subdomainLabel: hostLabel ?? resolved.subdomainLabel }
            : resolved.isRootDomain && !applicantPortalSlug
              ? { ...resolved, slug: null, subdomainLabel: null, isRootDomain: true }
              : resolved;

      const brandingSlug =
        applicantPortalSlug ?? (recruiterSignIn ? qp : null) ?? (resolved.isRootDomain ? PLATFORM_DEFAULT_TENANT_SLUG : null);

      try {
        const res = await fetch(buildTenantBrandingApiUrl(brandingResolved), {
          cache: "no-store",
          signal: AbortSignal.timeout(12_000),
        });
        const payload = (await res.json()) as { branding?: TenantBranding };
        if (alive && payload.branding) {
          setBrand(payload.branding);
          writeCachedTenantBranding(payload.branding);
        } else if (alive) {
          setBrand((current) => current ?? brandingFallbackForSlug(brandingSlug));
        }
      } catch {
        if (alive) {
          setBrand((current) => current ?? brandingFallbackForSlug(brandingSlug));
        }
      } finally {
        if (alive) setBrandLoaded(true);
      }
    })();
    const safetyTimer = window.setTimeout(() => {
      if (alive) {
        setBrand((current) => {
          if (current) return current;
          const slug = tenantQuery?.trim().toLowerCase() || PLATFORM_DEFAULT_TENANT_SLUG;
          return brandingFallbackForSlug(slug);
        });
        setBrandLoaded(true);
      }
    }, 15_000);
    return () => {
      alive = false;
      window.clearTimeout(safetyTimer);
    };
  }, [tenantQuery, roleQuery, pathname, recruiterSignIn, isAdminRoute, serverBranding]);

  useEffect(() => {
    const previousHtmlBg = document.documentElement.style.backgroundColor;
    const previousBodyBg = document.body.style.backgroundColor;

    if (useBraasUi) {
      document.documentElement.style.backgroundColor = "#ffffff";
      document.body.style.backgroundColor = "#ffffff";
    } else if (brand?.primaryHex) {
      document.documentElement.style.backgroundColor = brand.primaryHex;
      document.body.style.backgroundColor = brand.primaryHex;
    } else {
      document.documentElement.style.backgroundColor = "";
      document.body.style.backgroundColor = "";
    }

    if (useBraasUi) {
      try {
        const savedEmail = readHostnameScopedItem("braasLoginEmail");
        if (savedEmail) {
          setForm((prev) => ({ ...prev, email: savedEmail, rememberMe: true }));
        }
      } catch {
        /* ignore storage errors */
      }
    }

    return () => {
      document.documentElement.style.backgroundColor = previousHtmlBg;
      document.body.style.backgroundColor = previousBodyBg;
    };
  }, [useBraasUi, brand?.primaryHex]);

  useLayoutEffect(() => {
    if (useBraasUi) {
      setDraftHydrated(true);
      return;
    }

    const tenantSlug =
      searchParams.get("tenant")?.trim().toLowerCase() || brand?.slug || null;
    const draft = readAdminLoginDraft(tenantSlug);
    if (draft) {
      setForm({
        email: draft.email,
        password: draft.password,
        agree: draft.agree,
        rememberMe: draft.rememberMe,
      });
    } else {
      try {
        const savedEmail = readHostnameScopedItem("braasLoginEmail");
        if (savedEmail) {
          setForm((prev) => ({ ...prev, email: savedEmail, rememberMe: true }));
        }
      } catch {
        /* ignore storage errors */
      }
    }
    setDraftHydrated(true);
  }, [useBraasUi, searchParams, brand?.slug]);

  useLayoutEffect(() => {
    if (useBraasUi || !draftHydrated || showRedirecting) return;

    const tenantSlug =
      searchParams.get("tenant")?.trim().toLowerCase() || brand?.slug || null;
    writeAdminLoginDraft({
      tenantSlug,
      email: form.email,
      password: form.password,
      agree: form.agree,
      rememberMe: form.rememberMe,
    });
  }, [
    useBraasUi,
    draftHydrated,
    showRedirecting,
    searchParams,
    brand?.slug,
    form.email,
    form.password,
    form.agree,
    form.rememberMe,
  ]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("error=")) {
      const path = window.location.pathname + window.location.search;
      window.history.replaceState(null, "", path);
    }
  }, []);

  useEffect(() => {
    const q = searchParams.get("error");
    if (q === "platform") {
      setAuthError({
        error: "This account is not authorized for this platform.",
        code: "UNKNOWN",
        field: null,
      });
    } else if (q === "idle") {
      setAuthError({
        error: "You were signed out after 2 hours of inactivity. Please sign in again.",
        code: "UNKNOWN",
        field: null,
      });
    }
  }, [searchParams]);

  const clearAuthError = () => {
    cooldownExpiresAtRef.current = null;
    setAuthError(null);
  };

  useEffect(() => {
    if (!authError || authError.code !== "RATE_LIMIT") {
      cooldownExpiresAtRef.current = null;
      return;
    }
    const isCooldown = authError.error.toLowerCase().includes("wait for the timer");
    if (!isCooldown) {
      cooldownExpiresAtRef.current = null;
      return;
    }

    if (!cooldownExpiresAtRef.current) {
      const initialSeconds =
        typeof authError.retryAfterSec === "number" && authError.retryAfterSec > 0
          ? authError.retryAfterSec
          : parseLoginOtpCooldownSeconds(authError.error) ?? LOGIN_OTP_RESEND_COOLDOWN_SECONDS;
      cooldownExpiresAtRef.current = Date.now() + initialSeconds * 1000;
    }

    const interval = window.setInterval(() => {
      if (!cooldownExpiresAtRef.current) return;
      const msLeft = cooldownExpiresAtRef.current - Date.now();
      const sLeft = Math.ceil(msLeft / 1000);
      if (sLeft <= 0) {
        cooldownExpiresAtRef.current = null;
        window.clearInterval(interval);
        setAuthError(null);
        return;
      }
      const nextMsg = formatLoginOtpCooldownMessage(sLeft);
      setAuthError((prev) => {
        if (!prev) return null;
        if (prev.error === nextMsg && prev.retryAfterSec === sLeft) return prev;
        return { ...prev, error: nextMsg, retryAfterSec: sLeft };
      });
    }, 500);

    return () => window.clearInterval(interval);
  }, [
    authError?.code,
    authError?.error.toLowerCase().includes("wait for the timer") ? "cooldown" : "none",
  ]);

  const emailHasError =
    authError?.field === "email" ||
    authError?.code === "INVALID_CREDENTIALS" ||
    authError?.code === "EMAIL_NOT_CONFIRMED";
  const passwordHasError =
    authError?.field === "password" || authError?.code === "INVALID_CREDENTIALS";

  const canSubmit = useMemo(() => {
    return form.email.trim().length > 0 && form.password.length > 0;
  }, [form.email, form.password]);

  const finishAuthenticatedSession = async (
    login: PendingLogin,
    options?: { godAdmin?: boolean }
  ) => {
    try {
      if (login.rememberMe) {
        writeHostnameScopedItem("braasLoginEmail", login.email);
      } else {
        removeHostnameScopedItem("braasLoginEmail");
      }
    } catch {
      /* ignore storage errors */
    }
    clearAdminLoginDraft();

    const { data: userData } = await supabaseBrowser.auth.getUser();
    const godAdmin =
      options?.godAdmin === true ||
      isGodAdminUser(userData.user) ||
      (await resolveGodAdminClient(userData.user));

    if (
      isPlatformEnforcementEnabled() &&
      (!userData.user || (!isNexusPlatformUser(userData.user) && !godAdmin))
    ) {
      await supabaseBrowser.auth.signOut();
      setShowRedirecting(false);
      setOtpVerified(false);
      setStep("credentials");
      setAuthError({
        error: "This account is not authorized for this platform.",
        code: "UNKNOWN",
        field: null,
      });
      return false;
    }

    const tenantSlug =
      searchParams.get("tenant")?.trim().toLowerCase() ||
      getClientTenantHostLabel()?.trim().toLowerCase() ||
      "";
    if (tenantSlug && tenantSlug.length >= 2) {
      persistOnboardingSlugCookie(tenantSlug);
      if (godAdmin) {
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        await fetch("/api/admin/view-as-tenant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {}),
          },
          body: JSON.stringify({ slug: tenantSlug }),
        });
      }
    }

    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
    const statusParams = new URLSearchParams();
    if (tenantSlug && tenantSlug.length >= 2) {
      statusParams.set("tenant", tenantSlug);
    }
    const statusRes = await fetch(
      `/api/auth/recruiter-onboarding-status${
        statusParams.toString() ? `?${statusParams.toString()}` : ""
      }`,
      {
        cache: "no-store",
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      }
    );

    if (!statusRes.ok) {
      let message = "Could not verify onboarding status. Try again.";
      let code: LoginAuthErrorPayload["code"] = "UNKNOWN";
      if (statusRes.status === 403) {
        try {
          const body = (await statusRes.clone().json()) as { detail?: string; error?: string };
          const detail = (body.detail || body.error || "").toLowerCase();
          if (detail.includes("staff role")) {
            message =
              "This account does not have admin access. Use a recruiter or admin account.";
            code = "STAFF_ROLE_REQUIRED";
          } else if (detail.includes("set your password") || detail.includes("invitation email")) {
            message = "Set your password using the invitation email before signing in.";
            code = "PASSWORD_SETUP_REQUIRED";
          } else {
            message = "This account does not have access to the selected tenant.";
            code = "TENANT_ACCESS_DENIED";
          }
        } catch {
          message =
            "This account does not have admin access. Use a recruiter or admin account.";
          code = "STAFF_ROLE_REQUIRED";
        }
      }
      setShowRedirecting(false);
      setOtpVerified(false);
      // Access denial belongs on the credentials screen — not after OTP.
      setStep("credentials");
      setPendingLogin(null);
      setAuthError({
        error: message,
        code,
        field: null,
      });
      return false;
    }

    const onboardingStatus = (await statusRes.json()) as RecruiterOnboardingStatusResponse;
    if (onboardingStatus.tenantSubdomain) {
      persistOnboardingSlugCookie(onboardingStatus.tenantSubdomain);
    }
    console.info("[login] recruiter redirect", {
      userId: onboardingStatus.userId,
      role: onboardingStatus.role,
      activeTenantId: onboardingStatus.activeTenantId,
      requestedTenantId: onboardingStatus.requestedTenantId,
      tenantOnboardingCompleted: onboardingStatus.tenantOnboardingCompleted,
      tenantSubdomain: onboardingStatus.tenantSubdomain,
      redirectTarget: onboardingStatus.redirectTarget,
      redirectUrl: onboardingStatus.redirectUrl,
    });

    const destination = onboardingStatus.redirectUrl ?? onboardingStatus.redirectTarget;
    if (/^https?:\/\//i.test(destination)) {
      window.location.assign(destination);
    } else {
      router.push(destination);
      router.refresh();
    }
    return true;
  };

  const sendLoginOtp = async (login: PendingLogin) => {
    const tenantSlug =
      searchParams.get("tenant")?.trim().toLowerCase() ||
      getClientTenantHostLabel()?.trim().toLowerCase() ||
      "";
    const res = await fetch("/api/auth/login-otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: login.email,
        password: login.password,
        purpose: recruiterSignIn ? "staff" : "worker",
        ...(tenantSlug.length >= 2 ? { tenant: tenantSlug } : {}),
      }),
    });
    if (!res.ok) {
      throw await parseLoginApiError(res);
    }
    return (await res.json()) as {
      godAdmin?: boolean;
      requiresOtp?: boolean;
      resendCount?: number;
      maxResends?: number;
      expiresInSeconds?: number;
      resendAvailableInSeconds?: number;
    };
  };

  const applyOtpSendMeta = (gate: {
    resendCount?: number;
    maxResends?: number;
    expiresInSeconds?: number;
    resendAvailableInSeconds?: number;
  }) => {
    if (typeof gate.resendCount === "number") {
      setOtpResendCount(gate.resendCount);
    }
    if (typeof gate.maxResends === "number") {
      setOtpMaxResends(gate.maxResends);
    }
    if (typeof gate.expiresInSeconds === "number") {
      setOtpExpiresInSeconds(gate.expiresInSeconds);
    }
    if (typeof gate.resendAvailableInSeconds === "number") {
      setOtpResendCooldownSeconds(gate.resendAvailableInSeconds);
    }
  };

  const submitCredentialsForOtp = async (login: PendingLogin) => {
    clearAuthError();
    setOtpVerified(false);
    setOtpResendCount(0);
    setShowRedirecting(false);
    setSubmitting(true);
    try {
      const gate = await sendLoginOtp(login);
      setPendingLogin(login);
      applyOtpSendMeta(gate);

      if (gate.godAdmin) {
        const { error: signInError } = await supabaseBrowser.auth.signInWithPassword({
          email: login.email,
          password: login.password,
        });
        if (signInError) {
          setAuthError(classifyAuthMessage(signInError.message));
          setSubmitting(false);
          return;
        }
        const ok = await finishAuthenticatedSession(login, { godAdmin: true });
        setSubmitting(false);
        if (!ok) return;
        return;
      }

      if (gate.requiresOtp) {
        setStep("otp");
        setSubmitting(false);
        return;
      }

      setAuthError({
        error: "Login could not continue. Try again.",
        code: "UNKNOWN",
        field: null,
      });
      setSubmitting(false);
    } catch (e) {
      if (e && typeof e === "object" && "error" in e && "code" in e) {
        setAuthError(e as LoginAuthErrorPayload);
      } else {
        setAuthError(classifyAuthMessage(e instanceof Error ? e.message : undefined));
      }
      setSubmitting(false);
    }
  };

  const handleCredentialsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    const login: PendingLogin = {
      email: form.email.trim().toLowerCase(),
      password: form.password,
      rememberMe: form.rememberMe,
    };
    await submitCredentialsForOtp(login);
  };

  const completeLogin = async (credentials?: PendingLogin) => {
    const login = credentials ?? pendingLogin;
    if (!login) return;

    setSubmitting(true);
    clearAuthError();

    const assertRes = await fetch("/api/auth/login-otp/assert-verified", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: login.email }),
    });
    if (!assertRes.ok) {
      setShowRedirecting(false);
      setOtpVerified(false);
      setStep("otp");
      setAuthError(await parseLoginApiError(assertRes));
      setSubmitting(false);
      return;
    }

    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();

    const sessionUser = session?.user;
    const sessionEmail = sessionUser?.email?.trim().toLowerCase() ?? "";
    const sessionIsAnonymous =
      (sessionUser as { is_anonymous?: boolean } | undefined)?.is_anonymous === true;
    const needsPasswordSignIn =
      !sessionUser || sessionIsAnonymous || sessionEmail !== login.email;

    if (needsPasswordSignIn) {
      if (sessionUser && (sessionIsAnonymous || sessionEmail !== login.email)) {
        await supabaseBrowser.auth.signOut();
      }
      const { error: signInError } = await supabaseBrowser.auth.signInWithPassword({
        email: login.email,
        password: login.password,
      });

      if (signInError) {
        setShowRedirecting(false);
        setOtpVerified(false);
        setStep(step === "otp" ? "otp" : "credentials");
        setAuthError(classifyAuthMessage(signInError.message));
        setSubmitting(false);
        return;
      }
    }

    const ok = await finishAuthenticatedSession(login);
    if (!ok) {
      setShowRedirecting(false);
      setOtpVerified(false);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
  };

  const handleOtpSendAgain = async () => {
    const login = pendingLogin;
    if (!login) return;
    clearAuthError();
    setOtpVerified(false);
    try {
      const gate = await sendLoginOtp(login);
      applyOtpSendMeta(gate);
    } catch (e) {
      if (e && typeof e === "object" && "error" in e && "code" in e) {
        setAuthError(e as LoginAuthErrorPayload);
      } else {
        setAuthError(classifyAuthMessage(e instanceof Error ? e.message : undefined));
      }
      throw e;
    }
  };

  const handleOtpVerify = async (code: string) => {
    const login = pendingLogin;
    if (!login) return;

    setSubmitting(true);
    setOtpVerified(false);
    clearAuthError();

    const res = await fetch("/api/auth/login-otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: login.email, code }),
    });

    if (!res.ok) {
      setAuthError(await parseLoginApiError(res));
      setSubmitting(false);
      return;
    }

    setOtpVerified(true);
    setSubmitting(false);

    await new Promise((resolve) => window.setTimeout(resolve, OTP_SUCCESS_REDIRECT_DELAY_MS));
    setShowRedirecting(true);
    await completeLogin();
  };

  const handleClassicSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.email.trim() || !form.password) return;
    void submitCredentialsForOtp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      rememberMe: form.rememberMe,
    });
  };

  if (!brandLoaded || !brand) {
    return <LoginLoadingShell brand={serverBranding} />;
  }

  if (!useBraasUi) {
    return (
      <TenantBrandingProvider branding={brand}>
        {showRedirecting ? <RedirectionProgressModal /> : null}
        <ClassicTenantLogin
          brand={brand}
          form={form}
          showPassword={showPassword}
          submitting={submitting}
          error={authError?.error ?? null}
          otpStep={step === "otp" && pendingLogin != null}
          otpEmail={pendingLogin?.email ?? ""}
          otpVerified={otpVerified}
          otpAuthError={authError}
          otpResendCount={otpResendCount}
          otpMaxResends={otpMaxResends}
          otpExpiresInSeconds={otpExpiresInSeconds}
          otpResendCooldownSeconds={otpResendCooldownSeconds}
          onOtpClearError={clearAuthError}
          onOtpVerify={handleOtpVerify}
          onOtpSendAgain={handleOtpSendAgain}
          onFormChange={(patch) => {
            clearAuthError();
            setForm((prev) => ({ ...prev, ...patch }));
          }}
          onTogglePassword={() => setShowPassword((current) => !current)}
          onSubmit={handleClassicSubmit}
          forgotReturnTo="/admin"
        />
      </TenantBrandingProvider>
    );
  }

  return (
    <>
      <LoginPageShell brand={brand} hideArtOnMobile>
        {showRedirecting ? <RedirectionProgressModal /> : null}
        <LoginBrandHeader brand={brand} />

        {step === "otp" && pendingLogin ? (
          <LoginOtpStep
            email={pendingLogin.email}
            submitting={submitting}
            verified={otpVerified}
            authError={authError}
            resendCount={otpResendCount}
            maxResends={otpMaxResends}
            expiresInSeconds={otpExpiresInSeconds}
            resendCooldownSeconds={otpResendCooldownSeconds}
            onClearError={clearAuthError}
            onVerify={handleOtpVerify}
            onSendAgain={handleOtpSendAgain}
          />
        ) : (
          <form onSubmit={handleCredentialsSubmit} className={loginPageStackClass}>
            <div>
              <h1
                className="text-[22px] font-semibold leading-[30px] tracking-normal sm:text-[30px] sm:leading-[36px]"
                style={{ color: "var(--brand-heading)", fontFamily: "var(--brand-font-heading)" }}
              >
                {brand.headline}
              </h1>
              <p
                className="mt-1 text-[14px] font-normal leading-[20px] sm:mt-[8px] sm:text-[16px] sm:leading-[24px]"
                style={{ color: "var(--brand-muted)", fontFamily: "var(--brand-font-body)" }}
              >
                {brand.subtitle}
              </p>
            </div>

            <div className={loginFormStackClass}>
              <div>
                <FieldLabel>Email</FieldLabel>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={(event) => {
                    clearAuthError();
                    setForm((prev) => ({ ...prev, email: event.target.value }));
                  }}
                  placeholder="Email"
                  autoComplete="email"
                  aria-invalid={emailHasError}
                  className={`${loginInputClass} ${emailHasError ? loginInputErrorClass : ""}`}
                  required
                />
              </div>

              <div>
                <FieldLabel>Password</FieldLabel>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(event) => {
                      clearAuthError();
                      setForm((prev) => ({ ...prev, password: event.target.value }));
                    }}
                    placeholder="Password"
                    autoComplete="current-password"
                    aria-invalid={passwordHasError}
                    className={`${loginPasswordInputClass} ${passwordHasError ? loginInputErrorClass : ""}`}
                    required
                  />
                  <PasswordVisibilityToggle
                    visible={showPassword}
                    onToggle={() => setShowPassword((current) => !current)}
                  />
                </div>
              </div>

              <div className={loginFormOptionsStackClass}>
                <div className="flex items-center justify-between gap-3">
                  <label
                    className="flex cursor-pointer items-center gap-2 text-[13px] font-normal leading-[18px] text-[#374151] sm:gap-[8px] sm:text-[14px] sm:leading-[20px]"
                    style={interStyle}
                  >
                    <span
                      className={`relative flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[6px] border ${
                        form.rememberMe ? checkboxActiveClass : "border-[#e2e8f0] bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form.rememberMe}
                        onChange={(event) => setForm((prev) => ({ ...prev, rememberMe: event.target.checked }))}
                        className="absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
                        aria-label="Remember me"
                      />
                      {form.rememberMe ? <Check className="h-[14px] w-[14px] text-white" strokeWidth={3} /> : null}
                    </span>
                    Remember Me
                  </label>
                  <Link
                    href={buildForgotPasswordHref({
                      returnTo: "/admin",
                      tenant: tenantQuery?.trim().toLowerCase() || brand.slug,
                    })}
                    className="text-[14px] font-normal leading-[20px] hover:underline"
                    style={{ ...interStyle, color: "var(--brand-secondary)" }}
                  >
                    Forgot Password?
                  </Link>
                </div>
              </div>

              {authError ? <LoginFormError message={authError.error} code={authError.code} /> : null}

              <button
                type="submit"
                disabled={!canSubmit || submitting}
                className={loginPrimaryButtonClass}
                style={primaryButtonStyle(canSubmit && !submitting)}
              >
                {submitting ? "Logging in..." : brand.buttonText}
              </button>

              {!recruiterSignIn && !tenantQuery ? (
                <p className="text-center text-[14px] font-normal leading-[20px] text-[#374151]" style={interStyle}>
                  Don&apos;t have an Account?{" "}
                  <Link href="/signup" className="font-semibold text-black underline">
                    Sign Up
                  </Link>
                </p>
              ) : null}
            </div>

            {/* Social login — hidden until provider integration is ready
            <div className="flex items-center gap-[14px]">
              <div className="h-px flex-1 bg-[#e7edf4]" />
              <span className="text-[12px] font-normal leading-[16px] text-[#6b7280]" style={interStyle}>
                OR
              </span>
              <div className="h-px flex-1 bg-[#e7edf4]" />
            </div>

            <div className="flex justify-center gap-[15px]">
              <SocialButton label="Continue with Google">
                <FcGoogle />
              </SocialButton>
              <SocialButton label="Continue with Apple">
                <FaApple />
              </SocialButton>
              <SocialButton label="Continue with X">
                <FaXTwitter className="h-[15px] w-[15px]" />
              </SocialButton>
            </div>
            */}
          </form>
        )}
      </LoginPageShell>
    </>
  );
}

export default function LoginPageClient() {
  return (
    <Suspense fallback={<LoginLoadingShell brand={null} />}>
      <LoginPageContent />
    </Suspense>
  );
}

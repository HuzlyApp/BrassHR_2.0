"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import OnboardingLayout from "@/app/components/OnboardingLayout";
import OnboardingStepper from "@/app/components/OnboardingStepper";
import { FirmaSigningIframe } from "@/app/components/onboarding/FirmaSigningIframe";
import {
  E_SIGNATURE_LABEL,
  E_SIGNATURE_USER_ERRORS,
  eSignatureStatusLabel,
  sanitizeESignatureUserMessage,
} from "@/lib/e-signature/user-facing";
import { useOnboardingStepNav } from "@/lib/onboarding/use-onboarding-step-nav";
import { useOnboardingConfigOptional } from "@/app/components/onboarding/OnboardingConfigProvider";
import { useMarkStepInProgressIfPending } from "@/lib/onboarding/use-mark-step-in-progress-if-pending";
import { resolvePostStepContinueRoute } from "@/lib/onboarding/tenant-step-navigation";
import { ensureApplicantWorker } from "@/lib/onboarding/ensure-applicant-worker";
import {
  DRAFT_PREVIEW_APPLICANT_ID,
  isDraftPreviewApplicantId,
  isOnboardingDraftPreview,
} from "@/lib/onboarding/is-draft-preview";
import { CheckCircle2, Download, Eye, RefreshCw } from "lucide-react";
import { isFirmaSigningComplete, stepUsesFirmaSigning } from "@/lib/onboarding/firma-step-settings";
import type { TenantOnboardingStep } from "@/lib/onboarding/types";
import { resolveClientOnboardingTenantSlug } from "@/lib/tenant/client-onboarding-slug";
import { APPLICATION_ROUTES } from "@/lib/onboarding/application-routes";
import { routeForApplicantStep } from "@/lib/onboarding/resolve-applicant-step-route";

type FirmaSessionResponse = {
  session?: {
    signing_request_id: string;
    iframe_url: string | null;
    firma_status: string;
    onboarding_status: string;
    step_title: string;
  };
  error?: string;
  code?: string;
};

function getApplicantId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("applicantId")?.trim() || null;
}

function resolveApplicantId(search: string): string | null {
  const stored = getApplicantId();
  if (stored) return stored;
  if (isOnboardingDraftPreview(search)) return DRAFT_PREVIEW_APPLICANT_ID;
  return null;
}

function resolveFirmaStepContext(
  searchParams: URLSearchParams,
  nav: ReturnType<typeof useOnboardingStepNav>
): { stepKey: string; stepId: string } {
  const urlStepKey = searchParams.get("stepKey")?.trim() ?? "";
  const urlStepId = searchParams.get("stepId")?.trim() ?? "";

  const stepKey =
    urlStepKey ||
    nav.currentStep?.step_key ||
    nav.enabledSteps?.find((step) => stepUsesFirmaSigning(step))?.step_key ||
    "";

  const matchedStep =
    nav.enabledSteps?.find((step) => step.id === urlStepId || step.step_key === stepKey) ??
    nav.currentStep;

  const stepId = urlStepId || matchedStep?.id || "";

  return { stepKey, stepId };
}

function resolveMatchedStep(
  nav: ReturnType<typeof useOnboardingStepNav>,
  stepKey: string,
  stepId: string
): TenantOnboardingStep | null {
  return (
    nav.enabledSteps?.find((step) => step.id === stepId || step.step_key === stepKey) ??
    nav.currentStep
  );
}

function resolveContinueRoute(
  nav: ReturnType<typeof useOnboardingStepNav>,
  stepKey: string,
  stepId: string
): string {
  return resolvePostStepContinueRoute(nav.config, resolveMatchedStep(nav, stepKey, stepId), nav.slug);
}

async function persistFirmaStepCompletion(
  nav: ReturnType<typeof useOnboardingStepNav>,
  input: {
    applicantId: string;
    stepKey: string;
    stepId: string;
    signingRequestId: string | null;
    firmaStatus: string;
  }
): Promise<void> {
  const progressData = {
    signing_provider: "firma",
    signing_request_id: input.signingRequestId,
    firma_status: input.firmaStatus,
  };

  if (nav.updateStepStatus) {
    await nav.updateStepStatus(input.stepKey, "completed", progressData);
    return;
  }

  const progressRes = await fetch("/api/onboarding/progress/step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      applicantId: input.applicantId,
      stepKey: input.stepKey,
      stepId: input.stepId || undefined,
      status: "completed",
      data: progressData,
    }),
  });
  const progressBody = (await progressRes.json().catch(() => ({}))) as { error?: string };
  if (!progressRes.ok) {
    throw new Error(progressBody.error || "Could not save onboarding progress");
  }
}

export default function FirmaSignPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const nav = useOnboardingStepNav();
  const onboarding = useOnboardingConfigOptional();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [signingRequestId, setSigningRequestId] = useState<string | null>(null);
  const [firmaStatus, setFirmaStatus] = useState<string>("draft");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const autoContinuedRef = useRef(false);

  const { stepKey, stepId } = resolveFirmaStepContext(searchParams, nav);
  const matchedStep = resolveMatchedStep(nav, stepKey, stepId);

  // Authorization / Background Check (and other library e-sign steps) use Authorizations &
  // Documents with Click and Sign — don't keep applicants on this standalone embed page.
  useEffect(() => {
    if (nav.configLoading || !matchedStep) return;
    const target = routeForApplicantStep(matchedStep, nav.slug);
    const targetPath = target.split("?")[0];
    if (
      targetPath.includes(APPLICATION_ROUTES.authorizationsDocuments) ||
      targetPath.includes(APPLICATION_ROUTES.agreementSignature)
    ) {
      router.replace(target);
    }
  }, [matchedStep, nav.configLoading, nav.slug, router]);

  useMarkStepInProgressIfPending({
    step: matchedStep,
    disabled: nav.configLoading || loading,
    updateStepStatus: onboarding?.updateStepStatus ?? nav.updateStepStatus,
  });

  useEffect(() => {
    if (nav.configLoading) return;

    let cancelled = false;

    async function bootstrapSigningSession() {
      setLoading(true);
      setError(null);
      setErrorCode(null);

      const applicantId = resolveApplicantId(search);
      if (!applicantId || !stepKey) {
        setError(
          !applicantId
            ? "Missing applicant session. Sign in or start onboarding from the first step."
            : "Missing onboarding step. Open this page from your onboarding checklist or add ?stepKey= to the URL."
        );
        setLoading(false);
        return;
      }

      const isPreview =
        isOnboardingDraftPreview(search) || isDraftPreviewApplicantId(applicantId);

      if (!isPreview) {
        const ensured = await ensureApplicantWorker();
        if (!ensured.ok) {
          if (!cancelled) {
            setError(ensured.error);
            setLoading(false);
          }
          return;
        }
      }

      const tenantSlug =
        nav.slug?.trim() ||
        resolveClientOnboardingTenantSlug(search) ||
        searchParams.get("tenant")?.trim() ||
        "";

      try {
        const query = new URLSearchParams({
          applicantId,
          stepKey,
        });
        if (stepId) query.set("stepId", stepId);
        if (tenantSlug) query.set("tenantSlug", tenantSlug);
        if (isPreview) query.set("preview", "draft");

        const res = await fetch(`/api/onboarding/firma-sign/session?${query.toString()}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as FirmaSessionResponse & { code?: string };
        if (!res.ok) {
          const err = new Error(
            sanitizeESignatureUserMessage(data.error, E_SIGNATURE_USER_ERRORS.sessionOpenFailed)
          ) as Error & {
            code?: string;
          };
          err.code = data.code;
          throw err;
        }
        if (cancelled) return;
        setIframeUrl(data.session?.iframe_url ?? null);
        setSigningRequestId(data.session?.signing_request_id ?? null);
        setFirmaStatus(data.session?.firma_status ?? "draft");
      } catch (err: unknown) {
        if (cancelled) return;
        setError(
          sanitizeESignatureUserMessage(
            err instanceof Error ? err.message : null,
            E_SIGNATURE_USER_ERRORS.sessionOpenFailed
          )
        );
        setErrorCode((err as Error & { code?: string }).code ?? null);
        setIframeUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void bootstrapSigningSession();
    return () => {
      cancelled = true;
    };
  }, [nav.configLoading, nav.slug, nav.enabledSteps, nav.currentStep, search, searchParams, stepKey, stepId]);

  useEffect(() => {
    const applicantId = resolveApplicantId(search);
    if (!applicantId || !stepKey || !signingRequestId || loading || error) return;

    const isPreview =
      isOnboardingDraftPreview(search) || isDraftPreviewApplicantId(applicantId);

    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const tenantSlug =
            nav.slug?.trim() ||
            resolveClientOnboardingTenantSlug(search) ||
            searchParams.get("tenant")?.trim() ||
            "";
          const query = new URLSearchParams({ applicantId, stepKey });
          if (stepId) query.set("stepId", stepId);
          if (tenantSlug) query.set("tenantSlug", tenantSlug);
          if (signingRequestId) query.set("signingRequestId", signingRequestId);
          if (isPreview) query.set("preview", "draft");
          const res = await fetch(`/api/onboarding/firma-sign/status?${query.toString()}`, {
            cache: "no-store",
          });
          const data = await res.json();
          if (!res.ok) return;
          const nextStatus = data.session?.firma_status;
          if (typeof nextStatus === "string" && nextStatus.length > 0) {
            setFirmaStatus(nextStatus);
          }
          if (data.download_url) {
            setDownloadUrl(data.download_url);
          }
          if (data.completed && !autoContinuedRef.current) {
            autoContinuedRef.current = true;
            setContinuing(true);
            try {
              await persistFirmaStepCompletion(nav, {
                applicantId,
                stepKey,
                stepId,
                signingRequestId: data.session?.signing_request_id ?? signingRequestId,
                firmaStatus: nextStatus ?? "completed",
              });
              nav.push(resolveContinueRoute(nav, stepKey, stepId));
            } catch {
              autoContinuedRef.current = false;
            } finally {
              setContinuing(false);
            }
          }
        } catch {
          /* ignore polling errors */
        }
      })();
    }, 8000);

    return () => window.clearInterval(interval);
  }, [stepKey, stepId, signingRequestId, loading, error, nav, search, searchParams]);

  async function handleContinue() {
    const applicantId = resolveApplicantId(search);
    if (!applicantId || !stepKey) return;

    setContinuing(true);
    setError(null);
    try {
      const isPreview =
        isOnboardingDraftPreview(search) || isDraftPreviewApplicantId(applicantId);
      const tenantSlug =
        nav.slug?.trim() ||
        resolveClientOnboardingTenantSlug(search) ||
        searchParams.get("tenant")?.trim() ||
        "";
      const statusQuery = new URLSearchParams({ applicantId, stepKey });
      if (stepId) statusQuery.set("stepId", stepId);
      if (tenantSlug) statusQuery.set("tenantSlug", tenantSlug);
      if (isPreview) statusQuery.set("preview", "draft");
      if (signingRequestId) statusQuery.set("signingRequestId", signingRequestId);

      const statusRes = await fetch(`/api/onboarding/firma-sign/status?${statusQuery.toString()}`, {
        cache: "no-store",
      });
      const statusData = await statusRes.json();
      if (!statusRes.ok) {
        throw new Error(statusData.error || "Could not verify signing status");
      }

      setFirmaStatus(statusData.session?.firma_status ?? firmaStatus);
      if (statusData.download_url) {
        setDownloadUrl(statusData.download_url);
      }

      if (!statusData.completed) {
        setError("Please finish signing the document before continuing.");
        return;
      }

      await persistFirmaStepCompletion(nav, {
        applicantId,
        stepKey,
        stepId,
        signingRequestId: statusData.session?.signing_request_id ?? signingRequestId,
        firmaStatus: statusData.session?.firma_status ?? firmaStatus,
      });

      nav.push(resolveContinueRoute(nav, stepKey, stepId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not continue onboarding");
    } finally {
      setContinuing(false);
    }
  }

  const stepTitle =
    nav.currentStep?.title ??
    nav.enabledSteps?.find((step) => step.step_key === stepKey)?.title ??
    E_SIGNATURE_LABEL;

  return (
    <OnboardingLayout>
      <OnboardingStepper />
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-8">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-lg font-semibold text-[#101828] sm:text-2xl">{stepTitle}</h1>
          <p className="mt-2 text-xs leading-5 text-[#667085] sm:text-sm">
            Review and sign your document below. You can complete signing without leaving onboarding.
          </p>
          {signingRequestId ? (
            <p className="mt-1 hidden truncate text-xs text-[#98a2b3] sm:block">
              Signing request: {signingRequestId}
            </p>
          ) : null}
          {!loading ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-xs font-medium text-[#475467]">
                Status: <span className="font-semibold text-slate-800">{eSignatureStatusLabel(firmaStatus)}</span>
              </p>
              {!isFirmaSigningComplete(firmaStatus) && signingRequestId ? (
                <button
                  type="button"
                  onClick={async () => {
                    const applicantId = resolveApplicantId(search);
                    if (!applicantId || !stepKey || refreshingStatus) return;
                    setRefreshingStatus(true);
                    try {
                      const q = new URLSearchParams({ applicantId, stepKey });
                      if (stepId) q.set("stepId", stepId);
                      if (signingRequestId) q.set("signingRequestId", signingRequestId);
                      const res = await fetch(`/api/onboarding/firma-sign/status?${q.toString()}`, { cache: "no-store" });
                      const d = await res.json();
                      if (d.session?.firma_status) setFirmaStatus(d.session.firma_status);
                      if (d.download_url) setDownloadUrl(d.download_url);
                    } finally {
                      setRefreshingStatus(false);
                    }
                  }}
                  disabled={refreshingStatus}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--brand-primary)] hover:underline disabled:opacity-60"
                >
                  <RefreshCw className={`h-3 w-3 ${refreshingStatus ? "animate-spin" : ""}`} />
                  {refreshingStatus ? "Checking…" : "Check live status"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {isFirmaSigningComplete(firmaStatus) ? (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 sm:p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 sm:h-12 sm:w-12">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-emerald-950 sm:text-base">Document Signed Successfully</h2>
                  <p className="text-xs text-emerald-800">Your agreement has been executed. You can preview or download it below.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={
                    downloadUrl ||
                    `/api/onboarding/firma-sign/download?${new URLSearchParams({
                      applicantId: resolveApplicantId(search) || "",
                      stepKey: stepKey || "",
                      signingRequestId: signingRequestId || "",
                    }).toString()}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-50"
                >
                  <Eye className="h-4 w-4 text-emerald-600" />
                  Preview Signed Agreement
                </a>
                <a
                  href={
                    downloadUrl ||
                    `/api/onboarding/firma-sign/download?${new URLSearchParams({
                      applicantId: resolveApplicantId(search) || "",
                      stepKey: stepKey || "",
                      signingRequestId: signingRequestId || "",
                      redirect: "true",
                    }).toString()}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  download={`${stepTitle || "Signed_Agreement"}.pdf`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--brand-primary)] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-95"
                >
                  <Download className="h-4 w-4" />
                  Download Signed Agreement
                </a>
              </div>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="min-h-[420px] rounded-lg border border-slate-200 bg-slate-50" aria-hidden />
        ) : (
          <>
        {error ? (
          <div
            data-testid="firma-signing-error"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
            {errorCode ? <span className="mt-1 block text-xs text-red-600">Code: {errorCode}</span> : null}
          </div>
        ) : null}

        <div className="h-[min(720px,calc(100dvh-12rem))] min-h-[360px] overflow-hidden rounded-lg border border-[color:var(--brand-primary)]/20 bg-[linear-gradient(135deg,var(--brand-gradient-from)_0%,var(--brand-gradient-to)_100%)] max-[639px]:h-[calc(100dvh-11rem)] max-[639px]:min-h-[320px] max-[639px]:rounded-none max-[639px]:border-x-0">
          <FirmaSigningIframe
            iframeUrl={iframeUrl}
            title={stepTitle}
            variant="modal"
            onComplete={() => {
              if (autoContinuedRef.current) return;
              void handleContinue();
            }}
          />
        </div>

        <div
          className={`mt-4 sm:mt-6 ${
            nav.prevRoute
              ? "grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end sm:gap-3"
              : "flex justify-stretch sm:justify-end"
          }`}
        >
          {nav.prevRoute ? (
            <button
              type="button"
              onClick={() => nav.push(nav.prevRoute!)}
              className="w-full rounded-lg border border-[#d0d5dd] bg-white px-4 py-2.5 text-[11px] font-semibold text-[#344054] sm:w-auto sm:text-sm"
            >
              Back
            </button>
          ) : null}
          <button
            type="button"
            data-testid="firma-signing-continue"
            onClick={() => void handleContinue()}
            disabled={continuing || !iframeUrl}
            className="w-full rounded-lg bg-[color:var(--brand-primary)] px-4 py-2.5 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:text-sm"
          >
            {continuing ? "Checking signature..." : "Continue"}
          </button>
        </div>
          </>
        )}
      </div>
    </OnboardingLayout>
  );
}

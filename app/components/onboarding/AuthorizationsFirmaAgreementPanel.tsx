"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, FileText, RefreshCw } from "lucide-react";
import { FirmaSigningIframe } from "@/app/components/onboarding/FirmaSigningIframe";
import {
  E_SIGNATURE_USER_ERRORS,
  eSignatureStatusLabel,
  sanitizeESignatureUserMessage,
} from "@/lib/e-signature/user-facing";
import {
  isFirmaSigningComplete,
  normalizeFirmaSigningStatus,
  stepUsesFirmaSigning,
} from "@/lib/onboarding/firma-step-settings";
import { isDeliverableApplicantEmail } from "@/lib/onboardingStep1Validation";
import type { TenantOnboardingStep } from "@/lib/onboarding/types";

type FirmaSessionResponse = {
  session?: {
    signing_request_id: string;
    iframe_url: string | null;
    firma_status: string;
  };
  download_url?: string | null;
  error?: string | null;
  code?: string;
};

type Props = {
  applicantId: string | null;
  step: TenantOnboardingStep | null;
  tenantSlug?: string | null;
  signerEmail: string;
  signerEmailLoading?: boolean;
  agreed: boolean;
  configLoading?: boolean;
  onSignedChange?: (signed: boolean) => void;
  /** Signed file the recruiter can preview after the candidate finishes. */
  onSignedDocument?: (document: {
    signingRequestId: string | null;
    downloadUrl: string | null;
  }) => void;
  documentTitle?: string | null;
};

function mapFirmaStatusLabel(status: string): string {
  return eSignatureStatusLabel(status);
}

export function AuthorizationsFirmaAgreementPanel({
  applicantId,
  step,
  tenantSlug,
  signerEmail,
  signerEmailLoading = false,
  agreed,
  configLoading = false,
  onSignedChange,
  onSignedDocument,
  documentTitle,
}: Props) {
  const cardTitle = documentTitle?.trim() || "Onboarding Agreement";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [signingRequestId, setSigningRequestId] = useState<string | null>(null);
  const [firmaStatus, setFirmaStatus] = useState("draft");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [showSigningModal, setShowSigningModal] = useState(false);
  const statusRequestInFlight = useRef(false);

  const stepKey = step?.step_key ?? "";
  const stepId = step?.id ?? "";
  const hasFirmaTemplate = step ? stepUsesFirmaSigning(step) : false;
  const emailValid = isDeliverableApplicantEmail(signerEmail);
  const emailCheckReady = !signerEmailLoading;
  const showMissingEmailMessage = emailCheckReady && !emailValid;
  const signed = isFirmaSigningComplete(firmaStatus);

  useEffect(() => {
    onSignedChange?.(signed);
  }, [signed, onSignedChange]);

  useEffect(() => {
    onSignedDocument?.({ signingRequestId, downloadUrl });
  }, [signingRequestId, downloadUrl, onSignedDocument]);

  useEffect(() => {
    if (!showSigningModal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showSigningModal]);

  useEffect(() => {
    if (!applicantId || !stepKey || !hasFirmaTemplate || !emailValid) return;

    const activeApplicantId = applicantId;
    const activeStepKey = stepKey;

    let cancelled = false;

    async function loadExistingSession() {
      try {
        const query = new URLSearchParams({
          applicantId: activeApplicantId,
          stepKey: activeStepKey,
        });
        if (stepId) query.set("stepId", stepId);
        if (tenantSlug) query.set("tenantSlug", tenantSlug);

        const res = await fetch(`/api/onboarding/firma-sign/status?${query.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;

        const data = (await res.json()) as FirmaSessionResponse;
        const session = data.session;
        if (!session || cancelled) return;

        setSigningRequestId(session.signing_request_id ?? null);
        setFirmaStatus(session.firma_status ?? "draft");
        if (session.iframe_url) {
          setIframeUrl(session.iframe_url);
        }
        if (data.download_url) {
          setDownloadUrl(data.download_url);
        }
      } catch {
        /* no existing session yet */
      }
    }

    void loadExistingSession();
    return () => {
      cancelled = true;
    };
  }, [applicantId, stepKey, stepId, tenantSlug, hasFirmaTemplate, emailValid]);

  const refreshStatus = useCallback(async () => {
    if (!applicantId || !stepKey || !signingRequestId) return;
    if (statusRequestInFlight.current) return;
    statusRequestInFlight.current = true;
    const activeApplicantId = applicantId;
    const activeStepKey = stepKey;
    try {
      const query = new URLSearchParams({
        applicantId: activeApplicantId,
        stepKey: activeStepKey,
      });
      if (stepId) query.set("stepId", stepId);
      if (tenantSlug) query.set("tenantSlug", tenantSlug);
      const res = await fetch(`/api/onboarding/firma-sign/status?${query.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as FirmaSessionResponse & { completed?: boolean };
      if (!res.ok) return;
      const status = data.session?.firma_status ?? firmaStatus;
      setFirmaStatus(status);
      if (typeof window !== "undefined") {
        localStorage.setItem("signingStatus", normalizeFirmaSigningStatus(status));
      }
      if (data.session?.signing_request_id) {
        setSigningRequestId(data.session.signing_request_id);
      }
      if (data.download_url) {
        setDownloadUrl(data.download_url);
      }
      if (data.completed || isFirmaSigningComplete(status)) {
        setShowSigningModal(false);
        if (typeof window !== "undefined") {
          localStorage.setItem("signingStatus", "completed");
        }
      }
    } catch {
      /* ignore polling errors */
    } finally {
      statusRequestInFlight.current = false;
    }
  }, [applicantId, stepKey, stepId, tenantSlug, signingRequestId, firmaStatus]);

  useEffect(() => {
    if (!signingRequestId || !applicantId || !stepKey) return;
    const interval = window.setInterval(() => {
      void refreshStatus();
    }, showSigningModal ? 2000 : 8000);
    return () => window.clearInterval(interval);
  }, [signingRequestId, applicantId, stepKey, refreshStatus, showSigningModal]);

  const startFirmaSigning = useCallback(async () => {
    if (!agreed) {
      setError("Please agree to the authorization first.");
      return;
    }
    if (!emailCheckReady) {
      return;
    }
    if (!emailValid) {
      setError(
        "A valid applicant email is required. Return to the first onboarding step and enter your email address."
      );
      return;
    }
    if (!applicantId || !stepKey) {
      setError("Missing applicant session. Return to the first onboarding step.");
      return;
    }
    const activeApplicantId = applicantId;
    const activeStepKey = stepKey;
    if (!hasFirmaTemplate) {
      setError(E_SIGNATURE_USER_ERRORS.templateMissing);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams({
        applicantId: activeApplicantId,
        stepKey: activeStepKey,
      });
      if (stepId) query.set("stepId", stepId);
      if (tenantSlug) query.set("tenantSlug", tenantSlug);

      const res = await fetch(`/api/onboarding/firma-sign/session?${query.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as FirmaSessionResponse;
      if (!res.ok) {
        throw new Error(
          sanitizeESignatureUserMessage(data.error, E_SIGNATURE_USER_ERRORS.sessionOpenFailed)
        );
      }

      const session = data.session;
      setSigningRequestId(session?.signing_request_id ?? null);
      setFirmaStatus(session?.firma_status ?? "draft");
      setIframeUrl(session?.iframe_url ?? null);

      if (session?.iframe_url) {
        setShowSigningModal(true);
      } else {
        throw new Error(E_SIGNATURE_USER_ERRORS.sessionOpenFailed);
      }

      if (session?.signing_request_id) {
        localStorage.setItem("signingRequestId", session.signing_request_id);
      }
      localStorage.setItem("signingStatus", normalizeFirmaSigningStatus(session?.firma_status));
    } catch (err: unknown) {
      setError(
        sanitizeESignatureUserMessage(
          err instanceof Error ? err.message : null,
          E_SIGNATURE_USER_ERRORS.sessionOpenFailed
        )
      );
    } finally {
      setLoading(false);
    }
  }, [
    agreed,
    applicantId,
    emailCheckReady,
    emailValid,
    hasFirmaTemplate,
    stepId,
    stepKey,
    tenantSlug,
  ]);

  if (!step) {
    return null;
  }

  if (configLoading) {
    return (
      <div className="mb-8 rounded-3xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
        Loading agreement signing configuration…
      </div>
    );
  }

  if (!hasFirmaTemplate) {
    return (
      <div className="mb-6 rounded-2xl border border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/5 p-4 shadow-sm sm:mb-8 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--brand-primary)]/15 text-[color:var(--brand-primary)] sm:h-12 sm:w-12 sm:rounded-2xl">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-slate-900 sm:text-sm" title={cardTitle}>
                {cardTitle}
              </p>
              <p className="text-[11px] text-slate-500 sm:text-xs">Mandatory · E-Signature</p>
            </div>
          </div>
          <button
            type="button"
            disabled
            className="cursor-not-allowed whitespace-nowrap rounded-lg bg-gray-400 px-3 py-1.5 text-[11px] font-semibold text-white sm:rounded-xl sm:px-5 sm:py-2 sm:text-[12px]"
          >
            Sign Document
          </button>
        </div>
        <p className="mt-3 text-[11px] text-amber-800 sm:text-xs">
          {E_SIGNATURE_USER_ERRORS.templateMissing}
        </p>
        <p className="mt-2 text-[11px] font-medium text-slate-500 sm:text-xs">Status: Signature Pending</p>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/5 p-4 shadow-sm sm:mb-8 sm:rounded-3xl sm:p-6">
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--brand-primary)]/15 text-[color:var(--brand-primary)] sm:h-12 sm:w-12 sm:rounded-2xl">
            <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-slate-900 sm:text-sm" title={cardTitle}>
              {cardTitle}
            </p>
            <p className="text-[11px] text-slate-500 sm:text-xs">Mandatory · E-Signature</p>
          </div>
        </div>

        <div className="shrink-0">
          {signed ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center whitespace-nowrap rounded-lg bg-[color:var(--brand-primary)] px-3 py-1.5 text-[11px] font-semibold text-white sm:rounded-xl sm:px-4 sm:py-2 sm:text-[12px]">
                Signed
              </span>
              {downloadUrl || signingRequestId ? (
                <>
                  <a
                    href={
                      downloadUrl ||
                      `/api/onboarding/firma-sign/download?${new URLSearchParams({
                        applicantId: applicantId || "",
                        stepKey: stepKey || "",
                        signingRequestId: signingRequestId || "",
                        redirect: "true",
                      }).toString()}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--brand-primary)] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[color:var(--brand-primary)] shadow-sm transition hover:bg-slate-50 sm:rounded-xl sm:px-3 sm:py-2 sm:text-[12px]"
                    title="Preview signed agreement"
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden />
                    Preview
                  </a>
                  <a
                    href={
                      downloadUrl
                        ? downloadUrl
                        : `/api/onboarding/firma-sign/download?${new URLSearchParams({
                            applicantId: applicantId || "",
                            stepKey: stepKey || "",
                            signingRequestId: signingRequestId || "",
                            redirect: "true",
                            download: "true",
                            filename: `${cardTitle}.pdf`,
                          }).toString()}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    download={`${cardTitle}.pdf`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--brand-primary)] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:brightness-95 sm:rounded-xl sm:px-3 sm:py-2 sm:text-[12px]"
                    title="Download signed agreement"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    Download
                  </a>
                </>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void startFirmaSigning()}
              disabled={loading || !agreed || signerEmailLoading || !emailValid}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white transition sm:rounded-xl sm:px-5 sm:py-2 sm:text-[12px] ${
                loading || !agreed || signerEmailLoading || !emailValid
                  ? "cursor-not-allowed bg-gray-400"
                  : "bg-[color:var(--brand-primary)] hover:brightness-90"
              }`}
            >
              {loading ? "Preparing..." : signerEmailLoading ? "Checking email…" : "Sign Document"}
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100/60 pt-2.5">
        {signingRequestId ? (
          <p className="min-w-0 flex-1 truncate text-[10px] text-slate-500 sm:text-xs">
            Signing request: {signingRequestId}
          </p>
        ) : (
          <span className="min-w-0 flex-1" aria-hidden="true" />
        )}
        <div className="flex items-center gap-3">
          <p className="shrink-0 whitespace-nowrap text-[11px] text-slate-700 sm:text-sm">
            Status: <span className="font-semibold">{mapFirmaStatusLabel(firmaStatus)}</span>
          </p>
          {!signed && signingRequestId ? (
            <button
              type="button"
              onClick={async () => {
                setCheckingStatus(true);
                await refreshStatus();
                setCheckingStatus(false);
              }}
              disabled={checkingStatus}
              className="inline-flex items-center gap-1 text-[11px] text-[color:var(--brand-primary)] hover:underline disabled:opacity-60"
              title="Re-check live signing status"
            >
              <RefreshCw className={`h-3 w-3 ${checkingStatus ? "animate-spin" : ""}`} />
              {checkingStatus ? "Checking…" : "Check status"}
            </button>
          ) : null}
        </div>
      </div>

      {showMissingEmailMessage ? (
        <p className="mt-2 text-xs leading-5 text-rose-600 sm:text-sm">
          Enter a valid email on the first onboarding step before signing the agreement.
        </p>
      ) : null}

      {error ? <p className="mt-3 text-xs leading-5 text-rose-600 sm:text-sm">{error}</p> : null}

      {showSigningModal && iframeUrl ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden p-4 sm:p-6 md:p-8 lg:p-10 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
          style={{
            background:
              "linear-gradient(135deg, var(--brand-gradient-from) 0%, var(--brand-gradient-to) 100%)",
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Sign agreement"
        >
          <div className="relative w-full max-w-[1240px] h-[86vh] max-h-[820px] overflow-hidden rounded-2xl shadow-2xl bg-[#1a1d24] border-0">
            <FirmaSigningIframe
              iframeUrl={iframeUrl}
              title="Sign Agreement"
              variant="modal"
              onClose={() => setShowSigningModal(false)}
              onComplete={() => {
                setShowSigningModal(false);
                setFirmaStatus("completed");
                if (typeof window !== "undefined") {
                  localStorage.setItem("signingStatus", "completed");
                }
                void refreshStatus();
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

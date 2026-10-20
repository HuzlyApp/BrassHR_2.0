"use client";

import Image from "next/image";
import AccountReadyModal from "@/app/components/AccountReadyModal";
import SignupStepper from "@/app/components/SignupStepper";
import { Fragment, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  buildYourTrialPath,
  clearAccountReadyModalPending,
  markAccountReadyModalSeen,
  readAccountReadyModalPending,
  readAccountReadyModalSeen,
} from "@/lib/auth/account-ready-modal";
import { leaveOwnerTrialPreparation } from "@/lib/auth/leave-owner-trial-preparation";

const interStyle = { fontFamily: "Inter, Arial, sans-serif" };

const RIGHT_CHECK_ICON = "/icons/braas-HR/right-icon.svg";

const STATUS_ITEMS = [
  { label: "Account Created", icon: "/icons/braas-HR/account-created-icon.svg" },
  { label: "Demo Data Generated", icon: "/icons/braas-HR/demo-data-icon.svg" },
  { label: "Adding the final touches", icon: "/icons/braas-HR/final-touch-icon.svg" },
] as const;

const STEP_DELAY_MS = 1400;
const PREP_SLOW_MESSAGE_MS = 5 * 60 * 1000;
const SESSION_EXPIRY_REDIRECT_MS = 2 * 60 * 1000;

type TrialStatusPayload = {
  phase?: "preparing" | "email_sent" | "onboarding_complete";
  emailSent?: boolean;
  error?: string;
};

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function StatusList({ completedThrough }: { completedThrough: number }) {
  return (
    <div className="mt-[32px] sm:mt-[40px] min-[1440px]:mt-[48px]">
      {STATUS_ITEMS.map((item, index) => {
        const isComplete = index <= completedThrough;

        return (
          <Fragment key={item.label}>
            {index > 0 ? (
              <div
                className="flex h-8 w-12 items-center justify-center sm:h-10 sm:w-14 min-[1440px]:h-[50px] min-[1440px]:w-16"
                aria-hidden
              >
                <span className="h-full w-px bg-[#e8edf4]" />
              </div>
            ) : null}
            <div className="flex items-center gap-3 sm:gap-4 min-[1440px]:gap-[16px]">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-[#F3F4F6] sm:h-14 sm:w-14 min-[1440px]:h-16 min-[1440px]:w-16 min-[1440px]:rounded-[12px]">
                <Image
                  src={isComplete ? RIGHT_CHECK_ICON : item.icon}
                  alt=""
                  width={42}
                  height={42}
                  className={`object-contain ${
                    isComplete
                      ? "h-8 w-8 sm:h-9 sm:w-9 min-[1440px]:h-[42px] min-[1440px]:w-[42px]"
                      : "h-7 w-7 sm:h-8 sm:w-8 min-[1440px]:h-9 min-[1440px]:w-9"
                  }`}
                />
              </span>
              <span
                className="text-[14px] font-normal leading-[20px] tracking-normal text-[#0f172a] sm:text-[15px] sm:leading-[22px] min-[1440px]:text-[16px] min-[1440px]:leading-[24px]"
                style={interStyle}
              >
                {item.label}
              </span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

function TrialArtPanel() {
  return (
    <aside className="trial-art relative flex w-full flex-col items-center justify-center gap-6 self-stretch overflow-hidden rounded-[24px] bg-[#111827] p-6 sm:gap-8 sm:p-8 min-[1440px]:gap-[40px] min-[1440px]:p-[30px]">
      <Image
        src="/images/singup-bg-image.jpg"
        alt="Brass HR"
        fill
        sizes="(max-width: 1100px) 100vw, 510px"
        priority
        className="object-cover"
      />
      <div className="absolute inset-0 bg-black/45" />
      <div className="relative z-10 flex flex-col items-center justify-center gap-6 text-center sm:gap-8 min-[1440px]:gap-[40px]">
        <Image
          src="/icons/braas-HR/white-BrassHR-logo.svg"
          alt="Brass HR"
          width={160}
          height={80}
          priority
          className="h-[56px] w-[112px] object-contain sm:h-[64px] sm:w-[128px] min-[1440px]:h-[80px] min-[1440px]:w-[160px]"
        />
        <p
          className="max-w-[260px] text-center text-[20px] font-bold leading-[26px] tracking-[0.03em] text-white sm:max-w-[280px] sm:text-[22px] sm:leading-[28px] min-[1440px]:max-w-[300px] min-[1440px]:text-[24px] min-[1440px]:leading-[30px]"
          style={{ fontFamily: "var(--font-geist-mono)" }}
        >
          HR Simplified for growing teams
        </p>
      </div>
    </aside>
  );
}

function YourTrialContent() {
  const searchParams = useSearchParams();
  const isAccountReadyFromUrl = searchParams.get("account-ready") === "true";
  const [showAccountReadyModal, setShowAccountReadyModal] = useState(false);
  const [trialPrepared, setTrialPrepared] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [completedThrough, setCompletedThrough] = useState(0);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [slowMessage, setSlowMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [leavingHome, setLeavingHome] = useState(false);
  const preparationStartedRef = useRef(false);
  const leaveHomeStartedRef = useRef(false);

  const cleanAccountReadyUrl = useCallback(() => {
    if (typeof window === "undefined") return;
    if (searchParams.get("account-ready") !== "true") return;
    const target = buildYourTrialPath(searchParams.toString());
    window.history.replaceState(null, "", target);
  }, [searchParams]);

  const openAccountReadyModal = useCallback(() => {
    if (typeof window === "undefined") return false;
    const pendingFromSignup = readAccountReadyModalPending(sessionStorage);
    // Fresh signup (pending flag) always opens. Otherwise honor "already seen".
    if (!pendingFromSignup && readAccountReadyModalSeen(sessionStorage)) return false;
    setShowAccountReadyModal(true);
    return true;
  }, []);

  const markTrialReady = useCallback(
    (options?: { showModal?: boolean }) => {
      setTrialPrepared(true);
      setCompletedThrough(2);
      setSlowMessage(null);
      if (options?.showModal !== false) {
        openAccountReadyModal();
      }
    },
    [openAccountReadyModal]
  );

  const fetchTrialStatus = useCallback(async (): Promise<TrialStatusPayload | null> => {
    try {
      const res = await fetch("/api/auth/signup/trial-status", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as TrialStatusPayload;
      if (!res.ok) return { error: json.error || "Unauthorized" };
      return json;
    } catch {
      return { error: "Network error while checking trial status." };
    }
  }, []);

  useEffect(() => {
    if (!isAccountReadyFromUrl) return;

    setTrialPrepared(true);
    setCompletedThrough(2);
    openAccountReadyModal();
    cleanAccountReadyUrl();
  }, [isAccountReadyFromUrl, cleanAccountReadyUrl, openAccountReadyModal]);

  useEffect(() => {
    try {
      const draft = localStorage.getItem("braasOwnerSignupDraft");
      if (!draft) return;
      const parsed = JSON.parse(draft) as { workEmail?: string };
      if (parsed.workEmail?.trim()) {
        setVerificationEmail(parsed.workEmail.trim());
      }
    } catch {
      // ignore invalid draft
    }
  }, []);

  useEffect(() => {
    if (trialPrepared || isAccountReadyFromUrl) return;
    if (preparationStartedRef.current) return;
    preparationStartedRef.current = true;

    let cancelled = false;
    const slowTimer = window.setTimeout(() => {
      if (!cancelled) {
        setSlowMessage(
          "This is taking longer than expected. We'll email your setup link shortly. You can stay on this page or use Resend setup link below."
        );
      }
    }, PREP_SLOW_MESSAGE_MS);

    async function runPreparation() {
      const beginRes = await fetch("/api/auth/signup/begin-trial-session", { method: "POST" });
      if (!beginRes.ok && beginRes.status !== 401) {
        const json = (await beginRes.json().catch(() => ({}))) as { error?: string };
        setPrepareError(json.error || "Could not start trial preparation.");
        return;
      }

      const existingStatus = await fetchTrialStatus();
      if (cancelled) return;
      if (existingStatus?.phase === "email_sent" || existingStatus?.phase === "onboarding_complete") {
        // Already prepared (refresh, or Strict Mode remount after email send).
        // Show modal unless the user previously explicitly exited.
        const alreadySeen = typeof window !== "undefined" && readAccountReadyModalSeen(sessionStorage);
        const pendingFromSignup = typeof window !== "undefined" && readAccountReadyModalPending(sessionStorage);
        const shouldShow = pendingFromSignup || !alreadySeen;
        markTrialReady({ showModal: shouldShow });
        return;
      }

      setCompletedThrough(0);
      await delay(STEP_DELAY_MS);
      if (cancelled) return;

      setCompletedThrough(1);
      try {
        const res = await fetch("/api/auth/signup/prepare-trial", { method: "POST" });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          sent?: boolean;
          skipped?: boolean;
          failed?: boolean;
          reason?: string | null;
        };

        if (!res.ok) {
          if (res.status === 401) {
            const statusAfterAuthLoss = await fetchTrialStatus();
            if (statusAfterAuthLoss?.phase !== "email_sent") {
              setPrepareError(
                "Your sign-in session expired, but trial preparation can continue. Use Resend setup link below if needed."
              );
            }
          } else {
            setPrepareError(json.error || "Could not finish preparing your trial.");
          }
        } else if (json.sent || (json.skipped && json.reason === "ALREADY_SENT")) {
          // Email delivered (or already sent) — continue to ready modal.
        } else if (json.failed || json.skipped) {
          setPrepareError(
            json.reason === "RESEND_NOT_CONFIGURED"
              ? "Email delivery is not configured on this server. Contact support for your setup link."
              : "We could not send your setup email. Use Resend setup link below to try again."
          );
        } else {
          setPrepareError("We could not confirm your setup email was sent. Use Resend setup link below.");
        }
      } catch {
        setPrepareError("Network error while preparing your trial.");
      }

      await delay(STEP_DELAY_MS);
      if (cancelled) return;
      setCompletedThrough(2);

      await delay(STEP_DELAY_MS);
      if (cancelled) return;

      // After preparing steps finish, always open the account-ready modal for a
      // fresh signup — including local runs where email send fails/skips.
      markTrialReady();
    }

    void runPreparation();
    return () => {
      cancelled = true;
      window.clearTimeout(slowTimer);
      // Allow React Strict Mode remount to start preparation again.
      preparationStartedRef.current = false;
    };
  }, [trialPrepared, isAccountReadyFromUrl, fetchTrialStatus, markTrialReady]);

  const leaveToBrassHrHome = useCallback(async () => {
    if (leaveHomeStartedRef.current) return;
    leaveHomeStartedRef.current = true;
    setLeavingHome(true);
    setShowAccountReadyModal(false);
    if (typeof window !== "undefined") {
      clearAccountReadyModalPending(sessionStorage);
      markAccountReadyModalSeen(sessionStorage);
    }
    await leaveOwnerTrialPreparation();
  }, []);

  useEffect(() => {
    // After 2 minutes, send the owner to BrassHR marketing home ("/").
    // Session + trial-prep cookie stay intact so the setup email link can still
    // open /tenant-onboarding directly. Middleware allows incomplete owners on "/".
    const startedAt = Date.now();
    const redirectTimer = window.setInterval(() => {
      if (Date.now() - startedAt >= SESSION_EXPIRY_REDIRECT_MS) {
        window.clearInterval(redirectTimer);
        void leaveToBrassHrHome();
      }
    }, 1000);

    return () => {
      window.clearInterval(redirectTimer);
    };
  }, [leaveToBrassHrHome]);

  const handleExit = () => {
    void leaveToBrassHrHome();
  };

  const handleResendSetupLink = async () => {
    setResending(true);
    setPrepareError(null);
    try {
      const res = await fetch("/api/auth/signup/resend-onboarding-link", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        sent?: boolean;
        skipped?: boolean;
        reason?: string | null;
      };

      if (!res.ok) {
        setPrepareError(json.error || "Could not resend setup link.");
        return;
      }

      if (json.sent || (json.skipped && json.reason === "ALREADY_SENT")) {
        setPrepareError(null);
        setSlowMessage(null);
        return;
      }

      setPrepareError("Could not resend setup link. Please try again in a moment.");
    } catch {
      setPrepareError("Network error while resending setup link.");
    } finally {
      setResending(false);
    }
  };

  useEffect(() => {
    const previousHtmlBg = document.documentElement.style.backgroundColor;
    const previousBodyBg = document.body.style.backgroundColor;
    document.documentElement.style.backgroundColor = "#ffffff";
    document.body.style.backgroundColor = "#ffffff";

    return () => {
      document.documentElement.style.backgroundColor = previousHtmlBg;
      document.body.style.backgroundColor = previousBodyBg;
    };
  }, []);

  return (
    <>
      {showAccountReadyModal ? (
        <AccountReadyModal
          email={verificationEmail || "your email"}
          onExit={handleExit}
          onResend={handleResendSetupLink}
          resending={resending}
        />
      ) : null}

      <main
        className={`min-h-screen w-full overflow-x-hidden bg-white${showAccountReadyModal ? " pointer-events-none select-none" : ""}`}
        style={{ backgroundColor: "#ffffff" }}
        aria-hidden={showAccountReadyModal}
      >
        <style>{`
        .trial-frame {
          box-sizing: border-box;
          padding: clamp(32px, 5.55vw, 80px);
        }

        .trial-layout {
          display: grid;
          grid-template-columns: minmax(520px, 770px) minmax(340px, 510px);
          gap: 0;
          justify-content: center;
          align-items: stretch;
        }

        .trial-content {
          width: 100%;
          max-width: 770px;
          min-height: 800px;
          padding: 20px 80px 20px 20px;
          display: flex;
          flex-direction: column;
        }

        .trial-art {
          width: 100%;
          max-width: 510px;
          height: 800px;
          min-height: 800px;
        }

        @media (max-width: 1100px) {
          .trial-frame {
            padding: 28px 24px;
          }

          .trial-layout {
            grid-template-columns: 1fr;
            gap: 32px;
            width: 100%;
            max-width: 770px;
            margin-left: auto;
            margin-right: auto;
          }

          .trial-content {
            min-height: 0;
            height: auto;
            max-width: 100%;
            padding: 0;
          }

          .trial-art {
            display: none;
          }
        }

        @media (max-width: 767px) {
          .trial-frame {
            padding: 24px 20px;
          }
        }

        @media (max-width: 639px) {
          .trial-frame {
            padding: 16px 20px;
          }

          .trial-layout {
            gap: 24px;
          }
        }

        @media (min-width: 1101px) and (max-width: 1439px) {
          .trial-frame {
            padding: 36px 40px;
          }

          .trial-layout {
            grid-template-columns: minmax(0, 1fr) minmax(0, 0.72fr);
            gap: clamp(24px, 4vw, 48px);
          }

          .trial-content {
            min-height: 0;
            height: auto;
            padding: 12px clamp(24px, 4vw, 48px) 12px 12px;
          }

          .trial-art {
            height: auto;
            min-height: clamp(520px, calc(100vh - 120px), 800px);
            max-width: 100%;
          }
        }

        @media (min-width: 1440px) {
          .trial-frame {
            width: 1440px;
            max-width: 1440px;
            min-height: 1024px;
            height: 1140px;
            padding: 80px;
          }

          .trial-layout {
            width: 1280px;
            grid-template-columns: 770px 510px;
          }

          .trial-content {
            width: 770px;
            height: 800px;
            padding: 20px 80px 20px 20px;
          }

          .trial-art {
            width: 510px;
            height: 800px;
            min-height: 800px;
          }
        }
      `}</style>

        <section className="trial-frame mx-auto w-full rounded-[24px] bg-white">
          <div className="trial-layout w-full rounded-[12px] bg-white">
            <div className="trial-content">
              <button
                type="button"
                onClick={() => void leaveToBrassHrHome()}
                disabled={leavingHome}
                className="inline-flex max-[1100px]:mx-auto disabled:opacity-60"
                aria-label="Back to BrassHR home"
              >
                <Image
                  src="/icons/braas-HR/BrassHR-logo.svg"
                  alt="Brass HR"
                  width={160}
                  height={80}
                  priority
                  className="h-[56px] w-[112px] object-contain sm:h-[68px] sm:w-[136px] min-[1440px]:h-[80px] min-[1440px]:w-[160px]"
                />
              </button>

              <SignupStepper phase={trialPrepared ? "ready" : "preparing"} />

              <div className="mt-[32px] sm:mt-[44px] min-[1440px]:mt-[58px]">
                <h1
                  className="text-[24px] font-semibold leading-[30px] tracking-normal text-[#0b0f19] sm:text-[26px] sm:leading-[32px] lg:text-[28px] lg:leading-[34px] min-[1440px]:text-[30px] min-[1440px]:leading-[36px]"
                  style={interStyle}
                >
                  We&apos;re preparing your trial
                </h1>
                <p
                  className="mt-[8px] text-[14px] font-normal leading-[20px] tracking-normal text-[#475569] sm:mt-[10px] sm:text-[15px] sm:leading-[22px] min-[1440px]:text-[16px] min-[1440px]:leading-[24px]"
                  style={interStyle}
                >
                  This only takes a few minutes. Please hang on a bit...
                </p>
                {slowMessage ? (
                  <p className="mt-3 text-sm text-[#475569]">{slowMessage}</p>
                ) : null}
                {prepareError ? (
                  <div className="mt-3 space-y-3">
                    <p className="text-sm text-red-700">{prepareError}</p>
                    <button
                      type="button"
                      onClick={() => void handleResendSetupLink()}
                      disabled={resending || leavingHome}
                      className="rounded-[8px] border border-[#BC8B41] px-4 py-2 text-sm font-semibold text-[#BC8B41] transition hover:bg-[#BC8B41]/5 disabled:opacity-60"
                    >
                      {resending ? "Sending…" : "Resend setup link"}
                    </button>
                  </div>
                ) : null}
              </div>

              <StatusList completedThrough={completedThrough} />

              <div className="min-h-[80px] flex-1 sm:min-h-[100px] min-[1440px]:min-h-[140px]" aria-hidden />

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => void leaveToBrassHrHome()}
                  disabled={leavingHome}
                  className="text-[14px] font-semibold leading-[20px] text-[#BC8B41] transition hover:underline disabled:opacity-60 sm:text-[15px]"
                  style={interStyle}
                >
                  {leavingHome ? "Returning to BrassHR…" : "Back to BrassHR"}
                </button>
                <p
                  className="text-[11px] font-normal leading-[15px] tracking-normal text-[#94a3b8] sm:text-[12px] sm:leading-[16px]"
                  style={interStyle}
                >
                  Join 20,000+ companies in 190+ countries using Brass - HRsimplified
                </p>
              </div>
            </div>

            <TrialArtPanel />
          </div>
        </section>
      </main>
    </>
  );
}

export default function YourTrialPage() {
  return (
    <Suspense fallback={null}>
      <YourTrialContent />
    </Suspense>
  );
}

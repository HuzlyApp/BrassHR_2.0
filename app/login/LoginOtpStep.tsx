"use client";

import { Check, Clock, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { loginInputErrorClass } from "@/app/login/LoginFormError";
import type { LoginAuthErrorPayload } from "@/lib/auth/login-api-errors";
import {
  formatLoginOtpCooldownMessage,
  LOGIN_OTP_MAX_RESENDS,
  LOGIN_OTP_RESEND_COOLDOWN_SECONDS,
  LOGIN_OTP_RESEND_LIMIT_MESSAGE,
  LOGIN_OTP_TTL_SECONDS,
  parseLoginOtpCooldownSeconds,
} from "@/lib/auth/login-otp-constants";
import { LOGIN_OTP_LENGTH } from "@/lib/auth/supabase-magic-link-otp-template";

const interStyle = { fontFamily: "Inter, Arial, sans-serif" };
const OTP_LENGTH = LOGIN_OTP_LENGTH;

const inputFocusClass =
  "focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--brand-primary)_20%,transparent)]";

/** Fixed OTP status colors — not tied to tenant branding. */
const OTP_STATUS_ICON = {
  successBg: "#16a34a",
  errorBg: "#dc2626",
  expiredBg: "#d97706",
} as const;

type LoginOtpStepProps = {
  email: string;
  submitting?: boolean;
  verified?: boolean;
  authError?: LoginAuthErrorPayload | null;
  /** Successful "Send again" count from the server (0 = initial code only). */
  resendCount?: number;
  maxResends?: number;
  expiresInSeconds?: number;
  resendCooldownSeconds?: number;
  onClearError?: () => void;
  onVerify: (code: string) => void | Promise<void>;
  /** Calls API to send a new code (app-managed OTP via Resend). */
  onSendAgain: () => void | Promise<void>;
};

function formatTimer(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function verifyButtonStyle(enabled: boolean): React.CSSProperties | undefined {
  if (!enabled) return undefined;
  return {
    backgroundImage: "linear-gradient(90deg, var(--brand-primary) 0%, var(--brand-accent) 100%)",
    fontFamily: "var(--font-geist-sans), Inter, Arial, sans-serif",
  };
}

export default function LoginOtpStep({
  email,
  submitting = false,
  verified = false,
  authError = null,
  resendCount = 0,
  maxResends = LOGIN_OTP_MAX_RESENDS,
  expiresInSeconds = LOGIN_OTP_TTL_SECONDS,
  resendCooldownSeconds = LOGIN_OTP_RESEND_COOLDOWN_SECONDS,
  onClearError,
  onVerify,
  onSendAgain,
}: LoginOtpStepProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length: OTP_LENGTH }, () => ""));
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(expiresInSeconds);
  const [resendSecondsLeft, setResendSecondsLeft] = useState(resendCooldownSeconds);
  const [sendingAgain, setSendingAgain] = useState(false);
  const [timerExpired, setTimerExpired] = useState(false);
  const [resendLimitReached, setResendLimitReached] = useState(false);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (resendCount >= maxResends) {
      setResendLimitReached(true);
    }
  }, [resendCount, maxResends]);

  useEffect(() => {
    if (!authError) return;
    if (authError.code === "RATE_LIMIT") {
      if (authError.error.toLowerCase().includes("wait for the timer")) {
        const sec =
          authError.retryAfterSec ??
          parseLoginOtpCooldownSeconds(authError.error) ??
          resendCooldownSeconds;
        setResendSecondsLeft(sec);
      } else {
        setResendLimitReached(true);
      }
    }
  }, [authError, resendCooldownSeconds]);

  // 5-minute OTP lifetime countdown
  useEffect(() => {
    if (otpSecondsLeft <= 0) {
      setTimerExpired(true);
      return;
    }
    const timer = window.setInterval(() => {
      setOtpSecondsLeft((current) => {
        if (current <= 1) {
          setTimerExpired(true);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpSecondsLeft]);

  // 30-second resend cooldown countdown
  useEffect(() => {
    if (resendSecondsLeft <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setResendSecondsLeft((current) => {
        if (current <= 1) return 0;
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendSecondsLeft]);

  const code = useMemo(() => digits.join(""), [digits]);
  const isComplete = code.length === OTP_LENGTH && digits.every((digit) => digit.length === 1);
  const otpHasError = authError != null;
  const otpExpired = timerExpired || authError?.code === "OTP_EXPIRED";
  const isCooldownError =
    authError?.code === "RATE_LIMIT" &&
    Boolean(authError.error?.toLowerCase().includes("wait for the timer"));
  const showResendLimit = resendLimitReached || (authError?.code === "RATE_LIMIT" && !isCooldownError);
  const canSendAgain =
    resendSecondsLeft <= 0 &&
    !sendingAgain &&
    !submitting &&
    !verified &&
    !resendLimitReached &&
    resendCount < maxResends;

  const updateDigit = (index: number, value: string) => {
    onClearError?.();
    const nextDigit = value.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = nextDigit;
      return next;
    });
    if (nextDigit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    onClearError?.();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;

    setDigits(Array.from({ length: OTP_LENGTH }, (_, index) => pasted[index] ?? ""));
    const focusIndex = Math.min(pasted.length, OTP_LENGTH - 1);
    inputRefs.current[focusIndex]?.focus();
  };

  const handleSendAgain = async () => {
    if (!canSendAgain) return;
    setSendingAgain(true);
    try {
      await onSendAgain();
      setDigits(Array.from({ length: OTP_LENGTH }, () => ""));
      setTimerExpired(false);
      setOtpSecondsLeft(expiresInSeconds);
      setResendSecondsLeft(resendCooldownSeconds);
      inputRefs.current[0]?.focus();
    } catch {
      /* Parent sets authError; if cooldown, resendSecondsLeft is set by authError effect */
    } finally {
      setSendingAgain(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isComplete || submitting || verified || timerExpired) return;
    void onVerify(code);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-[40px] pt-[30px]">
      <div>
        <h1 className="text-[24px] font-semibold leading-[30px] tracking-normal text-[#1f2937] sm:text-[30px] sm:leading-[36px]" style={interStyle}>
          Enter Code
        </h1>
        <div className="mt-[12px] space-y-[12px]">
          <p className="text-[14px] font-normal leading-[20px] text-[#4b5563]" style={interStyle}>
            We&apos;ve sent a verification code to this email.
          </p>
          <p className="text-[16px] font-semibold leading-[24px] text-black" style={interStyle}>
            {email}
          </p>
        </div>
      </div>

      <div className="pt-[20px]">
        {showResendLimit ? (
          <div
            role="alert"
            aria-live="polite"
            className="mb-[20px] flex items-center gap-[8px] text-[14px] font-normal leading-[20px] text-[#374151]"
            style={interStyle}
          >
            <span
              className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: OTP_STATUS_ICON.errorBg }}
              aria-hidden
            >
              <X className="h-[12px] w-[12px]" strokeWidth={3} />
            </span>
            <span className="font-semibold text-[#991b1b]">
              {authError?.error ?? LOGIN_OTP_RESEND_LIMIT_MESSAGE}
            </span>
          </div>
        ) : otpHasError || otpExpired ? (
          <div
            role="alert"
            aria-live="polite"
            className="mb-[20px] flex items-center gap-[8px] text-[14px] font-normal leading-[20px] text-[#374151]"
            style={interStyle}
          >
            <span
              className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-white"
              style={{
                backgroundColor: otpExpired
                  ? OTP_STATUS_ICON.expiredBg
                  : OTP_STATUS_ICON.errorBg,
              }}
              aria-hidden
            >
              {otpExpired ? (
                <Clock className="h-[12px] w-[12px]" strokeWidth={3} />
              ) : (
                <X className="h-[12px] w-[12px]" strokeWidth={3} />
              )}
            </span>
            <span>
              {otpExpired ? (
                <>
                  <span className="font-semibold text-[#92400e]">OTP expired.</span>{" "}
                  {authError?.code === "OTP_EXPIRED"
                    ? (authError.error ?? "Request a new code and try again.")
                    : "Request a new code and try again."}
                </>
              ) : isCooldownError ? (
                <>
                  <span className="font-semibold text-[#991b1b]">Please wait.</span>{" "}
                  {authError?.error ?? formatLoginOtpCooldownMessage(resendSecondsLeft)}
                </>
              ) : (
                <>
                  <span className="font-semibold text-[#991b1b]">Wrong OTP.</span>{" "}
                  {authError?.error ?? "Check the code and try again."}
                </>
              )}
            </span>
          </div>
        ) : verified ? (
          <div
            aria-live="polite"
            className="mb-[20px] flex items-center gap-[8px] text-[14px] font-normal leading-[20px] text-[#374151]"
            style={interStyle}
          >
            <span
              className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: OTP_STATUS_ICON.successBg }}
              aria-hidden
            >
              <Check className="h-[12px] w-[12px]" strokeWidth={3} />
            </span>
            <span className="font-semibold text-[#166534]">OTP verified.</span>
          </div>
        ) : isComplete ? (
          <div
            aria-live="polite"
            className="mb-[20px] text-[14px] font-normal leading-[20px] text-[#334155]"
            style={interStyle}
          >
            <span className="font-semibold text-[#0f172a]">Code entered.</span> Tap Verify Code.
          </div>
        ) : null}

        <p className="text-[14px] font-bold leading-[20px] text-[#374151]" style={interStyle}>
          Enter 6 digit OTP
        </p>

        <div className="flex justify-center gap-1.5 py-[24px] max-[369px]:gap-1 min-[450px]:max-[649px]:gap-2.5 sm:justify-start sm:gap-3 md:gap-[24px]">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(element) => {
                inputRefs.current[index] = element;
              }}
              type="text"
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              maxLength={1}
              value={digit}
              onChange={(event) => updateDigit(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onPaste={handlePaste}
              disabled={submitting || verified || timerExpired}
              aria-label={`Digit ${index + 1}`}
              aria-invalid={otpHasError || otpExpired}
              className={`h-[45px] w-[45px] shrink-0 rounded-[8px] border border-[#94a3b8] bg-white text-center text-[18px] font-semibold leading-[22px] text-[#0f172a] outline-none transition max-[369px]:h-[36px] max-[369px]:w-[36px] max-[369px]:rounded-[6px] max-[369px]:text-[15px] max-[369px]:leading-[18px] min-[450px]:max-[649px]:h-[48px] min-[450px]:max-[649px]:w-[48px] sm:h-[53px] sm:w-[53px] sm:text-[20px] sm:leading-[24px] ${inputFocusClass} ${otpHasError || otpExpired ? loginInputErrorClass : ""}`}
              style={interStyle}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-y-2 text-[14px] leading-[20px]" style={interStyle}>
          <span className="text-[#374151]">
            Code expires in{" "}
            <span className="font-semibold text-black">{formatTimer(otpSecondsLeft)}</span>
          </span>
          <div className="flex items-center gap-[8px]">
            {/* Resend countdown label commented out for OTP screen; button enable/disable is preserved
            {resendSecondsLeft > 0 ? (
              <span className="text-[#4b5563]">
                Get Code in{" "}
                <span className="font-semibold text-black">{resendSecondsLeft}s</span>
              </span>
            ) : null}
            */}
            <button
              type="button"
              onClick={() => void handleSendAgain()}
              disabled={!canSendAgain}
              className="font-normal hover:underline disabled:cursor-not-allowed disabled:text-[#94a3b8] disabled:no-underline"
              style={{ color: canSendAgain ? "var(--brand-secondary)" : "#94a3b8" }}
            >
              {sendingAgain ? "Sending..." : "Send again"}
            </button>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={!isComplete || submitting || verified || timerExpired}
        className="flex h-[54px] w-full items-center justify-center rounded-[12px] text-[16px] font-semibold leading-[22px] tracking-normal text-white transition-[filter] disabled:cursor-not-allowed disabled:bg-[#dddddd] disabled:text-[#94a3b8] enabled:hover:brightness-95"
        style={verifyButtonStyle(isComplete && !submitting && !verified && !timerExpired)}
      >
        {submitting ? "Verifying..." : verified ? "Verified" : "Verify Code"}
      </button>
    </form>
  );
}

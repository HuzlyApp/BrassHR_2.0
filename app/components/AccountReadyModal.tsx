"use client";

import Image from "next/image";

const interStyle = { fontFamily: "Inter, Arial, sans-serif" };
const BRAAS_BUTTON_GRADIENT = "linear-gradient(90deg, #BC8B41 0%, #E9B771 100%)";
const ACCOUNT_READY_ICON = "/icons/braas-HR/account-ready-icon.svg";

type AccountReadyModalProps = {
  email: string;
  onExit: () => void;
  onResend?: () => void | Promise<void>;
  resending?: boolean;
};

export default function AccountReadyModal({
  email,
  onExit,
  onResend,
  resending = false,
}: AccountReadyModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-[2px] sm:py-8"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-ready-title"
        className="flex w-full max-w-[600px] items-center justify-center rounded-2xl bg-white px-5 py-8 shadow-xl sm:h-[500px] sm:rounded-3xl sm:px-6 sm:py-0"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex w-full max-w-[486px] flex-col items-center gap-6 sm:gap-[40px]">
          <Image
            src={ACCOUNT_READY_ICON}
            alt=""
            width={100}
            height={100}
            priority
            className="h-[72px] w-[72px] shrink-0 object-contain sm:h-[100px] sm:w-[100px]"
          />

          <h2
            id="account-ready-title"
            className="w-full text-center text-[22px] font-semibold leading-[28px] tracking-normal text-[#0b0f19] sm:text-[30px] sm:leading-[36px]"
            style={interStyle}
          >
            Your account is ready
          </h2>

          <p
            className="w-full text-center text-[15px] font-normal leading-[23px] tracking-normal text-[#475569] sm:text-[18px] sm:leading-[28px]"
            style={interStyle}
          >
            We&apos;ve sent a verification/status link to{" "}
            <span className="font-semibold text-[#0f172a]">{email}</span>. Click the link in your
            email to continue setting up your trial.
          </p>

          <button
            type="button"
            onClick={onExit}
            className="flex h-[48px] w-full items-center justify-center rounded-[8px] text-[15px] font-semibold leading-[20px] tracking-normal text-white transition hover:brightness-95 sm:h-[52px] sm:text-[16px] sm:leading-[22px]"
            style={{
              backgroundImage: BRAAS_BUTTON_GRADIENT,
              fontFamily: "var(--font-geist-sans), Inter, Arial, sans-serif",
            }}
          >
            Back to BrassHR
          </button>

          {onResend ? (
            <button
              type="button"
              onClick={() => void onResend()}
              disabled={resending}
              className="text-center text-[13px] font-semibold text-[#BC8B41] transition hover:underline disabled:opacity-60 sm:text-sm"
            >
              {resending ? "Sending…" : "Didn't receive it? Resend setup link"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo } from "react";
import { Hourglass, X } from "lucide-react";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import { WAITING_ON_INTERNAL_MESSAGE } from "@/lib/onboarding/workflow-phase-groups";

type AwaitingRecruiterReviewModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function AwaitingRecruiterReviewModal({
  open,
  onClose,
}: AwaitingRecruiterReviewModalProps) {
  const branding = useTenantBranding();
  const buttonBackground = useMemo(
    () =>
      `linear-gradient(90deg, ${branding.primaryHex} 0%, color-mix(in srgb, ${branding.primaryHex} 70%, white) 100%)`,
    [branding.primaryHex]
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 px-4 py-8 backdrop-blur-[2px]"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="awaiting-review-modal-title"
        aria-describedby="awaiting-review-modal-message"
        className="relative flex w-full max-w-[500px] flex-col items-center rounded-[20px] border border-[#E5E7EB] bg-white px-8 pb-8 pt-10 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-[#101828] text-white transition hover:brightness-110"
        >
          <X size={12} />
        </button>

        <div className="flex flex-col items-center text-center">
          <div
            className="mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full"
            style={{ background: `color-mix(in srgb, ${branding.primaryHex} 12%, white)` }}
          >
            <Hourglass
              size={30}
              strokeWidth={2.25}
              style={{ color: branding.primaryHex }}
              aria-hidden
            />
          </div>

          <h2
            id="awaiting-review-modal-title"
            className="text-2xl font-semibold leading-8 text-[#101828]"
          >
            Under recruiter review
          </h2>

          <p
            id="awaiting-review-modal-message"
            className="mt-2 max-w-[380px] text-base leading-6 text-[#4B5563]"
          >
            {WAITING_ON_INTERNAL_MESSAGE}
          </p>

          <button
            type="button"
            onClick={onClose}
            className="mt-6 flex h-11 w-full max-w-[360px] items-center justify-center rounded-lg text-sm font-semibold text-white transition hover:brightness-[0.97]"
            style={{ background: buttonBackground }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

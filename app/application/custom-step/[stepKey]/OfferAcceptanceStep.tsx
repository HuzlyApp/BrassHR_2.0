"use client";

import { useEffect, useRef, useState } from "react";
import { useOnboardingConfigOptional } from "@/app/components/onboarding/OnboardingConfigProvider";
import { persistStepProgress } from "@/lib/onboarding/use-mark-step-in-progress-if-pending";
import {
  readOfferDecision,
  type OfferDetails,
} from "@/lib/onboarding/offer-acceptance";
import type { OnboardingStepStatus, TenantOnboardingStep } from "@/lib/onboarding/types";
import {
  APPLICANT_ACTION_ROW,
  APPLICANT_BTN_BACK,
  APPLICANT_BTN_PRIMARY,
} from "@/app/application/applicant-onboarding-responsive";

type UpdateStepStatus = (
  stepKey: string,
  status: OnboardingStepStatus,
  data?: Record<string, unknown>
) => Promise<void>;

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const OFFER_ROWS: Array<{ key: keyof OfferDetails; label: string; date?: boolean }> = [
  { key: "position", label: "Position" },
  { key: "client", label: "Client" },
  { key: "location", label: "Location" },
  { key: "employmentType", label: "Employment type" },
  { key: "schedule", label: "Schedule" },
  { key: "compensation", label: "Compensation" },
  { key: "startDate", label: "Start date", date: true },
];

export default function OfferAcceptanceStep({
  step,
  tenantSlug,
  updateStepStatus,
  onBack,
  onContinue,
}: {
  step: TenantOnboardingStep;
  tenantSlug: string | null;
  updateStepStatus: UpdateStepStatus | undefined;
  onBack: () => void;
  onContinue: () => void;
}) {
  const onboarding = useOnboardingConfigOptional();
  const applicantId = onboarding?.applicantId ?? null;
  const applicationId = onboarding?.applicationId ?? null;
  const completingRef = useRef(false);
  const [offer, setOffer] = useState<OfferDetails | null>(null);
  const [loadingOffer, setLoadingOffer] = useState(true);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState("");

  const progressRow = onboarding?.progress?.steps.find((row) => row.onboarding_step_id === step.id);
  const decision = progressRow ? readOfferDecision(progressRow.data, progressRow.status) : null;

  useEffect(() => {
    if (!applicantId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ applicantId });
    if (tenantSlug) params.set("tenant", tenantSlug);
    if (applicationId) params.set("applicationId", applicationId);
    setLoadingOffer(true);
    fetch(`/api/onboarding/offer-details?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as { offer?: OfferDetails | null; error?: string };
        if (!res.ok) throw new Error(json.error || "Could not load your offer details");
        setOffer(json.offer ?? null);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Could not load your offer details");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingOffer(false);
      });
    return () => controller.abort();
  }, [applicantId, applicationId, tenantSlug]);

  async function submit(choice: "accept" | "decline") {
    setError("");
    setSaving(choice);
    const decidedAt = new Date().toISOString();
    try {
      if (choice === "accept") {
        await persistStepProgress(
          updateStepStatus,
          step.step_key,
          "completed",
          completingRef,
          {
            offer_decision: "accepted",
            offer_decided_at: decidedAt,
            offer,
          },
          step.id
        );
        onContinue();
      } else {
        await persistStepProgress(
          updateStepStatus,
          step.step_key,
          "failed",
          completingRef,
          {
            offer_decision: "declined",
            offer_decided_at: decidedAt,
            failure_reason: reason.trim() || "Candidate declined the offer",
            offer,
          },
          step.id
        );
        setDeclining(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your response");
    } finally {
      setSaving(null);
    }
  }

  const accepted = decision?.decision === "accepted";
  const declined = decision?.decision === "declined";

  return (
    <>
      {accepted ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          You accepted this offer{formatDateTime(decision.decidedAt) ? ` on ${formatDateTime(decision.decidedAt)}` : ""}.
          Continue to the next step.
        </p>
      ) : declined ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          You declined this offer. Your recruiter has been notified. If you change your mind, you can still
          accept it below.
        </p>
      ) : null}

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        {loadingOffer && applicantId ? (
          <p className="text-slate-500">Loading your offer…</p>
        ) : offer ? (
          <dl className="space-y-3">
            {OFFER_ROWS.map((row) => {
              const raw = offer[row.key];
              const value = row.date ? formatDate(raw) : raw;
              if (!value) return null;
              return (
                <div key={row.key} className="flex justify-between gap-3">
                  <dt className="text-slate-500">{row.label}</dt>
                  <dd className="text-right font-medium text-slate-800">{value}</dd>
                </div>
              );
            })}
          </dl>
        ) : (
          <p className="text-slate-600">
            Your recruiter will share the full offer details with you. Accept to confirm you want to move forward.
          </p>
        )}
      </div>

      {declining ? (
        <div className="mt-4 space-y-2">
          <label className="block text-sm font-medium text-slate-800" htmlFor="offer-decline-reason">
            Reason for declining (optional)
          </label>
          <textarea
            id="offer-decline-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[color:var(--brand-primary)]"
            placeholder="Let your recruiter know why"
          />
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

      <div className={APPLICANT_ACTION_ROW}>
        <button type="button" onClick={onBack} className={APPLICANT_BTN_BACK}>
          Back
        </button>
        {accepted ? (
          <button type="button" onClick={onContinue} className={APPLICANT_BTN_PRIMARY}>
            Continue
          </button>
        ) : declining ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving != null}
              onClick={() => setDeclining(false)}
              className={APPLICANT_BTN_BACK}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving != null}
              onClick={() => void submit("decline")}
              className="rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving === "decline" ? "Saving…" : "Confirm decline"}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            {!declined ? (
              <button
                type="button"
                disabled={saving != null}
                onClick={() => setDeclining(true)}
                className={APPLICANT_BTN_BACK}
              >
                Decline Offer
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving != null}
              onClick={() => void submit("accept")}
              className={`${APPLICANT_BTN_PRIMARY} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {saving === "accept" ? "Saving…" : "Accept Offer"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

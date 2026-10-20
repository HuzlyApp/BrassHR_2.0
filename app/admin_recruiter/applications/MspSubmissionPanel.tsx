"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  MSP_PACKET_VARIANT_LABELS,
  type MspPacketVariant,
  type MspReadinessCheck,
  type MspSubmissionBlocker,
  type MspSubmissionRecord,
} from "@/lib/jobs/msp-submission";

type SubmissionView = {
  decision: {
    applicable: boolean;
    packetVariants: MspPacketVariant[];
    checks: MspReadinessCheck[];
    blockers: MspSubmissionBlocker[];
    ready: boolean;
    alreadySubmitted: boolean;
    externalResponseAdvancesStage: false;
  };
  submission: MspSubmissionRecord | null;
};

export function MspSubmissionPanel({
  applicationId,
  onSubmitted,
}: {
  applicationId: string;
  onSubmitted?: (statusName: string) => void;
}) {
  const [view, setView] = useState<SubmissionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [mspReference, setMspReference] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationId)}/msp-submission`,
        { cache: "no-store" }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Failed to load MSP submission");
      }
      setView(payload as SubmissionView);
    } catch (loadError) {
      setView(null);
      setError(loadError instanceof Error ? loadError.message : "Failed to load MSP submission");
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (!view?.decision.ready || busy) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationId)}/msp-submission`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notes: notes.trim() || undefined,
            mspReference: mspReference.trim() || undefined,
          }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const blockers = Array.isArray(payload.blockers)
          ? payload.blockers.map((item: { message?: string }) => item.message).filter(Boolean)
          : [];
        throw new Error(
          blockers[0] || (typeof payload.error === "string" ? payload.error : "MSP submission was blocked")
        );
      }
      toast.success(`Submitted to MSP${payload.statusName ? ` · ${payload.statusName}` : ""}`);
      setNotes("");
      setMspReference("");
      await load();
      if (typeof payload.statusName === "string") onSubmitted?.(payload.statusName);
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : "MSP submission was blocked");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-xs text-[#64748B]">Checking MSP submission readiness…</p>;
  }
  if (error) {
    return <p className="text-xs text-[#B91C1C]">{error}</p>;
  }
  if (!view?.decision.applicable) return null;

  const submission = view.submission;
  const variantLabel = view.decision.packetVariants
    .map((variant) => MSP_PACKET_VARIANT_LABELS[variant] ?? variant)
    .join(" · ");

  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-3" aria-label="Submit to MSP">
      <h3 className="text-sm font-semibold text-[#0F172A]">Submit to MSP</h3>
      <p className="mt-1 text-xs leading-5 text-[#64748B]">
        {variantLabel
          ? `Packet for this requisition: ${variantLabel}.`
          : "Packet requirements come from the workflow’s required Submit to MSP task."}{" "}
        Presented to Client, client interview, and MSP or client rejection stay separate stages.
        {view.decision.externalResponseAdvancesStage
          ? ""
          : " An external MSP response does not move this candidate."}
      </p>

      {submission ? (
        <dl className="mt-3 space-y-1 text-xs text-[#334155]">
          <div>
            <dt className="inline font-medium">Status: </dt>
            <dd className="inline">Submitted</dd>
          </div>
          <div>
            <dt className="inline font-medium">Submitted: </dt>
            <dd className="inline">{new Date(submission.submittedAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Requisition: </dt>
            <dd className="inline">{submission.jobRequisitionId}</dd>
          </div>
          {submission.mspReference ? (
            <div>
              <dt className="inline font-medium">MSP reference: </dt>
              <dd className="inline">{submission.mspReference}</dd>
            </div>
          ) : null}
          {submission.notes ? (
            <div>
              <dt className="font-medium">Notes</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-[#475569]">{submission.notes}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <ul className="mt-3 space-y-1.5">
        {view.decision.checks.map((check) => (
          <li key={check.id} className="text-xs leading-5 text-[#334155]">
            <span className={check.ok ? "font-medium text-[#047857]" : "font-medium text-[#B45309]"}>
              {check.ok ? "Ready" : "Missing"}
            </span>
            <span className="mx-1">·</span>
            <span className="font-medium">{check.label}.</span> {check.detail}
          </li>
        ))}
      </ul>

      {view.decision.blockers.length > 0 && !submission ? (
        <p className="mt-3 text-xs leading-5 text-[#9A3412]">
          {view.decision.blockers.map((blocker) => blocker.message).join(" ")}
        </p>
      ) : null}

      {submission ? null : (
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-medium text-[#334155]">
            MSP reference
            <input
              value={mspReference}
              onChange={(event) => setMspReference(event.target.value)}
              maxLength={200}
              className="mt-1 h-9 w-full rounded-lg border border-[#CBD5E1] px-2 text-sm"
              placeholder="Portal id or confirmation"
            />
          </label>
          <label className="block text-xs font-medium text-[#334155]">
            Notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={4000}
              rows={3}
              className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-2 py-1.5 text-sm"
              placeholder="Optional note stored with the submission"
            />
          </label>
          <button
            type="button"
            disabled={!view.decision.ready || busy}
            onClick={() => void submit()}
            className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-[#0F172A] px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Submitting…" : "Submit to MSP"}
          </button>
        </div>
      )}
    </section>
  );
}

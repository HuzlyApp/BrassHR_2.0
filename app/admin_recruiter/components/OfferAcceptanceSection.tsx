"use client";

import type { OfferDecision, OfferDetails } from "@/lib/onboarding/offer-acceptance";

const OFFER_FIELDS: Array<{ key: keyof OfferDetails; label: string; date?: boolean }> = [
  { key: "position", label: "Position" },
  { key: "jobNumber", label: "Requisition" },
  { key: "client", label: "Client" },
  { key: "location", label: "Location" },
  { key: "employmentType", label: "Employment type" },
  { key: "schedule", label: "Schedule" },
  { key: "compensation", label: "Compensation" },
  { key: "startDate", label: "Start date", date: true },
];

function formatDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function OfferAcceptanceSection({
  offer,
}: {
  offer: { details: OfferDetails | null; decision: OfferDecision | null };
}) {
  const { details, decision } = offer;
  const decidedAt = formatDateTime(decision?.decidedAt ?? null);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Offer</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        What the candidate sees on their Offer Acceptance screen, from the job requisition.
      </p>

      {decision ? (
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            decision.decision === "accepted"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          <p className="font-medium">
            {decision.decision === "accepted" ? "Candidate accepted the offer" : "Candidate declined the offer"}
            {decidedAt ? ` on ${decidedAt} ET` : ""}.
          </p>
          {decision.reason ? <p className="mt-1 whitespace-pre-wrap">Reason: {decision.reason}</p> : null}
        </div>
      ) : null}

      {details ? (
        <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {OFFER_FIELDS.map((field) => {
            const value = details[field.key];
            return (
              <div key={field.key} className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{field.label}</dt>
                <dd className="mt-0.5 break-words text-sm text-slate-800">
                  {value ? (field.date ? formatDate(value) : value) : "—"}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-slate-600">This application isn&apos;t linked to a job requisition.</p>
      )}
    </section>
  );
}

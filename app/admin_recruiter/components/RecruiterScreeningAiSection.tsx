"use client";

import Link from "next/link";
import { ExternalLink, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applicationAiAnalysisHref } from "@/app/admin_recruiter/applications/CandidateAiAnalysisButton";
import type { MatchAnalysisWorkspacePayload } from "@/app/admin_recruiter/applications/ai-analysis/use-match-analysis-workspace";
import { formatMatchModelLabel } from "@/lib/jobs/match-analysis/display";
import { fitBandTagClassName } from "@/lib/jobs/match-analysis/progression";
import {
  summarizeQuickMatch,
  type QuickMatchStatusTone,
} from "@/lib/jobs/match-analysis/quick-match-summary";
import {
  CALL_CONTEXT_QUESTION_KEY,
  CALL_CONTEXT_QUESTION_TEXT,
} from "@/lib/jobs/match-analysis/workspace";

const STATUS_TONE: Record<QuickMatchStatusTone, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/25",
  info: "bg-blue-50 text-blue-700 ring-blue-600/25",
  danger: "bg-red-50 text-red-700 ring-red-600/25",
  neutral: "bg-slate-100 text-slate-700 ring-slate-500/25",
};

const AREA =
  "w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[color:var(--brand-primary)]";

function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Card({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-800">{value}</dd>
    </div>
  );
}

/**
 * Recruiter Screening step: AI Analysis Step 1 result, the Step 2 call pack, and call context.
 * Reads and writes the same records as the AI Analysis screen, so edits show in both places.
 */
export default function RecruiterScreeningAiSection({
  applicationId,
  isRejected = false,
  reviewNote = null,
}: {
  applicationId: string;
  isRejected?: boolean;
  reviewNote?: string | null;
}) {
  const [data, setData] = useState<MatchAnalysisWorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [callContext, setCallContext] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ tone: "success" | "error"; text: string } | null>(
    null
  );
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const callContextRef = useRef(callContext);
  callContextRef.current = callContext;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationId)}/match-analysis`,
        { cache: "no-store", credentials: "include" }
      );
      const json = (await res.json().catch(() => ({}))) as MatchAnalysisWorkspacePayload & {
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Failed to load AI analysis");
      setData(json);
      const next: Record<string, string> = {};
      for (const item of json.recommendedQuestions ?? []) next[item.key] = item.answer ?? "";
      setAnswers(next);
      setCallContext(json.callContext ?? "");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load AI analysis");
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const questions = useMemo(() => data?.recommendedQuestions ?? [], [data?.recommendedQuestions]);
  const summary = useMemo(
    () =>
      data
        ? summarizeQuickMatch({
            application: data.application,
            requirements: data.requirements ?? [],
            analysisHistory: data.analysisHistory,
            progressionStage: data.matchProgression?.stage ?? null,
          })
        : null,
    [data]
  );

  const savedAnswers = useMemo(() => {
    const map = new Map(questions.map((item) => [item.key, (item.answer ?? "").trim()]));
    map.set(CALL_CONTEXT_QUESTION_KEY, (data?.callContext ?? "").trim());
    return map;
  }, [questions, data?.callContext]);

  const dirty =
    callContext.trim() !== savedAnswers.get(CALL_CONTEXT_QUESTION_KEY) ||
    questions.some((item) => (answers[item.key] ?? "").trim() !== savedAnswers.get(item.key));

  async function save() {
    if (!data) return;
    const currentAnswers = answersRef.current;
    const currentContext = callContextRef.current;
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationId)}/screening-answers`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callContext: currentContext,
            recommendedAnswers: [
              ...questions.map((item) => ({
                key: item.key,
                question: item.question,
                priority: item.priority,
                answer: currentAnswers[item.key] ?? "",
              })),
              {
                key: CALL_CONTEXT_QUESTION_KEY,
                question: CALL_CONTEXT_QUESTION_TEXT,
                answer: currentContext,
              },
            ],
          }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        recommendedAnswers?: Array<{ key: string; answer: string }>;
      };
      if (!res.ok) throw new Error(json.error || "Failed to save screening answers");
      const byKey = new Map((json.recommendedAnswers ?? []).map((item) => [item.key, item.answer ?? ""]));
      setData((current) =>
        current
          ? {
              ...current,
              callContext: byKey.get(CALL_CONTEXT_QUESTION_KEY) ?? currentContext,
              recommendedQuestions: (current.recommendedQuestions ?? []).map((item) => ({
                ...item,
                answer: byKey.get(item.key) ?? currentAnswers[item.key] ?? item.answer,
              })),
            }
          : current
      );
      setSaveMessage({ tone: "success", text: "Saved. AI Analysis shows the same answers." });
    } catch (error) {
      setSaveMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to save screening answers",
      });
    } finally {
      setSaving(false);
    }
  }

  function saveIfChanged(key: string, value: string) {
    if (value.trim() === (savedAnswers.get(key) ?? "")) return;
    void save();
  }

  const aiHref = applicationAiAnalysisHref(applicationId, data?.job?.id ?? undefined);
  const openAiLink = (
    <Link
      href={aiHref}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--brand-primary)] hover:underline"
    >
      Open AI Analysis
      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );

  if (loading) {
    return (
      <div className="space-y-3" aria-busy>
        <div className="h-24 animate-pulse rounded-xl bg-slate-200/70" />
        <div className="h-40 animate-pulse rounded-xl bg-slate-200/70" />
      </div>
    );
  }

  if (loadError || !data || !summary) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <span>{loadError ?? "AI analysis isn't available for this application."}</span>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs font-semibold underline underline-offset-2"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <Card title="Step 1 · Quick Match result" subtitle="From AI Analysis" action={openAiLink}>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_TONE[summary.statusTone]}`}
          >
            {summary.statusLabel}
          </span>
          {summary.fitBand && summary.fitLabel ? (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${fitBandTagClassName(summary.fitBand)}`}
            >
              {summary.fitLabel} fit
            </span>
          ) : null}
        </div>
        {summary.analyzed ? (
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Quick Match run" value={formatWhen(summary.quickMatchAt)} />
            <Stat label="Current AI step" value={summary.currentStepLabel} />
            <Stat label="Model" value={summary.model ? formatMatchModelLabel(summary.model) : "—"} />
            <Stat label="Confirmed" value={summary.counts.confirmed} />
            <Stat label="Need verification" value={summary.counts.verify} />
            <Stat
              label="Not met"
              value={
                <span className={summary.counts.notMet ? "font-semibold text-red-700" : undefined}>
                  {summary.counts.notMet}
                </span>
              }
            />
            <Stat
              label="Mandatory confirmed"
              value={`${summary.counts.mandatoryConfirmed} of ${summary.counts.mandatory}`}
            />
          </dl>
        ) : (
          <p className="mt-3 text-sm text-slate-600">
            Quick Match hasn&apos;t run for this application yet. Run it from AI Analysis to fill the checklist.
          </p>
        )}
        {summary.error ? <p className="mt-3 text-xs text-red-700">{summary.error}</p> : null}
      </Card>

      <Card
        title="Step 2 · Call notes"
        // subtitle={
        //   questions.length
        //     ? `${questions.length} targeted question${questions.length === 1 ? "" : "s"} to confirm on the call`
        //     : undefined
        // }
      >
        {/* Screening questions are hidden in the Pre-Hire modal; only call notes are shown.
        {questions.length ? (
          <ol className="space-y-3">
            {questions.map((item, index) => (
              <li key={item.key} className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-3">
                <div className="flex items-start gap-2.5">
                  <span
                    aria-hidden
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--brand-primary)] text-xs font-semibold text-[color:var(--brand-primary)]"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{item.question}</p>
                    {item.reason ? (
                      <p className="mt-1 text-xs text-slate-600">
                        <span className="font-medium">Why this matters:</span> {item.reason}
                      </p>
                    ) : null}
                    <label className="mt-2 block">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Candidate answer
                      </span>
                      <textarea
                        value={answers[item.key] ?? ""}
                        onChange={(event) =>
                          setAnswers((current) => ({ ...current, [item.key]: event.target.value }))
                        }
                        onBlur={(event) => saveIfChanged(item.key, event.target.value)}
                        rows={2}
                        placeholder="Record the candidate’s answer from the call…"
                        className={`${AREA} min-h-[4rem]`}
                      />
                    </label>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-600">
            No screening questions yet. Open the Verifications step in AI Analysis to generate the call pack.
          </p>
        )}
        */}
        {isRejected ? (
          <div>
            <p className="text-sm font-semibold text-slate-900">Rejected by recruiter</p>
            <p className="mt-2 text-sm text-slate-700">Notes: {reviewNote ?? "—"}</p>
          </div>
        ) : (
          <>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Tone, availability &amp; call notes
              </span>
              <textarea
                value={callContext}
                onChange={(event) => setCallContext(event.target.value)}
                onBlur={(event) => saveIfChanged(CALL_CONTEXT_QUESTION_KEY, event.target.value)}
                rows={3}
                placeholder="Tone, availability, red flags, client-fit notes, anything the model should use next…"
                className={`${AREA} min-h-[5rem]`}
              />
            </label>
    
            <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
              {saveMessage ? (
                <p
                  role="status"
                  className={`text-xs ${saveMessage.tone === "success" ? "text-emerald-700" : "text-red-700"}`}
                >
                  {saveMessage.text}
                </p>
              ) : null}
              <button
                type="button"
                disabled={saving || !dirty}
                onClick={() => void save()}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:bg-slate-50 disabled:opacity-50"
            style={{ borderColor: "var(--brand-primary)", color: "var(--brand-primary)" }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {saving ? "Saving…" : "Save call notes"}
          </button>
        </div>
          </>
        )}
      </Card>
    </>
  );
}

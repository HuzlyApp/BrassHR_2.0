import { matchWorkspaceIsAnalyzed } from "@/lib/jobs/match-analysis/match-stage";
import {
  MATCH_PROGRESSION_STEPS,
  fitBandLabel,
  listingDisplayFitBand,
  matchProgressionIndexFromStage,
  type QuickMatchFitBand,
} from "@/lib/jobs/match-analysis/progression";
import { fitBandFromQuickRoute, quickRouteFromAnalysis } from "@/lib/jobs/match-analysis/quick-route";
import {
  countQualificationOutcomes,
  type QualificationOutcomeCounts,
} from "@/lib/jobs/match-analysis/workspace";

export type QuickMatchStatusTone = "success" | "info" | "danger" | "neutral";

export type QuickMatchSummary = {
  analyzed: boolean;
  statusLabel: string;
  statusTone: QuickMatchStatusTone;
  /** Step 1 fit (Strong / Review / Low); null until Quick Match has run. */
  fitBand: QuickMatchFitBand | null;
  fitLabel: string | null;
  /** AI step the application is on now, e.g. "Step 2 · Verifications". */
  currentStepLabel: string;
  quickMatchAt: string | null;
  model: string | null;
  error: string | null;
  counts: QualificationOutcomeCounts;
};

type HistoryRow = {
  analyzed_at: string;
  model: string | null;
  analysis?: unknown;
};

export type QuickMatchSummaryInput = {
  application: {
    ai_match_status: string | null;
    ai_match_stage?: string | null;
    ai_analysis: Record<string, unknown> | null;
    ai_analysis_error: string | null;
    ai_analysis_model: string | null;
    ai_analyzed_at?: string | null;
  };
  requirements: Parameters<typeof countQualificationOutcomes>[0];
  analysisHistory?: HistoryRow[];
  progressionStage?: string | null;
};

function blockingRequirements(analysis: unknown): string[] {
  if (!analysis || typeof analysis !== "object") return [];
  const readiness = (analysis as { submission_readiness?: { blocking_requirements?: unknown } })
    .submission_readiness;
  return Array.isArray(readiness?.blocking_requirements)
    ? readiness.blocking_requirements.map(String)
    : [];
}

/** Deep Match runs write a recruiter summary; Quick Match runs do not. */
function isQuickMatchRun(analysis: unknown): boolean {
  if (!quickRouteFromAnalysis(analysis)) return false;
  const summary = (analysis as { candidate_match?: { recruiter_decision_summary?: unknown } })
    .candidate_match?.recruiter_decision_summary;
  return !String(summary ?? "").trim();
}

function latestQuickMatchRun(history: HistoryRow[]): HistoryRow | null {
  const runs = history.filter((row) => row.analyzed_at && isQuickMatchRun(row.analysis));
  if (!runs.length) return null;
  return runs.reduce((latest, row) =>
    new Date(row.analyzed_at).getTime() > new Date(latest.analyzed_at).getTime() ? row : latest
  );
}

function statusFor(status: string, analyzed: boolean): { label: string; tone: QuickMatchStatusTone } {
  if (status === "ANALYZING") return { label: "Analyzing", tone: "info" };
  if (status === "FAILED") return { label: "Failed", tone: "danger" };
  if (analyzed) return { label: "Completed", tone: "success" };
  return { label: "Not analyzed", tone: "neutral" };
}

export function summarizeQuickMatch(input: QuickMatchSummaryInput): QuickMatchSummary {
  const app = input.application;
  const stage = app.ai_match_stage ?? input.progressionStage ?? null;
  const status = String(app.ai_match_status ?? "").trim().toUpperCase();
  const analyzed = matchWorkspaceIsAnalyzed({
    status,
    stage,
    hasAnalysis: Boolean(app.ai_analysis),
  });
  const counts = countQualificationOutcomes(input.requirements, blockingRequirements(app.ai_analysis));
  const route = quickRouteFromAnalysis(app.ai_analysis);

  const fitBand: QuickMatchFitBand | null = analyzed
    ? listingDisplayFitBand({
        analyzed,
        stage: "quick",
        counts: { ...counts, quickRoute: route },
      }) ?? (route ? fitBandFromQuickRoute(route) : "review")
    : null;

  const run = latestQuickMatchRun(input.analysisHistory ?? []);
  const atQuickStep = matchProgressionIndexFromStage(stage) === 0;
  const quickMatchAt = run?.analyzed_at ?? (analyzed && atQuickStep ? app.ai_analyzed_at ?? null : null);
  const step = MATCH_PROGRESSION_STEPS[matchProgressionIndexFromStage(stage)];
  const { label, tone } = statusFor(status, analyzed);

  return {
    analyzed,
    statusLabel: label,
    statusTone: tone,
    fitBand,
    fitLabel: fitBand ? fitBandLabel(fitBand) : null,
    currentStepLabel: analyzed && step ? `Step ${step.stepNumber} · ${step.label}` : "Not started",
    quickMatchAt,
    model: run?.model ?? (atQuickStep ? app.ai_analysis_model : null) ?? null,
    error: app.ai_analysis_error?.trim() || null,
    counts,
  };
}

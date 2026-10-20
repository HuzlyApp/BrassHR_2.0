/**
 * Candidates Analyze KPI metric definitions (source of truth for UI + API).
 *
 * Scope (All Candidates / status tabs):
 * - Source table: `public.worker`
 * - Tenant filter: `worker.tenant_id = current tenant`
 * - Active pipeline only when no status tab: status IN
 *   (new, pending, under_review, for_approval, approved, disapproved) OR NULL
 * - Exclude converted: `status <> converted` AND no row in `public.workers`
 *   with `candidate_id = worker.id`
 * - Status tabs add an exact pipeline status filter (pending includes under_review)
 *
 * Each metric counts a candidate profile at most once (email / phone+name identity).
 * Server path: `public.candidate_kpi_metrics` RPC (preferred) with JS paged fallback.
 */

import type { CandidateKpiCard } from "@/app/admin_recruiter/candidates/candidate-kpis";

export const CANDIDATE_KPI_WINDOW_DAYS = 30;

export type CandidateKpiMetricKey =
  | "newCandidates"
  | "activeCandidates"
  | "analyzed"
  | "hired";

export type CandidateKpiMetricDefinition = {
  key: CandidateKpiMetricKey;
  label: string;
  /** Primary table(s) used for the count. */
  sourceTable: string;
  /** Required filters beyond tenant + conversion scope. */
  requiredFilters: string[];
  /** How rows are counted. */
  countingMethod: string;
  /** Denominator for percentages / trends (never divide by zero). */
  denominator: string;
  /** Duplicate / archived / deleted handling. */
  duplicateHandling: string;
};

export const CANDIDATE_KPI_DEFINITIONS: CandidateKpiMetricDefinition[] = [
  {
    key: "newCandidates",
    label: "New Candidates",
    sourceTable: "public.worker",
    requiredFilters: [
      "tenant-scoped active pipeline (excl. converted / employment)",
      "created_at within the last 30 days (value)",
    ],
    countingMethod: "COUNT of unique candidate profiles created in the last 30 days",
    denominator: "Prior 30-day window count for trend % (0 → 100% if current > 0, else 0)",
    duplicateHandling:
      "One profile per email, or phone+name when email is blank; converted/employment excluded",
  },
  {
    key: "activeCandidates",
    label: "Active Candidates",
    sourceTable: "public.worker",
    requiredFilters: [
      "tenant-scoped active pipeline (excl. converted / employment)",
      "status NOT IN (disapproved, rejected)",
    ],
    countingMethod: "COUNT of unique active candidate profiles (all-time for value)",
    denominator: "Prior 30-day created_at window among active for trend %",
    duplicateHandling:
      "One profile per email, or phone+name when email is blank; rejected/disapproved excluded",
  },
  {
    key: "analyzed",
    label: "Analyzed",
    sourceTable: "public.job_applications (+ worker base set)",
    requiredFilters: [
      "worker in base set",
      "ai_match_status = ANALYZED",
      "application status NOT IN (rejected, withdrawn)",
    ],
    countingMethod:
      "COUNT of unique candidate profiles with at least one ANALYZED application; trend uses MAX(ai_analyzed_at)",
    denominator: "Prior 30-day analyzed_at window for trend %",
    duplicateHandling:
      "Duplicate worker rows for the same person collapse to one profile; rejected/withdrawn apps ignored",
  },
  {
    key: "hired",
    label: "Hired",
    sourceTable: "public.workers (employment conversions)",
    requiredFilters: ["tenant_id = current tenant", "candidate_id IS NOT NULL"],
    countingMethod: "COUNT(*) of employment rows linked to a candidate",
    denominator: "Prior 30-day workers.created_at window for trend %",
    duplicateHandling:
      "Unique candidate_id on workers; candidates no longer on the active list still count as hired",
  },
];

export type CandidateKpiMetricBucket = {
  value: number;
  previous?: number;
  currentWindow?: number;
  previousWindow?: number;
};

export type CandidateKpiMetricsPayload = {
  newCandidates: CandidateKpiMetricBucket;
  activeCandidates: CandidateKpiMetricBucket;
  analyzed: CandidateKpiMetricBucket;
  hired: CandidateKpiMetricBucket;
  totalCandidates?: number;
};

export function percentChangeSafe(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export function trendFromBucket(bucket: CandidateKpiMetricBucket): number {
  if (typeof bucket.previous === "number") {
    return percentChangeSafe(bucket.value, bucket.previous);
  }
  return percentChangeSafe(bucket.currentWindow ?? 0, bucket.previousWindow ?? 0);
}

const ICONS = "/icons/candidates-icons";

function emptyBucket(): CandidateKpiMetricBucket {
  return { value: 0, previous: 0, currentWindow: 0, previousWindow: 0 };
}

export function emptyCandidateKpiMetricsPayload(): CandidateKpiMetricsPayload {
  return {
    newCandidates: emptyBucket(),
    activeCandidates: emptyBucket(),
    analyzed: emptyBucket(),
    hired: emptyBucket(),
    totalCandidates: 0,
  };
}

function asBucket(value: unknown): CandidateKpiMetricBucket {
  if (!value || typeof value !== "object") return emptyBucket();
  const row = value as Record<string, unknown>;
  return {
    value: Number(row.value) || 0,
    previous: row.previous == null ? undefined : Number(row.previous) || 0,
    currentWindow: row.currentWindow == null ? undefined : Number(row.currentWindow) || 0,
    previousWindow: row.previousWindow == null ? undefined : Number(row.previousWindow) || 0,
  };
}

export function normalizeCandidateKpiMetricsPayload(raw: unknown): CandidateKpiMetricsPayload {
  if (!raw || typeof raw !== "object") return emptyCandidateKpiMetricsPayload();
  const row = raw as Record<string, unknown>;
  return {
    newCandidates: asBucket(row.newCandidates),
    activeCandidates: asBucket(row.activeCandidates),
    analyzed: asBucket(row.analyzed),
    hired: asBucket(row.hired),
    totalCandidates: Number(row.totalCandidates) || 0,
  };
}

export function buildCandidateKpiCardsFromMetrics(
  metrics: CandidateKpiMetricsPayload
): CandidateKpiCard[] {
  return [
    {
      label: "New Candidates",
      value: metrics.newCandidates.value,
      trendPercent: trendFromBucket(metrics.newCandidates),
      icon: { src: `${ICONS}/kpi-group.svg`, bg: "#e2d8ff", leafWidth: 25, leafHeight: 26.02 },
    },
    {
      label: "Active Candidates",
      value: metrics.activeCandidates.value,
      trendPercent: trendFromBucket(metrics.activeCandidates),
      icon: { src: `${ICONS}/kpi-person-clock.svg`, bg: "#f2f6ff", leafWidth: 30, leafHeight: 30 },
    },
    {
      label: "Analyzed",
      value: metrics.analyzed.value,
      trendPercent: trendFromBucket(metrics.analyzed),
      icon: { src: `${ICONS}/kpi-ai-line.svg`, bg: "#fbe9ff", leafWidth: 30, leafHeight: 30 },
    },
    {
      label: "Hired",
      value: metrics.hired.value,
      trendPercent: trendFromBucket(metrics.hired),
      icon: { src: `${ICONS}/kpi-person-check.svg`, bg: "#c7fff8", leafWidth: 24.67, leafHeight: 27.5 },
    },
  ];
}

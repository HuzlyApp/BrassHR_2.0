"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildCandidateKpiCardsFromMetrics,
  emptyCandidateKpiMetricsPayload,
  normalizeCandidateKpiMetricsPayload,
  type CandidateKpiMetricsPayload,
} from "@/lib/workers/candidate-kpi-metrics";
import type { CandidateKpiCard } from "@/app/admin_recruiter/candidates/candidate-kpis";

const EMPTY_KPI_CARDS = buildCandidateKpiCardsFromMetrics(emptyCandidateKpiMetricsPayload());

/** Keep counts warm across Candidate tab navigations; revalidate in the background. */
export const CANDIDATE_KPI_STALE_TIME_MS = 60_000;
export const CANDIDATE_KPI_GC_TIME_MS = 5 * 60_000;

export function candidateKpiQueryKey(status?: string) {
  return ["candidate-kpi-metrics", status?.trim() || "all"] as const;
}

type CandidateKpiResponse = {
  metrics: CandidateKpiMetricsPayload;
  cards: CandidateKpiCard[];
};

async function fetchCandidateKpiMetrics(status: string): Promise<CandidateKpiResponse> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const res = await fetch(`/api/workers/metrics?${params}`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Failed to load metrics");
  const nextMetrics = normalizeCandidateKpiMetricsPayload(data?.metrics);
  const nextCards =
    Array.isArray(data?.cards) && data.cards.length === 4
      ? (data.cards as CandidateKpiCard[])
      : buildCandidateKpiCardsFromMetrics(nextMetrics);
  return { metrics: nextMetrics, cards: nextCards };
}

export function useCandidateKpiMetrics(options?: {
  status?: string;
  enabled?: boolean;
}): {
  kpiCards: CandidateKpiCard[];
  metrics: CandidateKpiMetricsPayload | null;
  loading: boolean;
  isFetching: boolean;
  hasData: boolean;
  refresh: () => void;
} {
  const status = options?.status?.trim() || "";
  const enabled = options?.enabled !== false;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: candidateKpiQueryKey(status),
    queryFn: () => fetchCandidateKpiMetrics(status),
    enabled,
    staleTime: CANDIDATE_KPI_STALE_TIME_MS,
    gcTime: CANDIDATE_KPI_GC_TIME_MS,
    refetchOnMount: true,
    retry: 1,
  });

  const hasData = Boolean(query.data);
  const kpiCards = query.data?.cards ?? EMPTY_KPI_CARDS;
  const metrics = query.data?.metrics ?? (query.isError ? emptyCandidateKpiMetricsPayload() : null);
  // Initial load only — keep previous values visible during background revalidation.
  const loading = query.isLoading && !hasData;

  return {
    kpiCards,
    metrics,
    loading,
    isFetching: query.isFetching,
    hasData,
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: candidateKpiQueryKey(status) });
    },
  };
}

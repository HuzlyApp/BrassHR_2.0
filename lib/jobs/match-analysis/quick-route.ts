import type {
  QuickMatchResponse,
  QuickRoute,
  RequirementStatus,
} from "./schema";

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function statusWeight(status: RequirementStatus): number | null {
  if (status === "NOT_APPLICABLE") return null;
  if (status === "CONFIRMED") return 1;
  if (status === "PARTIAL") return 0.5;
  return 0;
}

function averageWeights(rows: Array<{ status: RequirementStatus }>): {
  average: number;
  scored: number;
  confirmed: number;
} {
  let sum = 0;
  let scored = 0;
  let confirmed = 0;
  for (const row of rows) {
    const weight = statusWeight(row.status);
    if (weight == null) continue;
    sum += weight;
    scored += 1;
    if (row.status === "CONFIRMED") confirmed += 1;
  }
  return {
    average: scored === 0 ? 0 : round4(sum / scored),
    scored,
    confirmed,
  };
}

/**
 * The model may downgrade to LOW_MATCH (e.g. core seat PARTIAL / NOT_FOUND, which the
 * app cannot see from row statuses). It can never upgrade to STRONG.
 */
export function recomputeQuickMatchMetrics(
  input: Pick<
    QuickMatchResponse,
    "mandatory_requirements" | "preferred_requirements" | "blocking_requirements"
  > & { quick_route?: QuickRoute }
): {
  counts: NonNullable<QuickMatchResponse["counts"]>;
  mand_met: number;
  pref_met: number;
  weighted: number;
  quick_route: QuickRoute;
} {
  const mandatory = input.mandatory_requirements ?? [];
  const preferred = input.preferred_requirements ?? [];
  const blockers = (input.blocking_requirements ?? []).map((item) => item.trim()).filter(Boolean);

  let confirmed = 0;
  let partial = 0;
  let notFound = 0;
  let conflicting = 0;
  for (const row of mandatory) {
    if (row.status === "NOT_APPLICABLE") continue;
    if (row.status === "CONFIRMED") confirmed += 1;
    else if (row.status === "PARTIAL") partial += 1;
    else if (row.status === "NOT_FOUND") notFound += 1;
    else if (row.status === "CONFLICTING") conflicting += 1;
  }

  let preferredConfirmed = 0;
  let preferredTotal = 0;
  for (const row of preferred) {
    if (row.status === "NOT_APPLICABLE") continue;
    preferredTotal += 1;
    if (row.status === "CONFIRMED") preferredConfirmed += 1;
  }

  const mand = averageWeights(mandatory);
  const pref = averageWeights(preferred);
  const mandMet = mand.average;
  const prefMet = pref.scored === 0 ? 0 : pref.average;
  const weighted = pref.scored === 0 ? mandMet : round4(0.8 * mandMet + 0.2 * prefMet);
  const confirmedShare = mand.scored === 0 ? 0 : mand.confirmed / mand.scored;

  let quickRoute: QuickRoute = "REVIEW";
  if (
    input.quick_route === "LOW_MATCH" ||
    blockers.length > 0 ||
    weighted <= 0.5 ||
    confirmed === 0 ||
    notFound >= 2
  ) {
    quickRoute = "LOW_MATCH";
  } else if (weighted >= 0.7 && mandMet >= 0.6 && confirmedShare >= 0.5) {
    quickRoute = "STRONG";
  }

  return {
    counts: {
      confirmed,
      partial,
      not_found: notFound,
      conflicting,
      preferred_confirmed: preferredConfirmed,
      preferred_total: preferredTotal,
    },
    mand_met: mandMet,
    pref_met: prefMet,
    weighted,
    quick_route: quickRoute,
  };
}

export function fitBandFromQuickRoute(route: QuickRoute): "strong" | "review" | "low" {
  if (route === "STRONG") return "strong";
  if (route === "LOW_MATCH") return "low";
  return "review";
}

export function parseQuickRoute(value: unknown): QuickRoute | null {
  if (value === "STRONG" || value === "REVIEW" || value === "LOW_MATCH") return value;
  return null;
}

export function quickRouteFromAnalysis(analysis: unknown): QuickRoute | null {
  if (!analysis || typeof analysis !== "object") return null;
  const nested = (analysis as { quick_match?: { quick_route?: unknown } }).quick_match;
  return parseQuickRoute(nested?.quick_route);
}

/** History rows store the route on the version; older payloads only have the analysis blob. */
export function resolveHistoryQuickRoute(input: {
  quick_route?: unknown;
  analysis?: unknown;
}): QuickRoute | null {
  return parseQuickRoute(input.quick_route) ?? quickRouteFromAnalysis(input.analysis);
}

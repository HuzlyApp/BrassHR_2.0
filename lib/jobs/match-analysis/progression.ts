/**
 * Recruiter-facing AI match progression (FS-AI-MATCH-001).
 * Visual order: Quick Match → Verifications → Follow-Up → Deep Match → Submission.
 *
 * Later paid steps do not unlock from application status. The recruiter must
 * push the candidate forward through Verifications and Follow-Up. Any fit band
 * (including low) may run Deep Match; Talent Pool exits skip later paid AI.
 */

import type { MatchStage } from "./match-stage";
import { parseMatchStage } from "./match-stage";
import { fitBandFromQuickRoute } from "./quick-route";
import type { QuickRoute } from "./schema";

export const MATCH_PROGRESSION_STEPS = [
  {
    id: "quick",
    stage: "quick",
    stepNumber: 1,
    label: "Quick Match",
    subtitle: "Checklist",
    hint: "Step 1 · Quick Match. Checklist only. Ring empty. Low, review, or strong can continue to Verifications. Talent Pool is optional for low fit.",
    sectionId: "match-step-quick",
  },
  {
    id: "verifications",
    stage: "call_pack",
    stepNumber: 2,
    label: "Verifications",
    subtitle: "Screening questions",
    hint: "Step 2 · Verifications unlocked. Documented strengths, verification needed, and screening questions (AI).",
    sectionId: "match-step-verifications",
  },
  {
    id: "follow_up",
    stage: "follow_up",
    stepNumber: 3,
    label: "Follow-Up",
    subtitle: "Enrichment",
    hint: "Step 3 · Follow-Up. Use remaining questions from Verifications, record notes, or upload the email reply.",
    sectionId: "match-step-follow-up",
  },
  {
    id: "deep",
    stage: "deep",
    stepNumber: 4,
    label: "Deep Match",
    subtitle: "Candidate match",
    hint: "Step 4 · Deep Match (paid). Confirm Run Deep Match to open this step. Candidate match score fills after the paid run.",
    sectionId: "match-step-deep",
  },
  {
    id: "submission",
    stage: "submission",
    stepNumber: 5,
    label: "Submission",
    subtitle: "Enriched Resume",
    hint: "Step 5 · Submission. Draft the optimized résumé (Word + PDF) here, then email MSP / upload the portal.",
    sectionId: "match-step-submission",
  },
] as const;

export type MatchProgressionStep = (typeof MATCH_PROGRESSION_STEPS)[number];
export type MatchProgressionStepId = MatchProgressionStep["id"];
export type QuickMatchFitBand = "strong" | "review" | "low";

export type MatchProgressionState = {
  isAnalyzed: boolean;
  stage?: string | null;
  hasDeepMatch: boolean;
  parkedInTalentPool?: boolean;
  fitBand?: QuickMatchFitBand;
};

export const MATCH_PROGRESSION_INTRO =
  "Recruiter steps. Use the step bar to open Verifications and Follow-up (including low match). Deep Match asks you to confirm the paid run before that step opens, including for low match. A Talent Pool exit skips later paid AI — it does not fill the ring.";

export const FLOW_DIAMOND_COPY =
  "LOW_MATCH if any skill blocker, core seat not confirmed, weighted ≤ 0.50, confirmed = 0, or not found ≥ 2. STRONG if no blocker, weighted ≥ 0.70, mand_met ≥ 0.60, and confirmed/M ≥ 0.50. Else REVIEW.";

export const DEEP_MATCH_BLOCKED_TALENT_POOL =
  "This candidate is in Talent Pool. Deep Match is skipped for Talent Pool exits.";

export const DEEP_MATCH_BLOCKED_NOT_READY =
  "Finish Verifications and Follow-Up before Run Deep Match.";

export function matchProgressionIndexFromStage(stage: unknown): number {
  const parsed = parseMatchStage(stage);
  if (parsed === "call_pack") return 1;
  if (parsed === "follow_up") return 2;
  if (parsed === "deep") return 3;
  if (parsed === "submission") return 4;
  return 0;
}

export function matchProgressionStageFromIndex(index: number): MatchStage {
  return MATCH_PROGRESSION_STEPS[index]?.stage ?? "quick";
}

type FitCountInput = {
  mandatory: number;
  confirmed: number;
  notMet: number;
  blocking: number;
  /** Confirmed mandatory rows only. Preferred confirmations must not be included. */
  mandatoryConfirmed?: number | null;
  verify?: number | null;
};

function mandatoryConfirmedCount(counts: FitCountInput): number | null {
  if (counts.mandatoryConfirmed == null || Number.isNaN(Number(counts.mandatoryConfirmed))) {
    return null;
  }
  return Number(counts.mandatoryConfirmed);
}

/** Every mandatory row is confirmed, so a stored LOW_MATCH no longer describes the checklist. */
function checklistFullyConfirmed(counts: FitCountInput): boolean {
  if (counts.mandatory <= 0 || counts.notMet !== 0 || counts.blocking !== 0) return false;
  const mandatoryConfirmed = mandatoryConfirmedCount(counts);
  if (mandatoryConfirmed != null) return mandatoryConfirmed >= counts.mandatory;
  if ((counts.verify ?? 0) > 0) return false;
  return counts.confirmed >= counts.mandatory;
}

export function quickMatchFitBand(counts: FitCountInput): QuickMatchFitBand {
  if (counts.blocking > 0 || counts.notMet >= 2) return "low";
  if (counts.notMet === 0 && counts.blocking === 0 && counts.mandatory > 0) {
    const mandatoryConfirmed = mandatoryConfirmedCount(counts);
    if (
      mandatoryConfirmed == null &&
      counts.confirmed > counts.mandatory &&
      (counts.verify ?? 0) > 0
    ) {
      return "review";
    }
    const confirmedForShare = mandatoryConfirmed ?? counts.confirmed;
    if (confirmedForShare / Math.max(counts.mandatory, 1) >= 0.7) return "strong";
  }
  return "review";
}

/**
 * The stored Quick Match route decides the band. A stored LOW_MATCH gives way to
 * Strong only once every mandatory row is confirmed.
 */
function fitBandFromStoredRoute(route: QuickRoute, counts: FitCountInput): QuickMatchFitBand {
  if (route === "LOW_MATCH" && checklistFullyConfirmed(counts)) return "strong";
  return fitBandFromQuickRoute(route);
}

/**
 * The stored Quick Match route (the one Analysis history shows) is the source of truth.
 * Checklist counts are only a fallback for analyses saved without a route.
 */
export function fitBandForMatchGate(args: {
  counts: FitCountInput;
  storedRoute?: QuickRoute | null;
}): QuickMatchFitBand {
  if (args.storedRoute) return fitBandFromStoredRoute(args.storedRoute, args.counts);
  const hasChecklist =
    args.counts.mandatory > 0 ||
    args.counts.confirmed > 0 ||
    args.counts.notMet > 0 ||
    args.counts.blocking > 0;
  if (hasChecklist) return quickMatchFitBand(args.counts);
  return "review";
}

function hasDeepMatchSignal(args: {
  category?: string | null;
  displayCategory?: string | null;
  score?: number | null;
}): boolean {
  if (String(args.category ?? "").trim()) return true;
  if (String(args.displayCategory ?? "").trim()) return true;
  return args.score != null && Number.isFinite(Number(args.score));
}

/**
 * Deep Match uses the scored category when one exists.
 * Reaching Deep Match does not turn a Review checklist into Strong.
 */
export function displayFitBand(args: {
  fitBand: QuickMatchFitBand;
  stage?: string | null;
  hasDeepMatch?: boolean;
  category?: string | null;
  displayCategory?: string | null;
  score?: number | null;
}): QuickMatchFitBand {
  const atDeep =
    Boolean(args.hasDeepMatch) || args.stage === "deep" || args.stage === "submission";
  if (atDeep && hasDeepMatchSignal(args)) {
    return fitBandFromDeepMatchResult({
      category: args.category,
      displayCategory: args.displayCategory,
      score: args.score,
    });
  }
  return args.fitBand;
}

/**
 * After Deep Match, map the scored category (or label/score) onto Strong / Review / Low
 * so the overview badge matches the ring (e.g. Weak Match → Low), not the Quick Match route.
 */
export function fitBandFromDeepMatchResult(args: {
  category?: string | null;
  displayCategory?: string | null;
  score?: number | null;
}): QuickMatchFitBand {
  const category = String(args.category ?? "").trim().toUpperCase();
  if (
    category === "STRONG_MATCH" ||
    category === "GOOD_MATCH"
  ) {
    return "strong";
  }
  if (category === "POSSIBLE_MATCH" || category === "NEEDS_MORE_INFORMATION") {
    return "review";
  }
  if (
    category === "WEAK_MATCH" ||
    category === "NOT_A_MATCH" ||
    category === "NOT_CURRENTLY_SUBMITTABLE"
  ) {
    return "low";
  }

  const label = String(args.displayCategory ?? "").trim().toLowerCase();
  if (label) {
    if (
      label.includes("not a match") ||
      label.includes("weak") ||
      label.includes("low") ||
      label.includes("do not") ||
      label.includes("hold")
    ) {
      return "low";
    }
    if (label.includes("strong") || label.includes("good") || label.includes("best")) {
      return "strong";
    }
    if (label.includes("possible") || label.includes("review") || label.includes("needs")) {
      return "review";
    }
  }

  const score = Number(args.score);
  if (Number.isFinite(score)) {
    if (score >= 75) return "strong";
    if (score >= 60) return "review";
    return "low";
  }

  return "review";
}

/**
 * Before Deep Match, Fit follows the stored Quick Match route so the overview ring,
 * candidate lists, and Analysis history agree. Checklist counts are the fallback
 * when no route was stored, and the band used from Deep Match onward.
 */
export function listingDisplayFitBand(args: {
  analyzed: boolean;
  stage?: string | null;
  category?: string | null;
  displayCategory?: string | null;
  score?: number | null;
  counts?: {
    confirmed?: number | null;
    verify?: number | null;
    notMet?: number | null;
    mandatory?: number | null;
    blocking?: number | null;
    mandatoryConfirmed?: number | null;
    quickRoute?: QuickRoute | null;
  } | null;
}): QuickMatchFitBand | null {
  if (!args.analyzed) return null;
  const confirmed = Number(args.counts?.confirmed ?? 0);
  const verify = Number(args.counts?.verify ?? 0);
  const notMet = Number(args.counts?.notMet ?? 0);
  const mandatory =
    args.counts?.mandatory == null || Number.isNaN(Number(args.counts.mandatory))
      ? null
      : Number(args.counts.mandatory);
  const blocking =
    args.counts?.blocking == null || Number.isNaN(Number(args.counts.blocking))
      ? null
      : Number(args.counts.blocking);
  const mandatoryConfirmed =
    args.counts?.mandatoryConfirmed == null || Number.isNaN(Number(args.counts.mandatoryConfirmed))
      ? null
      : Number(args.counts.mandatoryConfirmed);

  let band: QuickMatchFitBand;
  if (mandatory != null && blocking != null) {
    band = quickMatchFitBand({
      mandatory,
      confirmed,
      notMet,
      blocking,
      mandatoryConfirmed,
      verify,
    });
  } else {
    const total = confirmed + verify + notMet;
    band = "review";
    if (notMet >= 2) band = "low";
    else if (notMet === 0 && verify === 0 && total > 0 && confirmed / total >= 0.7) band = "strong";
  }
  const fitCounts: FitCountInput = {
    mandatory: mandatory ?? 0,
    confirmed,
    notMet,
    blocking: blocking ?? 0,
    mandatoryConfirmed,
    verify,
  };
  const atDeep = args.stage === "deep" || args.stage === "submission";
  const quickRoute = args.counts?.quickRoute;
  if (!atDeep && quickRoute) band = fitBandFromStoredRoute(quickRoute, fitCounts);
  return displayFitBand({
    fitBand: band,
    stage: args.stage,
    category: args.category,
    displayCategory: args.displayCategory,
    score: args.score,
  });
}

export function fitBandLabel(band: QuickMatchFitBand): string {
  if (band === "strong") return "Strong";
  if (band === "low") return "Low";
  return "Review";
}

export function fitBandTagClassName(band: QuickMatchFitBand): string {
  if (band === "strong") return "bg-[#00B135] text-white";
  if (band === "low") return "bg-[#FEE2E2] text-[#991B1B]";
  return "bg-[#FEF9C3] text-[#854D0E]";
}

export function fitBandSortRank(band: QuickMatchFitBand | null | undefined): number | null {
  if (band === "strong") return 3;
  if (band === "review") return 2;
  if (band === "low") return 1;
  return null;
}

export function canAdvanceMatchProgression(args: {
  isAnalyzed: boolean;
  fitBand: QuickMatchFitBand;
  parkedInTalentPool?: boolean;
}): boolean {
  if (args.parkedInTalentPool) return false;
  if (!args.isAnalyzed) return false;
  // Low fit may still open Verifications / Follow-up.
  return true;
}

/** Any fit band, including low, may run Deep Match once Follow-Up is unlocked. */
export function canRunDeepMatch(args: {
  isAnalyzed: boolean;
  unlockedIndex: number;
  parkedInTalentPool?: boolean;
}): boolean {
  if (args.parkedInTalentPool) return false;
  if (!args.isAnalyzed) return false;
  return args.unlockedIndex >= 2;
}

export function deepMatchBlockReason(args: {
  isAnalyzed: boolean;
  unlockedIndex: number;
  parkedInTalentPool?: boolean;
}): string | null {
  if (args.parkedInTalentPool) return DEEP_MATCH_BLOCKED_TALENT_POOL;
  if (!args.isAnalyzed) return "Run Quick Match before Deep Match.";
  if (args.unlockedIndex < 2) return DEEP_MATCH_BLOCKED_NOT_READY;
  return null;
}

/** Highest step the recruiter has earned. Status changes do not skip ahead. */
export function matchProgressionFurthestIndex(state: MatchProgressionState): number {
  if (!state.isAnalyzed) return 0;
  const fromStage = matchProgressionIndexFromStage(state.stage);
  if (state.hasDeepMatch) return Math.max(fromStage, 3);
  return fromStage;
}

export function matchProgressionInitialIndex(state: MatchProgressionState): number {
  return matchProgressionFurthestIndex(state);
}

export function canSelectMatchProgressionStep(args: {
  index: number;
  unlockedIndex: number;
  canAdvance: boolean;
}): boolean {
  const { index, unlockedIndex, canAdvance } = args;
  if (!Number.isInteger(index) || index < 0 || index >= MATCH_PROGRESSION_STEPS.length) {
    return false;
  }
  if (index <= unlockedIndex) return true;
  return canAdvance && index === unlockedIndex + 1;
}

/** Step 4 is paid. Clicking it must confirm Deep Match, not preview the empty panel. */
export function matchProgressionStepRequiresDeepConfirm(args: {
  index: number;
  unlockedIndex: number;
}): boolean {
  return args.index === 3 && args.unlockedIndex < 3;
}

/** Ask before Follow-up if the Qualification Checklist still has items to confirm. */
export function matchProgressionFollowUpNeedsConfirm(verifyCount: number): boolean {
  return Number.isFinite(verifyCount) && verifyCount > 0;
}

export function matchProgressionStepAt(index: number): MatchProgressionStep | null {
  return MATCH_PROGRESSION_STEPS[index] ?? null;
}

export type MatchProgressionPrimaryAction =
  | { kind: "advance"; label: string; nextIndex: number }
  | { kind: "deep"; label: "Run Deep Match" }
  | { kind: "draft"; label: "Draft submission résumé" }
  | { kind: "msp"; label: "Email MSP / upload portal" };

export function matchProgressionPrimaryAction(
  viewedIndex: number,
  opts?: { hasSubmissionResume?: boolean }
): MatchProgressionPrimaryAction | null {
  if (viewedIndex <= 0) return { kind: "advance", label: "Continue to Verifications", nextIndex: 1 };
  if (viewedIndex === 1) return { kind: "advance", label: "Continue to Follow-up", nextIndex: 2 };
  // Steps 4–5: draft lives in the Submission section only — not the overview header.
  if (viewedIndex === 2 || viewedIndex === 3) return null;
  if (viewedIndex >= 4) {
    if (!opts?.hasSubmissionResume) return null;
    return { kind: "msp", label: "Email MSP / upload portal" };
  }
  return null;
}

/** @deprecated Use matchProgressionPrimaryAction */
export function continueMatchProgressionLabel(viewedIndex: number): string | null {
  return matchProgressionPrimaryAction(viewedIndex)?.label ?? null;
}

export function nextMatchProgressionIndex(unlockedIndex: number): number | null {
  if (unlockedIndex >= MATCH_PROGRESSION_STEPS.length - 1) return null;
  return unlockedIndex + 1;
}

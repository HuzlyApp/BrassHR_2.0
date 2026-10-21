import { selectWorkflowScopedLaneRows } from "./stage-status-lanes";

/** Reason codes are stored separately for Alternate and Closing. */

export const REASON_CODE_LANES = ["alternate", "closed"] as const;
export type ReasonCodeLane = (typeof REASON_CODE_LANES)[number];

export function isReasonCodeLane(value: unknown): value is ReasonCodeLane {
  return value === "alternate" || value === "closed";
}

export function normalizeReasonCodeLane(value: string | null | undefined): ReasonCodeLane | null {
  if (value === "alternate" || value === "closed") return value;
  return null;
}

/** Missing lane is the closing list. That is where the original shared codes belong. */
export function reasonCodeLaneOf(value: string | null | undefined): ReasonCodeLane {
  return value === "alternate" ? "alternate" : "closed";
}

/**
 * Reason codes for one action. A workflow list wins for that action only,
 * so closing codes do not replace the alternate list.
 */
export function reasonCodesForLane<
  T extends { code: string; workflowId?: string | null; lane?: string | null },
>(rows: readonly T[], workflowId: string | null | undefined, lane: ReasonCodeLane): string[] {
  const laneRows = rows.filter((row) => reasonCodeLaneOf(row.lane) === lane);
  return selectWorkflowScopedLaneRows(laneRows, workflowId).rows.map((row) => row.code);
}

/**
 * Follow-up reasons belong on Alternate.
 * The pre-hire sheet's other reasons are Closing outcomes.
 * AI Analysis steps are not a status catalog and are not seeded here.
 */
const ALTERNATE_REASON_KEYS = new Set([
  "unreachable",
  "call back later",
  "call back",
  "callback",
  "left voicemail",
  "left a voicemail",
]);

const CLOSING_REASON_KEYS = new Set([
  "not a fit",
  "c2c only",
  "candidate withdrew",
  "requires sponsorship",
  "rejected by msp",
  "rejected by client",
  "verification failed",
  "offer declined",
]);

/** Default Alternate reason codes. Tenant default until a workflow overrides them. */
export const DEFAULT_ALTERNATE_REASON_CODES: Record<string, readonly string[]> = {
  Screening: ["Unreachable"],
};

/** Default Closing reason codes from the pre-hire status sheet. */
export const DEFAULT_CLOSING_REASON_CODES: Record<string, readonly string[]> = {
  Intake: ["Not a Fit"],
  Screening: ["C2C Only", "Candidate Withdrew", "Not a Fit", "Requires Sponsorship"],
  Interview: ["Candidate Withdrew", "Not a Fit"],
  Submission: ["Rejected by MSP", "Rejected by Client", "Candidate Withdrew"],
  Compliance: ["Verification Failed", "Candidate Withdrew"],
  "Offer & Agreement": ["Offer Declined"],
};

/** Closing sheet codes. Kept for callers that read the original stage list. */
export const DEFAULT_STAGE_REASON_CODES = DEFAULT_CLOSING_REASON_CODES;

/** Lane a known reason code belongs on. Unknown codes are left where they were saved. */
export function preferredReasonCodeLane(code: string): ReasonCodeLane | null {
  const key = normalizeReasonCode(code).toLowerCase();
  if (!key) return null;
  if (ALTERNATE_REASON_KEYS.has(key)) return "alternate";
  if (CLOSING_REASON_KEYS.has(key)) return "closed";
  return null;
}

export function normalizeReasonCode(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Reason codes stay out of the status list. A status name is not a close reason. */
export function reasonCodesExcludingStatusNames(
  reasonCodes: readonly string[],
  statusNames: readonly string[]
): string[] {
  const blocked = new Set(statusNames.map((name) => name.trim().toLowerCase()).filter(Boolean));
  return parseReasonCodeList(reasonCodes).filter((code) => !blocked.has(code.toLowerCase()));
}

export function parseReasonCodeList(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const codes: string[] = [];
  for (const value of values) {
    const code = normalizeReasonCode(value);
    if (!code) continue;
    const key = code.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    codes.push(code);
  }
  return codes;
}

export function matchingCatalogValue(existing: readonly string[], typed: string): string | null {
  const value = normalizeReasonCode(typed);
  if (!value) return null;
  return existing.find((item) => item.toLowerCase() === value.toLowerCase()) ?? null;
}

/** Reuse a value already stored for this workflow and stage, or create one for that scope. */
export function catalogSavePlan(
  existing: readonly string[],
  typed: string
): { action: "empty" } | { action: "reuse" | "create"; value: string } {
  const value = normalizeReasonCode(typed);
  if (!value) return { action: "empty" };
  const match = matchingCatalogValue(existing, value);
  if (match) return { action: "reuse", value: match };
  return { action: "create", value };
}

/**
 * Append a reason code without changing another workflow.
 * A workflow with its own codes keeps that list. A workflow still using the
 * tenant default gets its own copy plus the new code.
 */
export function codesForScopedAppend(
  rows: readonly { code: string; workflowId?: string | null }[],
  workflowId: string | null,
  nextCode: string
): string[] {
  const own = workflowId ? rows.filter((row) => row.workflowId === workflowId) : [];
  const defaults = rows.filter((row) => !row.workflowId);
  const base = workflowId && own.length > 0 ? own : defaults;
  return parseReasonCodeList([...base.map((row) => row.code), nextCode]);
}

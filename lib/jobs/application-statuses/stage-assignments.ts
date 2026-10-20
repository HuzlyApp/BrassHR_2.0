/**
 * Workflow stage ↔ status GROUP assignments.
 * One group can be available on many stages (one-to-many).
 * Closed is shared on every stage and is not stored as a per-stage assignment.
 * Assigning a group never changes status system keys or auto-moves candidates.
 *
 * Candidate status actions (Pre-Hire board and AI Analysis "This Job") use only
 * Pre-Hire stage names. AI Analysis progression steps keep separate labels for
 * step notes / UI — they are not a status catalog.
 */

import { PRE_HIRE_FIGMA_STAGES } from "@/lib/onboarding/hire-stage-groups";
import {
  APPLICATION_STATUS_GROUP_KEYS,
  isSharedClosedGroupKey,
  type ApplicationStatusGroupKey,
} from "./groups";

export const PRE_HIRE_STATUS_STAGE_NAMES = PRE_HIRE_FIGMA_STAGES;

export type PreHireStatusStageName = (typeof PRE_HIRE_STATUS_STAGE_NAMES)[number];

/**
 * AI Analysis progression labels (notes / UI only).
 * Not used for status catalog lanes, reason codes, or action buttons.
 */
export const AI_MATCH_STATUS_STAGES = [
  "Step 1 · Quick Match",
  "Step 2 · Verifications",
  "Step 3 · Follow-Up",
  "Step 4 · Deep Match",
  "Step 5 · Submission",
] as const;

export type AiMatchStatusStageName = (typeof AI_MATCH_STATUS_STAGES)[number];

export const AI_MATCH_STAGE_BY_STEP_ID = {
  quick: "Step 1 · Quick Match",
  verifications: "Step 2 · Verifications",
  follow_up: "Step 3 · Follow-Up",
  deep: "Step 4 · Deep Match",
  submission: "Step 5 · Submission",
} as const satisfies Record<string, AiMatchStatusStageName>;

export type AiMatchProgressionStepId = keyof typeof AI_MATCH_STAGE_BY_STEP_ID;

/** Stages that may own Primary / Alternate / Closing status configuration. */
export type StatusStageName = PreHireStatusStageName;

export type ApplicationStatusGroupStageAssignmentRecord = {
  id: string;
  tenantId: string;
  stageName: StatusStageName;
  groupId: string;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Default stages for each catalog group (Closed is shared, not listed). */
export const DEFAULT_GROUP_PRE_HIRE_STAGES: Record<
  Exclude<ApplicationStatusGroupKey, "closed">,
  PreHireStatusStageName[]
> = {
  start: ["Intake"],
  interview: ["Screening", "Interview"],
  msp: ["Submission"],
  client: ["Submission", "Approvals"],
  hire: ["Offer & Agreement", "Approvals"],
};

export function isPreHireStatusStageName(value: string): value is PreHireStatusStageName {
  return (PRE_HIRE_STATUS_STAGE_NAMES as readonly string[]).includes(value);
}

export function isAiMatchStatusStageName(value: string): value is AiMatchStatusStageName {
  return (AI_MATCH_STATUS_STAGES as readonly string[]).includes(value);
}

/** Status catalog / lane assignment stages — Pre-Hire only. */
export function isAssignableStatusStageName(value: string): value is StatusStageName {
  return isPreHireStatusStageName(value);
}

/** Map an AI progression step id to its display / note context key. */
export function aiMatchStatusStageName(stepId: string): AiMatchStatusStageName | null {
  if (Object.prototype.hasOwnProperty.call(AI_MATCH_STAGE_BY_STEP_ID, stepId)) {
    return AI_MATCH_STAGE_BY_STEP_ID[stepId as AiMatchProgressionStepId];
  }
  return null;
}

export function isAssignableCatalogGroupKey(
  systemKey: string | null | undefined
): systemKey is Exclude<ApplicationStatusGroupKey, "closed"> {
  const key = (systemKey ?? "").trim().toLowerCase();
  return (
    (APPLICATION_STATUS_GROUP_KEYS as readonly string[]).includes(key) &&
    !isSharedClosedGroupKey(key)
  );
}

/** @deprecated Prefer group-stage assignments. Kept for older status-stage helpers. */
export type ApplicationStatusStageAssignmentRecord = {
  id: string;
  tenantId: string;
  stageName: StatusStageName;
  statusId: string;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

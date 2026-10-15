import type { CandidateWorkflowStepView } from "@/lib/onboarding/candidate-workflow-phase-view";
import type { WorkflowStepDisplayStatus } from "@/lib/onboarding/assigned-workflow-steps";
import {
  hireStageFitsLifecycle,
  hireStageForStepKey,
  POST_HIRE_FIGMA_STAGES,
  PRE_HIRE_FIGMA_STAGES,
  type HireLifecycle,
} from "@/lib/onboarding/hire-stage-catalog";
import { isInterviewStep } from "@/lib/onboarding/interview-step";
import { RECRUITER_SCREENING_STEP_TYPE } from "@/lib/onboarding/recruiter-screening-progress";

export { POST_HIRE_FIGMA_STAGES, PRE_HIRE_FIGMA_STAGES };

export type HireStageLifecycle = HireLifecycle;

export type HireStageStatus = "completed" | "current" | "in_progress" | "locked" | "upcoming";

export type HireStageGroup = {
  id: string;
  name: string;
  index: number;
  steps: CandidateWorkflowStepView[];
  completedCount: number;
  inProgressCount: number;
  pendingCount: number;
  status: HireStageStatus;
  summaryLabel: string;
};

/**
 * Exact library step keys → Figma Pre-Hire stages (Steps Library order).
 * Preferred over regex so SSN stays in Compliance, Interview/Submission appear correctly.
 */
const PRE_HIRE_LIBRARY_STAGE: Record<string, (typeof PRE_HIRE_FIGMA_STAGES)[number]> = {
  "resume-basic-profile": "Intake",
  "parameterized-job-application": "Intake",
  "collect-extra-files": "Intake",
  "references-collection": "Intake",
  "collect-references": "Intake",
  "custom-form": "Intake",
  "custom-application-form": "Intake",
  "document-upload": "Intake",
  "recruiter-screening": "Screening",
  "skill-qualification-assessment": "Screening",
  "reference-verification": "Screening",
  "interview-qualification": "Interview",
  "internal-select": "Interview",
  "candidate-selection": "Interview",
  "release-to-client": "Submission",
  "background-check": "Compliance",
  "drug-test-screening": "Compliance",
  "oig-exclusion-check": "Compliance",
  "credential-license-verification": "Compliance",
  "ssn-identity-verification": "Compliance",
  "adverse-action-process": "Compliance",
  "pay-and-start-date": "Offer & Agreement",
  "pay-rate-hire-date": "Offer & Agreement",
  "offer-acceptance": "Offer & Agreement",
  "offer-accepted": "Offer & Agreement",
  "pay-rate-accepted": "Offer & Agreement",
  "employee-agreement": "Offer & Agreement",
  "agreement-esign": "Offer & Agreement",
  "i9-section-1": "Offer & Agreement",
  "manager-facility-approval": "Approvals",
  "hr-final-approval": "Approvals",
  "completion-milestone": "Approvals",
};

/** Match Figma W2 Pre-hire board: Intake → … → Approvals. */
const PRE_HIRE_RULES: Array<{ stage: (typeof PRE_HIRE_FIGMA_STAGES)[number]; patterns: RegExp[] }> = [
  {
    stage: "Intake",
    patterns: [
      /intake/,
      /collect.?extra.?file/,
      /extra.?file/,
      /collect.?file/,
      /document.?upload/,
      /collect.?reference/,
      /references.?collection/,
      /extra.?form/,
      /custom.?form/,
      /custom.?application/,
      /resume/,
      /basic.?profile/,
      /parameterized.?job/,
      /application.?receiv/,
    ],
  },
  {
    stage: "Screening",
    patterns: [
      /recruiter.?screen/,
      /skill.?qualification/,
      /skill.?assess/,
      /skill.?test/,
      /qualification.?assess/,
      /reference.?verif/,
      /verify.?reference/,
    ],
  },
  {
    stage: "Interview",
    patterns: [
      /interview/,
      /internal.?select/,
      /want.?to.?hire/,
      /hire.?intent/,
      /we.?want.?to.?hire/,
    ],
  },
  {
    stage: "Submission",
    patterns: [
      /submission/,
      /sent.?to.?client/,
      /msp/,
      /release.?to.?client/,
      /released.?to.?client/,
      /client.?review/,
      /submit.?to.?client/,
      /presented.?to.?client/,
      /profile.?ready/,
    ],
  },
  {
    stage: "Compliance",
    patterns: [
      /compliance/,
      /background/,
      /drug/,
      /oig/,
      /exclusion/,
      /license/,
      /credential/,
      /ssn/,
      /identity.?verif/,
      /adverse/,
    ],
  },
  {
    stage: "Offer & Agreement",
    patterns: [
      /offer/,
      /agreement/,
      /contract/,
      /placement/,
      /pay.?and.?start/,
      /pay.?rate/,
      /hire.?date/,
      /i-?9.?section.?1/,
    ],
  },
  {
    // Final Review / Completion milestones stay in Approvals when pre-hire.
    stage: "Approvals",
    patterns: [
      /manager.?facility.?approv/,
      /facility.?approv/,
      /hr.?final.?approv/,
      /final.?approval/,
      /final.?review/,
      /completion.?milestone/,
      /pre.?hire.?approv/,
      /approv/,
      /sign.?off/,
    ],
  },
];

const POST_HIRE_RULES: Array<{ stage: (typeof POST_HIRE_FIGMA_STAGES)[number]; patterns: RegExp[] }> = [
  {
    stage: "Payroll & Tax",
    patterns: [
      /payroll/,
      /tax/,
      /w-?4/,
      /w-?9/,
      /direct.?deposit/,
      /benefits.?enroll/,
      /401.?k/,
      /i-?9/,
      /everify/,
      /right.?to.?work/,
      /paychex/,
      /adp/,
    ],
  },
  {
    stage: "Access & Systems",
    patterns: [/equipment/, /badge/, /access/, /schedule.?assign/, /facility.?access/, /door/, /system/],
  },
  {
    stage: "Training & Policy",
    patterns: [
      /train/,
      /orient/,
      /policy/,
      /handbook/,
      /welcome.?packet/,
      /safety/,
      /certif/,
      /learning/,
      /quiz/,
    ],
  },
  {
    stage: "Welcome & Complete",
    patterns: [
      /welcome.?call/,
      /welcome.?email/,
      /manager.?welcome/,
      /final.?onboarding.?call/,
      /buddy/,
      /mentor/,
      /onboarding.?complete/,
      /completion.?milestone/,
      /day.?one/,
    ],
  },
];

function isCompleteStatus(status: WorkflowStepDisplayStatus): boolean {
  return (
    status === "completed" ||
    status === "approved" ||
    status === "submitted" ||
    status === "skipped" ||
    status === "not_applicable"
  );
}

function isInProgressStatus(status: WorkflowStepDisplayStatus): boolean {
  return (
    status === "in_progress" ||
    status === "submitted" ||
    status === "under_review" ||
    status === "needs_revision"
  );
}

function stepHaystack(step: CandidateWorkflowStepView): string {
  return `${step.stepKey} ${step.stepType} ${step.onboardingType} ${step.title}`.toLowerCase();
}

/**
 * The library catalog and stamped `settings.stageName` use the seven post-hire library
 * stages; the Post-Hire board shows four Figma buckets.
 */
const POST_HIRE_STAGE_ALIASES: Record<string, (typeof POST_HIRE_FIGMA_STAGES)[number]> = {
  kickoff: "Welcome & Complete",
  paperwork: "Payroll & Tax",
  "payroll & pay": "Payroll & Tax",
  policies: "Training & Policy",
  "access & equipment": "Access & Systems",
  training: "Training & Policy",
  "day one ready": "Welcome & Complete",
};

/** Maps a stage name onto the board for this lifecycle; null when it belongs to the other board. */
function boardStageName(name: string | null, lifecycle: HireStageLifecycle): string | null {
  if (!name || !hireStageFitsLifecycle(name, lifecycle)) return null;
  if (lifecycle === "post_hire") return POST_HIRE_STAGE_ALIASES[name.toLowerCase()] ?? name;
  return name;
}

/** Board stage for a published step, as shown to the candidate above the step title. */
export function hireStageLabelForStep(input: {
  stageName: unknown;
  libraryId: string | null;
  stepKey: string;
  lifecycle: HireStageLifecycle;
}): string | null {
  const explicit = typeof input.stageName === "string" ? input.stageName.trim() : "";
  return (
    boardStageName(explicit || null, input.lifecycle) ??
    boardStageName(
      hireStageForStepKey(input.libraryId, input.lifecycle) ?? hireStageForStepKey(input.stepKey, input.lifecycle),
      input.lifecycle
    )
  );
}

function resolveStageName(
  step: CandidateWorkflowStepView,
  lifecycle: HireStageLifecycle,
  explicitStage: string | null
): string {
  const explicit = boardStageName(explicitStage, lifecycle);
  if (explicit) return explicit;
  const fromCatalog = boardStageName(
    hireStageForStepKey(step.stepType, lifecycle) ??
      hireStageForStepKey(step.stepKey, lifecycle) ??
      hireStageForStepKey(step.snapshotStepId, lifecycle),
    lifecycle
  );
  if (fromCatalog) return fromCatalog;

  if (lifecycle === "pre_hire") {
    const keys = [step.stepKey, step.stepType]
      .map((value) => String(value ?? "").trim().toLowerCase())
      .filter(Boolean);
    for (const key of keys) {
      const mapped = PRE_HIRE_LIBRARY_STAGE[key];
      if (mapped) return mapped;
    }
  }

  const haystack = stepHaystack(step);
  const rules = lifecycle === "pre_hire" ? PRE_HIRE_RULES : POST_HIRE_RULES;
  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(haystack))) return rule.stage;
  }
  const canonical = lifecycle === "pre_hire" ? PRE_HIRE_FIGMA_STAGES : POST_HIRE_FIGMA_STAGES;
  return canonical[0];
}

function readExplicitStage(step: CandidateWorkflowStepView): string | null {
  const settings = step.settings;
  if (!settings || typeof settings !== "object") return null;
  for (const key of ["stageName", "stage", "group", "section"] as const) {
    const value = settings[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function stageSortIndex(name: string, lifecycle: HireStageLifecycle): number {
  const canonical = lifecycle === "pre_hire" ? PRE_HIRE_FIGMA_STAGES : POST_HIRE_FIGMA_STAGES;
  const idx = canonical.findIndex((item) => item.toLowerCase() === name.toLowerCase());
  return idx >= 0 ? idx : canonical.length + 1;
}

function summarizeStage(steps: CandidateWorkflowStepView[]): {
  completedCount: number;
  inProgressCount: number;
  pendingCount: number;
  summaryLabel: string;
} {
  let completedCount = 0;
  let inProgressCount = 0;
  let pendingCount = 0;
  for (const step of steps) {
    if (isCompleteStatus(step.displayStatus)) completedCount += 1;
    else if (isInProgressStatus(step.displayStatus)) inProgressCount += 1;
    else pendingCount += 1;
  }
  const parts: string[] = [];
  if (completedCount) parts.push(`${completedCount} Completed`);
  if (inProgressCount) parts.push(`${inProgressCount} In Progress`);
  if (pendingCount && !completedCount && !inProgressCount) parts.push(`${pendingCount} Pending`);
  else if (pendingCount && (completedCount || inProgressCount)) parts.push(`${pendingCount} Upcoming`);
  return {
    completedCount,
    inProgressCount,
    pendingCount,
    summaryLabel: parts.join(" • ") || "No steps",
  };
}

/**
 * Groups assigned workflow steps into recruiter stages.
 * Order: explicit settings.stageName, then the library step-key catalog,
 * then the Pre-Hire library map, then keyword heuristics for steps that are not in the catalog.
 * Post-hire library stage names are folded into the four Post-Hire board buckets.
 */
export function groupStepsIntoHireStages(
  steps: CandidateWorkflowStepView[],
  lifecycle: HireStageLifecycle
): HireStageGroup[] {
  const buckets = new Map<string, CandidateWorkflowStepView[]>();
  for (const step of steps) {
    const name = resolveStageName(step, lifecycle, readExplicitStage(step));
    const list = buckets.get(name) ?? [];
    list.push(step);
    buckets.set(name, list);
  }

  const orderedNames = Array.from(buckets.keys()).sort((a, b) => {
    const ai = stageSortIndex(a, lifecycle);
    const bi = stageSortIndex(b, lifecycle);
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });

  const groups: HireStageGroup[] = orderedNames.map((name, index) => {
    const stageSteps = buckets.get(name) ?? [];
    const stats = summarizeStage(stageSteps);
    return {
      id: `stage-${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name,
      index,
      steps: stageSteps,
      ...stats,
      status: "upcoming",
    };
  });

  let foundCurrent = false;
  for (const group of groups) {
    const optionalOpen = group.steps.length - group.completedCount;
    const requiredDone =
      group.steps.length > 0 &&
      group.steps.every((step) => !step.required || isCompleteStatus(step.displayStatus));
    // Optional steps never hold a stage open, but an optional-only stage can't jump ahead of the current one.
    if (requiredDone && (optionalOpen === 0 || !foundCurrent)) {
      group.status = "completed";
      group.summaryLabel = [
        group.completedCount ? `${group.completedCount} Completed` : null,
        optionalOpen ? `${optionalOpen} Optional` : null,
      ]
        .filter(Boolean)
        .join(" • ");
      continue;
    }
    if (!foundCurrent) {
      foundCurrent = true;
      group.status = group.inProgressCount > 0 ? "current" : "current";
      if (group.inProgressCount > 0) {
        group.summaryLabel = [
          group.completedCount ? `${group.completedCount} Completed` : null,
          `${group.inProgressCount} In Progress`,
          "Current Step",
        ]
          .filter(Boolean)
          .join(" • ");
      } else {
        group.summaryLabel = "Current Step";
      }
      continue;
    }
    group.status = "locked";
    group.summaryLabel = "Pending previous step.";
  }

  return groups;
}

const SCREENING_SUBSTEP_ORDER = [
  RECRUITER_SCREENING_STEP_TYPE,
  "skill-qualification-assessment",
  "reference-verification",
] as const;

function stepLibraryKeys(step: CandidateWorkflowStepView): string[] {
  return [step.stepType, step.stepKey, step.snapshotStepId]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);
}

export function isRecruiterScreeningStep(step: CandidateWorkflowStepView): boolean {
  return stepLibraryKeys(step).includes(RECRUITER_SCREENING_STEP_TYPE);
}

export function recruiterScreeningIsRejected(steps: CandidateWorkflowStepView[]): boolean {
  const screening = steps.find(isRecruiterScreeningStep);
  return screening?.displayStatus === "rejected" || screening?.displayStatus === "blocked";
}

function screeningSubstepRank(step: CandidateWorkflowStepView): number | null {
  const keys = stepLibraryKeys(step);
  for (let i = 0; i < SCREENING_SUBSTEP_ORDER.length; i += 1) {
    if (keys.includes(SCREENING_SUBSTEP_ORDER[i]!)) return i;
  }
  return null;
}

/**
 * When staff reject Recruiter Screening, later pre-hire steps must not be actionable
 * (Skill Assessment, Reference Verification, Interview, etc.).
 */
export function isStepLockedAfterScreeningRejection(
  step: CandidateWorkflowStepView,
  allSteps: CandidateWorkflowStepView[]
): boolean {
  if (!recruiterScreeningIsRejected(allSteps)) return false;
  if (isRecruiterScreeningStep(step)) return false;

  const screeningIdx = allSteps.findIndex(isRecruiterScreeningStep);
  const stepIdx = allSteps.findIndex((item) => item.id === step.id);
  if (screeningIdx >= 0 && stepIdx >= 0 && stepIdx > screeningIdx) return true;

  const screeningRank = screeningSubstepRank(
    allSteps.find(isRecruiterScreeningStep) ?? ({} as CandidateWorkflowStepView)
  );
  const stepRank = screeningSubstepRank(step);
  if (screeningRank != null && stepRank != null && stepRank > screeningRank) return true;

  return false;
}

export function hireStageProgressMeta(groups: HireStageGroup[]): {
  inProgress: number;
  upcoming: number;
  completedStages: number;
  totalStages: number;
  percent: number;
  label: string;
} {
  const totalSteps = groups.reduce((sum, g) => sum + g.steps.length, 0);
  const completedSteps = groups.reduce((sum, g) => sum + g.completedCount, 0);
  const inProgress = groups.reduce((sum, g) => sum + g.inProgressCount, 0);
  const upcoming = groups.reduce((sum, g) => sum + g.pendingCount, 0);
  const completedStages = groups.filter((g) => g.status === "completed").length;
  const percent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  const parts: string[] = [];
  if (inProgress) parts.push(`${inProgress} In Progress`);
  if (upcoming) parts.push(`${upcoming} Upcoming`);
  if (!parts.length && percent === 100) parts.push("Completed");
  if (!parts.length) parts.push("Not started");
  return {
    inProgress,
    upcoming,
    completedStages,
    totalStages: groups.length,
    percent,
    label: parts.join(" • "),
  };
}

/**
 * Steps where recruiters can open Schedule Interview from the Pre-Hire board.
 * Only steps that book time with the candidate qualify. Internal decisions that
 * merely sit in the Interview stage (Internal Select, Client Review, Candidate
 * Selection) are completed through the staff step modal instead.
 */
export function isInterviewScheduleStep(step: CandidateWorkflowStepView): boolean {
  if (isCompleteStatus(step.displayStatus)) return false;
  if (step.displayStatus === "rejected" || step.displayStatus === "blocked") return false;
  return isInterviewStep(step);
}

/**
 * Show Schedule Interview on the row while the Interview stage is active and nothing is booked yet.
 * Follow-up interviews are scheduled from the step modal.
 */
export function shouldShowInterviewScheduleAction(
  stage: HireStageGroup,
  step: CandidateWorkflowStepView
): boolean {
  if (stage.name.toLowerCase() !== "interview") return false;
  if (stage.status !== "current" && stage.status !== "in_progress") return false;
  if (step.interview?.latest) return false;
  return isInterviewScheduleStep(step);
}

/** Current Pre-Hire board stage name (for status catalog actions), or null when unknown. */
export function currentPreHireStatusStageName(stages: readonly HireStageGroup[]): string | null {
  const current = stages.find(
    (stage) => stage.status === "current" || stage.status === "in_progress"
  );
  const name = current?.name?.trim() ?? "";
  return name || null;
}

import {
  lifecyclePhaseFromTemplatePhase,
  parseWorkflowTemplatePhase,
  readStepLifecyclePhase,
  type ApplicantLifecyclePhase,
} from "@/lib/onboarding/workflow-phase";
import type { TenantOnboardingStep } from "@/lib/onboarding/types";

export type EmploymentLifecyclePhase = Exclude<ApplicantLifecyclePhase, "completed">;

export const PHASE_LABEL: Record<EmploymentLifecyclePhase, string> = {
  pre_hire: "Pre-Hire",
  post_hire: "Post-Hire",
};

export const POST_HIRE_LOCKED_MESSAGE =
  "Post-Hire steps become available after the candidate is Selected and required Pre-Hire steps are nearly complete.";

export const WAITING_ON_INTERNAL_MESSAGE =
  "Your documents have been submitted. No action is required from you right now. We will email you when the next step is ready.";

export const POST_HIRE_LOCKED_TAB_MESSAGE =
  "Available after Selected by Client when required Pre-Hire steps are nearly complete.";

export function lifecyclePhaseLabel(phase: EmploymentLifecyclePhase): string {
  return PHASE_LABEL[phase];
}

export function hasExplicitWorkflowPhase(value: unknown): boolean {
  const phase = String(value ?? "").trim().toLowerCase();
  return phase === "pre_hire" || phase === "transition" || phase === "post_hire";
}

export function groupStepsByLifecyclePhase<T>(
  steps: T[],
  readPhase: (step: T) => EmploymentLifecyclePhase
): { preHire: T[]; postHire: T[] } {
  const preHire: T[] = [];
  const postHire: T[] = [];
  for (const step of steps) {
    if (readPhase(step) === "post_hire") postHire.push(step);
    else preHire.push(step);
  }
  return { preHire, postHire };
}

export function groupTenantStepsByPhase(steps: TenantOnboardingStep[]): {
  preHire: TenantOnboardingStep[];
  postHire: TenantOnboardingStep[];
} {
  return groupStepsByLifecyclePhase(steps, readStepLifecyclePhase);
}

export type PhaseProgressCounts = {
  complete: number;
  total: number;
  percent: number;
  label: string;
};

export function countsForPhase(
  total: number,
  complete: number,
  phase: EmploymentLifecyclePhase
): PhaseProgressCounts {
  const safeTotal = Math.max(0, total);
  const safeComplete = Math.max(0, Math.min(complete, safeTotal));
  return {
    complete: safeComplete,
    total: safeTotal,
    percent: safeTotal > 0 ? Math.round((safeComplete / safeTotal) * 100) : 0,
    label: `${safeComplete} / ${safeTotal} ${lifecyclePhaseLabel(phase)} completed`,
  };
}

export function formatPhaseProgressShort(
  complete: number,
  total: number,
  phase: EmploymentLifecyclePhase
): string {
  return `${Math.max(0, complete)} / ${Math.max(0, total)} ${lifecyclePhaseLabel(phase)}`;
}

export function readNodeLifecyclePhase(settingsPhase: unknown): EmploymentLifecyclePhase {
  return lifecyclePhaseFromTemplatePhase(parseWorkflowTemplatePhase(settingsPhase));
}

export type EmploymentJourneyStage =
  | "applicant"
  | "pre_hire"
  | "hired"
  | "post_hire"
  | "onboarded";

export const EMPLOYMENT_JOURNEY_STAGES: Array<{
  id: EmploymentJourneyStage;
  label: string;
}> = [
  { id: "applicant", label: "Applicant" },
  { id: "pre_hire", label: "Pre-Hire" },
  { id: "hired", label: "Hired" },
  { id: "post_hire", label: "Post-Hire" },
  { id: "onboarded", label: "Onboarded" },
];

export function resolveEmploymentJourneyStage(params: {
  isHired: boolean;
  workflowPhase: ApplicantLifecyclePhase | null;
  hasPreHireWorkflow: boolean;
  hasPostHireWorkflow: boolean;
  postHireUnlocked: boolean;
  onboarded: boolean;
}): EmploymentJourneyStage {
  if (params.onboarded || params.workflowPhase === "completed") return "onboarded";
  if (params.isHired && params.postHireUnlocked && params.hasPostHireWorkflow) return "post_hire";
  if (params.isHired) return "hired";
  if (params.hasPreHireWorkflow) return "pre_hire";
  return "applicant";
}

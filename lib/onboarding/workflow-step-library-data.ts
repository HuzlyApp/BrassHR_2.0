import type { OnboardingStepType } from "@/lib/onboarding/types";

export type WorkflowStepLibraryItem = {
  id: string;
  label: string;
  iconKey: string;
  description?: string;
  stepType: OnboardingStepType;
  keywords?: string[];
  defaultPhase?: "pre_hire" | "transition" | "post_hire";
};

export type WorkflowStepLibraryCategory = {
  id: string;
  label: string;
  steps: WorkflowStepLibraryItem[];
};

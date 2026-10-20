import type { OnboardingStepDraft } from "@/lib/onboarding/default-onboarding-steps";
import type { OnboardingStepType } from "@/lib/onboarding/types";

const TYPE_DEFAULTS: Record<
  OnboardingStepType,
  Pick<OnboardingStepDraft, "title" | "description" | "metadata" | "required_documents">
> = {
  resume_upload: {
    title: "Upload Resume",
    description: "Upload your resume and confirm your contact information.",
    metadata: { parsing_enabled: true },
    required_documents: [],
  },
  professional_license: {
    title: "Professional License",
    description: "Upload license and credential documents",
    metadata: {},
    required_documents: [
      { title: "Nursing License", description: "", is_required: true, sort_order: 10 },
    ],
  },
  skill_assessment: {
    title: "Skill Assessment",
    description: "Complete skills assessments",
    metadata: {},
    required_documents: [],
  },
  authorizations: {
    title: "Authorizations & Documents",
    description: "Upload authorization documents",
    metadata: {},
    required_documents: [
      { title: "SSN Card", description: "", is_required: true, sort_order: 10 },
    ],
  },
  references: {
    title: "Add Reference",
    description: "Provide professional references",
    metadata: { min_count: 1 },
    required_documents: [],
  },
  review_submit: {
    title: "Summary",
    description: "Review and submit application",
    metadata: {},
    required_documents: [],
  },
  document_upload: {
    title: "Document upload",
    description: "Upload required files",
    metadata: {},
    required_documents: [
      { title: "Extra File", description: "Upload any additional intake documents", is_required: true, sort_order: 10 },
    ],
  },
  profile_information: {
    title: "Profile information",
    description: "Enter profile details",
    metadata: {},
    required_documents: [],
  },
  custom_question: {
    title: "Additional question",
    description: "",
    metadata: { prompt: "" },
    required_documents: [],
  },
};

/** Step types tenants can add from the builder (review is auto-suggested at end). */
export const ADDABLE_STEP_TYPES: OnboardingStepType[] = [
  "professional_license",
  "skill_assessment",
  "document_upload",
  "authorizations",
  "references",
  "profile_information",
  "custom_question",
  "review_submit",
];

function uniqueStepKey(stepType: OnboardingStepType, existingKeys: Set<string>): string {
  const canonical = stepType;
  if (!existingKeys.has(canonical)) return canonical;
  let n = 2;
  while (existingKeys.has(`${stepType}_${n}`)) n += 1;
  return `${stepType}_${n}`;
}

export function createStepDraftForType(
  stepType: OnboardingStepType,
  existingSteps: OnboardingStepDraft[]
): OnboardingStepDraft {
  const existingKeys = new Set(existingSteps.map((s) => s.step_key));
  const defaults = TYPE_DEFAULTS[stepType];
  return {
    step_key: uniqueStepKey(stepType, existingKeys),
    title: defaults.title,
    description: defaults.description,
    step_type: stepType,
    sort_order: (existingSteps.length + 1) * 10,
    is_required: true,
    is_enabled: true,
    metadata: { ...defaults.metadata },
    required_documents: defaults.required_documents.map((d, i) => ({
      ...d,
      sort_order: (i + 1) * 10,
    })),
  };
}

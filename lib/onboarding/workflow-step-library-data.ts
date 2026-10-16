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

/** Code copy of the global onboarding_step_library master list. */
export const WORKFLOW_STEP_LIBRARY_DATA: WorkflowStepLibraryCategory[] = [
  {
    id: "application-profile",
    label: "Intake",
    steps: [
      step("resume-basic-profile", "Resume and profile", "resume_upload", "pre_hire", "Collect resume details and basic applicant profile information."),
      step("parameterized-job-application", "Job application", "profile_information", "pre_hire", "Collect role-specific application details."),
      step("collect-extra-files", "Collect documents", "document_upload", "pre_hire", "Request additional documents from the candidate during intake."),
      step("collect-references", "Collect references", "references", "pre_hire", "Ask the candidate to provide professional references."),
      step("custom-form", "Custom form", "custom_question", "pre_hire", "Add a custom intake form for this workflow."),
    ],
  },
  {
    id: "screening",
    label: "Screening",
    steps: [
      step("recruiter-screening", "Recruiter screening", "custom_question", "pre_hire", "Recruiter screens the candidate before interview or client review."),
      step("skill-qualification-assessment", "Skill / qualification assessment", "skill_assessment", "pre_hire", "Assess applicant skills and qualifications."),
      step("reference-verification", "Reference check", "references", "pre_hire", "Track reference verification."),
    ],
  },
  {
    id: "interview",
    label: "Interview",
    steps: [
      step("interview-qualification", "Interview", "custom_question", "pre_hire", "Track the candidate interview."),
      step("follow-up-interview", "Follow-up interview", "custom_question", "pre_hire", "Track a follow-up interview."),
      step("internal-select", "Internal selection", "custom_question", "pre_hire", "Internally select the candidate to move forward."),
    ],
  },
  {
    id: "submission",
    label: "Submission",
    steps: [
      step("submit-to-msp", "Submit to MSP", "custom_question", "pre_hire", "Prepare the candidate profile and required packet, then submit the candidate to the MSP."),
      step("submit-to-client", "Submit to client", "custom_question", "pre_hire", "Submit the candidate to the client."),
      step("manager-facility-approval", "Client / facility approval", "custom_question", "pre_hire", "Request client or facility approval."),
      step("release-to-client", "Released to client", "custom_question", "transition", "Mark recruitment complete and hand the candidate off to the client for final hiring."),
    ],
  },
  {
    id: "screening-compliance",
    label: "Compliance",
    steps: [
      step("authorization-esign", "Authorization e-sign", "authorizations", "pre_hire", "Collect authorization e-sign signatures."),
      step("background-check", "Background check", "custom_question", "pre_hire", "Track background check completion."),
      step("drug-test-screening", "Drug screen", "custom_question", "pre_hire", "Track drug screen requirements."),
      step("oig-exclusion-check", "OIG / exclusion check", "custom_question", "pre_hire", "Track OIG or exclusion screening."),
      step("credential-license-verification", "License and credential verification", "professional_license", "pre_hire", "Verify professional credentials and licenses."),
      step("ssn-identity-verification", "Identity verification", "document_upload", "pre_hire", "Collect identity verification documentation."),
      step("adverse-action-process", "Adverse action", "custom_question", "pre_hire", "Track adverse action steps when required."),
    ],
  },
  {
    id: "offer-agreement",
    label: "Offer and agreement",
    steps: [
      step("pay-rate-hire-date", "Pay and start date", "profile_information", "pre_hire", "Confirm pay rate and agreed start date."),
      step("offer-prep", "Offer prep", "custom_question", "pre_hire", "Prepare the offer before it is sent."),
      step("manager-approval", "Manager approval", "custom_question", "pre_hire", "Request manager approval of the offer."),
      step("employee-agreement", "Agreement e-sign", "authorizations", "pre_hire", "Collect the signed employee agreement."),
      step("i9-right-to-work-verification", "I-9 Section 1", "document_upload", "pre_hire", "Complete I-9 Section 1 for the candidate."),
      step("offer-acceptance", "Offer accepted", "custom_question", "pre_hire", "Track offer acceptance from the candidate."),
    ],
  },
  {
    id: "approval-decision",
    label: "Approvals",
    steps: [
      step("hr-final-approval", "HR final approval", "custom_question", "pre_hire", "Request final HR approval before hire."),
      step("pre-hire-completion-milestone", "Pre-hire complete", "custom_question", "pre_hire", "Shows the Pre-Hire completion screen after the candidate finishes the other Pre-Hire steps."),
    ],
  },
  {
    id: "communication-notification",
    label: "Welcome",
    steps: [
      step("manager-welcome-call", "Welcome call", "custom_question", "post_hire", "Schedule or track a welcome call."),
      step("welcome-packet-esign", "Welcome packet", "authorizations", "post_hire", "Collect signed welcome packet acknowledgments."),
    ],
  },
  {
    id: "payroll-financial",
    label: "Payroll and tax",
    steps: [
      step("payroll-profile-creation", "Payroll profile", "profile_information", "post_hire", "Create the payroll profile checklist."),
      step("tax-forms", "Tax forms", "document_upload", "post_hire", "Collect payroll tax forms."),
      step("w9", "W-9", "document_upload", "post_hire", "Collect Form W-9."),
      step("direct-deposit-setup", "Direct deposit", "profile_information", "post_hire", "Collect direct deposit information."),
      step("i9-section-2", "I-9 Section 2", "document_upload", "post_hire", "Complete I-9 Section 2 / E-Verify for the new hire."),
      step("benefits-enrollment", "Benefits enrollment", "profile_information", "post_hire", "Collect benefits enrollment choices."),
      step("401k-enrollment", "Retirement enrollment", "profile_information", "post_hire", "Collect retirement enrollment choices."),
    ],
  },
  {
    id: "team-operational",
    label: "Access and systems",
    steps: [
      step("system-access", "System access", "custom_question", "post_hire", "Set up system access for the new hire."),
      step("badge-equipment-issuance", "Badge and equipment issued", "custom_question", "post_hire", "Track badge or equipment issuance."),
      step("equipment-badge-acknowledgment", "Equipment acknowledgment", "document_upload", "post_hire", "Track equipment acknowledgment."),
      step("schedule-assignment", "Schedule assignment", "custom_question", "post_hire", "Assign work schedule for the new hire."),
      step("facility-access-setup", "Facility access", "custom_question", "post_hire", "Set up facility access for the new hire."),
      step("benefits-confirmation", "Benefits confirmation", "custom_question", "post_hire", "Confirm benefits enrollment details."),
    ],
  },
  {
    id: "training-development",
    label: "Training and policy",
    steps: [
      step("orientation-video", "Orientation", "custom_question", "post_hire", "Assign orientation content."),
      step("policy-acknowledgment", "Handbook / policy acknowledgment", "authorizations", "post_hire", "Collect handbook and policy acknowledgments."),
      step("safety-training", "Safety training", "custom_question", "post_hire", "Assign safety training tasks."),
      step("training-modules-quiz", "Job training", "skill_assessment", "post_hire", "Assign job training modules."),
      step("compliance-training", "Compliance training", "custom_question", "post_hire", "Assign compliance training content."),
      step("certification-upload", "Certification renewal", "professional_license", "post_hire", "Request certification renewal details."),
      step("health-screening-waiver", "Health screening waiver", "authorizations", "post_hire", "Collect the health screening waiver."),
    ],
  },
  {
    id: "completion",
    label: "Completion",
    steps: [
      step("buddy-mentor-assignment", "Buddy / mentor", "custom_question", "post_hire", "Assign a buddy or mentor to the new hire."),
      step("record-selection", "Record selection", "custom_question", "post_hire", "Record the hire selection."),
      step("post-hire-completion-milestone", "Post-hire complete", "custom_question", "post_hire", "Shows the Post-Hire completion screen after the candidate finishes the other Post-Hire steps."),
    ],
  },
];

function step(
  id: string,
  label: string,
  stepType: OnboardingStepType,
  defaultPhase: "pre_hire" | "transition" | "post_hire",
  description: string
): WorkflowStepLibraryItem {
  return { id, label, iconKey: id, description, stepType, defaultPhase };
}

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

export const WORKFLOW_STEP_LIBRARY_DATA: WorkflowStepLibraryCategory[] = [
  {
    id: "custom-steps",
    label: "Custom Steps",
    steps: [
      {
        id: "custom-step",
        label: "Custom Step",
        iconKey: "custom-step",
        description: "Add a tenant-specific instruction, question, or checkpoint.",
        stepType: "custom_question",
      },
    ],
  },
  {
    id: "application-profile",
    label: "Application & Profile",
    steps: [
      {
        id: "collect-extra-files",
        label: "Collect Extra Files",
        iconKey: "collect-extra-files",
        description: "Request additional files from the candidate during intake.",
        stepType: "document_upload",
        defaultPhase: "pre_hire",
      },
      {
        id: "collect-references",
        label: "Collect References",
        iconKey: "collect-references",
        description: "Ask the candidate to provide professional references.",
        stepType: "references",
        defaultPhase: "pre_hire",
      },
      {
        id: "custom-form",
        label: "Custom Form",
        iconKey: "custom-form",
        description: "Add a custom intake form for this workflow.",
        stepType: "custom_question",
        defaultPhase: "pre_hire",
      },
      {
        id: "resume-basic-profile",
        label: "Resume & Basic Profile",
        iconKey: "resume-basic-profile",
        description: "Collect resume details and basic applicant profile information.",
        stepType: "resume_upload",
      },
      {
        id: "parameterized-job-application",
        label: "Parameterized Job Application",
        iconKey: "parameterized-job-application",
        description: "Collect role-specific application details.",
        stepType: "profile_information",
      },
      {
        id: "references-collection",
        label: "References Collection",
        iconKey: "references-collection",
        description: "Ask applicants to provide professional references.",
        stepType: "references",
      },
      {
        id: "skill-qualification-assessment",
        label: "Skill / Qualification Assessment",
        iconKey: "skill-qualification-assessment",
        description: "Assess applicant skills and qualifications.",
        stepType: "skill_assessment",
      },
      {
        id: "custom-application-form",
        label: "Custom Application Form",
        iconKey: "custom-application-form",
        description: "Add custom application questions for this tenant.",
        stepType: "custom_question",
      },
    ],
  },
  {
    id: "document-esign",
    label: "Document & eSign",
    steps: [
      {
        id: "document-upload",
        label: "Document Upload",
        iconKey: "document-upload",
        description: "Request tenant-specific applicant documents.",
        stepType: "document_upload",
      },
      {
        id: "welcome-packet-esign",
        label: "Welcome Packet & eSign",
        iconKey: "welcome-packet-esign",
        description: "Collect signed onboarding packet acknowledgments.",
        stepType: "authorizations",
      },
      {
        id: "i9-right-to-work-verification",
        label: "I-9 / Right to Work Verification",
        iconKey: "i9-right-to-work-verification",
        description: "Request right-to-work verification documents.",
        stepType: "document_upload",
      },
      {
        id: "tax-forms",
        label: "Tax Forms (W-4 / State)",
        iconKey: "tax-forms",
        description: "Collect payroll tax forms.",
        stepType: "document_upload",
      },
      {
        id: "employee-agreement",
        label: "Employee Agreement / Contract eSign",
        iconKey: "employee-agreement",
        description: "Collect employee agreement signatures.",
        stepType: "authorizations",
      },
      {
        id: "policy-acknowledgment",
        label: "Policy Acknowledgment",
        iconKey: "policy-acknowledgment",
        description: "Collect policy acknowledgments.",
        stepType: "authorizations",
      },
      {
        id: "equipment-badge-acknowledgment",
        label: "Equipment / Badge Acknowledgment",
        iconKey: "equipment-badge-acknowledgment",
        description: "Track equipment or badge acknowledgment.",
        stepType: "document_upload",
      },
    ],
  },
  {
    id: "screening-compliance",
    label: "Screening & Compliance Steps",
    steps: [
      {
        id: "background-check",
        label: "Background Check",
        iconKey: "background-check",
        description: "Track background check completion.",
        stepType: "custom_question",
      },
      {
        id: "drug-test-screening",
        label: "Drug Test / Screening",
        iconKey: "drug-test-screening",
        description: "Track drug test or screening requirements.",
        stepType: "custom_question",
      },
      {
        id: "oig-exclusion-check",
        label: "OIG / Exclusion Check",
        iconKey: "oig-exclusion-check",
        description: "Track OIG or exclusion screening.",
        stepType: "custom_question",
      },
      {
        id: "reference-verification",
        label: "Reference Verification",
        iconKey: "reference-verification",
        description: "Track reference verification.",
        stepType: "references",
      },
      {
        id: "credential-license-verification",
        label: "Credential / License Verification",
        iconKey: "credential-license-verification",
        description: "Verify professional credentials and licenses.",
        stepType: "professional_license",
      },
      {
        id: "ssn-identity-verification",
        label: "SSN / Identity Verification",
        iconKey: "ssn-identity-verification",
        description: "Collect identity verification documentation.",
        stepType: "document_upload",
      },
    ],
  },
  {
    id: "payroll-financial",
    label: "Payroll & Financial Steps",
    steps: [
      {
        id: "direct-deposit-setup",
        label: "Direct Deposit Setup",
        iconKey: "direct-deposit-setup",
        description: "Collect direct deposit information.",
        stepType: "profile_information",
      },
      {
        id: "benefits-enrollment",
        label: "Benefits Enrollment / Selection",
        iconKey: "benefits-enrollment",
        description: "Collect benefits enrollment choices.",
        stepType: "profile_information",
      },
      {
        id: "401k-enrollment",
        label: "401K / Retirement Enrollment",
        iconKey: "401k-enrollment",
        description: "Collect retirement enrollment choices.",
        stepType: "profile_information",
      },
      {
        id: "pay-rate-hire-date",
        label: "Pay Rate & Hire Date Entry",
        iconKey: "pay-rate-hire-date",
        description: "Collect or confirm pay rate and hire date details.",
        stepType: "profile_information",
      },
      {
        id: "payroll-profile-creation",
        label: "Payroll Profile Creation",
        iconKey: "payroll-profile-creation",
        description: "Create the payroll profile checklist.",
        stepType: "profile_information",
      },
    ],
  },
  {
    id: "training-development",
    label: "Training & Development Steps",
    steps: [
      {
        id: "safety-training",
        label: "Safety Training",
        iconKey: "safety-training",
        description: "Assign safety training tasks.",
        stepType: "custom_question",
      },
      {
        id: "training-modules-quiz",
        label: "Training Modules + Quiz",
        iconKey: "training-modules-quiz",
        description: "Assign training modules and quiz questions.",
        stepType: "skill_assessment",
      },
      {
        id: "orientation-video",
        label: "Orientation / Onboarding Video",
        iconKey: "orientation-video",
        description: "Assign orientation content.",
        stepType: "custom_question",
      },
      {
        id: "compliance-training",
        label: "Compliance Training",
        iconKey: "compliance-training",
        description: "Assign compliance training content.",
        stepType: "custom_question",
      },
      {
        id: "certification-upload",
        label: "Certification Upload / Renewal",
        iconKey: "certification-upload",
        description: "Request certification upload or renewal details.",
        stepType: "professional_license",
      },
    ],
  },
  {
    id: "approval-decision",
    label: "Approval & Decision Steps",
    steps: [
      {
        id: "offer-acceptance",
        label: "Pay Rate Accepted",
        iconKey: "offer-acceptance",
        description: "Confirm and accept the agreed pay rate.",
        stepType: "custom_question",
      },
      {
        id: "manager-facility-approval",
        label: "Manager / Facility Approval",
        iconKey: "manager-facility-approval",
        description: "Request manager or facility approval.",
        stepType: "custom_question",
      },
      {
        id: "hr-final-approval",
        label: "HR Final Approval",
        iconKey: "hr-final-approval",
        description: "Request final HR approval before hire.",
        stepType: "custom_question",
      },
      {
        id: "recruiter-screening",
        label: "Recruiter Screening",
        iconKey: "reference-verification",
        description: "Recruiter screens the candidate before client review.",
        stepType: "custom_question",
      },
      {
        id: "interview-qualification",
        label: "Interview / Qualification",
        iconKey: "manager-welcome-call",
        description: "Track interview or qualification steps for the candidate.",
        stepType: "custom_question",
      },
      {
        id: "client-review",
        label: "Client Review",
        iconKey: "manager-facility-approval",
        description: "Client reviews the candidate before hire or handoff.",
        stepType: "custom_question",
      },
      {
        id: "candidate-selection",
        label: "Candidate Approval / Selection",
        iconKey: "hr-final-approval",
        description: "Approve or select the candidate for client handoff.",
        stepType: "custom_question",
      },
      {
        id: "release-to-client",
        label: "Release to Client",
        iconKey: "completion-milestone",
        description:
          "Mark recruitment complete and hand the candidate off to the client for final hiring.",
        stepType: "custom_question",
        defaultPhase: "transition",
      },
      {
        id: "submit-to-msp",
        label: "Submit to MSP",
        iconKey: "submit-to-msp",
        description:
          "Prepare the candidate profile and required packet, then submit the candidate to the MSP.",
        stepType: "custom_question",
        defaultPhase: "pre_hire",
      },
      {
        id: "conditional-branch-decision",
        label: "Conditional Branch",
        iconKey: "conditional-branch-decision",
        description: "Branch the flow based on a decision outcome.",
        stepType: "custom_question",
      },
      {
        id: "adverse-action-process",
        label: "Adverse Action Process",
        iconKey: "adverse-action-process",
        description: "Track adverse action steps when required.",
        stepType: "custom_question",
      },
    ],
  },
  {
    id: "communication-notification",
    label: "Welcome & Complete",
    steps: [
      {
        id: "welcome-email",
        label: "Send Message",
        iconKey: "welcome-email",
        description: "Send a welcome or onboarding message to the new hire.",
        stepType: "custom_question",
      },
      {
        id: "manager-welcome-call",
        label: "Welcome Call",
        iconKey: "manager-welcome-call",
        description: "Schedule or track a welcome call.",
        stepType: "custom_question",
      },
      {
        id: "final-onboarding-call",
        label: "Final Onboarding Call",
        iconKey: "final-onboarding-call",
        description: "Schedule or track the final onboarding call.",
        stepType: "custom_question",
      },
      {
        id: "buddy-mentor-assignment",
        label: "Buddy / Mentor Assignment",
        iconKey: "buddy-mentor-assignment",
        description: "Assign a buddy or mentor to the new hire.",
        stepType: "custom_question",
      },
      {
        id: "completion-milestone",
        label: "Onboarding Complete",
        iconKey: "completion-milestone",
        description: "Mark onboarding complete.",
        stepType: "custom_question",
      },
    ],
  },
  {
    id: "team-operational",
    label: "Team & Operational Steps",
    steps: [
      {
        id: "badge-equipment-issuance",
        label: "Badge / Equipment Issuance",
        iconKey: "badge-equipment-issuance",
        description: "Track badge or equipment issuance.",
        stepType: "custom_question",
      },
      {
        id: "schedule-assignment",
        label: "Schedule Assignment",
        iconKey: "schedule-assignment",
        description: "Assign work schedule for the new hire.",
        stepType: "custom_question",
      },
      {
        id: "facility-access-setup",
        label: "Facility Access Setup",
        iconKey: "facility-access-setup",
        description: "Set up facility access for the new hire.",
        stepType: "custom_question",
      },
      {
        id: "benefits-confirmation",
        label: "Benefits Confirmation",
        iconKey: "benefits-confirmation",
        description: "Confirm benefits enrollment details.",
        stepType: "custom_question",
      },
    ],
  },
  {
    id: "custom-flexible",
    label: "Custom & Flexible Steps",
    steps: [
      {
        id: "manual-task-hr-action",
        label: "Manual Task / HR Action",
        iconKey: "manual-task-hr-action",
        description: "Assign a manual HR task.",
        stepType: "custom_question",
      },
      {
        id: "external-integration",
        label: "External Integration",
        iconKey: "external-integration",
        description: "Trigger or track an external integration.",
        stepType: "custom_question",
      },
      {
        id: "conditional-logic",
        label: "Conditional Logic",
        iconKey: "conditional-logic",
        description: "Apply conditional logic to show or hide steps.",
        stepType: "custom_question",
      },
      {
        id: "parallel-step-group",
        label: "Parallel Step Group",
        iconKey: "parallel-step-group",
        description: "Group parallel steps in the flow.",
        stepType: "custom_question",
      },
    ],
  },
];

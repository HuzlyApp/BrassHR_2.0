"use client";

import type { ReactNode } from "react";
import type { StepCategory } from "@/app/components/workflow-builder";
import type {
  WorkflowStepLibraryCategory,
  WorkflowStepLibraryItem,
} from "@/lib/onboarding/workflow-step-library-data";
import {
  AdverseActionProcessIcon,
  BackgroundCheckIcon,
  BadgeEquipmentIssuanceIcon,
  BenefitsConfirmationIcon,
  BenefitsEnrollmentSelectionIcon,
  BuddyMentorAssignmentIcon,
  CertificationUploadRenewalIcon,
  CompletionMilestoneIcon,
  ComplianceTrainingIcon,
  ConditionalBranchIcon,
  ConditionalLogicIcon,
  CredentialLicenseVerificationIcon,
  CustomApplicationFormIcon,
  CustomFormIcon,
  CustomStepIcon,
  DirectDepositSetupIcon,
  DocumentUploadIcon,
  DrugTestScreeningIcon,
  EmployeeAgreementIcon,
  EquipmentBadgeAcknowledgmentIcon,
  ExternalIntegrationIcon,
  FacilityAccessSetupIcon,
  FinalOnboardingCallIcon,
  HrFinalApprovalIcon,
  I9RightToWorkVerificationIcon,
  ManagerFacilityApprovalIcon,
  ManagerWelcomeCallIcon,
  ManualTaskHrActionIcon,
  OigExclusionCheckIcon,
  OfferAcceptanceIcon,
  OrientationOnboardingVideoIcon,
  ParallelStepGroupIcon,
  ParameterizedJobApplicationIcon,
  PayRateHireDateEntryIcon,
  PayrollProfileCreationIcon,
  PolicyAcknowledgmentIcon,
  ReferenceVerificationIcon,
  ReferencesCollectionIcon,
  ReminderFollowUpNotificationIcon,
  ResumeBasicProfileIcon,
  RetirementEnrollmentIcon,
  SafetyTrainingIcon,
  ScheduleAssignmentIcon,
  SkillQualificationAssessmentIcon,
  SsnIdentityVerificationIcon,
  StatusUpdateEmailNotificationIcon,
  TaxFormsIcon,
  TrainingModulesQuizIcon,
  WelcomeEmailIcon,
  WelcomePacketESignIcon,
} from "@/app/components/workflow-builder/icons";

const ICONS: Record<string, ReactNode> = {
  "custom-step": <CustomStepIcon />,
  "collect-extra-files": <DocumentUploadIcon />,
  "collect-references": <ReferencesCollectionIcon />,
  "resume-basic-profile": <ResumeBasicProfileIcon />,
  "parameterized-job-application": <ParameterizedJobApplicationIcon />,
  "references-collection": <ReferencesCollectionIcon />,
  "skill-qualification-assessment": <SkillQualificationAssessmentIcon />,
  "custom-application-form": <CustomApplicationFormIcon />,
  "document-upload": <DocumentUploadIcon />,
  "welcome-packet-esign": <WelcomePacketESignIcon />,
  "i9-right-to-work-verification": <I9RightToWorkVerificationIcon />,
  "tax-forms": <TaxFormsIcon />,
  "employee-agreement": <EmployeeAgreementIcon />,
  "policy-acknowledgment": <PolicyAcknowledgmentIcon />,
  "equipment-badge-acknowledgment": <EquipmentBadgeAcknowledgmentIcon />,
  "background-check": <BackgroundCheckIcon />,
  "drug-test-screening": <DrugTestScreeningIcon />,
  "oig-exclusion-check": <OigExclusionCheckIcon />,
  "reference-verification": <ReferenceVerificationIcon />,
  "credential-license-verification": <CredentialLicenseVerificationIcon />,
  "ssn-identity-verification": <SsnIdentityVerificationIcon />,
  "direct-deposit-setup": <DirectDepositSetupIcon />,
  "benefits-enrollment": <BenefitsEnrollmentSelectionIcon />,
  "401k-enrollment": <RetirementEnrollmentIcon />,
  "pay-rate-hire-date": <PayRateHireDateEntryIcon />,
  "payroll-profile-creation": <PayrollProfileCreationIcon />,
  "safety-training": <SafetyTrainingIcon />,
  "training-modules-quiz": <TrainingModulesQuizIcon />,
  "orientation-video": <OrientationOnboardingVideoIcon />,
  "compliance-training": <ComplianceTrainingIcon />,
  "certification-upload": <CertificationUploadRenewalIcon />,
  "offer-acceptance": <OfferAcceptanceIcon />,
  "manager-facility-approval": <ManagerFacilityApprovalIcon />,
  "hr-final-approval": <HrFinalApprovalIcon />,
  "recruiter-screening": <ReferenceVerificationIcon />,
  "interview-qualification": <ManagerWelcomeCallIcon />,
  "internal-select": <HrFinalApprovalIcon />,
  "client-review": <ManagerFacilityApprovalIcon />,
  "candidate-selection": <HrFinalApprovalIcon />,
  "release-to-client": <CompletionMilestoneIcon />,
  "conditional-branch-decision": <ConditionalBranchIcon />,
  "adverse-action-process": <AdverseActionProcessIcon />,
  "welcome-email": <WelcomeEmailIcon />,
  "status-update-notification": <StatusUpdateEmailNotificationIcon />,
  "manager-welcome-call": <ManagerWelcomeCallIcon />,
  "final-onboarding-call": <FinalOnboardingCallIcon />,
  "reminder-follow-up-notification": <ReminderFollowUpNotificationIcon />,
  "badge-equipment-issuance": <BadgeEquipmentIssuanceIcon />,
  "buddy-mentor-assignment": <BuddyMentorAssignmentIcon />,
  "schedule-assignment": <ScheduleAssignmentIcon />,
  "facility-access-setup": <FacilityAccessSetupIcon />,
  "benefits-confirmation": <BenefitsConfirmationIcon />,
  "custom-form": <CustomFormIcon />,
  "manual-task-hr-action": <ManualTaskHrActionIcon />,
  "external-integration": <ExternalIntegrationIcon />,
  "conditional-logic": <ConditionalLogicIcon />,
  "parallel-step-group": <ParallelStepGroupIcon />,
  "completion-milestone": <CompletionMilestoneIcon />,
  "follow-up-interview": <ManagerWelcomeCallIcon />,
  "submit-to-client": <CompletionMilestoneIcon />,
  "authorization-esign": <EmployeeAgreementIcon />,
  "offer-prep": <OfferAcceptanceIcon />,
  "manager-approval": <ManagerFacilityApprovalIcon />,
  w9: <TaxFormsIcon />,
  "system-access": <FacilityAccessSetupIcon />,
  "health-screening-waiver": <ComplianceTrainingIcon />,
  "record-selection": <HrFinalApprovalIcon />,
  "pre-hire-completion-milestone": <CompletionMilestoneIcon />,
  "post-hire-completion-milestone": <CompletionMilestoneIcon />,
};

function hydrateStep(step: WorkflowStepLibraryItem) {
  return {
    id: step.id,
    label: step.label,
    description: step.description,
    keywords: step.keywords,
    defaultPhase: step.defaultPhase,
    iconKey: step.iconKey,
    icon: ICONS[step.iconKey] ?? <CustomStepIcon />,
  };
}

export function hydrateWorkflowStepLibrary(
  data: WorkflowStepLibraryCategory[]
): StepCategory[] {
  return data.map((category) => ({
    id: category.id,
    label: category.label,
    steps: category.steps.map(hydrateStep),
  }));
}

export function buildWorkflowStepLookup(
  library: StepCategory[]
): Map<string, { id: string; label: string; icon: ReactNode }> {
  const map = new Map<string, { id: string; label: string; icon: ReactNode }>();
  for (const category of library) {
    for (const step of category.steps) {
      map.set(step.id, step);
    }
  }
  return map;
}

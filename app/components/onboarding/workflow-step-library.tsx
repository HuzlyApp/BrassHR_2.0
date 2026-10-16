"use client";

import type { ReactNode } from "react";
import type { StepCategory } from "@/app/components/workflow-builder";
import type {
  WorkflowStepLibraryCategory,
  WorkflowStepLibraryItem,
} from "@/lib/onboarding/workflow-step-library-data";
import { FIGMA_POST_HIRE_GROUPS, FIGMA_PRE_HIRE_GROUPS } from "@/app/components/workflow-builder/library-category-theme";
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

function applyFigmaGroups(
  data: WorkflowStepLibraryCategory[],
  groups: typeof FIGMA_PRE_HIRE_GROUPS,
  options?: { dropCategoryIds?: string[] }
): WorkflowStepLibraryCategory[] {
  const figmaStepIds = new Set(groups.flatMap((group) => group.steps.map((step) => step.id)));
  const figmaCategoryIds = new Set(groups.map((group) => group.id));
  const dropIds = new Set(options?.dropCategoryIds ?? []);
  const allSteps = data.flatMap((category) => category.steps);

  const withoutFigmaSteps = data
    .map((category) => ({
      ...category,
      steps: category.steps.filter((step) => !figmaStepIds.has(step.id)),
    }))
    .filter(
      (category) =>
        !dropIds.has(category.id) &&
        (category.steps.length > 0 || figmaCategoryIds.has(category.id))
    );

  const byId = new Map(withoutFigmaSteps.map((category) => [category.id, category]));

  for (const group of groups) {
    const resolved = group.steps.map((def) => {
      const existing = allSteps.find((step) => step.id === def.id);
      if (existing) {
        return {
          ...existing,
          label: def.label,
          description: def.description ?? existing.description,
          defaultPhase: def.defaultPhase ?? existing.defaultPhase,
          iconKey: def.iconKey ?? existing.iconKey,
        };
      }
      return {
        id: def.id,
        label: def.label,
        iconKey: def.iconKey ?? def.id,
        description: def.description,
        stepType: resolveFigmaStepType(def.id),
        defaultPhase: def.defaultPhase,
      };
    });

    const existing = byId.get(group.id);
    const leftover =
      existing?.steps.filter((step) => !figmaStepIds.has(step.id)) ?? [];
    byId.set(group.id, {
      id: group.id,
      label: group.label,
      steps: [...resolved, ...leftover],
    });
  }

  return Array.from(byId.values());
}

function resolveFigmaStepType(stepId: string): WorkflowStepLibraryItem["stepType"] {
  if (stepId === "collect-references" || stepId === "reference-verification") {
    return "references";
  }
  if (
    stepId === "collect-extra-files" ||
    stepId === "i9-right-to-work-verification" ||
    stepId === "i9-section-2" ||
    stepId === "document-upload"
  ) {
    return "document_upload";
  }
  if (stepId === "skill-qualification-assessment") return "skill_assessment";
  if (
    stepId === "employee-agreement" ||
    stepId === "authorization-esign" ||
    stepId === "welcome-packet-esign" ||
    stepId === "policy-acknowledgment" ||
    stepId === "health-screening-waiver"
  ) {
    return "authorizations";
  }
  if (stepId === "w9" || stepId === "tax-forms") return "document_upload";
  if (stepId === "resume-basic-profile") return "resume_upload";
  if (stepId === "credential-license-verification" || stepId === "certification-upload") {
    return "professional_license";
  }
  if (stepId === "training-modules-quiz") return "skill_assessment";
  if (
    stepId === "pay-rate-hire-date" ||
    stepId === "parameterized-job-application" ||
    stepId === "direct-deposit-setup" ||
    stepId === "benefits-enrollment" ||
    stepId === "401k-enrollment" ||
    stepId === "payroll-profile-creation"
  ) {
    return "profile_information";
  }
  return "custom_question";
}

export function hydrateWorkflowStepLibrary(
  data: WorkflowStepLibraryCategory[]
): StepCategory[] {
  const withPreHire = applyFigmaGroups(data, FIGMA_PRE_HIRE_GROUPS);
  const withPostHire = applyFigmaGroups(withPreHire, FIGMA_POST_HIRE_GROUPS, {
    dropCategoryIds: ["document-esign"],
  });
  return withPostHire.map((category) => ({
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

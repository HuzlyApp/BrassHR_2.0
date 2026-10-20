export const CANDIDATE_DETAIL_BASE_TABS = [
  // "Checklist", // Commented out for now; will be used in future
  "Profile",
  "AI Analysis",
  "Pre-Hire",
  "Attachments",
  "Skill Assessments",
  "Authorization",
  "Activities",
  "Facility Assignments",
  "Agreement",
  "History",
] as const;

export const CANDIDATE_DETAIL_ONBOARDED_TAB = "Onboarded Applicant" as const;
export const CANDIDATE_DETAIL_POST_HIRE_TAB = "Post-Hire" as const;

export type CandidateDetailTab =
  | (typeof CANDIDATE_DETAIL_BASE_TABS)[number]
  | "Checklist"
  | typeof CANDIDATE_DETAIL_ONBOARDED_TAB
  | typeof CANDIDATE_DETAIL_POST_HIRE_TAB;

export function candidateDetailTabs(params: {
  postHireVisible: boolean;
  showOnboarded: boolean;
}): CandidateDetailTab[] {
  const tabs: CandidateDetailTab[] = [...CANDIDATE_DETAIL_BASE_TABS];
  const preHireIndex = tabs.indexOf("Pre-Hire");
  if (params.postHireVisible && preHireIndex >= 0) {
    tabs.splice(preHireIndex + 1, 0, CANDIDATE_DETAIL_POST_HIRE_TAB);
  }
  if (params.showOnboarded) tabs.push(CANDIDATE_DETAIL_ONBOARDED_TAB);
  return tabs;
}

export const CANDIDATE_DETAIL_BASE_TABS = [
  // "Checklist", // Commented out for now; will be used in future
  "Profile",
  "Resume",
  // "Applications", // Figma tab — no dedicated candidate-detail route yet
  "AI Analysis",
  "Skill Assessments",
  // "Licenses & Certifications", // Figma tab — content lives on Profile for now
  "Attachments",
  "Activities",
  "Pre-Hire",
  // Tabs present in code but not in current Figma applicant-details tab bar:
  // "Authorization",
  // "Facility Assignments",
  // "Agreement",
  // "History",
] as const;

export const CANDIDATE_DETAIL_ONBOARDED_TAB = "Onboarded Applicant" as const;
export const CANDIDATE_DETAIL_POST_HIRE_TAB = "Post-Hire" as const;

export type CandidateDetailTab =
  | (typeof CANDIDATE_DETAIL_BASE_TABS)[number]
  | "Checklist"
  | "Applications"
  | "Licenses & Certifications"
  | "Authorization"
  | "Facility Assignments"
  | "Agreement"
  | "History"
  | typeof CANDIDATE_DETAIL_ONBOARDED_TAB
  | typeof CANDIDATE_DETAIL_POST_HIRE_TAB;

/** Figma-facing label for a tab (keeps route keys stable). */
export function candidateDetailTabLabel(tab: CandidateDetailTab): string {
  switch (tab) {
    case "Skill Assessments":
      return "Skill Assessment";
    case "Attachments":
      return "Documents";
    case "Activities":
      return "Activity";
    case "Pre-Hire":
      return "Pre-hire";
    default:
      return tab;
  }
}

export function candidateDetailTabs(params: {
  postHireVisible: boolean;
  showOnboarded: boolean;
}): CandidateDetailTab[] {
  const tabs: CandidateDetailTab[] = [...CANDIDATE_DETAIL_BASE_TABS];
  // Post-Hire / Onboarded are not in the Figma tab strip; keep routes but hide from nav for now.
  // const preHireIndex = tabs.indexOf("Pre-Hire");
  // if (params.postHireVisible && preHireIndex >= 0) {
  //   tabs.splice(preHireIndex + 1, 0, CANDIDATE_DETAIL_POST_HIRE_TAB);
  // }
  // if (params.showOnboarded) tabs.push(CANDIDATE_DETAIL_ONBOARDED_TAB);
  void params;
  return tabs;
}

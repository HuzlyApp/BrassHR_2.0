/**
 * Applicant onboarding URL slugs (kebab-case, no numeric step segments).
 * Use these constants for navigation, redirects, and pathname matching.
 */
export const APPLICATION_ROUTES = {
  addResume: "/application/add-resume",
  addResumeV2: "/application/add-resume-v2",
  resumeUploadSuccess: "/application/resume-upload-success",
  profileReview: "/application/profile-review",
  parseResume: "/application/parse-resume",
  professionalLicense: "/application/professional-license",
  skillsIntro: "/application/skills-intro",
  skillAssessment: "/application/skill-assessment",
  skillQuiz: (slug: string) =>
    `/application/skill-quiz/${encodeURIComponent(slug)}`,
  authorizationsDocuments: "/application/authorizations-documents",
  /** Preferred applicant signing route (provider-neutral). */
  eSignature: "/application/e-signature",
  /** @deprecated Prefer `eSignature`; kept for bookmarks and older links. */
  firmaSign: "/application/firma-sign",
  /** Agreement / acknowledgment eSign steps (e.g. Agreement eSign) — titled from the workflow step. */
  agreementSignature: "/application/agreement-signature",
  identityVerification: "/application/identity-verification",
  addReferences: "/application/add-references",
  referenceReview: "/application/reference-review",
  applicationSummary: "/application/application-summary",
  applicationStatus: "/application/application-status",
  preHireCompletion: "/application/pre-hire-completion",
  postHireCompletion: "/application/post-hire-completion",
  jobScreening: "/application/job-screening",
  collectExtraFiles: "/application/collect-extra-files",
  customStep: (stepKey: string) => `/application/custom-step/${encodeURIComponent(stepKey)}`,
} as const;

/** Identity document upload screen — keep stepKey so route guard stays on authorizations step. */
export function identityVerificationPath(
  tenantSlug?: string | null,
  stepKey?: string | null
): string {
  const params = new URLSearchParams();
  if (tenantSlug?.trim()) params.set("tenant", tenantSlug.trim().toLowerCase());
  if (stepKey?.trim()) params.set("stepKey", stepKey.trim());
  const qs = params.toString();
  return qs
    ? `${APPLICATION_ROUTES.identityVerification}?${qs}`
    : APPLICATION_ROUTES.identityVerification;
}

/** Pathname fragments used to resolve which configured step index the user is on. */
export const APPLICATION_ROUTE_STEP_MARKERS: {
  stepKey?: string;
  stepType?: string;
  pathIncludes: string[];
}[] = [
  {
    stepKey: "resume_upload",
    pathIncludes: [
      APPLICATION_ROUTES.addResume,
      APPLICATION_ROUTES.addResumeV2,
      APPLICATION_ROUTES.resumeUploadSuccess,
      APPLICATION_ROUTES.profileReview,
      APPLICATION_ROUTES.parseResume,
      "/application/step-1-",
    ],
  },
  {
    stepType: "profile_information",
    pathIncludes: [
      APPLICATION_ROUTES.jobScreening,
    ],
  },
  {
    stepType: "professional_license",
    pathIncludes: [APPLICATION_ROUTES.professionalLicense, "/application/step-2-"],
  },
  {
    stepKey: "professional_license",
    pathIncludes: [APPLICATION_ROUTES.professionalLicense, "/application/step-2-"],
  },
  {
    stepType: "document_upload",
    pathIncludes: [APPLICATION_ROUTES.professionalLicense, "/application/step-2-"],
  },
  {
    stepType: "skill_assessment",
    pathIncludes: [
      APPLICATION_ROUTES.skillsIntro,
      APPLICATION_ROUTES.skillAssessment,
      "/application/skill-quiz/",
      "/application/step-3-",
    ],
  },
  {
    stepKey: "skill_assessment",
    pathIncludes: [
      APPLICATION_ROUTES.skillsIntro,
      APPLICATION_ROUTES.skillAssessment,
      "/application/skill-quiz/",
      "/application/step-3-",
    ],
  },
  {
    stepKey: "authorization_background_check",
    pathIncludes: [
      APPLICATION_ROUTES.authorizationsDocuments,
      APPLICATION_ROUTES.identityVerification,
      "/application/custom-step/authorization_background_check",
    ],
  },
  {
    stepType: "authorizations",
    pathIncludes: [
      APPLICATION_ROUTES.eSignature,
      APPLICATION_ROUTES.firmaSign,
      APPLICATION_ROUTES.agreementSignature,
    ],
  },
  {
    stepType: "authorizations",
    pathIncludes: [
      APPLICATION_ROUTES.authorizationsDocuments,
      APPLICATION_ROUTES.identityVerification,
      "/application/employee-agreement",
      "/application/upload-form",
      "/application/step-4-",
    ],
  },  {
    stepKey: "authorizations",
    pathIncludes: [
      APPLICATION_ROUTES.authorizationsDocuments,
      APPLICATION_ROUTES.identityVerification,
      "/application/employee-agreement",
      "/application/upload-form",
      "/application/step-4-",
    ],
  },
  {
    stepType: "references",
    pathIncludes: [
      APPLICATION_ROUTES.addReferences,
      APPLICATION_ROUTES.referenceReview,
      "/application/step-5-",
    ],
  },
  {
    stepType: "review_submit",
    pathIncludes: [APPLICATION_ROUTES.applicationSummary, "/application/step-6-"],
  },
];

/** Permanent redirects from legacy numeric paths (and generic /onboarding/step-N). */
export const LEGACY_APPLICATION_ROUTE_REDIRECTS: { source: string; destination: string }[] = [
  { source: "/application/step-1-upload-v2", destination: APPLICATION_ROUTES.addResumeV2 },
  { source: "/application/step-1-parse", destination: APPLICATION_ROUTES.parseResume },
  { source: "/onboarding/step-1", destination: APPLICATION_ROUTES.addResume },
  { source: "/onboarding/step-2", destination: APPLICATION_ROUTES.professionalLicense },
  { source: "/onboarding/step-3", destination: APPLICATION_ROUTES.skillsIntro },
  { source: "/onboarding/step-4", destination: APPLICATION_ROUTES.authorizationsDocuments },
  { source: "/onboarding/step-5", destination: APPLICATION_ROUTES.addReferences },
  { source: "/onboarding/step-6", destination: APPLICATION_ROUTES.applicationSummary },
  { source: "/onboarding/add-resume", destination: APPLICATION_ROUTES.addResume },
  { source: "/onboarding/onboarding-steps", destination: APPLICATION_ROUTES.skillsIntro },
  { source: "/onboarding/profile-review", destination: APPLICATION_ROUTES.profileReview },
  { source: "/application/firma-sign", destination: APPLICATION_ROUTES.eSignature },
];

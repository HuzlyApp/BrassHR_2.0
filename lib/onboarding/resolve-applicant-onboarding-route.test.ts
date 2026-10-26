import { describe, expect, it } from "vitest";
import { APPLICATION_ROUTES } from "@/lib/onboarding/application-routes";
import { createDefaultOnboardingStepDrafts } from "@/lib/onboarding/default-onboarding-steps";
import { publishedWorkflow } from "@/lib/onboarding/applicant-workflow-fixtures";
import { publishedWorkflowToTenantConfig } from "@/lib/onboarding/applicant-workflow";
import {
  resolveApplicantOnboardingRoute,
  resolveApplicantOnboardingSteps,
} from "@/lib/onboarding/resolve-applicant-onboarding-route";
import type {
  TenantOnboardingConfig,
  TenantOnboardingStep,
  WorkerOnboardingProgressPayload,
} from "@/lib/onboarding/types";
import { adjacentStepRoute } from "@/lib/onboarding/tenant-step-navigation";

function legacyZipstaffConfig(): TenantOnboardingConfig {
  const drafts = createDefaultOnboardingStepDrafts();
  return {
    configId: "cfg-legacy",
    tenantId: "tenant-zipstaff",
    version: 1,
    steps: drafts.map((d) => ({
      id: `step-${d.step_key}`,
      step_key: d.step_key,
      title: d.title,
      description: d.description,
      step_type: d.step_type,
      sort_order: d.sort_order,
      is_required: d.is_required,
      is_enabled: d.is_enabled,
      metadata: d.metadata,
    })),
    requiredDocuments: [],
    skillAssessments: [],
  };
}

function zipstaffConfigWithReferences(): TenantOnboardingConfig {
  // Defaults already include the Add Reference step; keep helper for test readability.
  return legacyZipstaffConfig();
}

function progressWithCompletedThrough(
  steps: TenantOnboardingStep[],
  completedCount: number
): WorkerOnboardingProgressPayload {
  return {
    progressId: "prog-1",
    status: "in_progress",
    steps: steps.slice(0, completedCount).map((step) => ({
      onboarding_step_id: step.id,
      status: "completed" as const,
      completed_at: new Date().toISOString(),
      data: {},
    })),
  };
}

function baseInput(overrides: Partial<Parameters<typeof resolveApplicantOnboardingRoute>[0]> = {}) {
  const config = legacyZipstaffConfig();
  const enabled = resolveApplicantOnboardingSteps(config);
  return {
    isLoadingSession: false,
    isLoadingTenant: false,
    isLoadingConfig: false,
    isLoadingProgress: false,
    tenantSlug: "zipstaff",
    config,
    progress: progressWithCompletedThrough(enabled, 1),
    pathname: APPLICATION_ROUTES.profileReview,
    search: "?tenant=zipstaff",
    ...overrides,
  };
}

describe("resolveApplicantOnboardingRoute", () => {
  it("returns loading while session is loading on profile review", () => {
    const decision = resolveApplicantOnboardingRoute(
      baseInput({
        isLoadingSession: true,
        progress: null,
      })
    );
    expect(decision).toEqual({ status: "loading" });
  });

  it("returns loading while progress is loading", () => {
    const decision = resolveApplicantOnboardingRoute(
      baseInput({
        isLoadingProgress: true,
        progress: null,
      })
    );
    expect(decision).toEqual({ status: "loading" });
  });

  it("returns loading while resume status is loading", () => {
    const decision = resolveApplicantOnboardingRoute(
      baseInput({
        isLoadingResume: true,
        progress: null,
      })
    );
    expect(decision).toEqual({ status: "loading" });
  });

  it("allows profile review after refresh when resume is completed", () => {
    const decision = resolveApplicantOnboardingRoute(baseInput());
    expect(decision).toEqual({ status: "allow" });
  });

  it("does not redirect completed resume applicants to add-resume during rehydration", () => {
    const config = legacyZipstaffConfig();
    const enabled = resolveApplicantOnboardingSteps(config);
    const decision = resolveApplicantOnboardingRoute(
      baseInput({
        pathname: APPLICATION_ROUTES.professionalLicense,
        progress: progressWithCompletedThrough(enabled, 1),
      })
    );
    expect(decision.status).toBe("allow");
    if (decision.status === "redirect") {
      expect(decision.href).not.toContain("/application/add-resume");
    }
  });

  it("redirects invalid direct routes to the next incomplete step, not always add-resume", () => {
    const config = legacyZipstaffConfig();
    const enabled = resolveApplicantOnboardingSteps(config);
    const decision = resolveApplicantOnboardingRoute(
      baseInput({
        pathname: APPLICATION_ROUTES.professionalLicense,
        progress: progressWithCompletedThrough(enabled, 1),
      })
    );
    expect(decision).toEqual({ status: "allow" });

    const aheadDecision = resolveApplicantOnboardingRoute(
      baseInput({
        pathname: APPLICATION_ROUTES.skillAssessment,
        progress: progressWithCompletedThrough(enabled, 1),
      })
    );
    expect(aheadDecision.status).toBe("redirect");
    if (aheadDecision.status === "redirect") {
      expect(aheadDecision.href).toContain("professional-license");
      expect(aheadDecision.href).toContain("tenant=zipstaff");
      expect(aheadDecision.href).not.toContain("/application/add-resume");
    }
  });

  it("shows the completion screen once every step is done, even without a Review & Submit step", () => {
    const config = legacyZipstaffConfig();
    const enabled = resolveApplicantOnboardingSteps(config);
    const allDone = progressWithCompletedThrough(enabled, enabled.length);

    expect(
      resolveApplicantOnboardingRoute(
        baseInput({
          pathname: APPLICATION_ROUTES.applicationStatus,
          search: "?completion=pre_hire&tenant=zipstaff",
          progress: allDone,
        })
      )
    ).toEqual({ status: "allow" });

    const fromUnknown = resolveApplicantOnboardingRoute(
      baseInput({
        pathname: "/application/not-a-real-step",
        search: "?tenant=zipstaff&job_token=job-1",
        progress: allDone,
      })
    );
    expect(fromUnknown.status).toBe("redirect");
    if (fromUnknown.status === "redirect") {
      expect(fromUnknown.href).toContain(APPLICATION_ROUTES.applicationStatus);
      expect(fromUnknown.href).toContain("completion=pre_hire");
      expect(fromUnknown.href).toContain("job_token=job-1");
    }
  });

  it("sends hired applicants to the completion screen when the workflow has no post-hire steps", () => {
    const config = { ...legacyZipstaffConfig(), steps: [] };
    const progress: WorkerOnboardingProgressPayload = {
      progressId: "prog-1",
      status: "in_progress",
      steps: [],
      workflowPhase: "post_hire",
    };

    const fromStep = resolveApplicantOnboardingRoute(
      baseInput({
        config,
        progress,
        pathname: APPLICATION_ROUTES.agreementSignature,
        search: "?stepKey=authorizations&tenant=zipstaff&job_token=job-1",
      })
    );
    expect(fromStep.status).toBe("redirect");
    if (fromStep.status === "redirect") {
      expect(fromStep.href).toContain(APPLICATION_ROUTES.applicationStatus);
      expect(fromStep.href).toContain("completion=pre_hire");
      expect(fromStep.href).toContain("job_token=job-1");
    }

    expect(
      resolveApplicantOnboardingRoute(
        baseInput({
          config,
          progress,
          pathname: APPLICATION_ROUTES.applicationStatus,
          search: "?completion=pre_hire&tenant=zipstaff",
        })
      )
    ).toEqual({ status: "allow" });
  });

  it("keeps sending applicants with unfinished steps away from the completion screen", () => {
    const config = legacyZipstaffConfig();
    const enabled = resolveApplicantOnboardingSteps(config);
    const decision = resolveApplicantOnboardingRoute(
      baseInput({
        pathname: APPLICATION_ROUTES.applicationStatus,
        search: "?completion=pre_hire&tenant=zipstaff",
        progress: progressWithCompletedThrough(enabled, enabled.length - 1),
      })
    );
    expect(decision.status).toBe("redirect");
    if (decision.status === "redirect") {
      expect(decision.href).not.toContain(APPLICATION_ROUTES.applicationStatus);
    }
  });

  it("preserves tenant query on redirects", () => {
    const config = legacyZipstaffConfig();
    const enabled = resolveApplicantOnboardingSteps(config);
    const decision = resolveApplicantOnboardingRoute(
      baseInput({
        pathname: "/application/not-a-real-step",
        search: "?tenant=zipstaff&applicationId=abc",
        progress: progressWithCompletedThrough(enabled, 0),
      })
    );
    expect(decision.status).toBe("redirect");
    if (decision.status === "redirect") {
      expect(decision.href).toContain("tenant=zipstaff");
      expect(decision.href).toContain("applicationId=abc");
    }
  });

  it("routes tenants independently using their published flows", () => {
    const tenantA = publishedWorkflowToTenantConfig(publishedWorkflow);
    const tenantB = legacyZipstaffConfig();
    const stepsA = resolveApplicantOnboardingSteps(tenantA);
    const stepsB = resolveApplicantOnboardingSteps(tenantB);

    const decisionA = resolveApplicantOnboardingRoute({
      isLoadingSession: false,
      isLoadingTenant: false,
      isLoadingConfig: false,
      isLoadingProgress: false,
      tenantSlug: "subdomaintest",
      config: tenantA,
      progress: null,
      pathname: APPLICATION_ROUTES.skillsIntro,
      search: "?tenant=subdomaintest",
    });

    const decisionB = resolveApplicantOnboardingRoute({
      isLoadingSession: false,
      isLoadingTenant: false,
      isLoadingConfig: false,
      isLoadingProgress: false,
      tenantSlug: "zipstaff",
      config: tenantB,
      progress: null,
      pathname: APPLICATION_ROUTES.profileReview,
      search: "?tenant=zipstaff",
    });

    expect(stepsA[0]?.step_key).not.toBe(stepsB[0]?.step_key);
    expect(decisionA.status).toBe("allow");
    expect(decisionB.status).toBe("allow");
  });

  it("defaults to first incomplete published step instead of hardcoded add-resume when no progress", () => {
    const tenantA = publishedWorkflowToTenantConfig(publishedWorkflow);
    const stepsA = resolveApplicantOnboardingSteps(tenantA);
    const decision = resolveApplicantOnboardingRoute({
      isLoadingSession: false,
      isLoadingTenant: false,
      isLoadingConfig: false,
      isLoadingProgress: false,
      tenantSlug: "subdomaintest",
      config: tenantA,
      progress: null,
      pathname: "/application/unknown-route",
      search: "?tenant=subdomaintest",
    });

    expect(decision.status).toBe("redirect");
    if (decision.status === "redirect") {
      expect(decision.href).not.toContain("/application/add-resume");
      expect(decision.href).toContain(stepsA[0]!.step_key);
    }
  });

  it("uses flow-aware previous step navigation instead of history back", () => {
    const config = legacyZipstaffConfig();
    const enabled = resolveApplicantOnboardingSteps(config);
    const current = enabled[1]!;
    const prev = adjacentStepRoute(config, current, -1, "zipstaff");
    expect(prev).toContain("/application/add-resume");
    expect(prev).toContain("tenant=zipstaff");
  });

  it("allows identity verification while authorization background check is in progress", () => {
    const config = legacyZipstaffConfig();
    const enabled = resolveApplicantOnboardingSteps(config);
    const resumeStep = enabled[0]!;
    const licenseStep = enabled[1]!;
    const skillStep = enabled[2]!;
    const backgroundStep = enabled.find((s) => s.step_key === "authorization_background_check")!;

    const decision = resolveApplicantOnboardingRoute({
      isLoadingSession: false,
      isLoadingTenant: false,
      isLoadingConfig: false,
      isLoadingProgress: false,
      tenantSlug: "zipstaff",
      config,
      progress: {
        progressId: "p1",
        status: "in_progress",
        steps: [
          { onboarding_step_id: resumeStep.id, status: "completed", completed_at: "2026-01-01", data: {} },
          { onboarding_step_id: licenseStep.id, status: "completed", completed_at: "2026-01-01", data: {} },
          { onboarding_step_id: skillStep.id, status: "completed", completed_at: "2026-01-01", data: {} },
          { onboarding_step_id: backgroundStep.id, status: "in_progress", completed_at: null, data: {} },
        ],
      },
      pathname: APPLICATION_ROUTES.identityVerification,
      search: "?stepKey=authorization_background_check&tenant=zipstaff",
    });

    expect(decision).toEqual({ status: "allow" });
  });

  it("allows authorizations when that step is in_progress even if skill assessment was skipped in UI", () => {
    const config = legacyZipstaffConfig();
    const enabled = resolveApplicantOnboardingSteps(config);
    const resumeStep = enabled[0]!;
    const licenseStep = enabled[1]!;
    const skillStep = enabled[2]!;
    const authStep = enabled.find((s) => s.step_key === "authorization_background_check")!;

    const decision = resolveApplicantOnboardingRoute({
      isLoadingSession: false,
      isLoadingTenant: false,
      isLoadingConfig: false,
      isLoadingProgress: false,
      tenantSlug: "zipstaff",
      config,
      progress: {
        progressId: "p1",
        status: "in_progress",
        steps: [
          { onboarding_step_id: resumeStep.id, status: "completed", completed_at: "2026-01-01", data: {} },
          { onboarding_step_id: licenseStep.id, status: "completed", completed_at: "2026-01-01", data: {} },
          { onboarding_step_id: skillStep.id, status: "pending", completed_at: null, data: {} },
          { onboarding_step_id: authStep.id, status: "in_progress", completed_at: null, data: {} },
        ],
      },
      pathname: APPLICATION_ROUTES.authorizationsDocuments,
      search: "?stepKey=authorization_background_check&tenant=zipstaff",
    });

    expect(decision).toEqual({ status: "allow" });
  });

  it("allows application summary when references step is completed", () => {
    const config = zipstaffConfigWithReferences();
    const enabled = resolveApplicantOnboardingSteps(config);
    const resumeStep = enabled.find((s) => s.step_key === "resume_upload")!;
    const licenseStep = enabled.find((s) => s.step_key === "professional_license")!;
    const skillStep = enabled.find((s) => s.step_key === "skill_assessment")!;
    const backgroundStep = enabled.find((s) => s.step_key === "authorization_background_check")!;
    const referencesStep = enabled.find((s) => s.step_key === "references")!;
    const summaryStep = enabled.find((s) => s.step_key === "review_submit")!;
    const summaryIndex = enabled.findIndex((s) => s.id === summaryStep.id) + 1;

    const decision = resolveApplicantOnboardingRoute({
      isLoadingSession: false,
      isLoadingTenant: false,
      isLoadingConfig: false,
      isLoadingProgress: false,
      tenantSlug: "zipstaff",
      config,
      progress: {
        progressId: "p1",
        status: "in_progress",
        farthestReachedStepIndex: summaryIndex,
        steps: [
          { onboarding_step_id: resumeStep.id, status: "completed", completed_at: "2026-01-01", data: {} },
          { onboarding_step_id: licenseStep.id, status: "completed", completed_at: "2026-01-01", data: {} },
          { onboarding_step_id: skillStep.id, status: "skipped", completed_at: "2026-01-01", data: {} },
          { onboarding_step_id: backgroundStep.id, status: "completed", completed_at: "2026-01-01", data: {} },
          { onboarding_step_id: referencesStep.id, status: "completed", completed_at: "2026-01-01", data: {} },
          { onboarding_step_id: summaryStep.id, status: "in_progress", completed_at: null, data: {} },
        ],
      },
      pathname: APPLICATION_ROUTES.applicationSummary,
      search: `?stepKey=${encodeURIComponent(summaryStep.step_key)}&tenant=zipstaff`,
    });

    expect(decision).toEqual({ status: "allow" });
  });

  it("allows application summary when references are still pending but summary was reached before", () => {
    const config = zipstaffConfigWithReferences();
    const enabled = resolveApplicantOnboardingSteps(config);
    const resumeStep = enabled.find((s) => s.step_key === "resume_upload")!;
    const licenseStep = enabled.find((s) => s.step_key === "professional_license")!;
    const skillStep = enabled.find((s) => s.step_key === "skill_assessment")!;
    const backgroundStep = enabled.find((s) => s.step_key === "authorization_background_check")!;
    const referencesStep = enabled.find((s) => s.step_key === "references")!;
    const summaryStep = enabled.find((s) => s.step_key === "review_submit")!;
    const summaryIndex = enabled.findIndex((s) => s.id === summaryStep.id) + 1;

    const decision = resolveApplicantOnboardingRoute({
      isLoadingSession: false,
      isLoadingTenant: false,
      isLoadingConfig: false,
      isLoadingProgress: false,
      tenantSlug: "zipstaff",
      config,
      progress: {
        progressId: "p1",
        status: "in_progress",
        farthestReachedStepIndex: summaryIndex,
        steps: [
          { onboarding_step_id: resumeStep.id, status: "completed", completed_at: "2026-01-01", data: {} },
          { onboarding_step_id: licenseStep.id, status: "completed", completed_at: "2026-01-01", data: {} },
          { onboarding_step_id: skillStep.id, status: "skipped", completed_at: "2026-01-01", data: {} },
          { onboarding_step_id: backgroundStep.id, status: "completed", completed_at: "2026-01-01", data: {} },
          { onboarding_step_id: summaryStep.id, status: "in_progress", completed_at: null, data: {} },
        ],
      },
      pathname: APPLICATION_ROUTES.applicationSummary,
      search: `?stepKey=${encodeURIComponent(summaryStep.step_key)}&tenant=zipstaff`,
    });

    expect(decision).toEqual({ status: "allow" });
    expect(referencesStep.is_required).toBe(true);
  });

  it("redirects first-time applicants away from summary before they reach it", () => {
    const config = zipstaffConfigWithReferences();
    const enabled = resolveApplicantOnboardingSteps(config);
    const resumeStep = enabled.find((s) => s.step_key === "resume_upload")!;
    const licenseStep = enabled.find((s) => s.step_key === "professional_license")!;
    const skillStep = enabled.find((s) => s.step_key === "skill_assessment")!;
    const backgroundStep = enabled.find((s) => s.step_key === "authorization_background_check")!;
    const summaryStep = enabled.find((s) => s.step_key === "review_submit")!;

    const decision = resolveApplicantOnboardingRoute({
      isLoadingSession: false,
      isLoadingTenant: false,
      isLoadingConfig: false,
      isLoadingProgress: false,
      tenantSlug: "zipstaff",
      config,
      progress: {
        progressId: "p1",
        status: "in_progress",
        farthestReachedStepIndex: 1,
        steps: [
          { onboarding_step_id: resumeStep.id, status: "completed", completed_at: "2026-01-01", data: {} },
          { onboarding_step_id: licenseStep.id, status: "completed", completed_at: "2026-01-01", data: {} },
          { onboarding_step_id: skillStep.id, status: "skipped", completed_at: "2026-01-01", data: {} },
          { onboarding_step_id: backgroundStep.id, status: "pending", completed_at: null, data: {} },
        ],
      },
      pathname: APPLICATION_ROUTES.applicationSummary,
      search: `?stepKey=${encodeURIComponent(summaryStep.step_key)}&tenant=zipstaff`,
    });

    expect(decision.status).toBe("redirect");
    if (decision.status === "redirect") {
      expect(decision.href).not.toContain("application-summary");
    }
  });

  it("allows returning applicants to navigate back to earlier reached steps", () => {
    const config = legacyZipstaffConfig();
    const enabled = resolveApplicantOnboardingSteps(config);
    const resumeStep = enabled[0]!;
    const licenseStep = enabled[1]!;
    const summaryStep = enabled.find((s) => s.step_key === "review_submit")!;
    const summaryIndex = enabled.findIndex((s) => s.id === summaryStep!.id) + 1;

    const decision = resolveApplicantOnboardingRoute({
      isLoadingSession: false,
      isLoadingTenant: false,
      isLoadingConfig: false,
      isLoadingProgress: false,
      tenantSlug: "zipstaff",
      config,
      progress: {
        progressId: "p1",
        status: "in_progress",
        farthestReachedStepIndex: summaryIndex,
        steps: [
          { onboarding_step_id: resumeStep.id, status: "completed", completed_at: "2026-01-01", data: {} },
          { onboarding_step_id: licenseStep.id, status: "pending", completed_at: null, data: {} },
          { onboarding_step_id: summaryStep!.id, status: "in_progress", completed_at: null, data: {} },
        ],
      },
      pathname: APPLICATION_ROUTES.professionalLicense,
      search: "?tenant=zipstaff",
    });

    expect(decision).toEqual({ status: "allow" });
  });

  it("allows application summary when optional references were skipped", () => {
    const config = zipstaffConfigWithReferences();
    const steps = config.steps.map((step) =>
      step.step_key === "references" ? { ...step, is_required: false } : step
    );
    const configOptionalRefs = { ...config, steps };
    const enabled = resolveApplicantOnboardingSteps(configOptionalRefs);
    const resumeStep = enabled.find((s) => s.step_key === "resume_upload")!;
    const licenseStep = enabled.find((s) => s.step_key === "professional_license")!;
    const skillStep = enabled.find((s) => s.step_key === "skill_assessment")!;
    const backgroundStep = enabled.find((s) => s.step_key === "authorization_background_check")!;
    const referencesStep = enabled.find((s) => s.step_key === "references")!;
    const summaryStep = enabled.find((s) => s.step_key === "review_submit")!;
    const summaryIndex = enabled.findIndex((s) => s.id === summaryStep.id) + 1;

    const decision = resolveApplicantOnboardingRoute({
      isLoadingSession: false,
      isLoadingTenant: false,
      isLoadingConfig: false,
      isLoadingProgress: false,
      tenantSlug: "zipstaff",
      config: configOptionalRefs,
      progress: {
        progressId: "p1",
        status: "in_progress",
        farthestReachedStepIndex: summaryIndex,
        steps: [
          { onboarding_step_id: resumeStep.id, status: "completed", completed_at: "2026-01-01", data: {} },
          { onboarding_step_id: licenseStep.id, status: "completed", completed_at: "2026-01-01", data: {} },
          { onboarding_step_id: skillStep.id, status: "skipped", completed_at: "2026-01-01", data: {} },
          { onboarding_step_id: backgroundStep.id, status: "completed", completed_at: "2026-01-01", data: {} },
          { onboarding_step_id: referencesStep.id, status: "skipped", completed_at: "2026-01-01", data: {} },
        ],
      },
      pathname: APPLICATION_ROUTES.applicationSummary,
      search: `?stepKey=${encodeURIComponent(summaryStep.step_key)}&tenant=zipstaff`,
    });

    expect(decision).toEqual({ status: "allow" });
  });

  it("allows success page after application was submitted with incomplete steps", () => {
    const decision = resolveApplicantOnboardingRoute(
      baseInput({
        progress: {
          progressId: "prog-submitted",
          status: "in_progress",
          submittedAt: "2026-07-01T12:00:00.000Z",
          submittedWithIncompleteSteps: true,
          incompleteStepKeys: ["professional_license"],
          steps: [],
        },
        pathname: "/application/success",
        search: "?tenant=zipstaff",
      })
    );
    expect(decision.status).toBe("allow");
  });

  it("redirects incomplete onboarding steps to application status after submit", () => {
    const decision = resolveApplicantOnboardingRoute(
      baseInput({
        progress: {
          progressId: "prog-submitted",
          status: "in_progress",
          submittedAt: "2026-07-01T12:00:00.000Z",
          submittedWithIncompleteSteps: true,
          incompleteStepKeys: ["professional_license"],
          steps: [],
        },
        pathname: APPLICATION_ROUTES.addResume,
        search: "?tenant=zipstaff",
      })
    );
    expect(decision.status).toBe("redirect");
    if (decision.status === "redirect") {
      expect(decision.href).toContain("application-status");
    }
  });

  it("keeps a submitted applicant on the first post-hire step", () => {
    const welcome: TenantOnboardingStep = {
      id: "welcome",
      step_key: "authorizations_2",
      title: "Welcome packet",
      description: null,
      step_type: "custom_question",
      sort_order: 10,
      is_required: true,
      is_enabled: true,
      metadata: {
        workflow_step_id: "welcome-packet-esign",
        workflow_settings: { phase: "post_hire", completionOwner: "applicant" },
      },
    };
    const config: TenantOnboardingConfig = {
      configId: "cfg-post",
      tenantId: "tenant-zippy",
      version: 1,
      steps: [welcome],
      requiredDocuments: [],
      skillAssessments: [],
      candidateEngineOrder: [
        {
          id: "recruiter-gate",
          step_key: "internal_review",
          sort_order: 1,
          required: true,
          candidateVisible: false,
        },
        {
          id: welcome.id,
          step_key: welcome.step_key,
          sort_order: 10,
          required: true,
          candidateVisible: true,
        },
      ],
    };
    const progress: WorkerOnboardingProgressPayload = {
      progressId: "prog-post",
      status: "in_progress",
      submittedAt: "2026-10-19T12:00:00.000Z",
      steps: [],
    };

    const decision = resolveApplicantOnboardingRoute(
      baseInput({
        config,
        progress,
        tenantSlug: "zippycorp",
        pathname: "/application/custom-step/authorizations_2",
        search: "?stepKey=authorizations_2&tenant=zippycorp&job_token=job-1",
      })
    );

    expect(decision.status).toBe("allow");
  });
});

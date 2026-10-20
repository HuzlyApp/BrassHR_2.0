import { describe, expect, it } from "vitest";
import {
  candidateProgressCounts,
  computeCandidateOnboardingFrontier,
  projectCandidateOnboardingConfig,
} from "@/lib/onboarding/candidate-onboarding-projection";
import { applyApplicantConfigFilters } from "@/lib/onboarding/filter-applicant-steps";
import { isWorkerVisibleStep } from "@/lib/onboarding/workflow-settings";
import { tenantConfigToPublishedWorkflow } from "@/lib/onboarding/applicant-workflow";
import type {
  TenantOnboardingConfig,
  TenantOnboardingStep,
  WorkerOnboardingProgressPayload,
} from "@/lib/onboarding/types";

function step(params: {
  id: string;
  title: string;
  libraryId: string;
  owner: string;
  phase?: "pre_hire" | "transition" | "post_hire";
  required?: boolean;
  sort: number;
}): TenantOnboardingStep {
  return {
    id: params.id,
    step_key: params.id,
    title: params.title,
    description: null,
    step_type: "custom_question",
    sort_order: params.sort,
    is_required: params.required ?? true,
    is_enabled: true,
    metadata: {
      workflow_step_id: params.libraryId,
      workflow_settings: {
        phase: params.phase ?? "pre_hire",
        completionOwner: params.owner,
        clientPerforms: true,
        notifyHrOnFail: true,
        notify: "HR + Recruiter",
        triggerAfter: "Offer Acceptance",
      },
    },
  };
}

const scenarioASteps: TenantOnboardingStep[] = [
  step({
    id: "personal",
    title: "Personal Information",
    libraryId: "resume-basic-profile",
    owner: "applicant",
    sort: 10,
  }),
  step({
    id: "hr-review",
    title: "HR Review",
    libraryId: "hr-final-approval",
    owner: "hr_admin",
    sort: 20,
  }),
  step({
    id: "manager",
    title: "Manager Approval",
    libraryId: "manager-facility-approval",
    owner: "manager_or_facility",
    sort: 30,
  }),
  step({
    id: "upload",
    title: "Upload Documents",
    libraryId: "document-upload",
    owner: "applicant",
    sort: 40,
  }),
  step({
    id: "verify",
    title: "HR Verification",
    libraryId: "reference-verification",
    owner: "recruiter_or_hr",
    sort: 50,
  }),
  step({
    id: "sign",
    title: "Sign Contract",
    libraryId: "employee-agreement",
    owner: "applicant",
    sort: 60,
  }),
];

function configFor(tenantId: string, steps: TenantOnboardingStep[]): TenantOnboardingConfig {
  return {
    configId: `cfg-${tenantId}`,
    tenantId,
    version: 1,
    steps,
    requiredDocuments: [],
    skillAssessments: [],
  };
}

function progressFor(
  rows: Array<{ id: string; status: "pending" | "in_progress" | "completed" | "skipped" }>
): WorkerOnboardingProgressPayload {
  return {
    progressId: "prog-1",
    status: "in_progress",
    steps: rows.map((row) => ({
      onboarding_step_id: row.id,
      step_key: row.id,
      status: row.status,
      completed_at: row.status === "completed" ? "2026-08-14T00:00:00Z" : null,
      data: {},
    })),
  };
}

describe("candidate onboarding projection", () => {
  it("Scenario A: candidates see only their own steps", () => {
    const projected = projectCandidateOnboardingConfig(configFor("tenant-a", scenarioASteps));
    expect(projected.steps.map((s) => s.title)).toEqual([
      "Personal Information",
      "Upload Documents",
      "Sign Contract",
    ]);
    expect(projected.steps.map((s) => s.title)).not.toEqual(
      expect.arrayContaining(["HR Review", "Manager Approval", "HR Verification"])
    );
    expect(projected.candidateEngineOrder?.map((entry) => entry.candidateVisible)).toEqual([
      true,
      false,
      false,
      true,
      false,
      true,
    ]);
  });

  it("Scenario B: waiting on HR locks later candidate steps without showing HR Review", () => {
    const projected = projectCandidateOnboardingConfig(configFor("tenant-a", scenarioASteps));
    const frontier = computeCandidateOnboardingFrontier({
      engineOrder: projected.candidateEngineOrder,
      candidateSteps: projected.steps,
      progress: progressFor([
        { id: "personal", status: "completed" },
        { id: "hr-review", status: "pending" },
        { id: "manager", status: "pending" },
        { id: "upload", status: "pending" },
        { id: "verify", status: "pending" },
        { id: "sign", status: "pending" },
      ]),
    });

    expect(projected.steps.map((s) => s.title)).not.toContain("HR Review");
    expect(frontier.waitingOnInternal).toBe(true);
    expect(frontier.maxAllowedStepIndex).toBe(1);
  });

  it("matches a re-keyed internal step by id, not by a key an unrelated step owns", () => {
    const resume = "59cf36af-485e-4357-bcfe-1bd106287ae6";
    const screening = "7d8fba7a-c491-4225-969c-85c7b1f20e3b";
    const skill = "e717f080-0058-4bd0-9f66-efc491c76a8a";
    const backgroundCheck = "db479d24-6104-4fa8-8fac-6bc82ecb7b4b";
    const row = (id: string, stepKey: string, status: "pending" | "completed") => ({
      onboarding_step_id: id,
      step_key: stepKey,
      status,
      completed_at: null,
      data: {},
    });

    const frontier = computeCandidateOnboardingFrontier({
      // Job workflows re-key steps: Recruiter Screening becomes `custom_question`, a key the
      // tenant's Background Check step owns in progress rows.
      engineOrder: [
        { id: resume, step_key: "resume_upload", sort_order: 10, required: true, candidateVisible: true },
        { id: screening, step_key: "custom_question", sort_order: 30, required: true, candidateVisible: false },
        { id: skill, step_key: "skill_assessment", sort_order: 40, required: true, candidateVisible: true },
      ],
      candidateSteps: [
        step({ id: resume, title: "Resume", libraryId: "resume-basic-profile", owner: "applicant", sort: 10 }),
        step({ id: skill, title: "Skill Assessment", libraryId: "skill-qualification-assessment", owner: "applicant", sort: 40 }),
      ],
      progress: {
        progressId: "prog-1",
        status: "in_progress",
        steps: [
          row(backgroundCheck, "custom_question", "pending"),
          row(resume, "resume_upload", "completed"),
          row(screening, "custom_question_6", "completed"),
          row(skill, "skill_assessment", "pending"),
        ],
      },
    });

    expect(frontier).toEqual({ maxAllowedStepIndex: 2, waitingOnInternal: false });
  });

  it("does not lock the first post-hire step behind an unfinished recruiter step", () => {
    const welcome = step({
      id: "welcome",
      title: "Welcome packet",
      libraryId: "welcome-packet-esign",
      owner: "applicant",
      phase: "post_hire",
      sort: 20,
    });
    const frontier = computeCandidateOnboardingFrontier({
      engineOrder: [
        {
          id: "recruiter-gate",
          step_key: "internal_review",
          sort_order: 10,
          required: true,
          candidateVisible: false,
        },
        {
          id: welcome.id,
          step_key: welcome.step_key,
          sort_order: 20,
          required: true,
          candidateVisible: true,
        },
      ],
      candidateSteps: [welcome],
      progress: progressFor([{ id: "recruiter-gate", status: "pending" }]),
    });

    expect(frontier.waitingOnInternal).toBe(false);
    expect(frontier.maxAllowedStepIndex).toBe(1);
  });

  it("Scenario C: candidate progress is 2/3, not 2/6", () => {
    const projected = projectCandidateOnboardingConfig(configFor("tenant-a", scenarioASteps));
    const counts = candidateProgressCounts(
      projected.steps,
      progressFor([
        { id: "personal", status: "completed" },
        { id: "hr-review", status: "completed" },
        { id: "manager", status: "completed" },
        { id: "upload", status: "completed" },
        { id: "verify", status: "pending" },
        { id: "sign", status: "pending" },
      ])
    );
    expect(counts).toEqual({ completed: 2, total: 3 });
  });

  it("Scenario D: projection keeps tenant isolation", () => {
    const tenantA = applyApplicantConfigFilters(configFor("tenant-a", scenarioASteps));
    const tenantB = applyApplicantConfigFilters(
      configFor("tenant-b", [
        step({
          id: "b-resume",
          title: "Tenant B Resume",
          libraryId: "resume-basic-profile",
          owner: "applicant",
          sort: 10,
        }),
      ])
    );
    expect(tenantA.tenantId).toBe("tenant-a");
    expect(tenantB.tenantId).toBe("tenant-b");
    expect(tenantA.steps.some((s) => s.title === "Tenant B Resume")).toBe(false);
    expect(tenantB.steps.map((s) => s.title)).toEqual(["Tenant B Resume"]);
  });

  it("Scenario E: engine order still includes internal steps for HR dashboards", () => {
    const engine = configFor("tenant-a", scenarioASteps);
    expect(engine.steps.filter((s) => s.is_enabled).map((s) => s.title)).toEqual([
      "Personal Information",
      "HR Review",
      "Manager Approval",
      "Upload Documents",
      "HR Verification",
      "Sign Contract",
    ]);
    expect(isWorkerVisibleStep(engine.steps[1]!)).toBe(false);
  });

  it("Scenario F: candidate payload strips internal settings and omits internal steps", () => {
    const projected = projectCandidateOnboardingConfig(configFor("tenant-a", scenarioASteps));
    const workflow = tenantConfigToPublishedWorkflow(projected, "tenant-a");
    expect(workflow.steps.map((s) => s.title)).toEqual([
      "Personal Information",
      "Upload Documents",
      "Sign Contract",
    ]);
    for (const visible of projected.steps) {
      const settings = visible.metadata.workflow_settings as Record<string, unknown>;
      expect(settings.notifyHrOnFail).toBeUndefined();
      expect(settings.notify).toBeUndefined();
      expect(settings.triggerAfter).toBeUndefined();
    }
  });

  it("hides completion-milestone even when owner defaulted to applicant", () => {
    const finalReview = step({
      id: "final",
      title: "Final Review / Completion",
      libraryId: "completion-milestone",
      owner: "applicant",
      sort: 70,
    });
    expect(isWorkerVisibleStep(finalReview)).toBe(false);
  });
});

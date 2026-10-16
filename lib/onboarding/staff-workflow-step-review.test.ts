import { describe, expect, it } from "vitest";
import { projectCandidateOnboardingConfig } from "@/lib/onboarding/candidate-onboarding-projection";
import { pickStepProgressRows } from "@/lib/onboarding/scoped-step-progress";
import {
  allowedStaffActions,
  completionOwnerLabel,
  readStaffStepReview,
  staffActionLabel,
  staffActionResultMessage,
  staffActionTargetStatus,
} from "@/lib/onboarding/staff-step-review-shared";
import {
  agreementStepCompletedByStaff,
  canReviewUnlinkedRecord,
  findCandidateGateStep,
  resolveStaffStepEligibility,
  resolveUnlockedApplicantStep,
  type StaffStepContext,
} from "@/lib/onboarding/staff-workflow-step-review";
import type {
  OnboardingStepStatus,
  OnboardingStepType,
  TenantOnboardingConfig,
  TenantOnboardingStep,
  WorkerOnboardingProgressPayload,
} from "@/lib/onboarding/types";

function step(params: {
  id: string;
  title: string;
  libraryId: string;
  owner: string;
  stepType: OnboardingStepType;
  sort: number;
  required?: boolean;
}): TenantOnboardingStep {
  return {
    id: params.id,
    step_key: params.id,
    title: params.title,
    description: null,
    step_type: params.stepType,
    sort_order: params.sort,
    is_required: params.required ?? true,
    is_enabled: true,
    metadata: {
      workflow_step_id: params.libraryId,
      workflow_settings: { phase: "pre_hire", completionOwner: params.owner, clientPerforms: true },
    },
  };
}

const resume = step({
  id: "resume",
  title: "Upload Resume",
  libraryId: "resume-basic-profile",
  owner: "applicant",
  stepType: "resume_upload",
  sort: 10,
});
const references = step({
  id: "references",
  title: "Collect References",
  libraryId: "references-collection",
  owner: "applicant",
  stepType: "references",
  sort: 20,
});
const screening = step({
  id: "screening",
  title: "Recruiter Screening",
  libraryId: "recruiter-screening",
  owner: "recruiter_or_hr",
  stepType: "custom_question",
  sort: 30,
});
const skills = step({
  id: "skills",
  title: "Skill Assessment",
  libraryId: "skill-qualification-assessment",
  owner: "applicant",
  stepType: "skill_assessment",
  sort: 40,
});

function config(steps: TenantOnboardingStep[]): TenantOnboardingConfig {
  return projectCandidateOnboardingConfig({
    configId: "cfg-1",
    tenantId: "tenant-1",
    version: 1,
    steps,
    requiredDocuments: [],
    skillAssessments: [],
  });
}

function progress(rows: Record<string, OnboardingStepStatus>): WorkerOnboardingProgressPayload {
  return {
    progressId: "prog-1",
    status: "in_progress",
    steps: Object.entries(rows).map(([id, status]) => ({
      onboarding_step_id: id,
      step_key: id,
      status,
      completed_at: status === "completed" ? "2026-09-29T00:00:00Z" : null,
      data: {},
    })),
  };
}

describe("staff workflow step review rules", () => {
  it("labels completion owners for the drawer", () => {
    expect(completionOwnerLabel("recruiter_or_hr")).toBe("Recruiter / HR");
    expect(completionOwnerLabel("hr_admin")).toBe("HR Admin");
    expect(completionOwnerLabel("manager_or_facility")).toBe("Manager / Facility");
    expect(completionOwnerLabel("")).toBe("Internal team");
  });

  it("only offers transitions that change the status", () => {
    expect(allowedStaffActions("pending")).toEqual(["complete", "reject"]);
    expect(allowedStaffActions("in_progress")).toEqual(["complete", "reject"]);
    expect(allowedStaffActions("failed")).toEqual(["complete", "reopen"]);
    expect(allowedStaffActions("completed")).toEqual(["reopen"]);
    expect(staffActionTargetStatus("complete")).toBe("completed");
    expect(staffActionTargetStatus("reject")).toBe("failed");
    expect(staffActionTargetStatus("reopen")).toBe("pending");
  });

  it("allows staff actions only on internal steps linked to a tenant step", () => {
    expect(resolveStaffStepEligibility(screening, "pending")).toEqual({
      allowed: true,
      ownerLabel: "Recruiter / HR",
      actions: ["complete", "reject"],
      variant: "default",
      reason: null,
    });
    expect(resolveStaffStepEligibility(references, "pending").allowed).toBe(false);
    expect(resolveStaffStepEligibility(null, "pending").allowed).toBe(false);
  });

  it("offers Verified / Need to Review / Reject on reference verification, minus the current decision", () => {
    const verification = step({
      id: "ref-verify",
      title: "Reference Verification",
      libraryId: "reference-verification",
      owner: "recruiter_or_hr",
      stepType: "references",
      sort: 35,
    });
    expect(resolveStaffStepEligibility(verification, "pending")).toMatchObject({
      allowed: true,
      variant: "verification",
      actions: ["complete", "needs_review", "reject"],
    });
    expect(allowedStaffActions("completed", "verification")).toEqual(["needs_review", "reject"]);
    expect(allowedStaffActions("in_progress", "verification")).toEqual(["complete", "reject"]);
    expect(allowedStaffActions("failed", "verification")).toEqual(["complete", "needs_review"]);
    expect(staffActionTargetStatus("needs_review")).toBe("in_progress");
  });

  it("lets staff decide Internal Select even when no published tenant step backs it", () => {
    const record = { stepType: "internal-select", settings: { completionOwner: "recruiter_or_hr" } };
    expect(resolveStaffStepEligibility(null, "pending", record)).toEqual({
      allowed: true,
      ownerLabel: "Recruiter / HR",
      actions: ["complete", "needs_review", "reject"],
      variant: "selection",
      reason: null,
    });
    expect(resolveStaffStepEligibility(null, "completed", record).actions).toEqual(["needs_review", "reject"]);
    expect(staffActionLabel("complete", "selection")).toBe("Mark as Qualified");
    expect(staffActionLabel("needs_review", "selection")).toBe("On Hold");
    expect(staffActionLabel("reject", "selection")).toBe("Not Selected");
    expect(staffActionLabel("reject", "verification")).toBe("Reject");
  });

  it("lets staff complete an unlinked Parameterized Job Application even when the owner defaulted to applicant", () => {
    const record = { stepType: "parameterized-job-application", settings: { completionOwner: "applicant" } };
    expect(canReviewUnlinkedRecord(record)).toBe(true);
    expect(resolveStaffStepEligibility(null, "pending", record)).toEqual({
      allowed: true,
      ownerLabel: "Recruiter / HR",
      actions: ["complete", "reject"],
      variant: "default",
      reason: null,
    });
  });

  it("finds the internal step the candidate portal gates on by workflow node id", () => {
    const gate = { ...step({ id: "gate", title: "Parameterized Job Application", libraryId: "parameterized-job-application", owner: "applicant", stepType: "profile_information", sort: 20 }) };
    gate.metadata = { ...gate.metadata, workflow_node_id: "w2-02" };
    const visible = { ...references, metadata: { ...references.metadata, workflow_node_id: "w2-03" } };
    const preview = { ...gate, id: "preview-profile_information", metadata: { ...gate.metadata, workflow_node_id: "w2-09" } };
    const engine = { configId: "c", tenantId: "t", version: 1, steps: [resume, gate, visible, preview], requiredDocuments: [], skillAssessments: [] };
    expect(findCandidateGateStep(engine, "w2-02")?.id).toBe("gate");
    expect(findCandidateGateStep(engine, "w2-03")).toBeNull();
    expect(findCandidateGateStep(engine, "w2-09")).toBeNull();
    expect(findCandidateGateStep(engine, null)).toBeNull();
  });

  it("still refuses unlinked candidate-owned steps", () => {
    expect(
      resolveStaffStepEligibility(null, "pending", { stepType: "document-upload", settings: { completionOwner: "applicant" } })
        .allowed
    ).toBe(false);
  });

  it("never blocks the candidate on reference verification, even when rejected", () => {
    const verification = step({
      id: "ref-verify",
      title: "Reference Verification",
      libraryId: "reference-verification",
      owner: "recruiter_or_hr",
      stepType: "references",
      sort: 45,
    });
    const extraUpload = step({
      id: "upload",
      title: "Upload License",
      libraryId: "document-upload",
      owner: "applicant",
      stepType: "document_upload",
      sort: 50,
    });
    const next = resolveUnlockedApplicantStep({
      config: config([resume, references, screening, skills, verification, extraUpload]),
      progress: progress({
        resume: "completed",
        references: "completed",
        screening: "completed",
        skills: "completed",
        "ref-verify": "failed",
        upload: "pending",
      }),
      completedStepId: "skills",
    });
    expect(next.reason).toBeNull();
    expect(next.step?.id).toBe("upload");
  });

  it("reads the stored staff review and ignores malformed data", () => {
    expect(
      readStaffStepReview({
        staff_review: {
          decision: "complete",
          note: "Phone screen passed",
          reviewed_by_user_id: "user-1",
          reviewed_by_name: "Jane Recruiter",
          reviewed_at: "2026-09-29T10:00:00Z",
        },
      })
    ).toEqual({
      decision: "complete",
      note: "Phone screen passed",
      reviewedByUserId: "user-1",
      reviewedByName: "Jane Recruiter",
      reviewedAt: "2026-09-29T10:00:00Z",
    });
    expect(readStaffStepReview({ staff_review: { decision: "approve" } })).toBeNull();
    expect(readStaffStepReview(null)).toBeNull();
  });

  it("emails the candidate's newly unlocked step after Recruiter Screening is completed", () => {
    const cfg = config([resume, references, screening, skills]);
    expect(cfg.steps.map((s) => s.id)).toEqual(["resume", "references", "skills"]);

    const unlocked = resolveUnlockedApplicantStep({
      config: cfg,
      progress: progress({ resume: "completed", references: "completed", screening: "completed", skills: "pending" }),
      completedStepId: "screening",
    });
    expect(unlocked.step?.id).toBe("skills");
    expect(unlocked.reason).toBeNull();
  });

  it("does not email when the candidate is still working on an earlier step", () => {
    const next = resolveUnlockedApplicantStep({
      config: config([resume, references, screening, skills]),
      progress: progress({ resume: "completed", references: "pending", screening: "completed", skills: "pending" }),
      completedStepId: "screening",
    });
    expect(next).toEqual({ step: null, reason: "NO_NEW_CANDIDATE_STEP" });
  });

  it("does not email when the next step is not something the candidate fills in", () => {
    const next = resolveUnlockedApplicantStep({
      config: config([resume, references, screening]),
      progress: progress({ resume: "completed", references: "completed", screening: "completed" }),
      completedStepId: "screening",
    });
    expect(next).toEqual({ step: null, reason: "NO_NEW_CANDIDATE_STEP" });
  });

  it("does not email when a second internal step still blocks the candidate", () => {
    const verification = step({
      id: "verification",
      title: "OIG / Exclusion Check",
      libraryId: "oig-exclusion-check",
      owner: "recruiter_or_hr",
      stepType: "custom_question",
      sort: 35,
    });
    const next = resolveUnlockedApplicantStep({
      config: config([resume, references, screening, verification, skills]),
      progress: progress({
        resume: "completed",
        references: "completed",
        screening: "completed",
        verification: "pending",
        skills: "pending",
      }),
      completedStepId: "screening",
    });
    expect(next).toEqual({ step: null, reason: "WAITING_ON_INTERNAL_STEP" });
  });

  it("explains the email outcome after completing a step", () => {
    expect(staffActionResultMessage("complete", { sent: true, skipped: false, nextStepTitle: "Skill Assessment" }).message).toContain(
      '"Skill Assessment"'
    );
    expect(
      staffActionResultMessage("complete", { sent: true, skipped: false, nextStepTitle: "Candidate Form" }, "selection").message
    ).toContain('"Candidate Form"');
    expect(
      staffActionResultMessage("complete", { sent: false, skipped: true, reason: "WAITING_ON_INTERNAL_STEP" }).message
    ).toContain("another internal step");
    expect(
      staffActionResultMessage("complete", { sent: false, skipped: true, reason: "NO_NEW_CANDIDATE_STEP" }).message
    ).toContain("didn't unlock a new step");
    expect(
      staffActionResultMessage("complete", { sent: false, skipped: true, reason: "RESEND_NOT_CONFIGURED" }).tone
    ).toBe("warning");
    expect(staffActionResultMessage("reject", null).message).toContain("rejected");
  });
});

describe("agreementStepCompletedByStaff", () => {
  function context(partial: {
    phase: StaffStepContext["phase"];
    title: string;
    stepType: string;
    snapshotStepId?: string;
  }): StaffStepContext {
    return {
      ok: true,
      record: {},
      instance: {},
      phase: partial.phase,
      applicationId: "app-1",
      tenantStep: null,
      config: null,
      mapped: {
        id: "record-1",
        snapshotStepId: partial.snapshotStepId ?? partial.stepType,
        tenantStepId: null,
        title: partial.title,
        stepKey: partial.stepType,
        stepType: partial.stepType,
        onboardingType: "authorizations",
        phase: partial.phase,
        required: true,
        status: "completed",
        displayStatus: "completed",
        inspectable: true,
        unmatched: false,
        assignedAt: null,
        completedAt: null,
        candidateOwned: true,
      },
    };
  }

  it("treats a recruiter-completed Authorization eSign as the conversion step", () => {
    const step = agreementStepCompletedByStaff(
      context({
        phase: "pre_hire",
        title: "Authorization e-sign",
        stepType: "employee-agreement",
      })
    );
    expect(step?.title).toBe("Authorization e-sign");
    expect(step?.metadata.workflow_step_id).toBe("employee-agreement");
  });

  it("does not convert when a post-hire e-sign step is completed", () => {
    expect(
      agreementStepCompletedByStaff(
        context({
          phase: "post_hire",
          title: "Welcome Packet & eSign",
          stepType: "welcome-packet-esign",
        })
      )
    ).toBeNull();
  });
});

describe("scoped step progress", () => {
  it("prefers the application's progress rows over other applications", () => {
    const rows = [
      { onboarding_step_id: "screening", status: "completed", updated_at: "2026-09-29T10:00:00Z", worker_onboarding_progress_id: "app-a" },
      { onboarding_step_id: "screening", status: "pending", updated_at: "2026-09-30T10:00:00Z", worker_onboarding_progress_id: "app-b" },
      { onboarding_step_id: "resume", status: "completed", updated_at: "2026-09-01T10:00:00Z", worker_onboarding_progress_id: "app-b" },
    ];
    const scoped = pickStepProgressRows(rows, new Set(["app-a"]));
    expect(scoped.get("screening")?.status).toBe("completed");
    expect(scoped.get("resume")?.status).toBe("completed");

    const unscoped = pickStepProgressRows(rows, new Set());
    expect(unscoped.get("screening")?.status).toBe("pending");
  });
});

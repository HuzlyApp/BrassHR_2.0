import { describe, expect, it } from "vitest";
import {
  candidateReviewDisplayStatus,
  candidateStepVerifiedAt,
  stepDecision,
  stepDisplayStatusLabel,
  stepStatusPill,
  assignmentSourceLabel,
  buildPhaseAssignment,
  enrichAssignedStepsDisplayFromEvidence,
  hasRequiredIdentityDocuments,
  mapAssignedStepRecords,
  mapProgressToDisplayStatus,
  matchTenantStepForAssignedRecord,
  resolveAssignedStepStatus,
  resolveAssignmentSource,
  sanitizeTagsForClient,
} from "@/lib/onboarding/assigned-workflow-steps";
import { readRecordStaffReview } from "@/lib/onboarding/staff-step-review-shared";
import { computeStaffStepStatusOverrides } from "@/lib/onboarding/staff-step-record-sync";
import type { TenantOnboardingStep } from "@/lib/onboarding/types";

function tenantStep(
  partial: Partial<TenantOnboardingStep> & Pick<TenantOnboardingStep, "id" | "step_key" | "title" | "step_type">
): TenantOnboardingStep {
  return {
    description: null,
    sort_order: 10,
    is_required: true,
    is_enabled: true,
    metadata: {},
    ...partial,
  };
}

describe("stepDisplayStatusLabel", () => {
  it("labels reference verification by staff decision and never shows Not Started", () => {
    const stepType = "reference-verification";
    expect(stepDisplayStatusLabel({ stepType, displayStatus: "not_started" })).toBe("Need to Verify");
    expect(stepDisplayStatusLabel({ stepType, displayStatus: "in_progress" })).toBe("Need to Review");
    expect(stepDisplayStatusLabel({ stepType, displayStatus: "completed" })).toBe("Verified");
    expect(stepDisplayStatusLabel({ stepType, displayStatus: "blocked" })).toBe("Rejected");
  });

  it("reports the staff decision so the Hire Journey row can show a status pill", () => {
    const stepType = "reference-verification";
    expect(stepDecision({ stepType, displayStatus: "not_started" })).toBeNull();
    expect(stepDecision({ stepType, displayStatus: "completed" })).toEqual({ action: "complete", label: "Verified" });
    expect(stepDecision({ stepType, displayStatus: "in_progress" })).toEqual({
      action: "needs_review",
      label: "Need to Review",
    });
    expect(stepDecision({ stepType, displayStatus: "blocked" })).toEqual({ action: "reject", label: "Rejected" });
    expect(stepDecision({ stepType: "screening", displayStatus: "completed" })).toBeNull();
  });

  it("labels Internal Select as Qualified / On Hold / Not Selected and Pending Decision while undecided", () => {
    const stepType = "internal-select";
    expect(stepDisplayStatusLabel({ stepType, displayStatus: "not_started" })).toBe("Pending Decision");
    expect(stepDecision({ stepType, displayStatus: "completed" })?.label).toBe("Qualified");
    expect(stepDecision({ stepType, displayStatus: "in_progress" })?.label).toBe("On Hold");
    expect(stepDecision({ stepType, displayStatus: "blocked" })?.label).toBe("Not Selected");
  });

  it("always maps Internal Select and Reference Verification as optional", () => {
    const records = ["internal-select", "reference-verification", "interview-qualification"].map((type, index) => ({
      id: `rec-${index}`,
      snapshot_step_id: `node-${index}`,
      title: type,
      step_type: type,
      is_required: true,
      position: index,
    }));
    const mapped = mapAssignedStepRecords({ records, tenantSteps: [], progressByStepId: new Map(), assignedAt: null });
    expect(mapped.map((step) => step.required)).toEqual([false, false, true]);
  });

  it("keeps generic labels for other steps, including candidate reference collection", () => {
    expect(stepDisplayStatusLabel({ stepType: "references-collection", displayStatus: "not_started" })).toBe(
      "Not Started"
    );
    expect(stepDisplayStatusLabel({ stepType: "screening", displayStatus: "completed" })).toBe("Completed");
  });
});

describe("staff-owned step status", () => {
  const screeningRecord = {
    id: "rec-screening",
    snapshot_step_id: "node-screening",
    title: "Recruiter Screening",
    step_type: "recruiter-screening",
    is_required: true,
    position: 1,
    status: "completed",
    completed_at: "2026-10-01T07:11:30.000Z",
    settings: { completionOwner: "recruiter_or_hr" },
    status_changed_at: "2026-10-01T07:11:30.000Z",
    review_decision: "complete",
  };

  it("keeps the recruiter decision when a re-published tenant step brings a fresh pending progress row", () => {
    const republished = tenantStep({
      id: "tenant-new",
      step_key: "recruiter_screening",
      title: "Recruiter Screening",
      step_type: "screening",
      metadata: { workflow_step_id: "recruiter-screening" },
    });
    const [step] = mapAssignedStepRecords({
      records: [screeningRecord],
      tenantSteps: [republished],
      progressByStepId: new Map([
        ["tenant-new", { status: "pending", updated_at: "2026-10-01T09:37:38.000Z" }],
      ]),
    });
    expect(step.tenantStepId).toBe("tenant-new");
    expect(step.status).toBe("completed");
    expect(step.completedAt).toBe("2026-10-01T07:11:30.000Z");
  });

  it("lets a newer non-pending progress row win over an older staff decision", () => {
    expect(
      resolveAssignedStepStatus(screeningRecord, {
        status: "failed",
        updated_at: "2026-10-02T00:00:00.000Z",
      }).status
    ).toBe("failed");
    expect(
      resolveAssignedStepStatus(screeningRecord, {
        status: "failed",
        updated_at: "2026-09-30T00:00:00.000Z",
      }).status
    ).toBe("completed");
  });

  it("keeps candidate steps on the progress row", () => {
    const candidateRecord = {
      ...screeningRecord,
      step_type: "personal-information",
      settings: { completionOwner: "applicant" },
    };
    expect(resolveAssignedStepStatus(candidateRecord, { status: "pending" }).status).toBe("pending");
  });

  it("reads the staff review from record columns", () => {
    expect(
      readRecordStaffReview({
        review_decision: "reject",
        review_note: "Not found",
        status_changed_at: "2026-10-01T07:47:39.684Z",
        status_changed_by: "user-1",
        status_changed_by_name: "Test User",
      })
    ).toEqual({
      decision: "reject",
      note: "Not found",
      reviewedAt: "2026-10-01T07:47:39.684Z",
      reviewedByUserId: "user-1",
      reviewedByName: "Test User",
    });
    expect(readRecordStaffReview({ review_decision: null, status_changed_at: null })).toBeNull();
  });

  it("produces progress overrides only for decided staff steps that disagree with progress", () => {
    const republished = tenantStep({
      id: "tenant-new",
      step_key: "recruiter_screening",
      title: "Recruiter Screening",
      step_type: "screening",
      metadata: { workflow_step_id: "recruiter-screening" },
    });
    const candidate = tenantStep({
      id: "tenant-info",
      step_key: "personal_information",
      title: "Personal Information",
      step_type: "personal_info",
      metadata: { workflow_step_id: "personal-information" },
    });
    const overrides = computeStaffStepStatusOverrides({
      records: [
        screeningRecord,
        {
          id: "rec-info",
          snapshot_step_id: "node-info",
          title: "Personal Information",
          step_type: "personal-information",
          is_required: true,
          position: 2,
          status: "completed",
          settings: { completionOwner: "applicant" },
        },
      ],
      tenantSteps: [republished, candidate],
      progressByStepId: new Map([
        ["tenant-new", { status: "pending" }],
        ["tenant-info", { status: "pending" }],
      ]),
    });
    expect(overrides).toEqual([
      { tenantStepId: "tenant-new", status: "completed", completedAt: "2026-10-01T07:11:30.000Z" },
    ]);
  });
});

describe("assigned workflow steps", () => {
  it("maps snapshot step-{key} onto the assigned tenant step, not by title", () => {
    const resume = tenantStep({
      id: "tenant-resume",
      step_key: "resume_upload",
      title: "Upload Resume",
      step_type: "resume_upload",
    });
    const other = tenantStep({
      id: "tenant-other",
      step_key: "professional_license",
      title: "Upload Resume",
      step_type: "professional_license",
    });
    const matched = matchTenantStepForAssignedRecord(
      {
        id: "rec-1",
        snapshot_step_id: "step-resume_upload",
        title: "Upload Resume",
        step_type: "resume-basic-profile",
        is_required: true,
        position: 1,
        phase: "pre_hire",
        settings: {},
      },
      [other, resume],
      new Set()
    );
    expect(matched?.id).toBe("tenant-resume");
  });

  it("does not guess a tenant step from a colliding title", () => {
    const first = tenantStep({
      id: "a",
      step_key: "custom_a",
      title: "Background Check",
      step_type: "custom_question",
      metadata: { workflow_step_id: "custom-step" },
    });
    const second = tenantStep({
      id: "b",
      step_key: "custom_b",
      title: "Background Check",
      step_type: "custom_question",
      metadata: { workflow_step_id: "custom-step" },
    });
    const matched = matchTenantStepForAssignedRecord(
      {
        id: "rec-2",
        snapshot_step_id: "w2-07",
        title: "Background Check",
        step_type: "background-check",
        is_required: true,
        position: 7,
        phase: "pre_hire",
        settings: {},
      },
      [first, second],
      new Set()
    );
    expect(matched).toBeNull();
  });

  it("links a record to a disabled tenant step by workflow node id and reads its progress", () => {
    const skill = tenantStep({
      id: "tenant-skill",
      step_key: "skill_assessment",
      title: "Skill / Qualification Assessment",
      step_type: "skill_assessment",
      is_enabled: false,
      metadata: { workflow_node_id: "w2-figma-07", workflow_step_id: "skill-qualification-assessment" },
    });
    const [mapped] = mapAssignedStepRecords({
      records: [
        {
          id: "rec-skill",
          snapshot_step_id: "w2-figma-07",
          title: "Skill / Qualification Assessment",
          step_type: "skill-qualification-assessment",
          is_required: true,
          position: 4,
          phase: "pre_hire",
          status: "pending",
          settings: {},
        },
      ],
      tenantSteps: [skill],
      progressByStepId: new Map([
        ["tenant-skill", { onboarding_step_id: "tenant-skill", status: "in_progress", data: {} }],
      ]),
    });
    expect(mapped?.tenantStepId).toBe("tenant-skill");
    expect(mapped?.status).toBe("in_progress");
    expect(mapped?.displayStatus).toBe("in_progress");
  });

  it("does not fall back to a disabled tenant step by library id", () => {
    const disabled = tenantStep({
      id: "tenant-old-bg",
      step_key: "custom_question_7",
      title: "Background Check",
      step_type: "custom_question",
      is_enabled: false,
      metadata: { workflow_step_id: "background-check" },
    });
    const matched = matchTenantStepForAssignedRecord(
      {
        id: "rec-bg",
        snapshot_step_id: "other-flow-13",
        title: "Background Check",
        step_type: "background-check",
        is_required: true,
        position: 10,
        phase: "pre_hire",
        settings: {},
      },
      [disabled],
      new Set()
    );
    expect(matched).toBeNull();
  });

  it("links a record to the disabled library step the candidate worked on, not another upload step", () => {
    const ssnWithProgress = tenantStep({
      id: "tenant-ssn",
      step_key: "document_upload",
      title: "SSN / Identity Verification",
      step_type: "document_upload",
      is_enabled: false,
      sort_order: 40,
      metadata: { workflow_node_id: "node-a", workflow_step_id: "ssn-identity-verification" },
    });
    const otherSsn = tenantStep({
      id: "tenant-ssn-other",
      step_key: "custom_question_31",
      title: "SSN & Driver's License",
      step_type: "document_upload",
      is_enabled: false,
      sort_order: 10,
      metadata: { workflow_node_id: "node-b", workflow_step_id: "ssn-identity-verification" },
    });
    const documents = tenantStep({
      id: "tenant-docs",
      step_key: "document_upload_2",
      title: "Required Candidate Documentation",
      step_type: "document_upload",
      metadata: { workflow_step_id: "document-upload" },
    });
    const [mapped] = mapAssignedStepRecords({
      records: [
        {
          id: "rec-ssn",
          snapshot_step_id: "w2-figma-17",
          title: "SSN / Identity Verification",
          step_type: "ssn-identity-verification",
          is_required: true,
          position: 7,
          phase: "pre_hire",
          status: "completed",
          settings: {},
        },
      ],
      tenantSteps: [otherSsn, documents, ssnWithProgress],
      progressByStepId: new Map([
        ["tenant-ssn", { onboarding_step_id: "tenant-ssn", status: "completed", data: {} }],
        ["tenant-docs", { onboarding_step_id: "tenant-docs", status: "pending", data: {} }],
      ]),
    });
    expect(mapped?.tenantStepId).toBe("tenant-ssn");
    expect(mapped?.status).toBe("completed");
  });

  it("uses workflow instance progress, not a similarly named document", () => {
    const resume = tenantStep({
      id: "tenant-resume",
      step_key: "resume_upload",
      title: "Upload Resume",
      step_type: "resume_upload",
    });
    const mapped = mapAssignedStepRecords({
      records: [
        {
          id: "rec-1",
          snapshot_step_id: "step-resume_upload",
          title: "Upload Resume",
          step_type: "resume-basic-profile",
          is_required: true,
          position: 1,
          phase: "pre_hire",
          status: "pending",
          settings: { stageName: "Intake", phase: "pre_hire" },
        },
      ],
      tenantSteps: [resume],
      progressByStepId: new Map([["tenant-resume", { onboarding_step_id: "tenant-resume", status: "completed" }]]),
    });
    expect(mapped[0]?.status).toBe("completed");
    expect(mapped[0]?.displayStatus).toBe("submitted");
    expect(mapped[0]?.tenantStepId).toBe("tenant-resume");
    expect(mapped[0]?.settings).toEqual({ stageName: "Intake", phase: "pre_hire" });
  });

  it("prefers job mapping over manual when the workflow id is mapped", () => {
    expect(resolveAssignmentSource({ workflowId: "flow-1", mappedWorkflowIds: ["flow-1"] })).toBe(
      "job_mapping"
    );
    expect(resolveAssignmentSource({ workflowId: "flow-2", mappedWorkflowIds: ["flow-1"] })).toBe("manual");
    expect(assignmentSourceLabel("job_mapping")).toBe("Job mapping");
  });

  it("strips Post-Hire tags before conversion", () => {
    const tags = sanitizeTagsForClient(
      [
        { id: "1", phase: "pre_hire" as const },
        { id: "2", phase: "both" as const },
        { id: "3", phase: "post_hire" as const },
      ],
      false
    );
    expect(tags.map((tag) => tag.phase)).toEqual(["pre_hire", "pre_hire"]);
  });

  it("builds assignment metadata from the assigned instance", () => {
    const assignment = buildPhaseAssignment({
      workflowName: "CNA Pre-Hire",
      version: "2026-08-01T00:00:00.000Z",
      assignedAt: "2026-08-02T00:00:00.000Z",
      assignmentSource: "job_mapping",
      phase: "pre_hire",
      steps: [
        { title: "Upload Resume", status: "completed" },
        { title: "Skill Assessment", status: "in_progress" },
      ],
    });
    expect(assignment.currentStepTitle).toBe("Skill Assessment");
    expect(assignment.completedCount).toBe(1);
    expect(assignment.totalCount).toBe(2);
  });

  it("maps document review onto display status without inventing completion", () => {
    expect(mapProgressToDisplayStatus("pending")).toBe("not_started");
    expect(mapProgressToDisplayStatus("pending", "uploaded")).toBe("submitted");
    expect(mapProgressToDisplayStatus("completed", "rejected")).toBe("rejected");
    expect(mapProgressToDisplayStatus("completed", "approved")).toBe("approved");
  });

  it("enriches resume steps to Submitted when a resume file exists but progress is pending", () => {
    const mapped = mapAssignedStepRecords({
      records: [
        {
          id: "rec-1",
          snapshot_step_id: "step-resume-basic-profile",
          title: "Resume & Basic Profile",
          step_type: "resume-basic-profile",
          is_required: true,
          position: 1,
          phase: "pre_hire",
          status: "pending",
          settings: {},
        },
      ],
      tenantSteps: [
        tenantStep({
          id: "tenant-resume",
          step_key: "resume_upload",
          title: "Resume & Basic Profile",
          step_type: "resume_upload",
        }),
      ],
      progressByStepId: new Map([
        ["tenant-resume", { onboarding_step_id: "tenant-resume", status: "pending" }],
      ]),
    });
    expect(mapped[0]?.displayStatus).toBe("not_started");

    const enriched = enrichAssignedStepsDisplayFromEvidence({
      steps: mapped,
      hasResumeUpload: true,
    });
    expect(enriched[0]?.displayStatus).toBe("submitted");
  });

  function mapIdentityStep(
    progressStatus: string,
    review: { review_decision?: string; status_changed_at?: string } = {}
  ) {
    return mapAssignedStepRecords({
      records: [
        {
          id: "rec-ssn",
          snapshot_step_id: "step-ssn",
          title: "SSN / Identity Verification",
          step_type: "ssn-identity-verification",
          is_required: true,
          position: 11,
          phase: "pre_hire",
          status: "pending",
          settings: {},
          ...review,
        },
      ],
      tenantSteps: [
        tenantStep({
          id: "tenant-ssn",
          step_key: "document_upload",
          title: "SSN / Identity Verification",
          step_type: "document_upload",
        }),
      ],
      progressByStepId: new Map([
        ["tenant-ssn", { onboarding_step_id: "tenant-ssn", status: progressStatus }],
      ]),
    });
  }

  it("enriches the SSN step to Submitted when identity documents were collected by an earlier step", () => {
    const mapped = mapIdentityStep("pending");
    expect(mapped[0]?.displayStatus).toBe("not_started");
    expect(
      enrichAssignedStepsDisplayFromEvidence({ steps: mapped, hasIdentityDocuments: true })[0]
        ?.displayStatus
    ).toBe("submitted");
    expect(
      enrichAssignedStepsDisplayFromEvidence({ steps: mapped, hasIdentityDocuments: false })[0]
        ?.displayStatus
    ).toBe("not_started");
  });

  it("never downgrades a verified SSN step to Submitted", () => {
    const mapped = mapIdentityStep("completed", {
      review_decision: "complete",
      status_changed_at: "2026-10-02T00:00:00.000Z",
    });
    expect(
      enrichAssignedStepsDisplayFromEvidence({ steps: mapped, hasIdentityDocuments: true })[0]
        ?.displayStatus
    ).toBe("completed");
  });

  it("keeps a candidate-completed SSN step at Submitted until a recruiter verifies it", () => {
    const mapped = mapIdentityStep("completed");
    expect(
      enrichAssignedStepsDisplayFromEvidence({ steps: mapped, hasIdentityDocuments: true })[0]
        ?.displayStatus
    ).toBe("submitted");
  });

  describe("candidate step verification", () => {
    const infoStep = tenantStep({
      id: "tenant-info",
      step_key: "personal_information",
      title: "Personal Information",
      step_type: "profile_information",
      metadata: { workflow_step_id: "personal-information" },
    });
    const infoRecord = {
      id: "rec-info",
      snapshot_step_id: "step-personal_information",
      title: "Personal Information",
      step_type: "personal-information",
      is_required: true,
      position: 2,
      phase: "post_hire",
      status: "completed",
      settings: { completionOwner: "applicant" },
    };
    const submitted = { onboarding_step_id: "tenant-info", status: "completed", completed_at: "2026-10-10T10:00:00.000Z" };

    function mapInfo(record: Partial<typeof infoRecord> & Record<string, unknown>, progress = submitted) {
      return mapAssignedStepRecords({
        records: [{ ...infoRecord, ...record }],
        tenantSteps: [infoStep],
        progressByStepId: new Map([["tenant-info", progress]]),
      })[0]!;
    }

    it("shows Submitted when the candidate completes it, without changing the progress status", () => {
      const step = mapInfo({});
      expect(step.candidateOwned).toBe(true);
      expect(step.status).toBe("completed");
      expect(step.displayStatus).toBe("submitted");
      expect(step.verifiedAt).toBeNull();
      expect(stepDisplayStatusLabel(step)).toBe("Submitted");
      expect(stepStatusPill(step)).toEqual({ label: "Submitted", tone: "info" });
    });

    it("shows Completed once a recruiter marks it complete", () => {
      const step = mapInfo({
        review_decision: "complete",
        status_changed_at: "2026-10-11T09:00:00.000Z",
        status_changed_by_name: "Test User",
      });
      expect(step.displayStatus).toBe("completed");
      expect(step.verifiedAt).toBe("2026-10-11T09:00:00.000Z");
      expect(step.verifiedByName).toBe("Test User");
      expect(stepStatusPill(step)).toBeNull();
    });

    it("goes back to Submitted when the candidate re-submits after verification", () => {
      const step = mapInfo(
        { review_decision: "complete", status_changed_at: "2026-10-11T09:00:00.000Z" },
        { ...submitted, completed_at: "2026-10-12T08:00:00.000Z" }
      );
      expect(step.displayStatus).toBe("submitted");
      expect(step.verifiedAt).toBeNull();
    });

    it("leaves unfinished candidate steps and recruiter steps alone", () => {
      expect(mapInfo({}, { ...submitted, status: "in_progress", completed_at: "" }).displayStatus).toBe("in_progress");
      const [screening] = mapAssignedStepRecords({
        records: [
          {
            id: "rec-screening",
            snapshot_step_id: "node-screening",
            title: "Recruiter Screening",
            step_type: "recruiter-screening",
            is_required: true,
            position: 1,
            status: "completed",
            settings: { completionOwner: "recruiter_or_hr" },
          },
        ],
        tenantSteps: [],
        progressByStepId: new Map(),
      });
      expect(screening?.candidateOwned).toBe(false);
      expect(screening?.displayStatus).toBe("completed");
    });

    it("checks the recruiter decision against the candidate's submission time", () => {
      expect(candidateStepVerifiedAt({ review_decision: "reopen", status_changed_at: "2026-10-11T00:00:00Z" }, submitted)).toBeNull();
      expect(
        candidateStepVerifiedAt({ review_decision: "complete", status_changed_at: "2026-10-10T10:00:00.000Z" }, submitted)
      ).toBe("2026-10-10T10:00:00.000Z");
    });

    it("maps a verified step's document approval to Completed, not Approved", () => {
      expect(
        candidateReviewDisplayStatus({
          status: "completed",
          displayStatus: "approved",
          candidateOwned: true,
          verifiedAt: "2026-10-11T09:00:00.000Z",
        })
      ).toBe("completed");
      expect(
        candidateReviewDisplayStatus({
          status: "completed",
          displayStatus: "rejected",
          candidateOwned: true,
          verifiedAt: null,
        })
      ).toBe("rejected");
    });
  });

  it("requires both SSN card and driver's license fronts", () => {
    expect(hasRequiredIdentityDocuments({ ssn_url: "ssn/a.png", drivers_license_url: "license/b.png" })).toBe(true);
    expect(hasRequiredIdentityDocuments({ ssn_url: "ssn/a.png", drivers_license_url: null })).toBe(false);
    expect(hasRequiredIdentityDocuments(null)).toBe(false);
  });
});

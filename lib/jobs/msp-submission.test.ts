import { describe, expect, it } from "vitest";
import {
  MspSubmissionError,
  SUBMITTED_TO_MSP_STATUS_NAME,
  applicationStageAudience,
  canSubmitCandidateToMsp,
  commitReadyMspSubmission,
  evaluateMspSubmission,
  externalMspResponseMayAdvanceStage,
  filterApplicationStatusesForSource,
  planApplicationStatusChange,
  profilePatchChangesApplicationStage,
  resolveMspPacketVariants,
  type MspSubmissionContext,
  type MspSubmissionRecord,
  type MspWorkflowStep,
} from "@/lib/jobs/msp-submission";

const statuses = [
  { id: "new", name: "New / Not Contacted", systemKey: "new" },
  { id: "ai", name: "AI Assessed", systemKey: null },
  { id: "screen", name: "Screening Complete", systemKey: "reviewing" },
  { id: "ready", name: "Profile Ready", systemKey: null },
  { id: "submit", name: "Submitted to MSP", systemKey: null },
  { id: "legacy-submit", name: "Submitted for MSP Review", systemKey: null },
  { id: "presented", name: "Presented to Client", systemKey: null },
  { id: "client-iv", name: "Client Interview", systemKey: null },
  { id: "offer", name: "Offer/Agreement", systemKey: null },
  { id: "internal", name: "Internal Select", systemKey: null },
  { id: "selected", name: "Selected", systemKey: null },
  { id: "hired", name: "Selected by Client", systemKey: "hired" },
  { id: "msp-reject", name: "Rejected by MSP", systemKey: null },
  { id: "client-reject", name: "Rejected by Client", systemKey: null },
  { id: "fit", name: "Not a Fit", systemKey: "rejected" },
];

function step(partial: Partial<MspWorkflowStep> & Pick<MspWorkflowStep, "id" | "stepKey" | "title" | "position">): MspWorkflowStep {
  return {
    required: true,
    status: "completed",
    settings: {},
    ...partial,
  };
}

function context(overrides: Partial<MspSubmissionContext> = {}): MspSubmissionContext {
  return {
    tenantId: "tenant-1",
    applicationId: "app-1",
    workerId: "worker-1",
    currentStatusName: "Profile Ready",
    currentStatusKey: null,
    job: {
      id: "job-1",
      sourceType: "MSP",
      placementType: "Recruit_and_Release",
      employmentType: "W2",
      eorType: "MSP",
      industryKey: "healthcare",
      externalRequisitionId: "MSP-100",
    },
    profile: {
      firstName: "Ava",
      lastName: "Nguyen",
      email: "ava@example.com",
      phone: "555-0100",
      resumeOnFile: true,
    },
    documents: [
      { id: "doc-1", label: "State license", stepKey: "credential-license-verification", status: "approved" },
      { id: "doc-2", label: "Skills checklist", stepKey: "document-upload", status: "uploaded" },
    ],
    steps: [
      step({ id: "s1", stepKey: "resume-basic-profile", title: "Resume / Profile", position: 1 }),
      step({
        id: "s2",
        stepKey: "credential-license-verification",
        title: "License",
        position: 2,
        settings: { packetVariants: ["healthcare"], requiredDocuments: ["State license"] },
      }),
      step({
        id: "s3",
        stepKey: "document-upload",
        title: "Skills checklist",
        position: 3,
        settings: { packetVariants: ["w2", "recruit_and_release"], requiredDocuments: ["Skills checklist"] },
      }),
      step({
        id: "s4",
        stepKey: "submit-to-msp",
        title: "Submit to MSP",
        position: 4,
        status: "pending",
      }),
      step({
        id: "s5",
        stepKey: "client-review",
        title: "Presented to Client",
        position: 5,
        status: "pending",
      }),
    ],
    ...overrides,
  };
}

describe("MSP stage visibility", () => {
  it("hides MSP submission stages on Internal jobs and Internal-only stages on MSP jobs", () => {
    const internal = filterApplicationStatusesForSource(statuses, "Internal").map((status) => status.name);
    const msp = filterApplicationStatusesForSource(statuses, "MSP").map((status) => status.name);

    expect(internal).not.toContain("Submitted to MSP");
    expect(internal).not.toContain("Submitted for MSP Review");
    expect(internal).not.toContain("Presented to Client");
    expect(internal).not.toContain("Client Interview");
    expect(internal).not.toContain("Rejected by MSP");
    expect(internal).not.toContain("Rejected by Client");
    expect(internal).toContain("Internal Select");
    expect(internal).toContain("Selected by Client");
    expect(internal).toContain("Profile Ready");

    expect(msp).toContain("Submitted to MSP");
    expect(msp).toContain("Presented to Client");
    expect(msp).toContain("Client Interview");
    expect(msp).toContain("Rejected by MSP");
    expect(msp).not.toContain("Internal Select");
    expect(msp).not.toContain("Selected");
    expect(msp).toContain("Selected by Client");
  });

  it("keeps the current stage visible when it would otherwise be hidden", () => {
    const names = filterApplicationStatusesForSource(statuses, "Internal", "submit").map((status) => status.id);
    expect(names).toContain("submit");
  });

  it("treats submission, client presentation, client interview, and rejection as different stages", () => {
    expect(applicationStageAudience("Submitted to MSP")).toBe("msp");
    expect(applicationStageAudience("Presented to Client")).toBe("msp");
    expect(applicationStageAudience("Client Interview")).toBe("msp");
    expect(applicationStageAudience("Rejected by MSP")).toBe("msp");
    expect(applicationStageAudience("Rejected by Client")).toBe("msp");
    expect(applicationStageAudience("Offer/Agreement")).toBe("shared");
    expect(applicationStageAudience("Internal Select")).toBe("internal");
  });
});

describe("MSP packet variants", () => {
  it("resolves W2, Recruit & Release, MSP EOR, and healthcare together", () => {
    expect(resolveMspPacketVariants(context().job)).toEqual([
      "w2",
      "recruit_and_release",
      "msp_eor",
      "healthcare",
    ]);
  });

  it("resolves 1099 and non-healthcare without the healthcare license packet", () => {
    const decision = evaluateMspSubmission(
      context({
        job: {
          ...context().job,
          employmentType: "1099",
          placementType: "Internal",
          eorType: "Tenant",
          industryKey: "hospitality",
        },
        steps: [
          step({ id: "s1", stepKey: "resume-basic-profile", title: "Resume / Profile", position: 1 }),
          step({
            id: "s2",
            stepKey: "credential-license-verification",
            title: "License",
            position: 2,
            status: "pending",
            settings: { packetVariants: ["healthcare"], requiredDocuments: ["State license"] },
          }),
          step({
            id: "s4",
            stepKey: "submit-to-msp",
            title: "Submit to MSP",
            position: 4,
            status: "pending",
            settings: { packetVariants: ["1099", "non_healthcare"] },
          }),
        ],
        documents: [],
      }),
      null
    );

    expect(decision.packetVariants).toEqual(["1099", "non_healthcare"]);
    expect(decision.checks.some((check) => check.label === "State license")).toBe(false);
    expect(decision.ready).toBe(true);
    expect(decision.nextStatusName).toBe(SUBMITTED_TO_MSP_STATUS_NAME);
  });
});

describe("evaluateMspSubmission", () => {
  it("is ready when the configured packet, profile, and documents are complete", () => {
    const decision = evaluateMspSubmission(context(), null);
    expect(decision.ready).toBe(true);
    expect(decision.applicable).toBe(true);
    expect(decision.nextStatusName).toBe("Submitted to MSP");
    expect(decision.externalResponseAdvancesStage).toBe(false);
    expect(decision.checks.find((check) => check.id === "step:s5")).toBeUndefined();
  });

  it("explains missing profile details and documents", () => {
    const decision = evaluateMspSubmission(
      context({
        profile: {
          firstName: "Ava",
          lastName: "",
          email: "",
          phone: null,
          resumeOnFile: false,
        },
        documents: [{ id: "doc-x", label: "State license", stepKey: null, status: "rejected" }],
      }),
      null
    );
    expect(decision.ready).toBe(false);
    expect(decision.nextStatusName).toBeNull();
    expect(decision.blockers.map((blocker) => blocker.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Last name"),
        expect.stringContaining("Email"),
        expect.stringContaining("resume"),
        expect.stringContaining("State license"),
        expect.stringContaining("Skills checklist"),
      ])
    );
  });

  it("blocks a second submission for the same requisition", () => {
    const existing: MspSubmissionRecord = {
      id: "sub-1",
      tenantId: "tenant-1",
      jobApplicationId: "app-1",
      jobRequisitionId: "job-1",
      workerId: "worker-1",
      submittedByUserId: "user-1",
      submittedAt: "2026-10-06T00:00:00.000Z",
      status: "submitted",
      mspReference: "PORTAL-9",
      notes: "Packet uploaded",
      packetVariants: ["w2"],
      readinessSnapshot: [],
    };
    const decision = evaluateMspSubmission(context(), existing);
    expect(decision.alreadySubmitted).toBe(true);
    expect(decision.ready).toBe(false);
    expect(decision.blockers.some((blocker) => blocker.code === "ALREADY_SUBMITTED")).toBe(true);
    expect(decision.nextStatusName).toBeNull();
  });

  it("does not submit an Internal job", () => {
    const decision = evaluateMspSubmission(
      context({ job: { ...context().job, sourceType: "Internal" } }),
      null
    );
    expect(decision.applicable).toBe(false);
    expect(decision.ready).toBe(false);
    expect(decision.blockers[0]?.code).toBe("NOT_MSP_JOB");
  });

  it("keeps MSP and client rejection off the submission stage", () => {
    const rejected = evaluateMspSubmission(
      context({ currentStatusName: "Rejected by MSP", currentStatusKey: null }),
      null
    );
    expect(rejected.rejected).toBe(true);
    expect(rejected.ready).toBe(false);
    expect(rejected.nextStatusName).toBeNull();
    expect(externalMspResponseMayAdvanceStage()).toBe(false);
  });

  it("does not treat a profile edit as a stage change", () => {
    const before = context();
    const edited = context({
      profile: { ...before.profile, phone: "555-0199", lastName: "Nguyen-Smith" },
    });
    expect(profilePatchChangesApplicationStage({
      firstName: edited.profile.firstName,
      lastName: edited.profile.lastName,
      phone: edited.profile.phone,
      email: edited.profile.email,
    })).toBe(false);
    expect(evaluateMspSubmission(edited, null).nextStatusName).toBe(
      evaluateMspSubmission(before, null).nextStatusName
    );
    expect(edited.currentStatusName).toBe(before.currentStatusName);
  });
});

describe("commitReadyMspSubmission", () => {
  function memoryStore() {
    const rows = new Map<string, MspSubmissionRecord>();
    const audits: MspSubmissionRecord[] = [];
    const stages: string[] = [];
    return {
      rows,
      audits,
      stages,
      persist: async (record: MspSubmissionRecord) => {
        if (rows.has(record.jobApplicationId)) {
          throw new MspSubmissionError("duplicate", "ALREADY_SUBMITTED", 409);
        }
        const saved = { ...record, id: record.id || "sub-1" };
        rows.set(saved.jobApplicationId, saved);
        return saved;
      },
      reload: (applicationId: string) => rows.get(applicationId) ?? null,
    };
  }

  it("records the submission and only advances to Submitted to MSP", async () => {
    const store = memoryStore();
    const result = await commitReadyMspSubmission({
      actorAllowed: true,
      context: context(),
      existing: null,
      actorUserId: "recruiter-1",
      notes: "Ready for the portal",
      mspReference: "REF-22",
      submittedAt: "2026-10-06T12:00:00.000Z",
      persist: store.persist,
      changeStatus: async (statusName) => {
        store.stages.push(statusName);
      },
      audit: async (record) => {
        store.audits.push(record);
      },
    });

    expect(result.decision.nextStatusName).toBe("Submitted to MSP");
    expect(store.stages).toEqual(["Submitted to MSP"]);
    expect(result.decision.externalResponseAdvancesStage).toBe(false);
    const reloaded = store.reload("app-1");
    expect(reloaded).toMatchObject({
      id: "sub-1",
      jobApplicationId: "app-1",
      jobRequisitionId: "job-1",
      submittedByUserId: "recruiter-1",
      submittedAt: "2026-10-06T12:00:00.000Z",
      status: "submitted",
      mspReference: "REF-22",
      notes: "Ready for the portal",
    });
    expect(store.audits).toHaveLength(1);
    expect(reloaded?.packetVariants).toEqual(["w2", "recruit_and_release", "msp_eor", "healthcare"]);
  });

  it("refuses a duplicate after reload", async () => {
    const store = memoryStore();
    await commitReadyMspSubmission({
      actorAllowed: true,
      context: context(),
      existing: null,
      actorUserId: "recruiter-1",
      notes: null,
      mspReference: null,
      persist: store.persist,
      changeStatus: async () => undefined,
      audit: async () => undefined,
    });
    await expect(
      commitReadyMspSubmission({
        actorAllowed: true,
        context: context(),
        existing: store.reload("app-1"),
        actorUserId: "recruiter-1",
        notes: null,
        mspReference: null,
        persist: store.persist,
        changeStatus: async () => undefined,
        audit: async () => undefined,
      })
    ).rejects.toMatchObject({ code: "ALREADY_SUBMITTED" });
    expect(store.rows.size).toBe(1);
  });

  it("does not persist when required information is missing or the user is unauthorized", async () => {
    const store = memoryStore();
    await expect(
      commitReadyMspSubmission({
        actorAllowed: false,
        context: context(),
        existing: null,
        actorUserId: "worker-1",
        notes: null,
        mspReference: null,
        persist: store.persist,
        changeStatus: async () => undefined,
        audit: async () => undefined,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    await expect(
      commitReadyMspSubmission({
        actorAllowed: true,
        context: context({
          documents: [],
          profile: { firstName: "", lastName: "", email: "", phone: null, resumeOnFile: false },
        }),
        existing: null,
        actorUserId: "recruiter-1",
        notes: null,
        mspReference: null,
        persist: store.persist,
        changeStatus: async () => undefined,
        audit: async () => undefined,
      })
    ).rejects.toBeInstanceOf(MspSubmissionError);
    expect(store.rows.size).toBe(0);
    expect(canSubmitCandidateToMsp("worker")).toBe(false);
    expect(canSubmitCandidateToMsp("recruiter")).toBe(true);
  });
});

describe("planApplicationStatusChange", () => {
  it("blocks MSP stages on Internal jobs and status-only submission", () => {
    expect(
      planApplicationStatusChange({
        sourceType: "Internal",
        targetName: "Submitted to MSP",
        currentStatusId: "ready",
        targetStatusId: "submit",
        hasMspSubmission: false,
      })
    ).toMatchObject({ ok: false, code: "VALIDATION" });

    expect(
      planApplicationStatusChange({
        sourceType: "MSP",
        targetName: "Internal Select",
        currentStatusId: "ready",
        targetStatusId: "internal",
        hasMspSubmission: false,
      })
    ).toMatchObject({ ok: false });

    expect(
      planApplicationStatusChange({
        sourceType: "MSP",
        targetName: "Submitted to MSP",
        currentStatusId: "ready",
        targetStatusId: "submit",
        hasMspSubmission: false,
      })
    ).toMatchObject({ ok: false, code: "CONFLICT" });

    expect(
      planApplicationStatusChange({
        sourceType: "MSP",
        targetName: "Presented to Client",
        currentStatusId: "submit",
        targetStatusId: "presented",
        hasMspSubmission: true,
      }).ok
    ).toBe(true);
  });

  it("keeps a status that Settings attached to the current stage", () => {
    expect(
      planApplicationStatusChange({
        sourceType: "Internal",
        targetName: "Presented to Client",
        currentStatusId: "ready",
        targetStatusId: "presented",
        hasMspSubmission: false,
        assignedToStage: true,
      }).ok
    ).toBe(true);

    expect(
      planApplicationStatusChange({
        sourceType: "MSP",
        targetName: "Internal Select",
        currentStatusId: "ready",
        targetStatusId: "internal",
        hasMspSubmission: false,
        assignedToStage: true,
      }).ok
    ).toBe(true);
  });
});

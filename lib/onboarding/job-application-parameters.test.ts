import { describe, expect, it } from "vitest";
import {
  findParameterizedJobApplicationProgress,
  isJobScreeningProgressData,
  isParameterizedJobApplicationStepType,
} from "@/lib/onboarding/job-application-parameters";
import { mapAssignedStepRecords } from "@/lib/onboarding/assigned-workflow-steps";
import { inspectionKindForStep } from "@/lib/onboarding/candidate-workflow-step-inspection";

describe("job application parameters", () => {
  it("recognises the library step id in either spelling", () => {
    expect(isParameterizedJobApplicationStepType("parameterized-job-application")).toBe(true);
    expect(isParameterizedJobApplicationStepType("parameterized_job_application")).toBe(true);
    expect(isParameterizedJobApplicationStepType("profile_information")).toBe(false);
  });

  it("opens the step as a job application inspection instead of a generic form", () => {
    expect(
      inspectionKindForStep({ stepType: "parameterized-job-application", onboardingType: "profile_information" })
    ).toBe("job_application");
  });

  it("recognises job screening progress payloads", () => {
    expect(isJobScreeningProgressData({ source: "job_screening_answers", application_id: "app-1" })).toBe(
      true
    );
    expect(
      isJobScreeningProgressData({ system_completed: true, reason: "non_navigable_placeholder" })
    ).toBe(true);
  });

  it("maps parameterized steps to completed progress even without tenant step match", () => {
    const progressByStepId = new Map([
      [
        "tenant-param",
        {
          onboarding_step_id: "tenant-param",
          status: "completed",
          completed_at: "2026-10-08T12:00:00.000Z",
          data: { source: "job_screening_answers", application_id: "app-1" },
        },
      ],
    ]);
    const [mapped] = mapAssignedStepRecords({
      records: [
        {
          id: "rec-param",
          snapshot_step_id: "w2-09",
          title: "Parameterized Job Application",
          step_type: "parameterized-job-application",
          is_required: true,
          position: 2,
          phase: "pre_hire",
          status: "pending",
          settings: {},
        },
      ],
      tenantSteps: [],
      progressByStepId,
      applicationId: "app-1",
    });
    expect(mapped?.status).toBe("completed");
    expect(mapped?.displayStatus).toBe("completed");
    expect(mapped?.unmatched).toBe(false);
    expect(mapped?.detail).toBeUndefined();
    expect(findParameterizedJobApplicationProgress(progressByStepId, "app-1")?.tenantStepId).toBe(
      "tenant-param"
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  buildProgressStatusMaps,
  computeMaxAllowedStepIndexFromProgress,
} from "@/lib/onboarding/compute-max-allowed-from-progress";
import { createDefaultOnboardingStepDrafts } from "@/lib/onboarding/default-onboarding-steps";
import type { TenantOnboardingStep, WorkerOnboardingProgressPayload } from "@/lib/onboarding/types";
import { resolveApplicantStepFromPath } from "@/lib/onboarding/find-applicant-step";

function legacySteps(): TenantOnboardingStep[] {
  return createDefaultOnboardingStepDrafts().map((d) => ({
    id: `step-${d.step_key}`,
    step_key: d.step_key,
    title: d.title,
    description: d.description,
    step_type: d.step_type,
    sort_order: d.sort_order,
    is_required: d.is_required,
    is_enabled: d.is_enabled,
    metadata: d.metadata,
  }));
}

describe("resolveApplicantStepFromPath", () => {
  it("returns null for unknown routes instead of defaulting to the first step", () => {
    const steps = legacySteps();
    expect(resolveApplicantStepFromPath("/application/not-in-flow", "", steps)).toBeNull();
  });
});

describe("buildProgressStatusMaps", () => {
  it("resolves completed status by step_key when progress id differs from config id", () => {
    const steps = legacySteps().map((step) =>
      step.step_key === "professional_license"
        ? { ...step, id: "preview-professional_license" }
        : step
    );
    const license = steps.find((s) => s.step_key === "professional_license")!;
    const progress: WorkerOnboardingProgressPayload = {
      progressId: "p1",
      status: "in_progress",
      steps: [
        {
          onboarding_step_id: "published-uuid-license",
          step_key: "professional_license",
          status: "completed",
          completed_at: "2026-01-01",
          data: {},
        },
      ],
    };

    const map = buildProgressStatusMaps(steps, progress);
    expect(map.get(license.id)).toBe("completed");
  });

  it("does not give a published step another step's status through a shared key", () => {
    const base = legacySteps()[0]!;
    const offer: TenantOnboardingStep = {
      ...base,
      id: "cdbc0968-5f43-49dd-87fc-caeb0b47063b",
      step_key: "custom_question_11",
      step_type: "custom_question",
      title: "Offer Accepted",
    };
    const ssn: TenantOnboardingStep = {
      ...base,
      id: "1e962519-816a-492f-934c-72d39961f4a2",
      step_key: "document_upload",
      step_type: "document_upload",
      title: "SSN / Identity Verification",
    };
    const progress: WorkerOnboardingProgressPayload = {
      progressId: "p1",
      status: "in_progress",
      steps: [
        {
          onboarding_step_id: "db479d24-6104-4fa8-8fac-6bc82ecb7b4b",
          step_key: "custom_question",
          status: "completed",
          completed_at: "2026-01-01",
          data: {},
        },
        {
          onboarding_step_id: "604c7e2f-1a94-4e82-96c7-f16e10865d6c",
          step_key: "document_upload",
          status: "completed",
          completed_at: "2026-01-01",
          data: {},
        },
      ],
    };

    const map = buildProgressStatusMaps([offer, ssn], progress);
    expect(map.get(offer.id)).toBe("pending");
    expect(map.get(ssn.id)).toBe("pending");
  });
});

describe("computeMaxAllowedStepIndexFromProgress", () => {
  it("unlocks past the upload-later credential step once the resume step is completed in DB", () => {
    const steps = legacySteps();
    const progress: WorkerOnboardingProgressPayload = {
      progressId: "p1",
      status: "in_progress",
      steps: [
        {
          onboarding_step_id: steps[0]!.id,
          status: "completed",
          completed_at: new Date().toISOString(),
          data: {},
        },
      ],
    };

    expect(steps[1]!.metadata?.workflow_step_id).toBe("credential-license-verification");
    expect(computeMaxAllowedStepIndexFromProgress(steps, progress)).toBe(3);
  });

  it("does not treat missing progress as fully unlocked", () => {
    const steps = legacySteps();
    expect(computeMaxAllowedStepIndexFromProgress(steps, null)).toBe(1);
  });

  it("includes later in_progress steps even when an earlier optional step is still pending", () => {
    const steps = legacySteps();
    const progress: WorkerOnboardingProgressPayload = {
      progressId: "p1",
      status: "in_progress",
      steps: [
        { onboarding_step_id: steps[0]!.id, status: "completed", completed_at: "2026-01-01", data: {} },
        { onboarding_step_id: steps[1]!.id, status: "completed", completed_at: "2026-01-01", data: {} },
        { onboarding_step_id: steps[2]!.id, status: "pending", completed_at: null, data: {} },
        { onboarding_step_id: steps[3]!.id, status: "in_progress", completed_at: null, data: {} },
      ],
    };

    expect(computeMaxAllowedStepIndexFromProgress(steps, progress)).toBe(4);
  });

  it("allows advancing past optional pending steps", () => {
    const steps = legacySteps().map((step) =>
      step.step_key === "skill_assessment" ? { ...step, is_required: false } : step
    );
    const progress: WorkerOnboardingProgressPayload = {
      progressId: "p1",
      status: "in_progress",
      steps: [
        { onboarding_step_id: steps[0]!.id, status: "completed", completed_at: "2026-01-01", data: {} },
        { onboarding_step_id: steps[1]!.id, status: "completed", completed_at: "2026-01-01", data: {} },
        { onboarding_step_id: steps[2]!.id, status: "pending", completed_at: null, data: {} },
        { onboarding_step_id: steps[3]!.id, status: "completed", completed_at: "2026-01-01", data: {} },
      ],
    };

    expect(computeMaxAllowedStepIndexFromProgress(steps, progress)).toBeGreaterThan(3);
  });
});

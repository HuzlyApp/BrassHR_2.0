import { beforeEach, describe, expect, it, vi } from "vitest";
import { workflowStateToStepDrafts } from "@/lib/onboarding/workflow-to-drafts";
import { DEFAULT_STEP_SETTINGS } from "@/app/components/workflow-builder/types";
import type { SerializableWorkflowState } from "@/lib/onboarding/workflow-builder-serialization";

const sendOnboardingApplicantEmail = vi.fn();
const writeActivityLog = vi.fn();

vi.mock("@/lib/email/send-templated-email", () => ({
  sendOnboardingApplicantEmail: (...args: unknown[]) => sendOnboardingApplicantEmail(...args),
}));

vi.mock("@/lib/audit/activity-log", () => ({
  writeActivityLog: (...args: unknown[]) => writeActivityLog(...args),
}));

import {
  readStepEmailTemplateKey,
  sendConfiguredStepCompletionEmail,
} from "@/lib/onboarding/step-completion-email";

describe("readStepEmailTemplateKey", () => {
  it("returns nothing when the step has no template", () => {
    expect(readStepEmailTemplateKey(null)).toBeNull();
    expect(readStepEmailTemplateKey({})).toBeNull();
    expect(readStepEmailTemplateKey({ emailTemplateKey: "  " })).toBeNull();
    expect(readStepEmailTemplateKey({ emailTemplateKey: "not-a-template" })).toBeNull();
  });

  it("returns the candidate template the admin selected", () => {
    expect(readStepEmailTemplateKey({ emailTemplateKey: "welcome" })).toBe("welcome");
    expect(
      readStepEmailTemplateKey({ workflow_settings: { emailTemplateKey: "next_step_ready" } })
    ).toBe("next_step_ready");
  });

  it("does not treat the recruiter agreement notice as a candidate email", () => {
    expect(readStepEmailTemplateKey({ emailTemplateKey: "recruiter_agreement_signed" })).toBeNull();
  });
});

describe("sendConfiguredStepCompletionEmail", () => {
  beforeEach(() => {
    sendOnboardingApplicantEmail.mockReset();
    writeActivityLog.mockReset();
  });

  it("does not send when no template is selected", async () => {
    const result = await sendConfiguredStepCompletionEmail({} as never, {
      tenantId: "tenant-1",
      workerId: "worker-1",
      origin: "https://app.example",
      settings: { emailTemplateKey: "" },
    });
    expect(result).toMatchObject({ sent: false, skipped: true, reason: "NO_TEMPLATE" });
    expect(sendOnboardingApplicantEmail).not.toHaveBeenCalled();
  });

  it("sends the selected template to the candidate", async () => {
    sendOnboardingApplicantEmail.mockResolvedValue({ sent: true });
    const result = await sendConfiguredStepCompletionEmail({} as never, {
      tenantId: "tenant-1",
      workerId: "worker-1",
      origin: "https://app.example",
      settings: { emailTemplateKey: "welcome", emailTemplateName: "Nursing welcome" },
      stepTitle: "Welcome packet",
      stepId: "step-1",
    });
    expect(result).toMatchObject({ sent: true, templateKey: "welcome" });
    expect(sendOnboardingApplicantEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: "tenant-1",
        workerId: "worker-1",
        templateKey: "welcome",
        origin: "https://app.example",
      })
    );
  });
});

describe("workflow step settings", () => {
  it("keeps the optional email template on the saved step", () => {
    const state: SerializableWorkflowState = {
      nodes: [
        {
          id: "step-welcome",
          stepId: "welcome-packet-esign",
          label: "Welcome packet",
          description: null,
          position: { x: 0, y: 0 },
          day: 1,
          required: true,
          settings: {
            ...DEFAULT_STEP_SETTINGS,
            emailTemplateKey: "welcome",
            emailTemplateName: "Welcome email",
          },
        },
      ],
      edges: [],
    };

    const drafts = workflowStateToStepDrafts(state, []);
    const welcome = drafts.find((draft) => draft.metadata?.workflow_node_id === "step-welcome");
    expect(welcome?.metadata?.workflow_settings).toMatchObject({
      emailTemplateKey: "welcome",
      emailTemplateName: "Welcome email",
    });
  });
});

import { describe, expect, it } from "vitest";
import { isWelcomeEmailWorkflowStep } from "@/lib/onboarding/welcome-email-step";

describe("welcome email workflow step", () => {
  it("recognises the welcome-email library id", () => {
    expect(isWelcomeEmailWorkflowStep("welcome-email")).toBe(true);
    expect(isWelcomeEmailWorkflowStep("welcome_email")).toBe(true);
    expect(isWelcomeEmailWorkflowStep("manager-welcome-call")).toBe(false);
  });
});

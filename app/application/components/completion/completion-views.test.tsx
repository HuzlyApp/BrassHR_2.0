// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PreHireCompletionView from "@/app/application/components/completion/PreHireCompletionView";
import PostHireCompletionView from "@/app/application/components/completion/PostHireCompletionView";
import type { WorkflowCompletionResult } from "@/lib/onboarding/workflow-completion-check";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    replace: vi.fn(),
  }),
  usePathname: () => "/application/pre-hire-completion",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/components/tenant/TenantBrandingContext", () => ({
  useTenantBranding: () => ({
    primaryHex: "#0ea5a4",
    secondaryHex: "#1e293b",
    companyName: "Nexus Medical Staffing",
  }),
}));

vi.mock("@/lib/tenant/use-onboarding-tenant", () => ({
  useOnboardingTenant: () => ({
    slug: "subdomaintest",
    path: (p: string) => p,
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/app/components/onboarding/OnboardingConfigProvider", () => ({
  useOnboardingConfigOptional: () => null,
}));

describe("PreHireCompletionView", () => {
  const mockResult: WorkflowCompletionResult = {
    preHire: {
      total: 3,
      completedCount: 3,
      percent: 100,
      isComplete: true,
      steps: [
        {
          id: "s1",
          stepKey: "resume",
          title: "Upload Resume",
          stepType: "resume_upload",
          phase: "pre_hire",
          status: "completed",
          isComplete: true,
          isSkipped: false,
          isRequired: true,
        },
      ],
    },
    postHire: {
      total: 2,
      completedCount: 0,
      percent: 0,
      isComplete: false,
      steps: [
        {
          id: "s2",
          stepKey: "direct_deposit",
          title: "Direct Deposit Setup",
          stepType: "custom_question",
          phase: "post_hire",
          status: "pending",
          isComplete: false,
          isSkipped: false,
          isRequired: true,
        },
      ],
    },
    allComplete: false,
    hasPostHireSteps: true,
    firstPostHireStep: null,
    firstPostHireRoute: "/application/custom-step/direct_deposit?tenant=subdomaintest",
    nextIncompletePostHireRoute: "/application/custom-step/direct_deposit?tenant=subdomaintest",
  };

  it("renders congratulations message and pre-hire completed text", () => {
    render(<PreHireCompletionView completionResult={mockResult} />);

    expect(screen.getByRole("heading", { name: /congratulations/i })).toBeDefined();
    expect(screen.getByText(/your all pre hire steps are completed/i)).toBeDefined();
    expect(screen.getByText(/you continue with post hire steps/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /complete post hire/i })).toBeDefined();
  });

  it("triggers continue callback when Complete Post Hire button is clicked", () => {
    const onContinue = vi.fn();
    render(<PreHireCompletionView completionResult={mockResult} onContinuePostHire={onContinue} />);

    const button = screen.getByRole("button", { name: /complete post hire/i });
    fireEvent.click(button);
    expect(onContinue).toHaveBeenCalled();
  });
});

describe("PostHireCompletionView", () => {
  const mockResult: WorkflowCompletionResult = {
    preHire: {
      total: 3,
      completedCount: 3,
      percent: 100,
      isComplete: true,
      steps: [],
    },
    postHire: {
      total: 2,
      completedCount: 2,
      percent: 100,
      isComplete: true,
      steps: [],
    },
    allComplete: true,
    hasPostHireSteps: true,
    firstPostHireStep: null,
    firstPostHireRoute: null,
    nextIncompletePostHireRoute: null,
  };

  it("renders congratulations and all steps completed message on last screen", () => {
    render(<PostHireCompletionView completionResult={mockResult} />);

    expect(screen.getByRole("heading", { name: /congratulations/i })).toBeDefined();
    expect(screen.getByText(/onboarding 100% completed/i)).toBeDefined();
    expect(screen.getByText(/you completed all pre hire and post hire steps/i)).toBeDefined();
    expect(screen.getByText(/you can now continue work/i)).toBeDefined();
    expect(screen.queryByText(/ready for work/i)).toBeNull();
    expect(screen.queryByText(/fully certified/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /go to dashboard/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /worker sign in/i }));
    expect(push).toHaveBeenCalledWith("/worker-signin?tenant=subdomaintest");
  });
});

// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddStepPicker from "./AddStepPicker";
import type { StepCategory } from "./types";

const categories: StepCategory[] = [
  {
    id: "custom-steps",
    label: "Custom Steps",
    steps: [{ id: "custom-step", label: "Custom Step", icon: null }],
  },
  {
    id: "document-esign",
    label: "Document & eSign",
    steps: [
      { id: "document-upload", label: "Document Upload", icon: null },
      { id: "tax-forms", label: "Tax Forms (W-4 / State)", icon: null, description: "Collect payroll tax forms." },
      { id: "policy-acknowledgment", label: "Policy Acknowledgment", icon: null },
    ],
  },
  {
    id: "application-profile",
    label: "Application & Profile",
    steps: [{ id: "references-collection", label: "References Collection", icon: null }],
  },
];

describe("AddStepPicker", () => {
  it("opens without inserting a step until the user selects one", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <AddStepPicker open categories={categories} onSelect={onSelect} onClose={onClose} />
    );

    expect(screen.getByRole("dialog", { name: "Add Workflow Step" })).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("searches for tax and inserts Tax Forms, not References Collection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <AddStepPicker open categories={categories} onSelect={onSelect} onClose={() => undefined} />
    );

    await user.type(screen.getByLabelText("Search workflow steps"), "tax");
    expect(screen.getByText("Tax Forms (W-4 / State)")).toBeTruthy();
    expect(screen.queryByText("References Collection")).toBeNull();

    await user.click(screen.getByText("Tax Forms (W-4 / State)"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe("tax-forms");
    expect(onSelect.mock.calls[0][0].id).not.toBe("references-collection");
  });

  it("keeps Policy Acknowledgment selectable even if References Collection exists in the library", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <AddStepPicker open categories={categories} onSelect={onSelect} onClose={() => undefined} />
    );

    await user.type(screen.getByLabelText("Search workflow steps"), "policy");
    await user.click(screen.getByText("Policy Acknowledgment"));
    expect(onSelect.mock.calls[0][0].id).toBe("policy-acknowledgment");
  });

  it("shows an empty state with clear search", async () => {
    const user = userEvent.setup();
    render(
      <AddStepPicker
        open
        categories={categories}
        onSelect={() => undefined}
        onClose={() => undefined}
      />
    );

    await user.type(screen.getByLabelText("Search workflow steps"), "xyz");
    expect(screen.getByText(/No steps found for/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear search" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create Custom Step" })).toBeTruthy();
  });

  it("brings hidden steps back when the query is deleted", async () => {
    const user = userEvent.setup();
    render(
      <AddStepPicker
        open
        categories={categories}
        onSelect={() => undefined}
        onClose={() => undefined}
      />
    );

    const input = screen.getByLabelText("Search workflow steps");
    await user.type(input, "tax");
    expect(screen.queryByText("References Collection")).toBeNull();

    await user.clear(input);
    expect(screen.getByText("References Collection")).toBeTruthy();
    expect(screen.getByText("Policy Acknowledgment")).toBeTruthy();
  });
});

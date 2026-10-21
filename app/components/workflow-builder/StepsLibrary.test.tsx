// @vitest-environment happy-dom

import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StepsLibrary from "./StepsLibrary";
import type { StepCategory } from "./types";

const categories: StepCategory[] = [
  {
    id: "custom-steps",
    label: "Custom Steps",
    steps: [{ id: "custom-step", label: "Custom Step", icon: null }],
  },
  {
    id: "application-profile",
    label: "Application & Profile",
    steps: [
      { id: "resume-basic-profile", label: "Resume & Basic Profile", icon: null },
      { id: "references-collection", label: "References Collection", icon: null },
    ],
  },
  {
    id: "payroll-financial",
    label: "Payroll & Financial Steps",
    steps: [{ id: "tax-forms", label: "Tax Forms (W-4 / State)", icon: null }],
  },
];

function ControlledLibrary({ initial = "" }: { initial?: string }) {
  const [term, setTerm] = useState(initial);
  return (
    <StepsLibrary categories={categories} searchTerm={term} onSearchTermChange={setTerm} />
  );
}

describe("StepsLibrary search", () => {
  it("restores every hidden step when the query is deleted", async () => {
    const user = userEvent.setup();
    render(<StepsLibrary categories={categories} />);

    expect(screen.getByText("Resume & Basic Profile")).toBeTruthy();
    expect(screen.getByText("References Collection")).toBeTruthy();
    expect(screen.getByText("Custom Step")).toBeTruthy();

    const input = screen.getByRole("searchbox", { name: "Search steps" });
    await user.type(input, "resume");
    expect(screen.getByText("Resume & Basic Profile")).toBeTruthy();
    expect(screen.queryByText("References Collection")).toBeNull();
    expect(screen.queryByText("Custom Step")).toBeNull();

    await user.clear(input);
    expect(screen.getByText("Resume & Basic Profile")).toBeTruthy();
    expect(screen.getByText("References Collection")).toBeTruthy();
    expect(screen.getByText("Custom Step")).toBeTruthy();
  });

  it("brings hidden steps back as each character is deleted", async () => {
    const user = userEvent.setup();
    render(<ControlledLibrary />);

    const input = screen.getByRole("searchbox", { name: "Search steps" });
    await user.type(input, "resume");
    expect(screen.queryByText("References Collection")).toBeNull();

    await user.keyboard("{Backspace}{Backspace}{Backspace}{Backspace}{Backspace}{Backspace}");
    expect(input).toHaveProperty("value", "");
    expect(screen.getByText("References Collection")).toBeTruthy();
    expect(screen.getByText("Custom Step")).toBeTruthy();
  });

  it("clears a shared query from the library field and brings steps back", async () => {
    const user = userEvent.setup();
    render(<ControlledLibrary initial="resume" />);

    expect(screen.getByRole("searchbox", { name: "Search steps" })).toHaveProperty("value", "resume");
    expect(screen.queryByText("References Collection")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByText("References Collection")).toBeTruthy();
    expect(screen.getByText("Custom Step")).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Search steps" })).toHaveProperty("value", "");
  });

  it("does not remove steps from the library data while filtering", async () => {
    const user = userEvent.setup();
    const snapshot = JSON.stringify(categories);
    render(<StepsLibrary categories={categories} />);

    await user.type(screen.getByRole("searchbox", { name: "Search steps" }), "resume");
    await user.clear(screen.getByRole("searchbox", { name: "Search steps" }));

    expect(JSON.stringify(categories)).toBe(snapshot);
    expect(screen.getByText("References Collection")).toBeTruthy();
  });

  it("points at the other tab instead of treating a step as deleted", async () => {
    const user = userEvent.setup();
    render(<StepsLibrary categories={categories} />);

    await user.type(screen.getByRole("searchbox", { name: "Search steps" }), "tax");
    expect(screen.queryByText("Tax Forms (W-4 / State)")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Show \d+ post-hire match/ }));
    expect(screen.getByText("Tax Forms (W-4 / State)")).toBeTruthy();

    await user.clear(screen.getByRole("searchbox", { name: "Search steps" }));
    expect(screen.getByText("Tax Forms (W-4 / State)")).toBeTruthy();
  });

  it("shows a stage heading after every step from that stage is already used", () => {
    render(
      <StepsLibrary
        categories={[
          ...categories,
          {
            id: "offer-agreement",
            label: "Offer and agreement",
            steps: [],
          },
        ]}
      />
    );

    expect(screen.getByText("Offer and agreement")).toBeTruthy();
    expect(screen.getByText("No steps left")).toBeTruthy();
    expect(screen.getByText("Resume & Basic Profile")).toBeTruthy();
  });
});

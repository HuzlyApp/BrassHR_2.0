// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ListTableCheckbox } from "./ListTableCheckbox";

describe("ListTableCheckbox", () => {
  it("renders with cursor: pointer and 4px rounded corners", () => {
    const { container } = render(
      <ListTableCheckbox aria-label="Test checkbox" checked={false} onChange={vi.fn()} />
    );

    const span = container.querySelector("span");
    expect(span?.className).toContain("cursor-pointer");
    expect(span?.className).toContain("rounded-[4px]");
    expect(span?.style.cursor).toBe("pointer");

    const input = screen.getByRole("checkbox", { name: "Test checkbox" });
    expect(input.className).toContain("cursor-pointer");
    expect(input.style.cursor).toBe("pointer");
  });

  it("applies secondary branding color and white check icon when checked", () => {
    const { container } = render(
      <ListTableCheckbox aria-label="Checked box" checked={true} onChange={vi.fn()} />
    );

    const input = screen.getByRole("checkbox", { name: "Checked box" }) as HTMLInputElement;
    expect(input.checked).toBe(true);
    expect(input.style.backgroundColor).toBe("var(--brand-secondary, #012352)");
    expect(input.style.borderColor).toBe("var(--brand-secondary, #012352)");

    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.className).toContain("text-white");
  });

  it("handles user interactions and fires onChange", () => {
    const onChange = vi.fn();
    render(
      <ListTableCheckbox aria-label="Interactable box" checked={false} onChange={onChange} />
    );

    const input = screen.getByRole("checkbox", { name: "Interactable box" });
    fireEvent.click(input);
    expect(onChange).toHaveBeenCalled();
  });
});


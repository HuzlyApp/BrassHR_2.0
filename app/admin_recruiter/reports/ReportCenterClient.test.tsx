// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ReportCenterClient from "./ReportCenterClient";

describe("ReportCenterClient", () => {
  it("renders Report Center heading and category navigation", () => {
    render(<ReportCenterClient />);
    expect(screen.getByText("Report Center")).toBeTruthy();
    expect(screen.getByText("All Reports")).toBeTruthy();
    expect(screen.getByText("Team Productivity KPI")).toBeTruthy();
  });
});


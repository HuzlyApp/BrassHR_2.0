import { describe, it, expect } from "vitest";
import {
  DEFAULT_WORKER_COLUMNS,
  WORKER_COLUMN_OPTIONS,
  workerColumnLabel,
  workerColumnDisplayLabel,
  ensureFixedWorkerColumns,
} from "./worker-columns";
import { FIGMA_DEMO_WORKERS, FIGMA_METRIC_COUNTS } from "./figma-demo-data";
import { renderWorkerListCell } from "./render-worker-list-cell";
import {
  EMPTY_WORKERS_EXTENDED_FILTERS,
  countActiveWorkersFilters,
} from "./components/EditWorkersFiltersModal";

describe("Workers UI configuration and demo data", () => {
  it("has exactly 30 column options matching the Edit Columns modal specification", () => {
    expect(WORKER_COLUMN_OPTIONS.length).toBe(30);
  });

  it("includes all default columns in DEFAULT_WORKER_COLUMNS", () => {
    expect(DEFAULT_WORKER_COLUMNS).toContain("name");
    expect(DEFAULT_WORKER_COLUMNS).toContain("contact");
    expect(DEFAULT_WORKER_COLUMNS).toContain("startDate");
    expect(DEFAULT_WORKER_COLUMNS).toContain("endDate");
    expect(DEFAULT_WORKER_COLUMNS).toContain("jobRole");
    expect(DEFAULT_WORKER_COLUMNS).toContain("payRate");
    expect(DEFAULT_WORKER_COLUMNS).toContain("status");
    expect(DEFAULT_WORKER_COLUMNS).toContain("client");
    expect(DEFAULT_WORKER_COLUMNS).toContain("profile");
  });

  it("pins Name at start and Action at end via ensureFixedWorkerColumns", () => {
    const custom = ensureFixedWorkerColumns(["jobRole", "client", "contact"]);
    expect(custom[0]).toBe("name");
    expect(custom[custom.length - 1]).toBe("profile");
    expect(custom).toContain("jobRole");
    expect(custom).toContain("client");
    expect(custom).toContain("contact");
  });

  it("returns uppercase column labels matching Figma headers", () => {
    expect(workerColumnLabel("name")).toBe("NAME");
    expect(workerColumnLabel("contact")).toBe("CONTACT");
    expect(workerColumnLabel("assignment")).toBe("ASSIGNMENT");
    expect(workerColumnLabel("startDate")).toBe("ASSIGNMENT START DATE");
    expect(workerColumnLabel("endDate")).toBe("ASSIGNMENT END DATE");
    expect(workerColumnLabel("jobRole")).toBe("JOB ROLE");
    expect(workerColumnLabel("payRate")).toBe("PAY RATE");
    expect(workerColumnLabel("billRate")).toBe("BILL RATE");
    expect(workerColumnLabel("status")).toBe("STATUS");
    expect(workerColumnLabel("client")).toBe("CLIENT");
    expect(workerColumnLabel("facilities")).toBe("FACILITIES");
    expect(workerColumnLabel("profile")).toBe("");
  });

  it("returns Title Case column display labels for the Edit Columns modal", () => {
    expect(workerColumnDisplayLabel("name")).toBe("Name");
    expect(workerColumnDisplayLabel("contact")).toBe("Contact");
    expect(workerColumnDisplayLabel("assignment")).toBe("Assignment");
    expect(workerColumnDisplayLabel("startDate")).toBe("Assignment (Start Date)");
    expect(workerColumnDisplayLabel("endDate")).toBe("Assignment (End Date)");
    expect(workerColumnDisplayLabel("location")).toBe("Location (City/State)");
    expect(workerColumnDisplayLabel("billRate")).toBe("Bill Rate");
  });

  it("has full demo dataset matching Figma rows", () => {
    expect(FIGMA_DEMO_WORKERS.length).toBe(100);
    const first = FIGMA_DEMO_WORKERS[0];
    expect(first.name).toBe("Michael Anderson");
    expect(first.experience).toBe("4 yrs experience");
    expect(first.email).toBe("michael.anderson@example.com");
    expect(first.phone).toBe("(212) 555-0101");
    expect(first.jobRole).toBe("IT Project Manager");
    expect(first.jobId).toBe("demo-job-1");
    expect(first.payRate).toBe("$30/hr");
    expect(first.status).toBe("Active");
    expect(first.client).toBe("Lennox");

    const second = FIGMA_DEMO_WORKERS[1];
    expect(second.name).toBe("Jessica Williams");
    expect(second.jobRole).toBe("Oracle Fusion ERP Admin");
    expect(second.jobId).toBe("demo-job-2");

    const fifth = FIGMA_DEMO_WORKERS[4];
    expect(fifth.name).toBe("Sankeerth Kumar Eswaravaka");
    expect(fifth.client).toBe("Freddie Mac");
  });

  it("renders jobRole as a hyperlink with direct job destination or search query", () => {
    const workerWithJobId = FIGMA_DEMO_WORKERS[0];
    const cellWithJobId = renderWorkerListCell("jobRole", workerWithJobId, () => "");
    expect(cellWithJobId).toBeTruthy();

    const workerWithoutJobId = {
      ...FIGMA_DEMO_WORKERS[0],
      jobId: null,
      jobRole: "Senior Engineer",
    };
    const cellWithoutJobId = renderWorkerListCell("jobRole", workerWithoutJobId, () => "");
    expect(cellWithoutJobId).toBeTruthy();
  });

  it("renders all 30 columns without throwing an error", () => {
    const worker = FIGMA_DEMO_WORKERS[0];
    for (const opt of WORKER_COLUMN_OPTIONS) {
      const cell = renderWorkerListCell(opt.id, worker, () => "05/23/2026");
      expect(cell).toBeDefined();
    }
  });

  it("has correct Figma metric counts", () => {
    expect(FIGMA_METRIC_COUNTS.active).toBe(128);
    expect(FIGMA_METRIC_COUNTS.inactive).toBe(79);
    expect(FIGMA_METRIC_COUNTS.assigned).toBe(18);
    expect(FIGMA_METRIC_COUNTS.newlyOnboarded).toBe(25);
  });

  it("calculates active workers filters accurately", () => {
    expect(countActiveWorkersFilters(EMPTY_WORKERS_EXTENDED_FILTERS)).toBe(0);
    expect(
      countActiveWorkersFilters({
        ...EMPTY_WORKERS_EXTENDED_FILTERS,
        role: "Engineer",
        status: "Active",
        client: "Lennox",
        minPayRate: "30",
      })
    ).toBe(4);
  });
});

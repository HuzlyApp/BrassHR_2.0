import { describe, expect, it } from "vitest";
import {
  filterResumesForApplication,
  pickResumeForApplication,
} from "./pick-resume-for-application";

describe("pickResumeForApplication", () => {
  it("returns only the résumé bound to the requested application", () => {
    const rows = [
      { id: "r2", job_application_id: "app-a2", worker_id: "w1" },
      { id: "r1", job_application_id: "app-a1", worker_id: "w1" },
    ];
    expect(pickResumeForApplication(rows, "app-a1")?.id).toBe("r1");
    expect(pickResumeForApplication(rows, "app-a2")?.id).toBe("r2");
  });

  it("does not fall back to another application's résumé for the same worker", () => {
    const rows = [{ id: "r2", job_application_id: "app-a2", worker_id: "w1" }];
    expect(pickResumeForApplication(rows, "app-a1")).toBeNull();
  });
});

describe("filterResumesForApplication", () => {
  const rows = [
    { id: "r-new", job_application_id: "app-new" },
    { id: "r-profile", job_application_id: null },
    { id: "r-old", job_application_id: "app-old" },
  ];

  it("shows only the résumés bound to the current application", () => {
    expect(filterResumesForApplication(rows, "app-new").map((r) => r.id)).toEqual(["r-new"]);
  });

  it("falls back to unbound profile résumés, never another application's file", () => {
    expect(filterResumesForApplication(rows, "app-other").map((r) => r.id)).toEqual(["r-profile"]);
    expect(
      filterResumesForApplication([{ id: "r-old", job_application_id: "app-old" }], "app-new")
    ).toEqual([]);
  });

  it("returns every row when the application is unknown", () => {
    expect(filterResumesForApplication(rows, null)).toHaveLength(3);
  });
});

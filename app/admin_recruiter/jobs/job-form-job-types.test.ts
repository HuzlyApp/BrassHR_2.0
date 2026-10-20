import { describe, expect, it } from "vitest";
import {
  jobFormJobTypesInclude,
  parseJobFormJobTypes,
  serializeJobFormJobTypes,
  toggleJobFormJobType,
} from "./job-form-shared";

describe("job form employment type chips", () => {
  it("parses a single legacy value", () => {
    expect(parseJobFormJobTypes("Full-time")).toEqual(["Full-time"]);
  });

  it("normalizes Travel/Local Contract aliases", () => {
    expect(parseJobFormJobTypes("Travel contract")).toEqual(["Travel Contract"]);
    expect(parseJobFormJobTypes("local contract, Per-Diem")).toEqual([
      "Local Contract",
      "Paid-time",
    ]);
  });

  it("parses comma-separated values and drops blanks", () => {
    expect(parseJobFormJobTypes("Full-time, Part-time,  ,Permanent")).toEqual([
      "Full-time",
      "Part-time",
      "Permanent",
    ]);
  });

  it("serializes selected types in catalog order", () => {
    expect(serializeJobFormJobTypes(["Part-time", "Permanent", "Full-time"])).toBe(
      "Permanent, Full-time, Part-time"
    );
  });

  it("toggles types on and off without replacing the rest", () => {
    expect(toggleJobFormJobType("", "Full-time")).toBe("Full-time");
    expect(toggleJobFormJobType("Full-time", "Part-time")).toBe("Full-time, Part-time");
    expect(toggleJobFormJobType("Full-time, Part-time", "Full-time")).toBe("Part-time");
  });

  it("matches a filter against any selected type", () => {
    expect(jobFormJobTypesInclude("Full-time, Part-time", "Part-time")).toBe(true);
    expect(jobFormJobTypesInclude("Full-time, Part-time", "Permanent")).toBe(false);
  });
});

import type { CSSProperties } from "react";
import { applicationAiAnalysisHref } from "@/app/admin_recruiter/applications/CandidateAiAnalysisButton";
import { candidateAiAnalysisHref } from "@/app/admin_recruiter/candidates/candidate-links";
import { normalizeApplicationStatus } from "@/lib/jobs/application-status";

/** Figma Applicant Profile name — Desktop headline/H4 text-2xl, branding secondary (Brass navy). */
export const CANDIDATE_PROFILE_NAME_CLASS =
  "m-0 text-xl font-semibold leading-7 text-[color:var(--brand-secondary)] sm:text-2xl sm:leading-8";

export const CANDIDATE_PROFILE_NAME_STYLE: CSSProperties = {
  fontFamily: "Inter, var(--brand-font-heading), sans-serif",
};

export const PROFILE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "applications", label: "Applications" },
  { id: "documents", label: "Documents" },
  { id: "activity", label: "Activity" },
] as const;

export type CandidateProfileTabId = (typeof PROFILE_TABS)[number]["id"];

export function isCandidateProfileTabId(value: string | null): value is CandidateProfileTabId {
  return PROFILE_TABS.some((tab) => tab.id === value);
}

export function formatProfileApplicationDate(iso: string | null | undefined): {
  relative: string;
  absolute: string;
} {
  if (!iso) return { relative: "—", absolute: "" };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { relative: "—", absolute: "" };
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  let relative = date.toLocaleDateString("en-US", { timeZone: "America/New_York",  month: "long", day: "numeric", year: "numeric" });
  if (minutes < 1) relative = "Just now";
  else if (minutes < 60) relative = `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  else if (hours < 24) relative = `${hours} hour${hours === 1 ? "" : "s"} ago`;
  else if (days < 7) relative = `${days} day${days === 1 ? "" : "s"} ago`;
  return {
    relative,
    absolute: date.toLocaleDateString("en-US", { timeZone: "America/New_York", 
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
  };
}

export function workTypeBadgeClass(workType: string): string {
  const value = workType.trim().toUpperCase();
  if (value === "1099") return "bg-[#F3E8FF] text-[#7E22CE]";
  if (value === "W2") return "bg-[#DBEAFE] text-[#1D4ED8]";
  if (value === "CONTRACT") return "bg-[#FFEDD5] text-[#C2410C]";
  return "bg-[#F1F5F9] text-[#475569]";
}

export function profileStatusPillClass(status: string): string {
  switch (normalizeApplicationStatus(status)) {
    case "new":
    case "reviewing":
      return "bg-[#DBEAFE] text-[#1D4ED8]";
    case "shortlisted":
      return "bg-[#E0F2FE] text-[#0369A1]";
    case "interviewing":
      return "bg-[#DBEAFE] text-[#2563EB]";
    case "hired":
      return "bg-[#DCFCE7] text-[#15803D]";
    case "rejected":
      return "bg-[#FEE2E2] text-[#B91C1C]";
    case "undecided":
      return "bg-[#F1F5F9] text-[#475569]";
    case "archived":
      return "bg-[#E2E8F0] text-[#475569]";
    default:
      return "bg-[#DBEAFE] text-[#2563EB]";
  }
}

/** Recruiter help copy for the candidate-profile AI confidence ring. */
export const AI_CONFIDENCE_SCORE_TOOLTIP =
  "AI rating of how well this résumé matches the job.";

export function formatProfileActivityTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-US", { timeZone: "America/New_York",  hour: "numeric", minute: "2-digit" });
}

export function formatProfileActivityRelativeTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return formatProfileActivityTime(iso);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1day ago";
  if (days < 7) return `${days}days ago`;
  return date.toLocaleDateString("en-US", { timeZone: "America/New_York",  month: "short", day: "numeric" });
}

export function profileActivityInitial(name: string): string {
  const letter = name.trim().charAt(0);
  return letter ? letter.toUpperCase() : "?";
}

export function formatProfileActivityDay(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", { timeZone: "America/New_York", 
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function groupProfileActivityByDay<T extends { at: string }>(
  items: T[],
  now = new Date()
): Array<{ day: string; items: T[] }> {
  const groups: Array<{ day: string; items: T[] }> = [];
  const indexByDay = new Map<string, number>();
  for (const item of items) {
    const day = formatProfileActivityDay(item.at, now);
    const existing = indexByDay.get(day);
    if (existing == null) {
      indexByDay.set(day, groups.length);
      groups.push({ day, items: [item] });
    } else {
      groups[existing].items.push(item);
    }
  }
  return groups;
}

export const PROFILE_ACTIVITY_RANGE_PRESETS = [
  { id: "last_3_days", label: "Last 3 days" },
  { id: "last_1_day", label: "Last 1 day" },
  { id: "last_2_days", label: "Last 2 days" },
  { id: "last_5_days", label: "Last 5 days" },
  { id: "last_7_days", label: "Last 7 days" },
  { id: "last_week", label: "Last week" },
  { id: "last_month", label: "Last month" },
  { id: "last_year", label: "Last year" },
  { id: "custom", label: "Specific dates" },
] as const;

export type ProfileActivityRangeId = (typeof PROFILE_ACTIVITY_RANGE_PRESETS)[number]["id"];

export const DEFAULT_PROFILE_ACTIVITY_RANGE: ProfileActivityRangeId = "last_3_days";

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function endOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

function addLocalDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function parseLocalDateInput(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function mondayOfWeek(value: Date): Date {
  const start = startOfLocalDay(value);
  const weekday = start.getDay();
  const offset = weekday === 0 ? 6 : weekday - 1;
  return addLocalDays(start, -offset);
}

export function profileActivityRangeBounds(
  rangeId: ProfileActivityRangeId,
  now = new Date(),
  customFrom?: string | null,
  customTo?: string | null
): { start: Date; end: Date } | null {
  if (rangeId === "custom") {
    const from = parseLocalDateInput(customFrom);
    const to = parseLocalDateInput(customTo);
    if (!from || !to) return null;
    if (from.getTime() <= to.getTime()) {
      return { start: startOfLocalDay(from), end: endOfLocalDay(to) };
    }
    return { start: startOfLocalDay(to), end: endOfLocalDay(from) };
  }

  if (rangeId === "last_week") {
    const thisMonday = mondayOfWeek(now);
    return {
      start: addLocalDays(thisMonday, -7),
      end: endOfLocalDay(addLocalDays(thisMonday, -1)),
    };
  }

  if (rangeId === "last_month") {
    const firstThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: endOfLocalDay(addLocalDays(firstThisMonth, -1)),
    };
  }

  if (rangeId === "last_year") {
    return {
      start: new Date(now.getFullYear() - 1, 0, 1),
      end: endOfLocalDay(new Date(now.getFullYear() - 1, 11, 31)),
    };
  }

  const daysByRange: Record<Exclude<ProfileActivityRangeId, "custom" | "last_week" | "last_month" | "last_year">, number> = {
    last_1_day: 1,
    last_2_days: 2,
    last_3_days: 3,
    last_5_days: 5,
    last_7_days: 7,
  };

  const days = daysByRange[rangeId];
  return {
    start: startOfLocalDay(addLocalDays(now, -(days - 1))),
    end: endOfLocalDay(now),
  };
}

export function filterProfileActivityByRange<T extends { at: string }>(
  items: T[],
  rangeId: ProfileActivityRangeId,
  now = new Date(),
  customFrom?: string | null,
  customTo?: string | null
): T[] {
  const bounds = profileActivityRangeBounds(rangeId, now, customFrom, customTo);
  if (!bounds) return [];
  const startMs = bounds.start.getTime();
  const endMs = bounds.end.getTime();
  return items.filter((item) => {
    const at = new Date(item.at).getTime();
    return Number.isFinite(at) && at >= startMs && at <= endMs;
  });
}

export function isProfileActivityRangeId(value: string): value is ProfileActivityRangeId {
  return PROFILE_ACTIVITY_RANGE_PRESETS.some((preset) => preset.id === value);
}

const PROFESSIONAL_SUMMARY_SECTIONS = new Set([
  "additional information",
  "awards",
  "certifications",
  "education",
  "employment",
  "employment history",
  "experience",
  "languages",
  "licenses",
  "objective",
  "professional summary",
  "profile",
  "projects",
  "references",
  "skills",
  "summary",
  "volunteer",
  "work experience",
  "work history",
]);

const EMAIL_LINE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const PHONE_LINE_RE = /^\+?[\d][\d\s().-]{8,}\d$/;
const DATE_RANGE_RE =
  /^(?:[A-Za-z]{3,9}\.?\s+\d{4}|\d{1,2}\/\d{4})\s+(?:to|-|–|—)\s+(?:present|[A-Za-z]{3,9}\.?\s+\d{4}|\d{1,2}\/\d{4})$/i;
const LOCATION_LINE_RE = /^[A-Za-z .'-]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/;
const TAG_LINE_RE = /^#[A-Za-z0-9_-]+$/;

function normalizeSummaryHeadingKey(line: string): string {
  return line.trim().replace(/[:：]+$/, "").replace(/\s+/g, " ").toLowerCase();
}

export function isProfessionalSummaryEmail(line: string): boolean {
  return EMAIL_LINE_RE.test(line.trim());
}

export function isProfessionalSummaryPhone(line: string): boolean {
  const trimmed = line.trim();
  if (!PHONE_LINE_RE.test(trimmed)) return false;
  return trimmed.replace(/\D/g, "").length >= 10;
}

export function isProfessionalSummaryDate(line: string): boolean {
  return DATE_RANGE_RE.test(line.trim().replace(/\s+/g, " "));
}

export function isProfessionalSummaryHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 4 || trimmed.length > 80) return false;
  if (PROFESSIONAL_SUMMARY_SECTIONS.has(normalizeSummaryHeadingKey(trimmed))) return true;
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (letters.length < 3) return false;
  const uppercase = letters.replace(/[^A-Z]/g, "").length;
  return uppercase / letters.length >= 0.82;
}

export type ProfessionalSummaryBlockKind =
  | "name"
  | "location"
  | "email"
  | "phone"
  | "heading"
  | "jobTitle"
  | "company"
  | "date"
  | "tag"
  | "body";

export type ProfessionalSummaryBlock = {
  kind: ProfessionalSummaryBlockKind;
  text: string;
};

function nextNonEmptyLines(lines: string[], from: number): [string, string] {
  const found: string[] = [];
  for (let index = from; index < lines.length && found.length < 2; index += 1) {
    const value = lines[index]?.trim() ?? "";
    if (value) found.push(value);
  }
  return [found[0] ?? "", found[1] ?? ""];
}

function classifyResumeLine(
  line: string,
  nextLine: string,
  nextNextLine: string,
  sawHeading: boolean
): ProfessionalSummaryBlockKind {
  if (isProfessionalSummaryEmail(line)) return "email";
  if (isProfessionalSummaryPhone(line)) return "phone";
  if (isProfessionalSummaryHeading(line)) return "heading";
  if (TAG_LINE_RE.test(line)) return "tag";
  if (isProfessionalSummaryDate(line)) return "date";
  if (!sawHeading && LOCATION_LINE_RE.test(line)) return "location";
  if (isProfessionalSummaryDate(nextNextLine)) return "jobTitle";
  if (isProfessionalSummaryDate(nextLine)) return "company";
  return "body";
}

export function splitProfessionalSummaryBlocks(text: string): ProfessionalSummaryBlock[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ProfessionalSummaryBlock[] = [];
  let sawHeading = false;
  let named = false;

  for (let index = 0; index < lines.length; index += 1) {
    const textLine = lines[index]?.trim() ?? "";
    if (!textLine) continue;

    const [nextLine, nextNextLine] = nextNonEmptyLines(lines, index + 1);
    let kind = classifyResumeLine(textLine, nextLine, nextNextLine, sawHeading);

    if (!sawHeading && !named && kind === "body") {
      kind = "name";
      named = true;
    }
    if (kind === "heading") sawHeading = true;

    blocks.push({ kind, text: textLine });
  }

  return blocks;
}

export function profileActivityKind(title: string): "view" | "job" | "document" | "note" | "other" {
  const value = title.toLowerCase();
  if (value.includes("view") || value.includes("profile")) return "view";
  if (value.includes("document") || value.includes("resume") || value.includes("upload")) return "document";
  if (value.includes("note") || value.includes("status")) return "note";
  if (value.includes("job") || value.includes("applied") || value.includes("application")) return "job";
  return "other";
}

export function overallStatusBadgeClass(status: string): string {
  const value = status.trim().toLowerCase();
  if (value === "hired") return "bg-[#DCFCE7] text-[#15803D]";
  if (value === "closed" || value === "rejected") return "bg-[#FEE2E2] text-[#B91C1C]";
  return "bg-[#FFEDD5] text-[#C2410C]";
}

export function resumeIconType(
  fileName: string,
  fileType: string | null | undefined
): "pdf" | "jpeg" | "docx" {
  const lower = `${fileName} ${fileType ?? ""}`.toLowerCase();
  if (lower.includes("jpeg") || lower.includes("jpg") || lower.includes("png")) return "jpeg";
  if (
    lower.includes("wordprocessingml") ||
    lower.includes("msword") ||
    /\.docx?\b/.test(lower)
  ) {
    return "docx";
  }
  return "pdf";
}

export function applicationReviewHref(applicationId: string, jobId?: string | null) {
  const params = new URLSearchParams({ applicationId });
  if (jobId?.trim()) params.set("jobId", jobId.trim());
  return `/admin_recruiter/applications/review?${params.toString()}`;
}

export function profileAiAnalysisHref(input: {
  workerId: string;
  applicationId?: string | null;
  jobId?: string | null;
}) {
  if (input.applicationId?.trim()) {
    return applicationAiAnalysisHref(input.applicationId.trim(), input.jobId || undefined);
  }
  return candidateAiAnalysisHref(input.workerId);
}

export function profileCandidatesBackHref(input: {
  from?: string | null;
  jobId?: string | null;
  workerId?: string | null;
}) {
  if (input.from === "messages") {
    const workerId = input.workerId?.trim();
    return workerId
      ? `/admin_recruiter/messages/${encodeURIComponent(workerId)}`
      : "/admin_recruiter/messages";
  }
  if (input.from === "applications") {
    const jobId = input.jobId?.trim();
    return jobId
      ? `/admin_recruiter/applications?jobId=${encodeURIComponent(jobId)}`
      : "/admin_recruiter/applications";
  }
  return "/admin_recruiter/candidates";
}

import {
  applicationCurrentStageMeta,
  applicationStatusLabel,
  normalizeApplicationStatus,
} from "@/lib/jobs/application-status";
import { formatMatchCategory, isStrongAiMatchScore } from "@/lib/jobs/match-analysis/display";
import { isConvertedPipelineStatus } from "@/lib/workers/candidate-status-label";

export type CandidateProfileResume = {
  id: string;
  fileName: string;
  fileSizeLabel: string;
  fileType: string | null;
  jobApplicationId?: string | null;
};

export type CandidateProfileApplication = {
  id: string;
  jobRequisitionId: string;
  jobTitle: string;
  companyName: string;
  workType: string;
  appliedAt: string;
  status: string;
  statusName: string;
  statusColor: string | null;
  statusGroupName?: string | null;
  statusGroupDescription?: string | null;
  statusGroupSortOrder?: number | null;
  statusNote: string | null;
  matchScore: number | null;
  matchCategory: string | null;
  matchStatus: string | null;
  resume?: CandidateProfileResume | null;
};

export type CandidateProfileDocument = {
  id: string;
  title: string;
  fileName: string;
  kind: "resume" | "document";
  uploadedAt: string;
  uploadedAtLabel: string;
  uploadedByName: string;
  uploadedByRoleLabel: "Admin" | "Worker" | "";
};

export type CandidateProfileSubmittedResume = {
  id: string;
  fileName: string;
  fileSizeLabel: string;
  fileType: string | null;
  parsingStatus: "pending" | "processing" | "completed" | "failed";
  uploadedAt: string;
  uploadedAtLabel: string;
  isReuploaded: boolean;
  jobApplicationId: string | null;
  jobTitle: string | null;
  uploadedByName: string;
  uploadedByRoleLabel: "Admin" | "Worker" | "";
};

export type CandidateProfileActivity = {
  id: string;
  at: string;
  title: string;
  detail: string;
};

export type CandidateMatchSummary = {
  applicationId: string;
  jobRequisitionId: string;
  score: number;
  category: string | null;
  label: string;
};

export type ProfileSummarySlice = {
  key: string;
  label: string;
  count: number;
  color: string;
};

export type CandidateProfilePayload = {
  candidate: {
    id: string;
    name: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    location: string;
    role: string;
    status: string;
    statusLabel: string;
    isActiveApplicant: boolean;
    profilePhotoUrl: string | null;
    yearsExperience: number | null;
  };
  stats: {
    totalApplications: number;
    w2Applications: number;
    contractor1099Applications: number;
    overallStatus: string;
  };
  match: CandidateMatchSummary | null;
  applications: CandidateProfileApplication[];
  workTypeSummary: ProfileSummarySlice[];
  statusSummary: ProfileSummarySlice[];
  smartInsight: string;
  professionalSummary: string;
  resumes: CandidateProfileSubmittedResume[];
  documents: CandidateProfileDocument[];
  activity: CandidateProfileActivity[];
};

const WORK_TYPE_COLORS: Record<string, string> = {
  W2: "#1D4ED8",
  "1099": "#7E22CE",
  CONTRACT: "#EA580C",
};

const STATUS_SLICE_COLORS: Record<string, string> = {
  new: "#60A5FA",
  reviewing: "#3B82F6",
  shortlisted: "#F59E0B",
  interviewing: "#8B5CF6",
  hired: "#14B8A6",
  rejected: "#F43F5E",
  undecided: "#94A3B8",
  archived: "#64748B",
};

export function formatCandidateLocation(parts: {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string {
  const line = [parts.address1, parts.address2].map((value) => value?.trim()).filter(Boolean);
  const cityState = [parts.city, parts.state].map((value) => value?.trim()).filter(Boolean).join(", ");
  const zip = parts.zip?.trim() || "";
  return [...line, [cityState, zip].filter(Boolean).join(" ")].filter(Boolean).join(" ");
}

export function normalizeWorkType(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export function workTypeLabel(value: string | null | undefined): string {
  const normalized = normalizeWorkType(value);
  if (normalized === "W2") return "W2";
  if (normalized === "1099") return "1099";
  if (normalized === "CONTRACT") return "Contract";
  return value?.trim() || "—";
}

export function workTypeSummaryLabel(value: string): string {
  const normalized = normalizeWorkType(value);
  if (normalized === "W2") return "W-2 (Employee)";
  if (normalized === "1099") return "1099 (Independent Contractor)";
  if (normalized === "CONTRACT") return "Contract";
  return value;
}

export function countWorkTypes(applications: Array<{ workType: string }>): {
  total: number;
  w2: number;
  contractor1099: number;
  contract: number;
} {
  let w2 = 0;
  let contractor1099 = 0;
  let contract = 0;
  for (const row of applications) {
    const type = normalizeWorkType(row.workType);
    if (type === "W2") w2 += 1;
    else if (type === "1099") contractor1099 += 1;
    else if (type === "CONTRACT") contract += 1;
  }
  return { total: applications.length, w2, contractor1099, contract };
}

export function summarizeWorkTypes(
  applications: Array<{ workType: string }>
): ProfileSummarySlice[] {
  const counts = new Map<string, number>();
  for (const row of applications) {
    const key = normalizeWorkType(row.workType) || "OTHER";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({
      key,
      label: workTypeSummaryLabel(key === "OTHER" ? "Other" : key),
      count,
      color: WORK_TYPE_COLORS[key] ?? "#94A3B8",
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function summarizeApplicationStatuses(
  applications: Array<{ status: string; statusName: string; statusColor?: string | null }>
): ProfileSummarySlice[] {
  const byKey = new Map<
    string,
    { label: string; count: number; color: string }
  >();
  for (const row of applications) {
    const key = normalizeApplicationStatus(row.status);
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    byKey.set(key, {
      label: row.statusName.trim() || applicationStatusLabel(row.status),
      count: 1,
      color: row.statusColor?.trim() || STATUS_SLICE_COLORS[key] || "#94A3B8",
    });
  }
  return Array.from(byKey.entries())
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function resolveOverallApplicationStatus(
  applications: Array<{ status: string; statusName: string }>
): string {
  if (applications.length === 0) return "—";
  const keys = applications.map((row) => normalizeApplicationStatus(row.status));
  if (keys.every((status) => status === "hired")) {
    const names = applications.map((row) => row.statusName.trim()).filter(Boolean);
    return names[0] || applicationCurrentStageMeta("hired").label;
  }
  if (keys.every((status) => status === "rejected" || status === "archived")) {
    return "Closed";
  }
  if (keys.some((status) => status === "interviewing" || status === "shortlisted" || status === "reviewing" || status === "new")) {
    return "In Progress";
  }
  return applications[0]?.statusName?.trim() || applicationCurrentStageMeta(applications[0]?.status ?? "").label;
}

export function isActiveApplicant(
  workerStatus: string | null | undefined,
  applications: Array<{ status: string }>
): boolean {
  if (isConvertedPipelineStatus(workerStatus)) return false;
  return applications.some((row) => {
    const status = normalizeApplicationStatus(row.status);
    return status !== "rejected" && status !== "archived";
  });
}

export function pickBestMatch(
  applications: CandidateProfileApplication[]
): CandidateMatchSummary | null {
  const scored = applications
    .filter((row) => row.matchScore != null && Number.isFinite(row.matchScore))
    .sort((a, b) => Number(b.matchScore) - Number(a.matchScore));
  const best = scored[0];
  if (!best || best.matchScore == null) return null;
  return {
    applicationId: best.id,
    jobRequisitionId: best.jobRequisitionId,
    score: Math.round(best.matchScore),
    category: best.matchCategory,
    label: isStrongAiMatchScore(best.matchScore)
      ? "Strong Match"
      : formatMatchCategory(best.matchCategory),
  };
}

export function buildSmartInsight(input: {
  firstName: string;
  workTypes: { w2: number; contractor1099: number; contract: number; total: number };
  match: CandidateMatchSummary | null;
}): string {
  const name = input.firstName.trim() || "This candidate";
  const { w2, contractor1099, total } = input.workTypes;
  const parts: string[] = [];

  if (total === 0) {
    return `${name} has not applied to any jobs yet.`;
  }

  if (w2 > 0 && contractor1099 > 0) {
    parts.push(
      `${name} has a strong interest in both employee and contractor opportunities.`
    );
  } else if (w2 > 0) {
    parts.push(`${name} is primarily applying to W-2 employee roles.`);
  } else if (contractor1099 > 0) {
    parts.push(`${name} is primarily applying to 1099 contractor roles.`);
  } else {
    parts.push(`${name} has applied to ${total} ${total === 1 ? "role" : "roles"}.`);
  }

  if (input.match && isStrongAiMatchScore(input.match.score)) {
    parts.push("Consider fast-tracking high match roles.");
  } else if (input.match) {
    parts.push("Review the AI analysis before advancing the strongest applications.");
  }

  return parts.join(" ");
}

export function resumeTextFromParsedRow(row: {
  extracted_text?: string | null;
  parsed_data?: unknown;
}): string {
  const extracted = typeof row.extracted_text === "string" ? row.extracted_text.trim() : "";
  if (extracted) return extracted;
  const parsed = row.parsed_data;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const text = (parsed as { text?: unknown }).text;
    if (typeof text === "string" && text.trim()) return text.trim();
  }
  return "";
}

export function pickProfessionalSummaryText(
  rows: Array<{
    extracted_text?: string | null;
    parsed_data?: unknown;
    parsing_status?: string | null;
    parse_status?: string | null;
    uploaded_at?: string | null;
  }>
): string {
  const ordered = [...rows].sort((a, b) =>
    String(b.uploaded_at ?? "").localeCompare(String(a.uploaded_at ?? ""))
  );
  const withText = ordered
    .map((row) => ({
      text: resumeTextFromParsedRow(row),
      completed:
        (row.parse_status || row.parsing_status || "").trim().toLowerCase() === "completed",
    }))
    .filter((row) => row.text);
  return withText.find((row) => row.completed)?.text || withText[0]?.text || "";
}

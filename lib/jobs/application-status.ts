/** Recruiting pipeline statuses for job applications (candidates listing + detail). */

export const APPLICATION_PIPELINE_STATUSES = [
  "new",
  "reviewing",
  "interviewing",
  "rejected",
  "hired",
  "shortlisted",
  "undecided",
  "archived",
] as const;

export type ApplicationPipelineStatus = (typeof APPLICATION_PIPELINE_STATUSES)[number];

export type ApplicationStatusTab =
  | "all"
  | ApplicationPipelineStatus;

export const APPLICATION_STATUS_TABS: Array<{ id: ApplicationStatusTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "new", label: "New / Not Contacted" },
  { id: "reviewing", label: "Screening Complete" },
  { id: "interviewing", label: "Interview Scheduled" },
  { id: "rejected", label: "Not a Fit" },
  { id: "hired", label: "Selected by Client" },
  { id: "shortlisted", label: "Qualified – Ready for Interview" },
  { id: "undecided", label: "Fit for Future Roles" },
  { id: "archived", label: "Position Closed" },
];

/** Dropdown options for candidate detail status (excludes All). */
export const APPLICATION_STATUS_OPTIONS = APPLICATION_STATUS_TABS.filter(
  (tab): tab is { id: ApplicationPipelineStatus; label: string } => tab.id !== "all"
);

export function normalizeApplicationStatus(status: string): ApplicationPipelineStatus {
  switch (status) {
    case "submitted":
      return "new";
    case "in_progress":
      return "reviewing";
    case "withdrawn":
      return "undecided";
    case "new":
    case "reviewing":
    case "interviewing":
    case "rejected":
    case "hired":
    case "shortlisted":
    case "undecided":
    case "archived":
      return status;
    default:
      return "reviewing";
  }
}

export function applicationStatusLabel(status: string): string {
  const normalized = normalizeApplicationStatus(status);
  return APPLICATION_STATUS_OPTIONS.find((option) => option.id === normalized)?.label ?? normalized;
}

export function applicationCurrentStageMeta(
  status: string,
  displayName?: string | null
): {
  label: string;
  subtitle: string;
  progress: number;
  barColor: string;
} {
  const named = displayName?.trim() || "";
  let meta: { label: string; subtitle: string; progress: number; barColor: string };
  switch (normalizeApplicationStatus(status)) {
    case "new":
      meta = { label: "Reviewing", subtitle: "New application", progress: 15, barColor: "#3B82F6" };
      break;
    case "reviewing":
      meta = { label: "Reviewing", subtitle: "Initial Screening", progress: 25, barColor: "#3B82F6" };
      break;
    case "shortlisted":
      meta = { label: "Shortlisted", subtitle: "Skills Assessment", progress: 45, barColor: "#F59E0B" };
      break;
    case "interviewing":
      meta = { label: "Interviewing", subtitle: "HR Interview", progress: 70, barColor: "#8B5CF6" };
      break;
    case "hired":
      // system_key "hired" is the client-selection status, not an employment hire.
      meta = {
        label: applicationStatusLabel("hired"),
        subtitle: "Client selected",
        progress: 100,
        barColor: "#14B8A6",
      };
      break;
    case "undecided":
      meta = { label: "Undecided", subtitle: "Keep as possible", progress: 40, barColor: "#64748B" };
      break;
    case "rejected":
      meta = { label: "Rejected", subtitle: "Not pursuing", progress: 15, barColor: "#EF4444" };
      break;
    case "archived":
      meta = { label: "Archived", subtitle: "Closed", progress: 100, barColor: "#94A3B8" };
      break;
    default:
      meta = { label: "Reviewing", subtitle: "Initial Screening", progress: 25, barColor: "#3B82F6" };
  }

  if (!named) return meta;
  const namedLower = named.toLowerCase();
  const hidePipelineSubtitle =
    normalizeApplicationStatus(status) === "hired" ||
    namedLower === meta.label.toLowerCase() ||
    namedLower === meta.subtitle.toLowerCase();
  return { ...meta, label: named, subtitle: hidePipelineSubtitle ? "" : meta.subtitle };
}

/** Colored status dot — same pattern as jobs list / job details status UI. */
export function applicationStatusDotClassName(status: string): string {
  switch (normalizeApplicationStatus(status)) {
    case "new":
      return "bg-[#3B82F6]";
    case "reviewing":
      return "bg-[#F59E0B]";
    case "shortlisted":
      return "bg-[#22C55E]";
    case "interviewing":
      return "bg-[#8B5CF6]";
    case "hired":
      return "bg-[#16A34A]";
    case "rejected":
      return "bg-[#EF4444]";
    case "undecided":
      return "bg-[#94A3B8]";
    case "archived":
      return "bg-[#64748B]";
    default:
      return "bg-[#94A3B8]";
  }
}

/** Outlined pill (legacy). Prefer list cell: surface + colored dot + label. */
export function applicationStatusBadgeClassName(status: string): string {
  const normalized = normalizeApplicationStatus(status);
  const base =
    "inline-flex items-center justify-center whitespace-nowrap rounded-full border bg-white px-3 py-0.5 text-xs font-medium";

  if (normalized === "new") {
    return `${base} border-[color:var(--brand-secondary)] text-[color:var(--brand-secondary)]`;
  }

  return `${base} border-[#CBD5E1] text-[#475569]`;
}

export function isApplicationPipelineStatus(value: string): value is ApplicationPipelineStatus {
  return (APPLICATION_PIPELINE_STATUSES as readonly string[]).includes(value);
}

export function isArchivedApplicationStatus(
  status: string | null | undefined,
  systemKey?: string | null
): boolean {
  if (systemKey === "archived") return true;
  return String(status ?? "").trim().toLowerCase() === "archived";
}

/**
 * Statuses omitted from job candidate lists and job-card CAND counts.
 * Rejected/withdrawn rows stay in the table so the same person can re-apply
 * (partial unique indexes exclude these statuses).
 */
export const JOB_CANDIDATE_LIST_HIDDEN_STATUSES = ["rejected", "withdrawn"] as const;

/** PostgREST `.not("status", "in", ...)` value for {@link JOB_CANDIDATE_LIST_HIDDEN_STATUSES}. */
export const JOB_CANDIDATE_LIST_HIDDEN_STATUS_IN_FILTER = '("rejected","withdrawn")';

export function isHiddenFromJobCandidateList(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return (JOB_CANDIDATE_LIST_HIDDEN_STATUSES as readonly string[]).includes(normalized);
}

export function matchesApplicationStatusTab(
  status: string,
  tab: ApplicationStatusTab
): boolean {
  if (tab === "all") return true;
  return normalizeApplicationStatus(status) === tab;
}

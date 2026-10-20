/**
 * Pre-Hire Status Catalog groups.
 * Keep `defaultStatusGroupKey` aligned with
 * `public.application_status_default_group_key` in the status-groups migration.
 *
 * Grouping is display/organization only. It never changes a status id or system key.
 * Selecting a status does not auto-advance hire-journey stages (Intake…Approvals).
 * Post-Hire unlock remains keyed to system_key = 'hired' only.
 *
 * Closed is a shared disposition group: its statuses stay available from every
 * Pre-Hire stage without assigning them stage-by-stage.
 */

export const APPLICATION_STATUS_GROUP_KEYS = [
  "start",
  "interview",
  "msp",
  "client",
  "hire",
  "closed",
] as const;

export type ApplicationStatusGroupKey = (typeof APPLICATION_STATUS_GROUP_KEYS)[number];

/** Closed statuses are offered beside every stage-specific group. */
export const SHARED_CLOSED_STATUS_GROUP_KEY = "closed" as const;

export const DEFAULT_APPLICATION_STATUS_GROUPS: Array<{
  systemKey: ApplicationStatusGroupKey;
  name: string;
  description: string;
  sortOrder: number;
  shared?: boolean;
}> = [
  {
    systemKey: "start",
    name: "Start",
    description: "New / Applied, Attempted Contact, Follow up, Follow-up Needed, Unreachable",
    sortOrder: 0,
  },
  {
    systemKey: "interview",
    name: "Interview",
    description: "Screening Complete, Interview Scheduled, Qualified",
    sortOrder: 1,
  },
  {
    systemKey: "msp",
    name: "MSP",
    description: "Profile Ready, Submitted to MSP, Approved by MSP",
    sortOrder: 2,
  },
  {
    systemKey: "client",
    name: "Client",
    description: "Presented to Client, Selected by Client",
    sortOrder: 3,
  },
  {
    systemKey: "hire",
    name: "Hire",
    description:
      "Selected. Placement acceptance / Post-Hire unlock stays on Selected by Client (hired).",
    sortOrder: 4,
  },
  {
    systemKey: "closed",
    name: "Closed",
    description:
      "Shared closing outcomes available from every Pre-Hire stage: Not a Fit, Talent Pool, Withdraw, Rejected by MSP, Rejected by Client",
    sortOrder: 5,
    shared: true,
  },
];

/** Informational map: status catalog group → related Pre-Hire workflow stages. */
export const STATUS_GROUP_PRE_HIRE_STAGES: Record<
  Exclude<ApplicationStatusGroupKey, "closed">,
  string[]
> = {
  start: ["Intake"],
  interview: ["Screening", "Interview"],
  msp: ["Submission"],
  client: ["Submission", "Approvals"],
  hire: ["Offer & Agreement", "Approvals"],
};

const START_NAMES = new Set([
  "new / applied",
  "new / not contacted",
  "new",
  "attempted contact",
  "follow-up needed",
  "follow up needed",
  "follow up",
  "follow-up",
  "unreachable",
  "callback - not available",
]);

const INTERVIEW_NAMES = new Set([
  "screening complete",
  "initial screening complete",
  "interview scheduled",
  "interview complete",
  "interviewing",
  "qualified",
  "qualified - ready for interview",
  "qualified-ready for 2nd interview",
  "ai assessed",
]);

const MSP_NAMES = new Set([
  "profile ready",
  "profile uploaded",
  "submitted to msp",
  "submitted for msp review",
  "approved by msp",
]);

const CLIENT_NAMES = new Set([
  "presented to client",
  "selected by client",
  "selected by msp client",
  "client interview",
  "candidate selected",
]);

const HIRE_NAMES = new Set(["selected", "offer/agreement", "offer / agreement"]);

const CLOSED_NAMES = new Set([
  "not a fit",
  "disqualified / not a fit",
  "talent pool",
  "fit for future roles",
  "withdraw",
  "candidate withdrew",
  "rejected by msp",
  "rejected by client",
  "rejected after interview",
  "rejected after 2nd interview",
  "rejected at msp screening",
  "position closed",
  "candidate rejected",
  "archived",
  "rejected",
  "undecided",
]);

export function normalizeStatusCatalogName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ");
}

export function isSharedClosedGroupKey(systemKey: string | null | undefined): boolean {
  return (systemKey ?? "").trim().toLowerCase() === SHARED_CLOSED_STATUS_GROUP_KEY;
}

/** Follow up is an Exception choice on every Pre-Hire stage and AI analysis step. */
export function isSharedFollowUpStatusName(name: string | null | undefined): boolean {
  const normalized = normalizeStatusCatalogName(name ?? "");
  return normalized === "follow up" || normalized === "follow-up";
}

/**
 * Suggested group for a status. System keys win so workflow behavior
 * (hired, archived, rejected, and so on) is not reassigned by display name.
 * Returns null when the status should stay ungrouped for an admin to place.
 */
export function defaultStatusGroupKey(
  name: string,
  systemKey: string | null | undefined
): ApplicationStatusGroupKey | null {
  const key = (systemKey ?? "").trim().toLowerCase();
  if (key === "new") return "start";
  if (key === "reviewing" || key === "shortlisted" || key === "interviewing") return "interview";
  // Display group only — Post-Hire / archive / reject behavior still uses system_key.
  if (key === "hired") return "client";
  if (key === "rejected" || key === "undecided" || key === "withdrawn" || key === "archived") {
    return "closed";
  }

  const normalized = normalizeStatusCatalogName(name);
  if (!normalized) return null;
  if (START_NAMES.has(normalized)) return "start";
  if (INTERVIEW_NAMES.has(normalized) || normalized.startsWith("qualified")) return "interview";
  if (
    MSP_NAMES.has(normalized) ||
    normalized.includes("submitted to msp") ||
    normalized.includes("submitted for msp")
  ) {
    return "msp";
  }
  if (CLIENT_NAMES.has(normalized)) return "client";
  if (HIRE_NAMES.has(normalized)) return "hire";
  if (
    CLOSED_NAMES.has(normalized) ||
    normalized.startsWith("rejected") ||
    normalized.includes("not a fit")
  ) {
    return "closed";
  }
  return null;
}

export type GroupableStatus = {
  id: string;
  name: string;
  sortOrder?: number;
  groupId?: string | null;
  groupName?: string | null;
  groupDescription?: string | null;
  groupSortOrder?: number | null;
  groupSystemKey?: string | null;
};

export type StatusGroupSection<T> = {
  key: string;
  id: string | null;
  name: string;
  description: string | null;
  sortOrder: number;
  systemKey: string | null;
  shared: boolean;
  statuses: T[];
};

export function groupStatuses<T extends GroupableStatus>(items: T[]): StatusGroupSection<T>[] {
  const buckets = new Map<string, StatusGroupSection<T>>();

  for (const item of items) {
    const groupName = item.groupName?.trim() || "";
    const grouped = Boolean(item.groupId || groupName);
    const key = item.groupId || (groupName ? `name:${groupName.toLowerCase()}` : "ungrouped");
    let section = buckets.get(key);
    if (!section) {
      const systemKey = item.groupSystemKey?.trim() || null;
      section = {
        key,
        id: item.groupId ?? null,
        name: grouped ? groupName || "Group" : "Ungrouped",
        description: grouped ? item.groupDescription ?? null : null,
        sortOrder: grouped ? item.groupSortOrder ?? 0 : 10_000,
        systemKey,
        shared: isSharedClosedGroupKey(systemKey) || groupName.toLowerCase() === "closed",
        statuses: [],
      };
      buckets.set(key, section);
    }
    section.statuses.push(item);
  }

  const sections = [...buckets.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  );
  for (const section of sections) {
    section.statuses.sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)
    );
  }
  return sections;
}

export type GroupedSelectOption = {
  value: string;
  label: string;
  sortOrder?: number;
  groupName?: string | null;
  groupDescription?: string | null;
  groupSortOrder?: number | null;
  groupSystemKey?: string | null;
};

export function groupSelectOptions(options: GroupedSelectOption[]): StatusGroupSection<
  GroupedSelectOption & GroupableStatus
>[] {
  return groupStatuses(
    options.map((option, index) => ({
      ...option,
      id: option.value,
      name: option.label,
      sortOrder: option.sortOrder ?? index,
      groupId: option.groupName?.trim() ? option.groupName.trim() : null,
      groupName: option.groupName?.trim() || null,
      groupDescription: option.groupDescription ?? null,
      groupSortOrder: option.groupSortOrder ?? null,
      groupSystemKey: option.groupSystemKey ?? null,
    }))
  );
}

export function readStatusGroupFields(row: Record<string, unknown>): {
  groupId: string | null;
  groupName: string | null;
  groupDescription: string | null;
  groupSortOrder: number | null;
  groupSystemKey: string | null;
} {
  const sort = Number(row.groupSortOrder);
  return {
    groupId: typeof row.groupId === "string" && row.groupId.trim() ? row.groupId : null,
    groupName: typeof row.groupName === "string" && row.groupName.trim() ? row.groupName : null,
    groupDescription: typeof row.groupDescription === "string" ? row.groupDescription : null,
    groupSortOrder: Number.isFinite(sort) ? sort : null,
    groupSystemKey:
      typeof row.groupSystemKey === "string" && row.groupSystemKey.trim()
        ? row.groupSystemKey
        : null,
  };
}

export function formatGroupStatusSummary(names: string[], limit = 4): string {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  if (clean.length === 0) return "No statuses";
  if (clean.length <= limit) return clean.join(", ");
  return `${clean.slice(0, limit).join(", ")} +${clean.length - limit} more`;
}

/** Label for Closed in pickers so recruiters see it as always available. */
export function closedGroupPickerLabel(name: string): string {
  const trimmed = name.trim() || "Closed";
  return trimmed.toLowerCase().includes("shared") ? trimmed : `${trimmed} (always available)`;
}

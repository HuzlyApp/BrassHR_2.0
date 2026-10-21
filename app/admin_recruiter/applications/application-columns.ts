export type ApplicationColumnId =
  | "candidates"
  | "contact"
  | "clientName"
  | "matches"
  | "fit"
  | "conf"
  | "verify"
  | "notMet"
  | "location"
  | "activity"
  | "currentStage"
  | "assignee"
  | "status"
  | "interest"
  | "email"
  | "workflow"
  | "dateApplied"
  | "evaluation"
  | "actions";

export const APPLICATION_COLUMN_OPTIONS: { id: ApplicationColumnId; label: string }[] = [
  { id: "candidates", label: "Candidate" },
  { id: "contact", label: "Contact" },
  { id: "clientName", label: "Client Name" },
  { id: "matches", label: "Match %" },
  { id: "fit", label: "Fit" },
  { id: "conf", label: "Conf." },
  { id: "verify", label: "Verify" },
  { id: "notMet", label: "Not Met" },
  { id: "location", label: "Location" },
  { id: "activity", label: "Activity" },
  { id: "currentStage", label: "Current Stage" },
  { id: "assignee", label: "Assignee" },
  { id: "status", label: "Progress Status" },
  { id: "interest", label: "Interest" },
  { id: "email", label: "Email" },
  { id: "workflow", label: "Workflow" },
  { id: "dateApplied", label: "Application Date" },
  { id: "evaluation", label: "Evaluation" },
  { id: "actions", label: "Actions" },
];

/** Actions stays pinned on the right and is not hideable from Edit Columns. */
export const APPLICATION_EDITABLE_COLUMNS = APPLICATION_COLUMN_OPTIONS.filter(
  (column) => column.id !== "actions"
);

export const DEFAULT_APPLICATION_COLUMNS: ApplicationColumnId[] = [
  "candidates",
  "contact",
  "clientName",
  "fit",
  "conf",
  "verify",
  "notMet",
  "currentStage",
  "dateApplied",
  "evaluation",
  "assignee",
  "actions",
];

const STORAGE_KEY = "nexus-job-applications-list-columns-v7";
const PREVIOUS_STORAGE_KEY = "nexus-job-applications-list-columns-v6";

/** Progress Status left the default All candidates table; older saved layouts still listed it. */
export function withoutRetiredProgressStatusColumn(
  order: ApplicationColumnId[]
): ApplicationColumnId[] {
  return order.filter((id) => id !== "status");
}

function insertAfter(
  order: ApplicationColumnId[],
  id: ApplicationColumnId,
  afterId: ApplicationColumnId
): ApplicationColumnId[] {
  if (order.includes(id)) return order;
  const afterIndex = order.indexOf(afterId);
  if (afterIndex >= 0) {
    const next = [...order];
    next.splice(afterIndex + 1, 0, id);
    return next;
  }
  const actionsIndex = order.indexOf("actions");
  if (actionsIndex >= 0) {
    const next = [...order];
    next.splice(actionsIndex, 0, id);
    return next;
  }
  return [...order, id];
}

function ensureDefaultListingColumns(order: ApplicationColumnId[]): ApplicationColumnId[] {
  let next = [...order];
  next = insertAfter(next, "contact", "candidates");
  next = insertAfter(next, "clientName", "contact");
  // Match % is optional — not force-added; recruiters can enable it via Edit Columns.
  next = insertAfter(next, "fit", "clientName");
  next = insertAfter(next, "conf", "fit");
  next = insertAfter(next, "verify", "conf");
  next = insertAfter(next, "notMet", "verify");
  next = insertAfter(next, "currentStage", "notMet");
  next = insertAfter(next, "dateApplied", "currentStage");
  next = insertAfter(next, "evaluation", "dateApplied");
  next = insertAfter(next, "assignee", "evaluation");
  return next;
}

/** Keep Actions last so the AI icon + menu stay on the far right. */
export function ensureActionsLast(order: ApplicationColumnId[]): ApplicationColumnId[] {
  return [...order.filter((id) => id !== "actions"), "actions"];
}

function parseStoredColumnOrder(parsed: unknown): ApplicationColumnId[] | null {
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const allowed = new Set(APPLICATION_COLUMN_OPTIONS.map((c) => c.id));
  const cleaned = parsed.filter(
    (id): id is ApplicationColumnId =>
      typeof id === "string" && allowed.has(id as ApplicationColumnId)
  );
  return cleaned.length ? cleaned : null;
}

function readStoredColumnOrder(key: string): ApplicationColumnId[] | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  return parseStoredColumnOrder(JSON.parse(raw) as unknown);
}

export function loadApplicationColumnOrder(): ApplicationColumnId[] {
  if (typeof window === "undefined") return [...DEFAULT_APPLICATION_COLUMNS];
  try {
    const current = readStoredColumnOrder(STORAGE_KEY);
    const previous = current ? null : readStoredColumnOrder(PREVIOUS_STORAGE_KEY);
    const stored = current ?? (previous ? withoutRetiredProgressStatusColumn(previous) : null);
    if (!stored) return [...DEFAULT_APPLICATION_COLUMNS];
    return ensureActionsLast(ensureDefaultListingColumns(stored));
  } catch {
    return [...DEFAULT_APPLICATION_COLUMNS];
  }
}

export function saveApplicationColumnOrder(order: ApplicationColumnId[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ensureActionsLast(order)));
  } catch {
    /* ignore quota */
  }
}

export function applicationColumnLabel(id: ApplicationColumnId): string {
  return APPLICATION_COLUMN_OPTIONS.find((c) => c.id === id)?.label ?? id;
}

/** Name stays left; Location left-aligned; remaining list columns centered. */
const CENTER_ALIGNED_COLUMNS = new Set<ApplicationColumnId>([
  "matches",
  "fit",
  "conf",
  "verify",
  "notMet",
  "activity",
  "interest",
  "assignee",
  "status",
  "email",
  "workflow",
  "dateApplied",
  "evaluation",
  "actions",
]);

export function applicationListColumnClassName(colId: ApplicationColumnId): string {
  const center = CENTER_ALIGNED_COLUMNS.has(colId) ? " text-center" : "";
  if (colId === "candidates") return "min-w-[220px]";
  if (colId === "contact") return "min-w-[200px]";
  if (colId === "clientName") return "min-w-[140px] whitespace-nowrap";
  if (colId === "matches") return `min-w-[120px] max-w-[160px]${center}`;
  if (colId === "fit") return `min-w-[88px] whitespace-nowrap${center}`;
  if (colId === "conf" || colId === "verify" || colId === "notMet") {
    return `min-w-[72px] whitespace-nowrap${center}`;
  }
  if (colId === "location") return "min-w-[120px] whitespace-nowrap";
  if (colId === "activity") return `min-w-[180px] whitespace-nowrap${center}`;
  if (colId === "currentStage") return "min-w-[170px] max-w-[220px]";
  if (colId === "interest") return `min-w-[132px] whitespace-nowrap${center}`;
  if (colId === "email") return `min-w-[180px]${center}`;
  if (colId === "workflow") return `min-w-[140px]${center}`;
  if (colId === "dateApplied") return `min-w-[140px] whitespace-nowrap${center}`;
  if (colId === "evaluation") return `min-w-[110px] whitespace-nowrap${center}`;
  if (colId === "assignee") return `min-w-[160px] whitespace-nowrap${center}`;
  if (colId === "status") return `min-w-[140px] whitespace-nowrap${center}`;
  if (colId === "actions") return `min-w-[100px] whitespace-nowrap${center}`;
  return center.trim();
}

export type ApplicationColumnId =
  | "candidates"
  | "contact"
  | "jobRole"
  | "status"
  | "workType"
  | "currentStage"
  | "fit"
  | "dateApplied"
  | "actions"
  | "clientName"
  | "matches"
  | "conf"
  | "verify"
  | "notMet"
  | "location"
  | "activity"
  | "assignee"
  | "interest"
  | "email"
  | "workflow"
  | "evaluation";

export const APPLICATION_COLUMN_OPTIONS: { id: ApplicationColumnId; label: string }[] = [
  { id: "candidates", label: "Applicant" },
  { id: "contact", label: "Contact" },
  { id: "jobRole", label: "Job Role" },
  { id: "status", label: "Status" },
  { id: "workType", label: "Work Type" },
  { id: "currentStage", label: "Stage" },
  { id: "fit", label: "Match Status" },
  { id: "dateApplied", label: "Applied Date" },
  { id: "actions", label: "Action" },
  { id: "clientName", label: "Client Name" },
  { id: "matches", label: "Match %" },
  { id: "conf", label: "Conf." },
  { id: "verify", label: "Verify" },
  { id: "notMet", label: "Not Met" },
  { id: "location", label: "Location" },
  { id: "activity", label: "Activity" },
  { id: "assignee", label: "Assignee" },
  { id: "interest", label: "Interest" },
  { id: "email", label: "Email" },
  { id: "workflow", label: "Workflow" },
  { id: "evaluation", label: "Evaluation" },
];

/** Actions stays pinned on the right and is not hideable from Edit Columns. */
export const APPLICATION_EDITABLE_COLUMNS = APPLICATION_COLUMN_OPTIONS.filter(
  (column) => column.id !== "actions"
);

export const DEFAULT_APPLICATION_COLUMNS: ApplicationColumnId[] = [
  "candidates",
  "contact",
  "jobRole",
  "status",
  "workType",
  "currentStage",
  "fit",
  "dateApplied",
  "actions",
];

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

const STORAGE_KEY = "nexus-job-applications-list-columns-v10-applicants";

export function loadApplicationColumnOrder(): ApplicationColumnId[] {
  if (typeof window === "undefined") return [...DEFAULT_APPLICATION_COLUMNS];
  try {
    const current = readStoredColumnOrder(STORAGE_KEY);
    if (!current) return [...DEFAULT_APPLICATION_COLUMNS];
    return ensureActionsLast(current);
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
  "workType",
  "actions",
]);

export function applicationListColumnClassName(colId: ApplicationColumnId): string {
  const center = CENTER_ALIGNED_COLUMNS.has(colId) ? " text-center" : "";
  if (colId === "candidates") return "min-w-[220px]";
  if (colId === "contact") return "min-w-[200px]";
  if (colId === "jobRole") return "min-w-[190px]";
  if (colId === "workType") return `min-w-[100px] whitespace-nowrap${center}`;
  if (colId === "clientName") return "min-w-[140px] whitespace-nowrap";
  if (colId === "matches") return `min-w-[120px] max-w-[160px]${center}`;
  if (colId === "fit") return `min-w-[110px] whitespace-nowrap${center}`;
  if (colId === "conf" || colId === "verify" || colId === "notMet") {
    return `min-w-[72px] whitespace-nowrap${center}`;
  }
  if (colId === "location") return "min-w-[120px] whitespace-nowrap";
  if (colId === "activity") return `min-w-[180px] whitespace-nowrap${center}`;
  if (colId === "currentStage") return `min-w-[130px] whitespace-nowrap${center}`;
  if (colId === "interest") return `min-w-[132px] whitespace-nowrap${center}`;
  if (colId === "email") return `min-w-[180px]${center}`;
  if (colId === "workflow") return `min-w-[140px]${center}`;
  if (colId === "dateApplied") return `min-w-[120px] whitespace-nowrap${center}`;
  if (colId === "evaluation") return `min-w-[110px] whitespace-nowrap${center}`;
  if (colId === "assignee") return `min-w-[160px] whitespace-nowrap${center}`;
  if (colId === "status") return `min-w-[100px] whitespace-nowrap${center}`;
  if (colId === "actions") return `min-w-[100px] whitespace-nowrap${center}`;
  return center.trim();
}

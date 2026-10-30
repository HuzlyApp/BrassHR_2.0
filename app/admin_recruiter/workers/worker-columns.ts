export type WorkerColumnId =
  | "name"
  | "contact"
  | "assignment"
  | "jobRole"
  | "status"
  | "client"
  | "profile"
  | "hiredDate"
  | "startDate"
  | "endDate"
  | "location"
  | "facilities"
  | "billRate"
  | "payRate"
  | "manager"
  | "workerType"
  | "employmentType"
  | "experience"
  | "reference"
  | "email"
  | "phone"
  | "department"
  | "specialty"
  | "profession"
  | "createdDate"
  | "shiftType"
  | "shiftDetails"
  | "hoursPerWeek"
  | "overtimeRate"
  | "documentsCount";

export type WorkerColumnOption = {
  id: WorkerColumnId;
  label: string;
  header: string;
  fixed?: boolean;
};

export const WORKER_COLUMN_OPTIONS: WorkerColumnOption[] = [
  { id: "name", label: "Name", header: "NAME", fixed: true },
  { id: "contact", label: "Contact", header: "CONTACT" },
  { id: "assignment", label: "Assignment", header: "ASSIGNMENT" },
  { id: "jobRole", label: "Job Role", header: "JOB ROLE" },
  { id: "status", label: "Status", header: "STATUS" },
  { id: "client", label: "Client", header: "CLIENT" },
  { id: "profile", label: "Action", header: "", fixed: true },
  { id: "hiredDate", label: "Hired Date", header: "HIRED DATE" },
  { id: "startDate", label: "Assignment (Start Date)", header: "ASSIGNMENT START DATE" },
  { id: "endDate", label: "Assignment (End Date)", header: "ASSIGNMENT END DATE" },
  { id: "location", label: "Location (City/State)", header: "LOCATION" },
  { id: "facilities", label: "Facilities", header: "FACILITIES" },
  { id: "billRate", label: "Bill Rate", header: "BILL RATE" },
  { id: "payRate", label: "Pay Rate", header: "PAY RATE" },
  { id: "manager", label: "Manager", header: "MANAGER" },
  { id: "workerType", label: "Worker Type", header: "WORKER TYPE" },
  { id: "employmentType", label: "Employment Type", header: "EMPLOYMENT TYPE" },
  { id: "experience", label: "Experience", header: "EXPERIENCE" },
  { id: "reference", label: "Reference ID", header: "REFERENCE ID" },
  { id: "email", label: "Email", header: "EMAIL" },
  { id: "phone", label: "Phone", header: "PHONE" },
  { id: "department", label: "Department", header: "DEPARTMENT" },
  { id: "specialty", label: "Specialty", header: "SPECIALTY" },
  { id: "profession", label: "Profession", header: "PROFESSION" },
  { id: "createdDate", label: "Created Date", header: "CREATED DATE" },
  { id: "shiftType", label: "Shift Type", header: "SHIFT TYPE" },
  { id: "shiftDetails", label: "Shift Details", header: "SHIFT DETAILS" },
  { id: "hoursPerWeek", label: "Hours / Week", header: "HOURS / WEEK" },
  { id: "overtimeRate", label: "Overtime Rate", header: "OVERTIME RATE" },
  { id: "documentsCount", label: "Documents Count", header: "DOCUMENTS" },
];

export const DEFAULT_WORKER_COLUMNS: WorkerColumnId[] = [
  "name",
  "contact",
  "startDate",
  "endDate",
  "jobRole",
  "payRate",
  "status",
  "client",
  "profile",
];

export function ensureFixedWorkerColumns(order: WorkerColumnId[]): WorkerColumnId[] {
  const allowed = new Set(WORKER_COLUMN_OPTIONS.map((c) => c.id));
  const middle = order.filter(
    (id) => id !== "name" && id !== "profile" && allowed.has(id)
  );
  return ["name", ...middle, "profile"];
}

const STORAGE_KEY = "brasshr-workers-list-columns-v4";

export function loadWorkerColumnOrder(): WorkerColumnId[] {
  if (typeof window === "undefined") return [...DEFAULT_WORKER_COLUMNS];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_WORKER_COLUMNS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_WORKER_COLUMNS];
    const allowed = new Set(WORKER_COLUMN_OPTIONS.map((c) => c.id));
    const cleaned = parsed.filter(
      (id): id is WorkerColumnId => typeof id === "string" && allowed.has(id as WorkerColumnId)
    );
    if (!cleaned.includes("name") || !cleaned.includes("profile")) {
      return ensureFixedWorkerColumns(cleaned);
    }
    return ensureFixedWorkerColumns(cleaned);
  } catch {
    return [...DEFAULT_WORKER_COLUMNS];
  }
}

export function saveWorkerColumnOrder(order: WorkerColumnId[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ensureFixedWorkerColumns(order)));
  } catch {
    /* ignore quota */
  }
}

export function workerColumnLabel(id: WorkerColumnId): string {
  if (id === "profile") return "";
  return WORKER_COLUMN_OPTIONS.find((c) => c.id === id)?.header ?? id;
}

export function workerColumnDisplayLabel(id: WorkerColumnId): string {
  return WORKER_COLUMN_OPTIONS.find((c) => c.id === id)?.label ?? id;
}

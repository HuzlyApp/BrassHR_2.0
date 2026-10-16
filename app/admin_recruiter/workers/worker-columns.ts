export type WorkerColumnId =
  | "name"
  | "jobRole"
  | "location"
  | "status"
  | "email"
  | "phone"
  | "workerType"
  | "employmentType"
  | "reference"
  | "createdDate"
  | "profile"

export const WORKER_COLUMN_OPTIONS: { id: WorkerColumnId; label: string }[] = [
  { id: "name", label: "Name" },
  { id: "jobRole", label: "Job name" },
  { id: "location", label: "Location" },
  { id: "status", label: "Status" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone Number" },
  { id: "workerType", label: "Worker Type" },
  { id: "employmentType", label: "Employment Type" },
  { id: "reference", label: "Reference" },
  { id: "createdDate", label: "Created Date" },
  { id: "profile", label: "Profile" },
]

export const DEFAULT_WORKER_COLUMNS: WorkerColumnId[] = [
  "name",
  "jobRole",
  "location",
  "status",
  "profile",
]

const STORAGE_KEY = "nexus-workers-list-columns"

export function loadWorkerColumnOrder(): WorkerColumnId[] {
  if (typeof window === "undefined") return [...DEFAULT_WORKER_COLUMNS]
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [...DEFAULT_WORKER_COLUMNS]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_WORKER_COLUMNS]
    const allowed = new Set(WORKER_COLUMN_OPTIONS.map((c) => c.id))
    const cleaned = parsed.filter(
      (id): id is WorkerColumnId => typeof id === "string" && allowed.has(id as WorkerColumnId)
    )
    return cleaned.length ? cleaned : [...DEFAULT_WORKER_COLUMNS]
  } catch {
    return [...DEFAULT_WORKER_COLUMNS]
  }
}

export function saveWorkerColumnOrder(order: WorkerColumnId[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
  } catch {
    /* ignore quota */
  }
}

export function workerColumnLabel(id: WorkerColumnId): string {
  return WORKER_COLUMN_OPTIONS.find((c) => c.id === id)?.label ?? id
}

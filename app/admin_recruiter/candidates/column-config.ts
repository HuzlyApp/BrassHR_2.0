export type CandidateColumnId =
  | "name"
  | "contact"
  | "clientName"
  | "sourceJobId"
  | "status"
  | "progressStatus"
  | "reference"
  | "jobRole"
  | "matchJob"
  | "jobMatch"
  | "fit"
  | "conf"
  | "verify"
  | "notMet"
  | "currentStage"
  | "evaluation"
  | "assignee"
  | "createdDate"
  | "location"
  | "city"
  | "zipCode"
  | "state"
  | "address1"
  | "phone"
  | "email"
  | "dateOfBirth"
  | "firstName"
  | "lastName"
  | "country"
  | "address2"
  | "middleName"
  | "suffix"
  | "preferredName"
  | "licenseNumber"
  | "emergencyContact"
  | "notes"
  | "lastUpdated"
  | "source"
  | "referredBy"
  | "department"
  | "shift"
  | "payRate"
  | "startDate"

export const CANDIDATE_COLUMN_OPTIONS: { id: CandidateColumnId; label: string }[] = [
  { id: "name", label: "Candidate" },
  { id: "contact", label: "Contact" },
  { id: "clientName", label: "Client name" },
  { id: "sourceJobId", label: "MSP Source Job ID" },
  { id: "status", label: "Status" },
  { id: "progressStatus", label: "Progress Status" },
  { id: "reference", label: "Reference" },
  { id: "jobRole", label: "Job Role" },
  { id: "matchJob", label: "Applied jobs" },
  { id: "jobMatch", label: "Match Score" },
  { id: "fit", label: "Fit" },
  { id: "conf", label: "Conf." },
  { id: "verify", label: "Verify" },
  { id: "notMet", label: "Not Met" },
  { id: "currentStage", label: "Current Stage" },
  { id: "evaluation", label: "Evaluation" },
  { id: "assignee", label: "Assignee" },
  { id: "createdDate", label: "Applied date" },
  { id: "location", label: "Location" },
  { id: "city", label: "City" },
  { id: "zipCode", label: "Zip Code" },
  { id: "state", label: "State" },
  { id: "address1", label: "Street address" },
  { id: "phone", label: "Phone Number" },
  { id: "email", label: "Email" },
  { id: "dateOfBirth", label: "Date of Birth (mm/dd/yyyy)" },
  { id: "firstName", label: "First name" },
  { id: "lastName", label: "Last name" },
  { id: "country", label: "Country" },
  { id: "address2", label: "Address line 2" },
  { id: "middleName", label: "Middle name" },
  { id: "suffix", label: "Suffix" },
  { id: "preferredName", label: "Preferred name" },
  { id: "licenseNumber", label: "License number" },
  { id: "emergencyContact", label: "Emergency contact" },
  { id: "notes", label: "Notes" },
  { id: "lastUpdated", label: "Last updated" },
  { id: "source", label: "Source" },
  { id: "referredBy", label: "Referred by" },
  { id: "department", label: "Department" },
  { id: "shift", label: "Shift" },
  { id: "payRate", label: "Pay rate" },
  { id: "startDate", label: "Start date" },
]

export const DEFAULT_CANDIDATE_COLUMNS: CandidateColumnId[] = [
  "name",
  "contact",
  "clientName",
  "matchJob",
  "fit",
  "currentStage",
  "createdDate",
]

const STORAGE_KEY = "nexus-candidates-list-columns-v9"
const PREVIOUS_STORAGE_KEY = "nexus-candidates-list-columns-v8"
const LEGACY_STORAGE_KEY = "nexus-candidates-list-columns-v7"

/** Progress Status left the default candidates table; older saved layouts still listed it. */
export function withoutRetiredProgressStatusColumn(order: CandidateColumnId[]): CandidateColumnId[] {
  return order.filter((id) => id !== "progressStatus")
}

/** v7 layouts defaulted to Match Score; carry them over with Fit in that slot instead. */
function readLegacyColumnOrder(): unknown {
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
  if (!raw) return null
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) return null
  const hasFit = parsed.includes("fit")
  return parsed.flatMap((id) => (id === "jobMatch" ? (hasFit ? [] : ["fit"]) : [id]))
}

/** Ensure saved column layouts include the current default columns. */
function ensureDefaultCandidateColumns(order: CandidateColumnId[]): CandidateColumnId[] {
  let next = [...order]

  const insertAfter = (anchor: CandidateColumnId, columnId: CandidateColumnId) => {
    if (next.includes(columnId)) return
    const anchorIndex = next.indexOf(anchor)
    if (anchorIndex >= 0) next.splice(anchorIndex + 1, 0, columnId)
    else next.push(columnId)
  }

  insertAfter("name", "contact")
  insertAfter("contact", "clientName")
  insertAfter("clientName", "matchJob")
  // Match Score and Progress Status are optional — not force-added; recruiters can enable them via Edit Columns.
  insertAfter("matchJob", "fit")
  insertAfter("fit", "currentStage")
  insertAfter("currentStage", "createdDate")

  return next
}

function parseStoredColumnOrder(parsed: unknown): CandidateColumnId[] | null {
  if (!Array.isArray(parsed) || parsed.length === 0) return null
  const allowed = new Set(CANDIDATE_COLUMN_OPTIONS.map((c) => c.id))
  const cleaned = parsed.filter(
    (id): id is CandidateColumnId => typeof id === "string" && allowed.has(id as CandidateColumnId)
  )
  return cleaned.length ? cleaned : null
}

function readStoredColumnOrder(key: string): CandidateColumnId[] | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  return parseStoredColumnOrder(JSON.parse(raw) as unknown)
}

export function loadColumnOrder(): CandidateColumnId[] {
  if (typeof window === "undefined") return [...DEFAULT_CANDIDATE_COLUMNS]
  try {
    const current = readStoredColumnOrder(STORAGE_KEY)
    if (current) return ensureDefaultCandidateColumns(current)

    const previous = readStoredColumnOrder(PREVIOUS_STORAGE_KEY)
    if (previous) {
      return ensureDefaultCandidateColumns(withoutRetiredProgressStatusColumn(previous))
    }

    const legacy = parseStoredColumnOrder(readLegacyColumnOrder())
    if (!legacy) return [...DEFAULT_CANDIDATE_COLUMNS]
    return ensureDefaultCandidateColumns(withoutRetiredProgressStatusColumn(legacy))
  } catch {
    return [...DEFAULT_CANDIDATE_COLUMNS]
  }
}

export function saveColumnOrder(order: CandidateColumnId[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
  } catch {
    /* ignore quota */
  }
}

export function columnLabel(id: CandidateColumnId): string {
  return CANDIDATE_COLUMN_OPTIONS.find((c) => c.id === id)?.label ?? id
}

/** List table sizing — keeps status labels like "Under Review" on one line. */
export function candidateListColumnClassName(colId: CandidateColumnId): string {
  if (colId === "name") return "min-w-[220px]"
  if (colId === "contact") return "min-w-[200px]"
  if (colId === "clientName") return "min-w-[140px] whitespace-nowrap"
  if (colId === "sourceJobId") return "min-w-[150px] whitespace-nowrap"
  if (colId === "createdDate") return "min-w-[140px] whitespace-nowrap"
  if (colId === "status") return "min-w-[132px] whitespace-nowrap"
  if (colId === "progressStatus") return "min-w-[160px] whitespace-nowrap"
  if (colId === "jobMatch" || colId === "fit") return "min-w-[88px] whitespace-nowrap"
  if (colId === "conf" || colId === "verify" || colId === "notMet") {
    return "min-w-[72px] whitespace-nowrap"
  }
  if (colId === "currentStage") return "min-w-[170px] max-w-[220px]"
  if (colId === "evaluation") return "min-w-[110px] whitespace-nowrap"
  if (colId === "assignee") return "min-w-[160px] whitespace-nowrap"
  if (colId === "matchJob") return "min-w-[220px]"
  if (colId === "location") return "min-w-[220px] whitespace-nowrap"
  return ""
}

export function candidateListHeaderAlign(colId: CandidateColumnId): "left" | "center" {
  return colId === "name" || colId === "contact" || colId === "currentStage" ? "left" : "center"
}

/** Candidate, Contact, and Current Stage stay left-aligned; other list columns are centered. */
export function candidateListColumnAlignmentClassName(colId: CandidateColumnId): string {
  return candidateListHeaderAlign(colId) === "left" ? "text-left" : "text-center"
}

export const CANDIDATE_LIST_TABLE_SCROLL_CLASS = "w-full overflow-x-auto"
export const CANDIDATE_LIST_TABLE_CLASS = "w-max min-w-full border-collapse"

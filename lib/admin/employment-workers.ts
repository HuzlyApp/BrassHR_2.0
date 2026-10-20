export type EmploymentWorkerTab = "new" | "all" | "w2" | "1099";

export type EmploymentWorkerRecord = {
  id: string;
  candidate_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_role: string | null;
  location: string | null;
  status: string | null;
  worker_type: string | null;
  employment_classification: string | null;
  created_at: string | null;
  converted_at: string | null;
  profile_photo_url?: string | null;
  source_job_application_id?: string | null;
  documents_count?: number;
  application_snapshot?: Record<string, unknown> | null;
};

export function parseEmploymentWorkerTab(value: string | null | undefined): EmploymentWorkerTab {
  const tab = (value ?? "").trim().toLowerCase();
  if (tab === "new" || tab === "w2" || tab === "1099") return tab;
  return "all";
}

export function employmentWorkerTabLabel(tab: EmploymentWorkerTab): string {
  switch (tab) {
    case "new":
      return "New workers";
    case "w2":
      return "W-2 workers";
    case "1099":
      return "1099 workers";
    default:
      return "workers";
  }
}

export function formatEmploymentWorkerLocation(
  location: string | null | undefined,
  city?: string | null,
  state?: string | null
): string | null {
  const fromColumn = location?.trim();
  if (fromColumn) return fromColumn;
  const combined = [city?.trim(), state?.trim()].filter(Boolean).join(", ");
  return combined || null;
}

export function buildEmploymentWorkerLocationFromCandidate(candidate: {
  city?: string | null;
  state?: string | null;
}): string | null {
  return formatEmploymentWorkerLocation(null, candidate.city, candidate.state);
}

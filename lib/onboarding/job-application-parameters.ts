/** Builder library id of the Parameterized Job Application node. */
export const PARAMETERIZED_JOB_APPLICATION_STEP_TYPE = "parameterized-job-application";

export function isParameterizedJobApplicationStepType(stepType: string | null | undefined): boolean {
  return (
    String(stepType ?? "").trim().toLowerCase().replaceAll("_", "-") ===
    PARAMETERIZED_JOB_APPLICATION_STEP_TYPE
  );
}

export type JobApplicationParameterField = {
  key: "requisition" | "profession" | "specialty" | "location" | "w2Classification" | "expectedStartDate";
  label: string;
  date?: boolean;
};

/** Job details the node covers: requisition, profession, specialty, location, W2 classification, start date. */
export const JOB_APPLICATION_PARAMETER_FIELDS: readonly JobApplicationParameterField[] = [
  { key: "requisition", label: "Requisition" },
  { key: "profession", label: "Profession" },
  { key: "specialty", label: "Specialty" },
  { key: "location", label: "Location" },
  { key: "w2Classification", label: "W2 classification" },
  { key: "expectedStartDate", label: "Expected start date", date: true },
];

export type JobApplicationParameterKey = JobApplicationParameterField["key"];
export type JobApplicationParameters = Record<JobApplicationParameterKey, string>;

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export type JobScreeningProgressRow = {
  onboarding_step_id?: string | null;
  status?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  data?: Record<string, unknown> | null;
};

function rowTime(row: JobScreeningProgressRow): number {
  const parsed = Date.parse(row.updated_at ?? row.completed_at ?? row.created_at ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isJobScreeningProgressData(
  data: Record<string, unknown> | null | undefined
): boolean {
  if (!data || typeof data !== "object") return false;
  if (data.post_hire_submission != null) return false;
  if (asText(data.source) === "job_screening_answers") return true;
  return data.system_completed === true && asText(data.reason) === "non_navigable_placeholder";
}

/** Progress row written when the candidate saves job screening answers. */
export function findParameterizedJobApplicationProgress(
  progressByStepId: Map<string, JobScreeningProgressRow>,
  applicationId?: string | null
): { progress: JobScreeningProgressRow; tenantStepId: string | null } | null {
  let best: JobScreeningProgressRow | null = null;
  let bestTime = -1;
  let bestStepId: string | null = null;

  for (const [stepId, row] of progressByStepId) {
    const data =
      row.data && typeof row.data === "object" && !Array.isArray(row.data)
        ? (row.data as Record<string, unknown>)
        : null;
    if (!isJobScreeningProgressData(data)) continue;
    if (applicationId && asText(data?.application_id) !== applicationId) continue;
    const time = rowTime(row);
    if (time >= bestTime) {
      best = row;
      bestTime = time;
      bestStepId = asText(row.onboarding_step_id) ?? stepId;
    }
  }

  if (!best) return null;
  return { progress: best, tenantStepId: bestStepId };
}

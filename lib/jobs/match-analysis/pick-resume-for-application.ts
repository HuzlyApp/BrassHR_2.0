export type ApplicationScopedResume = {
  id?: string;
  job_application_id?: string | null;
  worker_id?: string | null;
};

/**
 * Prefer the résumé uploaded for this application. Never fall back to another
 * application's file for the same worker — that leaks Job B into Job A.
 */
export function pickResumeForApplication<T extends ApplicationScopedResume>(
  rows: T[] | null | undefined,
  applicationId: string
): T | null {
  const id = applicationId.trim();
  if (!id) return null;
  const list = rows ?? [];
  return list.find((row) => String(row.job_application_id ?? "") === id) ?? null;
}

/**
 * Résumés to show for one application: the files bound to it, else unbound
 * profile résumés. Files bound to the worker's other applications are excluded.
 * Without an application id (legacy instances) every row is returned.
 */
export function filterResumesForApplication<T extends ApplicationScopedResume>(
  rows: T[] | null | undefined,
  applicationId: string | null | undefined
): T[] {
  const list = rows ?? [];
  const id = applicationId?.trim() ?? "";
  if (!id) return list;
  const bound = list.filter((row) => String(row.job_application_id ?? "").trim() === id);
  if (bound.length) return bound;
  return list.filter((row) => !String(row.job_application_id ?? "").trim());
}

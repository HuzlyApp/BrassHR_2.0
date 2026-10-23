const SAFE_RESUME_PATH = /^[A-Za-z0-9][A-Za-z0-9/_.()\-]{0,500}$/;

/**
 * Storage paths are chosen by the server. A finalize call may only confirm a path
 * under the applicant or worker folder that this request is allowed to write.
 */
export function assertResumeObjectPath(path: string, allowedPrefixes: string[]): string {
  const normalized = path.trim().replace(/\\/g, "/");
  if (
    !normalized ||
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    normalized.includes("//") ||
    !SAFE_RESUME_PATH.test(normalized)
  ) {
    throw new Error("Invalid resume path.");
  }
  const prefixes = allowedPrefixes.map((prefix) => prefix.replace(/\/+$/, "")).filter(Boolean);
  const allowed = prefixes.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
  );
  if (!allowed) throw new Error("Invalid resume path.");
  return normalized;
}

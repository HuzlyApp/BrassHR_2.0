/** Display / stored resume names: FirstName_LastName_resume.pdf */

const UNSAFE_FILE_CHARS = /[/\\?%*:|"<>]/g;

export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

export function resumeFileExtension(originalFileName: string | null | undefined): string {
  const name = (originalFileName ?? "").trim();
  const match = name.match(/(\.[A-Za-z0-9]{1,8})$/);
  return match ? match[1].toLowerCase() : ".pdf";
}

export function sanitizeResumeNamePart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
}

/** Job-tailored Stage 5 pack. Keep this suffix when rewriting display names. */
export function isSubmissionResumeFileName(name: string | null | undefined): boolean {
  return /_submission_resume\.(pdf|docx)$/i.test(String(name ?? "").trim());
}

function fallbackResumeFileName(
  originalFileName: string | null | undefined,
  ext: string
): string {
  const trimmed = (originalFileName ?? "").trim();
  if (!trimmed) return `resume${ext}`;
  const base = trimmed
    .replace(/^.*[/\\]/, "")
    .replace(UNSAFE_FILE_CHARS, "_")
    .slice(0, 200)
    .trim();
  return base || `resume${ext}`;
}

/** Worker shells created before the applicant enters their name are stored as "Applicant User". */
export function isPlaceholderWorkerName(
  firstName: string | null | undefined,
  lastName: string | null | undefined
): boolean {
  return (
    String(firstName ?? "").trim().toLowerCase() === "applicant" &&
    String(lastName ?? "").trim().toLowerCase() === "user"
  );
}

/**
 * Canonical resume filename: `Joe_Bloe_resume.pdf`.
 * Falls back to the original upload name when first/last are missing or still the placeholder.
 */
export function buildWorkerResumeFileName(input: {
  firstName?: string | null;
  lastName?: string | null;
  originalFileName?: string | null;
}): string {
  const ext = resumeFileExtension(input.originalFileName);
  const placeholder = isPlaceholderWorkerName(input.firstName, input.lastName);
  const first = placeholder ? "" : sanitizeResumeNamePart(input.firstName ?? "");
  const last = placeholder ? "" : sanitizeResumeNamePart(input.lastName ?? "");
  const base = [first, last].filter(Boolean).join("_");
  if (base) {
    const kind = isSubmissionResumeFileName(input.originalFileName)
      ? "submission_resume"
      : "resume";
    return `${base}_${kind}${ext}`;
  }
  return fallbackResumeFileName(input.originalFileName, ext);
}

export function contentDispositionInline(fileName: string): string {
  const safe = fileName.replace(/["\\\r\n]/g, "_");
  return `inline; filename="${safe}"`;
}

/** Same-origin PDF/DOCX preview. Opens in the browser instead of downloading. */
export function adminWorkerResumePreviewHref(args: {
  workerId: string;
  resumeId?: string | null;
  applicationId?: string | null;
}): string {
  const params = new URLSearchParams({ workerId: args.workerId });
  if (args.resumeId?.trim()) params.set("resumeId", args.resumeId.trim());
  if (args.applicationId?.trim()) params.set("applicationId", args.applicationId.trim());
  return `/api/admin/worker-resume-preview?${params.toString()}`;
}

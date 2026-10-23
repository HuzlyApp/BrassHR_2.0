/** Client-safe Quick Match status checks. ANALYZING means the upload already returned. */

export function isAutoQuickMatchPending(status: string | null | undefined): boolean {
  return status === "ANALYZING";
}

export function isAutoQuickMatchFailed(status: string | null | undefined): boolean {
  if (!status || status === "ANALYZED" || isAutoQuickMatchPending(status)) return false;
  return true;
}

export function resumeUploadFollowUpMessage(input: {
  autoQuickMatch?: { status?: string | null; error?: string | null } | null;
  parseStatus?: string | null;
  parseError?: string | null;
  previousResumeKept?: boolean;
  reused?: boolean;
}): string | null {
  if (input.reused) {
    return "This resume matches the file already on record, so it was not uploaded or analyzed again.";
  }
  if (input.previousResumeKept) {
    return (
      input.parseError?.trim() ||
      "The new file was saved, but it could not be read. The previous resume is unchanged."
    );
  }
  if (input.parseStatus === "failed") {
    return input.parseError?.trim() || "The resume was saved, but text parsing failed. You can retry parsing.";
  }
  if (isAutoQuickMatchPending(input.autoQuickMatch?.status)) {
    return "Quick Match is running in the background.";
  }
  if (isAutoQuickMatchFailed(input.autoQuickMatch?.status)) {
    return (
      input.autoQuickMatch?.error?.trim() ||
      "Quick Match did not finish — use Re-run Quick Match to try again."
    );
  }
  if (input.autoQuickMatch?.status === "ANALYZED") {
    return "Quick Match complete.";
  }
  return null;
}

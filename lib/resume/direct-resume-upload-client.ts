import { putResumeToSignedUrl } from "@/lib/resume/put-signed-resume";

export type DirectResumeUploadResult = {
  ok?: boolean;
  resumeId?: string | null;
  fileName?: string;
  storagePath?: string | null;
  parseStatus?: string | null;
  parseError?: string | null;
  previousResumeKept?: boolean;
  reused?: boolean;
  applicationId?: string | null;
  workflowInstanceId?: string | null;
  resumedApplication?: boolean;
  autoQuickMatch?: {
    status?: string | null;
    error?: string | null;
    score?: number | null;
    category?: string | null;
    action?: string | null;
    readiness?: string | null;
    displayCategory?: string | null;
    stage?: string | null;
    requirementCounts?: {
      confirmed?: number;
      verify?: number;
      notMet?: number;
    } | null;
  } | null;
};

type PrepareResponse = {
  direct?: boolean;
  uploadUrl?: string;
  objectPath?: string;
  fileName?: string;
  error?: string;
};

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function uploadFileViaSignedUrl(args: {
  prepareUrl: string;
  prepareBody: Record<string, unknown>;
  file: File;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
  onProgress?: (percent: number) => void;
}): Promise<DirectResumeUploadResult> {
  const prepareResponse = await fetch(args.prepareUrl, {
    method: "POST",
    credentials: args.credentials ?? "same-origin",
    headers: { "Content-Type": "application/json", ...(args.headers || {}) },
    body: JSON.stringify({ ...args.prepareBody, phase: "prepare", fileName: args.file.name, fileSizeBytes: args.file.size, contentType: args.file.type }),
  });
  const prepared = (await readJson(prepareResponse)) as PrepareResponse;
  if (!prepareResponse.ok) {
    throw new Error(prepared.error || "Could not start the resume upload.");
  }
  if (!prepared.direct || !prepared.uploadUrl || !prepared.objectPath) {
    throw new Error("DIRECT_UNAVAILABLE");
  }
  args.onProgress?.(0);
  await putResumeToSignedUrl(prepared.uploadUrl, args.file, args.onProgress);
  const finalizeResponse = await fetch(args.prepareUrl, {
    method: "POST",
    credentials: args.credentials ?? "same-origin",
    headers: { "Content-Type": "application/json", ...(args.headers || {}) },
    body: JSON.stringify({
      ...args.prepareBody,
      phase: "finalize",
      objectPath: prepared.objectPath,
      fileName: prepared.fileName || args.file.name,
      fileSizeBytes: args.file.size,
      contentType: args.file.type,
      storedFileName: prepared.fileName || args.file.name,
    }),
  });
  const finalized = (await readJson(finalizeResponse)) as DirectResumeUploadResult & { error?: string };
  if (!finalizeResponse.ok) {
    throw new Error(finalized.error || "Could not save the resume.");
  }
  return {
    ...finalized,
    storagePath: finalized.storagePath || prepared.objectPath,
    fileName: finalized.fileName || prepared.fileName || args.file.name,
  };
}

/** Recruiter resume upload. Large files go straight to Storage; small files fall back to the route. */
export async function uploadAdminJobResume(args: {
  applicationId: string;
  file: File;
  resumeId?: string | null;
  analysisProvider?: string | null;
  onProgress?: (percent: number) => void;
}): Promise<DirectResumeUploadResult> {
  const url = `/api/admin/job-applications/${encodeURIComponent(args.applicationId)}/resume`;
  const prepareBody = {
    resumeId: args.resumeId || undefined,
    analysisProvider: args.analysisProvider || undefined,
  };
  try {
    return await uploadFileViaSignedUrl({
      prepareUrl: url,
      prepareBody,
      file: args.file,
      credentials: "include",
      onProgress: args.onProgress,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message !== "DIRECT_UNAVAILABLE" && args.file.size > 4 * 1024 * 1024) throw error;
    if (message && message !== "DIRECT_UNAVAILABLE" && /too large|not supported|another document|PDF, DOC/i.test(message)) {
      throw error;
    }
    const form = new FormData();
    form.set("resume", args.file);
    if (args.resumeId) form.set("resumeId", args.resumeId);
    if (args.analysisProvider) form.set("analysisProvider", args.analysisProvider);
    const response = await fetch(url, { method: "POST", credentials: "include", body: form });
    const payload = (await response.json().catch(() => ({}))) as DirectResumeUploadResult & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Failed to upload resume");
    return payload;
  }
}

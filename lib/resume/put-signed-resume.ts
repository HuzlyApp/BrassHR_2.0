import { getSupabaseAnonKey } from "@/lib/supabase-env";

function storageErrorMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    return parsed.message?.trim() || parsed.error?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Browser upload straight to Supabase Storage. The signed URL is path-scoped;
 * the anon key only satisfies the Storage API header, it does not widen the path.
 */
export function putResumeToSignedUrl(
  signedUrl: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<void> {
  const anonKey = getSupabaseAnonKey();
  if (!anonKey) {
    return Promise.reject(new Error("Supabase is not configured for uploads."));
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("Authorization", `Bearer ${anonKey}`);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable || event.total <= 0) return;
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      reject(
        new Error(storageErrorMessage(xhr.responseText) || "Resume upload failed. Please try again.")
      );
    };
    xhr.onerror = () => reject(new Error("Resume upload failed. Check your connection and try again."));
    xhr.ontimeout = () => reject(new Error("Resume upload timed out. Please try again."));
    xhr.timeout = 120_000;
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    xhr.send(body);
  });
}

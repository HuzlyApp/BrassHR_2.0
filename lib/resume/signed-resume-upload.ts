import type { SupabaseClient } from "@supabase/supabase-js";
import { WORKER_RESUMES_BUCKET } from "@/lib/supabase-storage-buckets";

export type SignedResumeUpload = {
  uploadUrl: string;
  token: string;
  objectPath: string;
};

export async function createResumeSignedUpload(
  supabase: SupabaseClient,
  objectPath: string
): Promise<SignedResumeUpload> {
  const { data, error } = await supabase.storage
    .from(WORKER_RESUMES_BUCKET)
    .createSignedUploadUrl(objectPath, { upsert: false });
  if (error || !data?.signedUrl || !data.token) {
    throw new Error(error?.message || "Could not start the resume upload.");
  }
  return {
    uploadUrl: data.signedUrl,
    token: data.token,
    objectPath: data.path || objectPath,
  };
}

/** Confirms the object landed and returns its size. Does not download the file. */
export async function readResumeObjectSize(
  supabase: SupabaseClient,
  objectPath: string
): Promise<number | null> {
  const slash = objectPath.lastIndexOf("/");
  const folder = slash >= 0 ? objectPath.slice(0, slash) : "";
  const name = slash >= 0 ? objectPath.slice(slash + 1) : objectPath;
  const { data, error } = await supabase.storage.from(WORKER_RESUMES_BUCKET).list(folder, {
    search: name,
    limit: 20,
  });
  if (error || !data) return null;
  const match = data.find((entry) => entry.name === name);
  const size = match?.metadata?.size;
  return typeof size === "number" && Number.isFinite(size) ? size : null;
}

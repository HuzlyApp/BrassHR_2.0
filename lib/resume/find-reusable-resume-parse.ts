import type { SupabaseClient } from "@supabase/supabase-js";

export type ReusableResumeParse = {
  id: string;
  storagePath: string | null;
  extractedText: string;
  parsedJson: Record<string, unknown> | null;
  textLength: number | null;
};

/**
 * Same tenant + worker + file bytes already parsed. Never reused across tenants.
 */
export async function findReusableResumeParse(
  supabase: SupabaseClient,
  args: {
    tenantId: string;
    workerId: string;
    fileHash: string;
    excludeResumeId?: string | null;
  }
): Promise<ReusableResumeParse | null> {
  const fileHash = args.fileHash.trim();
  const tenantId = args.tenantId.trim();
  const workerId = args.workerId.trim();
  if (!fileHash || !tenantId || !workerId) return null;

  const { data, error } = await supabase
    .from("worker_resumes")
    .select("id, storage_path, file_url, extracted_text, parsed_json, text_length, parsing_status")
    .eq("tenant_id", tenantId)
    .eq("worker_id", workerId)
    .eq("file_hash", fileHash)
    .eq("parsing_status", "completed")
    .is("deleted_at", null)
    .order("parsed_at", { ascending: false })
    .limit(5);
  if (error) throw error;

  const exclude = args.excludeResumeId?.trim() || "";
  const row = (data ?? []).find((candidate) => {
    if (exclude && String(candidate.id) === exclude) return false;
    return typeof candidate.extracted_text === "string" && candidate.extracted_text.trim().length > 0;
  });
  if (!row) return null;

  const parsed = row.parsed_json;
  return {
    id: String(row.id),
    storagePath:
      (typeof row.storage_path === "string" && row.storage_path.trim()) ||
      (typeof row.file_url === "string" && row.file_url.trim()) ||
      null,
    extractedText: String(row.extracted_text),
    parsedJson:
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null,
    textLength: typeof row.text_length === "number" ? row.text_length : null,
  };
}

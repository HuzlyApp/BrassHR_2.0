import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ApplicationResumeDisplay = {
  text: string;
  fileName: string | null;
  storagePath: string | null;
};

type WorkerResumeSource = {
  id: string;
  extracted_text: string | null;
  file_name: string | null;
  original_file_name: string | null;
  storage_path: string | null;
  file_url: string | null;
  file_type: string | null;
  file_size_bytes: number | null;
  text_length: number | null;
  job_application_id: string | null;
  parsing_status: string | null;
  parse_status: string | null;
  parsed_data: unknown;
  parsed_json: unknown;
  uploaded_by_user_id?: string | null;
};

function toDisplay(row: {
  extracted_text?: string | null;
  file_name?: string | null;
  original_file_name?: string | null;
  storage_path?: string | null;
}): ApplicationResumeDisplay | null {
  const fileName =
    String(row.original_file_name || row.file_name || "").trim() ||
    (row.storage_path?.trim() ? "Resume" : null);
  const text = String(row.extracted_text ?? "");
  if (!fileName && !text.trim()) return null;
  return {
    text,
    fileName: fileName || "Resume",
    storagePath: row.storage_path?.trim() || null,
  };
}

/**
 * Ensure this application has its own worker_resumes row for UI + Quick Match.
 * Imported candidates often only have a résumé tagged to an older job — we bind
 * unbound rows, or clone the latest worker résumé onto this application.
 */
export async function ensureApplicationResumeFromWorker(args: {
  supabase: SupabaseClient;
  tenantId: string;
  applicationId: string;
  workerId: string | null | undefined;
}): Promise<ApplicationResumeDisplay | null> {
  const { supabase, tenantId } = args;
  const applicationId = args.applicationId.trim();
  const workerId = args.workerId?.trim() || "";
  if (!applicationId || !tenantId) return null;

  const { data: scopedRows, error: scopedError } = await supabase
    .from("worker_resumes")
    .select(
      "id, extracted_text, file_name, original_file_name, storage_path, file_url, file_type, file_size_bytes, text_length, job_application_id, parsing_status, parse_status, parsed_data, parsed_json, uploaded_at, uploaded_by_user_id"
    )
    .eq("tenant_id", tenantId)
    .eq("job_application_id", applicationId)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false })
    .limit(1);
  if (scopedError) throw scopedError;

  const scoped = (scopedRows?.[0] as WorkerResumeSource | undefined) ?? null;
  const scopedDisplay = scoped ? toDisplay(scoped) : null;
  if (scopedDisplay) return scopedDisplay;

  if (!workerId) return null;

  const { data: source, error: sourceError } = await supabase
    .from("worker_resumes")
    .select(
      "id, extracted_text, file_name, original_file_name, storage_path, file_url, file_type, file_size_bytes, text_length, job_application_id, parsing_status, parse_status, parsed_data, parsed_json, uploaded_at, uploaded_by_user_id"
    )
    .eq("tenant_id", tenantId)
    .eq("worker_id", workerId)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sourceError) throw sourceError;
  if (!source?.id) return null;

  const sourceRow = source as WorkerResumeSource;
  const boundTo = String(sourceRow.job_application_id ?? "").trim();

  if (!boundTo) {
    const { error: bindError } = await supabase
      .from("worker_resumes")
      .update({ job_application_id: applicationId })
      .eq("id", sourceRow.id)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);
    if (bindError) {
      console.warn("[ensure-application-resume] bind failed:", bindError.message);
    }
    return toDisplay(sourceRow);
  }

  if (boundTo === applicationId) {
    return toDisplay(sourceRow);
  }

  // Already tagged to another job — clone so this application has its own row.
  const storagePath =
    String(sourceRow.storage_path || sourceRow.file_url || "").trim() || null;
  const now = new Date().toISOString();
  const { error: insertError } = await supabase.from("worker_resumes").insert({
    worker_id: workerId,
    tenant_id: tenantId,
    file_url: storagePath,
    storage_path: storagePath,
    original_file_name: sourceRow.original_file_name,
    file_name: sourceRow.file_name || sourceRow.original_file_name,
    file_type: sourceRow.file_type,
    file_size_bytes: sourceRow.file_size_bytes,
    extracted_text: sourceRow.extracted_text,
    text_length:
      sourceRow.text_length ??
      (sourceRow.extracted_text ? sourceRow.extracted_text.length : null),
    parsing_status: sourceRow.parsing_status || "completed",
    parse_status: sourceRow.parse_status || "completed",
    parsed_data: sourceRow.parsed_data ?? {},
    parsed_json: sourceRow.parsed_json ?? sourceRow.parsed_data ?? {},
    parsed_at: now,
    uploaded_at: now,
    parse_started_at: now,
    parse_completed_at: now,
    parse_error: null,
    job_application_id: applicationId,
    uploaded_by_user_id: sourceRow.uploaded_by_user_id ?? null,
  });
  if (insertError) {
    console.warn("[ensure-application-resume] clone failed:", insertError.message);
    // Still return display so the overview isn't empty after a clone race/error.
    return toDisplay(sourceRow);
  }

  return toDisplay(sourceRow);
}

/**
 * Give every job application its own worker_resumes row.
 *
 * Applications without a bound résumé fall back to a résumé bound to another
 * application, and /api/admin/worker-resume-preview rejects that pairing with
 * "Resume not found". For each such application this binds the worker's latest
 * unbound résumé, or clones the latest résumé onto the application (same rules
 * as lib/jobs/match-analysis/ensure-application-resume.ts). Storage files are reused.
 *
 * Dry run by default; pass --apply to write.
 *
 *   npx tsx scripts/repair-application-resumes.ts --tenant=zipstaff
 *   npx tsx scripts/repair-application-resumes.ts --tenant=zipstaff --apply
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const PAGE_SIZE = 1000;
const INSERT_ATTEMPTS = 3;

function loadEnvFile(name: string) {
  const envPath = resolve(root, name);
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const tenant = args.find((arg) => arg.startsWith("--tenant="))?.slice("--tenant=".length).trim();
  return { tenant: tenant || "", apply: args.includes("--apply") };
}

type ApplicationRow = { id: string; worker_id: string | null; created_at: string };

type ResumeRow = {
  id: string;
  worker_id: string;
  job_application_id: string | null;
  uploaded_at: string;
};

async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

function isStatementTimeout(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "57014";
}

async function cloneResumeOntoApplication(
  supabase: SupabaseClient,
  tenantId: string,
  sourceId: string,
  applicationId: string
): Promise<void> {
  const { data: source, error } = await supabase
    .from("worker_resumes")
    .select(
      "worker_id, storage_path, file_url, original_file_name, file_name, file_type, file_size_bytes, extracted_text, text_length, parsing_status, parse_status, parsed_data, parsed_json, uploaded_by_user_id"
    )
    .eq("id", sourceId)
    .single();
  if (error) throw error;

  const storagePath = String(source.storage_path || source.file_url || "").trim() || null;
  const now = new Date().toISOString();
  const row = {
    worker_id: source.worker_id,
    tenant_id: tenantId,
    file_url: storagePath,
    storage_path: storagePath,
    original_file_name: source.original_file_name,
    file_name: source.file_name || source.original_file_name,
    file_type: source.file_type,
    file_size_bytes: source.file_size_bytes,
    extracted_text: source.extracted_text,
    text_length:
      source.text_length ?? (source.extracted_text ? String(source.extracted_text).length : null),
    parsing_status: source.parsing_status || "completed",
    parse_status: source.parse_status || "completed",
    parsed_data: source.parsed_data ?? {},
    parsed_json: source.parsed_json ?? source.parsed_data ?? {},
    parsed_at: now,
    uploaded_at: now,
    parse_started_at: now,
    parse_completed_at: now,
    parse_error: null,
    job_application_id: applicationId,
    uploaded_by_user_id: source.uploaded_by_user_id ?? null,
  };

  for (let attempt = 1; ; attempt += 1) {
    const { error: insertError } = await supabase.from("worker_resumes").insert(row);
    if (!insertError) return;
    if (attempt >= INSERT_ATTEMPTS || !isStatementTimeout(insertError)) throw insertError;
    await new Promise((r) => setTimeout(r, attempt * 2000));
    const { data: existing } = await supabase
      .from("worker_resumes")
      .select("id")
      .eq("job_application_id", applicationId)
      .is("deleted_at", null)
      .limit(1);
    if ((existing?.length ?? 0) > 0) return;
  }
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");
  const { tenant, apply } = parseArgs();
  if (!tenant) {
    console.error("Usage: npx tsx scripts/repair-application-resumes.ts --tenant=<slug|id> [--apply]");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: tenantRow, error: tenantError } = await supabase
    .from("tenants")
    .select("id, name, slug")
    .eq(/^[0-9a-f-]{36}$/i.test(tenant) ? "id" : "slug", tenant)
    .maybeSingle();
  if (tenantError) throw tenantError;
  if (!tenantRow?.id) throw new Error(`Tenant not found: ${tenant}`);
  const tenantId = String(tenantRow.id);

  console.log(`Database: ${new URL(url).host}`);
  console.log(`Tenant:   ${tenantRow.name} (${tenantRow.slug}, ${tenantId})`);
  console.log(`Mode:     ${apply ? "APPLY (writing changes)" : "DRY RUN (no changes)"}\n`);

  const applications = await fetchAll<ApplicationRow>((from, to) =>
    supabase
      .from("job_applications")
      .select("id, worker_id, created_at")
      .eq("tenant_id", tenantId)
      .not("worker_id", "is", null)
      .order("created_at", { ascending: true })
      .range(from, to)
  );
  const resumes = await fetchAll<ResumeRow>((from, to) =>
    supabase
      .from("worker_resumes")
      .select("id, worker_id, job_application_id, uploaded_at")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("uploaded_at", { ascending: false })
      .range(from, to)
  );

  const boundApplicationIds = new Set(
    resumes.map((row) => row.job_application_id?.trim()).filter((id): id is string => Boolean(id))
  );
  const resumesByWorker = new Map<string, ResumeRow[]>();
  for (const row of resumes) {
    const list = resumesByWorker.get(row.worker_id) ?? [];
    list.push(row);
    resumesByWorker.set(row.worker_id, list);
  }

  const missing = applications.filter((app) => !boundApplicationIds.has(app.id));
  let bound = 0;
  let cloned = 0;
  let skipped = 0;
  let failed = 0;

  for (const app of missing) {
    const workerId = String(app.worker_id);
    const latest = resumesByWorker.get(workerId)?.[0];
    if (!latest) {
      skipped += 1;
      console.log(`skip   app=${app.id} worker=${workerId} (worker has no résumé)`);
      continue;
    }

    const action = latest.job_application_id ? "clone" : "bind";
    console.log(`${action.padEnd(6)} app=${app.id} worker=${workerId} source=${latest.id}`);
    if (!apply) {
      if (action === "bind") {
        latest.job_application_id = app.id;
        bound += 1;
      } else {
        cloned += 1;
      }
      continue;
    }

    try {
      if (action === "bind") {
        const { error } = await supabase
          .from("worker_resumes")
          .update({ job_application_id: app.id })
          .eq("id", latest.id)
          .is("job_application_id", null);
        if (error) throw error;
        latest.job_application_id = app.id;
        bound += 1;
      } else {
        await cloneResumeOntoApplication(supabase, tenantId, latest.id, app.id);
        cloned += 1;
      }
    } catch (error) {
      failed += 1;
      console.error(`  failed: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
    }
  }

  console.log(
    `\nApplications missing a résumé: ${missing.length}` +
      `\n  ${apply ? "bound" : "would bind"}:  ${bound}` +
      `\n  ${apply ? "cloned" : "would clone"}: ${cloned}` +
      `\n  skipped (no résumé): ${skipped}` +
      (apply ? `\n  failed: ${failed}` : "")
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

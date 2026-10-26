/**
 * Idempotent Firma workspace backfill.
 *
 * Ensures the Braas HR platform tenant exists, then creates a live Firma workspace
 * for every tenant whose stored firma_workspace_id is missing or not visible on
 * GET /workspaces. Safe to run more than once.
 *
 *   npx tsx scripts/backfill-firma-workspaces.ts
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const DEFAULT_API_BASE = "https://api.firma.dev/functions/v1/signing-request-api";
const PLATFORM_SLUG = "braas-hr";

function loadEnvFile() {
  const envPath = resolve(root, ".env");
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

function redact(text: string): string {
  return text.replace(/firma_(live|test)_[A-Za-z0-9_-]+/g, "firma_$1_[REDACTED]");
}

function getApiBase(): string {
  return (process.env.FIRMA_API_BASE_URL ?? DEFAULT_API_BASE).replace(/\/$/, "");
}

async function firmaFetch(path: string, init?: RequestInit) {
  const apiKey = process.env.FIRMA_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing FIRMA_API_KEY");
  const url = `${getApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const bodyText = await response.text();
  let body: unknown = null;
  if (bodyText) {
    try {
      body = JSON.parse(bodyText) as unknown;
    } catch {
      body = { message: bodyText };
    }
  }
  if (!response.ok) {
    throw new Error(`Firma ${init?.method ?? "GET"} ${path} failed (${response.status}): ${redact(bodyText)}`);
  }
  return body;
}

type WorkspaceRow = { id?: string; name?: string };
type WorkspaceList = { results?: WorkspaceRow[]; pagination?: { total_pages?: number } };

async function listWorkspaceIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= 8) {
    const path = page === 1 ? "/workspaces" : `/workspaces?page=${page}`;
    const result = (await firmaFetch(path)) as WorkspaceList | WorkspaceRow[];
    const rows = Array.isArray(result) ? result : result.results ?? [];
    for (const row of rows) {
      const id = row.id?.trim();
      if (id) ids.add(id);
    }
    if (!Array.isArray(result) && result.pagination?.total_pages) {
      totalPages = Math.max(1, Number(result.pagination.total_pages) || 1);
    } else {
      break;
    }
    page += 1;
  }
  return ids;
}

function workspaceNameFor(name: string, slug?: string | null): string {
  const trimmed = name.trim() || "Tenant";
  const s = slug?.trim();
  return `BrassHR - ${trimmed}${s ? ` (${s})` : ""}`;
}

async function createWorkspace(name: string): Promise<string> {
  const created = (await firmaFetch("/workspaces", {
    method: "POST",
    body: JSON.stringify({ name }),
  })) as { id?: string };
  const id = created.id?.trim();
  if (!id) throw new Error(`Firma did not return a workspace id for ${name}`);
  return id;
}

async function main() {
  loadEnvFile();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const knownIds = await listWorkspaceIds();
  console.log("[backfill] live Firma workspaces", knownIds.size);

  const { data: platform } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", PLATFORM_SLUG)
    .maybeSingle();

  if (!platform?.id) {
    const { data: created, error: insertErr } = await supabase
      .from("tenants")
      .insert({
        name: "Brass HR",
        slug: PLATFORM_SLUG,
        subdomain: PLATFORM_SLUG,
        plan: "platform",
        is_active: true,
        logo_url: "/icons/braas-HR/BrassHR-logo.svg",
        primary_color: "#BC8B41",
        secondary_color: "#104b83",
        accent_color: "#E9B771",
        welcome_headline: "Welcome to Brass HR",
        welcome_subtitle: "HR Simplified for growing teams",
        auth_background_image_url: "/images/singup-bg-image.jpg",
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();
    if (insertErr && insertErr.code !== "23505") throw insertErr;
    if (!insertErr && created?.id) {
      const { error: categoryErr } = await supabase.from("tenant_categories").upsert(
        {
          tenant_id: created.id,
          category: "Staffing",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id" }
      );
      if (categoryErr) throw categoryErr;
    }
    console.log("[backfill] created Brass HR platform tenant");
  }

  const { data: tenants, error } = await supabase
    .from("tenants")
    .select("id, name, slug, subdomain, firma_workspace_id")
    .order("created_at", { ascending: true });
  if (error) throw error;

  for (const tenant of tenants ?? []) {
    const tenantId = String(tenant.id);
    const stored = typeof tenant.firma_workspace_id === "string" ? tenant.firma_workspace_id.trim() : "";
    if (stored && knownIds.has(stored)) {
      console.log("[backfill] already_configured", { tenantId, workspaceId: stored });
      continue;
    }
    if (stored) {
      console.log("[backfill] stale workspace id, recreating", { tenantId, workspaceId: stored });
    }
    const name = workspaceNameFor(String(tenant.name ?? ""), tenant.subdomain ?? tenant.slug);
    const workspaceId = await createWorkspace(name);
    const { error: updateErr } = await supabase
      .from("tenants")
      .update({
        firma_workspace_id: workspaceId,
        firma_workspace_provisioning_status: "created",
        firma_workspace_provisioning_error: null,
        firma_workspace_provisioned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);
    if (updateErr) throw updateErr;
    knownIds.add(workspaceId);
    console.log("[backfill] workspace created", { tenantId, workspaceId });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

/**
 * Move W2 workflows from Uncategorized into Onboarding Flows library.
 * Usage: node scripts/move-w2-flows-to-onboarding-library.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    const key = trimmed.slice(0, i).trim();
    let val = trimmed.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

async function main() {
  const env = loadEnvLocal();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: tenants, error: tenantsError } = await sb
    .from("tenants")
    .select("id, name")
    .order("created_at", { ascending: true });
  if (tenantsError) throw tenantsError;

  const tenant =
    (tenants ?? []).find((t) => /test company/i.test(String(t.name ?? ""))) ??
    (tenants ?? [])[0];
  if (!tenant) throw new Error("No tenant found");

  console.log(`Tenant: ${tenant.name} (${tenant.id})`);

  const { data: libs, error: libError } = await sb
    .from("onboarding_libraries")
    .select("id, name, slug, is_uncategorized")
    .eq("tenant_id", tenant.id)
    .order("name", { ascending: true });
  if (libError) throw libError;

  console.log("Libraries:");
  for (const lib of libs ?? []) {
    console.log(
      `  - ${lib.name} | slug=${lib.slug} | uncategorized=${lib.is_uncategorized} | ${lib.id}`
    );
  }

  const onboardingLib =
    (libs ?? []).find((l) => l.slug === "onboarding" && !l.is_uncategorized) ??
    (libs ?? []).find((l) => /onboarding/i.test(String(l.name ?? "")) && !l.is_uncategorized) ??
    (libs ?? []).find((l) => !l.is_uncategorized);

  if (!onboardingLib) {
    throw new Error('No "Onboarding Flows" library found (non-uncategorized).');
  }

  console.log(`\nTarget library: ${onboardingLib.name} (${onboardingLib.id})`);

  const { data: flows, error: flowError } = await sb
    .from("onboarding_flows")
    .select("id, name, library_id, status")
    .eq("tenant_id", tenant.id)
    .or("name.ilike.%W2%,name.ilike.%1099%");
  if (flowError) throw flowError;

  console.log("\nMatching flows before:");
  for (const flow of flows ?? []) {
    const lib = (libs ?? []).find((l) => l.id === flow.library_id);
    console.log(
      `  - ${flow.name} | library=${lib?.name ?? "(none)"} | uncategorized=${lib?.is_uncategorized ?? "n/a"}`
    );
  }

  const toMove = (flows ?? []).filter((f) => f.library_id !== onboardingLib.id);
  if (!toMove.length) {
    console.log("\nAll matching flows already in Onboarding library.");
    return;
  }

  for (const flow of toMove) {
    const { error } = await sb
      .from("onboarding_flows")
      .update({
        library_id: onboardingLib.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", flow.id)
      .eq("tenant_id", tenant.id);
    if (error) throw error;
    console.log(`Moved: ${flow.name} → ${onboardingLib.name}`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import { routeForApplicantStep } from "./lib/onboarding/resolve-applicant-step-route.ts";
import { applicantStepHasNavigableScreen } from "./lib/onboarding/applicant-step-navigability.ts";

const envContent = fs.readFileSync(".env.local", "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", "testcompany")
    .single();

  const { data: steps } = await supabase
    .from("tenant_onboarding_steps")
    .select("id, step_key, step_type, title, sort_order, is_required, is_enabled, metadata")
    .eq("tenant_id", tenant.id)
    .eq("is_enabled", true)
    .order("sort_order", { ascending: true });

  console.log("Checking route and navigability for steps:");
  for (const s of steps) {
    const route = routeForApplicantStep(s, "testcompany");
    const navigable = applicantStepHasNavigableScreen(s, steps);
    if (s.title.toLowerCase().includes("i-9") || s.title.toLowerCase().includes("i9") || !navigable) {
      console.log(`- "${s.title}" (key: ${s.step_key}): route="${route}", navigable=${navigable}`);
    }
  }
}

main().catch(console.error);

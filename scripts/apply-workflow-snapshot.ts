/**
 * Copy a workflow exported from one tenant (or environment) into another tenant and publish it.
 *
 * Uses the same services as the Automation > Workflows builder Publish button: saves the
 * flow, publishes its steps to the tenant onboarding config, and re-syncs candidates already
 * assigned to the flow. E-sign templates are remapped to the target tenant's active template
 * with the same name, because template ids differ per tenant. Safe to re-run.
 *
 *   npx -y tsx --conditions=react-server scripts/apply-workflow-snapshot.ts \
 *     --snapshot scripts/workflow-snapshots/zipstaff-rnr-worker-workflow.json --tenant testcompany [--dry-run]
 *
 * Options:
 *   --snapshot <path>      Snapshot JSON (required)
 *   --tenant <slug>        Target tenant slug (required)
 *   --actor-email <email>  Staff user recorded as updater (default: first active tenant admin)
 *   --env-file <path>      Env file with Supabase credentials (default: .env.local)
 *   --dry-run              Validate and print the plan without writing anything
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type SnapshotNode = {
  id: string;
  stepId: string;
  label: string;
  required: boolean;
  settings: Record<string, unknown>;
  [key: string]: unknown;
};

type Snapshot = {
  name: string;
  employmentType?: string | null;
  /** Source template id -> template name, used to find the matching target template. */
  firmaTemplates?: Record<string, string>;
  builderDraft: {
    nodes: SnapshotNode[];
    edges: Array<{ id: string; source: string; target: string }>;
  };
};

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function loadEnvFile(path: string) {
  if (!existsSync(path)) throw new Error(`Env file not found: ${path}`);
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function requireString(args: Record<string, string | boolean>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required option --${key}`);
  }
  return value.trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const dryRun = args["dry-run"] === true;
  const snapshotPath = resolve(root, requireString(args, "snapshot"));
  const tenantSlug = requireString(args, "tenant");
  const envFile = resolve(root, typeof args["env-file"] === "string" ? args["env-file"] : ".env.local");

  loadEnvFile(envFile);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as Snapshot;
  if (!snapshot.name?.trim() || !snapshot.builderDraft?.nodes?.length) {
    throw new Error("Snapshot needs a name and at least one step");
  }

  // App modules read process.env at import time, so load them after the env file.
  const { createClient } = await import("@supabase/supabase-js");
  const { loadOnboardingStepLibrary } = await import("@/lib/onboarding/load-step-library");
  const { validateWorkflowPhaseLayout } = await import("@/lib/onboarding/validate-workflow-phases");
  const { isFirmaAttachableWorkflowStepId } = await import("@/lib/onboarding/firma-step-settings");
  const { resolveOnboardingLibraryForFlows } = await import("@/lib/onboarding/onboarding-libraries");
  const { normalizeFlowNameKey } = await import("@/lib/onboarding/validate-flow-name");
  const flows = await import("@/lib/onboarding/onboarding-flows");
  const { publishOnboardingFromWorkflow } = await import(
    "@/lib/onboarding/publish-onboarding-from-workflow"
  );
  const { syncActiveWorkflowInstancesToDraft } = await import(
    "@/lib/onboarding/sync-workflow-instances"
  );

  type OnboardingDbClient = import("@/lib/onboarding/load-tenant-config").OnboardingDbClient;
  type SerializableWorkflowState =
    import("@/lib/onboarding/workflow-builder-serialization").SerializableWorkflowState;

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const db = sb as unknown as OnboardingDbClient;

  console.log(`Target:    ${supabaseUrl}`);
  console.log(`Snapshot:  ${snapshot.name} (${snapshot.builderDraft.nodes.length} steps)`);
  console.log(`Mode:      ${dryRun ? "dry run (no writes)" : "write + publish"}\n`);

  const { data: tenant, error: tenantError } = await sb
    .from("tenants")
    .select("id, name, slug")
    .eq("slug", tenantSlug)
    .maybeSingle();
  if (tenantError) throw tenantError;
  if (!tenant) throw new Error(`Tenant with slug "${tenantSlug}" not found`);
  const tenantId = String(tenant.id);
  console.log(`Tenant:    ${tenant.name} (${tenant.slug})`);

  let actorId: string | null = null;
  const actorEmail = typeof args["actor-email"] === "string" ? args["actor-email"].trim() : "";
  if (actorEmail) {
    const { data: user, error } = await sb
      .from("users")
      .select("id")
      .ilike("email", actorEmail)
      .maybeSingle();
    if (error) throw error;
    actorId = user?.id ? String(user.id) : null;
    if (!actorId) throw new Error(`No user found with email ${actorEmail}`);
  } else {
    const { data: admins, error } = await sb
      .from("user_roles")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("role", "admin")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw error;
    actorId = admins?.[0]?.user_id ? String(admins[0].user_id) : null;
    if (!actorId) throw new Error("No active tenant admin found; pass --actor-email");
  }
  const actor: string = actorId;
  console.log(`Actor:     ${actor}`);

  const libraryCategories = await loadOnboardingStepLibrary(db, tenantId);
  const libraryKeys = new Set(libraryCategories.flatMap((category) => category.steps.map((step) => step.id)));
  const missing = snapshot.builderDraft.nodes.filter((node) => !libraryKeys.has(node.stepId));
  if (missing.length) {
    throw new Error(
      `Steps not in this tenant's step library: ${missing.map((n) => `${n.label} <${n.stepId}>`).join(", ")}`
    );
  }

  const { data: templateRows, error: templateError } = await sb
    .from("recruiter_templates")
    .select("id, name, status, firma_template_id")
    .eq("tenant_id", tenantId)
    .eq("status", "active");
  if (templateError) throw templateError;
  const templateByName = new Map(
    (templateRows ?? [])
      .filter((row) => row.firma_template_id)
      .map((row) => [normalizeFlowNameKey(String(row.name)), { id: String(row.id), name: String(row.name) }])
  );

  const nodes = snapshot.builderDraft.nodes.map((node) => {
    const sourceTemplateId = String(node.settings.firmaRecruiterTemplateId ?? "").trim();
    if (!sourceTemplateId) return node;
    const sourceName =
      snapshot.firmaTemplates?.[sourceTemplateId] ?? String(node.settings.firmaRecruiterTemplateName ?? "");
    const target = isFirmaAttachableWorkflowStepId(node.stepId)
      ? templateByName.get(normalizeFlowNameKey(sourceName))
      : undefined;
    if (!target) {
      console.warn(`  ! ${node.label}: no active e-sign template named "${sourceName}"; attach one in the builder.`);
    }
    return {
      ...node,
      settings: {
        ...node.settings,
        firmaRecruiterTemplateId: target?.id ?? "",
        firmaRecruiterTemplateName: target?.name ?? "",
      },
    };
  });
  const draft = { nodes, edges: snapshot.builderDraft.edges } as unknown as SerializableWorkflowState;

  const phaseErrors = validateWorkflowPhaseLayout(draft);
  if (phaseErrors.length) {
    throw new Error(`Workflow cannot be published: ${phaseErrors.map((e) => e.message).join("; ")}`);
  }

  console.log("\nPlan:");
  for (const node of nodes) {
    const esign = node.settings.firmaRecruiterTemplateName
      ? `  e-sign: ${node.settings.firmaRecruiterTemplateName}`
      : "";
    console.log(
      `  - [${node.settings.phase}] ${node.label}${node.required ? "" : " (optional)"}  <${node.stepId}, ${node.settings.completionOwner}>${esign}`
    );
  }

  if (dryRun) {
    console.log("\nDry run complete. Nothing was written.");
    return;
  }

  const { data: flowRows, error: flowListError } = await sb
    .from("onboarding_flows")
    .select("id, name")
    .eq("tenant_id", tenantId);
  if (flowListError) throw flowListError;
  const existingFlow = (flowRows ?? []).find(
    (row) => normalizeFlowNameKey(String(row.name)) === normalizeFlowNameKey(snapshot.name)
  );

  let flowId: string;
  if (existingFlow) {
    flowId = String(existingFlow.id);
  } else {
    const library = await resolveOnboardingLibraryForFlows(db, tenantId, { librarySlug: "onboarding" });
    flowId = (
      await flows.createOnboardingFlow(db, tenantId, {
        name: snapshot.name,
        libraryId: library?.id ?? null,
        createAsBlank: true,
        status: "unpublished",
        createdBy: actor,
      })
    ).id;
  }
  console.log(`\n${existingFlow ? "Updating" : "Created"} flow ${flowId}`);

  await flows.updateOnboardingFlow(db, tenantId, flowId, {
    name: snapshot.name,
    status: "published",
    builderDraft: draft,
    updatedBy: actor,
  });

  if (snapshot.employmentType) {
    const { error } = await sb
      .from("onboarding_flows")
      .update({ employment_type: snapshot.employmentType })
      .eq("id", flowId)
      .eq("tenant_id", tenantId);
    if (error) throw error;
  }

  await publishOnboardingFromWorkflow(db, tenantId, draft, actor, snapshot.name);
  const synced = await syncActiveWorkflowInstancesToDraft(db, {
    tenantId,
    flowId,
    draft,
    flowName: snapshot.name,
  });

  const saved = await flows.getOnboardingFlowById(db, tenantId, flowId);
  if (!saved || saved.status !== "published") {
    throw new Error("Flow was saved but is not published");
  }
  console.log("\nPublished:");
  console.log(`  Name:       ${saved.name}`);
  console.log(`  Steps:      ${saved.builderDraft.nodes.map((n) => n.label).join(" -> ")}`);
  console.log(`  Candidates: ${JSON.stringify(synced)}`);
  console.log(`  Builder:    /admin_recruiter/dashboard/onboarding-builder?flow=${flowId}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });

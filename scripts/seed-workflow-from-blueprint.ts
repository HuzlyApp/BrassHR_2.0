/**
 * Create (or update) and publish an onboarding workflow for a tenant from a JSON blueprint.
 *
 * Uses the same services as the Automation > Workflows builder (Publish) and the
 * Template Builder (document upload + publish), so the result is an ordinary flow
 * that admins can keep editing in the UI. Safe to re-run: the flow and signature
 * templates are matched by name and updated in place.
 *
 *   npx -y tsx --conditions=react-server scripts/seed-workflow-from-blueprint.ts \
 *     --blueprint scripts/workflow-blueprints/aya-nexus-eor.json --tenant testcompany [--dry-run]
 *
 * Options:
 *   --blueprint <path>     Blueprint JSON (required)
 *   --tenant <slug>        Tenant slug (required)
 *   --actor-email <email>  Staff user recorded as creator (default: first active tenant admin)
 *   --env-file <path>      Env file with Supabase/Firma credentials (default: .env.local)
 *   --dry-run              Validate and print the plan without writing anything
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";

type StepPhase = "pre_hire" | "transition" | "post_hire";

type BlueprintTemplate = {
  key: string;
  name: string;
  category?: string;
  description?: string;
  sourceFile?: string;
  expirationHours?: number;
};

type BlueprintStep = {
  libraryKey: string;
  label?: string;
  description?: string;
  phase: StepPhase;
  stage: string;
  owner: string;
  required?: boolean;
  day?: number;
  signatureTemplate?: string;
  settings?: Record<string, unknown>;
};

type BlueprintDocument = {
  code: string;
  name: string;
  isRequired?: boolean;
  hasExpiration?: boolean;
  collectIssuingOrganization?: boolean;
  collectScope?: boolean;
  collectValidity?: boolean;
  sortOrder?: number;
};

type Blueprint = {
  key: string;
  name: string;
  employmentType?: string;
  librarySlug?: string;
  stepDefaults?: Record<string, unknown>;
  templates?: BlueprintTemplate[];
  documents?: BlueprintDocument[];
  steps: BlueprintStep[];
};

type ResolvedTemplate = { id: string; name: string; action: string };

const PHASE_ORDER: Record<StepPhase, number> = { pre_hire: 1, transition: 2, post_hire: 3 };

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

function contentTypeFor(file: string): string {
  const ext = extname(file).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  throw new Error(`Only PDF and DOCX documents are supported: ${file}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const dryRun = args["dry-run"] === true;
  const blueprintPath = resolve(root, requireString(args, "blueprint"));
  const tenantSlug = requireString(args, "tenant");
  const envFile = resolve(root, typeof args["env-file"] === "string" ? args["env-file"] : ".env.local");

  loadEnvFile(envFile);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const blueprint = JSON.parse(readFileSync(blueprintPath, "utf8")) as Blueprint;
  if (!blueprint.name?.trim() || !Array.isArray(blueprint.steps) || !blueprint.steps.length) {
    throw new Error("Blueprint needs a name and at least one step");
  }

  // App modules read process.env at import time, so load them after the env file.
  const { createClient } = await import("@supabase/supabase-js");
  const { loadOnboardingStepLibrary } = await import("@/lib/onboarding/load-step-library");
  const { normalizeWorkflowNodeSettings } = await import("@/lib/onboarding/normalize-workflow-settings");
  const { validateWorkflowPhaseLayout } = await import("@/lib/onboarding/validate-workflow-phases");
  const { isFirmaAttachableWorkflowStepId } = await import("@/lib/onboarding/firma-step-settings");
  const { resolveOnboardingLibraryForFlows } = await import("@/lib/onboarding/onboarding-libraries");
  const { normalizeFlowNameKey } = await import("@/lib/onboarding/validate-flow-name");
  const flows = await import("@/lib/onboarding/onboarding-flows");
  const { publishOnboardingFromWorkflow } = await import(
    "@/lib/onboarding/publish-onboarding-from-workflow"
  );
  const templateService = await import("@/lib/recruiter-templates/service");
  const templateConstants = await import("@/lib/recruiter-templates/constants");

  type OnboardingDbClient = import("@/lib/onboarding/load-tenant-config").OnboardingDbClient;
  type StepSettings = import("@/app/components/workflow-builder/types").StepSettings;
  type SerializableWorkflowState =
    import("@/lib/onboarding/workflow-builder-serialization").SerializableWorkflowState;
  type RecruiterTemplateCategory = import("@/lib/recruiter-templates/constants").RecruiterTemplateCategory;

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const db = sb as unknown as OnboardingDbClient;

  console.log(`Target:    ${supabaseUrl}`);
  console.log(`Blueprint: ${blueprint.name} (${blueprint.steps.length} steps)`);
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
  const libraryByKey = new Map(
    libraryCategories.flatMap((category) => category.steps.map((step) => [step.id, step] as const))
  );

  const templateDefs = new Map((blueprint.templates ?? []).map((t) => [t.key, t]));
  const problems: string[] = [];
  blueprint.steps.forEach((step, index) => {
    const where = `step ${index + 1} (${step.libraryKey})`;
    if (!libraryByKey.has(step.libraryKey)) {
      problems.push(`${where}: not in this tenant's step library`);
    }
    if (!PHASE_ORDER[step.phase]) problems.push(`${where}: unknown phase "${step.phase}"`);
    if (step.signatureTemplate) {
      if (!templateDefs.has(step.signatureTemplate)) {
        problems.push(`${where}: unknown signature template "${step.signatureTemplate}"`);
      }
      if (!isFirmaAttachableWorkflowStepId(step.libraryKey)) {
        problems.push(`${where}: this library step cannot carry an e-signature template`);
      }
    }
  });
  for (const def of templateDefs.values()) {
    if (def.category && !(templateConstants.RECRUITER_TEMPLATE_CATEGORIES as readonly string[]).includes(def.category)) {
      problems.push(`template ${def.key}: unknown category "${def.category}"`);
    }
    if (def.sourceFile && !existsSync(resolve(root, def.sourceFile))) {
      problems.push(`template ${def.key}: source file not found (${def.sourceFile})`);
    }
  }
  const documentCode = /^[A-Z][A-Z0-9_]{1,62}$/;
  for (const doc of blueprint.documents ?? []) {
    if (!documentCode.test(doc.code?.trim().toUpperCase() ?? "")) {
      problems.push(`document ${doc.code || "(blank)"}: code must be uppercase letters, numbers, and underscores`);
    }
    if (!doc.name?.trim()) problems.push(`document ${doc.code}: name is required`);
  }
  if (problems.length) {
    throw new Error(`Blueprint is not valid for this tenant:\n  - ${problems.join("\n  - ")}`);
  }

  const defaultRoles = templateConstants.SIGNING_ROLE_KEYS.map((roleKey, index) => ({
    role_key: roleKey,
    label: templateConstants.SIGNING_ROLE_LABELS[roleKey],
    designation: "Signer" as const,
    signing_order: index + 1,
  }));

  async function resolveTemplate(def: BlueprintTemplate): Promise<ResolvedTemplate | null> {
    const { data: rows, error } = await sb
      .from("recruiter_templates")
      .select("id, name, status, firma_template_id, document_storage_path")
      .eq("tenant_id", tenantId)
      .neq("status", "archived");
    if (error) throw error;
    const existing = (rows ?? []).find(
      (row) => normalizeFlowNameKey(String(row.name)) === normalizeFlowNameKey(def.name)
    );

    if (existing && existing.status === "active" && existing.firma_template_id) {
      return { id: String(existing.id), name: String(existing.name), action: "reused (already published)" };
    }
    if (!def.sourceFile) {
      if (existing) {
        console.warn(`  ! "${def.name}" exists but is not published; publish it in Template Builder.`);
      } else {
        console.warn(`  ! "${def.name}" not found and the blueprint has no source file to create it.`);
      }
      return null;
    }
    if (dryRun) {
      return { id: "(new)", name: def.name, action: existing ? "would finish publishing" : "would create + publish" };
    }

    let templateId = existing?.id ? String(existing.id) : null;
    if (!templateId) {
      const created = await templateService.createRecruiterTemplate(
        sb,
        tenantId,
        {
          name: def.name,
          description: def.description ?? null,
          category: def.category as RecruiterTemplateCategory,
          expiration_hours: def.expirationHours ?? 168,
          roles: defaultRoles,
          fields: [],
        },
        actor
      );
      templateId = created.id;
    }

    const sourcePath = resolve(root, def.sourceFile);
    const contentType = contentTypeFor(sourcePath);
    const storagePath = `${tenantId}/${templateId}/document.${contentType.includes("pdf") ? "pdf" : "docx"}`;
    const { error: uploadError } = await sb.storage
      .from(templateConstants.RECRUITER_TEMPLATE_DOCUMENT_BUCKET)
      .upload(storagePath, readFileSync(sourcePath), { contentType, upsert: true });
    if (uploadError) throw new Error(`Upload failed for ${def.name}: ${uploadError.message}`);

    const { error: pathError } = await sb
      .from("recruiter_templates")
      .update({
        document_storage_path: storagePath,
        document_file_name: basename(sourcePath),
        updated_by: actor,
      })
      .eq("id", templateId)
      .eq("tenant_id", tenantId);
    if (pathError) throw pathError;

    const published = await templateService.publishRecruiterTemplate(sb, tenantId, templateId, actor);
    return {
      id: published.id,
      name: published.name,
      action: existing ? "finished publishing" : "created + published",
    };
  }

  console.log("\nSignature templates:");
  const resolvedTemplates = new Map<string, ResolvedTemplate | null>();
  for (const def of templateDefs.values()) {
    try {
      const resolved = await resolveTemplate(def);
      resolvedTemplates.set(def.key, resolved);
      console.log(`  - ${def.name}: ${resolved ? resolved.action : "not attached"}`);
    } catch (err) {
      resolvedTemplates.set(def.key, null);
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`  ! ${def.name}: not attached (${reason}). Fix the document and re-run.`);
    }
  }

  const idPrefix = blueprint.key.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const nodes = blueprint.steps.map((step, index) => {
    const library = libraryByKey.get(step.libraryKey)!;
    const required = step.required !== false;
    const day = step.day ?? (step.phase === "post_hire" ? 2 : 1);
    const template = step.signatureTemplate ? resolvedTemplates.get(step.signatureTemplate) : null;
    const settings = {
      ...normalizeWorkflowNodeSettings(
        {
          ...(blueprint.stepDefaults ?? {}),
          ...(step.settings ?? {}),
          phase: step.phase,
          phaseOrder: PHASE_ORDER[step.phase],
          stepOrder: index + 1,
          completionOwner: step.owner,
          firmaRecruiterTemplateId: template && template.id !== "(new)" ? template.id : "",
          firmaRecruiterTemplateName: template?.name ?? "",
        } as Partial<StepSettings>,
        { required, day }
      ),
      stageName: step.stage,
    };
    return {
      id: `${idPrefix}-${String(index + 1).padStart(2, "0")}`,
      stepId: step.libraryKey,
      label: step.label?.trim() || library.label,
      description: step.description ?? library.description ?? null,
      position: { x: 120, y: 40 + index * 140 },
      day,
      required,
      settings: settings as StepSettings,
    };
  });
  const edges = nodes.slice(1).map((node, index) => ({
    id: `e-${nodes[index].id}-${node.id}`,
    source: nodes[index].id,
    target: node.id,
  }));
  const draft: SerializableWorkflowState = { nodes, edges };

  const phaseErrors = validateWorkflowPhaseLayout(draft);
  if (phaseErrors.length) {
    throw new Error(`Workflow cannot be published: ${phaseErrors.map((e) => e.message).join("; ")}`);
  }

  console.log("\nPlan:");
  let lastStage = "";
  for (const node of nodes) {
    const stage = String((node.settings as StepSettings & { stageName?: string }).stageName);
    if (stage !== lastStage) {
      console.log(`  [${node.settings.phase}] ${stage}`);
      lastStage = stage;
    }
    const esign = node.settings.firmaRecruiterTemplateName
      ? `  e-sign: ${node.settings.firmaRecruiterTemplateName}`
      : "";
    console.log(
      `      - ${node.label}${node.required ? "" : " (optional)"}  <${node.stepId}, ${node.settings.completionOwner}>${esign}`
    );
  }

  const documents = blueprint.documents ?? [];
  if (documents.length) {
    console.log("\nDocuments:");
    for (const doc of documents) {
      const expiry = doc.hasExpiration ? "expiry required" : "no expiry";
      const required = doc.isRequired === false ? "optional" : "required";
      console.log(`  - ${doc.name} (${doc.code}) ${required}, ${expiry}`);
    }
  }

  if (dryRun) {
    console.log("\nDry run complete. Nothing was written.");
    return;
  }

  const library = await resolveOnboardingLibraryForFlows(db, tenantId, {
    librarySlug: blueprint.librarySlug ?? "onboarding",
  });
  const { data: flowRows, error: flowListError } = await sb
    .from("onboarding_flows")
    .select("id, name")
    .eq("tenant_id", tenantId);
  if (flowListError) throw flowListError;
  const existingFlow = (flowRows ?? []).find(
    (row) => normalizeFlowNameKey(String(row.name)) === normalizeFlowNameKey(blueprint.name)
  );

  const flowId = existingFlow
    ? String(existingFlow.id)
    : (
        await flows.createOnboardingFlow(db, tenantId, {
          name: blueprint.name,
          libraryId: library?.id ?? null,
          createAsBlank: true,
          status: "unpublished",
          createdBy: actor,
        })
      ).id;
  console.log(`\n${existingFlow ? "Updating" : "Created"} flow ${flowId}`);

  await flows.updateOnboardingFlow(db, tenantId, flowId, {
    name: blueprint.name,
    status: "published",
    builderDraft: draft,
    updatedBy: actor,
  });

  if (blueprint.employmentType) {
    const { error } = await sb
      .from("onboarding_flows")
      .update({ employment_type: blueprint.employmentType })
      .eq("id", flowId)
      .eq("tenant_id", tenantId);
    if (error) throw error;
  }

  if (documents.length) {
    const { data: existingDocs, error: docsError } = await sb
      .from("workflow_required_documents")
      .select("id, code")
      .eq("tenant_id", tenantId)
      .eq("flow_id", flowId);
    if (docsError) throw docsError;
    const existingByCode = new Map(
      (existingDocs ?? []).map((row) => [String(row.code).toUpperCase(), String(row.id)])
    );
    for (const [index, doc] of documents.entries()) {
      const code = doc.code.trim().toUpperCase();
      const row = {
        name: doc.name.trim(),
        is_required: doc.isRequired !== false,
        has_expiration: doc.hasExpiration === true,
        collect_issuing_organization: doc.collectIssuingOrganization === true,
        collect_scope: doc.collectScope === true,
        collect_validity: doc.collectValidity === true || doc.hasExpiration === true,
        sort_order: doc.sortOrder ?? (index + 1) * 10,
        is_active: true,
      };
      const existingId = existingByCode.get(code);
      if (existingId) {
        const { error } = await sb
          .from("workflow_required_documents")
          .update(row)
          .eq("id", existingId)
          .eq("tenant_id", tenantId);
        if (error) throw error;
      } else {
        const { error } = await sb.from("workflow_required_documents").insert({
          ...row,
          tenant_id: tenantId,
          flow_id: flowId,
          code,
        });
        if (error) throw error;
      }
    }
    console.log(`Documents:  ${documents.length} saved on the flow`);
  }

  await publishOnboardingFromWorkflow(db, tenantId, draft, actor, blueprint.name);

  const saved = await flows.getOnboardingFlowById(db, tenantId, flowId);
  if (!saved || saved.status !== "published") {
    throw new Error("Flow was saved but is not published");
  }
  const savedSigning = saved.builderDraft.nodes.filter((n) => n.settings?.firmaRecruiterTemplateId);
  const countBy = (phase: StepPhase) => saved.builderDraft.nodes.filter((n) => n.settings?.phase === phase).length;

  console.log("\nPublished:");
  console.log(`  Name:          ${saved.name}`);
  console.log(`  Status:        ${saved.status}`);
  console.log(`  Pre-Hire:      ${countBy("pre_hire")} steps + ${countBy("transition")} phase gate`);
  console.log(`  Post-Hire:     ${countBy("post_hire")} steps`);
  console.log(`  E-sign steps:  ${savedSigning.map((n) => `${n.label} -> ${n.settings.firmaRecruiterTemplateName}`).join("; ") || "none"}`);
  console.log(`  Builder:       /admin_recruiter/dashboard/onboarding-builder?flow=${flowId}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });

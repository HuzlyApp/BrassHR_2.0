/**
 * Seed + publish "W2 workflow new Edition" for hire-journey QA.
 * Usage: node scripts/seed-w2-workflow-new-edition.mjs
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

function settings(partial) {
  return {
    phase: "pre_hire",
    phaseOrder: 1,
    stepOrder: 1,
    required: true,
    isConditional: false,
    unlockCondition: "",
    completionOwner: "applicant",
    clientPerforms: true,
    useBraasPartner: true,
    notifyHrOnFail: true,
    datePriority: "Day 1",
    provider: "Checker (connected)",
    triggerAfter: "Offer Acceptance",
    notify: "HR + Recruiter",
    timeline: "5 business days",
    conditionalLogic: "If result = fail → Pause flow + notify",
    firmaRecruiterTemplateId: "",
    firmaRecruiterTemplateName: "",
    ...partial,
  };
}

/**
 * Figma "Pre-hire - Sample 01" canvas (Skill Assessment once) + lean Post-Hire.
 * Day labels match Figma node subtitles.
 */
const STEPS = [
  // —— Pre-hire (Figma Sample 01) ——
  {
    stepId: "collect-extra-files",
    label: "Collect Extra Files",
    description: "Collect additional intake documents required by the job.",
    required: true,
    day: 1,
    settings: settings({
      phase: "pre_hire",
      phaseOrder: 1,
      stepOrder: 1,
      datePriority: "Day 1",
      completionOwner: "applicant",
    }),
  },
  {
    stepId: "references-collection",
    label: "Collect References",
    description: "Collect professional references.",
    required: true,
    day: 0,
    settings: settings({
      phase: "pre_hire",
      phaseOrder: 1,
      stepOrder: 2,
      // Canvas shows Day 0 (Figma); Date Priority dropdown only supports Day 1+
      datePriority: "Day 1",
      completionOwner: "applicant",
    }),
  },
  // Skill / Qualification Assessment — once only (Figma mock showed a duplicate; omit it)
  {
    stepId: "skill-qualification-assessment",
    label: "Skill / Qualification Assessment",
    description: "Assess applicant skills and qualifications.",
    required: true,
    day: 0,
    settings: settings({
      phase: "pre_hire",
      phaseOrder: 1,
      stepOrder: 3,
      datePriority: "Day 1",
      completionOwner: "applicant",
    }),
  },
  {
    stepId: "interview-qualification",
    label: "Interview / Qualification",
    description: "Schedule and complete interview / qualification review.",
    required: true,
    day: 0,
    settings: settings({
      phase: "pre_hire",
      phaseOrder: 1,
      stepOrder: 4,
      datePriority: "Day 1",
      completionOwner: "recruiter_or_hr",
    }),
  },
  {
    stepId: "release-to-client",
    label: "Sent to Client / MSP",
    description: "Prepare and send candidate profile to client / MSP.",
    required: true,
    day: 0,
    settings: settings({
      phase: "pre_hire",
      phaseOrder: 1,
      stepOrder: 5,
      datePriority: "Day 1",
      completionOwner: "recruiter_or_hr",
    }),
  },
  {
    stepId: "background-check",
    label: "Background Check",
    description: "Collect authorization and trigger configured background check.",
    required: true,
    day: 0,
    settings: settings({
      phase: "pre_hire",
      phaseOrder: 1,
      stepOrder: 6,
      datePriority: "Day 1",
      completionOwner: "recruiter_or_hr",
    }),
  },
  {
    stepId: "credential-license-verification",
    label: "Credential / License Verification",
    description: "Collect and verify professional license credentials.",
    required: true,
    day: 0,
    settings: settings({
      phase: "pre_hire",
      phaseOrder: 1,
      stepOrder: 7,
      datePriority: "Day 1",
      completionOwner: "applicant",
    }),
  },
  {
    stepId: "drug-test-screening",
    label: "Drug Test / Screening",
    description: "Run drug screening when required by job/facility.",
    required: true,
    day: 0,
    settings: settings({
      phase: "pre_hire",
      phaseOrder: 1,
      stepOrder: 8,
      datePriority: "Day 1",
      completionOwner: "recruiter_or_hr",
    }),
  },
  {
    stepId: "completion-milestone",
    label: "Complete",
    description: "Mark Pre-Hire complete and unlock Post-Hire after conversion.",
    required: true,
    day: 0,
    settings: settings({
      phase: "transition",
      phaseOrder: 2,
      stepOrder: 9,
      datePriority: "Day 1",
      completionOwner: "authorized_internal",
      unlockCondition: "all_required_pre_hire_complete",
    }),
  },

  // —— Lean Post-Hire (kept so Post-Hire tab still has real steps) ——
  {
    stepId: "tax-forms",
    label: "W-4 / State Tax",
    description: "Collect federal/state tax forms.",
    required: true,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 10,
      datePriority: "Day 2",
      completionOwner: "applicant",
    }),
  },
  {
    stepId: "direct-deposit-setup",
    label: "Direct Deposit Setup",
    description: "Collect payroll banking details.",
    required: true,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 11,
      datePriority: "Day 2",
      completionOwner: "applicant",
    }),
  },
  {
    stepId: "i9-right-to-work-verification",
    label: "I-9 / E-Verify",
    description: "Collect and track right-to-work documentation.",
    required: true,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 12,
      datePriority: "Day 2",
      completionOwner: "applicant_or_hr",
    }),
  },
  {
    stepId: "policy-acknowledgment",
    label: "Handbook / Policy Acknowledgment",
    description: "Collect policy acknowledgments.",
    required: true,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 13,
      datePriority: "Day 2",
      completionOwner: "applicant",
    }),
  },
  {
    stepId: "completion-milestone",
    label: "Onboarding Complete",
    description: "Mark onboarding complete and activate W2 worker status.",
    required: true,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 14,
      datePriority: "Day 2",
      completionOwner: "authorized_internal",
    }),
  },
];

function buildDraft() {
  const nodes = STEPS.map((step, index) => ({
    id: `w2ne-${String(index + 1).padStart(2, "0")}`,
    stepId: step.stepId,
    label: step.label,
    description: step.description,
    position: { x: 120, y: 40 + index * 140 },
    day: step.day,
    required: step.required,
    settings: {
      ...step.settings,
      required: step.required,
      stepOrder: index + 1,
    },
  }));

  const edges = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({
      id: `e-${nodes[i].id}-${nodes[i + 1].id}`,
      source: nodes[i].id,
      target: nodes[i + 1].id,
    });
  }

  return { nodes, edges };
}

async function main() {
  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const flowName = "W2 workflow new Edition";
  const draft = buildDraft();

  const { data: tenants, error: tenantsError } = await sb
    .from("tenants")
    .select("id, name")
    .order("created_at", { ascending: true });
  if (tenantsError) throw tenantsError;
  if (!tenants?.length) throw new Error("No tenants found");

  const preferred =
    tenants.find((t) => /test company/i.test(String(t.name ?? ""))) ??
    tenants.find((t) => /test/i.test(String(t.name ?? ""))) ??
    tenants[0];

  console.log(`Using tenant: ${preferred.name} (${preferred.id})`);
  console.log(`Host: ${url}`);
  console.log(`Steps in draft: ${draft.nodes.length}`);

  const { data: libraries } = await sb
    .from("onboarding_libraries")
    .select("id, name, slug, is_uncategorized")
    .eq("tenant_id", preferred.id);
  const library =
    (libraries ?? []).find((l) => l.slug === "onboarding" && !l.is_uncategorized) ??
    (libraries ?? []).find((l) => /onboarding/i.test(String(l.name ?? "")) && !l.is_uncategorized) ??
    (libraries ?? []).find((l) => !l.is_uncategorized) ??
    null;

  const { data: existing } = await sb
    .from("onboarding_flows")
    .select("id, name, status")
    .eq("tenant_id", preferred.id)
    .ilike("name", flowName)
    .maybeSingle();

  let flowId = existing?.id ?? null;

  if (flowId) {
    console.log(`Updating existing flow ${flowId}`);
    const { error: updateError } = await sb
      .from("onboarding_flows")
      .update({
        name: flowName,
        status: "published",
        employment_type: "W2",
        builder_draft: draft,
        library_id: library?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", flowId)
      .eq("tenant_id", preferred.id);
    if (updateError) throw updateError;
  } else {
    const insertPayload = {
      tenant_id: preferred.id,
      library_id: library?.id ?? null,
      name: flowName,
      status: "published",
      employment_type: "W2",
      created_as_blank: false,
      builder_draft: draft,
      sort_order: 100,
    };
    const { data: created, error: createError } = await sb
      .from("onboarding_flows")
      .insert(insertPayload)
      .select("id, name, status")
      .single();
    if (createError) throw createError;
    flowId = created.id;
    console.log(`Created flow ${flowId}`);
  }

  const { error: deleteError } = await sb.from("onboarding_flow_steps").delete().eq("flow_id", flowId);
  if (deleteError) throw deleteError;

  const stepRows = draft.nodes.map((node, index) => {
    const phase = String(node.settings?.phase ?? "pre_hire");
    return {
      flow_id: flowId,
      step_type: node.stepId,
      title: node.label,
      description: node.description ?? null,
      position: index + 1,
      parent_step_id: null,
      day: node.day,
      is_required: node.required !== false,
      phase: phase === "post_hire" ? "post_hire" : phase === "transition" ? "transition" : "pre_hire",
      phase_order:
        typeof node.settings?.phaseOrder === "number" ? node.settings.phaseOrder : phase === "post_hire" ? 3 : 1,
      step_order: typeof node.settings?.stepOrder === "number" ? node.settings.stepOrder : index + 1,
      is_conditional: node.settings?.isConditional === true,
      unlock_condition: node.settings?.unlockCondition || null,
      completion_owner: node.settings?.completionOwner || null,
      settings: node.settings,
      metadata: {
        library_step_key: node.stepId,
        parent_canvas_node_id: index > 0 ? draft.nodes[index - 1].id : null,
      },
      canvas_node_id: node.id,
    };
  });

  const { data: inserted, error: insertStepsError } = await sb
    .from("onboarding_flow_steps")
    .insert(stepRows)
    .select("id, canvas_node_id, title, phase, step_type");
  if (insertStepsError) throw insertStepsError;

  const byCanvas = new Map((inserted ?? []).map((row) => [row.canvas_node_id, row.id]));
  for (let i = 1; i < draft.nodes.length; i++) {
    const selfId = byCanvas.get(draft.nodes[i].id);
    const parentId = byCanvas.get(draft.nodes[i - 1].id);
    if (!selfId || !parentId) continue;
    const { error: parentError } = await sb
      .from("onboarding_flow_steps")
      .update({ parent_step_id: parentId })
      .eq("id", selfId);
    if (parentError) throw parentError;
  }

  // Prefer this flow for W2 mappings on this tenant (so new W2 jobs can resolve it).
  const { data: existingMaps, error: mapListError } = await sb
    .from("workflow_mappings")
    .select("id, workflow_id, employment_type, is_active, priority")
    .eq("tenant_id", preferred.id)
    .eq("employment_type", "W2");
  if (mapListError) throw mapListError;

  const openMap =
    (existingMaps ?? []).find((m) => m.workflow_id === flowId) ??
    (existingMaps ?? []).find((m) => m.is_active) ??
    null;

  if (openMap) {
    const { error: mapUpdateError } = await sb
      .from("workflow_mappings")
      .update({
        workflow_id: flowId,
        is_active: true,
        priority: 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", openMap.id);
    if (mapUpdateError) throw mapUpdateError;
    console.log(`Updated W2 workflow mapping ${openMap.id} → this flow`);
  } else {
    const { error: mapInsertError } = await sb.from("workflow_mappings").insert({
      tenant_id: preferred.id,
      workflow_id: flowId,
      employment_type: "W2",
      is_active: true,
      priority: 1,
    });
    if (mapInsertError) {
      console.warn("Could not create workflow mapping (you can map manually):", mapInsertError.message);
    } else {
      console.log("Created active W2 workflow mapping → this flow");
    }
  }

  const preHire = (inserted ?? []).filter((s) => s.phase === "pre_hire" || s.phase === "transition");
  const postHire = (inserted ?? []).filter((s) => s.phase === "post_hire");
  const interview = (inserted ?? []).filter((s) => /interview|internal-select/i.test(`${s.step_type} ${s.title}`));
  const submission = (inserted ?? []).filter((s) =>
    /release-to-client|client-review|submission|msp/i.test(`${s.step_type} ${s.title}`)
  );

  console.log("\nPublished successfully");
  console.log(`Flow ID: ${flowId}`);
  console.log(`Name: ${flowName}`);
  console.log(`Status: published`);
  console.log(`Pre-Hire (+ transition) steps: ${preHire.length}`);
  console.log(`Post-Hire steps: ${postHire.length}`);
  console.log(`Interview-related steps: ${interview.map((s) => s.title).join(", ") || "(none)"}`);
  console.log(`Submission-related steps: ${submission.map((s) => s.title).join(", ") || "(none)"}`);
  console.log(
    `\nOpen: /admin_recruiter/dashboard/onboarding-builder?flow=${flowId}`
  );
  console.log(
    "Create a new W2 job (or map this workflow), add a candidate, then open hire-journey to verify Figma Sample 01 Pre-Hire nodes."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

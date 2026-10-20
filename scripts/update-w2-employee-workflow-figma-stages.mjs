/**
 * Rearrange + publish "W2 Employee Workflow" Pre-Hire to match Figma Steps Library stages:
 * Intake → Screening → Interview → Submission → Compliance → Offer & Agreement → Approvals
 *
 * Usage: node scripts/update-w2-employee-workflow-figma-stages.mjs
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

/** Figma Steps Library Pre-Hire order for W2 Employee Workflow. */
const PRE_HIRE_STEPS = [
  // Intake
  {
    stepId: "resume-basic-profile",
    label: "Resume & Basic Profile",
    description: "Collect resume, name, contact, address, and applicant profile.",
    required: true,
    day: 1,
    settings: settings({
      stageName: "Intake",
      stepOrder: 1,
      completionOwner: "applicant",
    }),
  },
  {
    stepId: "parameterized-job-application",
    label: "Parameterized Job Application",
    description: "Persist requisition, profession, specialty, location, and W2 classification.",
    required: true,
    day: 1,
    settings: settings({
      stageName: "Intake",
      stepOrder: 2,
      completionOwner: "applicant",
    }),
  },
  {
    stepId: "collect-extra-files",
    label: "Collect Extra Files",
    description: "Collect additional intake documents required by the job.",
    required: false,
    day: 1,
    settings: settings({
      stageName: "Intake",
      stepOrder: 3,
      required: false,
      completionOwner: "applicant",
      isConditional: true,
      unlockCondition: "extra_files_configured",
    }),
  },
  {
    stepId: "references-collection",
    label: "Collect References",
    description: "Collect professional references.",
    required: true,
    day: 0,
    settings: settings({
      stageName: "Intake",
      stepOrder: 4,
      datePriority: "Day 1",
      completionOwner: "applicant",
    }),
  },
  {
    stepId: "custom-form",
    label: "Custom Form",
    description: "Tenant-configured extra intake form.",
    required: false,
    day: 0,
    settings: settings({
      stageName: "Intake",
      stepOrder: 5,
      required: false,
      datePriority: "Day 1",
      completionOwner: "applicant",
      isConditional: true,
      unlockCondition: "custom_form_configured",
    }),
  },

  // Screening
  {
    stepId: "recruiter-screening",
    label: "Recruiter Screening",
    description: "Recruiter completes screening checklist and notes.",
    required: true,
    day: 0,
    settings: settings({
      stageName: "Screening",
      stepOrder: 6,
      datePriority: "Day 1",
      completionOwner: "recruiter_or_hr",
    }),
  },
  {
    stepId: "skill-qualification-assessment",
    label: "Skill / Qualification Assessment",
    description: "Assess applicant skills and qualifications.",
    required: true,
    day: 0,
    settings: settings({
      stageName: "Screening",
      stepOrder: 7,
      datePriority: "Day 1",
      completionOwner: "applicant",
    }),
  },
  {
    stepId: "reference-verification",
    label: "Reference Verification",
    description: "Recruiter or HR verifies submitted references.",
    required: true,
    day: 0,
    settings: settings({
      stageName: "Screening",
      stepOrder: 8,
      datePriority: "Day 1",
      completionOwner: "recruiter_or_hr",
    }),
  },

  // Interview
  {
    stepId: "interview-qualification",
    label: "Interview / Qualification",
    description: "Schedule and complete interview / qualification review.",
    required: true,
    day: 0,
    settings: settings({
      stageName: "Interview",
      stepOrder: 9,
      datePriority: "Day 1",
      completionOwner: "recruiter_or_hr",
    }),
  },
  {
    stepId: "internal-select",
    label: "Internal Select",
    description: "Internal decision to select the candidate for offer path.",
    required: true,
    day: 0,
    settings: settings({
      stageName: "Interview",
      stepOrder: 10,
      datePriority: "Day 1",
      completionOwner: "recruiter_or_hr",
    }),
  },

  // Submission
  {
    stepId: "release-to-client",
    label: "Sent to Client / MSP",
    description: "Prepare and send candidate profile to client / MSP.",
    required: true,
    day: 0,
    settings: settings({
      stageName: "Submission",
      stepOrder: 11,
      datePriority: "Day 1",
      completionOwner: "recruiter_or_hr",
    }),
  },
  {
    stepId: "client-review",
    label: "Released to Client",
    description: "Track client review / release outcome.",
    required: false,
    day: 0,
    settings: settings({
      stageName: "Submission",
      stepOrder: 12,
      required: false,
      datePriority: "Day 1",
      completionOwner: "recruiter_or_hr",
      isConditional: true,
      unlockCondition: "client_review_required",
    }),
  },

  // Compliance
  {
    stepId: "background-check",
    label: "Background Check",
    description: "Collect authorization and trigger configured background check.",
    required: true,
    day: 0,
    settings: settings({
      stageName: "Compliance",
      stepOrder: 13,
      datePriority: "Day 1",
      completionOwner: "recruiter_or_hr",
    }),
  },
  {
    stepId: "drug-test-screening",
    label: "Drug Test / Screening",
    description: "Run drug screening when required by job/facility.",
    required: false,
    day: 0,
    settings: settings({
      stageName: "Compliance",
      stepOrder: 14,
      required: false,
      datePriority: "Day 1",
      completionOwner: "recruiter_or_hr",
      isConditional: true,
      unlockCondition: "job_or_facility_requires_drug_test",
    }),
  },
  {
    stepId: "oig-exclusion-check",
    label: "OIG / Exclusion Check",
    description: "Run OIG / exclusion screening for applicable roles.",
    required: true,
    day: 0,
    settings: settings({
      stageName: "Compliance",
      stepOrder: 15,
      datePriority: "Day 1",
      completionOwner: "recruiter_or_hr",
      isConditional: true,
      unlockCondition: "healthcare_role",
    }),
  },
  {
    stepId: "credential-license-verification",
    label: "Credential / License Verification",
    description: "Collect and verify professional license credentials.",
    required: true,
    day: 0,
    settings: settings({
      stageName: "Compliance",
      stepOrder: 16,
      datePriority: "Day 1",
      completionOwner: "applicant",
      isConditional: true,
      unlockCondition: "role_requires_license",
    }),
  },
  {
    stepId: "ssn-identity-verification",
    label: "SSN / Identity Verification",
    description: "Collect minimum required identity details.",
    required: true,
    day: 0,
    settings: settings({
      stageName: "Compliance",
      stepOrder: 17,
      datePriority: "Day 1",
      completionOwner: "applicant",
    }),
  },
  {
    stepId: "adverse-action-process",
    label: "Adverse Action Process",
    description: "Start adverse action path when a compliance check fails.",
    required: false,
    day: 0,
    settings: settings({
      stageName: "Compliance",
      stepOrder: 18,
      required: false,
      datePriority: "Day 1",
      completionOwner: "hr_admin",
      isConditional: true,
      unlockCondition: "compliance_check_failed",
    }),
  },

  // Offer & Agreement
  {
    stepId: "pay-and-start-date",
    label: "Pay and Start Date",
    description: "Confirm pay and expected start date before offer.",
    required: true,
    day: 0,
    settings: settings({
      stageName: "Offer & Agreement",
      stepOrder: 19,
      datePriority: "Day 1",
      completionOwner: "recruiter_or_hr",
    }),
  },
  {
    stepId: "employee-agreement",
    label: "Agreement eSign",
    description: "Load tenant W2 agreement and require e-sign.",
    required: true,
    day: 0,
    settings: settings({
      stageName: "Offer & Agreement",
      stepOrder: 20,
      datePriority: "Day 1",
      completionOwner: "applicant",
    }),
  },
  {
    stepId: "offer-acceptance",
    label: "Pay Rate Accepted",
    description: "Capture W2 pay rate acceptance details and expiration.",
    required: true,
    day: 0,
    settings: settings({
      stageName: "Offer & Agreement",
      stepOrder: 21,
      datePriority: "Day 1",
      completionOwner: "applicant",
    }),
  },
  {
    stepId: "i9-section-1",
    label: "I-9 section 1",
    description: "Collect I-9 Section 1 employee attestation.",
    required: false,
    day: 0,
    settings: settings({
      stageName: "Offer & Agreement",
      stepOrder: 22,
      required: false,
      datePriority: "Day 1",
      completionOwner: "applicant",
      isConditional: true,
      unlockCondition: "i9_section_1_required",
    }),
  },

  // Approvals
  {
    stepId: "manager-facility-approval",
    label: "Facility Approval",
    description: "Require manager/facility approval when configured.",
    required: true,
    day: 0,
    settings: settings({
      stageName: "Approvals",
      stepOrder: 23,
      datePriority: "Day 1",
      completionOwner: "manager_or_facility",
      isConditional: true,
      unlockCondition: "manager_approval_required",
    }),
  },
  {
    stepId: "hr-final-approval",
    label: "HR Final Approval",
    description: "HR/Admin final decision before hire conversion.",
    required: true,
    day: 0,
    settings: settings({
      stageName: "Approvals",
      stepOrder: 24,
      datePriority: "Day 1",
      completionOwner: "hr_admin",
    }),
  },
  {
    stepId: "completion-milestone",
    label: "Complete",
    description: "Approve conversion to W2 worker and unlock Post-Hire.",
    required: true,
    day: 0,
    settings: settings({
      stageName: "Approvals",
      phase: "transition",
      phaseOrder: 2,
      stepOrder: 25,
      datePriority: "Day 1",
      completionOwner: "authorized_internal",
      unlockCondition: "all_required_pre_hire_complete",
    }),
  },
];

/** Keep existing Post-Hire defaults from W2 Employee Workflow preset. */
const POST_HIRE_STEPS = [
  {
    stepId: "i9-right-to-work-verification",
    label: "I-9 / Right to Work Verification",
    description: "Collect and track right-to-work documentation.",
    required: true,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 26,
      stageName: "Paperwork",
      datePriority: "Day 2",
      completionOwner: "applicant_or_hr",
    }),
  },
  {
    stepId: "tax-forms",
    label: "Tax Forms (W-4 / State)",
    description: "Collect federal/state tax forms and tenant tax docs.",
    required: true,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 27,
      datePriority: "Day 2",
      completionOwner: "applicant",
    }),
  },
  {
    stepId: "direct-deposit-setup",
    label: "Direct Deposit Setup",
    description: "Securely collect payroll banking details.",
    required: true,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 28,
      datePriority: "Day 2",
      completionOwner: "applicant",
    }),
  },
  {
    stepId: "pay-rate-hire-date",
    label: "Pay Rate & Hire Date Entry",
    description: "Verify pay rate, hire date, title, department, type, and location.",
    required: true,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 29,
      stageName: "Payroll & Pay",
      datePriority: "Day 2",
      completionOwner: "recruiter_or_hr",
    }),
  },
  {
    stepId: "payroll-profile-creation",
    label: "Payroll Profile Creation",
    description: "Create/sync worker payroll profile.",
    required: true,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 30,
      datePriority: "Day 2",
      completionOwner: "hr_or_payroll",
    }),
  },
  {
    stepId: "benefits-enrollment",
    label: "Benefits Enrollment / Selection",
    description: "Show when W2 worker is benefits-eligible.",
    required: false,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 31,
      required: false,
      datePriority: "Day 2",
      completionOwner: "applicant",
      isConditional: true,
      unlockCondition: "w2_benefits_eligible",
    }),
  },
  {
    stepId: "401k-enrollment",
    label: "401K / Retirement Enrollment",
    description: "Show when worker is retirement-eligible and offered by tenant.",
    required: false,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 32,
      required: false,
      datePriority: "Day 2",
      completionOwner: "applicant",
      isConditional: true,
      unlockCondition: "w2_401k_eligible",
    }),
  },
  {
    stepId: "policy-acknowledgment",
    label: "Policy Acknowledgment",
    description: "Collect policy acknowledgments.",
    required: true,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 33,
      datePriority: "Day 2",
      completionOwner: "applicant",
    }),
  },
  {
    stepId: "welcome-packet-esign",
    label: "Welcome Packet & eSign",
    description: "Deliver and collect onboarding packet signatures.",
    required: true,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 34,
      datePriority: "Day 2",
      completionOwner: "applicant",
    }),
  },
  {
    stepId: "safety-training",
    label: "Safety Training",
    description: "Assign role/facility-specific safety training.",
    required: true,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 35,
      datePriority: "Day 2",
      completionOwner: "worker",
    }),
  },
  {
    stepId: "compliance-training",
    label: "Compliance Training",
    description: "Assign compliance modules.",
    required: true,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 36,
      datePriority: "Day 2",
      completionOwner: "worker",
    }),
  },
  {
    stepId: "training-modules-quiz",
    label: "Training Modules + Quiz",
    description: "Assign role-specific modules and quizzes.",
    required: true,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 37,
      datePriority: "Day 2",
      completionOwner: "worker",
    }),
  },
  {
    stepId: "orientation-video",
    label: "Orientation / Onboarding Video",
    description: "Track orientation content completion.",
    required: true,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 38,
      datePriority: "Day 2",
      completionOwner: "worker",
    }),
  },
  {
    stepId: "certification-upload",
    label: "Certification Upload / Renewal",
    description: "Track certifications and renewal dates.",
    required: false,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 39,
      required: false,
      datePriority: "Day 2",
      completionOwner: "worker",
      isConditional: true,
      unlockCondition: "certification_required",
    }),
  },
  {
    stepId: "schedule-assignment",
    label: "Schedule Assignment",
    description: "Assign/confirm initial work schedule.",
    required: false,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 40,
      required: false,
      datePriority: "Day 2",
      completionOwner: "manager",
      isConditional: true,
      unlockCondition: "requires_scheduling",
    }),
  },
  {
    stepId: "badge-equipment-issuance",
    label: "Badge / Equipment Issuance",
    description: "Track badge, device, and equipment issuance.",
    required: false,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 41,
      required: false,
      datePriority: "Day 2",
      completionOwner: "operations",
      isConditional: true,
      unlockCondition: "equipment_required",
    }),
  },
  {
    stepId: "facility-access-setup",
    label: "Facility Access Setup",
    description: "Track system/building access provisioning.",
    required: false,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 42,
      required: false,
      datePriority: "Day 2",
      completionOwner: "operations",
      isConditional: true,
      unlockCondition: "access_required",
    }),
  },
  {
    stepId: "buddy-mentor-assignment",
    label: "Buddy / Mentor Assignment",
    description: "Assign buddy/mentor when tenant enables.",
    required: false,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 43,
      required: false,
      datePriority: "Day 2",
      completionOwner: "manager",
      isConditional: true,
      unlockCondition: "tenant_buddy_program_enabled",
    }),
  },
  {
    stepId: "welcome-email",
    label: "Welcome Email",
    description: "Send welcome details after approvals.",
    required: true,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 44,
      datePriority: "Day 2",
      completionOwner: "system",
    }),
  },
  {
    stepId: "manager-welcome-call",
    label: "Manager Welcome Call",
    description: "Create manager follow-up task.",
    required: false,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 45,
      required: false,
      datePriority: "Day 2",
      completionOwner: "manager",
    }),
  },
  {
    stepId: "final-onboarding-call",
    label: "Final Onboarding Call",
    description: "Create final recruiter/HR check-in.",
    required: false,
    day: 2,
    settings: settings({
      phase: "post_hire",
      phaseOrder: 3,
      stepOrder: 46,
      required: false,
      datePriority: "Day 2",
      completionOwner: "recruiter_or_hr",
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
      stepOrder: 47,
      datePriority: "Day 2",
      completionOwner: "authorized_internal",
    }),
  },
];

const STEPS = [...PRE_HIRE_STEPS, ...POST_HIRE_STEPS];

function buildDraft() {
  const nodes = STEPS.map((step, index) => ({
    id: `w2-figma-${String(index + 1).padStart(2, "0")}`,
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
  const flowName = "W2 Employee Workflow";
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

  if (!existing?.id) {
    throw new Error(
      `Flow "${flowName}" not found for tenant ${preferred.name}. Create/publish it first or check the name.`
    );
  }

  const flowId = existing.id;
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
        typeof node.settings?.phaseOrder === "number"
          ? node.settings.phaseOrder
          : phase === "post_hire"
            ? 3
            : 1,
      step_order: typeof node.settings?.stepOrder === "number" ? node.settings.stepOrder : index + 1,
      is_conditional: node.settings?.isConditional === true,
      unlock_condition: node.settings?.unlockCondition || null,
      completion_owner: node.settings?.completionOwner || null,
      settings: node.settings,
      metadata: {
        library_step_key: node.stepId,
        stage_name: node.settings?.stageName ?? null,
        parent_canvas_node_id: index > 0 ? draft.nodes[index - 1].id : null,
      },
      canvas_node_id: node.id,
    };
  });

  const { data: inserted, error: insertStepsError } = await sb
    .from("onboarding_flow_steps")
    .insert(stepRows)
    .select("id, canvas_node_id, title, phase, step_type, settings");
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

  // Keep W2 mapping pointing at this flow.
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
      console.warn("Could not create workflow mapping:", mapInsertError.message);
    } else {
      console.log("Created active W2 workflow mapping → this flow");
    }
  }

  const preHire = (inserted ?? []).filter((s) => s.phase === "pre_hire" || s.phase === "transition");
  const postHire = (inserted ?? []).filter((s) => s.phase === "post_hire");
  const byStage = {};
  for (const row of preHire) {
    const stage = row.settings?.stageName || "(none)";
    byStage[stage] = (byStage[stage] || 0) + 1;
  }

  console.log("\nPublished successfully");
  console.log(`Flow ID: ${flowId}`);
  console.log(`Name: ${flowName}`);
  console.log(`Status: published`);
  console.log(`Pre-Hire (+ transition) steps: ${preHire.length}`);
  console.log(`Post-Hire steps: ${postHire.length}`);
  console.log("Pre-Hire stageName counts:", byStage);
  console.log(`\nOpen: /admin_recruiter/dashboard/onboarding-builder?flow=${flowId}`);
  console.log(
    "Create a NEW W2 job/candidate to pick up Interview + Submission stages (existing apps keep old snapshots)."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

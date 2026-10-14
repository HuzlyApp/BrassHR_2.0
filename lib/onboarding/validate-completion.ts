import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTenantOnboardingConfig } from "@/lib/onboarding/load-tenant-config";
import { isValidStep1Email } from "@/lib/onboardingStep1Validation";
import type { StepProgressRow } from "@/lib/onboarding/types";

export type CompletionValidationResult =
  | { ok: true }
  | { ok: false; missing: { stepKey: string; reason: string }[] };

export async function validateWorkerOnboardingComplete(
  supabase: SupabaseClient,
  workerId: string,
  tenantId: string,
  stepProgress: StepProgressRow[]
): Promise<CompletionValidationResult> {
  const config = await loadTenantOnboardingConfig(supabase, tenantId);
  if (!config) {
    return { ok: false, missing: [{ stepKey: "_config", reason: "No onboarding configuration" }] };
  }

  const progressByStep = new Map(stepProgress.map((s) => [s.onboarding_step_id, s]));
  const missing: { stepKey: string; reason: string }[] = [];

  const requiredSteps = config.steps.filter((s) => s.is_enabled && s.is_required);

  for (const step of requiredSteps) {
    const prog = progressByStep.get(step.id);
    const status = prog?.status ?? "pending";

    if (status === "skipped") continue;
    if (status !== "completed") {
      missing.push({ stepKey: step.step_key, reason: `Step not completed (${status})` });
      continue;
    }

    if (step.step_type === "resume_upload") {
      const { data: worker } = await supabase
        .from("workers")
        .select("email")
        .eq("id", workerId)
        .maybeSingle();

      const email = String(worker?.email ?? "").trim();
      if (!email) {
        missing.push({ stepKey: step.step_key, reason: "Applicant email is required" });
      } else if (!isValidStep1Email(email)) {
        missing.push({ stepKey: step.step_key, reason: "Applicant email is invalid" });
      }

      const { data: resume } = await supabase
        .from("worker_resumes")
        .select("id, parsing_status, file_url")
        .eq("worker_id", workerId)
        .maybeSingle();

      if (!resume?.file_url) {
        missing.push({ stepKey: step.step_key, reason: "Resume not uploaded" });
        continue;
      }

      const parsingEnabled = step.metadata.parsing_enabled !== false;
      if (parsingEnabled) {
        const ps = String(resume.parsing_status ?? "pending");
        const allowFail = step.metadata.allow_complete_on_parse_failure === true;
        const parseOk = ps === "completed" || (allowFail && ps === "failed");
        if (!parseOk) {
          missing.push({ stepKey: step.step_key, reason: `Resume parsing not finished (${ps})` });
        }
      }
    }

    if (
      step.step_type === "document_upload" ||
      step.step_type === "authorizations" ||
      step.step_type === "professional_license"
    ) {
      const docs = config.requiredDocuments.filter((d) => d.onboarding_step_id === step.id && d.is_required);
      if (docs.length) {
        const [{ data: uploads }, { data: professionUploads }] = await Promise.all([
          supabase
            .from("worker_submitted_documents")
            .select("required_document_id, status")
            .eq("worker_id", workerId),
          supabase
            .from("worker_profession_document_uploads")
            .select("profession_document_id, status")
            .eq("worker_id", workerId),
        ]);

        const requireApproval = step.metadata.require_approval === true;
        for (const doc of docs) {
          const row =
            (uploads ?? []).find((u) => String(u.required_document_id) === doc.id) ??
            (professionUploads ?? []).find((u) => String(u.profession_document_id) === doc.id);
          if (!row) {
            missing.push({ stepKey: step.step_key, reason: `Missing document: ${doc.title}` });
          } else if (requireApproval && row.status !== "approved") {
            missing.push({ stepKey: step.step_key, reason: `Document pending approval: ${doc.title}` });
          }
        }
      }
    }

    if (step.step_type === "skill_assessment") {
      const assessments = config.skillAssessments.filter((a) => a.onboarding_step_id === step.id);
      for (const assessment of assessments) {
        const requiredQs = assessment.questions.filter((q) => q.is_required);
        if (!requiredQs.length) continue;

        const { data: answers } = await supabase
          .from("worker_skill_assessment_answers")
          .select("question_id")
          .eq("worker_id", workerId)
          .eq("assessment_id", assessment.id);

        const answered = new Set((answers ?? []).map((a) => String(a.question_id)));
        for (const q of requiredQs) {
          if (!answered.has(q.id)) {
            missing.push({
              stepKey: step.step_key,
              reason: `Unanswered question in ${assessment.title}`,
            });
          }
        }
      }
    }

    if (step.step_type === "references") {
      const minCount =
        typeof step.metadata.min_count === "number" ? Number(step.metadata.min_count) : 1;
      const { count } = await supabase
        .from("worker_references")
        .select("id", { count: "exact", head: true })
        .eq("worker_id", workerId);

      if ((count ?? 0) < minCount) {
        missing.push({
          stepKey: step.step_key,
          reason: `Need at least ${minCount} references (${count ?? 0} added)`,
        });
      }
    }
  }

  if (missing.length) return { ok: false, missing };
  return { ok: true };
}

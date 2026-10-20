import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  convertCandidateToWorker,
  type ConvertCandidateResult,
} from "@/lib/admin/convert-candidate-to-worker.server";
import type { ConvertWorkerType } from "@/lib/admin/convert-candidate-to-worker";
import { activatePostHire } from "@/lib/onboarding/activate-post-hire";
import { isAgreementEsignStep } from "@/lib/onboarding/lock-post-hire";
import {
  isOfferAcceptanceStep,
  readOfferDecision,
} from "@/lib/onboarding/offer-acceptance";
import { readStepLifecyclePhase } from "@/lib/onboarding/workflow-phase";
import type { TenantOnboardingStep } from "@/lib/onboarding/types";

function normalizeStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function convertWorkerTypeFromEmploymentType(value: unknown): ConvertWorkerType {
  const normalized = normalizeStatus(value).replace(/[-_\s]/g, "");
  return normalized === "1099" || normalized.includes("contractor") ? "1099" : "w2";
}

async function resolveWorkerType(
  supabase: SupabaseClient,
  params: { tenantId: string; applicationId: string | null }
): Promise<ConvertWorkerType> {
  if (!params.applicationId) return "w2";

  const { data, error } = await supabase
    .from("job_applications")
    .select("job_requisitions(employment_type), onboarding_flows(employment_type)")
    .eq("id", params.applicationId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();

  if (error) {
    console.warn("[auto-convert-after-agreement] worker type lookup failed", error.message);
    return "w2";
  }

  const job = Array.isArray(data?.job_requisitions)
    ? data?.job_requisitions[0]
    : data?.job_requisitions;
  const flow = Array.isArray(data?.onboarding_flows)
    ? data?.onboarding_flows[0]
    : data?.onboarding_flows;

  return convertWorkerTypeFromEmploymentType(
    job?.employment_type ?? flow?.employment_type ?? null
  );
}

async function ensureConvertibleCandidateStatus(
  supabase: SupabaseClient,
  params: { tenantId: string; workerId: string }
): Promise<boolean> {
  const { data, error } = await supabase
    .from("worker")
    .select("status")
    .eq("id", params.workerId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();
  if (error) throw error;

  const status = normalizeStatus(data?.status);
  if (status === "converted") return false;
  if (status === "approved" || status === "for_approval") return true;
  if (["rejected", "disapproved", "withdrawn", "archived"].includes(status)) return false;

  const { error: updateError } = await supabase
    .from("worker")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", params.workerId)
    .eq("tenant_id", params.tenantId);
  if (updateError) throw updateError;
  return true;
}

/**
 * Checks whether a candidate's pre-hire workflow contains an enabled Pay Rate Accepted step.
 */
export async function workflowHasPayRateAcceptedStep(
  supabase: SupabaseClient,
  params: { tenantId: string; workerId?: string | null; applicationId?: string | null }
): Promise<boolean> {
  if (params.workerId) {
    const { data: prog } = await supabase
      .from("worker_onboarding_step_progress")
      .select("onboarding_step_id")
      .eq("worker_id", params.workerId);

    const stepIds = (prog || [])
      .map((p) => p.onboarding_step_id)
      .filter((id): id is string => Boolean(id));

    if (stepIds.length > 0) {
      const { data: steps } = await supabase
        .from("tenant_onboarding_steps")
        .select("id, step_key, step_type, title, is_enabled, metadata")
        .in("id", stepIds);

      const hasOffer = (steps || []).some(
        (s) => s.is_enabled !== false && isOfferAcceptanceStep(s)
      );
      if (hasOffer) return true;
    }

    const { data: instances } = await supabase
      .from("applicant_workflow_instances")
      .select("id")
      .eq("tenant_id", params.tenantId)
      .eq("worker_id", params.workerId);

    if (instances && instances.length > 0) {
      const instIds = instances.map((i) => i.id);
      const { data: recs } = await supabase
        .from("applicant_workflow_step_records")
        .select("id, snapshot_step_id, step_type, title, settings, phase")
        .eq("tenant_id", params.tenantId)
        .in("workflow_instance_id", instIds);

      const hasOfferInRecs = (recs || []).some(
        (r) =>
          r.phase !== "post_hire" &&
          isOfferAcceptanceStep({
            snapshotStepId: r.snapshot_step_id,
            stepType: r.step_type,
            title: r.title,
            metadata: r.settings as Record<string, unknown> | null,
          })
      );
      if (hasOfferInRecs) return true;
    }
  }

  const { data: tenantSteps } = await supabase
    .from("tenant_onboarding_steps")
    .select("id, step_key, step_type, title, is_enabled, metadata")
    .eq("tenant_id", params.tenantId)
    .eq("is_enabled", true);

  return (tenantSteps || []).some((s) => {
    if (readStepLifecyclePhase(s as unknown as TenantOnboardingStep) !== "pre_hire") return false;
    return isOfferAcceptanceStep(s);
  });
}

/**
 * Checks whether a candidate has completed (accepted) the Pay Rate Accepted step.
 */
export async function workflowHasCompletedOfferAcceptance(
  supabase: SupabaseClient,
  params: { tenantId: string; workerId: string; applicationId?: string | null }
): Promise<boolean> {
  const { data: prog } = await supabase
    .from("worker_onboarding_step_progress")
    .select("onboarding_step_id, status, data")
    .eq("worker_id", params.workerId)
    .in("status", ["completed", "approved"]);

  if (prog && prog.length > 0) {
    const stepIds = prog
      .map((p) => p.onboarding_step_id)
      .filter((id): id is string => Boolean(id));

    if (stepIds.length > 0) {
      const { data: steps } = await supabase
        .from("tenant_onboarding_steps")
        .select("id, step_key, step_type, title, metadata")
        .in("id", stepIds);

      const stepMap = new Map((steps || []).map((s) => [s.id, s]));
      for (const p of prog) {
        const step = stepMap.get(p.onboarding_step_id);
        if (step && isOfferAcceptanceStep(step)) {
          const decision = readOfferDecision(p.data as Record<string, unknown> | null, p.status);
          if (decision?.decision !== "declined") {
            return true;
          }
        }
      }
    }
  }

  const { data: instances } = await supabase
    .from("applicant_workflow_instances")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("worker_id", params.workerId);

  if (instances && instances.length > 0) {
    const instIds = instances.map((i) => i.id);
    const { data: recs } = await supabase
      .from("applicant_workflow_step_records")
      .select("id, snapshot_step_id, step_type, title, status, settings")
      .eq("tenant_id", params.tenantId)
      .in("workflow_instance_id", instIds)
      .in("status", ["completed", "approved"]);

    const completedOffer = (recs || []).some((r) =>
      isOfferAcceptanceStep({
        snapshotStepId: r.snapshot_step_id,
        stepType: r.step_type,
        title: r.title,
        metadata: r.settings as Record<string, unknown> | null,
      })
    );
    if (completedOffer) return true;
  }

  return false;
}

/**
 * Handles conversion and post-hire activation when Agreement eSign is completed.
 * If the candidate's workflow includes a Pay Rate Accepted step, conversion is deferred
 * until the candidate accepts the pay rate offer.
 */
export async function autoConvertCandidateAfterAgreement(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    workerId: string;
    applicationId: string | null;
    step: TenantOnboardingStep | null | undefined;
    origin?: string | null;
  }
): Promise<ConvertCandidateResult | null> {
  if (!input.step) return null;
  if (readStepLifecyclePhase(input.step) !== "pre_hire") return null;
  if (!isAgreementEsignStep({
    snapshotStepId: String(input.step.metadata?.workflow_step_id ?? ""),
    stepKey: input.step.step_key,
    stepType: input.step.step_type,
    title: input.step.title,
  })) {
    return null;
  }

  const hasPayRateStep = await workflowHasPayRateAcceptedStep(supabase, {
    tenantId: input.tenantId,
    workerId: input.workerId,
    applicationId: input.applicationId,
  });
  if (hasPayRateStep) {
    const offerAccepted = await workflowHasCompletedOfferAcceptance(supabase, {
      tenantId: input.tenantId,
      workerId: input.workerId,
      applicationId: input.applicationId,
    });
    if (!offerAccepted) {
      console.log(
        "[auto-convert-after-agreement] skipping conversion on agreement because pay rate accepted step is pending in workflow"
      );
      return null;
    }
  }

  const convertible = await ensureConvertibleCandidateStatus(supabase, {
    tenantId: input.tenantId,
    workerId: input.workerId,
  });
  if (!convertible) return null;

  const workerType = await resolveWorkerType(supabase, {
    tenantId: input.tenantId,
    applicationId: input.applicationId,
  });

  return convertCandidateToWorker(supabase, {
    candidateId: input.workerId,
    workerType,
    sourceJobApplicationId: input.applicationId,
    origin: input.origin ?? null,
  });
}

/**
 * Handles conversion and dynamic placement accepted email sending when the
 * candidate accepts the offer on the Pay Rate Accepted step.
 */
export async function autoConvertCandidateAfterOfferAccepted(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    workerId: string;
    applicationId: string | null;
    step: TenantOnboardingStep | null | undefined;
    data?: Record<string, unknown> | null;
    origin?: string | null;
  }
): Promise<ConvertCandidateResult | null> {
  const isOffer = isOfferAcceptanceStep(input.step);
  if (!isOffer) return null;

  const decision = readOfferDecision(input.data, "completed");
  if (decision?.decision === "declined") {
    return null;
  }

  const { data: worker, error: workerErr } = await supabase
    .from("worker")
    .select("id, status")
    .eq("id", input.workerId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();

  if (workerErr || !worker) return null;

  const isAlreadyConverted = normalizeStatus(worker.status) === "converted";

  if (!isAlreadyConverted) {
    const convertible = await ensureConvertibleCandidateStatus(supabase, {
      tenantId: input.tenantId,
      workerId: input.workerId,
    });
    if (!convertible) return null;

    const workerType = await resolveWorkerType(supabase, {
      tenantId: input.tenantId,
      applicationId: input.applicationId,
    });

    return convertCandidateToWorker(supabase, {
      candidateId: input.workerId,
      workerType,
      sourceJobApplicationId: input.applicationId,
      origin: input.origin ?? null,
    });
  }

  // If candidate was already converted, activate post-hire and send placement accepted email now!
  if (input.applicationId) {
    const postHire = await activatePostHire(supabase, {
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      origin: input.origin ?? null,
      sendEmail: Boolean(input.origin),
      forceEmail: true,
    });

    return {
      ok: true,
      workerRecordId: input.workerId,
      candidateId: input.workerId,
      workerType: "w2",
      created: false,
      profilePath: `/admin/workers/${input.workerId}`,
      sourceJobApplicationId: input.applicationId,
      postHire: {
        attempted: true,
        activated: postHire.activated || postHire.alreadyActive,
        warning: null,
        applicationId: input.applicationId,
      },
    };
  }

  return {
    ok: true,
    workerRecordId: input.workerId,
    candidateId: input.workerId,
    workerType: "w2",
    created: false,
    profilePath: `/admin/workers/${input.workerId}`,
    sourceJobApplicationId: null,
    postHire: {
      attempted: false,
      activated: false,
      warning: "No application id for post-hire activation",
      applicationId: null,
    },
  };
}

/**
 * Converts a candidate after a recruiter marks Agreement e-sign complete.
 * A candidate signature, including Authorization e-sign, leaves the step submitted and does not hire them.
 * Requires Pay Rate Accepted completion if that step is part of the workflow.
 */
export async function ensureCandidateConvertedIfAgreementCompleted(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    workerId: string;
    applicationId?: string | null;
    origin?: string | null;
  }
): Promise<ConvertCandidateResult | null> {
  const { data: worker, error: workerErr } = await supabase
    .from("worker")
    .select("id, status")
    .eq("id", input.workerId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (workerErr || !worker) return null;

  if (normalizeStatus(worker.status) === "converted") return null;

  const hasPayRateStep = await workflowHasPayRateAcceptedStep(supabase, {
    tenantId: input.tenantId,
    workerId: input.workerId,
    applicationId: input.applicationId ?? null,
  });
  if (hasPayRateStep) {
    const offerAccepted = await workflowHasCompletedOfferAcceptance(supabase, {
      tenantId: input.tenantId,
      workerId: input.workerId,
      applicationId: input.applicationId ?? null,
    });
    if (!offerAccepted) {
      return null;
    }
  }

  const { data: progressRows } = await supabase
    .from("worker_onboarding_step_progress")
    .select("onboarding_step_id, status")
    .eq("worker_id", input.workerId)
    .in("status", ["completed", "approved"]);

  const stepIds = (progressRows ?? [])
    .map((r) => r.onboarding_step_id)
    .filter((id): id is string => Boolean(id));

  let hasSignedAgreement = false;
  if (stepIds.length) {
    const { data: steps } = await supabase
      .from("tenant_onboarding_steps")
      .select("id, step_key, step_type, title, metadata")
      .in("id", stepIds);

    hasSignedAgreement = (steps ?? []).some((step) => {
      if (readStepLifecyclePhase(step as TenantOnboardingStep) !== "pre_hire") return false;
      return isAgreementEsignStep({
        snapshotStepId: String(step.metadata?.workflow_step_id ?? ""),
        stepKey: step.step_key,
        stepType: step.step_type,
        title: step.title,
      });
    });
  }

  const { data: instances } = await supabase
    .from("applicant_workflow_instances")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("worker_id", input.workerId);
  const instanceIds = (instances ?? []).map((row) => row.id).filter(Boolean);
  let recruiterVerified = false;
  if (instanceIds.length) {
    const { data: stepRecords } = await supabase
      .from("applicant_workflow_step_records")
      .select("snapshot_step_id, step_type, title, phase, settings, review_decision")
      .eq("tenant_id", input.tenantId)
      .in("workflow_instance_id", instanceIds)
      .eq("review_decision", "complete")
      .in("status", ["completed", "approved"]);
    recruiterVerified = (stepRecords ?? []).some((record) => {
      if (record.phase === "post_hire") return false;
      const settings =
        record.settings && typeof record.settings === "object" && !Array.isArray(record.settings)
          ? (record.settings as Record<string, unknown>)
          : null;
      return isAgreementEsignStep({
        snapshotStepId: String(settings?.workflow_step_id ?? record.snapshot_step_id ?? ""),
        stepKey: record.step_type,
        stepType: record.step_type,
        title: record.title,
      });
    });
  }

  if (!hasSignedAgreement || !recruiterVerified) return null;

  const convertible = await ensureConvertibleCandidateStatus(supabase, {
    tenantId: input.tenantId,
    workerId: input.workerId,
  });
  if (!convertible) return null;

  const workerType = await resolveWorkerType(supabase, {
    tenantId: input.tenantId,
    applicationId: input.applicationId ?? null,
  });

  return convertCandidateToWorker(supabase, {
    candidateId: input.workerId,
    workerType,
    sourceJobApplicationId: input.applicationId ?? null,
    origin: input.origin ?? null,
  });
}

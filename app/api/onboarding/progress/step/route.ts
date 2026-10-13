import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase-env";
import { ensureWorkerOnboardingProgress } from "@/lib/onboarding/ensure-worker-progress";
import {
  readOnboardingTenantSlugFromRequest,
  resolveOnboardingWorker,
} from "@/lib/onboarding/resolve-onboarding-worker";
import { loadTenantOnboardingConfig } from "@/lib/onboarding/load-tenant-config";
import { loadApplicantConfigForJobToken } from "@/lib/onboarding/load-config-for-job-workflow";
import { isPreviewOnboardingStepId } from "@/lib/onboarding/load-applicant-draft-config";
import { normalizeJobToken } from "@/lib/jobs/public-application-routing";
import { dispatchWorkflowIntegrationPartner } from "@/lib/onboarding/integration-partner-dispatch";
import { notifyHrOnOnboardingStepFailure } from "@/lib/onboarding/notify-hr-on-step-failure";
import { shouldPauseFlowOnStepFailure } from "@/lib/onboarding/workflow-settings";
import { isUploadResumeStep } from "@/lib/onboarding/enforce-upload-resume-first";
import { isOnboardingStepSkippable } from "@/lib/onboarding/is-step-skippable";
import { isValidStep1Email } from "@/lib/onboardingStep1Validation";
import { getEnabledTenantSteps } from "@/lib/onboarding/tenant-step-navigation";
import { computeCandidateOnboardingFrontier } from "@/lib/onboarding/candidate-onboarding-projection";
import { applyApplicantConfigFilters } from "@/lib/onboarding/filter-applicant-steps";
import { persistFarthestReachedStepIndex } from "@/lib/onboarding/persist-farthest-reached-step";
import { resolveOnboardingProgressStep } from "@/lib/onboarding/resolve-onboarding-progress-step";
import type { OnboardingStepStatus, TenantOnboardingConfig } from "@/lib/onboarding/types";
import { formatApiError } from "@/lib/api/format-api-error";
import { resolveApplicationWorkflowPhase } from "@/lib/onboarding/resolve-application-workflow-phase";
import {
  applicantMayActOnStep,
  isPlacementAcceptedStatus,
  isPreHireWorkflowStep,
  readStepLifecyclePhase,
} from "@/lib/onboarding/workflow-phase";
import {
  commitOnboardingStepProgress,
  StepProgressConflictError,
} from "@/lib/onboarding/step-progress-write";
import {
  autoConvertCandidateAfterAgreement,
  autoConvertCandidateAfterOfferAccepted,
  ensureCandidateConvertedIfAgreementCompleted,
} from "@/lib/onboarding/auto-convert-after-agreement";
import {
  isOfferAcceptanceStep,
  readOfferDecision,
} from "@/lib/onboarding/offer-acceptance";
import { notifyRecruiterOnAgreementStepCompletion } from "@/lib/onboarding/notify-recruiter-on-agreement-step";

export const runtime = "nodejs";

type Body = {
  applicantId?: string;
  tenantSlug?: string;
  jobToken?: string;
  applicationId?: string;
  stepId?: string;
  stepKey?: string;
  status?: OnboardingStepStatus;
  data?: Record<string, unknown>;
};

const ALLOWED: OnboardingStepStatus[] = [
  "pending",
  "in_progress",
  "completed",
  "skipped",
  "failed",
];

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const applicantId = typeof body.applicantId === "string" ? body.applicantId.trim() : "";
    const status = body.status;
    if (!applicantId || !status || !ALLOWED.includes(status)) {
      return NextResponse.json({ error: "Invalid applicantId or status" }, { status: 400 });
    }

    const url = getSupabaseUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
    }

    const supabase = createClient(url, key);
    const tenantSlug =
      (typeof body.tenantSlug === "string" ? body.tenantSlug.trim().toLowerCase() : "") ||
      readOnboardingTenantSlugFromRequest(req);
    const ctx = await resolveOnboardingWorker(supabase, applicantId, tenantSlug);
    if (!ctx) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    }

    const jobToken = normalizeJobToken(
      typeof body.jobToken === "string" ? body.jobToken : null
    );
    let applicationId =
      typeof body.applicationId === "string" ? body.applicationId.trim() : "";

    const phaseRecord = await resolveApplicationWorkflowPhase(supabase, {
      tenantId: ctx.tenantId,
      workerId: ctx.workerId,
      applicationId: applicationId || null,
      jobToken,
    });
    if (!applicationId && phaseRecord?.applicationId) {
      applicationId = phaseRecord.applicationId;
    }
    const unscopedOnly = Boolean(jobToken) && !applicationId;

    const payload = await ensureWorkerOnboardingProgress(
      supabase,
      ctx.workerId,
      ctx.tenantId,
      applicationId || null,
      unscopedOnly
    );

    let tenantConfig = await loadTenantOnboardingConfig(supabase, ctx.tenantId, {
      workerFacing: true,
    });

    let config: TenantOnboardingConfig | null = tenantConfig;
    if (jobToken) {
      try {
        const jobConfig = await loadApplicantConfigForJobToken(
          supabase,
          tenantSlug || null,
          jobToken
        );
        config = jobConfig.config;
      } catch {
        // Fall back to tenant published config when job token is stale.
      }
    }

    let stepRow = resolveOnboardingProgressStep(config, {
      stepId: body.stepId,
      stepKey: body.stepKey,
    });

    let progressPayload = payload;

    // Stale tenant config cache can omit a just-published step key (e.g. custom_question).
    if (!stepRow && !jobToken && (body.stepId?.trim() || body.stepKey?.trim())) {
      tenantConfig = await loadTenantOnboardingConfig(supabase, ctx.tenantId, {
        workerFacing: true,
        bypassCache: true,
      });
      config = tenantConfig;
      stepRow = resolveOnboardingProgressStep(config, {
        stepId: body.stepId,
        stepKey: body.stepKey,
      });
      if (stepRow) {
        progressPayload = await ensureWorkerOnboardingProgress(
          supabase,
          ctx.workerId,
          ctx.tenantId,
          applicationId || null,
          unscopedOnly
        );
      }
    }

    const candidateFacingStep = stepRow;

    // Job workflows may surface preview-* ids for steps not in the last-published tenant config.
    // Persist progress against the best matching published tenant step when needed.
    let persistStep = stepRow;
    if (stepRow && isPreviewOnboardingStepId(stepRow.id)) {
      persistStep =
        resolveOnboardingProgressStep(tenantConfig, {
          stepKey: stepRow.step_key,
        }) ?? stepRow;
    }

    const stepId =
      persistStep && !isPreviewOnboardingStepId(persistStep.id)
        ? String(persistStep.id)
        : "";
    if (!stepId) {
      return NextResponse.json({ error: "Step not found" }, { status: 400 });
    }
    stepRow = persistStep ?? stepRow;

    const activePhase = phaseRecord?.phase ?? "pre_hire";
    const isPreHire =
      isPreHireWorkflowStep({
        key: candidateFacingStep?.step_key || stepRow?.step_key || body.stepKey,
        title: candidateFacingStep?.title || stepRow?.title,
        snapshotId: String(
          candidateFacingStep?.metadata?.workflow_step_id ??
          stepRow?.metadata?.workflow_step_id ??
          body.stepId ??
          ""
        ),
        stepId: String(
          candidateFacingStep?.metadata?.stepId ??
          stepRow?.metadata?.stepId ??
          body.stepId ??
          ""
        ),
        data: body.data,
      });

    const effectiveStepPhase = isPreHire
      ? "pre_hire"
      : candidateFacingStep
      ? readStepLifecyclePhase(candidateFacingStep)
      : stepRow
      ? readStepLifecyclePhase(stepRow)
      : "pre_hire";

    if (
      stepRow &&
      (status === "completed" || status === "skipped" || status === "in_progress" || status === "failed") &&
      !applicantMayActOnStep({
        activePhase,
        stepPhase: effectiveStepPhase,
        isHired:
          isPlacementAcceptedStatus(phaseRecord?.status) ||
          Boolean(phaseRecord?.postHireActivatedAt) ||
          activePhase === "post_hire" ||
          phaseRecord?.phase === "post_hire",
        postHireSuspended: Boolean(phaseRecord?.postHireSuspendedAt),
      })
    ) {
      return NextResponse.json(
        {
          error: "This step is not part of your current application phase.",
          code: "PHASE_FORBIDDEN",
        },
        { status: 403 }
      );
    }

    const completed_at = status === "completed" ? new Date().toISOString() : null;

    if (status === "skipped" && stepRow && isUploadResumeStep(stepRow)) {
      return NextResponse.json({ error: "Upload Resume cannot be skipped." }, { status: 400 });
    }

    if (status === "skipped" && stepRow && !isOnboardingStepSkippable(stepRow)) {
      return NextResponse.json(
        { error: "This required step cannot be skipped." },
        { status: 400 }
      );
    }

    if (status === "completed" && stepRow && isUploadResumeStep(stepRow)) {
      const { data: worker, error: workerErr } = await supabase
        .from("worker")
        .select("email")
        .eq("id", ctx.workerId)
        .maybeSingle();
      if (workerErr) throw workerErr;
      const email = String(worker?.email ?? "").trim();
      if (email && !isValidStep1Email(email)) {
        return NextResponse.json(
          { error: "Enter a valid email address before continuing onboarding." },
          { status: 400 }
        );
      }

      const { data: resume } = await supabase
        .from("worker_resumes")
        .select("file_url")
        .eq("worker_id", ctx.workerId)
        .is("deleted_at", null)
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let requirementsQuery = supabase
        .from("worker_requirements")
        .select("resume_path")
        .or(`worker_id.eq.${ctx.workerId},worker_id.eq.${applicantId}`);
      if (applicationId) {
        requirementsQuery = requirementsQuery.eq("application_id", applicationId);
      }
      const { data: requirements } = await requirementsQuery
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const resumePath = String(requirements?.resume_path ?? "").trim();
      if (!resume?.file_url && !resumePath) {
        return NextResponse.json(
          { error: "Upload your resume before continuing onboarding." },
          { status: 400 }
        );
      }
    }

    const { data: existingRow } = await supabase
      .from("worker_onboarding_step_progress")
      .select("status")
      .eq("worker_onboarding_progress_id", progressPayload.progressId)
      .eq("onboarding_step_id", stepId)
      .maybeSingle();

    const existingStatus = existingRow?.status as OnboardingStepStatus | undefined;
    const terminalStatuses: OnboardingStepStatus[] = ["completed", "skipped"];
    const downgradeStatuses: OnboardingStepStatus[] = ["pending", "in_progress"];
    if (
      existingStatus &&
      terminalStatuses.includes(existingStatus) &&
      downgradeStatuses.includes(status)
    ) {
      const progress = await ensureWorkerOnboardingProgress(
        supabase,
        ctx.workerId,
        ctx.tenantId,
        applicationId || null,
        unscopedOnly
      );
      return NextResponse.json({ progress, noop: true });
    }

    // The screen marks itself in_progress on mount, which can fire before the client route
    // guard redirects away from a step still locked behind a required internal step.
    if (status === "in_progress" && stepRow && config) {
      const target = stepRow;
      const gatedConfig = applyApplicantConfigFilters(config, { activePhase });
      const candidateSteps = getEnabledTenantSteps(gatedConfig);
      const stepIndex = candidateSteps.findIndex(
        (candidate) => candidate.id === target.id || candidate.step_key === target.step_key
      );
      if (stepIndex >= 0) {
        const frontier = computeCandidateOnboardingFrontier({
          engineOrder: gatedConfig.candidateEngineOrder,
          candidateSteps,
          progress: progressPayload,
        });
        if (stepIndex + 1 > frontier.maxAllowedStepIndex) {
          return NextResponse.json({ progress: progressPayload, noop: true, locked: true });
        }
      }
    }

    let stepData: Record<string, unknown> =
      body.data && typeof body.data === "object" ? { ...body.data } : {};

    if (status === "in_progress" && stepRow) {
      const dispatch = await dispatchWorkflowIntegrationPartner({
        supabase,
        tenantId: ctx.tenantId,
        workerId: ctx.workerId,
        applicantId,
        step: stepRow,
        request: req,
      });
      stepData = {
        ...stepData,
        partner_dispatch: dispatch,
      };
    }

    if (status === "failed" && stepRow) {
      const failureReason =
        typeof body.data?.failure_reason === "string"
          ? body.data.failure_reason
          : typeof body.data?.reason === "string"
            ? body.data.reason
            : null;

      if (shouldPauseFlowOnStepFailure(stepRow)) {
        stepData = {
          ...stepData,
          flow_paused: true,
          pause_reason: failureReason ?? "step_failed",
        };
      }

      await notifyHrOnOnboardingStepFailure({
        supabase,
        tenantId: ctx.tenantId,
        workerId: ctx.workerId,
        applicantId,
        step: stepRow,
        failureReason,
        request: req,
      });
    }

    const { data: existingProgressRow } = await supabase
      .from("worker_onboarding_step_progress")
      .select("onboarding_step_id")
      .eq("worker_onboarding_progress_id", progressPayload.progressId)
      .eq("onboarding_step_id", stepId)
      .maybeSingle();

    if (!existingProgressRow) {
      const { error: insertMissingErr } = await supabase
        .from("worker_onboarding_step_progress")
        .insert({
          worker_onboarding_progress_id: progressPayload.progressId,
          worker_id: ctx.workerId,
          tenant_id: ctx.tenantId,
          onboarding_step_id: stepId,
          status: "pending",
          ...(applicationId ? { application_id: applicationId } : {}),
        });
      if (insertMissingErr && insertMissingErr.code !== "23505") throw insertMissingErr;
    }

    const progressId = progressPayload.progressId;
    const committed = await commitOnboardingStepProgress({
      status,
      data: stepData,
      completedAt: completed_at,
      read: async () => {
        const { data, error } = await supabase
          .from("worker_onboarding_step_progress")
          .select("status, data, updated_at")
          .eq("worker_onboarding_progress_id", progressId)
          .eq("onboarding_step_id", stepId)
          .maybeSingle();
        if (error) throw error;
        if (!data) return null;
        const rawData = data.data;
        return {
          status: typeof data.status === "string" ? data.status : null,
          data:
            rawData && typeof rawData === "object" && !Array.isArray(rawData)
              ? (rawData as Record<string, unknown>)
              : {},
          updatedAt: typeof data.updated_at === "string" ? data.updated_at : null,
        };
      },
      write: async (input) => {
        let query = supabase
          .from("worker_onboarding_step_progress")
          .update({
            status: input.status,
            completed_at: input.completedAt,
            data: input.data,
            updated_at: input.updatedAt,
          })
          .eq("worker_onboarding_progress_id", progressId)
          .eq("onboarding_step_id", stepId);
        query = input.expectedUpdatedAt
          ? query.eq("updated_at", input.expectedUpdatedAt)
          : query.is("updated_at", null);
        const { data, error } = await query.select("onboarding_step_id");
        if (error) throw error;
        return data && data.length > 0 ? "ok" : "conflict";
      },
    });

    if (committed.noop) {
      const progress = await ensureWorkerOnboardingProgress(
        supabase,
        ctx.workerId,
        ctx.tenantId,
        applicationId || null,
        unscopedOnly
      );
      return NextResponse.json({ progress, noop: true });
    }

    if (config) {
      const enabledSteps = getEnabledTenantSteps(config);
      await persistFarthestReachedStepIndex(
        supabase,
        progressPayload.progressId,
        enabledSteps,
        stepId,
        status,
        progressPayload.farthestReachedStepIndex ?? 1
      );
    }

    let postHireConversion: Awaited<ReturnType<typeof autoConvertCandidateAfterOfferAccepted>> | null = null;
    if (status === "completed") {
      const isOfferStep = isOfferAcceptanceStep({
        snapshotStepId: String(stepRow?.metadata?.workflow_step_id ?? ""),
        stepKey: stepRow?.step_key ?? body.stepKey,
        stepType: stepRow?.step_type,
        title: stepRow?.title,
        metadata: stepRow?.metadata as Record<string, unknown> | null,
      });

      const offerDecision = readOfferDecision(body.data, status);

      if (isOfferStep && offerDecision?.decision === "accepted") {
        try {
          postHireConversion = await autoConvertCandidateAfterOfferAccepted(supabase, {
            tenantId: ctx.tenantId,
            workerId: ctx.workerId,
            applicationId: applicationId || null,
            step: stepRow,
            data: body.data,
            origin: req.nextUrl.origin,
          });
        } catch (offerConversionError) {
          console.error("[onboarding/progress/step] offer accepted conversion failed", offerConversionError);
        }
      } else {
        try {
          postHireConversion = await autoConvertCandidateAfterAgreement(supabase, {
            tenantId: ctx.tenantId,
            workerId: ctx.workerId,
            applicationId: applicationId || null,
            step: stepRow,
            origin: req.nextUrl.origin,
          });
          if (!postHireConversion?.ok) {
            postHireConversion = await ensureCandidateConvertedIfAgreementCompleted(supabase, {
              tenantId: ctx.tenantId,
              workerId: ctx.workerId,
              applicationId: applicationId || null,
              origin: req.nextUrl.origin,
            });
          }
        } catch (conversionError) {
          console.error("[onboarding/progress/step] auto conversion failed", conversionError);
        }
      }

      try {
        await notifyRecruiterOnAgreementStepCompletion(supabase, {
          tenantId: ctx.tenantId,
          workerId: ctx.workerId,
          applicationId: applicationId || null,
          step: stepRow,
          stepKey: body.stepKey,
          data: body.data,
          origin: req.nextUrl.origin,
          request: req,
        });
      } catch (notifyError) {
        console.warn("[onboarding/progress/step] recruiter agreement notification failed", notifyError);
      }

      try {
        const workflowStepId =
          (typeof stepRow?.metadata?.workflow_step_id === "string"
            ? stepRow.metadata.workflow_step_id
            : null) || (stepRow?.step_key ?? body.stepKey ?? null);
        const workflowNodeId =
          typeof stepRow?.metadata?.workflow_node_id === "string"
            ? stepRow.metadata.workflow_node_id
            : null;

        const { data: instances } = await supabase
          .from("applicant_workflow_instances")
          .select("id")
          .eq("tenant_id", ctx.tenantId)
          .eq("worker_id", ctx.workerId)
          .order("created_at", { ascending: false });

        if (instances?.length) {
          const instanceIds = instances.map((i) => i.id);
          const { data: recs } = await supabase
            .from("applicant_workflow_step_records")
            .select("id, step_type, snapshot_step_id, status")
            .eq("tenant_id", ctx.tenantId)
            .in("workflow_instance_id", instanceIds);

          const matchingRec = (recs ?? []).find(
            (r) =>
              (workflowNodeId && r.snapshot_step_id === workflowNodeId) ||
              (workflowStepId && r.step_type === workflowStepId) ||
              (body.stepKey && r.snapshot_step_id === body.stepKey)
          );

          if (matchingRec && matchingRec.status !== "completed") {
            await supabase
              .from("applicant_workflow_step_records")
              .update({
                status: "completed",
                completed_at,
                updated_at: completed_at,
              })
              .eq("id", matchingRec.id)
              .eq("tenant_id", ctx.tenantId);
          }
        }
      } catch (syncErr) {
        console.warn("[onboarding/progress/step] sync applicant step record failed", syncErr);
      }
    }

    const progress = await ensureWorkerOnboardingProgress(
      supabase,
      ctx.workerId,
      ctx.tenantId,
      applicationId || null,
      unscopedOnly
    );
    return NextResponse.json({ progress, postHireConversion });
  } catch (err: unknown) {
    if (err instanceof StepProgressConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[onboarding/progress/step]", err);
    return NextResponse.json({ error: formatApiError(err) }, { status: 500 });
  }
}

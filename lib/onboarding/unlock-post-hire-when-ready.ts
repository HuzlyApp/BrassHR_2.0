import type { SupabaseClient } from "@supabase/supabase-js";
import { buildApplicantEmailContext, contextToTemplateVariables } from "@/lib/email/applicant-email-context";
import { SendEmailError } from "@/lib/email/errors";
import { sendOnboardingApplicantEmail, sendTemplatedEmail } from "@/lib/email/send-templated-email";
import { EMAIL_TEMPLATE_TYPE } from "@/lib/email-templates/template-keys";
import { isHrFinalApprovalStep } from "@/lib/onboarding/lock-post-hire";
import { requiredPreHireStepsComplete } from "@/lib/onboarding/required-pre-hire-gate";
import { loadApplicationWorkflowPhase } from "@/lib/onboarding/resolve-application-workflow-phase";
import { isTerminalApplicationStatus } from "@/lib/onboarding/workflow-phase";

export type PostHireUnlockResult = {
  unlocked: boolean;
  emailSent: boolean;
};

async function loadJobTitle(
  supabase: SupabaseClient,
  params: { tenantId: string; applicationId: string }
): Promise<string> {
  const { data } = await supabase
    .from("job_applications")
    .select("job_requisitions(public_title, source_job_title)")
    .eq("id", params.applicationId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();
  const job = data?.job_requisitions as
    | { public_title?: string | null; source_job_title?: string | null }
    | { public_title?: string | null; source_job_title?: string | null }[]
    | null
    | undefined;
  const row = Array.isArray(job) ? job[0] : job;
  return String(row?.public_title || row?.source_job_title || "your placement").trim();
}

/** Placement-offer email sent when HR final approval is marked complete. */
export async function sendPlacementOfferEmail(
  supabase: SupabaseClient,
  params: { tenantId: string; workerId: string; origin: string | null }
): Promise<boolean> {
  const origin = String(params.origin ?? "").trim();
  if (!origin) return false;
  try {
    const result = await sendOnboardingApplicantEmail(supabase, {
      tenantId: params.tenantId,
      workerId: params.workerId,
      origin,
      templateKey: EMAIL_TEMPLATE_TYPE.APPROVED,
      reason: "HR final approval completed",
      continuationReason: "application_status",
    });
    return result.sent === true;
  } catch (error) {
    const reason = error instanceof SendEmailError || error instanceof Error ? error.message : "EMAIL_FAILED";
    console.error("[placement-offer] email failed", { tenantId: params.tenantId, reason });
    return false;
  }
}

async function sendPostHireEmail(
  supabase: SupabaseClient,
  params: { tenantId: string; workerId: string; applicationId: string; origin: string }
): Promise<boolean> {
  try {
    const ctx = await buildApplicantEmailContext(supabase, {
      tenantId: params.tenantId,
      workerId: params.workerId,
      origin: params.origin,
      continuationReason: "placement_accepted",
      continuationMetadata: {
        applicationId: params.applicationId,
        purpose: "post_hire_onboarding",
      },
      applicationId: params.applicationId,
    });
    if (!ctx) return false;
    const jobTitle = await loadJobTitle(supabase, {
      tenantId: params.tenantId,
      applicationId: params.applicationId,
    });
    const result = await sendTemplatedEmail(supabase, {
      to: ctx.applicantEmail,
      tenantId: params.tenantId,
      templateKey: EMAIL_TEMPLATE_TYPE.PLACEMENT_ACCEPTED,
      variables: {
        ...contextToTemplateVariables(ctx),
        jobTitle,
        onboardingLink: ctx.applicantContinuationLink,
      },
    });
    return result.sent === true;
  } catch (error) {
    const reason = error instanceof SendEmailError || error instanceof Error ? error.message : "EMAIL_FAILED";
    console.error("[post-hire-email] email failed", {
      tenantId: params.tenantId,
      applicationId: params.applicationId,
      reason,
    });
    return false;
  }
}

/**
 * Opens Post-Hire and emails the candidate once, only after every required
 * Pre-Hire step in the dynamic workflow is finished.
 */
export async function unlockPostHireWhenRequiredComplete(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    workerId: string;
    applicationId?: string | null;
    workflowInstanceId?: string | null;
    origin?: string | null;
  }
): Promise<PostHireUnlockResult> {
  const applicationId = String(params.applicationId ?? "").trim();
  if (!applicationId) return { unlocked: false, emailSent: false };

  const ready = await requiredPreHireStepsComplete(supabase, {
    tenantId: params.tenantId,
    workerId: params.workerId,
    applicationId,
    workflowInstanceId: params.workflowInstanceId,
  });
  if (!ready) return { unlocked: false, emailSent: false };

  const existing = await loadApplicationWorkflowPhase(supabase, {
    tenantId: params.tenantId,
    applicationId,
  });
  if (!existing || existing.workerId && existing.workerId !== params.workerId) {
    return { unlocked: false, emailSent: false };
  }
  if (isTerminalApplicationStatus(existing.status) || existing.postHireSuspendedAt) {
    return { unlocked: false, emailSent: false };
  }
  if (existing.phase === "completed") return { unlocked: true, emailSent: false };

  const now = new Date().toISOString();
  if (existing.phase === "pre_hire") {
    const { error } = await supabase
      .from("job_applications")
      .update({
        workflow_phase: "post_hire",
        post_hire_activated_at: existing.postHireActivatedAt ?? now,
        updated_at: now,
      })
      .eq("id", applicationId)
      .eq("tenant_id", params.tenantId)
      .eq("workflow_phase", "pre_hire");
    if (error) {
      console.error("[unlock-post-hire] phase update failed", error.message);
      return { unlocked: false, emailSent: false };
    }

    const { error: instanceError } = await supabase
      .from("applicant_workflow_instances")
      .update({ post_hire_unlocked_at: now })
      .eq("tenant_id", params.tenantId)
      .eq("application_id", applicationId);
    if (instanceError && !/post_hire_unlocked_at|does not exist/i.test(instanceError.message)) {
      console.error("[unlock-post-hire] instance stamp failed", instanceError.message);
    }
  }

  const origin = String(params.origin ?? "").trim();
  if (!origin || existing.postHireActivationEmailSentAt) {
    return { unlocked: true, emailSent: false };
  }

  const emailSent = await sendPostHireEmail(supabase, {
    tenantId: params.tenantId,
    workerId: params.workerId,
    applicationId,
    origin,
  });
  if (!emailSent) return { unlocked: true, emailSent: false };

  const { error: stampError } = await supabase
    .from("job_applications")
    .update({ post_hire_activation_email_sent_at: new Date().toISOString() })
    .eq("id", applicationId)
    .eq("tenant_id", params.tenantId);
  if (stampError && !/post_hire_activation_email_sent_at|does not exist/i.test(stampError.message)) {
    console.error("[unlock-post-hire] email stamp failed", stampError.message);
  }
  return { unlocked: true, emailSent: true };
}

export async function notifyHrFinalApprovalCompleted(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    workerId: string;
    origin: string | null;
    step: {
      snapshotStepId?: string | null;
      stepKey?: string | null;
      stepType?: string | null;
      title?: string | null;
    };
    configuredTemplateKey?: string | null;
  }
): Promise<boolean> {
  if (!isHrFinalApprovalStep(params.step)) return false;
  if (params.configuredTemplateKey === EMAIL_TEMPLATE_TYPE.APPROVED) return false;
  return sendPlacementOfferEmail(supabase, params);
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTemplatedEmail } from "@/lib/email/send-templated-email";
import { EMAIL_TEMPLATE_TYPE } from "@/lib/email-templates/template-keys";
import { SendEmailError } from "@/lib/email/errors";
import { buildApplicantEmailContext, contextToTemplateVariables } from "@/lib/email/applicant-email-context";
import {
  isPlacementAcceptedStatus,
  isTerminalApplicationStatus,
  parseApplicantLifecyclePhase,
} from "@/lib/onboarding/workflow-phase";
import { loadApplicationWorkflowPhase } from "@/lib/onboarding/resolve-application-workflow-phase";

export type ActivatePostHireResult = {
  applicationId: string;
  tenantId: string;
  phase: "pre_hire" | "post_hire" | "completed";
  activated: boolean;
  alreadyActive: boolean;
  skipped: boolean;
  skipReason: string | null;
  postHireActivatedAt: string | null;
  email: {
    sent: boolean;
    skipped: boolean;
    reason?: string;
    messageId?: string;
  } | null;
};

type RpcPayload = {
  activated?: boolean;
  alreadyActive?: boolean;
  skipped?: boolean;
  reason?: string | null;
  phase?: string | null;
  postHireActivatedAt?: string | null;
  applicationId?: string;
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

async function sendPlacementAcceptedEmail(params: {
  supabase: SupabaseClient;
  tenantId: string;
  workerId: string;
  applicationId: string;
  origin: string;
  jobTitle: string;
}): Promise<ActivatePostHireResult["email"]> {
  try {
    const ctx = await buildApplicantEmailContext(params.supabase, {
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
    if (!ctx) {
      return { sent: false, skipped: true, reason: "NO_APPLICANT_EMAIL" };
    }

    const result = await sendTemplatedEmail(params.supabase, {
      to: ctx.applicantEmail,
      tenantId: params.tenantId,
      templateKey: EMAIL_TEMPLATE_TYPE.PLACEMENT_ACCEPTED,
      variables: {
        ...contextToTemplateVariables(ctx),
        jobTitle: params.jobTitle,
        onboardingLink: ctx.applicantContinuationLink,
      },
    });
    return {
      sent: result.sent,
      skipped: result.skipped ?? false,
      reason: result.reason,
      messageId: result.messageId,
    };
  } catch (error) {
    const reason =
      error instanceof SendEmailError || error instanceof Error ? error.message : "EMAIL_FAILED";
    console.error("[activatePostHire] onboarding email failed", {
      tenantId: params.tenantId,
      applicationId: params.applicationId,
      reason,
    });
    return { sent: false, skipped: false, reason };
  }
}

async function markActivationEmailSent(
  supabase: SupabaseClient,
  params: { tenantId: string; applicationId: string }
): Promise<void> {
  const { error } = await supabase
    .from("job_applications")
    .update({ post_hire_activation_email_sent_at: new Date().toISOString() })
    .eq("id", params.applicationId)
    .eq("tenant_id", params.tenantId);
  if (error && !/post_hire_activation_email_sent_at|does not exist/i.test(String(error.message))) {
    throw error;
  }
}

/**
 * Idempotent Pre-Hire → Post-Hire transition for one job application.
 * Email failure does not roll the phase back.
 */
export async function activatePostHire(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    applicationId: string;
    actorUserId?: string | null;
    origin?: string | null;
    sendEmail?: boolean;
    forceEmail?: boolean;
  }
): Promise<ActivatePostHireResult> {
  const existing = await loadApplicationWorkflowPhase(supabase, {
    tenantId: input.tenantId,
    applicationId: input.applicationId,
  });
  if (!existing) {
    return {
      applicationId: input.applicationId,
      tenantId: input.tenantId,
      phase: "pre_hire",
      activated: false,
      alreadyActive: false,
      skipped: true,
      skipReason: "APPLICATION_NOT_FOUND",
      postHireActivatedAt: null,
      email: null,
    };
  }

  if (isTerminalApplicationStatus(existing.status)) {
    return {
      applicationId: existing.applicationId,
      tenantId: existing.tenantId,
      phase: existing.phase,
      activated: false,
      alreadyActive: existing.phase !== "pre_hire",
      skipped: true,
      skipReason: "TERMINAL_STATUS",
      postHireActivatedAt: existing.postHireActivatedAt,
      email: null,
    };
  }

  if (!isPlacementAcceptedStatus(existing.status) && existing.phase === "pre_hire") {
    return {
      applicationId: existing.applicationId,
      tenantId: existing.tenantId,
      phase: existing.phase,
      activated: false,
      alreadyActive: false,
      skipped: true,
      skipReason: "NOT_ACCEPTED",
      postHireActivatedAt: existing.postHireActivatedAt,
      email: null,
    };
  }

  const { data, error } = await supabase.rpc("activate_post_hire", {
    p_tenant_id: input.tenantId,
    p_application_id: input.applicationId,
    p_actor_user_id: input.actorUserId ?? null,
  });

  if (error) {
    if (/Could not find the function|activate_post_hire/i.test(String(error.message))) {
      const fallback = await supabase
        .from("job_applications")
        .update({
          workflow_phase: "post_hire",
          post_hire_activated_at: existing.postHireActivatedAt ?? new Date().toISOString(),
        })
        .eq("id", input.applicationId)
        .eq("tenant_id", input.tenantId)
        .eq("workflow_phase", "pre_hire")
        .select("id, workflow_phase, post_hire_activated_at")
        .maybeSingle();
      if (fallback.error && !isMissingColumnError(fallback.error)) throw fallback.error;
    } else {
      throw error;
    }
  }

  const payload = (data ?? {}) as RpcPayload;
  const after = await loadApplicationWorkflowPhase(supabase, {
    tenantId: input.tenantId,
    applicationId: input.applicationId,
  });
  const phase = parseApplicantLifecyclePhase(payload.phase ?? after?.phase);
  const alreadyActive = Boolean(payload.alreadyActive) || existing.phase !== "pre_hire";
  const activated = Boolean(payload.activated) || (phase !== "pre_hire" && existing.phase === "pre_hire");
  const postHireActivatedAt =
    payload.postHireActivatedAt ?? after?.postHireActivatedAt ?? existing.postHireActivatedAt;

  const shouldEmail = input.sendEmail !== false && Boolean(input.origin) && phase !== "pre_hire";
  const emailAlreadySent = Boolean(after?.postHireActivationEmailSentAt ?? existing.postHireActivationEmailSentAt);
  const canSend = shouldEmail && (!emailAlreadySent || Boolean(input.forceEmail));

  let email: ActivatePostHireResult["email"] = null;
  if (canSend && after?.workerId) {
    const jobTitle = await loadJobTitle(supabase, {
      tenantId: input.tenantId,
      applicationId: input.applicationId,
    });
    email = await sendPlacementAcceptedEmail({
      supabase,
      tenantId: input.tenantId,
      workerId: after.workerId,
      applicationId: input.applicationId,
      origin: input.origin!,
      jobTitle,
    });
    if (email?.sent) {
      await markActivationEmailSent(supabase, {
        tenantId: input.tenantId,
        applicationId: input.applicationId,
      });
    }
  } else if (emailAlreadySent && !input.forceEmail) {
    email = { sent: false, skipped: true, reason: "ALREADY_SENT" };
  }

  return {
    applicationId: input.applicationId,
    tenantId: input.tenantId,
    phase,
    activated,
    alreadyActive,
    skipped: Boolean(payload.skipped) && !activated,
    skipReason: payload.reason ?? null,
    postHireActivatedAt,
    email,
  };
}

function isMissingColumnError(error: { message?: string; code?: string } | null): boolean {
  const message = String(error?.message ?? "");
  return error?.code === "42703" || /workflow_phase|does not exist/i.test(message);
}

export function shouldActivatePostHireAfterStatusChange(params: {
  unchanged: boolean;
  status: string;
}): boolean {
  return isPlacementAcceptedStatus(params.status);
}

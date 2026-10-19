import type { SupabaseClient } from "@supabase/supabase-js";
import { writeActivityLog } from "@/lib/audit/activity-log";
import { sendOnboardingApplicantEmail } from "@/lib/email/send-templated-email";
import {
  EMAIL_TEMPLATE_TYPE,
  isOnboardingEmailTemplateKey,
  type OnboardingEmailTemplateKey,
} from "@/lib/email-templates/template-keys";

export type StepCompletionEmailResult = {
  sent: boolean;
  skipped?: boolean;
  reason?: string;
  templateKey?: OnboardingEmailTemplateKey | null;
};

function settingsRecord(settings: unknown): Record<string, unknown> | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return null;
  return settings as Record<string, unknown>;
}

/** Candidate email chosen in workflow step settings. Blank and recruiter-only templates are ignored. */
export function readStepEmailTemplateKey(settings: unknown): OnboardingEmailTemplateKey | null {
  const record = settingsRecord(settings);
  const nested = settingsRecord(record?.workflow_settings);
  const raw = String(record?.emailTemplateKey ?? nested?.emailTemplateKey ?? "").trim();
  if (!raw || !isOnboardingEmailTemplateKey(raw)) return null;
  if (raw === EMAIL_TEMPLATE_TYPE.RECRUITER_AGREEMENT_SIGNED) return null;
  return raw;
}

/**
 * Sends the step's optional email template to the candidate.
 * Does nothing when the step has no template. Failures are logged and do not throw.
 */
export async function sendConfiguredStepCompletionEmail(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    workerId: string;
    origin: string | null;
    settings: unknown;
    stepTitle?: string | null;
    stepId?: string | null;
    request?: Request;
  }
): Promise<StepCompletionEmailResult> {
  const templateKey = readStepEmailTemplateKey(params.settings);
  if (!templateKey) {
    return { sent: false, skipped: true, reason: "NO_TEMPLATE", templateKey: null };
  }
  if (!params.origin?.trim()) {
    return { sent: false, skipped: true, reason: "NO_APP_ORIGIN", templateKey };
  }

  try {
    const result = await sendOnboardingApplicantEmail(supabase, {
      tenantId: params.tenantId,
      workerId: params.workerId,
      templateKey,
      origin: params.origin,
    });

    await writeActivityLog({
      actorUserId: null,
      action: "workflow_step.completion_email_sent",
      entityType: "onboarding_step",
      entityId: params.stepId ?? null,
      tenantId: params.tenantId,
      metadata: {
        worker_id: params.workerId,
        step_title: params.stepTitle ?? null,
        template_key: templateKey,
        sent: result.sent,
        skipped: result.skipped ?? false,
        reason: result.reason ?? null,
      },
      request: params.request,
    });

    return {
      sent: result.sent,
      skipped: result.skipped,
      reason: result.reason,
      templateKey,
    };
  } catch (error) {
    console.error("[step-completion-email] send failed", {
      tenantId: params.tenantId,
      workerId: params.workerId,
      templateKey,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { sent: false, skipped: true, reason: "SEND_FAILED", templateKey };
  }
}

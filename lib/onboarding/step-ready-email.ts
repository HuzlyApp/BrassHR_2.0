import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTemplatedEmail } from "@/lib/email/send-templated-email";
import { EMAIL_TEMPLATE_TYPE } from "@/lib/email-templates/template-keys";
import type { ApplicantLifecyclePhase } from "@/lib/onboarding/workflow-phase";

type SendOptions = Parameters<typeof sendTemplatedEmail>[1];

export function stepReadyTemplateKey(phase: ApplicantLifecyclePhase | string | null | undefined) {
  return phase === "post_hire" || phase === "completed"
    ? EMAIL_TEMPLATE_TYPE.POST_HIRE_STEP_READY
    : EMAIL_TEMPLATE_TYPE.NEXT_STEP_READY;
}

function isTemplateNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "NOT_FOUND"
  );
}

/**
 * "Your next step is ready" email to the candidate. Post-Hire uses onboarding wording;
 * environments without that template fall back to the application-step template.
 */
export async function sendStepReadyEmail(
  supabase: SupabaseClient,
  params: Omit<SendOptions, "templateKey"> & { phase: ApplicantLifecyclePhase | string | null | undefined }
) {
  const { phase, ...options } = params;
  const templateKey = stepReadyTemplateKey(phase);
  try {
    return await sendTemplatedEmail(supabase, { ...options, templateKey });
  } catch (error) {
    if (templateKey === EMAIL_TEMPLATE_TYPE.NEXT_STEP_READY || !isTemplateNotFound(error)) throw error;
    return sendTemplatedEmail(supabase, { ...options, templateKey: EMAIL_TEMPLATE_TYPE.NEXT_STEP_READY });
  }
}

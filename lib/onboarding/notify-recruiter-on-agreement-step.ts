import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hireLifecycleForPhase } from "@/lib/onboarding/hire-stage-catalog";
import {
  createNotificationsForUsers,
  listTenantStaffUserIds,
} from "@/lib/notifications/create-notification";
import { resolveHrNotifyEmails } from "@/lib/onboarding/resolve-hr-notify-emails";
import { sendCandidateEmail } from "@/lib/communication/send-candidate-email";
import { sendTemplatedEmail } from "@/lib/email/send-templated-email";
import { resolveEmailTemplate } from "@/lib/email-templates/resolver";
import { writeActivityLog } from "@/lib/audit/activity-log";
import type { TenantOnboardingStep } from "@/lib/onboarding/types";
import {
  isAgreementOrSignatureStep,
  type AgreementStepInput,
} from "./is-agreement-step";

export { isAgreementOrSignatureStep, type AgreementStepInput };

export type NotifyRecruiterAgreementParams = {
  tenantId: string;
  workerId: string;
  applicationId: string | null;
  step: AgreementStepInput | TenantOnboardingStep | null | undefined;
  stepKey?: string | null;
  data?: Record<string, unknown> | null;
  origin?: string | null;
  request?: Request;
};

export type NotifyRecruiterAgreementResult = {
  notified: boolean;
  reason?: string;
  inAppRecipientsCount: number;
  emailsSentCount: number;
};

export async function notifyRecruiterOnAgreementStepCompletion(
  supabase: SupabaseClient,
  params: NotifyRecruiterAgreementParams
): Promise<NotifyRecruiterAgreementResult> {
  const step = params.step;
  const mergedStep: AgreementStepInput = {
    ...step,
    stepKey: params.stepKey || step?.step_key || (step as AgreementStepInput)?.stepKey,
    data: params.data || (step as AgreementStepInput)?.data,
  };

  if (!isAgreementOrSignatureStep(mergedStep)) {
    return {
      notified: false,
      reason: "NOT_AN_AGREEMENT_STEP",
      inAppRecipientsCount: 0,
      emailsSentCount: 0,
    };
  }

  // 1. Resolve candidate, job, assigned recruiter, and tenant details
  const [workerRes, appRes, tenantRes] = await Promise.all([
    supabase
      .from("worker")
      .select("id, first_name, last_name, email, job_role, assigned_recruiter_user_id")
      .eq("id", params.workerId)
      .eq("tenant_id", params.tenantId)
      .maybeSingle(),
    params.applicationId
      ? supabase
          .from("job_applications")
          .select(`
            id,
            assigned_recruiter_user_id,
            job_requisitions(public_title, source_job_title, assigned_recruiter_user_id),
            onboarding_flows(title)
          `)
          .eq("id", params.applicationId)
          .eq("tenant_id", params.tenantId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("tenants")
      .select("name")
      .eq("id", params.tenantId)
      .maybeSingle(),
  ]);

  const worker = workerRes.data;
  const app = appRes.data;
  const tenant = tenantRes.data;

  const candidateName =
    `${worker?.first_name ?? ""} ${worker?.last_name ?? ""}`.trim() ||
    worker?.email ||
    "Candidate";

  let jobTitle = worker?.job_role || "Position";
  let assignedRecruiterId = worker?.assigned_recruiter_user_id || null;

  if (app) {
    if (app.assigned_recruiter_user_id) {
      assignedRecruiterId = app.assigned_recruiter_user_id;
    }
    const job = Array.isArray(app.job_requisitions)
      ? app.job_requisitions[0]
      : app.job_requisitions;
    const flow = Array.isArray(app.onboarding_flows)
      ? app.onboarding_flows[0]
      : app.onboarding_flows;

    if (job?.public_title?.trim()) {
      jobTitle = job.public_title.trim();
    } else if (job?.source_job_title?.trim()) {
      jobTitle = job.source_job_title.trim();
    } else if (flow?.title?.trim()) {
      jobTitle = flow.title.trim();
    }

    if (!assignedRecruiterId && job?.assigned_recruiter_user_id) {
      assignedRecruiterId = job.assigned_recruiter_user_id;
    }
  }

  const tenantName = tenant?.name?.trim() || "Organization";
  const stepTitle = mergedStep.title?.trim() || "Agreement & Signature Step";

  // Determine Pre-Hire vs Post-Hire lifecycle
  const metadataSettings = mergedStep.metadata?.workflow_settings as Record<string, unknown> | undefined;
  const rawPhase = metadataSettings?.phase || mergedStep.phase;
  const lifecycle = hireLifecycleForPhase(rawPhase as string | undefined);
  const isPostHire = lifecycle === "post_hire";
  const lifecycleLabel = isPostHire ? "Post-Hire" : "Pre-Hire";
  const lifecycleTab = isPostHire ? "post_hire" : "pre_hire";

  const appOrigin =
    params.origin?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000";
  const candidateLink = `${appOrigin}/admin_recruiter/candidates/${encodeURIComponent(
    params.workerId
  )}/hire-journey?tab=${lifecycleTab}`;

  // 2. In-App Notifications for Recruiters / Staff
  const staffUserIds = await listTenantStaffUserIds(supabase, params.tenantId);
  const targetUserIds = Array.from(
    new Set([...staffUserIds, ...(assignedRecruiterId ? [assignedRecruiterId] : [])].filter(Boolean))
  );

  let inAppRecipientsCount = 0;
  if (targetUserIds.length > 0) {
    try {
      inAppRecipientsCount = await createNotificationsForUsers(supabase, {
        tenantId: params.tenantId,
        userIds: targetUserIds,
        type: "candidate_agreement_signed",
        title: `Agreement signed: ${stepTitle}`,
        body: `${candidateName} completed ${stepTitle} for ${jobTitle}.`,
        link: `/admin_recruiter/candidates/${encodeURIComponent(params.workerId)}/hire-journey?tab=${lifecycleTab}`,
      });
    } catch (notifErr) {
      console.warn("[notifyRecruiterOnAgreementStep] In-app notification error", notifErr);
    }
  }

  // 3. Email Notifications for Recruiters / Staff
  const hrEmails = await resolveHrNotifyEmails(supabase, params.tenantId);
  let assignedEmail: string | null = null;
  if (assignedRecruiterId) {
    const { data: recUser } = await supabase
      .from("users")
      .select("email")
      .eq("id", assignedRecruiterId)
      .maybeSingle();
    if (recUser?.email && recUser.email.includes("@")) {
      assignedEmail = recUser.email.trim().toLowerCase();
    }
  }

  const recipientEmails = Array.from(
    new Set([assignedEmail, ...hrEmails].filter((e): e is string => Boolean(e && e.includes("@"))))
  );

  let emailsSentCount = 0;
  const variables: Record<string, string> = {
    candidateName,
    stepTitle,
    jobTitle,
    lifecyclePhase: lifecycleLabel,
    candidateLink,
    tenantName,
    supportEmail: "support@brasshr.com",
  };

  // Check if recruiter_agreement_signed template is in the database
  let useTemplateKey = false;
  try {
    const resolvedTemplate = await resolveEmailTemplate(supabase, {
      tenantId: params.tenantId,
      templateKey: "recruiter_agreement_signed",
      locale: "en",
    });
    if (resolvedTemplate.template && resolvedTemplate.template.status === "active") {
      useTemplateKey = true;
    }
  } catch {
    useTemplateKey = false;
  }

  const subject = `Action Completed: ${candidateName} signed ${stepTitle}`;
  const fallbackBodyText = `Hi,\n\n${candidateName} has completed and signed ${stepTitle} for ${jobTitle} (${lifecycleLabel}).\n\nReview their submission:\n${candidateLink}\n\nBest regards,\n${tenantName} Recruiting Team`;
  const fallbackBodyHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #0F2744; margin-bottom: 16px; font-size: 20px;">Agreement Step Completed</h2>
      <p style="margin: 0 0 12px 0;">Hi,</p>
      <p style="margin: 0 0 16px 0;"><strong>${candidateName}</strong> has completed and signed <strong>${stepTitle}</strong> for <strong>${jobTitle}</strong> (${lifecycleLabel}).</p>
      <p style="margin: 24px 0;">
        <a href="${candidateLink}" style="display: inline-block; padding: 12px 22px; background-color: #0F2744; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
          View Candidate in Hire Journey
        </a>
      </p>
      <p style="color: #64748b; font-size: 13px; margin: 24px 0 16px 0;">
        If the button above does not work, copy and paste this link into your browser:<br/>
        <a href="${candidateLink}" style="color: #2563eb;">${candidateLink}</a>
      </p>
      <p style="margin: 24px 0 0 0; border-top: 1px solid #e2e8f0; padding-top: 16px; color: #64748b; font-size: 13px;">
        Best regards,<br/>
        <strong style="color: #0F2744;">${tenantName}</strong> Recruiting Team
      </p>
    </div>
  `;

  for (const to of recipientEmails) {
    try {
      if (useTemplateKey) {
        const templatedResult = await sendTemplatedEmail(supabase, {
          to,
          tenantId: params.tenantId,
          templateKey: "recruiter_agreement_signed",
          variables,
        });
        if (templatedResult.sent) {
          emailsSentCount += 1;
          continue;
        }
      }

      const directResult = await sendCandidateEmail({
        to,
        subject,
        body: fallbackBodyText,
        bodyHtml: fallbackBodyHtml,
      });
      if (directResult.ok) {
        emailsSentCount += 1;
      }
    } catch (emailErr) {
      console.warn(`[notifyRecruiterOnAgreementStep] Email dispatch to ${to} failed`, emailErr);
    }
  }

  // 4. Audit Log
  await writeActivityLog({
    actorUserId: null,
    action: "candidate_agreement_signed_recruiter_notified",
    entityType: "job_application",
    entityId: params.applicationId || params.workerId,
    tenantId: params.tenantId,
    metadata: {
      worker_id: params.workerId,
      application_id: params.applicationId,
      step_title: stepTitle,
      step_key: mergedStep.stepKey,
      in_app_recipients_count: inAppRecipientsCount,
      emails_sent_count: emailsSentCount,
      recipients: recipientEmails,
    },
    request: params.request,
  }).catch(() => undefined);

  return {
    notified: true,
    inAppRecipientsCount,
    emailsSentCount,
  };
}

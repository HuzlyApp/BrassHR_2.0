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

  // 1. Dynamic stepTitle resolution
  let stepTitle = mergedStep.title?.trim() || "";
  const stepId = mergedStep.id || null;
  const stepKey = mergedStep.stepKey || null;

  let dbStepRow: { id: string; title: string | null; step_key: string | null; metadata: Record<string, unknown> | null } | null = null;

  const isGenericTitle =
    !stepTitle ||
    stepTitle.toLowerCase() === "agreement" ||
    stepTitle.toLowerCase() === "agreement & signature step" ||
    stepTitle.toLowerCase() === "step";

  if (isGenericTitle && (stepId || stepKey)) {
    try {
      let dbStepQuery = supabase
        .from("tenant_onboarding_steps")
        .select("id, title, step_key, metadata");

      if (stepId) {
        dbStepQuery = dbStepQuery.eq("id", stepId);
      } else if (stepKey) {
        dbStepQuery = dbStepQuery.eq("tenant_id", params.tenantId).eq("step_key", stepKey);
      }

      const { data: fetchedStep } = await dbStepQuery.maybeSingle();
      if (fetchedStep) {
        dbStepRow = fetchedStep;
        if (fetchedStep.title?.trim()) {
          stepTitle = fetchedStep.title.trim();
        }
      }
    } catch {
      /* best effort step lookup */
    }
  }

  if (!stepTitle || stepTitle.toLowerCase() === "agreement" || stepTitle.toLowerCase() === "agreement & signature step") {
    const metaWorkflowSettings = (mergedStep.metadata?.workflow_settings ?? dbStepRow?.metadata?.workflow_settings) as Record<string, unknown> | undefined;
    const recruiterTemplateName =
      (typeof metaWorkflowSettings?.recruiterTemplateName === "string" && metaWorkflowSettings.recruiterTemplateName.trim()) ||
      (typeof mergedStep.metadata?.template_name === "string" && (mergedStep.metadata.template_name as string).trim()) ||
      (typeof mergedStep.metadata?.document_title === "string" && (mergedStep.metadata.document_title as string).trim()) ||
      (typeof mergedStep.data?.template_name === "string" && (mergedStep.data.template_name as string).trim());

    if (recruiterTemplateName) {
      stepTitle = recruiterTemplateName;
    }
  }

  if (!stepTitle || stepTitle.toLowerCase() === "agreement & signature step") {
    if (stepKey) {
      stepTitle = stepKey
        .split(/[-_]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    } else {
      stepTitle = "Agreement";
    }
  }

  // 2. Deduplication check: verify if recruiter was already notified for this candidate and step
  const callerData = params.data && typeof params.data === "object" ? (params.data as Record<string, unknown>) : null;
  if (callerData?.recruiter_notified_at) {
    return {
      notified: false,
      reason: "ALREADY_NOTIFIED",
      inAppRecipientsCount: 0,
      emailsSentCount: 0,
    };
  }

  const effectiveStepId = stepId || dbStepRow?.id || null;
  if (effectiveStepId) {
    try {
      const { data: existingProgress } = await supabase
        .from("worker_onboarding_step_progress")
        .select("data")
        .eq("worker_id", params.workerId)
        .eq("onboarding_step_id", effectiveStepId)
        .maybeSingle();

      const existingData = existingProgress?.data as Record<string, unknown> | undefined;
      if (existingData?.recruiter_notified_at) {
        return {
          notified: false,
          reason: "ALREADY_NOTIFIED",
          inAppRecipientsCount: 0,
          emailsSentCount: 0,
        };
      }
    } catch {
      /* continue to notifications check */
    }
  }

  try {
    const { data: existingNotifs } = await supabase
      .from("notifications")
      .select("id")
      .eq("tenant_id", params.tenantId)
      .eq("type", "candidate_agreement_signed")
      .eq("title", `Agreement signed: ${stepTitle}`)
      .ilike("link", `%${params.workerId}%`)
      .limit(1);

    if (existingNotifs && existingNotifs.length > 0) {
      return {
        notified: false,
        reason: "ALREADY_NOTIFIED",
        inAppRecipientsCount: 0,
        emailsSentCount: 0,
      };
    }
  } catch {
    /* continue if notifications check failed */
  }

  // 3. Resolve candidate, job, assigned recruiter, and tenant details
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
      : supabase
          .from("job_applications")
          .select(`
            id,
            assigned_recruiter_user_id,
            job_requisitions(public_title, source_job_title, assigned_recruiter_user_id),
            onboarding_flows(title)
          `)
          .eq("worker_id", params.workerId)
          .eq("tenant_id", params.tenantId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
    supabase
      .from("tenants")
      .select("name")
      .eq("id", params.tenantId)
      .maybeSingle(),
  ]);

  const worker = workerRes.data;
  let app = appRes.data;
  const tenant = tenantRes.data;

  if (!app && params.applicationId) {
    try {
      const fallbackApp = await supabase
        .from("job_applications")
        .select(`
          id,
          assigned_recruiter_user_id,
          job_requisitions(public_title, source_job_title, assigned_recruiter_user_id),
          onboarding_flows(title)
        `)
        .eq("worker_id", params.workerId)
        .eq("tenant_id", params.tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      app = fallbackApp.data;
    } catch {
      /* fallback app lookup best effort */
    }
  }

  const candidateName =
    `${worker?.first_name ?? ""} ${worker?.last_name ?? ""}`.trim() ||
    worker?.email ||
    "Candidate";

  let jobTitle = "";
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

  if (!jobTitle && worker?.job_role?.trim()) {
    jobTitle = worker.job_role.trim();
  }

  if (!jobTitle) {
    jobTitle = "Position";
  }

  const tenantName = tenant?.name?.trim() || "Organization";

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

  // 4. Mark step progress row as notified so subsequent attempts never send duplicates
  const notifiedAt = new Date().toISOString();
  if (callerData) {
    callerData.recruiter_notified_at = notifiedAt;
  }

  if (effectiveStepId) {
    try {
      const { data: currProgress } = await supabase
        .from("worker_onboarding_step_progress")
        .select("data")
        .eq("worker_id", params.workerId)
        .eq("onboarding_step_id", effectiveStepId)
        .maybeSingle();

      const currData = (currProgress?.data as Record<string, unknown> | undefined) || {};
      await supabase
        .from("worker_onboarding_step_progress")
        .update({
          data: {
            ...currData,
            recruiter_notified_at: notifiedAt,
            recruiter_notified_emails_count: emailsSentCount,
            recruiter_notified_in_app_count: inAppRecipientsCount,
          },
          updated_at: notifiedAt,
        })
        .eq("worker_id", params.workerId)
        .eq("onboarding_step_id", effectiveStepId);
    } catch (saveErr) {
      console.warn("[notifyRecruiterOnAgreementStep] failed to persist notified flag", saveErr);
    }
  }

  // 5. Audit Log
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

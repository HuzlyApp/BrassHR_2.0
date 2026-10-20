-- Global email template: sent to recruiter / staff when candidate completes an agreement,
-- e-signature, or signed document/attestation step.

INSERT INTO public.email_templates (
  tenant_id, template_key, name, subject, body_html, body_text, variables,
  locale, status, version, is_active_version
)
SELECT
  NULL,
  'recruiter_agreement_signed',
  'Candidate agreement / signature completed',
  'Action Completed: {{candidateName}} signed {{stepTitle}}',
  $$<p>Hi,</p><p><strong>{{candidateName}}</strong> has completed and signed <strong>{{stepTitle}}</strong> for <strong>{{jobTitle}}</strong> ({{lifecyclePhase}}).</p><p>You can review their submission and hire journey here:</p><p><a href="{{candidateLink}}" style="display:inline-block;padding:10px 18px;background-color:#0F2744;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">View Candidate in Hire Journey</a></p><p style="font-size:13px;color:#64748B;">If the button does not work, copy and paste this URL into your browser:<br>{{candidateLink}}</p><p>Best regards,<br>{{tenantName}} Recruiting Team</p>$$,
  $$Hi,

{{candidateName}} has completed and signed {{stepTitle}} for {{jobTitle}} ({{lifecyclePhase}}).

Review their submission and hire journey:
{{candidateLink}}

Best regards,
{{tenantName}} Recruiting Team$$,
  '[{"key":"candidateName","required":true},{"key":"stepTitle","required":true},{"key":"jobTitle","required":true},{"key":"lifecyclePhase","required":true},{"key":"candidateLink","required":true},{"key":"tenantName","required":false}]'::jsonb,
  'en',
  'active',
  1,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.email_templates t
  WHERE t.tenant_id IS NULL
    AND t.template_key = 'recruiter_agreement_signed'
    AND t.locale = 'en'
    AND t.version = 1
);

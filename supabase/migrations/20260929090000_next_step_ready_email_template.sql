-- Global candidate email: sent to the applicant (never staff) when an internal step
-- (e.g. Recruiter Screening) is completed and it unlocks a step the applicant must fill in.

INSERT INTO public.email_templates (
  tenant_id, template_key, name, subject, body_html, body_text, variables,
  locale, status, version, is_active_version
)
SELECT
  NULL,
  'next_step_ready',
  'Next application step ready',
  'Action needed: {{nextStepTitle}} is ready for you',
  '<p>Hi {{applicantName}},</p><p>Your application for <strong>{{jobTitle}}</strong> with {{tenantName}} has moved forward.</p><p>Your next step is <strong>{{nextStepTitle}}</strong>. Please complete it so we can continue reviewing your application.</p><p><a href="{{nextStepLink}}">Complete {{nextStepTitle}}</a></p><p>Questions? Contact us at {{supportEmail}}.</p>',
  E'Hi {{applicantName}},\n\nYour application for {{jobTitle}} with {{tenantName}} has moved forward.\n\nYour next step is {{nextStepTitle}}. Please complete it so we can continue reviewing your application:\n{{nextStepLink}}\n\nQuestions? {{supportEmail}}',
  '[{"key":"applicantName","required":true},{"key":"tenantName","required":true},{"key":"jobTitle","required":true},{"key":"nextStepTitle","required":true},{"key":"nextStepLink","required":true},{"key":"supportEmail","required":true}]'::jsonb,
  'en',
  'active',
  1,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.email_templates t
  WHERE t.tenant_id IS NULL
    AND t.template_key = 'next_step_ready'
    AND t.locale = 'en'
    AND t.version = 1
);

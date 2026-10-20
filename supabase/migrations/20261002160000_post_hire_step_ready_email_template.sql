-- Global candidate email for Post-Hire onboarding: sent when staff send a step reminder or when
-- completing an internal Post-Hire step unlocks a step the new hire must complete.

INSERT INTO public.email_templates (
  tenant_id, template_key, name, subject, body_html, body_text, variables,
  locale, status, version, is_active_version
)
SELECT
  NULL,
  'post_hire_step_ready',
  'Post-Hire onboarding step ready',
  'Onboarding: please complete {{nextStepTitle}}',
  '<p>Hi {{applicantName}},</p>'
  || '<p>Welcome aboard! Your onboarding for <strong>{{jobTitle}}</strong> with {{tenantName}} is in progress.</p>'
  || '<p>Your next onboarding step is <strong>{{nextStepTitle}}</strong>. Please complete it so we can finish setting you up before your start date.</p>'
  || '<p><a href="{{nextStepLink}}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:600;">Complete {{nextStepTitle}}</a></p>'
  || '<p style="font-size:13px;color:#475569;">If the button doesn''t work, copy and paste this link into your browser:<br>{{nextStepLink}}</p>'
  || '<p>Questions? Contact us at {{supportEmail}}.</p>',
  E'Hi {{applicantName}},\n\nWelcome aboard! Your onboarding for {{jobTitle}} with {{tenantName}} is in progress.\n\nYour next onboarding step is {{nextStepTitle}}. Please complete it so we can finish setting you up before your start date:\n{{nextStepLink}}\n\nQuestions? {{supportEmail}}',
  '[{"key":"applicantName","required":true},{"key":"tenantName","required":true},{"key":"jobTitle","required":true},{"key":"nextStepTitle","required":true},{"key":"nextStepLink","required":true},{"key":"supportEmail","required":true}]'::jsonb,
  'en',
  'active',
  1,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.email_templates t
  WHERE t.tenant_id IS NULL
    AND t.template_key = 'post_hire_step_ready'
    AND t.locale = 'en'
    AND t.version = 1
);

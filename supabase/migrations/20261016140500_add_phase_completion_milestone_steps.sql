-- Offer & Agreement (Pre-Hire) and Welcome & Complete (Post-Hire) celebration steps.
-- These open the existing candidate completion screens; they are not a new screen.

INSERT INTO public.onboarding_step_library (
  tenant_id,
  category_id,
  category_label,
  step_key,
  step_type,
  title,
  description,
  icon_key,
  sort_order,
  default_settings
)
SELECT
  NULL,
  v.category_id,
  v.category_label,
  v.step_key,
  'custom_question',
  v.title,
  v.description,
  'completion-milestone',
  v.sort_order,
  v.default_settings::jsonb
FROM (
  VALUES
    (
      'offer-agreement',
      'Offer & Agreement',
      'pre-hire-completion-milestone',
      'Pre Hire Completion / Milestone',
      'Shows the Pre-Hire completion screen after the candidate finishes the other Pre-Hire steps.',
      5,
      '{"phase":"pre_hire","stageName":"Offer & Agreement","completionOwner":"applicant"}'
    ),
    (
      'communication-notification',
      'Welcome & Complete',
      'post-hire-completion-milestone',
      'Post hire Completion / Milestone',
      'Shows the Post-Hire completion screen after the candidate finishes the other Post-Hire steps.',
      6,
      '{"phase":"post_hire","stageName":"Welcome & Complete","completionOwner":"applicant"}'
    )
) AS v(category_id, category_label, step_key, title, description, sort_order, default_settings)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.onboarding_step_library existing
  WHERE existing.tenant_id IS NULL
    AND existing.step_key = v.step_key
);

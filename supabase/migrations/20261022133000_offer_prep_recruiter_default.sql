-- Offer prep is recruiter work: prepare the offer before it is sent.
-- Default the library and every stored copy to Recruiter so it stays off candidate steps.

UPDATE public.onboarding_step_library
SET
  default_settings = COALESCE(default_settings, '{}'::jsonb) || '{"completionOwner":"recruiter_or_hr"}'::jsonb,
  updated_at = now()
WHERE step_key = 'offer-prep'
  AND COALESCE(default_settings->>'completionOwner', '') IS DISTINCT FROM 'recruiter_or_hr';

UPDATE public.onboarding_template_steps
SET
  completion_owner = 'recruiter_or_hr',
  settings = jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{completionOwner}',
    '"recruiter_or_hr"'::jsonb
  ),
  updated_at = now()
WHERE step_type = 'offer-prep'
   OR metadata->>'library_step_key' = 'offer-prep';

UPDATE public.onboarding_flow_steps
SET
  completion_owner = 'recruiter_or_hr',
  settings = jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{completionOwner}',
    '"recruiter_or_hr"'::jsonb
  ),
  updated_at = now()
WHERE (
    step_type = 'offer-prep'
    OR metadata->>'library_step_key' = 'offer-prep'
  )
  AND (
    completion_owner IS DISTINCT FROM 'recruiter_or_hr'
    OR settings->>'completionOwner' IS DISTINCT FROM 'recruiter_or_hr'
  );

CREATE OR REPLACE FUNCTION pg_temp.set_offer_prep_nodes_recruiter(nodes jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN e.n->>'stepId' = 'offer-prep' THEN
          jsonb_set(
            CASE
              WHEN jsonb_typeof(e.n->'settings') = 'object' THEN e.n
              ELSE jsonb_set(e.n, '{settings}', '{}'::jsonb)
            END,
            '{settings,completionOwner}',
            '"recruiter_or_hr"'::jsonb
          )
        ELSE e.n
      END
      ORDER BY e.ord
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(nodes) WITH ORDINALITY AS e(n, ord)
$$;

UPDATE public.onboarding_templates
SET
  builder_draft = jsonb_set(builder_draft, '{nodes}', pg_temp.set_offer_prep_nodes_recruiter(builder_draft->'nodes')),
  updated_at = now()
WHERE jsonb_typeof(builder_draft->'nodes') = 'array'
  AND builder_draft->'nodes' IS DISTINCT FROM pg_temp.set_offer_prep_nodes_recruiter(builder_draft->'nodes');

UPDATE public.onboarding_flows
SET
  builder_draft = jsonb_set(builder_draft, '{nodes}', pg_temp.set_offer_prep_nodes_recruiter(builder_draft->'nodes')),
  updated_at = now()
WHERE jsonb_typeof(builder_draft->'nodes') = 'array'
  AND builder_draft->'nodes' IS DISTINCT FROM pg_temp.set_offer_prep_nodes_recruiter(builder_draft->'nodes');

UPDATE public.onboarding_workflow_templates
SET
  builder_draft = jsonb_set(builder_draft, '{nodes}', pg_temp.set_offer_prep_nodes_recruiter(builder_draft->'nodes')),
  updated_at = now()
WHERE jsonb_typeof(builder_draft->'nodes') = 'array'
  AND builder_draft->'nodes' IS DISTINCT FROM pg_temp.set_offer_prep_nodes_recruiter(builder_draft->'nodes');

UPDATE public.tenant_onboarding_configs
SET
  builder_draft = jsonb_set(builder_draft, '{nodes}', pg_temp.set_offer_prep_nodes_recruiter(builder_draft->'nodes')),
  updated_at = now()
WHERE jsonb_typeof(builder_draft->'nodes') = 'array'
  AND builder_draft->'nodes' IS DISTINCT FROM pg_temp.set_offer_prep_nodes_recruiter(builder_draft->'nodes');

UPDATE public.tenant_onboarding_steps
SET
  metadata = jsonb_set(
    metadata,
    '{workflow_settings,completionOwner}',
    '"recruiter_or_hr"'::jsonb
  ),
  updated_at = now()
WHERE (
    metadata->>'workflow_step_id' = 'offer-prep'
    OR step_key = 'offer-prep'
  )
  AND jsonb_typeof(metadata->'workflow_settings') = 'object'
  AND metadata->'workflow_settings'->>'completionOwner' IS DISTINCT FROM 'recruiter_or_hr';

UPDATE public.applicant_workflow_step_records
SET
  settings = jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{completionOwner}',
    '"recruiter_or_hr"'::jsonb
  ),
  updated_at = now()
WHERE step_type = 'offer-prep'
  AND settings->>'completionOwner' IS DISTINCT FROM 'recruiter_or_hr';

UPDATE public.workflow_step_instances
SET
  settings = jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{completionOwner}',
    '"recruiter_or_hr"'::jsonb
  ),
  updated_at = now()
WHERE step_type = 'offer-prep'
  AND settings->>'completionOwner' IS DISTINCT FROM 'recruiter_or_hr';

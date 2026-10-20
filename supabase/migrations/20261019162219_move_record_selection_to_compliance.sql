-- Move Record selection from the Completion stage into the Compliance group.
-- Template workflows must not keep this step on Completion.

UPDATE public.onboarding_step_library
SET
  category_id = 'screening-compliance',
  category_label = 'Compliance',
  sort_order = 8,
  default_settings = COALESCE(default_settings, '{}'::jsonb) || jsonb_build_object(
    'phase', 'pre_hire',
    'stageName', 'Compliance',
    'categoryOrder', 5
  ),
  updated_at = now()
WHERE step_key = 'record-selection';

UPDATE public.onboarding_templates AS template
SET
  builder_draft = jsonb_set(
    template.builder_draft,
    '{nodes}',
    (
      SELECT COALESCE(jsonb_agg(
        CASE
          WHEN node.value->>'stepId' = 'record-selection'
            OR COALESCE(node.value->'data'->>'stepId', '') = 'record-selection'
          THEN
            CASE
              WHEN jsonb_typeof(node.value->'settings') = 'object' THEN
                jsonb_set(
                  jsonb_set(
                    jsonb_set(node.value, '{settings,stageName}', '"Compliance"'::jsonb),
                    '{settings,phase}', '"pre_hire"'::jsonb
                  ),
                  '{settings,phaseOrder}', '1'::jsonb
                )
              ELSE node.value
            END
          ELSE node.value
        END
        ORDER BY node.ordinality
      ), '[]'::jsonb)
      FROM jsonb_array_elements(template.builder_draft->'nodes') WITH ORDINALITY AS node(value, ordinality)
    ),
    true
  ),
  updated_at = now()
WHERE jsonb_typeof(template.builder_draft->'nodes') = 'array'
  AND template.builder_draft::text ILIKE '%record-selection%';

UPDATE public.onboarding_template_steps
SET
  settings = jsonb_set(
    jsonb_set(
      jsonb_set(COALESCE(settings, '{}'::jsonb), '{stageName}', '"Compliance"'::jsonb),
      '{phase}', '"pre_hire"'::jsonb
    ),
    '{phaseOrder}', '1'::jsonb
  ),
  updated_at = now()
WHERE COALESCE(metadata->>'library_step_key', '') = 'record-selection'
   OR step_type = 'record-selection';

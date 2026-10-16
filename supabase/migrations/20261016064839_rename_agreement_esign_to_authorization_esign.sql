-- Rename pre-hire Agreement eSign display name to "Authorization e-sign" for all tenants.
-- Display title only — do NOT change step_key / step_type / snapshot_step_id.
-- Conversion after candidate e-sign continues to key off employee-agreement / agreement-esign.

-- =====================================================================================
-- 1. Step library (global + any tenant overrides)
-- =====================================================================================
UPDATE public.onboarding_step_library
SET
  title = 'Authorization e-sign',
  description = COALESCE(description, 'Collect authorization e-sign signatures.')
WHERE (
    step_key IN ('employee-agreement', 'agreement-esign', 'agreement_signature')
    OR title IN (
      'Agreement eSign',
      'Agreement signed',
      'Agreement Signed',
      'Employee Agreement / Contract eSign'
    )
  )
  AND title IS DISTINCT FROM 'Independent Contractor Agreement';

-- =====================================================================================
-- 2. Active / template / tenant step rows
-- =====================================================================================
UPDATE public.onboarding_flow_steps
SET
  title = 'Authorization e-sign',
  description = COALESCE(description, 'Collect authorization e-sign signatures.'),
  updated_at = now()
WHERE (
    step_type IN ('employee-agreement', 'agreement-esign', 'agreement_signature')
    OR title IN (
      'Agreement eSign',
      'Agreement signed',
      'Agreement Signed',
      'Employee Agreement / Contract eSign'
    )
  )
  AND title IS DISTINCT FROM 'Independent Contractor Agreement';

UPDATE public.onboarding_template_steps
SET
  title = 'Authorization e-sign',
  description = COALESCE(description, 'Collect authorization e-sign signatures.')
WHERE (
    step_type IN ('employee-agreement', 'agreement-esign', 'agreement_signature')
    OR title IN (
      'Agreement eSign',
      'Agreement signed',
      'Agreement Signed',
      'Employee Agreement / Contract eSign'
    )
  )
  AND title IS DISTINCT FROM 'Independent Contractor Agreement';

UPDATE public.tenant_onboarding_steps
SET
  title = 'Authorization e-sign',
  description = COALESCE(description, 'Collect authorization e-sign signatures.'),
  updated_at = now()
WHERE (
    step_key IN ('employee-agreement', 'agreement-esign', 'agreement_signature')
    OR metadata->>'workflow_step_id' IN ('employee-agreement', 'agreement-esign', 'agreement_signature')
    OR title IN (
      'Agreement eSign',
      'Agreement signed',
      'Agreement Signed',
      'Employee Agreement / Contract eSign'
    )
  )
  AND title IS DISTINCT FROM 'Independent Contractor Agreement';

-- In-flight / historical applicant step snapshots (display only)
UPDATE public.applicant_workflow_step_records
SET
  title = 'Authorization e-sign',
  updated_at = now()
WHERE (
    step_type IN ('employee-agreement', 'agreement-esign', 'agreement_signature')
    OR snapshot_step_id IN ('employee-agreement', 'agreement-esign', 'agreement_signature')
    OR settings->>'workflow_step_id' IN ('employee-agreement', 'agreement-esign', 'agreement_signature')
    OR title IN (
      'Agreement eSign',
      'Agreement signed',
      'Agreement Signed',
      'Employee Agreement / Contract eSign'
    )
  )
  AND title IS DISTINCT FROM 'Independent Contractor Agreement';

-- =====================================================================================
-- 3. Builder draft labels on flows, templates, and workflow_templates
-- =====================================================================================
DO $$
DECLARE
  v_row RECORD;
  v_nodes jsonb;
  v_node jsonb;
  v_new_nodes jsonb;
  v_i int;
  v_label text;
  v_step_id text;
  v_changed boolean;
BEGIN
  FOR v_row IN
    SELECT id, builder_draft, 'onboarding_flows'::text AS src
    FROM public.onboarding_flows
    WHERE builder_draft ? 'nodes'
    UNION ALL
    SELECT id, builder_draft, 'onboarding_templates'
    FROM public.onboarding_templates
    WHERE builder_draft ? 'nodes'
    UNION ALL
    SELECT id, builder_draft, 'workflow_templates'
    FROM public.workflow_templates
    WHERE builder_draft ? 'nodes'
  LOOP
    v_nodes := v_row.builder_draft->'nodes';
    IF v_nodes IS NULL OR jsonb_typeof(v_nodes) <> 'array' THEN
      CONTINUE;
    END IF;

    v_new_nodes := '[]'::jsonb;
    v_changed := false;

    FOR v_i IN 0..(jsonb_array_length(v_nodes) - 1)
    LOOP
      v_node := v_nodes->v_i;
      v_step_id := COALESCE(v_node->>'stepId', '');
      v_label := COALESCE(v_node->>'label', '');

      IF v_step_id IN ('employee-agreement', 'agreement-esign', 'agreement_signature')
         OR v_label IN (
           'Agreement eSign',
           'Agreement signed',
           'Agreement Signed',
           'Employee Agreement / Contract eSign'
         ) THEN
        -- Keep 1099-specific contractor agreement label unchanged.
        IF v_label IS DISTINCT FROM 'Independent Contractor Agreement' THEN
          v_node := jsonb_set(v_node, '{label}', '"Authorization e-sign"'::jsonb);
          v_changed := true;
        END IF;
      END IF;

      v_new_nodes := v_new_nodes || jsonb_build_array(v_node);
    END LOOP;

    IF v_changed THEN
      IF v_row.src = 'onboarding_flows' THEN
        UPDATE public.onboarding_flows
        SET builder_draft = jsonb_set(v_row.builder_draft, '{nodes}', v_new_nodes),
            updated_at = now()
        WHERE id = v_row.id;
      ELSIF v_row.src = 'onboarding_templates' THEN
        UPDATE public.onboarding_templates
        SET builder_draft = jsonb_set(v_row.builder_draft, '{nodes}', v_new_nodes),
            updated_at = now()
        WHERE id = v_row.id;
      ELSE
        UPDATE public.workflow_templates
        SET builder_draft = jsonb_set(v_row.builder_draft, '{nodes}', v_new_nodes),
            updated_at = now()
        WHERE id = v_row.id;
      END IF;
    END IF;
  END LOOP;
END $$;

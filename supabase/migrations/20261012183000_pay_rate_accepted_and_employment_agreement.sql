-- Migration: 20261012183000_pay_rate_accepted_and_employment_agreement.sql
-- Description:
-- 1. Rename "Offer Accepted" / "Offer Acceptance" to "Pay Rate Accepted".
-- 2. Interchange placement: Agreement eSign comes first, then Pay Rate Accepted comes second
--    across dynamic workflows (W2, 1099, R&R, custom tenant flows and presets).

-- =====================================================================================
-- 1. Step Library: Rename and set sort order (Agreement first, Pay Rate second)
-- =====================================================================================
UPDATE public.onboarding_step_library
SET
  title = 'Pay Rate Accepted',
  description = 'Confirm and accept the agreed pay rate.',
  sort_order = 3
WHERE step_key IN ('offer-acceptance', 'pay-rate-accepted')
   OR title IN ('Offer Accepted', 'Offer Acceptance');

UPDATE public.onboarding_step_library
SET sort_order = 2
WHERE step_key IN ('employee-agreement', 'agreement-esign', 'agreement_signature')
   OR title IN ('Agreement eSign', 'Employee Agreement / Contract eSign', 'Independent Contractor Agreement');


-- =====================================================================================
-- 2. Rename Step Title across active flow steps, template steps, tenant configs & records
-- =====================================================================================
UPDATE public.onboarding_flow_steps
SET
  title = 'Pay Rate Accepted',
  description = COALESCE(description, 'Confirm and accept the agreed pay rate.'),
  updated_at = now()
WHERE step_type IN ('offer-acceptance', 'pay-rate-accepted')
   OR title IN ('Offer Accepted', 'Offer Acceptance');

UPDATE public.onboarding_template_steps
SET
  title = 'Pay Rate Accepted',
  description = COALESCE(description, 'Confirm and accept the agreed pay rate.')
WHERE step_type IN ('offer-acceptance', 'pay-rate-accepted')
   OR title IN ('Offer Accepted', 'Offer Acceptance');

UPDATE public.tenant_onboarding_steps
SET
  title = 'Pay Rate Accepted',
  description = COALESCE(description, 'Confirm and accept the agreed pay rate.'),
  updated_at = now()
WHERE step_key IN ('offer-acceptance', 'pay-rate-accepted')
   OR metadata->>'workflow_step_id' IN ('offer-acceptance', 'pay-rate-accepted')
   OR title IN ('Offer Accepted', 'Offer Acceptance');

UPDATE public.applicant_workflow_step_records
SET
  title = 'Pay Rate Accepted',
  updated_at = now()
WHERE step_type IN ('offer-acceptance', 'pay-rate-accepted')
   OR snapshot_step_id IN ('offer-acceptance', 'pay-rate-accepted')
   OR settings->>'workflow_step_id' IN ('offer-acceptance', 'pay-rate-accepted')
   OR title IN ('Offer Accepted', 'Offer Acceptance');


-- =====================================================================================
-- 3. Interchange Step Positions: Agreement comes first, Pay Rate Accepted comes second
-- =====================================================================================
DO $$
DECLARE
  v_rec RECORD;
  v_row RECORD;
  v_nodes jsonb;
  v_node jsonb;
  v_new_nodes jsonb;
  v_offer_idx int;
  v_agree_idx int;
  v_offer_node jsonb;
  v_agree_node jsonb;
  v_offer_pos jsonb;
  v_agree_pos jsonb;
  v_offer_order text;
  v_agree_order text;
  i int;
BEGIN
  -- 3.1 Swap positions in onboarding_flow_steps
  FOR v_rec IN
    SELECT DISTINCT ON (f_offer.flow_id)
      f_offer.id AS offer_step_id,
      f_offer.position AS offer_pos,
      f_agree.id AS agree_step_id,
      f_agree.position AS agree_pos
    FROM public.onboarding_flow_steps f_offer
    JOIN public.onboarding_flow_steps f_agree
      ON f_offer.flow_id = f_agree.flow_id
     AND f_offer.step_type IN ('offer-acceptance', 'pay-rate-accepted')
     AND (f_agree.step_type IN ('employee-agreement', 'agreement-esign', 'agreement_signature') OR f_agree.title ILIKE '%agreement%')
     AND f_offer.position < f_agree.position
    ORDER BY f_offer.flow_id, f_agree.position ASC
  LOOP
    UPDATE public.onboarding_flow_steps SET position = 99999 + v_rec.offer_pos WHERE id = v_rec.offer_step_id;
    UPDATE public.onboarding_flow_steps SET position = v_rec.offer_pos WHERE id = v_rec.agree_step_id;
    UPDATE public.onboarding_flow_steps SET position = v_rec.agree_pos WHERE id = v_rec.offer_step_id;
  END LOOP;

  -- 3.2 Swap positions in onboarding_template_steps
  FOR v_rec IN
    SELECT DISTINCT ON (t_offer.template_id)
      t_offer.id AS offer_step_id,
      t_offer.position AS offer_pos,
      t_agree.id AS agree_step_id,
      t_agree.position AS agree_pos
    FROM public.onboarding_template_steps t_offer
    JOIN public.onboarding_template_steps t_agree
      ON t_offer.template_id = t_agree.template_id
     AND t_offer.step_type IN ('offer-acceptance', 'pay-rate-accepted')
     AND (t_agree.step_type IN ('employee-agreement', 'agreement-esign', 'agreement_signature') OR t_agree.title ILIKE '%agreement%')
     AND t_offer.position < t_agree.position
    ORDER BY t_offer.template_id, t_agree.position ASC
  LOOP
    UPDATE public.onboarding_template_steps SET position = 99999 + v_rec.offer_pos WHERE id = v_rec.offer_step_id;
    UPDATE public.onboarding_template_steps SET position = v_rec.offer_pos WHERE id = v_rec.agree_step_id;
    UPDATE public.onboarding_template_steps SET position = v_rec.agree_pos WHERE id = v_rec.offer_step_id;
  END LOOP;

  -- 3.3 Swap sort_order in tenant_onboarding_steps
  FOR v_rec IN
    SELECT DISTINCT ON (s_offer.onboarding_config_id)
      s_offer.id AS offer_step_id,
      s_offer.sort_order AS offer_order,
      s_agree.id AS agree_step_id,
      s_agree.sort_order AS agree_order
    FROM public.tenant_onboarding_steps s_offer
    JOIN public.tenant_onboarding_steps s_agree
      ON s_offer.onboarding_config_id = s_agree.onboarding_config_id
     AND s_offer.step_key IN ('offer-acceptance', 'pay-rate-accepted')
     AND (s_agree.step_key IN ('employee-agreement', 'agreement-esign', 'agreement_signature') OR s_agree.title ILIKE '%agreement%')
     AND s_offer.sort_order < s_agree.sort_order
    ORDER BY s_offer.onboarding_config_id, s_agree.sort_order ASC
  LOOP
    UPDATE public.tenant_onboarding_steps SET sort_order = 99999 + v_rec.offer_order WHERE id = v_rec.offer_step_id;
    UPDATE public.tenant_onboarding_steps SET sort_order = v_rec.offer_order WHERE id = v_rec.agree_step_id;
    UPDATE public.tenant_onboarding_steps SET sort_order = v_rec.agree_order WHERE id = v_rec.offer_step_id;
  END LOOP;

  -- 3.4 Update builder_draft JSON nodes in onboarding_flows
  FOR v_row IN
    SELECT id, builder_draft
    FROM public.onboarding_flows
    WHERE builder_draft ? 'nodes'
  LOOP
    v_nodes := v_row.builder_draft->'nodes';
    v_offer_idx := -1;
    v_agree_idx := -1;
    v_new_nodes := '[]'::jsonb;

    FOR i IN 0..(jsonb_array_length(v_nodes) - 1)
    LOOP
      v_node := v_nodes->i;
      IF v_node->>'stepId' IN ('offer-acceptance', 'pay-rate-accepted')
         OR v_node->>'label' IN ('Offer Accepted', 'Offer Acceptance', 'Pay Rate Accepted') THEN
        v_offer_idx := i;
        v_node := jsonb_set(v_node, '{label}', '"Pay Rate Accepted"'::jsonb);
      END IF;
      IF (v_node->>'stepId' IN ('employee-agreement', 'agreement-esign', 'agreement_signature')
          OR v_node->>'label' ILIKE '%agreement%') AND v_agree_idx = -1 THEN
        v_agree_idx := i;
      END IF;
      v_new_nodes := v_new_nodes || jsonb_build_array(v_node);
    END LOOP;

    IF v_offer_idx >= 0 AND v_agree_idx >= 0 AND v_offer_idx < v_agree_idx THEN
      v_offer_node := v_new_nodes->v_offer_idx;
      v_agree_node := v_new_nodes->v_agree_idx;

      v_offer_pos := v_offer_node->'position';
      v_agree_pos := v_agree_node->'position';
      IF v_offer_pos IS NOT NULL AND v_agree_pos IS NOT NULL THEN
        v_offer_node := jsonb_set(v_offer_node, '{position}', v_agree_pos);
        v_agree_node := jsonb_set(v_agree_node, '{position}', v_offer_pos);
      END IF;

      v_offer_order := v_offer_node->'settings'->>'stepOrder';
      v_agree_order := v_agree_node->'settings'->>'stepOrder';
      IF v_offer_order IS NOT NULL AND v_agree_order IS NOT NULL THEN
        v_offer_node := jsonb_set(v_offer_node, '{settings,stepOrder}', to_jsonb(v_agree_order::int));
        v_agree_node := jsonb_set(v_agree_node, '{settings,stepOrder}', to_jsonb(v_offer_order::int));
      END IF;

      v_new_nodes := jsonb_set(v_new_nodes, ARRAY[v_offer_idx::text], v_agree_node);
      v_new_nodes := jsonb_set(v_new_nodes, ARRAY[v_agree_idx::text], v_offer_node);
    END IF;

    UPDATE public.onboarding_flows
    SET builder_draft = jsonb_set(v_row.builder_draft, '{nodes}', v_new_nodes),
        updated_at = now()
    WHERE id = v_row.id;
  END LOOP;

  -- 3.5 Update builder_draft JSON nodes in onboarding_templates
  FOR v_row IN
    SELECT id, builder_draft
    FROM public.onboarding_templates
    WHERE builder_draft ? 'nodes'
  LOOP
    v_nodes := v_row.builder_draft->'nodes';
    v_offer_idx := -1;
    v_agree_idx := -1;
    v_new_nodes := '[]'::jsonb;

    FOR i IN 0..(jsonb_array_length(v_nodes) - 1)
    LOOP
      v_node := v_nodes->i;
      IF v_node->>'stepId' IN ('offer-acceptance', 'pay-rate-accepted')
         OR v_node->>'label' IN ('Offer Accepted', 'Offer Acceptance', 'Pay Rate Accepted') THEN
        v_offer_idx := i;
        v_node := jsonb_set(v_node, '{label}', '"Pay Rate Accepted"'::jsonb);
      END IF;
      IF (v_node->>'stepId' IN ('employee-agreement', 'agreement-esign', 'agreement_signature')
          OR v_node->>'label' ILIKE '%agreement%') AND v_agree_idx = -1 THEN
        v_agree_idx := i;
      END IF;
      v_new_nodes := v_new_nodes || jsonb_build_array(v_node);
    END LOOP;

    IF v_offer_idx >= 0 AND v_agree_idx >= 0 AND v_offer_idx < v_agree_idx THEN
      v_offer_node := v_new_nodes->v_offer_idx;
      v_agree_node := v_new_nodes->v_agree_idx;

      v_offer_pos := v_offer_node->'position';
      v_agree_pos := v_agree_node->'position';
      IF v_offer_pos IS NOT NULL AND v_agree_pos IS NOT NULL THEN
        v_offer_node := jsonb_set(v_offer_node, '{position}', v_agree_pos);
        v_agree_node := jsonb_set(v_agree_node, '{position}', v_offer_pos);
      END IF;

      v_offer_order := v_offer_node->'settings'->>'stepOrder';
      v_agree_order := v_agree_node->'settings'->>'stepOrder';
      IF v_offer_order IS NOT NULL AND v_agree_order IS NOT NULL THEN
        v_offer_node := jsonb_set(v_offer_node, '{settings,stepOrder}', to_jsonb(v_agree_order::int));
        v_agree_node := jsonb_set(v_agree_node, '{settings,stepOrder}', to_jsonb(v_offer_order::int));
      END IF;

      v_new_nodes := jsonb_set(v_new_nodes, ARRAY[v_offer_idx::text], v_agree_node);
      v_new_nodes := jsonb_set(v_new_nodes, ARRAY[v_agree_idx::text], v_offer_node);
    END IF;

    UPDATE public.onboarding_templates
    SET builder_draft = jsonb_set(v_row.builder_draft, '{nodes}', v_new_nodes),
        updated_at = now()
    WHERE id = v_row.id;
  END LOOP;
END $$;
